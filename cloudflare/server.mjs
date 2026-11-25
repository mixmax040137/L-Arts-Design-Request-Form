/* =====================================================================
   server.mjs — ระบบขอรับบริการออกแบบบน Cloudflare (ระบบหลัก)

   Worker          รับทุกคำขอ ส่งต่อให้ Durable Object ตัวเดียว ("main")
                   คำสั่งที่มีไฟล์แนบ: Worker ส่งไฟล์ไปพักบน Google Drive ก่อน (ผ่าน Apps Script)
                   แล้วส่งแค่ "ใบรับไฟล์" ต่อให้ Durable Object (หน่วยความจำของ Durable Object จึงไม่เต็ม)
   Durable Object  เก็บทุกชีตเป็นแถว ๆ ใน SQLite ในตัว รันโค้ด apps-script/*.gs ชุดเดิมผ่าน prelude.js
                   ทำงานทีละคำสั่ง ข้อมูลจึงไม่ชนกัน ทุกการเปลี่ยนแปลงบันทึกลงคิว outbox
                   ในรายการเดียวกับข้อมูล แล้วส่งไปสำรองที่ Apps Script (ส่งไม่ถึงก็ลองใหม่จนสำเร็จ)
                   งานตามเวลา (สรุป Design Brief ทุก 5 นาที สรุปงานประจำวัน 08:00) ทำด้วย alarm

   เส้นทาง
     GET  /                  หน้าระบบ (เหมือนเปิด /exec ของ Apps Script ส่ง ?page= ?job= ?t= ได้เหมือนเดิม)
     POST /api               { fn, args } → ผลของ api* แบบเดียวกับ google.script.run
     GET  /setup             หน้าเชื่อมต่อ/ย้ายข้อมูล/ตรวจข้อมูลสำรอง
     POST /setup/status|pair|verify|resync
     GET  /healthz           ตรวจว่าระบบทำงาน
   ===================================================================== */

import { createApp, API_NAMES } from './dist/app.mjs';
import { ASSETS } from './dist/assets.mjs';

const TICK_MS = 5 * 60 * 1000;
const BATCH_MAX_OPS = 400;
const BATCH_MAX_CHARS = 3 * 1024 * 1024;
const OUTBOX_ROW_MAX = 1200000;           // SQLite ของ Durable Object เก็บได้ 2 MB ต่อค่า
const ROWS_OP_MAX = 800000;               // แบ่งแถวที่ส่งไปสำรองเป็นก้อนละไม่เกินนี้
const MAX_BODY = 60 * 1024 * 1024;
const MAX_FILE_B64 = Math.ceil(30 * 1024 * 1024 / 3) * 4;
const MAX_IO_ROUNDS = 25;
const SPARE_MIN = 3;
const SPARE_TARGET = 8;
const FOLDER_STATUS_TTL = 10 * 60 * 1000;
const API_SET = new Set(API_NAMES);

/** ค่าภายในของ Cloudflare (ไม่ส่งไปสำรอง และโค้ดของระบบมองไม่เห็นผ่าน getProperties) */
const P = {
  GAS_URL: '__gas_url', SECRET: '__gas_secret', ORIGIN: '__origin', SCHED: '__sched', SPARE: '__spare_folders',
  LAST_OK: '__sync_ok', LAST_ERR: '__sync_err', FAILS: '__sync_fails', MAIL_ERR: '__mail_errors',
  DETACHED: '__detached', ARCHIVE_URL: '__gas_archive_url', SHEET_URL: '__gas_sheet_url', PAIRED_AT: '__paired_at',
  GUARD: '__setup_guard'
};
/** ค่าที่แต่ละฝั่งเก็บของตัวเอง */
const NO_MIRROR = new Set(['SPREADSHEET_ID', 'ARCHIVE_SPREADSHEET_ID', 'WEBAPP_URL']);

/* ------------------------------------------------------------------ */
/*  Worker                                                             */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/internal')) return text('ไม่พบหน้านี้', 404);
    const stub = env.APP.get(env.APP.idFromName('main'));
    if (request.method === 'POST' && url.pathname === '/api') return apiViaWorker(request, stub);
    return stub.fetch(request);
  }
};

/** คำสั่งจากหน้าเว็บ: ถ้ามีไฟล์แนบ ส่งไฟล์ไปพักบน Drive ก่อน แล้วแทนข้อมูลไฟล์ด้วยใบรับไฟล์ที่ลงลายมือชื่อแล้ว */
async function apiViaWorker(request, stub) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ ok: false, error: 'ข้อมูลใหญ่เกินไป กรุณาลดขนาดไฟล์' }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'ข้อมูลใหญ่เกินไป กรุณาลดขนาดไฟล์' }, 413);
  let forward = raw;
  if (raw.indexOf('"dataB64"') >= 0) {
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ ok: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400); }
    const files = collectFiles(body && body.args);
    if (files.length) {
      for (const f of files) {
        if (/^staged:/.test(f.dataB64)) return json({ ok: false, error: 'ข้อมูลไฟล์ไม่ถูกต้อง' }, 400);
        if (f.dataB64.length > MAX_FILE_B64) return json({ ok: false, error: 'ไฟล์ "' + String(f.fileName || '') + '" ใหญ่เกิน 30 MB' });
      }
      const info = await (await stub.fetch('https://internal/internal/bridge')).json();
      if (!info.paired) return json({ ok: false, error: 'ระบบยังไม่พร้อมรับไฟล์ กรุณาติดต่อฝ่ายสื่อสารองค์กร' });
      for (const f of files) {
        const r = await callGas(info.gasUrl, { op: 'stage', secret: info.secret, name: f.fileName, mime: f.mimeType, b64: f.dataB64 }, 120000);
        if (!r.ok) return json({ ok: false, error: r.error || 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่' });
        f.dataB64 = 'staged:' + r.id + ':' + r.size + ':' + await stagedSig(info.secret, r.id, r.size);
      }
      forward = JSON.stringify(body);
    }
  }
  return stub.fetch(new Request(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: forward }));
}

/** ไฟล์ในอาร์กิวเมนต์ของ api* (อาร์กิวเมนต์ที่เป็นไฟล์เอง หรือ payload.file) */
function collectFiles(args) {
  const out = [];
  (Array.isArray(args) ? args : []).forEach((a) => {
    if (a && typeof a === 'object') {
      if (typeof a.dataB64 === 'string') out.push(a);
      if (a.file && typeof a.file === 'object' && typeof a.file.dataB64 === 'string') out.push(a.file);
    }
  });
  return out;
}

/** ลายมือชื่อของใบรับไฟล์ (HMAC-SHA256 ด้วยรหัสลับร่วม) — Durable Object ตรวจซ้ำใน prelude.js */
async function stagedSig(secret, id, size) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(id + ':' + size)));
  return Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ */
/*  ติดต่อ Apps Script                                                   */
/* ------------------------------------------------------------------ */

/** POST ไปเว็บแอป Apps Script (/exec ตอบด้วยการพาไปอีกที่อยู่ fetch ตามไปให้เอง) */
export async function callGas(url, body, timeoutMs) {
  if (!url) return { ok: false, error: 'ยังไม่ได้เชื่อมกับ Apps Script' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || 90000)
    });
    const t = await res.text();
    let data;
    try { data = JSON.parse(t); } catch (e) {
      return { ok: false, error: 'Apps Script ตอบกลับไม่ใช่ข้อมูล (HTTP ' + res.status + ') — ตรวจว่า Deploy เป็นเว็บแอปที่ทุกคนเข้าถึงได้ และอัปเดตโค้ดเป็นรุ่นที่มีไฟล์ 15_Bridge แล้ว' };
    }
    if (!data || typeof data !== 'object') return { ok: false, error: 'Apps Script ตอบกลับไม่ถูกต้อง' };
    if (!data.ok && !data.error) data.error = 'Apps Script ตอบกลับว่าไม่สำเร็จ';
    return data;
  } catch (e) {
    return { ok: false, error: 'ติดต่อ Apps Script ไม่ได้: ' + String(e && e.message || e).slice(0, 200) };
  }
}

/* ------------------------------------------------------------------ */
/*  ที่เก็บข้อมูล: SQLite ↔ "ชีต" ที่ prelude.js มองเห็น                   */
/* ------------------------------------------------------------------ */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sheets (book TEXT NOT NULL, name TEXT NOT NULL, ord INTEGER NOT NULL, max_rows INTEGER NOT NULL, PRIMARY KEY (book, name));
CREATE TABLE IF NOT EXISTS cells (book TEXT NOT NULL, sheet TEXT NOT NULL, r INTEGER NOT NULL, v TEXT NOT NULL, PRIMARY KEY (book, sheet, r));
CREATE TABLE IF NOT EXISTS props (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, ops TEXT NOT NULL, n INTEGER NOT NULL, at INTEGER NOT NULL);
`;

function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function encCell(v) { return isDate(v) ? { $d: v.getTime() } : (v === undefined || v === null ? '' : v); }
function hasData(row) { return !!row && row.some((v) => v !== '' && v !== null && v !== undefined); }

export class Store {
  /** @param sql ctx.storage.sql (หรือตัวจำลองตอนทดสอบ) @param tx ctx.storage.transactionSync */
  constructor(sql, tx) {
    this.sql = sql;
    this.tx = tx || ((fn) => fn());
    sql.exec(SCHEMA);
    this.makeDate = (ms) => new Date(ms);
    this.dropCaches();
    this.resetRun();
  }

  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }

  dropCaches() {
    this.sheets = new Map();
    this.books = null;
    this.props = null;
  }

  /** สิ่งที่คำสั่งหนึ่งครั้งเปลี่ยนไว้ในหน่วยความจำ รอบันทึกตอน commit */
  resetRun() {
    this.dirty = new Set();
    this.propW = new Map();
    this.cacheW = new Map();
    this.ops = [];
    this.sched = [];
    this.newBooks = new Map();
  }

  /** ทิ้งการเปลี่ยนแปลงของคำสั่งที่ยังไม่ได้บันทึก (ชีตที่ถูกแก้จะโหลดจากฐานข้อมูลใหม่) */
  discard() {
    for (const k of this.dirty) this.sheets.delete(k);
    this.resetRun();
  }

  /* ---------- สเปรดชีต ---------- */
  loadBooks() {
    if (!this.books) {
      this.books = new Map();
      for (const r of this.rows('SELECT id, kind, name FROM books')) this.books.set(r.id, { kind: r.kind, name: r.name });
    }
    return this.books;
  }
  bookExists(id) { return this.newBooks.has(id) || this.loadBooks().has(id); }
  bookInfo(id) { return this.newBooks.get(id) || this.loadBooks().get(id) || null; }
  createBook(name) {
    const id = 'cf-' + crypto.randomUUID();
    this.newBooks.set(id, { kind: 'archive', name: String(name) });
    return id;
  }

  key(book, name) { return book + '\u0001' + name; }
  encode(row) { return JSON.stringify((row || []).map(encCell)); }
  decode(text) {
    return JSON.parse(text).map((v) => (v && typeof v === 'object' && '$d' in v ? this.makeDate(v.$d) : v));
  }
  loadSheet(book, name) {
    const k = this.key(book, name);
    if (this.sheets.has(k)) return this.sheets.get(k);
    if (!this.bookExists(book)) return null;
    const meta = this.rows('SELECT ord, max_rows FROM sheets WHERE book = ? AND name = ?', book, name)[0];
    if (!meta) return null;
    const grid = [];
    const saved = [];
    for (const row of this.rows('SELECT r, v FROM cells WHERE book = ? AND sheet = ? ORDER BY r', book, name)) {
      while (grid.length < row.r) { grid.push([]); saved.push(null); }
      grid[row.r] = this.decode(row.v);
      saved[row.r] = row.v;
    }
    const rec = { book, name, grid, saved, maxRows: meta.max_rows, savedMax: meta.max_rows, ord: meta.ord, isNew: false };
    this.sheets.set(k, rec);
    return rec;
  }
  createSheet(book, name) {
    const rec = { book, name, grid: [], saved: [], maxRows: 1000, savedMax: null, ord: this.sheetNames(book).length + 1, isNew: true };
    const k = this.key(book, name);
    this.sheets.set(k, rec);
    this.dirty.add(k);
    return rec;
  }
  sheetNames(book) {
    const names = this.rows('SELECT name FROM sheets WHERE book = ? ORDER BY ord', book).map((r) => r.name);
    for (const rec of this.sheets.values()) if (rec.book === book && rec.isNew && names.indexOf(rec.name) < 0) names.push(rec.name);
    return names;
  }
  touch(rec) { this.dirty.add(this.key(rec.book, rec.name)); }

  /* ---------- Script Properties ---------- */
  loadProps() {
    if (!this.props) {
      this.props = new Map();
      for (const r of this.rows('SELECT k, v FROM props')) this.props.set(r.k, r.v);
    }
    return this.props;
  }
  getProp(k) {
    if (this.propW.has(k)) return this.propW.get(k);
    const p = this.loadProps();
    return p.has(k) ? p.get(k) : null;
  }
  setProp(k, v) { this.propW.set(k, String(v)); }
  delProp(k) { this.propW.set(k, null); }
  allProps() {
    const out = {};
    for (const [k, v] of this.loadProps()) if (k.indexOf('__') !== 0) out[k] = v;
    for (const [k, v] of this.propW) {
      if (k.indexOf('__') === 0) continue;
      if (v === null) delete out[k]; else out[k] = v;
    }
    return out;
  }
  /** เขียนค่าภายในทันที (ใช้นอกคำสั่งของระบบเท่านั้น) */
  setPropNow(k, v) {
    const p = this.loadProps();
    if (v === null || v === undefined) { p.delete(k); this.sql.exec('DELETE FROM props WHERE k = ?', k); }
    else { p.set(k, String(v)); this.sql.exec('INSERT OR REPLACE INTO props (k, v) VALUES (?, ?)', k, String(v)); }
  }

  /* ---------- CacheService ---------- */
  cacheGet(k) {
    if (this.cacheW.has(k)) {
      const e = this.cacheW.get(k);
      return e && e.exp > Date.now() ? e.v : null;
    }
    const r = this.rows('SELECT v, exp FROM cache WHERE k = ?', k)[0];
    return r && r.exp > Date.now() ? r.v : null;
  }
  cachePut(k, v, ttl) { this.cacheW.set(k, { v: String(v), exp: Date.now() + Math.max(1, Math.min(21600, Number(ttl) || 600)) * 1000 }); }
  cacheRemove(k) { this.cacheW.set(k, null); }

  outboxCount() { return (this.rows('SELECT COUNT(*) AS n FROM outbox')[0] || { n: 0 }).n; }

  /**
   * บันทึกทุกอย่างของคำสั่งนี้ในรายการเดียว (ทั้งหมดหรือไม่มีเลย)
   * พร้อมสร้างชุดการเปลี่ยนแปลงที่ต้องส่งไปสำรอง: แถวที่เปลี่ยนเป็นช่วงต่อเนื่อง + ค่าตั้ง + งาน Drive + อีเมล
   */
  commit(paired) {
    const mirror = [];
    const self = this;
    this.tx(() => {
      for (const [id, b] of self.newBooks) {
        self.sql.exec('INSERT OR REPLACE INTO books (id, kind, name) VALUES (?, ?, ?)', id, b.kind, b.name);
        self.loadBooks().set(id, b);
      }
      for (const k of self.dirty) {
        const rec = self.sheets.get(k);
        if (!rec) continue;
        const kind = (self.bookInfo(rec.book) || {}).kind === 'main' ? 'main' : 'archive';
        const grid = rec.grid;
        while (grid.length && !hasData(grid[grid.length - 1])) grid.pop();
        if (rec.isNew) {
          self.sql.exec('INSERT OR REPLACE INTO sheets (book, name, ord, max_rows) VALUES (?, ?, ?, ?)', rec.book, rec.name, rec.ord, rec.maxRows);
          rec.isNew = false;
          rec.savedMax = rec.maxRows;
        } else if (rec.savedMax !== rec.maxRows) {
          self.sql.exec('UPDATE sheets SET max_rows = ? WHERE book = ? AND name = ?', rec.maxRows, rec.book, rec.name);
          rec.savedMax = rec.maxRows;
        }
        let start = -1;
        let chunk = [];
        let size = 0;
        const flushChunk = () => {
          if (start >= 0 && chunk.length) mirror.push({ t: 'rows', b: kind, s: rec.name, start, rows: chunk });
          start = -1; chunk = []; size = 0;
        };
        for (let i = 0; i < grid.length; i++) {
          const text = self.encode(grid[i]);
          if (rec.saved[i] === text) { flushChunk(); continue; }
          self.sql.exec('INSERT OR REPLACE INTO cells (book, sheet, r, v) VALUES (?, ?, ?, ?)', rec.book, rec.name, i, text);
          rec.saved[i] = text;
          if (start < 0) start = i;
          chunk.push(JSON.parse(text));
          size += text.length;
          if (size > ROWS_OP_MAX) flushChunk();
        }
        flushChunk();
        if (rec.saved.length > grid.length) {
          self.sql.exec('DELETE FROM cells WHERE book = ? AND sheet = ? AND r >= ?', rec.book, rec.name, grid.length);
          rec.saved.length = grid.length;
          mirror.push({ t: 'trunc', b: kind, s: rec.name, n: grid.length });
        }
      }
      for (const [k, v] of self.propW) {
        self.setPropNow(k, v);
        if (k.indexOf('__') !== 0 && !NO_MIRROR.has(k)) mirror.push({ t: 'prop', k, v });
      }
      for (const [k, e] of self.cacheW) {
        if (e) self.sql.exec('INSERT OR REPLACE INTO cache (k, v, exp) VALUES (?, ?, ?)', k, e.v, e.exp);
        else self.sql.exec('DELETE FROM cache WHERE k = ?', k);
      }
      if (paired) {
        const all = mirror.concat(self.ops);
        if (all.length) self.enqueueOps(all);
      }
    });
    const out = { ops: paired ? mirror.length + this.ops.length : 0, sched: this.sched.slice() };
    this.resetRun();
    return out;
  }

  /** ลงคิว outbox (แบ่งเป็นหลายแถวถ้าใหญ่) — ต้องเรียกภายใน transaction */
  enqueueOps(ops) {
    let cur = [];
    let size = 2;
    const flush = () => {
      if (!cur.length) return;
      this.sql.exec('INSERT INTO outbox (ops, n, at) VALUES (?, ?, ?)', JSON.stringify(cur), cur.length, Date.now());
      cur = []; size = 2;
    };
    for (const op of ops) {
      const len = JSON.stringify(op).length + 1;
      if (cur.length && size + len > OUTBOX_ROW_MAX) flush();
      cur.push(op);
      size += len;
    }
    flush();
  }

  /** ล้างข้อมูลทั้งหมดก่อนย้ายข้อมูลจาก Apps Script มาตั้งต้นใหม่ */
  wipe() {
    this.tx(() => {
      ['books', 'sheets', 'cells', 'props', 'cache', 'outbox'].forEach((t) => this.sql.exec('DELETE FROM ' + t));
    });
    this.dropCaches();
    this.resetRun();
  }

  /** นำข้อมูลที่ส่งออกจาก Apps Script เข้า (ตารางว่างอยู่แล้ว) */
  importExport(exp) {
    this.tx(() => {
      const putBook = (id, kind, name, sheets) => {
        this.sql.exec('INSERT OR REPLACE INTO books (id, kind, name) VALUES (?, ?, ?)', id, kind, name);
        let ord = 0;
        for (const name of Object.keys(sheets || {})) {
          const grid = sheets[name] || [];
          ord++;
          this.sql.exec('INSERT INTO sheets (book, name, ord, max_rows) VALUES (?, ?, ?, ?)', id, name, ord, Math.max(1000, grid.length + 1));
          grid.forEach((row, i) => {
            if (hasData(row)) this.sql.exec('INSERT INTO cells (book, sheet, r, v) VALUES (?, ?, ?, ?)', id, name, i, JSON.stringify(row));
          });
        }
      };
      putBook(String(exp.mainId), 'main', 'ฐานข้อมูล', exp.main);
      if (exp.archive && exp.archive.id) putBook(String(exp.archive.id), 'archive', 'ข้อมูลเก็บถาวร', exp.archive.sheets);
      for (const k of Object.keys(exp.props || {})) {
        this.sql.exec('INSERT OR REPLACE INTO props (k, v) VALUES (?, ?)', k, String(exp.props[k]));
      }
      // สเปรดชีตหลักของ Cloudflare คือสำเนาของชีตเดิม (ลิงก์ "เปิด Google Sheets" จึงพาไปชีตสำรองได้ถูก)
      this.sql.exec('INSERT OR REPLACE INTO props (k, v) VALUES (?, ?)', 'SPREADSHEET_ID', String(exp.mainId));
    });
    this.dropCaches();
    this.resetRun();
  }

  /** ข้อมูลทุกชีตแบบที่ส่งไปสำรอง (ใช้ตอนส่งทั้งหมดใหม่ และตอนตรวจเทียบ) */
  exportBooks() {
    const out = [];
    for (const [id, b] of this.loadBooks()) {
      for (const name of this.sheetNames(id)) {
        const rec = this.loadSheet(id, name);
        out.push({ book: id, kind: b.kind, name, rows: rec.grid.map((r) => (r || []).map(encCell)) });
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/*  Durable Object                                                     */
/* ------------------------------------------------------------------ */

/** หยุดคำสั่งเพื่อไปขอผลจาก Google (respond_ ไม่ต้องบันทึกเป็นข้อผิดพลาด รอบนี้ถูกทิ้งอยู่แล้ว) */
class NeedIo extends Error {
  constructor(m) { super(m); this.userFacing = true; }
}

export class LartsDesign {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env || {};
    const st = ctx.storage;
    this.store = new Store(st.sql, st.transactionSync ? (fn) => st.transactionSync(fn) : null);
    this.folderCache = new Map();
    this.jobs = Promise.resolve();
    this.delivering = null;
    this.refilling = false;
    this.io = null;
    this.boot();
  }

  boot() {
    this.app = createApp(this.host());
    this.store.makeDate = this.app.makeDate;
  }

  host() {
    const s = this.store;
    const self = this;
    return {
      bookExists: (id) => s.bookExists(id),
      createBook: (n) => s.createBook(n),
      bookName: (id) => (s.bookInfo(id) || {}).name || '',
      mainBookId: () => s.getProp('SPREADSHEET_ID') || '',
      loadSheet: (b, n) => s.loadSheet(b, n),
      createSheet: (b, n) => s.createSheet(b, n),
      sheetNames: (b) => s.sheetNames(b),
      touch: (rec) => s.touch(rec),
      getProp: (k) => s.getProp(k),
      setProp: (k, v) => s.setProp(k, v),
      delProp: (k) => s.delProp(k),
      allProps: () => s.allProps(),
      cacheGet: (k) => s.cacheGet(k),
      cachePut: (k, v, t) => s.cachePut(k, v, t),
      cacheRemove: (k) => s.cacheRemove(k),
      enqueue: (op) => { s.ops.push(op); },
      schedule: (handler, ms) => { s.sched.push({ h: handler, at: Date.now() + Math.max(1000, ms) }); },
      origin: () => s.getProp(P.ORIGIN) || '',
      io: (kind, args) => self.ioSync(kind, args),
      takeSpareFolder: () => self.takeSpare(),
      stagedKey: () => s.getProp(P.SECRET) || ''
    };
  }

  paired() { return !!(this.store.getProp(P.GAS_URL) && this.store.getProp(P.SECRET)); }
  detached() { return !!this.store.getProp(P.DETACHED); }
  gas(body, timeoutMs) {
    return callGas(this.store.getProp(P.GAS_URL), Object.assign({ secret: this.store.getProp(P.SECRET) }, body), timeoutMs);
  }

  later(p) {
    const q = Promise.resolve(p).catch((e) => console.error('background:', e && e.stack || e));
    try { if (this.ctx.waitUntil) this.ctx.waitUntil(q); } catch (e) { /* บาง runtime ไม่มี */ }
    return q;
  }

  /* ---------- รันคำสั่งของระบบ ---------- */

  /**
   * รันโค้ดของระบบหนึ่งคำสั่ง ถ้าโค้ดต้องการผลจาก Google (Drive/เว็บภายนอก) ระหว่างทาง:
   * ทิ้งการเปลี่ยนแปลงของรอบนั้น ไปขอผลแบบ async แล้วรันใหม่ทั้งคำสั่งพร้อมผลที่ได้
   * ส่วนที่รันจริงจึงเป็นแบบทำทีเดียวจบเสมอ ไม่มีคำสั่งอื่นแทรกกลางทาง
   */
  async run(exec) {
    const tape = new Map();
    for (let round = 0; round < MAX_IO_ROUNDS; round++) {
      this.store.resetRun();
      this.io = { tape, counts: new Map(), pending: null };
      let out;
      let err = null;
      try {
        this.app.begin();
        out = exec(this.app);
      } catch (e) {
        err = e;
      }
      const need = this.io.pending;
      this.io = null;
      if (need) {
        this.store.discard();
        tape.set(need.key, await this.performIo(need.kind, need.args));
        continue;
      }
      let res;
      try {
        res = this.store.commit(this.paired() && !this.detached());
      } catch (e) {
        this.store.dropCaches();
        this.store.resetRun();
        throw e;
      }
      this.afterCommit(res);
      // ทดสอบในเครื่องเท่านั้น: รอส่งไปสำรองให้เสร็จก่อนตอบ ชุดทดสอบจะอ่านชีตสำรองได้ทันที
      if (res.ops && this.env.SYNC_DELIVERY === '1') await this.deliver();
      if (err) throw err;
      return out;
    }
    this.store.discard();
    throw new Error('ติดต่อ Google ไม่สำเร็จหลายครั้ง กรุณาลองใหม่อีกครั้ง');
  }

  /** โค้ดของระบบขอผลจาก Google: มีในเทปแล้วคืนทันที ไม่มีก็จดไว้แล้วหยุดคำสั่ง */
  ioSync(kind, args) {
    const st = this.io;
    if (!st) throw new Error('ติดต่อ Google ได้เฉพาะระหว่างคำสั่งของระบบ');
    if (kind === 'folderStatus') {
      const c = this.folderCache.get(args.id);
      if (c && Date.now() - c.at < FOLDER_STATUS_TTL) return Object.assign({}, c.v);
    }
    const shown = Object.assign({}, args);
    if (shown.b64) shown.b64 = shown.b64.length + ':' + shown.b64.slice(0, 32) + shown.b64.slice(-32);
    if (shown.payload && shown.payload.length > 4096) shown.payload = shown.payload.length + ':' + shown.payload.slice(0, 2048) + shown.payload.slice(-2048);
    const base = kind + '|' + JSON.stringify(shown);
    const n = st.counts.get(base) || 0;
    st.counts.set(base, n + 1);
    const key = base + '#' + n;
    if (st.tape.has(key)) {
      const r = st.tape.get(key);
      if (r.error) throw new Error(r.error);
      return JSON.parse(JSON.stringify(r.value));
    }
    if (!st.pending) st.pending = { key, kind, args };
    throw new NeedIo('ต้องติดต่อ Google: ' + kind);
  }

  async performIo(kind, args) {
    try {
      if (kind === 'fetch') {
        if (!/^https:\/\//.test(args.url)) return { error: 'อนุญาตเฉพาะ https' };
        const res = await fetch(args.url, {
          method: args.method,
          headers: args.headers,
          body: args.method === 'GET' || args.method === 'HEAD' ? undefined : args.payload,
          signal: AbortSignal.timeout(120000)
        });
        return { value: { code: res.status, text: await res.text() } };
      }
      if (!this.paired()) return { error: 'ยังไม่ได้เชื่อมกับ Apps Script จึงใช้ Google Drive ไม่ได้' };
      const res = await this.gas({ op: 'io', kind, args }, 120000);
      if (!res.ok) return { error: res.error || 'Google Drive ตอบกลับว่าไม่สำเร็จ' };
      if (kind === 'folderStatus') this.folderCache.set(args.id, { v: res.result, at: Date.now() });
      if (kind === 'createFolder') this.folderCache.set(res.result.id, { v: { exists: true, trashed: false }, at: Date.now() });
      return { value: res.result };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  afterCommit(res) {
    if (res.ops) this.later(this.deliver());
    if (res.sched && res.sched.length) {
      const s = this.sched();
      for (const x of res.sched) if (x.h === 'workerOnce' && (!s.once || x.at < s.once)) s.once = x.at;
      this.saveSched(s);
      this.later(this.ensureAlarm());
    }
    const spare = this.spareList();
    if (spare.length < SPARE_MIN) this.later(this.refillSpare());
  }

  /* ---------- โฟลเดอร์งานที่เตรียมไว้ล่วงหน้า ---------- */
  spareList() {
    try { const v = JSON.parse(this.store.getProp(P.SPARE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  takeSpare() {
    if (!this.paired()) return null;
    const list = this.spareList();
    if (!list.length) return null;
    const f = list.shift();
    this.store.setProp(P.SPARE, JSON.stringify(list));
    return f;
  }
  async refillSpare() {
    if (this.refilling || !this.paired() || this.detached() || !this.store.getProp('JOBS_FOLDER_ID')) return;
    const need = SPARE_TARGET - this.spareList().length;
    if (need <= SPARE_TARGET - SPARE_MIN) return;
    this.refilling = true;
    try {
      const res = await this.gas({ op: 'io', kind: 'spareFolders', args: { count: need } }, 120000);
      if (res.ok && Array.isArray(res.result)) {
        this.store.setPropNow(P.SPARE, JSON.stringify(this.spareList().concat(res.result)));
        res.result.forEach((f) => this.folderCache.set(f.id, { v: { exists: true, trashed: false }, at: Date.now() }));
      }
    } finally {
      this.refilling = false;
    }
  }

  /* ---------- ส่งการเปลี่ยนแปลงไปสำรองที่ Apps Script (ทีละชุด ตามลำดับ) ---------- */
  deliver() {
    if (this.delivering) return this.delivering;
    const run = (async () => {
      await null;
      try {
        // ระหว่างจับคู่ Apps Script ยังไม่รับข้อมูล (ยังไม่ยืนยัน) ห้ามส่ง ไม่งั้นจะถูกมองว่าเลิกเชื่อมกันแล้ว
        while (this.paired() && !this.detached() && !this.pairing) {
          const rows = this.store.rows('SELECT id, ops, n FROM outbox ORDER BY id LIMIT 50');
          if (!rows.length) break;
          let ops = [];
          let last = 0;
          let size = 0;
          for (const r of rows) {
            if (ops.length && (ops.length + r.n > BATCH_MAX_OPS || size + r.ops.length > BATCH_MAX_CHARS)) break;
            ops = ops.concat(JSON.parse(r.ops));
            last = r.id;
            size += r.ops.length;
          }
          const res = await this.gas({ op: 'batch', ops }, 300000);
          if (!res.ok) {
            if (res.code === 'NOT_PAIRED') this.store.setPropNow(P.DETACHED, stamp());
            this.store.setPropNow(P.LAST_ERR, stamp() + ' · ' + res.error);
            this.store.setPropNow(P.FAILS, String(Number(this.store.getProp(P.FAILS) || 0) + 1));
            break;
          }
          this.store.sql.exec('DELETE FROM outbox WHERE id <= ?', last);
          this.store.setPropNow(P.LAST_OK, stamp());
          this.store.setPropNow(P.FAILS, null);
          if (res.archiveUrl) this.store.setPropNow(P.ARCHIVE_URL, res.archiveUrl);
          if (Array.isArray(res.mailErrors) && res.mailErrors.length) {
            let list = [];
            try { list = JSON.parse(this.store.getProp(P.MAIL_ERR) || '[]'); } catch (e) { list = []; }
            res.mailErrors.forEach((m) => list.push(Object.assign({ at: stamp() }, m)));
            this.store.setPropNow(P.MAIL_ERR, JSON.stringify(list.slice(-30)));
            console.error('ส่งอีเมลไม่สำเร็จ', JSON.stringify(res.mailErrors));
          }
        }
      } finally {
        if (this.delivering === run) this.delivering = null;
        if (this.store.outboxCount() > 0) await this.ensureAlarm();
      }
    })();
    this.delivering = run;
    return run;
  }

  /* ---------- งานตามเวลา (alarm) ---------- */
  sched() {
    try { const s = JSON.parse(this.store.getProp(P.SCHED) || '{}'); return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; }
  }
  saveSched(s) { this.store.setPropNow(P.SCHED, JSON.stringify(s)); }

  retryDelay() {
    const fails = Number(this.store.getProp(P.FAILS) || 0);
    return Math.min(5 * 60000, 15000 * Math.pow(2, Math.min(fails, 5)));
  }

  async ensureAlarm() {
    if (!this.ctx.storage.setAlarm) return;
    const now = Date.now();
    const s = this.sched();
    const cands = [s.tick && s.tick > now ? s.tick : now + TICK_MS];
    if (s.once) cands.push(s.once);
    if (this.store.outboxCount() > 0) cands.push(now + this.retryDelay());
    const at = Math.max(now + 1000, Math.min.apply(null, cands));
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at + 1000 || cur < now - 60000) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    try {
      await this.deliver();
      await this.runDue();
      await this.refillSpare();
    } finally {
      await this.ensureAlarm();
    }
  }

  /** งานเบื้องหลังทำทีละงาน (สรุป Brief ของงานเดียวกันจะไม่ถูกเรียกซ้อนกัน) */
  job(name) {
    const p = this.jobs.then(() => this.run((app) => app.run(name)))
      .catch((e) => console.error('งาน ' + name + ' ไม่สำเร็จ:', e && e.stack || e));
    this.jobs = p;
    return p;
  }

  async runDue() {
    if (!this.paired() || this.detached()) return;
    const now = Date.now();
    const s = this.sched();
    const bkk = bangkokNow(now);
    // ทุก 5 นาทีถามว่า Apps Script ยังจับคู่อยู่ไหม (ผู้ดูแลระบบอาจสลับกลับไปใช้ Apps Script ตอน Cloudflare ล่ม)
    if (!s.ping || now >= s.ping) {
      s.ping = now + TICK_MS;
      this.saveSched(s);
      await this.checkPeer();
      if (this.detached()) return;
    }
    if (s.once && now >= s.once) { s.once = 0; this.saveSched(s); await this.job('workerOnce'); }
    if (!s.tick || now >= s.tick) { s.tick = now + TICK_MS; this.saveSched(s); await this.job('workerTick'); }
    if (bkk.hour >= 8 && s.daily !== bkk.date) { s.daily = bkk.date; this.saveSched(s); await this.job('dailyReminder'); }
    if (s.clean !== bkk.date) {
      s.clean = bkk.date;
      this.saveSched(s);
      await this.gas({ op: 'io', kind: 'cleanup', args: {} }, 120000);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  HTTP                                                                */
  /* ------------------------------------------------------------------ */

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/internal/bridge') {
      return json({ paired: this.paired() && !this.detached(), gasUrl: this.store.getProp(P.GAS_URL) || '', secret: this.store.getProp(P.SECRET) || '' });
    }
    if (url.hostname !== 'internal' && url.origin !== this.store.getProp(P.ORIGIN)) this.store.setPropNow(P.ORIGIN, url.origin);
    this.later(this.ensureAlarm());
    try {
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (path === '/') return await this.page(url);
        if (path === '/setup') return html(ASSETS.setup, { 'Cache-Control': 'no-store' });
        if (path === '/favicon.svg') return new Response(ASSETS.favicon, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
        if (path === '/healthz') return json({ ok: true, version: this.app.version, paired: this.paired(), pending: this.store.outboxCount() });
        return text('ไม่พบหน้านี้', 404);
      }
      if (request.method !== 'POST') return text('Method Not Allowed', 405);
      const body = await readJson(request);
      if (path === '/api') return json(await this.handleApi(body));
      if (path === '/setup/status') return json(this.setupStatus());
      if (path === '/setup/pair') return json(await this.setupPair(body));
      if (path === '/setup/detach') return this.setupDetach(body);
      if (path === '/setup/verify') return json(await this.setupVerify(body));
      if (path === '/setup/resync') return json(await this.setupResync(body));
      return json({ ok: false, error: 'ไม่พบคำสั่งนี้' }, 404);
    } catch (e) {
      if (!e || !e.userFacing) console.error(path, e && e.stack || e);
      return json({ ok: false, error: e && e.userFacing ? e.message : 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง' }, e && e.status || 500);
    }
  }

  gasPageUrl(url) {
    const base = String(this.store.getProp('WEBAPP_URL') || this.store.getProp(P.GAS_URL) || '');
    return base ? base + (url.search || '') : '';
  }

  async page(url) {
    if (this.detached()) {
      const to = this.gasPageUrl(url);
      return html(noticePage('ระบบกลับไปใช้ Apps Script ชั่วคราว',
        'ตอนนี้ระบบให้บริการที่ Apps Script กรุณาใช้ลิงก์ด้านล่าง', to, 'ไปที่ระบบ'), { 'Cache-Control': 'no-store' });
    }
    if (!this.paired()) return Response.redirect(url.origin + '/setup', 302);
    const params = {};
    ['page', 'job', 't', 'k'].forEach((k) => { const v = url.searchParams.get(k); if (v !== null) params[k] = v; });
    const boot = await this.run((app) => app.boot(params));
    const out = ASSETS.index.replace('<?!= boot ?>', () => boot);
    return html(out, { 'Cache-Control': 'no-store' });
  }

  async handleApi(body) {
    const fn = String(body.fn || '');
    if (!API_SET.has(fn)) return { ok: false, error: 'ไม่พบคำสั่งนี้ กรุณารีเฟรชหน้า' };
    if (this.detached()) {
      return { ok: false, code: 'MOVED', error: 'ระบบกลับไปให้บริการที่ Apps Script ชั่วคราว กรุณารีเฟรชหน้านี้' };
    }
    if (!this.paired()) return { ok: false, error: 'ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อฝ่ายสื่อสารองค์กร' };
    const args = Array.isArray(body.args) ? body.args : [];
    return await this.run((app) => app.call(fn, args));
  }

  /** มีของค้างส่ง = ส่งเลย (รู้ผลจากการส่ง) ไม่มี = ถามสถานะ ถ้า Apps Script ไม่รู้จักรหัสลับแล้ว หยุดรับข้อมูล */
  async checkPeer() {
    if (!this.paired() || this.detached() || this.pairing) return;
    if (this.store.outboxCount() > 0) { await this.deliver(); return; }
    const r = await this.gas({ op: 'status' }, 30000);
    if (!r.ok && r.code === 'NOT_PAIRED' && !this.pairing) {
      this.store.setPropNow(P.DETACHED, stamp());
      this.store.setPropNow(P.LAST_ERR, stamp() + ' · ' + r.error);
    }
  }

  /* ---------- /setup ---------- */

  /** สรุปของที่ค้างส่ง เช่น "Requests 2 แถว (DR-2569-0012, DR-2569-0013) · อีเมล 3 ฉบับ" */
  pendingSummary() {
    const sheets = {};
    const jobs = new Set();
    let mails = 0;
    for (const r of this.store.rows('SELECT ops FROM outbox ORDER BY id')) {
      let ops = [];
      try { ops = JSON.parse(r.ops); } catch (e) { ops = []; }
      for (const op of ops) {
        if (op.t === 'mail') mails++;
        if (op.t !== 'rows') continue;
        sheets[op.s] = (sheets[op.s] || 0) + op.rows.length;
        if (op.s === 'Requests') op.rows.forEach((row) => { if (row && row[0]) jobs.add(String(row[0])); });
      }
    }
    const parts = Object.keys(sheets).map((k) => k + ' ' + sheets[k] + ' แถว' +
      (k === 'Requests' && jobs.size ? ' (' + Array.from(jobs).slice(0, 20).join(', ') + ')' : ''));
    if (mails) parts.push('อีเมล ' + mails + ' ฉบับ');
    return parts.join(' · ') || 'ไม่มีข้อมูลในชีต';
  }

  /** Apps Script แจ้งว่าผู้ดูแลระบบสลับกลับไปใช้ Apps Script เป็นหลัก (ต้องแนบรหัสลับที่ใช้คู่กันอยู่) */
  setupDetach(body) {
    const secret = this.store.getProp(P.SECRET) || '';
    if (!this.paired() || !secret || !safeEqual(String(body.secret || ''), secret)) {
      return json({ ok: false, error: 'ไม่มีสิทธิ์' }, 403);
    }
    if (!this.detached()) {
      this.store.setPropNow(P.DETACHED, stamp());
      this.store.setPropNow(P.LAST_ERR, stamp() + ' · ผู้ดูแลระบบสลับกลับไปใช้ Apps Script เป็นระบบหลัก');
    }
    return json({ ok: true });
  }

  /** กันเดารหัสผ่านหน้า /setup: ผิด 8 ครั้งใน 15 นาที พัก 15 นาที */
  guard(ok) {
    const now = Date.now();
    let g = {};
    try { g = JSON.parse(this.store.getProp(P.GUARD) || '{}'); } catch (e) { g = {}; }
    if (g.until && now < g.until) throw userError('ลองผิดหลายครั้ง กรุณารอ ' + Math.ceil((g.until - now) / 60000) + ' นาทีแล้วลองใหม่', 429);
    if (ok === undefined) return;
    if (ok) { this.store.setPropNow(P.GUARD, null); return; }
    if (!g.since || now - g.since > 15 * 60000) g = { since: now, n: 0 };
    g.n++;
    if (g.n >= 8) g.until = now + 15 * 60000;
    this.store.setPropNow(P.GUARD, JSON.stringify(g));
  }

  /** ตรวจบัญชีผู้ดูแลระบบด้วยข้อมูลบน Cloudflare */
  async checkAdmin(body) {
    this.guard();
    try {
      await this.run((app) => app.checkAdmin(String(body.email || ''), String(body.password || '')));
      this.guard(true);
    } catch (e) {
      this.guard(false);
      throw userError(e && e.userFacing ? e.message : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 403);
    }
  }

  setupStatus() {
    const s = this.store;
    const url = s.getProp(P.GAS_URL) || '';
    let mailErrors = 0;
    try { mailErrors = JSON.parse(s.getProp(P.MAIL_ERR) || '[]').length; } catch (e) { mailErrors = 0; }
    return {
      ok: true,
      paired: this.paired(),
      detached: this.detached(),
      peer: url.replace(/(\/macros\/s\/.{6}).*(.{6}\/exec)$/, '$1…$2'),
      pairedAt: s.getProp(P.PAIRED_AT) || '',
      pending: s.outboxCount(),
      lastOk: s.getProp(P.LAST_OK) || '',
      lastError: s.getProp(P.LAST_ERR) || '',
      mailErrors,
      version: this.app.version
    };
  }

  /**
   * จับคู่กับ Apps Script แล้วย้ายข้อมูลทั้งหมดมาตั้งต้น
   * 1) Apps Script ตรวจบัญชีผู้ดูแลระบบ ออกรหัสลับ  2) ดึงข้อมูลทั้งหมด  3) Apps Script เปลี่ยนเป็นระบบสำรอง
   */
  async setupPair(body) {
    const gasUrl = String(body.gasUrl || '').trim();
    if (!validGasUrl(gasUrl, this.env)) {
      return { ok: false, error: 'ลิงก์ Apps Script ไม่ถูกต้อง ต้องเป็นลิงก์เว็บแอปที่ลงท้ายด้วย /exec (Deploy → Manage deployments → Web app)' };
    }
    // ล็อกไว้กับเว็บแอป Apps Script ของคณะเท่านั้น คนอื่นจึงเอา Apps Script ของตัวเองมาจับคู่แย่งก่อนไม่ได้
    const pin = String(this.env.GAS_DEPLOYMENT_ID || '').trim();
    if (pin && /^https:/.test(gasUrl) && gasDeploymentId(gasUrl) !== pin) {
      return { ok: false, error: 'ลิงก์นี้ไม่ใช่เว็บแอป Apps Script ของระบบนี้ (ระบบรับเฉพาะ deployment ที่ลงท้ายด้วย …' + pin.slice(-6) +
        ') กรุณาคัดลอกลิงก์จาก Deploy → Manage deployments ของโครงการเดิม ' +
        'หากตั้งใจสร้าง deployment ใหม่ ให้แก้ GAS_DEPLOYMENT_ID ใน cloudflare/wrangler.jsonc แล้ว deploy Cloudflare ใหม่' };
    }
    if (!body.email || !body.password) return { ok: false, error: 'กรุณากรอกอีเมลและรหัสผ่านผู้ดูแลระบบ' };
    if (this.pairing) return { ok: false, error: 'กำลังย้ายข้อมูลอยู่ กรุณารอสักครู่' };
    this.guard();
    // เพิ่งสลับกลับไปใช้ Apps Script แต่ Cloudflare ยังไม่รู้? ถามก่อน (ถ้าใช่ ไม่ต้องใช้รหัสผ่านบน Cloudflare)
    if (this.paired() && !this.detached()) await this.checkPeer();
    if (this.detached() && this.store.outboxCount() > 0 && !body.discardPending) {
      const sum = this.pendingSummary();
      return {
        ok: false, code: 'PENDING', pending: this.store.outboxCount(), summary: sum,
        error: 'มีการเปลี่ยนแปลงบน Cloudflare ที่ยังไม่ถึง Apps Script (เกิดหลังสลับกลับไปใช้ Apps Script): ' + sum +
          ' — ถ้าจับคู่ใหม่ ส่วนนี้จะถูกแทนด้วยข้อมูลของ Apps Script กรุณาตรวจว่ามีงานที่ต้องบันทึกซ้ำบน Apps Script หรือไม่ แล้วกดยืนยันอีกครั้ง'
      };
    }
    if (this.paired() && !this.detached()) {
      // จับคู่ใหม่ = ดึงข้อมูลจาก Apps Script มาทับ ต้องส่งของที่ค้างให้ถึงก่อน ไม่งั้นการแก้ล่าสุดหาย
      await this.checkAdmin(body);
      await this.deliver();
      if (this.store.outboxCount() > 0) {
        return { ok: false, error: 'ยังมีข้อมูลที่ส่งไปสำรองไม่สำเร็จ ' + this.store.outboxCount() + ' ชุด กรุณาแก้การเชื่อมต่อให้ส่งได้ก่อน แล้วค่อยจับคู่ใหม่' };
      }
    }
    this.pairing = true;
    try {
      const p = await callGas(gasUrl, { op: 'pair', email: body.email, password: body.password, cfUrl: originOf(this.store.getProp(P.ORIGIN)) }, 90000);
      if (!p.ok) {
        if (/รหัสผ่าน|ผู้ดูแลระบบ/.test(p.error || '')) this.guard(false);
        return { ok: false, error: p.error };
      }
      this.guard(true);
      const exp = await callGas(gasUrl, { op: 'export', secret: p.secret }, 300000);
      if (!exp.ok) return { ok: false, error: 'ดึงข้อมูลจาก Apps Script ไม่สำเร็จ: ' + exp.error };
      if (!exp.main || !exp.main.Requests || !exp.main.Users) return { ok: false, error: 'ข้อมูลจาก Apps Script ไม่ครบ (ไม่พบชีต Requests หรือ Users)' };
      if (exp.version !== this.app.version) {
        return { ok: false, error: 'โค้ดสองฝั่งเป็นคนละรุ่น (Apps Script ' + exp.version + ' / Cloudflare ' + this.app.version + ') — อัปเดตโค้ดใน Apps Script ให้เป็นรุ่นล่าสุดแล้ว Deploy ใหม่ก่อน' };
      }
      this.store.wipe();
      this.folderCache.clear();
      this.store.importExport(exp);
      this.boot();
      this.store.tx(() => {
        this.store.setPropNow(P.GAS_URL, gasUrl);
        this.store.setPropNow(P.SECRET, p.secret);
      });
      // สร้างชีตที่ Apps Script ยังไม่มี (เช่นชีตของฟีเจอร์ใหม่) ตอนนี้ หัวตารางจะได้ถูกส่งไปสำรองด้วย
      await this.run((app) => app.ensureSheets());
      const act = await callGas(gasUrl, { op: 'activate', secret: p.secret }, 90000);
      if (!act.ok) {
        this.store.wipe();
        return { ok: false, error: 'Apps Script ยังไม่เปลี่ยนเป็นระบบสำรอง กรุณาลองใหม่: ' + act.error };
      }
      this.store.tx(() => {
        this.store.setPropNow(P.SHEET_URL, exp.sheetUrl || '');
        if (exp.archiveUrl) this.store.setPropNow(P.ARCHIVE_URL, exp.archiveUrl);
        this.store.setPropNow(P.PAIRED_AT, stamp());
        this.store.setPropNow(P.DETACHED, null);
        this.store.setPropNow(P.LAST_ERR, null);
        this.store.setPropNow(P.SCHED, JSON.stringify({ tick: Date.now() + 60000, daily: bangkokNow(Date.now()).hour >= 8 ? bangkokNow(Date.now()).date : '' }));
      });
      this.pairing = false;
      this.later(this.deliver());
      this.later(this.refillSpare());
      await this.ensureAlarm();
      return { ok: true, counts: await this.run((app) => app.counts()), version: this.app.version };
    } finally {
      this.pairing = false;
    }
  }

  /** เทียบข้อมูลสองฝั่งทีละชีต */
  async setupVerify(body) {
    if (!this.paired()) return { ok: false, error: 'ยังไม่ได้เชื่อมกับ Apps Script' };
    await this.checkAdmin(body);
    await this.deliver();
    const exp = await this.gas({ op: 'export' }, 300000);
    if (!exp.ok) return { ok: false, error: 'ดึงข้อมูลจาก Apps Script ไม่สำเร็จ: ' + exp.error };
    const theirs = { main: exp.main || {}, archive: (exp.archive && exp.archive.sheets) || {} };
    const sheets = [];
    let allSame = true;
    for (const x of this.store.exportBooks()) {
      const other = (theirs[x.kind] || {})[x.name] || [];
      const a = canonGrid(x.rows);
      const b = canonGrid(other);
      const row = { name: (x.kind === 'archive' ? 'เก็บถาวร: ' : '') + x.name, cf: Math.max(0, a.length - 1), gas: Math.max(0, b.length - 1), same: true };
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { row.same = false; row.note = 'ต่างกันตั้งแต่แถวที่ ' + (i + 1); break; }
      }
      if (!row.same) allSame = false;
      sheets.push(row);
    }
    let mailErrors = [];
    try { mailErrors = JSON.parse(this.store.getProp(P.MAIL_ERR) || '[]').slice(-10).reverse(); } catch (e) { mailErrors = []; }
    return { ok: true, allSame, sheets, mailErrors, pending: this.store.outboxCount(), sheetUrl: this.store.getProp(P.SHEET_URL) || '' };
  }

  /** ส่งข้อมูลทั้งหมดของระบบหลักไปเขียนทับชีตสำรอง (ใช้ซ่อมเมื่อตรวจแล้วไม่ตรง) */
  async setupResync(body) {
    if (!this.paired()) return { ok: false, error: 'ยังไม่ได้เชื่อมกับ Apps Script' };
    await this.checkAdmin(body);
    const ops = [];
    for (const x of this.store.exportBooks()) {
      let start = 0;
      let chunk = [];
      let size = 0;
      x.rows.forEach((r, i) => {
        if (!chunk.length) start = i;
        chunk.push(r);
        size += JSON.stringify(r).length;
        if (size > ROWS_OP_MAX) { ops.push({ t: 'rows', b: x.kind, s: x.name, start, rows: chunk }); chunk = []; size = 0; }
      });
      if (chunk.length) ops.push({ t: 'rows', b: x.kind, s: x.name, start, rows: chunk });
      ops.push({ t: 'trunc', b: x.kind, s: x.name, n: x.rows.length });
    }
    const props = this.store.allProps();
    Object.keys(props).forEach((k) => { if (!NO_MIRROR.has(k)) ops.push({ t: 'prop', k, v: props[k] }); });
    this.store.tx(() => this.store.enqueueOps(ops));
    await this.deliver();
    const pending = this.store.outboxCount();
    return { ok: pending === 0, pending, error: pending ? (this.store.getProp(P.LAST_ERR) || '') : '' };
  }
}

/* ------------------------------------------------------------------ */
/*  ตัวช่วย                                                             */
/* ------------------------------------------------------------------ */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',                     // ลิงก์ติดตามมีรหัส ?t= ห้ามติดไปกับลิงก์ที่กดออกไปเว็บอื่น
  'Content-Security-Policy': "frame-ancestors 'self'"   // กันเว็บอื่นครอบหน้าระบบไว้หลอกให้กด (clickjacking)
};

function html(body, extra) {
  return new Response(body, { headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, SECURITY_HEADERS, extra || {}) });
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SECURITY_HEADERS)
  });
}
function text(s, status) { return new Response(s, { status: status || 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
/** เทียบข้อความโดยใช้เวลาเท่ากันทุกกรณี (กันเดารหัสลับทีละตัวอักษรจากเวลาตอบ) */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function userError(message, status) { const e = new Error(message); e.userFacing = true; e.status = status || 400; return e; }

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw userError('ข้อมูลใหญ่เกินไป', 413);
  const t = await request.text();
  if (t.length > MAX_BODY) throw userError('ข้อมูลใหญ่เกินไป', 413);
  try { const v = JSON.parse(t || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}

function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function noticePage(title, message, link, label) {
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(title) + '</title><style>body{font-family:system-ui,sans-serif;background:#fff7ed;display:flex;min-height:100vh;' +
    'align-items:center;justify-content:center;margin:0;padding:16px}.c{background:#fff;border-radius:16px;padding:28px;max-width:440px;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.08)}a{display:inline-block;background:#ea580c;color:#fff;border-radius:999px;padding:10px 22px;' +
    'text-decoration:none}</style></head><body><div class="c"><h1 style="font-size:20px">' + escapeHtml(title) + '</h1><p>' +
    escapeHtml(message) + '</p>' + (link ? '<p><a href="' + escapeHtml(link) + '">' + escapeHtml(label) + '</a></p>' : '') + '</div></body></html>';
}

function stamp() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
}

/** วันที่และชั่วโมงตามเวลาไทย */
export function bangkokNow(ms) {
  const d = new Date(ms + 7 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

function originOf(o) { return String(o || '').replace(/\/+$/, ''); }

/** รหัส deployment ในลิงก์เว็บแอป (ส่วนระหว่าง /s/ กับ /exec) */
function gasDeploymentId(u) {
  const m = /\/s\/([A-Za-z0-9_-]{20,})\/exec$/.exec(String(u || ''));
  return m ? m[1] : '';
}

function validGasUrl(u, env) {
  if (/^https:\/\/script\.google\.com\/(?:a\/[^/]+\/macros|a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(u)) return true;
  // ทดสอบในเครื่องเท่านั้น (ตั้ง ALLOW_TEST_PEER ใน .dev.vars ไม่ได้ตั้งบนระบบจริง)
  return !!(env && env.ALLOW_TEST_PEER === '1' && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/[\w/-]*$/.test(u));
}

/**
 * แปลงแถวให้อยู่รูปแบบเดียวกันก่อนเทียบ
 * Google Sheets แปลงข้อความวันที่ที่ระบบเขียน (เช่น "2569-11-25 10:00:00") เป็นค่าวันที่ ส่วนสำเนาบน Cloudflare
 * เก็บเป็นข้อความ จึงต้องแปลงทั้งสองฝั่งเป็นข้อความเวลาไทยแบบเดียวกันก่อน
 */
function canonCell(v) {
  if (v && typeof v === 'object' && '$d' in v) {
    const d = new Date(v.$d + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    return d.replace(/ 00:00:00$/, '');
  }
  if (typeof v === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(v);
    if (m) return (m[1] + ' ' + (m[2] ? (m[2].length === 5 ? m[2] + ':00' : m[2]) : '00:00:00')).replace(/ 00:00:00$/, '');
  }
  if (v === null || v === undefined) return '';
  return v;
}
function canonGrid(rows) {
  const out = (rows || []).map((r) => {
    const row = (r || []).map(canonCell);
    while (row.length && row[row.length - 1] === '') row.pop();
    return JSON.stringify(row);
  });
  while (out.length && out[out.length - 1] === '[]') out.pop();
  return out;
}
