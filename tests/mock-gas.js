/**
 * mock-gas.js — จำลองสภาพแวดล้อมของ Google Apps Script เพื่อรันโค้ดฝั่งเซิร์ฟเวอร์ด้วย Node
 * ใช้สำหรับทดสอบอัตโนมัติเท่านั้น ไม่ได้อัปโหลดขึ้น Apps Script
 */
'use strict';
const crypto = require('crypto');

/* ------------------------------------------------------------- Utilities */

function toSignedBytes(buf) {
  const out = new Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] > 127 ? buf[i] - 256 : buf[i];
  return out;
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  const buf = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
  return buf;
}

function pad(n, len) { return String(n).padStart(len, '0'); }

function formatDate(date, tz, format) {
  // ทดสอบภายใต้ TZ=Asia/Bangkok จึงใช้เวลาท้องถิ่นของ process ได้ตรง
  const map = {
    yyyy: date.getFullYear(),
    MM: pad(date.getMonth() + 1, 2),
    dd: pad(date.getDate(), 2),
    HH: pad(date.getHours(), 2),
    mm: pad(date.getMinutes(), 2),
    ss: pad(date.getSeconds(), 2),
    M: date.getMonth() + 1,
    d: date.getDate()
  };
  return String(format).replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, (t) => map[t]);
}

const Utilities = {
  formatDate,
  getUuid: () => crypto.randomUUID(),
  sleep: () => {},
  computeHmacSha256Signature: (value, key) =>
    toSignedBytes(crypto.createHmac('sha256', toBuffer(key)).update(toBuffer(value)).digest()),
  base64Encode: (v) => toBuffer(v).toString('base64'),
  base64EncodeWebSafe: (v) => toBuffer(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64Decode: (s) => toSignedBytes(Buffer.from(String(s), 'base64')),
  base64DecodeWebSafe: (s) =>
    toSignedBytes(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  newBlob: (bytes, type, name) => ({
    _buf: toBuffer(bytes),
    getDataAsString: function () { return this._buf.toString('utf8'); },
    getBytes: function () { return toSignedBytes(this._buf); },
    getName: () => name || 'blob',
    getContentType: () => type || 'application/octet-stream'
  })
};

/* ---------------------------------------------------------- Spreadsheet */

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col;
    this.numRows = numRows; this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr = [];
      const src = this.sheet._data[this.row - 1 + r] || [];
      for (let c = 0; c < this.numCols; c++) {
        const v = src[this.col - 1 + c];
        rowArr.push(v === undefined ? '' : v);
      }
      out.push(rowArr);
    }
    return out;
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const target = this.row - 1 + r;
      while (this.sheet._data.length <= target) this.sheet._data.push([]);
      for (let c = 0; c < values[r].length; c++) {
        this.sheet._data[target][this.col - 1 + c] = values[r][c];
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  getValue() { return this.getValues()[0][0]; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
}

class MockSheet {
  constructor(name) { this.name = name; this._data = []; }
  getName() { return this.name; }
  getRange(row, col, numRows, numCols) {
    return new MockRange(this, row, col, numRows === undefined ? 1 : numRows,
      numCols === undefined ? 1 : numCols);
  }
  getLastRow() {
    let last = 0;
    for (let i = 0; i < this._data.length; i++) {
      const row = this._data[i] || [];
      const has = row.some((v) => v !== '' && v !== null && v !== undefined);
      if (has) last = i + 1;
    }
    return last;
  }
  getLastColumn() {
    let max = 0;
    for (const row of this._data) if (row && row.length > max) max = row.length;
    return max;
  }
  appendRow(values) {
    this._data[this.getLastRow()] = values.slice();
    return this;
  }
  deleteRow(rowIndex) { this._data.splice(rowIndex - 1, 1); return this; }
  clear() { this._data = []; return this; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
}

class MockSpreadsheet {
  constructor(name, id) { this.name = name; this.id = id; this.sheets = []; }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(name) { return this.sheets.find((s) => s.name === name) || null; }
  insertSheet(name) { const s = new MockSheet(name); this.sheets.push(s); return s; }
  deleteSheet(sheet) { this.sheets = this.sheets.filter((s) => s !== sheet); }
}

/* ----------------------------------------------------------------- Drive */

let idSeq = 0;
const nextId = (prefix) => prefix + '_' + (++idSeq) + '_' + Math.random().toString(36).slice(2, 8);

class MockFile {
  constructor(name, blob, parent) {
    this.id = nextId('file');
    this.name = name;
    this.blob = blob;
    this.parents = parent ? [parent] : [];
    this.trashed = false;
    this.sharing = null;
    this.description = '';
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; }
  getSize() { return this.blob && this.blob._buf ? this.blob._buf.length : 0; }
  setSharing(access, permission) { this.sharing = { access, permission }; return this; }
  setTrashed(v) { this.trashed = v; return this; }
  setDescription(d) { this.description = d; return this; }
  isTrashed() { return this.trashed; }
  getParents() {
    let i = 0;
    const list = this.parents;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  }
}

class MockFolder {
  constructor(name, parent, registry) {
    this.id = nextId('folder');
    this.name = name;
    this.parent = parent || null;
    this.folders = [];
    this.files = [];
    this.trashed = false;
    this.description = '';
    this.registry = registry;
    registry.folders[this.id] = this;
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
  isTrashed() { return this.trashed; }
  setDescription(d) { this.description = d; return this; }
  createFolder(name) {
    const f = new MockFolder(name, this, this.registry);
    this.folders.push(f);
    return f;
  }
  createFile(blob) {
    const f = new MockFile(blob.getName(), blob, this);
    this.files.push(f);
    this.registry.files[f.id] = f;
    return f;
  }
  addFile(file) {
    if (this.files.indexOf(file) < 0) this.files.push(file);
    if (file.parents.indexOf(this) < 0) file.parents.push(this);
    return this;
  }
  getFoldersByName(name) {
    const list = this.folders.filter((f) => f.name === name && !f.trashed);
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  }
  getFilesByName(name) {
    const list = this.files.filter((f) => f.name === name && !f.trashed);
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  }
}

/* -------------------------------------------------------- สร้าง runtime */

function createRuntime(options) {
  const opts = options || {};
  const state = {
    props: {},
    cache: {},
    spreadsheets: {},
    drive: { folders: {}, files: {}, roots: [] },
    outbox: [],
    logs: [],
    triggers: [],
    fetches: [],
    fetchHandler: opts.fetchHandler || null,
    webAppUrl: opts.webAppUrl || 'https://script.google.com/macros/s/TESTDEPLOY/exec'
  };

  const SpreadsheetApp = {
    create(name) {
      const id = nextId('sheet');
      const book = new MockSpreadsheet(name, id);
      book.insertSheet('Sheet1');
      state.spreadsheets[id] = book;
      return book;
    },
    openById(id) {
      const book = state.spreadsheets[id];
      if (!book) throw new Error('Spreadsheet not found: ' + id);
      return book;
    }
  };

  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK', PRIVATE: 'PRIVATE' },
    Permission: { VIEW: 'VIEW', EDIT: 'EDIT' },
    createFolder(name) {
      const f = new MockFolder(name, null, state.drive);
      state.drive.roots.push(f);
      return f;
    },
    getFolderById(id) {
      const f = state.drive.folders[id];
      if (!f) throw new Error('Folder not found: ' + id);
      return f;
    },
    getFileById(id) {
      const f = state.drive.files[id];
      if (!f) throw new Error('File not found: ' + id);
      return f;
    },
    getFoldersByName(name) {
      const list = state.drive.roots.filter((f) => f.name === name && !f.trashed);
      let i = 0;
      return { hasNext: () => i < list.length, next: () => list[i++] };
    }
  };
  // ทำให้ไฟล์ที่สร้างในสเปรดชีตเรียกผ่าน DriveApp.getFileById ได้ด้วย
  const originalGetFileById = DriveApp.getFileById;
  DriveApp.getFileById = function (id) {
    if (state.spreadsheets[id]) {
      const book = state.spreadsheets[id];
      if (!state.drive.files[id]) {
        const fake = new MockFile(book.getName(), null, null);
        fake.id = id;
        state.drive.files[id] = fake;
      }
      return state.drive.files[id];
    }
    return originalGetFileById(id);
  };

  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (state.props[k] === undefined ? null : state.props[k]),
      setProperty: (k, v) => { state.props[k] = String(v); },
      deleteProperty: (k) => { delete state.props[k]; },
      getProperties: () => Object.assign({}, state.props)
    })
  };

  const CacheService = {
    getScriptCache: () => ({
      get: (k) => {
        const entry = state.cache[k];
        if (!entry) return null;
        if (entry.expires < Date.now()) { delete state.cache[k]; return null; }
        return entry.value;
      },
      put: (k, v, seconds) => {
        state.cache[k] = { value: String(v), expires: Date.now() + (seconds || 600) * 1000 };
      },
      remove: (k) => { delete state.cache[k]; }
    })
  };

  const LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {}, waitLock: () => {} })
  };

  const MailApp = {
    sendEmail(options) {
      state.outbox.push(JSON.parse(JSON.stringify(options)));
    },
    getRemainingDailyQuota: () => 1500
  };

  function makeTriggerBuilder(handler) {
    const trigger = { handler, type: null, config: {} };
    const builder = {
      timeBased: () => builder,
      everyMinutes: (n) => { trigger.config.everyMinutes = n; return builder; },
      everyDays: (n) => { trigger.config.everyDays = n; return builder; },
      atHour: (h) => { trigger.config.atHour = h; return builder; },
      after: (ms) => { trigger.config.after = ms; return builder; },
      inTimezone: (tz) => { trigger.config.tz = tz; return builder; },
      create: () => {
        const t = {
          getHandlerFunction: () => handler,
          getUniqueId: () => nextId('trigger'),
          _config: trigger.config
        };
        state.triggers.push(t);
        return t;
      }
    };
    return builder;
  }

  const ScriptApp = {
    newTrigger: (handler) => makeTriggerBuilder(handler),
    getProjectTriggers: () => state.triggers.slice(),
    deleteTrigger: (t) => { state.triggers = state.triggers.filter((x) => x !== t); },
    getService: () => ({ getUrl: () => state.webAppUrl })
  };

  const UrlFetchApp = {
    fetch(url, params) {
      state.fetches.push({ url, params });
      if (state.fetchHandler) return state.fetchHandler(url, params);
      return {
        getResponseCode: () => 500,
        getContentText: () => '{"error":"no mock handler"}'
      };
    }
  };

  const HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    createTemplateFromFile: (name) => ({
      _name: name,
      evaluate: function () {
        return {
          setTitle: function () { return this; },
          addMetaTag: function () { return this; },
          setXFrameOptionsMode: function () { return this; },
          getContent: () => '<html data-template="' + name + '"></html>'
        };
      }
    }),
    createHtmlOutputFromFile: (name) => ({ getContent: () => '<!-- ' + name + ' -->' })
  };

  const Logger = { log: (msg) => state.logs.push(String(msg)) };
  const Session = {
    getActiveUser: () => ({ getEmail: () => '' }),
    getScriptTimeZone: () => 'Asia/Bangkok'
  };

  return {
    state,
    globals: {
      SpreadsheetApp, DriveApp, PropertiesService, CacheService, LockService,
      MailApp, ScriptApp, UrlFetchApp, HtmlService, Utilities, Logger, Session,
      console: {
        log: (...a) => state.logs.push(a.join(' ')),
        error: (...a) => state.logs.push('ERROR ' + a.join(' ')),
        warn: (...a) => state.logs.push('WARN ' + a.join(' '))
      }
    }
  };
}

module.exports = { createRuntime, Utilities, MockSheet, MockSpreadsheet };
