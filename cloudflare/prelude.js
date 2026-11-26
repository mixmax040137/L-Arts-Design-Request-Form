/* =====================================================================
   prelude.js — บริการของ Google จำลองบน Cloudflare
   วางไว้ "ก่อน" โค้ด .gs ทั้งหมด ภายในฟังก์ชัน createApp(HOST) (ดู build.js)

   หลักการ: โค้ดของระบบ (apps-script/*.gs) ไม่รู้ว่าตัวเองรันอยู่ที่ไหน
   - Google Sheets   → ตารางในหน่วยความจำที่ HOST โหลด/บันทึกลง SQLite ของ Durable Object
                       ตีความค่าแบบเดียวกับ Sheets จริง (และเหมือน tests/mock-gas.js)
   - Properties/Cache → ตารางใน SQLite (บันทึกพร้อมข้อมูลเมื่อคำสั่งจบ)
   - อีเมล            → เข้าคิว ส่งให้ Apps Script ส่งแทน
   - Google Drive     → งานที่ต้องรู้ผลทันที (สร้างโฟลเดอร์/ไฟล์ ตรวจสถานะ) ขอผลจาก Apps Script ผ่าน HOST.io
                       งานที่ไม่ต้องรอผล (ตั้งชื่อ แชร์ ลบ) เข้าคิว
   - UrlFetchApp      → HOST.io (fetch จริงจาก Cloudflare)
   HOST.io ทำงานแบบ "รันซ้ำพร้อมผลที่ได้มา": ครั้งแรกที่ต้องการผล ระบบหยุดคำสั่งนั้น ทิ้งการเปลี่ยนแปลง
   ไปขอผลแบบ async แล้วรันคำสั่งเดิมใหม่ทั้งคำสั่ง รอบใหม่ได้ผลทันที (ดู server.mjs runCall)
   ===================================================================== */

/* ---------- Date ที่ "เวลาท้องถิ่น" เป็นเวลาไทย ----------
   Apps Script ตั้งเขตเวลาของสคริปต์เป็น Asia/Bangkok แต่เครื่องของ Cloudflare เป็น UTC
   ถ้าใช้ Date ธรรมดา ช่วงตี 0–7 ของไทย "วันนี้" จะเป็นเมื่อวาน
   ประเทศไทยไม่มีเวลาออมแสง จึงเลื่อนคงที่ +7 ชั่วโมงได้ตลอด
   (ดัดแปลงจากระบบ The M Corner AP ซึ่งใช้งานจริงบน Cloudflare แล้ว) */
var Date = (function (N) {
  var OFF = 7 * 3600 * 1000;
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
  function fromLocal(y, mo, d, h, mi, s, ms) { return N.UTC(y, mo, d, h, mi, s, ms) - OFF; }
  function parse(s) {
    var m = String(s).trim().match(LOCAL_ISO);
    // วันที่อย่างเดียว (yyyy-MM-dd) ใน JS มาตรฐานคือเวลา UTC แต่ Apps Script ก็เป็น UTC เช่นกัน
    // จึงคงพฤติกรรมเดิม: มีเวลา = เวลาไทย, ไม่มีเวลา = ตามมาตรฐาน
    if (m && m[4] !== undefined) {
      return fromLocal(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +((m[7] || '0') + '00').slice(0, 3));
    }
    return N.parse(s);
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  class BkkDate extends N {
    constructor() {
      var a = arguments;
      if (a.length === 0) super();
      else if (a.length === 1) {
        var v = a[0];
        if (typeof v === 'string') super(parse(v));
        else super(v instanceof N ? v.getTime() : v);
      } else {
        super(fromLocal(+a[0], +a[1], a.length > 2 ? +a[2] : 1, +(a[3] || 0), +(a[4] || 0), +(a[5] || 0), +(a[6] || 0)));
      }
    }
    _l() { return new N(this.getTime() + OFF); }
    getFullYear() { return this._l().getUTCFullYear(); }
    getMonth() { return this._l().getUTCMonth(); }
    getDate() { return this._l().getUTCDate(); }
    getDay() { return this._l().getUTCDay(); }
    getHours() { return this._l().getUTCHours(); }
    getMinutes() { return this._l().getUTCMinutes(); }
    getSeconds() { return this._l().getUTCSeconds(); }
    getMilliseconds() { return this._l().getUTCMilliseconds(); }
    getYear() { return this.getFullYear() - 1900; }
    getTimezoneOffset() { return -420; }
    _set(i, args) {
      if (isNaN(this.getTime())) return NaN;
      var l = this._l();
      var c = [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), l.getUTCHours(), l.getUTCMinutes(), l.getUTCSeconds(), l.getUTCMilliseconds()];
      for (var k = 0; k < args.length && i + k < 7; k++) c[i + k] = +args[k];
      return this.setTime(N.UTC(c[0], c[1], c[2], c[3], c[4], c[5], c[6]) - OFF);
    }
    setFullYear() { return this._set(0, arguments); }
    setMonth() { return this._set(1, arguments); }
    setDate() { return this._set(2, arguments); }
    setHours() { return this._set(3, arguments); }
    setMinutes() { return this._set(4, arguments); }
    setSeconds() { return this._set(5, arguments); }
    setMilliseconds() { return this._set(6, arguments); }
    toDateString() {
      if (isNaN(this.getTime())) return 'Invalid Date';
      var l = this._l();
      return DAY[l.getUTCDay()] + ' ' + MON[l.getUTCMonth()] + ' ' + p2(l.getUTCDate()) + ' ' + String(l.getUTCFullYear()).padStart(4, '0');
    }
    toTimeString() {
      if (isNaN(this.getTime())) return 'Invalid Date';
      var l = this._l();
      return p2(l.getUTCHours()) + ':' + p2(l.getUTCMinutes()) + ':' + p2(l.getUTCSeconds()) + ' GMT+0700 (Indochina Time)';
    }
    toString() { return isNaN(this.getTime()) ? 'Invalid Date' : this.toDateString() + ' ' + this.toTimeString(); }
    static parse(s) { return parse(s); }
  }
  return BkkDate;
})(globalThis.Date);

var Logger = { log: function () { console.log.apply(console, arguments); } };

/* ---------- ไบต์และ SHA-256 แบบทำงานทันที (crypto.subtle เป็นแบบรอผล ใช้กับโค้ดเดิมไม่ได้) ---------- */

var CF_ENC = new TextEncoder();
var CF_DEC = new TextDecoder();

/** ข้อความ หรือ array ไบต์แบบมีเครื่องหมาย (-128..127 เหมือน Google) → Uint8Array */
function cfBytes(v) {
  if (v === null || v === undefined) return new Uint8Array(0);
  if (typeof v === 'string') return CF_ENC.encode(v);
  if (v instanceof Uint8Array) return v;
  if (v instanceof Int8Array) return new Uint8Array(v.buffer, v.byteOffset, v.length);
  if (v && v._staged) throw new Error('ไฟล์ที่อัปโหลดแล้วอ่านเนื้อหาบน Cloudflare ไม่ได้');
  var out = new Uint8Array(v.length);
  for (var i = 0; i < v.length; i++) out[i] = v[i] & 255;
  return out;
}

/** Uint8Array → แบบที่ Google คืน (ไบต์มีเครื่องหมาย) */
function cfSigned(u8) { return new Int8Array(u8.buffer, u8.byteOffset, u8.length); }

var CF_K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,
  0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
  0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,
  0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,
  0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
var CF_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
var CF_W = new Int32Array(64);

/** บีบอัดหนึ่งบล็อก (64 ไบต์ เริ่มที่ off) ลงใน state h (Int32Array ยาว 8) */
function cfCompress(h, bytes, off) {
  var W = CF_W, i;
  for (i = 0; i < 16; i++) {
    var j = off + i * 4;
    W[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
  }
  for (i = 16; i < 64; i++) {
    var a0 = W[i - 15], a1 = W[i - 2];
    var s0 = ((a0 >>> 7) | (a0 << 25)) ^ ((a0 >>> 18) | (a0 << 14)) ^ (a0 >>> 3);
    var s1 = ((a1 >>> 17) | (a1 << 15)) ^ ((a1 >>> 19) | (a1 << 13)) ^ (a1 >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (i = 0; i < 64; i++) {
    var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + CF_K[i] + W[i]) | 0;
    var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

/** SHA-256 ต่อจาก state ที่มีอยู่ (prefixLen = จำนวนไบต์ที่บีบอัดไปแล้ว) */
function cfSha256From(state, prefixLen, msg) {
  var h = new Int32Array(state);
  var len = msg.length, total = prefixLen + len;
  var full = len - (len % 64), off;
  for (off = 0; off < full; off += 64) cfCompress(h, msg, off);
  var rest = len - full;
  var tail = new Uint8Array(rest + 9 > 64 ? 128 : 64);
  tail.set(msg.subarray(full));
  tail[rest] = 0x80;
  var bits = total * 8, tl = tail.length;
  tail[tl - 1] = bits & 255; tail[tl - 2] = (bits >>> 8) & 255; tail[tl - 3] = (bits >>> 16) & 255; tail[tl - 4] = (bits >>> 24) & 255;
  var hi = Math.floor(total / 0x20000000);
  tail[tl - 5] = hi & 255; tail[tl - 6] = (hi >>> 8) & 255; tail[tl - 7] = (hi >>> 16) & 255; tail[tl - 8] = (hi >>> 24) & 255;
  for (off = 0; off < tl; off += 64) cfCompress(h, tail, off);
  var out = new Uint8Array(32);
  for (var i = 0; i < 8; i++) {
    out[i * 4] = h[i] >>> 24; out[i * 4 + 1] = (h[i] >>> 16) & 255; out[i * 4 + 2] = (h[i] >>> 8) & 255; out[i * 4 + 3] = h[i] & 255;
  }
  return out;
}
function cfSha256(msg) { return cfSha256From(CF_IV, 0, msg); }

/** HMAC-SHA256 จำ state ของกุญแจไว้ (แฮชรหัสผ่านวน 2,000 รอบด้วยกุญแจเดิม จึงเร็วขึ้นมาก) */
var CF_HMAC_KEYS = new Map();
function cfHmac(keyBytes, msgBytes) {
  var cacheKey = Array.prototype.join.call(keyBytes, ',');
  var st = CF_HMAC_KEYS.get(cacheKey);
  if (!st) {
    var k = keyBytes.length > 64 ? cfSha256(keyBytes) : keyBytes;
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { var b = i < k.length ? k[i] : 0; ipad[i] = b ^ 0x36; opad[i] = b ^ 0x5c; }
    var hi = new Int32Array(CF_IV), ho = new Int32Array(CF_IV);
    cfCompress(hi, ipad, 0); cfCompress(ho, opad, 0);
    st = { i: hi, o: ho };
    if (CF_HMAC_KEYS.size > 50) CF_HMAC_KEYS.clear();
    CF_HMAC_KEYS.set(cacheKey, st);
  }
  return cfSha256From(st.o, 64, cfSha256From(st.i, 64, msgBytes));
}

/* ---------- base64 ---------- */
function cfB64Encode(u8) {
  var s = '';
  for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function cfB64Decode(str) {
  var bin = atob(String(str).replace(/[\r\n\s]/g, ''));   // ข้อมูลเสียจะโยน error เหมือน Google
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * ไฟล์ที่ Worker ส่งไปพักไว้บน Drive ก่อนแล้ว (ข้อความ "staged:<fileId>:<ขนาด>")
 * โค้ดเดิมใช้แค่ .length กับส่งต่อให้ createFile จึงไม่ต้องถือข้อมูลไฟล์ไว้ใน Durable Object
 */
function cfStagedBytes(text) {
  // ตรวจสิทธิ์ก่อนอัปโหลด: รันคำสั่งจริงจนถึงจุดอ่านไฟล์ ได้ขนาดตามที่แจ้ง (Durable Object ไม่บันทึกผลรอบนี้)
  var pm = /^precheck:(\d+)$/.exec(String(text));
  if (pm) {
    if (!HOST.precheck()) throw new Error('ข้อมูลไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ใหม่แล้วลองอีกครั้ง');
    HOST.precheckDecoded();
    return { _precheck: true, length: +pm[1] };
  }
  var m = /^staged:([A-Za-z0-9_-]+):(\d+):([0-9a-f]{32})$/.exec(String(text));
  if (!m) return null;
  // ตรวจลายมือชื่อที่ Worker ลงไว้ (คนภายนอกปลอมใบรับไฟล์เพื่อย้ายไฟล์อื่นบน Drive ไม่ได้)
  var key = HOST.stagedKey();
  var mac = cfHmac(CF_ENC.encode(key), CF_ENC.encode(m[1] + ':' + m[2]));
  var want = '';
  for (var i = 0; i < 16; i++) want += (mac[i] < 16 ? '0' : '') + mac[i].toString(16);
  if (!key || want !== m[3]) throw new Error('ใบรับไฟล์ไม่ถูกต้อง');
  return { _staged: m[1], length: +m[2] };
}

function cfBlob(bytes, type, name) {
  var b = {
    _bytes: bytes,
    _type: type || 'application/octet-stream',
    _name: name || 'blob',
    getName: function () { return b._name; },
    setName: function (n) { b._name = String(n); return b; },
    getContentType: function () { return b._type; },
    setContentType: function (t) { b._type = String(t); return b; },
    getBytes: function () { return cfSigned(cfBytes(b._bytes)); },
    getDataAsString: function () { return CF_DEC.decode(cfBytes(b._bytes)); }
  };
  return b;
}

function cfFormatDate(d, tz, pattern) {
  if (Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) throw new Error('formatDate: วันที่ไม่ถูกต้อง');
  // Date ทั้งระบบเป็นเวลาไทยอยู่แล้ว (APP.TIMEZONE เป็น Asia/Bangkok เสมอ)
  if (tz && tz !== 'Asia/Bangkok') throw new Error('รองรับเฉพาะเขตเวลา Asia/Bangkok');
  var x = d instanceof Date ? d : new Date(d.getTime());
  var p = function (n, l) { return String(n).padStart(l, '0'); };
  var map = {
    yyyy: x.getFullYear(), MM: p(x.getMonth() + 1, 2), dd: p(x.getDate(), 2),
    HH: p(x.getHours(), 2), mm: p(x.getMinutes(), 2), ss: p(x.getSeconds(), 2),
    M: x.getMonth() + 1, d: x.getDate()
  };
  return String(pattern).replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, function (t) { return map[t]; });
}

var Utilities = {
  formatDate: cfFormatDate,
  getUuid: function () { return crypto.randomUUID(); },
  sleep: function () {},
  computeHmacSha256Signature: function (value, key) { return cfSigned(cfHmac(cfBytes(key), cfBytes(value))); },
  computeDigest: function (algo, value) {
    if (algo !== 'SHA_256') throw new Error('รองรับเฉพาะ SHA-256');
    return cfSigned(cfSha256(cfBytes(value)));
  },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  base64Encode: function (v) { return cfB64Encode(cfBytes(v)); },
  base64EncodeWebSafe: function (v) { return cfB64Encode(cfBytes(v)).replace(/\+/g, '-').replace(/\//g, '_'); },
  base64Decode: function (s) { return cfStagedBytes(s) || cfSigned(cfB64Decode(s)); },
  base64DecodeWebSafe: function (s) { return cfSigned(cfB64Decode(String(s).replace(/-/g, '+').replace(/_/g, '/'))); },
  newBlob: function (bytes, type, name) {
    if (bytes && bytes._precheck) HOST.precheckStop();
    return cfBlob(typeof bytes === 'string' ? CF_ENC.encode(bytes) : bytes, type, name);
  }
};

/* ---------- Google Sheets ---------- */

function cfIsDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

/**
 * ตีความค่าแบบที่ Google Sheets ทำเมื่อเขียนข้อความลงเซลล์ (เหมือน tests/mock-gas.js)
 * โค้ดของระบบใส่ ' นำหน้าค่าที่ต้องเป็นข้อความอยู่แล้ว (sheetValue_) ผลจึงตรงกับชีตจริง
 */
function cfParse(v) {
  if (v === null || v === undefined) return '';
  if (cfIsDate(v)) return new Date(v.getTime());
  if (typeof v !== 'string' || v === '') return v;
  if (v.charAt(0) === "'") return v.substring(1);
  if (/^[=@]/.test(v)) return '#NAME?';
  if (/^[+-]?[0-9]+(\.[0-9]+)?$/.test(v)) return Number(v);
  if (/^[+-]/.test(v)) return '#ERROR!';
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  return v;
}
function cfOut(v) { return v === undefined || v === null ? '' : (cfIsDate(v) ? new Date(v.getTime()) : v); }

function cfLastRow(grid) {
  for (var i = grid.length - 1; i >= 0; i--) {
    var row = grid[i];
    if (row && row.some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
  }
  return 0;
}

/** rec = { book, name, grid, maxRows } จาก HOST — แก้ grid แล้วแจ้ง HOST.touch */
function cfSheet(rec) {
  var grid = rec.grid;
  function touch() { HOST.touch(rec); }
  function maxRows() { return Math.max(rec.maxRows || 1000, grid.length); }
  function range(r, c, nr, nc) {
    nr = nr === undefined ? 1 : nr;
    nc = nc === undefined ? 1 : nc;
    if (r < 1 || c < 1 || nr < 0 || nc < 0) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    var rg = {
      getValues: function () {
        var out = [];
        for (var i = 0; i < nr; i++) {
          var src = grid[r - 1 + i] || [];
          var row = [];
          for (var j = 0; j < nc; j++) row.push(cfOut(src[c - 1 + j]));
          out.push(row);
        }
        return out;
      },
      getValue: function () { return rg.getValues()[0][0]; },
      getDisplayValues: function () { return rg.getValues().map(function (row) { return row.map(function (v) { return String(v); }); }); },
      setValues: function (values) {
        if (r - 1 + values.length > maxRows()) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        for (var i = 0; i < values.length; i++) {
          var t = r - 1 + i;
          while (grid.length <= t) grid.push([]);
          for (var j = 0; j < values[i].length; j++) {
            while (grid[t].length < c - 1 + j) grid[t].push('');
            grid[t][c - 1 + j] = cfParse(values[i][j]);
          }
        }
        touch();
        return rg;
      },
      setValue: function (v) { return rg.setValues([[v]]); },
      clearContent: function () {
        for (var i = 0; i < nr; i++) {
          var row = grid[r - 1 + i];
          if (!row) continue;
          for (var j = 0; j < nc; j++) if (c - 1 + j < row.length) row[c - 1 + j] = '';
        }
        touch();
        return rg;
      },
      getRow: function () { return r; },
      getColumn: function () { return c; },
      getNumRows: function () { return nr; },
      getNumColumns: function () { return nc; }
    };
    ['setFontWeight', 'setBackground', 'setFontColor', 'setNumberFormat', 'setWrap', 'setVerticalAlignment',
      'setHorizontalAlignment', 'setDataValidation', 'setFontSize'].forEach(function (k) { rg[k] = function () { return rg; }; });
    return rg;
  }
  var sh = {
    getName: function () { return rec.name; },
    getRange: range,
    getDataRange: function () { return range(1, 1, Math.max(1, cfLastRow(grid)), Math.max(1, sh.getLastColumn())); },
    getLastRow: function () { return cfLastRow(grid); },
    getLastColumn: function () {
      var m = 0;
      grid.forEach(function (row) {
        for (var j = row.length - 1; j >= 0; j--) {
          if (row[j] !== '' && row[j] !== null && row[j] !== undefined) { if (j + 1 > m) m = j + 1; break; }
        }
      });
      return m;
    },
    getMaxRows: maxRows,
    getMaxColumns: function () { return 26; },
    insertRowsAfter: function (after, n) { rec.maxRows = maxRows() + n; touch(); return sh; },
    appendRow: function (values) {
      var at = cfLastRow(grid);
      if (at + 1 > maxRows()) rec.maxRows = at + 1;
      while (grid.length <= at) grid.push([]);
      grid[at] = values.map(cfParse);
      touch();
      return sh;
    },
    deleteRow: function (r) { return sh.deleteRows(r, 1); },
    deleteRows: function (start, n) {
      var max = maxRows();
      // ข้อจำกัดเดียวกับ Sheets จริง (โค้ดของระบบเลี่ยงไว้แล้วด้วย deleteDataRows_)
      if (start + n - 1 > max) throw new Error('Those rows are out of bounds.');
      if (start <= 2 && n >= max - 1) throw new Error('Sorry, it is not possible to delete all non-frozen rows.');
      grid.splice(start - 1, n);
      rec.maxRows = max - n;
      touch();
      return sh;
    },
    clear: function () { grid.length = 0; touch(); return sh; },
    setFrozenRows: function () { return sh; },
    setColumnWidth: function () { return sh; },
    setColumnWidths: function () { return sh; },
    autoResizeColumns: function () { return sh; },
    hideSheet: function () { return sh; }
  };
  return sh;
}

function cfBook(id) {
  var book = {
    getId: function () { return id; },
    getName: function () { return HOST.bookName(id); },
    getUrl: function () { return /^cf-/.test(id) ? '' : 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },
    getSheetByName: function (name) {
      var rec = HOST.loadSheet(id, String(name));
      return rec ? cfSheet(rec) : null;
    },
    insertSheet: function (name) {
      if (HOST.loadSheet(id, String(name))) throw new Error('A sheet with the name "' + name + '" already exists.');
      return cfSheet(HOST.createSheet(id, String(name)));
    },
    getSheets: function () { return HOST.sheetNames(id).map(function (n) { return book.getSheetByName(n); }); },
    deleteSheet: function () { throw new Error('ลบชีตบน Cloudflare ไม่ได้'); },
    getOwner: function () { return null; }
  };
  return book;
}

var SpreadsheetApp = {
  openById: function (id) {
    var key = String(id || '');
    if (!key || !HOST.bookExists(key)) throw new Error('ไม่พบสเปรดชีต ' + key);
    return cfBook(key);
  },
  create: function (name) { return cfBook(HOST.createBook(String(name))); },
  getActiveSpreadsheet: function () { return cfBook(HOST.mainBookId()); },
  flush: function () {},
  getUi: function () { throw new Error('ไม่มีเมนูชีตบน Cloudflare'); }
};

/* ---------- Script Properties / Cache / Lock ---------- */

var PropertiesService = {
  getScriptProperties: function () {
    return {
      getProperty: function (k) { return HOST.getProp(String(k)); },
      setProperty: function (k, v) { HOST.setProp(String(k), String(v)); return this; },
      deleteProperty: function (k) { HOST.delProp(String(k)); return this; },
      getProperties: function () { return HOST.allProps(); },
      setProperties: function (obj) { for (var k in obj) HOST.setProp(k, String(obj[k])); return this; },
      getKeys: function () { return Object.keys(HOST.allProps()); }
    };
  }
};

var CacheService = {
  getScriptCache: function () {
    var c = {
      get: function (k) { return HOST.cacheGet(String(k)); },
      put: function (k, v, ttl) { HOST.cachePut(String(k), String(v), ttl === undefined ? 600 : +ttl); },
      remove: function (k) { HOST.cacheRemove(String(k)); },
      getAll: function (keys) { var o = {}; keys.forEach(function (k) { var v = c.get(k); if (v !== null) o[k] = v; }); return o; },
      putAll: function (obj, ttl) { for (var k in obj) c.put(k, obj[k], ttl); },
      removeAll: function (keys) { keys.forEach(c.remove); }
    };
    return c;
  }
};

/* Durable Object ทำงานทีละคำสั่ง (โค้ดของระบบไม่มีจุดรอ) จึงไม่มีใครแทรกกลางทาง ไม่ต้องล็อก */
var LockService = {
  getScriptLock: function () {
    return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {}, hasLock: function () { return true; } };
  }
};

/* ---------- บัญชีและที่อยู่ของระบบ ---------- */

var Session = {
  getEffectiveUser: function () { return { getEmail: function () { return HOST.getProp('OWNER_EMAIL') || ''; } }; },
  getActiveUser: function () { return { getEmail: function () { return ''; } }; },
  getScriptTimeZone: function () { return 'Asia/Bangkok'; }
};

/** ทริกเกอร์: งานตามเวลาทั้งหมดทำโดย alarm ของ Durable Object (server.mjs) เหลือแค่ "ทำครั้งเดียวในอีก x วินาที" */
var ScriptApp = {
  getService: function () { return { getUrl: function () { return HOST.origin(); } }; },
  getProjectTriggers: function () { return []; },
  deleteTrigger: function () {},
  newTrigger: function (handler) {
    var after = null;
    var b = {
      timeBased: function () { return b; },
      after: function (ms) { after = +ms; return b; },
      everyMinutes: function () { return b; }, everyHours: function () { return b; }, everyDays: function () { return b; },
      atHour: function () { return b; }, nearMinute: function () { return b; }, inTimezone: function () { return b; },
      create: function () {
        if (after !== null) HOST.schedule(String(handler), after);
        return { getHandlerFunction: function () { return handler; }, getUniqueId: function () { return 'cf'; } };
      }
    };
    return b;
  }
};

/* ---------- อีเมล: เข้าคิว ให้ Apps Script ส่งแทน (ส่งด้วยบัญชีเดิม ผู้รับเห็นผู้ส่งคนเดิม) ---------- */

var MailApp = {
  sendEmail: function (a, subject, body, opts) {
    var m = (a && typeof a === 'object') ? a : Object.assign({ to: a, subject: subject, body: body }, opts || {});
    var msg = {};
    ['to', 'cc', 'bcc', 'subject', 'body', 'htmlBody', 'name', 'replyTo', 'noReply'].forEach(function (k) {
      if (m[k] !== undefined && m[k] !== null && m[k] !== '') msg[k] = m[k];
    });
    if (!msg.to && !msg.cc && !msg.bcc) throw new Error('ไม่มีผู้รับอีเมล');
    HOST.enqueue({ t: 'mail', m: msg });
  },
  getRemainingDailyQuota: function () { return 1000; }
};
var GmailApp = { sendEmail: function () { return MailApp.sendEmail.apply(MailApp, arguments); } };

/* ---------- Google Drive ---------- */

var CF_MISSING = 'No item with the given ID could be found. Possibly because you have not edited this item or you do not have permission to access it.';

function cfFolder(id, info) {
  info = info || {};
  var f = {
    getId: function () { return id; },
    getUrl: function () { return info.url || 'https://drive.google.com/drive/folders/' + id; },
    getName: function () { return info.name || ''; },
    isTrashed: function () {
      var st = HOST.io('folderStatus', { id: id });
      if (!st.exists) throw new Error(CF_MISSING);
      return !!st.trashed;
    },
    setTrashed: function (v) { HOST.enqueue({ t: 'drive', a: 'trash', id: id, folder: true, v: !!v }); return f; },
    setDescription: function (d) { HOST.enqueue({ t: 'drive', a: 'describe', id: id, d: String(d) }); return f; },
    setName: function (n) { info.name = String(n); HOST.enqueue({ t: 'drive', a: 'rename', id: id, n: String(n) }); return f; },
    createFolder: function (name) {
      var r = HOST.io('createFolder', { parentId: id, name: String(name) });
      return cfFolder(r.id, { url: r.url, name: String(name) });
    },
    createFile: function (blob) {
      var b = blob && blob._bytes;
      var args = { folderId: id, name: blob.getName(), mime: blob.getContentType() };
      if (b && b._staged) args.staged = b._staged;
      else args.b64 = cfB64Encode(cfBytes(b));
      var r = HOST.io('createFile', args);
      return cfFile(r.id, { url: r.url, name: blob.getName(), size: b ? b.length : 0 });
    },
    getFoldersByName: function (name) {
      var list = HOST.io('findFolders', { parentId: id, name: String(name) }).map(function (x) { return cfFolder(x.id, x); });
      var i = 0;
      return { hasNext: function () { return i < list.length; }, next: function () { return list[i++]; } };
    },
    addFile: function (file) {
      // ไฟล์ที่สร้างบน Cloudflare (เช่น สเปรดชีตเก็บถาวร) ไม่ได้อยู่บน Drive
      if (!/^cf-/.test(file.getId())) HOST.enqueue({ t: 'drive', a: 'addFile', folderId: id, fileId: file.getId() });
      return f;
    }
  };
  return f;
}

function cfFile(id, info) {
  info = info || {};
  var f = {
    getId: function () { return id; },
    getUrl: function () { return info.url || 'https://drive.google.com/file/d/' + id + '/view'; },
    getName: function () { return info.name || ''; },
    getSize: function () { return info.size || 0; },
    isTrashed: function () {
      var st = HOST.io('fileStatus', { id: id });
      if (!st.exists) throw new Error(CF_MISSING);
      return !!st.trashed;
    },
    // Apps Script ลองแชร์แบบทุกคนที่มีลิงก์ก่อน ถ้าองค์กรไม่อนุญาตจะลดเป็นในโดเมนเอง
    setSharing: function () { HOST.enqueue({ t: 'drive', a: 'share', id: id }); return f; },
    setTrashed: function (v) { if (!/^cf-/.test(id)) HOST.enqueue({ t: 'drive', a: 'trash', id: id, v: !!v }); return f; },
    setDescription: function (d) { HOST.enqueue({ t: 'drive', a: 'describe', id: id, file: true, d: String(d) }); return f; },
    setName: function (n) { info.name = String(n); HOST.enqueue({ t: 'drive', a: 'rename', id: id, file: true, n: String(n) }); return f; }
  };
  return f;
}

var DriveApp = {
  Access: { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', DOMAIN: 'DOMAIN', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK', PRIVATE: 'PRIVATE' },
  Permission: { VIEW: 'VIEW', EDIT: 'EDIT', COMMENT: 'COMMENT' },
  getFolderById: function (id) {
    if (!id) throw new Error('Invalid argument: id');
    return cfFolder(String(id));
  },
  getFileById: function (id) {
    if (!id) throw new Error('Invalid argument: id');
    return cfFile(String(id));
  },
  getFoldersByName: function (name) { return cfFolder('').getFoldersByName(name); },
  createFolder: function (name) { return cfFolder('').createFolder(name); },
  getRootFolder: function () { return cfFolder(''); }
};

/* ---------- เรียกเว็บภายนอก (Claude API) ---------- */

var UrlFetchApp = {
  fetch: function (url, opts) {
    var o = opts || {};
    var headers = Object.assign({}, o.headers || {});
    if (o.contentType) headers['Content-Type'] = o.contentType;
    var r = HOST.io('fetch', {
      url: String(url),
      method: String(o.method || 'get').toUpperCase(),
      headers: headers,
      payload: o.payload === undefined ? null : (typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload))
    });
    if (!o.muteHttpExceptions && r.code >= 400) {
      throw new Error('Request failed for ' + url + ' returned code ' + r.code + '. Truncated server response: ' + String(r.text).slice(0, 200));
    }
    return {
      getResponseCode: function () { return r.code; },
      getContentText: function () { return r.text; },
      getHeaders: function () { return r.headers || {}; }
    };
  }
};

/* ---------- หน้าเว็บ: server.mjs ประกอบหน้าเอง เหลือแค่ให้ doGet() เดิมรันผ่าน ---------- */

var HtmlService = {
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
  SandboxMode: { IFRAME: 'IFRAME' },
  createTemplateFromFile: function (name) {
    var t = {
      _file: name,
      evaluate: function () {
        var out = {
          _template: t,
          setTitle: function () { return out; },
          addMetaTag: function () { return out; },
          setXFrameOptionsMode: function () { return out; },
          setSandboxMode: function () { return out; },
          setFaviconUrl: function () { return out; },
          getContent: function () { return ''; }
        };
        return out;
      }
    };
    return t;
  },
  createHtmlOutputFromFile: function () { return { getContent: function () { return ''; } }; },
  createHtmlOutput: function (html) {
    var out = { _html: String(html || ''), setTitle: function () { return out; }, addMetaTag: function () { return out; },
      setXFrameOptionsMode: function () { return out; }, getContent: function () { return out._html; } };
    return out;
  }
};
var ContentService = {
  MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
  createTextOutput: function (s) { var o = { _text: String(s), setMimeType: function () { return o; }, getContent: function () { return o._text; } }; return o; }
};
