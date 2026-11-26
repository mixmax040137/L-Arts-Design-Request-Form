/**
 * cloudflare.js — ทดสอบระบบหลักบน Cloudflare คู่กับ Apps Script ตัวสำรอง ตั้งแต่ต้นจนจบ
 *
 * - Durable Object ตัวจริง (cloudflare/server.mjs) ใช้ SQLite ของ Node แทน SQLite ของ Cloudflare
 * - Apps Script ตัวจริงทุกไฟล์ (รวม 15_Bridge.gs) รันบนตัวจำลอง tests/mock-gas.js
 * - ทุกการเรียกจาก Cloudflare ไป Apps Script ผ่าน doPost จริง (ไม่ได้ลัดเรียกฟังก์ชันภายใน)
 *
 * รัน: npm run test:cf   (หรือ node cloudflare/build.js && TZ=Asia/Bangkok node tests/cloudflare.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  // node:sqlite มีตั้งแต่ Node 22.5 เครื่องที่ใช้ Node รุ่นเก่ายังรันชุดทดสอบ Apps Script ได้ตามปกติ
  console.log('\n  ข้ามชุดทดสอบ Cloudflare: ต้องใช้ Node 22.5 ขึ้นไป (เครื่องนี้ ' + process.version + ')\n');
  process.exit(0);
}
const { createRuntime } = require('./mock-gas');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script');
const GAS_URL = 'https://script.google.com/a/arts.tu.ac.th/macros/s/AKfycbTESTDEPLOYMENT1234567890/exec';
const ORIGIN = 'https://larts-design.test';

/* ------------------------------------------------------------------ ตัวทดสอบ */
let passed = 0;
let failed = 0;
const failures = [];
let currentGroup = '';
const queue = [];
function group(name) { queue.push({ group: name }); }
function test(name, fn) { queue.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'ค่าไม่ตรง') + '\n      ได้     : ' + JSON.stringify(actual) + '\n      คาดหวัง : ' + JSON.stringify(expected));
  }
}

/* ------------------------------------------------------------------ Apps Script (ตัวสำรอง) */
function loadGas() {
  const rt = createRuntime({ webAppUrl: GAS_URL });
  const sandbox = Object.assign({}, rt.globals);
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.gs')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, state: rt.state };
}

/* ------------------------------------------------------------------ Durable Object บน Node */
function sqlAdapter(db) {
  return {
    exec(q, ...b) {
      const s = String(q).trim();
      if (!b.length && /;\s*\S/.test(s)) { db.exec(s); return { toArray: () => [] }; }
      const st = db.prepare(s);
      if (/^(SELECT|WITH)\b/i.test(s)) {
        const rows = st.all(...b).map((r) => Object.assign({}, r));
        return { toArray: () => rows, one: () => rows[0] };
      }
      st.run(...b);
      return { toArray: () => [] };
    }
  };
}

function makeDo(mod, opts) {
  const db = new DatabaseSync(':memory:');
  const pending = [];
  let alarm = null;
  const storage = {
    sql: sqlAdapter(db),
    transactionSync(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async getAlarm() { return alarm; },
    async setAlarm(t) { alarm = t; },
    async deleteAlarm() { alarm = null; }
  };
  const ctx = { storage, waitUntil: (p) => pending.push(p) };
  const env = Object.assign({}, opts && opts.env);
  const obj = new mod.LartsDesign(ctx, env);
  env.APP = { idFromName: () => 'main', get: () => ({ fetch: (req, init) => obj.fetch(req instanceof Request ? req : new Request(req, init)) }) };
  return {
    obj, db, env, worker: mod.default,
    get alarm() { return alarm; },
    async settle() {
      for (let i = 0; i < 50 && pending.length; i++) await Promise.all(pending.splice(0));
    },
    /** เรียกผ่าน Worker เหมือนเบราว์เซอร์จริง */
    async req(method, p, body) {
      const init = { method };
      if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'Content-Type': 'application/json' }; }
      const res = await mod.default.fetch(new Request(ORIGIN + p, init), env);
      return res;
    },
    async api(fn, ...args) {
      const res = await this.req('POST', '/api', { fn, args });
      const out = await res.json();
      await this.settle();
      return out;
    },
    async post(p, body) {
      const res = await this.req('POST', p, body);
      const out = await res.json();
      await this.settle();
      return out;
    }
  };
}

/* ------------------------------------------------------------------ เครือข่ายจำลอง */
const net = { gas: null, down: false, calls: [], anthropic: null, anthropicCalls: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = String(input instanceof Request ? input.url : input);
  if (url === GAS_URL) {
    const body = typeof init.body === 'string' ? init.body : '';
    let op = '';
    try { op = JSON.parse(body).op; } catch (e) { op = '?'; }
    net.calls.push(op);
    if (net.down || !net.gas) return new Response('<html>Service unavailable</html>', { status: 503 });
    const out = net.gas.ctx.doPost({ postData: { contents: body } });
    return new Response(out.getContent(), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.indexOf('https://api.anthropic.com/') === 0) {
    net.anthropicCalls++;
    const h = net.anthropic || (() => ({ status: 500, body: '{"error":"no handler"}' }));
    const r = h(JSON.parse(init.body));
    return new Response(r.body, { status: r.status });
  }
  throw new Error('การทดสอบเรียกเว็บที่ไม่ได้เตรียมไว้: ' + url);
};

/* ------------------------------------------------------------------ ข้อมูลตั้งต้น */
const dateStr = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
function payload(o) {
  return Object.assign({
    requesterName: 'สุกัญญา แอนตะริส', requesterEmail: 'sukanya@arts.tu.ac.th', requesterPhone: '0812345678',
    department: 'สาขาวิชาภาษาไทย', projectName: 'การประชุมคณาจารย์', dueDate: dateStr(20),
    objective: 'ประชาสัมพันธ์การประชุมคณาจารย์ประจำภาค', targetAudience: 'คณาจารย์', keyMessage: 'ข้อความหลักของงาน',
    channels: ['Facebook คณะศิลปศาสตร์'], acceptTerms: true, designerId: 'pool',
    deliverables: [{ mediaType: 'poster', size: 'A4 (21 x 29.7 ซม.)', quantity: 1 }]
  }, o || {});
}

function seedGas() {
  const gas = loadGas();
  gas.ctx.setupSystem();
  gas.ctx.createAdmin_('pr@arts.tu.ac.th', 'ธิติวุฒิ บุญแก้ว', 'SuperSecret123');
  gas.ctx.saveDesigner_({ name: 'กนกพร ศรีสุข', specialty: 'ภาพโซเชียลมีเดีย', email: 'kanok@arts.tu.ac.th' });
  gas.ctx.saveDesigner_({ name: 'ปิยะ วงศ์ใหญ่', specialty: 'วิดีโอสั้น' });
  const j1 = gas.ctx.createRequest_(payload({ projectName: 'งานเดิมก่อนย้าย', requesterPhone: '095-814-4106', mandatoryText: '- บรรทัดที่ขึ้นต้นด้วยขีด' }));
  gas.ctx.finalizeRequest_(j1.jobId);
  gas.ctx.changeStatus_(j1.jobId, 'DESIGNING', 'ผู้ดูแลระบบ', { notify: false });
  gas.ctx.setAnthropicApiKey_('sk-ant-test-key');
  gas.state.outbox.length = 0;
  return { gas, j1 };
}

async function paired() {
  const mod = await import(path.join(ROOT, 'cloudflare', 'server.mjs'));
  const { gas, j1 } = seedGas();
  net.gas = gas;
  net.down = false;
  net.calls.length = 0;
  net.anthropic = null;
  const cf = makeDo(mod);
  await cf.req('GET', '/healthz');
  const r = await cf.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  if (!r.ok) throw new Error('จับคู่ไม่สำเร็จ: ' + r.error);
  await cf.obj.deliver();
  await cf.settle();
  return { cf, gas, j1, mod };
}

/** ข้อมูลทั้งสองฝั่งต้องตรงกันทุกชีต (ตรวจผ่านหน้า /setup/verify) */
async function assertSame(cf, label) {
  await cf.obj.deliver();
  const v = await cf.post('/setup/verify', { email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  assert(v.ok, 'ตรวจเทียบไม่สำเร็จ: ' + v.error);
  const bad = v.sheets.filter((s) => !s.same).map((s) => s.name + ' (' + s.note + ')');
  eq(bad.join(', '), '', (label || '') + ' ข้อมูลสองฝั่งต้องตรงกัน');
}

const fileArg = (name, text) => ({ fileName: name, mimeType: 'application/pdf', dataB64: Buffer.from(text).toString('base64') });

/* ================================================================== ชุดทดสอบ */

group('1. จับคู่และย้ายข้อมูลจาก Apps Script');

test('ยังไม่จับคู่: หน้าแรกพาไป /setup และคำสั่งของระบบยังใช้ไม่ได้', async () => {
  const mod = await import(path.join(ROOT, 'cloudflare', 'server.mjs'));
  const cf = makeDo(mod);
  const res = await cf.req('GET', '/');
  eq(res.status, 302);
  assert(res.headers.get('location').endsWith('/setup'));
  const api = await cf.api('apiBootstrap');
  eq(api.ok, false);
});

test('จับคู่ด้วยบัญชีผู้ดูแลระบบ ย้ายข้อมูลครบ และ Apps Script เปลี่ยนเป็นระบบสำรอง', async () => {
  const { cf, gas, j1 } = await paired();
  eq(gas.ctx.isBackupMode_(), true);
  const st = await cf.post('/setup/status');
  eq(st.paired, true);
  eq(st.pending, 0, 'ไม่มีข้อมูลค้างส่ง');
  const view = await cf.api('apiTrack', j1.jobId, 'sukanya@arts.tu.ac.th', '');
  eq(view.ok, true, 'เปิดงานเดิมบน Cloudflare ได้ ' + (view.error || ''));
  eq(view.data.projectName, 'งานเดิมก่อนย้าย');
  await assertSame(cf, 'หลังย้ายข้อมูล');
});

test('รหัสผ่านผิดจับคู่ไม่ได้ และ Apps Script ยังเป็นระบบหลัก', async () => {
  const mod = await import(path.join(ROOT, 'cloudflare', 'server.mjs'));
  const { gas } = seedGas();
  net.gas = gas;
  const cf = makeDo(mod);
  const r = await cf.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'wrong-password' });
  eq(r.ok, false);
  assert(/รหัสผ่าน/.test(r.error), r.error);
  eq(gas.ctx.isBackupMode_(), false);
  eq((await cf.post('/setup/status')).paired, false);
});

test('ลิงก์ Apps Script ผิดรูปแบบถูกปฏิเสธ (กันส่งรหัสผ่านไปเว็บอื่น)', async () => {
  const mod = await import(path.join(ROOT, 'cloudflare', 'server.mjs'));
  const cf = makeDo(mod);
  const before = net.calls.length;
  const r = await cf.post('/setup/pair', { gasUrl: 'https://evil.example.com/exec', email: 'a@b.c', password: 'x' });
  eq(r.ok, false);
  assert(/ลิงก์ Apps Script ไม่ถูกต้อง/.test(r.error));
  eq(net.calls.length, before, 'ต้องไม่ส่งอะไรออกไปเลย');
});

test('รหัสผ่านที่ตั้งบน Apps Script ล็อกอินบน Cloudflare ได้ (แฮชตรงกันทุกบิต)', async () => {
  const { cf, gas } = await paired();
  const r = await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123');
  eq(r.ok, true, r.error);
  // token ที่ออกบน Cloudflare ใช้กับ Apps Script ได้ (กุญแจลับเดียวกัน) แปลว่า HMAC ตรงกันทุกบิต
  eq(gas.ctx.verifyToken_ ? !!gas.ctx.verifyToken_(r.data.token) : true, true);
  const gasLogin = gas.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123');
  const onCf = await cf.api('apiVerifySession', gasLogin.token);
  eq(onCf.ok, true, 'token จาก Apps Script ใช้บน Cloudflare ได้ ' + (onCf.error || ''));
});

group('2. ผู้ขอยื่นคำขอบน Cloudflare');

test('ยื่นคำขอพร้อมไฟล์แนบ: ไฟล์อยู่ในโฟลเดอร์งานบน Drive และข้อมูลไปถึงชีตสำรอง', async () => {
  const { cf, gas } = await paired();
  const designers = (await cf.api('apiBootstrap')).data.designers;
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'โครงการบน Cloudflare', designerId: designers[0].id }));
  eq(sub.ok, true, sub.error);
  const { jobId, trackToken } = sub.data;
  assert(/^DR-\d{4}-\d{4}$/.test(jobId), jobId);
  const up1 = await cf.api('apiUploadFile', jobId, trackToken, fileArg('โลโก้.pdf', 'logo-bytes'));
  eq(up1.ok, true, up1.error);
  const up2 = await cf.api('apiUploadFile', jobId, trackToken, fileArg('ข้อมูล.pdf', 'data-bytes'));
  eq(up2.ok, true, up2.error);
  const fin = await cf.api('apiFinalizeRequest', jobId, trackToken);
  eq(fin.ok, true, fin.error);
  await cf.obj.deliver();

  const req = gas.ctx.getRequest_(jobId);
  assert(req, 'คำขอต้องไปถึงชีตสำรอง');
  eq(req.assignedTo, 'กนกพร ศรีสุข');
  eq(String(req.attachmentCount), '2');
  const folder = gas.state.drive.folders[req.folderId];
  assert(folder, 'มีโฟลเดอร์งานจริงบน Drive');
  eq(folder.name.indexOf(jobId), 0, 'โฟลเดอร์ถูกตั้งชื่อตามเลขที่คำขอ ' + folder.name);
  const names = folder.files.filter((f) => !f.trashed).map((f) => f.name).sort();
  eq(names.length, 2, 'ไฟล์ทั้งสองย้ายเข้าโฟลเดอร์งาน');
  assert(names.every((n) => n.indexOf(jobId + '_SRC_') === 0), names.join(','));
  const content = folder.files[0].blob.getDataAsString();
  assert(['logo-bytes', 'data-bytes'].indexOf(content) >= 0, 'เนื้อหาไฟล์ครบ');
  await assertSame(cf, 'หลังยื่นคำขอ');
});

test('อีเมลยืนยันและแจ้งเจ้าหน้าที่ส่งผ่าน Apps Script พร้อมลิงก์ไป Cloudflare', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'ทดสอบอีเมล' }));
  await cf.api('apiFinalizeRequest', sub.data.jobId, sub.data.trackToken);
  await cf.obj.deliver();
  const confirm = gas.state.outbox.find((m) => /ยืนยันการรับคำขอ/.test(m.subject));
  assert(confirm, 'มีอีเมลยืนยันถึงผู้ขอ');
  eq(confirm.to, 'sukanya@arts.tu.ac.th');
  assert(confirm.htmlBody.indexOf(ORIGIN + '/?page=track') >= 0 || confirm.htmlBody.indexOf(ORIGIN + '?page=track') >= 0,
    'ลิงก์ติดตามต้องเป็นของ Cloudflare');
  assert(confirm.htmlBody.indexOf('script.google.com') < 0, 'ห้ามมีลิงก์ Apps Script');
  assert(gas.state.outbox.some((m) => /คำขอออกแบบใหม่/.test(m.subject)), 'เจ้าหน้าที่ได้รับแจ้ง');
});

test('ใบรับไฟล์ปลอม (ย้ายไฟล์อื่นบน Drive) ถูกปฏิเสธทั้งที่ Worker และ Durable Object', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const secretFile = gas.state.drive.files[Object.keys(gas.state.drive.files)[0]];
  const viaWorker = await cf.api('apiUploadFile', sub.data.jobId, sub.data.trackToken,
    { fileName: 'x.pdf', mimeType: 'application/pdf', dataB64: 'staged:' + (secretFile ? secretFile.id : 'abc') + ':10:' + '0'.repeat(32) });
  eq(viaWorker.ok, false);
  // ส่งตรงถึง Durable Object (ข้าม Worker) ก็ต้องไม่ผ่านเพราะลายมือชื่อไม่ถูก
  const direct = await cf.obj.fetch(new Request(ORIGIN + '/api', { method: 'POST', body: JSON.stringify({ fn: 'apiUploadFile',
    args: [sub.data.jobId, sub.data.trackToken, { fileName: 'x.pdf', mimeType: 'application/pdf', dataB64: 'staged:abc:10:' + 'f'.repeat(32) }] }) }));
  const d = await direct.json();
  eq(d.ok, false);
  assert(/ไฟล์เสียหาย|ใบรับไฟล์/.test(d.error), d.error);
});

test('ไฟล์ชนิดที่ไม่อนุญาตถูกปฏิเสธ และไม่ถูกย้ายเข้าโฟลเดอร์งาน', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const r = await cf.api('apiUploadFile', sub.data.jobId, sub.data.trackToken, { fileName: 'virus.exe', mimeType: 'application/x-msdownload', dataB64: Buffer.from('MZ').toString('base64') });
  eq(r.ok, false);
  assert(/ไม่รองรับไฟล์/.test(r.error), r.error);
  await cf.obj.deliver();
  const req = gas.ctx.getRequest_(sub.data.jobId);
  eq(gas.state.drive.folders[req.folderId].files.length, 0);
});

test('โฟลเดอร์งานใช้โฟลเดอร์ที่เตรียมไว้ ผู้ขอไม่ต้องรอ Drive ตอนกดส่ง', async () => {
  const { cf } = await paired();
  await cf.obj.refillSpare();
  const before = net.calls.filter((c) => c === 'io').length;
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'ไม่ต้องรอ Drive' }));
  eq(sub.ok, true, sub.error);
  eq(net.calls.filter((c) => c === 'io').length - before <= 1, true, 'การยื่นคำขอไม่ต้องรอสร้างโฟลเดอร์ (เติมโฟลเดอร์สำรองเบื้องหลังได้)');
});

test('ไม่มีโฟลเดอร์สำรองเหลือ ก็ยังสร้างโฟลเดอร์ใหม่ทันทีได้', async () => {
  const { cf, gas } = await paired();
  cf.obj.store.setPropNow('__spare_folders', '[]');
  cf.obj.refilling = true; // จำลองว่ากำลังเติมอยู่ ไม่มีโฟลเดอร์ให้ใช้
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'สร้างโฟลเดอร์ทันที' }));
  eq(sub.ok, true, sub.error);
  await cf.obj.deliver();
  const req = gas.ctx.getRequest_(sub.data.jobId);
  assert(gas.state.drive.folders[req.folderId].name.indexOf(sub.data.jobId) === 0);
  cf.obj.refilling = false;
});

test('เลขที่คำขอต่อจากของเดิมบน Apps Script ไม่ซ้ำ', async () => {
  const { cf, j1 } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const n1 = Number(j1.jobId.slice(-4));
  eq(Number(sub.data.jobId.slice(-4)), n1 + 1);
});

group('3. เจ้าหน้าที่ทำงานบน Cloudflare');

test('ล็อกอิน เปลี่ยนสถานะ มอบหมายงาน แล้วชีตสำรองตรงกันทุกแถว', async () => {
  const { cf, gas, j1 } = await paired();
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const list = await cf.api('apiAdminList', t, {});
  eq(list.ok, true, list.error);
  const ch = await cf.api('apiAdminChangeStatus', t, j1.jobId, 'INFO_NEEDED', { detail: 'ขอไฟล์โลโก้', notify: true });
  eq(ch.ok, true, ch.error);
  const as = await cf.api('apiAdminAssign', t, j1.jobId, 'ปิยะ วงศ์ใหญ่');
  eq(as.ok, true, as.error);
  await cf.obj.deliver();
  eq(gas.ctx.getRequest_(j1.jobId).status, 'INFO_NEEDED');
  eq(gas.ctx.getRequest_(j1.jobId).assignedTo, 'ปิยะ วงศ์ใหญ่');
  assert(gas.state.outbox.some((m) => /ข้อมูลเพิ่มเติม/.test(m.subject)), 'อีเมลขอข้อมูลเพิ่มเติมถึงผู้ขอ');
  await assertSame(cf, 'หลังเจ้าหน้าที่ทำงาน');
});

test('อัปโหลดไฟล์ส่งมอบ: แชร์ไฟล์ให้เปิดผ่านลิงก์ และส่งมอบงานได้', async () => {
  const { cf, gas, j1 } = await paired();
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const up = await cf.api('apiAdminUploadFile', t, j1.jobId, fileArg('ผลงาน.pdf', 'final'), 'final');
  eq(up.ok, true, up.error);
  await cf.api('apiAdminSetDraftUrl', t, j1.jobId, 'https://canva.com/design/x');
  const dl = await cf.api('apiAdminChangeStatus', t, j1.jobId, 'DELIVERED', { notify: true });
  eq(dl.ok, true, dl.error);
  await cf.obj.deliver();
  const file = Object.values(gas.state.drive.files).find((f) => /_FINAL_/.test(f.name));
  assert(file, 'มีไฟล์ส่งมอบบน Drive');
  eq(file.sharing && file.sharing.access, 'ANYONE_WITH_LINK', 'ไฟล์ส่งมอบต้องเปิดผ่านลิงก์ได้');
  await assertSame(cf, 'หลังส่งมอบ');
});

test('ลบคำขอ: แถวหายทั้งสองฝั่ง และโฟลเดอร์งานลงถังขยะ', async () => {
  const { cf, gas, j1 } = await paired();
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const folderId = gas.ctx.getRequest_(j1.jobId).folderId;
  const del = await cf.api('apiAdminDeleteRequest', t, j1.jobId, j1.jobId);
  eq(del.ok, true, del.error);
  await cf.obj.deliver();
  eq(gas.ctx.getRequest_(j1.jobId), null);
  eq(gas.state.drive.folders[folderId].trashed, true);
  await assertSame(cf, 'หลังลบคำขอ');
});

test('ย้ายงานเก่าไปเก็บถาวร: สเปรดชีตเก็บถาวรบน Google ถูกสร้างและมีข้อมูลครบ', async () => {
  // งานเก่าที่ปิดไปนานแล้ว (มีอยู่บน Apps Script ก่อนย้าย)
  const mod = await import(path.join(ROOT, 'cloudflare', 'server.mjs'));
  const { gas } = seedGas();
  const old = gas.ctx.createRequest_(payload({ projectName: 'งานเก่ามาก' }));
  gas.ctx.finalizeRequest_(old.jobId);
  gas.ctx.changeStatus_(old.jobId, 'DELIVERED', 'x', { notify: false });
  gas.ctx.update_('Requests', gas.ctx.getRequest_(old.jobId)._row, { closedAt: dateStr(-500) + ' 10:00:00' });
  net.gas = gas;
  const cf = makeDo(mod);
  await cf.req('GET', '/healthz');
  eq((await cf.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' })).ok, true);
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const run = await cf.api('apiAdminArchiveRun', t, dateStr(-30), 'ย้ายข้อมูล');
  eq(run.ok, true, run.error);
  eq(run.data.moved, 1);
  await cf.obj.deliver();
  const ab = gas.ctx.archiveBook_(false);
  assert(ab, 'Apps Script มีสเปรดชีตเก็บถาวรแล้ว');
  eq(gas.ctx.readArchive_('Requests').length, 1, 'ข้อมูลเก็บถาวรไปถึงฝั่ง Google');
  eq(gas.ctx.getRequest_(old.jobId), null, 'ออกจากชีตหลักฝั่ง Google แล้ว');
  const view = await cf.api('apiTrack', old.jobId, 'sukanya@arts.tu.ac.th', '');
  eq(view.ok, true, 'งานที่เก็บถาวรยังเปิดดูได้บน Cloudflare ' + (view.error || ''));
  const settings = await cf.api('apiAdminSettings', t);
  assert(/docs\.google\.com\/spreadsheets/.test(settings.data.archive.archiveUrl), 'ลิงก์เก็บถาวรชี้ไป Google Sheets ' + settings.data.archive.archiveUrl);
  await assertSame(cf, 'หลังย้ายเก็บถาวร');
});

group('4. งานเบื้องหลัง: สรุป Design Brief และสรุปประจำวัน');

test('มีคำขอใหม่ → ไม่เกิน 1 นาที AI สรุป Brief (เรียก Claude จาก Cloudflare โดยตรง) และสำรองไปชีต', async () => {
  const { cf, gas } = await paired();
  net.anthropic = (body) => {
    assert(body.model, 'ส่งชื่อโมเดล');
    return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
      summary: 'สรุปจาก AI', objective: 'วัตถุประสงค์', audience: 'คณาจารย์', keyMessage: 'ข้อความ', tone: 'ทางการ',
      deliverables: ['โปสเตอร์ A4'], mandatoryElements: [], references: [], missingInfo: [], questionsForRequester: [], designNotes: 'หมายเหตุ'
    }) }] }) };
  };
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'ให้ AI สรุป' }));
  await cf.api('apiFinalizeRequest', sub.data.jobId, sub.data.trackToken);
  const s = cf.obj.sched();
  assert(s.once && s.once - Date.now() <= 60000, 'ตั้งงานสรุป Brief ภายใน 1 นาที');
  s.once = Date.now() - 1;
  cf.obj.saveSched(s);
  await cf.obj.alarm();
  await cf.settle();
  await cf.obj.deliver();
  assert(net.anthropicCalls > 0, 'เรียก Claude API');
  const req = gas.ctx.getRequest_(sub.data.jobId);
  eq(req.briefStatus, 'DONE', 'Brief สรุปแล้ว ' + req.briefStatus);
  await assertSame(cf, 'หลังสรุป Brief');
});

test('Claude API ล่ม ระบบใช้สูตรสำเร็จสรุปแทน ไม่ค้าง', async () => {
  const { cf, gas } = await paired();
  net.anthropic = () => ({ status: 400, body: '{"error":{"message":"bad"}}' });
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'AI ล่ม' }));
  await cf.api('apiFinalizeRequest', sub.data.jobId, sub.data.trackToken);
  await cf.obj.job('workerTick');
  await cf.obj.deliver();
  const req = gas.ctx.getRequest_(sub.data.jobId);
  assert(req.briefStatus && req.briefStatus !== 'PENDING', 'ไม่ค้างสถานะรอ ' + req.briefStatus);
});

test('สรุปงานประจำวัน 08:00 ส่งวันละครั้งเท่านั้น', async () => {
  const { cf, gas } = await paired();
  const s = cf.obj.sched();
  s.daily = '';
  cf.obj.saveSched(s);
  const realNow = Date.now;
  try {
    // 09:00 เวลาไทย
    const nine = Date.UTC(2026, 10, 25, 2, 0, 0);
    Date.now = () => nine;
    await cf.obj.runDue();
    await cf.obj.deliver();
    const n1 = gas.state.outbox.filter((m) => /สรุปคิวงาน/.test(m.subject)).length;
    await cf.obj.runDue();
    await cf.obj.deliver();
    const n2 = gas.state.outbox.filter((m) => /สรุปคิวงาน/.test(m.subject)).length;
    eq(n2, n1, 'ไม่ส่งซ้ำในวันเดียวกัน');
  } finally {
    Date.now = realNow;
  }
});

group('5. Apps Script ตัวสำรอง');

test('เปิดลิงก์ Apps Script เดิม (ลิงก์ติดตามในอีเมลเก่า) พาไปหน้าเดียวกันบน Cloudflare', async () => {
  const { gas, j1 } = await paired();
  const out = gas.ctx.doGet({ parameter: { page: 'track', job: j1.jobId, t: 'abc_DEF-123' } });
  const html = out.getContent();
  assert(html.indexOf(ORIGIN + '/?page=track&amp;job=' + j1.jobId + '&amp;t=abc_DEF-123') >= 0, 'ลิงก์ปลายทางถูกต้อง');
  assert(html.indexOf('"' + ORIGIN + '/?page=track\\u0026job=' + j1.jobId) >= 0, 'สคริปต์พาไปอัตโนมัติ');
  assert(html.indexOf('ไปที่ระบบ') >= 0);
});

test('หน้าเว็บ Apps Script ที่เปิดค้างไว้เขียนข้อมูลไม่ได้ (ข้อมูลไม่แยกสองทาง)', async () => {
  const { gas } = await paired();
  const r = gas.ctx.apiSubmitRequest(payload());
  eq(r.ok, false);
  eq(r.code, 'MOVED');
  assert(r.error.indexOf(ORIGIN) >= 0);
});

test('งานตามเวลาของ Apps Script หยุดเมื่อเป็นระบบสำรอง', async () => {
  const { gas } = await paired();
  const before = gas.state.outbox.length;
  gas.ctx.workerTick();
  gas.ctx.dailyReminder();
  eq(gas.state.outbox.length, before);
});

test('คำขอที่ไม่มีรหัสลับ หรือรหัสลับผิด ถูกปฏิเสธ', async () => {
  const { gas } = await paired();
  const call = (b) => JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).getContent());
  eq(call({ op: 'export' }).code, 'NOT_PAIRED');
  eq(call({ op: 'batch', secret: 'wrong', ops: [] }).code, 'NOT_PAIRED');
  eq(call({ op: 'io', secret: '', kind: 'createFolder', args: {} }).code, 'NOT_PAIRED');
  eq(call({ op: 'pair', email: 'pr@arts.tu.ac.th', password: 'nope', cfUrl: 'https://x.test' }).ok, false);
});

test('Cloudflare ส่งค่าตั้งค่าที่เป็นของ Apps Script เองมาไม่ได้ (เช่นลิงก์สเปรดชีต)', async () => {
  const { gas } = await paired();
  const secret = gas.state.props.BRIDGE_SECRET;
  const before = gas.state.props.SPREADSHEET_ID;
  const out = JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify({ op: 'batch', secret, ops: [
    { t: 'prop', k: 'SPREADSHEET_ID', v: 'hijack' }, { t: 'prop', k: 'BRIDGE_SECRET', v: 'x' }] }) } }).getContent());
  eq(out.ok, true);
  eq(gas.state.props.SPREADSHEET_ID, before);
  eq(gas.state.props.BRIDGE_SECRET, secret);
});

group('6. ความเสถียร: Apps Script ล่ม / กลับมาใช้ Apps Script');

test('Apps Script ล่มชั่วคราว: Cloudflare ยังรับคำขอได้ เก็บคิวไว้ แล้วส่งครบเมื่อกลับมา', async () => {
  const { cf, gas } = await paired();
  net.down = true;
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'ระหว่าง Google ล่ม' }));
  eq(sub.ok, true, 'ยื่นคำขอได้แม้ Google ล่ม (ใช้โฟลเดอร์ที่เตรียมไว้) ' + (sub.error || ''));
  await cf.obj.deliver();
  const st = await cf.post('/setup/status');
  assert(st.pending > 0, 'มีคิวค้าง');
  assert(st.lastError, 'บันทึกข้อผิดพลาดไว้');
  assert(cf.alarm, 'ตั้ง alarm ลองส่งใหม่');
  eq(gas.ctx.getRequest_(sub.data.jobId), null, 'ยังไม่ถึงฝั่งสำรอง');
  net.down = false;
  await cf.obj.alarm();
  await cf.settle();
  eq((await cf.post('/setup/status')).pending, 0, 'ส่งครบหลัง Google กลับมา');
  assert(gas.ctx.getRequest_(sub.data.jobId), 'ข้อมูลไปถึงแล้ว');
  await assertSame(cf, 'หลัง Google กลับมา');
});

test('ผู้ดูแลระบบกลับมาใช้ Apps Script (failover): แจ้ง Cloudflare ให้หยุดรับข้อมูลทันที แล้วจับคู่ใหม่ได้', async () => {
  const { cf, gas } = await paired();
  const page = gas.ctx.doGet({ parameter: { page: 'failover' } }).getContent();
  assert(page.indexOf('apiBridgeFailover') >= 0);
  eq(gas.ctx.apiBridgeFailover('pr@arts.tu.ac.th', 'wrong').ok, false, 'รหัสผ่านผิดสลับไม่ได้');
  // Apps Script เรียก Cloudflare /setup/detach (ตัวจำลอง UrlFetch เป็นแบบ sync จึงเก็บคำขอไว้ แล้วส่งต่อให้ Cloudflare เอง)
  const told = [];
  gas.state.fetchHandler = (url, params) => {
    told.push({ url, body: JSON.parse(params.payload) });
    return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
  };
  const fo = gas.ctx.apiBridgeFailover('pr@arts.tu.ac.th', 'SuperSecret123');
  gas.state.fetchHandler = null;
  eq(fo.ok, true);
  eq(fo.data.cfNotified, true);
  eq(told.length, 1);
  eq(told[0].url, ORIGIN + '/setup/detach');
  eq(gas.ctx.isBackupMode_(), false);
  eq(gas.ctx.apiBootstrap().ok, true, 'Apps Script ใช้งานได้ตามปกติ');
  // รหัสลับผิดสั่งหยุดไม่ได้
  const bad = await cf.req('POST', '/setup/detach', { secret: wrongTok(told[0].body.secret) });
  eq(bad.status, 403);
  eq((await cf.post('/setup/status')).detached, false);
  eq((await cf.post('/setup/detach', told[0].body)).ok, true);
  const st = await cf.post('/setup/status');
  eq(st.detached, true, 'หยุดรับข้อมูลทันทีโดยไม่ต้องรอมีการเขียน');
  eq((await cf.api('apiBootstrap')).code, 'MOVED', 'Cloudflare ไม่รับคำสั่งแล้ว');
  const home = await cf.req('GET', '/');
  assert((await home.text()).indexOf('Apps Script') >= 0);
  // จับคู่ใหม่: ข้อมูลล่าสุดจาก Apps Script มาทับ (หยุดรับข้อมูลแล้ว ไม่ต้องใช้รหัสผ่านบน Cloudflare)
  gas.ctx.createRequest_(payload({ projectName: 'ยื่นบน Apps Script ระหว่างสลับ' }));
  const re = await cf.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(re.ok, true, re.error);
  eq((await cf.post('/setup/status')).detached, false);
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const all = await cf.api('apiAdminList', t, {});
  assert(all.data.some((r) => r.projectName === 'ยื่นบน Apps Script ระหว่างสลับ'), 'ได้ข้อมูลที่ยื่นระหว่างสลับ');
  await assertSame(cf, 'หลังจับคู่ใหม่');
});

test('สลับกลับตอน Cloudflare ล่ม: Cloudflare รู้เองในรอบตรวจ 5 นาที และจับคู่ใหม่ต้องยืนยันถ้ามีของที่ส่งไม่ถึง', async () => {
  const { cf, gas } = await paired();
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const jobId = (await cf.api('apiAdminList', t, {})).data[0].jobId;
  gas.state.fetchHandler = () => { throw new Error('Address unavailable'); };
  const fo = gas.ctx.apiBridgeFailover('pr@arts.tu.ac.th', 'SuperSecret123');
  gas.state.fetchHandler = null;
  eq(fo.ok, true, 'สลับได้แม้ติดต่อ Cloudflare ไม่ได้');
  eq(fo.data.cfNotified, false);
  eq((await cf.post('/setup/status')).detached, false, 'Cloudflare ยังไม่รู้');
  // รอบตรวจ: ไม่มีของค้างส่ง → ถามสถานะ → Apps Script ไม่รู้จักรหัสลับแล้ว → หยุดรับข้อมูล
  const s = cf.obj.sched(); s.ping = 0; cf.obj.saveSched(s);
  await cf.obj.runDue();
  eq((await cf.post('/setup/status')).detached, true, 'รู้เองในรอบตรวจ');
  // จำลองว่ามีคนบันทึกบน Cloudflare ก่อนรอบตรวจ: ปลดสถานะหยุดแล้วเขียน
  cf.obj.store.setPropNow('__detached', null);
  eq((await cf.api('apiAdminNote', t, jobId, 'บันทึกบน Cloudflare หลังสลับ')).ok, true);
  await cf.obj.deliver();
  const st = await cf.post('/setup/status');
  eq(st.detached, true);
  assert(st.pending > 0, 'มีของที่ส่งไม่ถึง');
  const r1 = await cf.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(r1.ok, false, 'ต้องยืนยันก่อนทิ้งของที่ส่งไม่ถึง');
  eq(r1.code, 'PENDING');
  assert(r1.error.indexOf(jobId) >= 0, 'บอกเลขงานที่ได้รับผลกระทบ ' + r1.error);
  const r2 = await cf.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123', discardPending: true });
  eq(r2.ok, true, r2.error);
  eq((await cf.post('/setup/status')).pending, 0);
  await assertSame(cf, 'หลังจับคู่ใหม่');
});

test('รอบตรวจ 5 นาทีไม่หยุดรับข้อมูลเมื่อ Apps Script แค่ติดต่อไม่ได้ชั่วคราว', async () => {
  const { cf } = await paired();
  net.down = true;
  const s = cf.obj.sched(); s.ping = 0; cf.obj.saveSched(s);
  await cf.obj.runDue();
  net.down = false;
  eq((await cf.post('/setup/status')).detached, false);
  eq((await cf.api('apiBootstrap')).ok, true);
});

test('ชีตสำรองถูกแก้เองใน Google Sheets: ตรวจเทียบเห็นความต่าง และส่งทั้งหมดใหม่ซ่อมได้', async () => {
  const { cf, gas, j1 } = await paired();
  const row = gas.ctx.getRequest_(j1.jobId);
  gas.ctx.sheet_('Requests').getRange(row._row, 3).setValue('มีคนแก้มือ');
  const v = await cf.post('/setup/verify', { email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(v.allSame, false);
  const r = await cf.post('/setup/resync', { email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(r.ok, true, r.error);
  await assertSame(cf, 'หลังส่งทั้งหมดใหม่');
});

test('จับคู่ได้เฉพาะเว็บแอป Apps Script ที่ล็อกไว้ (กันคนอื่นจับคู่แย่งก่อน) และหน้าสถานะไม่เปิดเผยลิงก์ชีต', async () => {
  const mod = await import(path.join(ROOT, 'cloudflare', 'server.mjs'));
  const { gas } = seedGas();
  net.gas = gas;
  net.down = false;
  const other = makeDo(mod, { env: { GAS_DEPLOYMENT_ID: 'AKfycbSOMEONEELSE00000000000000' } });
  await other.req('GET', '/healthz');
  const r = await other.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(r.ok, false, 'ลิงก์ที่ไม่ใช่ของระบบถูกปฏิเสธ');
  assert(/ไม่ใช่เว็บแอป Apps Script ของระบบนี้/.test(r.error), r.error);
  eq((await other.post('/setup/status')).paired, false);
  eq(gas.ctx.isBackupMode_(), false, 'ไม่ได้ติดต่อ Apps Script เลย');
  const mine = makeDo(mod, { env: { GAS_DEPLOYMENT_ID: 'AKfycbTESTDEPLOYMENT1234567890' } });
  await mine.req('GET', '/healthz');
  const ok = await mine.post('/setup/pair', { gasUrl: GAS_URL, email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(ok.ok, true, ok.error);
  const st = await mine.post('/setup/status');
  eq(st.paired, true);
  assert(!('sheetUrl' in st), 'หน้าสถานะ (ไม่ต้องเข้าสู่ระบบ) ไม่มีลิงก์ Google Sheets');
  const v = await mine.post('/setup/verify', { email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(v.ok, true, v.error);
  assert(/^https:\/\/docs\.google\.com\//.test(v.sheetUrl), 'ผู้ดูแลระบบเห็นลิงก์ชีตสำรองหลังตรวจเทียบ ' + v.sheetUrl);
});

test('หน้า /setup ตรวจเทียบ/ส่งใหม่ ต้องใช้บัญชีผู้ดูแลระบบ', async () => {
  const { cf } = await paired();
  eq((await cf.post('/setup/verify', { email: 'pr@arts.tu.ac.th', password: 'x' })).ok, false);
  eq((await cf.post('/setup/resync', {})).ok, false);
});

group('6b. ไฟล์แนบส่งตรงไป Apps Script ด้วยใบอนุญาต (ไม่ผ่าน Cloudflare)');

/** ทำแบบเดียวกับ shim.js ในเบราว์เซอร์: ขอใบอนุญาต → ส่งไฟล์ตรงไป Apps Script → ส่งคำสั่งพร้อมใบรับไฟล์ */
async function directUpload(cf, gas, fn, args) {
  const files = [];
  args.forEach((a) => {
    if (a && typeof a === 'object') {
      if (typeof a.dataB64 === 'string') files.push(a);
      if (a.file && typeof a.file.dataB64 === 'string') files.push(a.file);
    }
  });
  const probe = JSON.parse(JSON.stringify(args, (k, v) => (k === 'dataB64' ? 'precheck:' + Buffer.from(v, 'base64').length : v)));
  const t = await cf.post('/api/ticket', { fn, args: probe });
  if (!t.ok) return { ticket: t };
  const ups = files.map((f, i) => JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify({
    op: 'upload', ticket: t.tickets[i], name: f.fileName, mime: f.mimeType, b64: f.dataB64 }) } }).getContent()));
  ups.forEach((u, i) => { if (u.ok) files[i].dataB64 = 'staged:' + u.id + ':' + u.size + ':' + u.sig; });
  if (ups.some((u) => !u.ok)) return { ticket: t, ups };
  return { ticket: t, ups, res: await cf.api(fn, ...args) };
}
/** token ที่ผิดแน่นอน (เปลี่ยนตัวแรกเป็นตัวอื่นเสมอ เดิมใช้ 'x' ซึ่งตรงกับตัวจริง 1 ใน 64 ครั้ง) */
const wrongTok = (t) => (t[0] === 'x' ? 'y' : 'x') + t.slice(1);
const driveCount = (gas) => Object.keys(gas.state.drive.files).length;
const gasUpload = (gas, body) => JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ op: 'upload' }, body)) } }).getContent());

test('ขอใบอนุญาตแล้วส่งไฟล์ตรงไป Apps Script: ไฟล์เข้าโฟลเดอร์งาน โดย Cloudflare ไม่ต้องรับข้อมูลไฟล์', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload({ projectName: 'อัปโหลดตรง' }));
  const { jobId, trackToken } = sub.data;
  const callsBefore = net.calls.length;
  const a = await directUpload(cf, gas, 'apiUploadFile', [jobId, trackToken, fileArg('โปสเตอร์.pdf', 'poster-bytes')]);
  eq(a.ticket.ok, true, a.ticket.error);
  eq(a.res.ok, true, a.res.error);
  const b = await directUpload(cf, gas, 'apiUploadFile', [jobId, trackToken, fileArg('ภาพ.png', 'png-bytes')]);
  eq(b.res.ok, true, b.res.error);
  eq(net.calls.slice(callsBefore).filter((c) => c === 'stage').length, 0, 'Cloudflare ไม่ได้ส่งข้อมูลไฟล์ไปพักเอง');
  eq((await cf.api('apiFinalizeRequest', jobId, trackToken)).ok, true);
  await cf.obj.deliver();
  const req = gas.ctx.getRequest_(jobId);
  eq(String(req.attachmentCount), '2');
  const files = gas.state.drive.folders[req.folderId].files.filter((f) => !f.trashed);
  eq(files.length, 2, 'ไฟล์ทั้งสองย้ายจากที่พักเข้าโฟลเดอร์งาน');
  eq(files.map((f) => f.blob.getDataAsString()).sort().join(','), 'png-bytes,poster-bytes');
  await assertSame(cf, 'หลังอัปโหลดตรง');
});

test('ใบอนุญาตออกให้เฉพาะผู้มีสิทธิ์ ตรวจชนิดและขนาดไฟล์ก่อนส่ง และการตรวจไม่บันทึกอะไรเลย', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const { jobId, trackToken } = sub.data;
  await cf.obj.deliver();
  const files0 = driveCount(gas);
  const pending0 = (await cf.post('/setup/status')).pending;
  const ask = (args) => cf.post('/api/ticket', { fn: 'apiUploadFile', args });
  const bad = await ask([jobId, wrongTok(trackToken), { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: 'precheck:100' }]);
  eq(bad.ok, false, 'token ผิดไม่ได้ใบอนุญาต');
  assert(/ไม่มีสิทธิ์/.test(bad.error), bad.error);
  const exe = await ask([jobId, trackToken, { fileName: 'virus.exe', mimeType: 'application/x-msdownload', dataB64: 'precheck:100' }]);
  eq(exe.ok, false);
  assert(/ไม่รองรับไฟล์/.test(exe.error), exe.error);
  const maxMB = Number(gas.ctx.getSettingInt_('maxFileMB', 10));
  const big = await ask([jobId, trackToken, { fileName: 'big.pdf', mimeType: 'application/pdf', dataB64: 'precheck:' + (maxMB * 1024 * 1024 + 1) }]);
  eq(big.ok, false, 'ไฟล์เกินขนาดที่ตั้งไว้ถูกปฏิเสธก่อนอัปโหลด');
  assert(/เกินกำหนด/.test(big.error), big.error);
  const raw = await ask([jobId, trackToken, fileArg('a.pdf', 'real-bytes')]);
  eq(raw.ok, false, 'ขอใบอนุญาตต้องไม่ส่งข้อมูลไฟล์จริงมา');
  const staffOnly = await cf.post('/api/ticket', { fn: 'apiAdminUploadFile', args: ['bad-token', jobId, { fileName: 'f.pdf', mimeType: 'application/pdf', dataB64: 'precheck:10' }, 'final'] });
  eq(staffOnly.ok, false, 'ไฟล์ส่งมอบต้องเข้าสู่ระบบ');
  const ok = await ask([jobId, trackToken, { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: 'precheck:100' }]);
  eq(ok.ok, true, ok.error);
  eq(ok.tickets.length, 1);
  eq(ok.gasUrl, GAS_URL);
  await cf.obj.deliver();
  eq(driveCount(gas), files0, 'ตรวจสิทธิ์ไม่สร้างไฟล์บน Drive');
  eq((await cf.post('/setup/status')).pending, pending0, 'ตรวจสิทธิ์ไม่สร้างการเปลี่ยนแปลงที่ต้องส่งสำรอง');
  eq(gas.ctx.getRequest_(jobId).attachmentCount === '' ? 0 : Number(gas.ctx.getRequest_(jobId).attachmentCount), 0);
  await assertSame(cf, 'หลังตรวจสิทธิ์');
});

test('Apps Script ปฏิเสธใบอนุญาตปลอม หมดอายุ ใช้ซ้ำ และไฟล์ขนาดไม่ตรง', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const { jobId, trackToken } = sub.data;
  const b64 = Buffer.from('hello-file').toString('base64');
  const getTicket = async () => (await cf.post('/api/ticket', { fn: 'apiUploadFile',
    args: [jobId, trackToken, { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: 'precheck:10' }] })).tickets[0];
  const files0 = driveCount(gas);
  const t1 = await getTicket();
  const forged = t1.slice(0, -1) + (t1.slice(-1) === '0' ? '1' : '0');
  eq(gasUpload(gas, { ticket: forged, name: 'a.pdf', b64 }).code, 'TICKET', 'ลายมือชื่อผิด');
  eq(gasUpload(gas, { ticket: t1.replace(/\.10\./, '.11.'), name: 'a.pdf', b64 }).code, 'TICKET', 'แก้ขนาดในใบอนุญาตไม่ได้');
  const wrongSize = gasUpload(gas, { ticket: await getTicket(), name: 'a.pdf', b64: Buffer.from('longer-than-ten').toString('base64') });
  eq(wrongSize.ok, false, 'ไฟล์ใหญ่กว่าที่ขอไว้');
  const good = gasUpload(gas, { ticket: t1, name: 'a.pdf', mime: 'application/pdf', b64 });
  eq(good.ok, true, good.error);
  eq(good.size, 10);
  assert(/^[0-9a-f]{32}$/.test(good.sig));
  eq(gasUpload(gas, { ticket: t1, name: 'a.pdf', b64 }).code, 'TICKET', 'ใช้ใบอนุญาตซ้ำไม่ได้');
  const secret = gas.state.props.BRIDGE_SECRET;
  const past = String(Date.now() - 1000);
  const expired = past + '.abcdef012345.10.' + gas.ctx.bridgeSigHex_(secret, 'up|' + past + '|abcdef012345|10');
  eq(gasUpload(gas, { ticket: expired, name: 'a.pdf', b64 }).code, 'TICKET', 'หมดอายุ');
  eq(driveCount(gas), files0 + 1, 'มีไฟล์เข้าที่พักเฉพาะครั้งที่ใบอนุญาตถูกต้อง');
  // ใบรับไฟล์ที่ Apps Script ลงลายมือชื่อ Cloudflare ตรวจผ่านและแนบเข้างานได้
  const used = await cf.api('apiUploadFile', jobId, trackToken, { fileName: 'a.pdf', mimeType: 'application/pdf',
    dataB64: 'staged:' + good.id + ':' + good.size + ':' + good.sig });
  eq(used.ok, true, used.error);
});

test('ส่งผ่าน Cloudflare แบบเดิม (ทางสำรอง) ต้องตรวจสิทธิ์ก่อนพักไฟล์บน Drive', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const files0 = driveCount(gas);
  const callsBefore = net.calls.length;
  const r = await cf.api('apiUploadFile', sub.data.jobId, wrongTok(sub.data.trackToken), fileArg('a.pdf', 'should-not-store'));
  eq(r.ok, false);
  assert(/ไม่มีสิทธิ์/.test(r.error), r.error);
  eq(net.calls.slice(callsBefore).filter((c) => c === 'stage').length, 0, 'ไม่ส่งไฟล์ไปพัก');
  eq(driveCount(gas), files0, 'ไม่มีไฟล์ใหม่บน Drive');
  const fake = await cf.api('apiUploadFile', sub.data.jobId, sub.data.trackToken, { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: 'precheck:10' });
  eq(fake.ok, false, 'ส่งไฟล์จำลองสำหรับตรวจสิทธิ์มาเป็นคำสั่งจริงไม่ได้');
});

test('ส่งไปสำรองทีละไม่เกิน 20 ชุดต่อครั้ง (แผนฟรีเรียกออกได้ 50 ครั้ง) ที่เหลือส่งต่อรอบถัดไป', async () => {
  const { cf, gas } = await paired();
  for (let i = 0; i < 25; i++) {
    const ops = [];
    for (let j = 0; j < 400; j++) ops.push({ t: 'prop', k: 'BULK_' + i, v: String(j) });
    cf.obj.store.sql.exec('INSERT INTO outbox (ops, n, at) VALUES (?, ?, ?)', JSON.stringify(ops), ops.length, Date.now());
  }
  const before = net.calls.length;
  await cf.obj.deliver();
  eq(net.calls.slice(before).filter((c) => c === 'batch').length, 20, 'รอบแรกส่ง 20 ชุด');
  eq((await cf.post('/setup/status')).pending, 5);
  assert(cf.alarm, 'ตั้งเวลาส่งต่อ');
  await cf.obj.deliver();
  eq((await cf.post('/setup/status')).pending, 0, 'รอบถัดไปส่งครบ');
  eq(gas.state.props.BULK_24, '399');
});

test('ใบรับไฟล์ใช้ได้ครั้งเดียว: นำใบรับเดิมไปแนบกับงานอื่นไม่ได้ และไฟล์เดิมยังอยู่ที่งานแรก', async () => {
  const { cf, gas } = await paired();
  const a = (await cf.api('apiSubmitRequest', payload({ projectName: 'งาน ก', requesterEmail: 'a@arts.tu.ac.th' }))).data;
  const b = (await cf.api('apiSubmitRequest', payload({ projectName: 'งาน ข', requesterEmail: 'b@arts.tu.ac.th' }))).data;
  const file = fileArg('ใบเดียว.pdf', 'only-once');
  const first = await directUpload(cf, gas, 'apiUploadFile', [a.jobId, a.trackToken, file]);
  eq(first.res.ok, true, first.res.error);
  const receipt = file.dataB64;
  assert(/^staged:/.test(receipt));
  const replay = await cf.api('apiUploadFile', b.jobId, b.trackToken, { fileName: 'x.pdf', mimeType: 'application/pdf', dataB64: receipt });
  eq(replay.ok, false, 'ใช้ใบรับซ้ำไม่ได้');
  assert(/ถูกแนบไปแล้ว/.test(replay.error), replay.error);
  await cf.obj.deliver();
  const reqA = gas.ctx.getRequest_(a.jobId);
  const reqB = gas.ctx.getRequest_(b.jobId);
  eq(gas.state.drive.folders[reqA.folderId].files.filter((f) => !f.trashed).length, 1, 'ไฟล์ยังอยู่ในโฟลเดอร์งาน ก');
  eq(gas.state.drive.folders[reqB.folderId].files.length, 0, 'ไม่มีไฟล์ถูกดึงไปงาน ข');
  await assertSame(cf, 'หลังใช้ใบรับซ้ำ');
});

test('ทุกคำสั่งที่รับไฟล์ใช้ใบอนุญาตได้: ไฟล์ส่งมอบ ไฟล์ตอบข้อมูลเพิ่มเติม และคลังไฟล์ CI', async () => {
  const { cf, gas } = await paired();
  const t = (await cf.api('apiLogin', 'pr@arts.tu.ac.th', 'SuperSecret123')).data.token;
  const sub = (await cf.api('apiSubmitRequest', payload({ projectName: 'ครบทุกช่องทาง' }))).data;
  eq((await cf.api('apiFinalizeRequest', sub.jobId, sub.trackToken)).ok, true);
  // ไฟล์ส่งมอบของเจ้าหน้าที่
  const fin = await directUpload(cf, gas, 'apiAdminUploadFile', [t, sub.jobId, fileArg('งานจริง.pdf', 'final-bytes'), 'final']);
  eq(fin.ticket.ok, true, fin.ticket.error);
  eq(fin.res.ok, true, fin.res.error);
  // ผู้ขอแนบไฟล์ตอนรอข้อมูลเพิ่มเติม
  const info = await cf.api('apiAdminChangeStatus', t, sub.jobId, 'INFO_NEEDED', { detail: 'ขอไฟล์โลโก้โครงการ', notify: false });
  eq(info.ok, true, info.error);
  const rep = await directUpload(cf, gas, 'apiInfoUpload', [sub.jobId, '', sub.trackToken, fileArg('โลโก้.png', 'logo-bytes')]);
  eq(rep.ticket.ok, true, rep.ticket.error);
  eq(rep.res.ok, true, rep.res.error);
  // คลังไฟล์ CI
  const ci = await directUpload(cf, gas, 'apiAdminSaveResource', [t, { title: 'โลโก้คณะศิลปศาสตร์', kind: 'file',
    file: { fileName: 'logo-arts.png', mimeType: 'image/png', dataB64: Buffer.from('ci-logo').toString('base64') } }]);
  eq(ci.ticket.ok, true, ci.ticket.error);
  eq(ci.res.ok, true, ci.res.error);
  const lib = await cf.api('apiResources');
  eq(lib.data.items.length, 1, 'มีไฟล์ในคลัง CI');
  assert(/^https:\/\/drive\.google\.com\//.test(lib.data.items[0].url), 'ดาวน์โหลดผ่านลิงก์ Drive');
  // คนที่ไม่มีสิทธิ์ขอใบอนุญาตคลัง CI ไม่ได้
  const anon = await cf.post('/api/ticket', { fn: 'apiAdminSaveResource', args: ['bad', { title: 'ปลอม', kind: 'file', file: { fileName: 'a.png', mimeType: 'image/png', dataB64: 'precheck:5' } }] });
  eq(anon.ok, false);
  await cf.obj.deliver();
  const files = gas.state.drive.folders[gas.ctx.getRequest_(sub.jobId).folderId].files.filter((f) => !f.trashed);
  eq(files.length, 2, 'ไฟล์ส่งมอบและไฟล์ตอบข้อมูลอยู่ในโฟลเดอร์งาน');
  await assertSame(cf, 'หลังอัปโหลดทุกช่องทาง');
});

test('จำกัดใบอนุญาตต่องานต่อชั่วโมง กันการส่งไฟล์ท่วม Drive ของคณะ', async () => {
  const { cf } = await paired();
  const sub = (await cf.api('apiSubmitRequest', payload())).data;
  const ask = () => cf.post('/api/ticket', { fn: 'apiUploadFile', args: [sub.jobId, sub.trackToken, { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: 'precheck:10' }] });
  let last;
  for (let i = 0; i < 60; i++) { last = await ask(); if (!last.ok) break; }
  eq(last.ok, true, 'ภายในโควตาได้ครบ ' + (last.error || ''));
  const over = await ask();
  eq(over.ok, false, 'เกินโควตา');
  assert(/ถี่เกินไป/.test(over.error), over.error);
  const other = (await cf.api('apiSubmitRequest', payload({ requesterEmail: 'other@arts.tu.ac.th' }))).data;
  const ok = await cf.post('/api/ticket', { fn: 'apiUploadFile', args: [other.jobId, other.trackToken, { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: 'precheck:10' }] });
  eq(ok.ok, true, 'งานอื่นไม่โดนโควตาด้วย');
});

test('ตรวจเทียบระหว่างยังทยอยส่ง บอกให้รอ ไม่รายงานว่าข้อมูลไม่ตรง', async () => {
  const { cf } = await paired();
  for (let i = 0; i < 25; i++) {
    const ops = [];
    for (let j = 0; j < 400; j++) ops.push({ t: 'prop', k: 'BULK_' + i, v: String(j) });
    cf.obj.store.sql.exec('INSERT INTO outbox (ops, n, at) VALUES (?, ?, ?)', JSON.stringify(ops), ops.length, Date.now());
  }
  const v = await cf.post('/setup/verify', { email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' });
  eq(v.ok, false);
  assert(/กำลังทยอยส่ง/.test(v.error), v.error);
  // 25 ชุด ส่งไป 20 เหลือ 5 (บวกเวลาเข้าสู่ระบบของผู้ดูแลระบบอีก 1 ชุดถ้านาทีเปลี่ยน)
  assert(v.pending >= 5 && v.pending <= 6, 'ยังค้าง ' + v.pending);
  await cf.obj.deliver();
  eq((await cf.post('/setup/verify', { email: 'pr@arts.tu.ac.th', password: 'SuperSecret123' })).ok, true, 'ส่งครบแล้วตรวจเทียบได้');
});

test('"/api/" (มี / ท้าย) ผ่านการตรวจของ Worker เหมือน "/api"', async () => {
  const { cf, gas } = await paired();
  const sub = (await cf.api('apiSubmitRequest', payload())).data;
  const files0 = driveCount(gas);
  const callsBefore = net.calls.length;
  const res = await cf.req('POST', '/api/', { fn: 'apiUploadFile', args: [sub.jobId, wrongTok(sub.trackToken), fileArg('a.pdf', 'no')] });
  const r = await res.json();
  eq(r.ok, false);
  eq(net.calls.slice(callsBefore).filter((c) => c === 'stage').length, 0);
  eq(driveCount(gas), files0);
  const okRes = await (await cf.req('POST', '/api/', { fn: 'apiUploadFile', args: [sub.jobId, sub.trackToken, fileArg('a.pdf', 'yes')] })).json();
  eq(okRes.ok, true, okRes.error);
  eq(net.calls.slice(callsBefore).filter((c) => c === 'stage').length, 1, 'ไฟล์ผ่านการพักของ Worker ตามปกติ');
});

group('7. หน้าเว็บและความปลอดภัย');

test('หน้าแรกฝังข้อมูลตั้งต้น และใช้ google.script.run ผ่าน /api', async () => {
  const { cf } = await paired();
  const res = await cf.req('GET', '/?page=form');
  eq(res.status, 200);
  const html = await res.text();
  assert(html.indexOf('var BOOT = {') >= 0, 'ฝัง BOOT');
  assert(html.indexOf("postJson('/api'") >= 0, 'มีตัวเชื่อม google.script.run');
  assert(html.indexOf("'/api/ticket'") >= 0, 'ไฟล์แนบขอใบอนุญาตก่อนส่งตรงไป Apps Script');
  assert(html.indexOf('"page":"form"') >= 0);
  assert(html.indexOf('<?') < 0, 'ไม่มีแท็กเทมเพลตตกค้าง');
  eq(res.headers.get('referrer-policy'), 'no-referrer');
});

test('เรียกได้เฉพาะ api* ฟังก์ชันภายในหรือฟังก์ชันตั้งค่าเรียกไม่ได้', async () => {
  const { cf } = await paired();
  for (const fn of ['createAdmin_', 'setupSystem', 'workerTick', 'doPost', 'apiBridgeFailover', 'eval', 'constructor', '__proto__']) {
    const r = await cf.api(fn, 'x@y.z', 'n', 'password123');
    eq(r.ok, false, fn + ' ต้องเรียกไม่ได้');
  }
});

test('สิทธิ์เจ้าหน้าที่ยังบังคับเหมือนเดิม', async () => {
  const { cf } = await paired();
  const r = await cf.api('apiAdminList', 'token-ปลอม', {});
  eq(r.ok, false);
  eq(r.code, 'AUTH');
});

test('คำสั่งพร้อมกันหลายคำสั่ง (อัปโหลดหลายไฟล์พร้อมกัน) นับไฟล์ถูกต้อง', async () => {
  const { cf, gas } = await paired();
  const sub = await cf.api('apiSubmitRequest', payload());
  const ups = await Promise.all([1, 2, 3, 4].map((i) => cf.api('apiUploadFile', sub.data.jobId, sub.data.trackToken, fileArg('f' + i + '.pdf', 'x' + i))));
  ups.forEach((u) => eq(u.ok, true, u.error));
  await cf.api('apiFinalizeRequest', sub.data.jobId, sub.data.trackToken);
  await cf.obj.deliver();
  eq(String(gas.ctx.getRequest_(sub.data.jobId).attachmentCount), '4');
  await assertSame(cf, 'หลังอัปโหลดพร้อมกัน');
});

/* ================================================================== ตัวรัน */
(async () => {
  for (const item of queue) {
    if (item.group) { currentGroup = item.group; console.log('\n\x1b[1m' + item.group + '\x1b[0m'); continue; }
    try {
      await item.fn();
      passed++;
      console.log('  \x1b[32m✓\x1b[0m ' + item.name);
    } catch (err) {
      failed++;
      failures.push({ group: currentGroup, name: item.name, err });
      console.log('  \x1b[31m✗\x1b[0m ' + item.name);
    }
  }
  console.log('\n' + '='.repeat(62));
  if (failed === 0) console.log('\x1b[32m\x1b[1m  Cloudflare ผ่านทั้งหมด ' + passed + ' การทดสอบ\x1b[0m');
  else {
    console.log('\x1b[31m\x1b[1m  Cloudflare ผ่าน ' + passed + ' / ไม่ผ่าน ' + failed + '\x1b[0m');
    for (const f of failures) {
      console.log('\n  \x1b[31m' + f.group + ' → ' + f.name + '\x1b[0m');
      console.log('  ' + (f.err.stack || f.err.message).split('\n').slice(0, 6).join('\n  '));
    }
  }
  console.log('='.repeat(62) + '\n');
  globalThis.fetch = realFetch;
  process.exit(failed === 0 ? 0 : 1);
})();
