/**
 * 15_Bridge.gs — เชื่อมกับระบบหลักบน Cloudflare
 *
 * เมื่อจับคู่แล้ว (หน้า /setup ของ Cloudflare) Apps Script จะเป็น "ระบบสำรอง":
 *  - รับสำเนาทุกการเปลี่ยนแปลงจาก Cloudflare มาเขียนลงชีตเดิม เปิด Google Sheets ดูข้อมูลได้เหมือนเดิมเสมอ
 *  - ส่งอีเมลและจัดการไฟล์บน Google Drive แทน Cloudflare (ใช้บัญชี pr@arts.tu.ac.th เหมือนเดิม)
 *  - ลิงก์ Apps Script เดิม (เช่นลิงก์ติดตามในอีเมลเก่า) พาไปหน้าเดียวกันบน Cloudflare ให้เอง
 *  - หน้าเว็บและงานตามเวลาของ Apps Script หยุดเขียนข้อมูล เพื่อไม่ให้ข้อมูลสองฝั่งแยกกัน
 *
 * ถ้า Cloudflare ใช้งานไม่ได้ ผู้ดูแลระบบเปิด <ลิงก์ Apps Script>?page=failover
 * แล้วเข้าสู่ระบบ Apps Script จะกลับมาเป็นระบบหลักทันทีด้วยข้อมูลล่าสุดที่ได้รับ
 *
 * ทุกคำขอจาก Cloudflare (ยกเว้นการจับคู่ซึ่งใช้บัญชีผู้ดูแลระบบ) ต้องมีรหัสลับร่วมที่สร้างตอนจับคู่
 */

var BRIDGE = {
  SECRET: 'BRIDGE_SECRET',
  PENDING_SECRET: 'BRIDGE_PENDING_SECRET',
  PENDING_URL: 'BRIDGE_PENDING_URL',
  CF_URL: 'BRIDGE_CF_URL',
  MODE: 'BRIDGE_MODE',
  PAIRED_AT: 'BRIDGE_PAIRED_AT',
  LAST_CF_URL: 'BRIDGE_LAST_CF_URL',
  STAGING_FOLDER_ID: 'BRIDGE_STAGING_FOLDER_ID'
};

/** ค่าที่แต่ละฝั่งเก็บของตัวเอง ไม่รับทับจาก Cloudflare */
var BRIDGE_LOCAL_PROPS = ['SPREADSHEET_ID', 'ARCHIVE_SPREADSHEET_ID', 'WEBAPP_URL'];
var BRIDGE_MAX_FILE_BYTES = 30 * 1024 * 1024;
var BRIDGE_STAGING_HOURS = 24;

/** Cloudflare เป็นระบบหลักอยู่ (Apps Script เป็นสำรอง) */
function isBackupMode_() {
  return getProp_(BRIDGE.MODE) === 'backup' && !!getProp_(BRIDGE.CF_URL) && !!getProp_(BRIDGE.SECRET);
}

function bridgeCfUrl_() {
  return str_(getProp_(BRIDGE.CF_URL)).replace(/\/+$/, '');
}

/* ------------------------------------------------------------ รับคำขอจาก Cloudflare */

/** จุดรับคำขอจาก Cloudflare (เว็บแอปเดิม ใช้ POST) */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
  } catch (err) {
    body = {};
  }
  var out;
  try {
    out = bridgeHandle_(body);
  } catch (err) {
    console.error('bridge: ' + (err && err.stack || err));
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function bridgeHandle_(b) {
  var op = str_(b.op);
  if (op === 'pair') return bridgePair_(b);
  // เบราว์เซอร์ของผู้ใช้ส่งไฟล์มาตรงพร้อมใบอนุญาตจาก Cloudflare (ไม่มีรหัสลับ)
  if (op === 'upload') return bridgeUpload_(b);

  var active = getProp_(BRIDGE.SECRET);
  var pending = getProp_(BRIDGE.PENDING_SECRET);
  var secret = str_(b.secret);
  var isActive = !!active && timingSafeEqual_(secret, active);
  var isPending = !!pending && timingSafeEqual_(secret, pending);

  // ระหว่างจับคู่ใช้ได้แค่ดึงข้อมูลกับยืนยัน
  if (isPending && (op === 'export' || op === 'activate')) {
    return op === 'export' ? bridgeExport_() : bridgeActivate_();
  }
  if (!isActive) {
    return { ok: false, code: 'NOT_PAIRED', error: 'Apps Script ไม่ได้เชื่อมกับ Cloudflare นี้แล้ว (อาจกลับมาใช้ Apps Script เป็นหลัก) ' +
      'ผู้ดูแลระบบจับคู่ใหม่ได้ที่หน้า /setup ของ Cloudflare' };
  }
  if (op === 'export') return bridgeExport_();
  if (op === 'batch') return bridgeBatch_(Array.isArray(b.ops) ? b.ops : []);
  if (op === 'io') return bridgeIo_(str_(b.kind), b.args || {});
  if (op === 'stage') return bridgeStage_(b);
  if (op === 'status') return { ok: true, mode: getProp_(BRIDGE.MODE), version: APP.VERSION };
  return { ok: false, error: 'ไม่รู้จักคำสั่ง ' + op };
}

/** แจ้ง Cloudflare ว่าเลิกเชื่อมกันแล้ว คืน true เมื่อ Cloudflare รับทราบ */
function bridgeTellDetach_(cfUrl, secret) {
  if (!cfUrl || !secret) return false;
  try {
    var res = UrlFetchApp.fetch(String(cfUrl).replace(/\/+$/, '') + '/setup/detach', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ secret: secret }),
      muteHttpExceptions: true,
      followRedirects: false
    });
    if (res.getResponseCode() !== 200) return false;
    var data = JSON.parse(res.getContentText());
    return !!(data && data.ok);
  } catch (err) {
    return false;
  }
}

/** ตรวจบัญชีผู้ดูแลระบบ (นับครั้งที่ผิดและล็อกชั่วคราวเหมือนหน้าเข้าสู่ระบบ) */
function bridgeCheckAdmin_(email, password) {
  var res = login_(email, password);
  if (res.user.role !== 'admin') throw appError_('ต้องใช้บัญชีผู้ดูแลระบบเท่านั้น');
  return res.user;
}

/** ขั้นที่ 1 ของการจับคู่: ตรวจบัญชีผู้ดูแลระบบ แล้วออกรหัสลับร่วม (ยังไม่เปลี่ยนโหมด) */
function bridgePair_(b) {
  var cfUrl = str_(b.cfUrl).replace(/\/+$/, '');
  var okUrl = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(cfUrl) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cfUrl);
  if (!okUrl) return { ok: false, error: 'ที่อยู่ของ Cloudflare ไม่ถูกต้อง' };
  bridgeCheckAdmin_(b.email, b.password);
  var secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  setProp_(BRIDGE.PENDING_SECRET, secret);
  setProp_(BRIDGE.PENDING_URL, cfUrl);
  return { ok: true, secret: secret, version: APP.VERSION, sheetUrl: ss_().getUrl() };
}

/** ขั้นที่ 3 ของการจับคู่: Cloudflare ย้ายข้อมูลสำเร็จแล้ว เปลี่ยนเป็นระบบสำรอง */
function bridgeActivate_() {
  return withLock_(function () {
    var pending = getProp_(BRIDGE.PENDING_SECRET);
    var url = getProp_(BRIDGE.PENDING_URL);
    if (!pending || !url) return { ok: false, error: 'ไม่พบการจับคู่ที่รอยืนยัน กรุณาเริ่มจับคู่ใหม่' };
    setProp_(BRIDGE.SECRET, pending);
    setProp_(BRIDGE.CF_URL, url);
    setProp_(BRIDGE.MODE, 'backup');
    setProp_(BRIDGE.PAIRED_AT, nowIso_());
    props_().deleteProperty(BRIDGE.PENDING_SECRET);
    props_().deleteProperty(BRIDGE.PENDING_URL);
    return { ok: true, sheetUrl: ss_().getUrl() };
  });
}

/** ค่าในเซลล์ → JSON (วันที่ส่งเป็นตัวเลขเวลา เพื่อไม่ให้เพี้ยนเรื่องเขตเวลา) */
function bridgeOut_(v) {
  return isDateLike_(v) ? { $d: v.getTime() } : v;
}
function bridgeIn_(v) {
  if (v && typeof v === 'object' && v.$d !== undefined) return new Date(v.$d);
  if (v === null || v === undefined) return '';
  return sheetValue_(v);
}

function bridgeGrid_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  return sh.getRange(1, 1, lastRow, lastCol).getValues().map(function (row) { return row.map(bridgeOut_); });
}

/** ข้อมูลทั้งหมด (ใช้ตอนจับคู่ และตอนตรวจเทียบข้อมูลสองฝั่ง) */
function bridgeExport_() {
  ownerEmail_(); // จำอีเมลเจ้าของระบบไว้ใน Script Properties ให้ Cloudflare ใช้ต่อ
  var book = ss_();
  var main = {};
  book.getSheets().forEach(function (sh) { main[sh.getName()] = bridgeGrid_(sh); });
  var archive = null;
  var ab = archiveBook_(false);
  if (ab) {
    archive = { id: ab.getId(), sheets: {} };
    ab.getSheets().forEach(function (sh) { archive.sheets[sh.getName()] = bridgeGrid_(sh); });
  }
  var all = props_().getProperties();
  var props = {};
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('BRIDGE_') !== 0) props[k] = all[k];
  });
  return {
    ok: true,
    version: APP.VERSION,
    mainId: book.getId(),
    sheetUrl: book.getUrl(),
    main: main,
    archive: archive,
    archiveUrl: ab ? archiveUrl_() : '',
    props: props
  };
}

function bridgeBook_(kind) {
  return kind === 'archive' ? archiveBook_(true) : ss_();
}

function bridgeSheet_(book, name) {
  return book.getSheetByName(name) || book.insertSheet(name);
}

/** เขียนแถวต่อเนื่องหนึ่งช่วง (start นับจาก 0 = แถวหัวตาราง) */
function bridgeRows_(op) {
  var rows = Array.isArray(op.rows) ? op.rows : [];
  if (rows.length === 0) return;
  var sh = bridgeSheet_(bridgeBook_(op.b), str_(op.s));
  var width = 1;
  rows.forEach(function (r) { if (r && r.length > width) width = r.length; });
  var values = rows.map(function (r) {
    var out = [];
    for (var c = 0; c < width; c++) out.push(bridgeIn_(r ? r[c] : ''));
    return out;
  });
  var start = int_(op.start) + 1;
  var needRows = start + values.length - 1 - sh.getMaxRows();
  if (needRows > 0) sh.insertRowsAfter(sh.getMaxRows(), needRows);
  if (typeof sh.getMaxColumns === 'function' && typeof sh.insertColumnsAfter === 'function') {
    var needCols = width - sh.getMaxColumns();
    if (needCols > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needCols);
  }
  sh.getRange(start, 1, values.length, width).setValues(values);
}

/** ชีตฝั่ง Cloudflare สั้นลง (ลบแถว) ล้างแถวท้ายที่เกินออก */
function bridgeTrunc_(op) {
  var sh = bridgeSheet_(bridgeBook_(op.b), str_(op.s));
  var keep = int_(op.n);
  var last = sh.getLastRow();
  if (last <= keep) return;
  sh.getRange(keep + 1, 1, last - keep, Math.max(1, sh.getLastColumn())).clearContent();
}

function bridgeProp_(op) {
  var k = str_(op.k);
  if (!k || k.indexOf('BRIDGE_') === 0 || BRIDGE_LOCAL_PROPS.indexOf(k) >= 0) return;
  if (op.v === null || op.v === undefined) props_().deleteProperty(k);
  else setProp_(k, String(op.v));
}

/** งานบน Drive ที่ Cloudflare ไม่ต้องรอผล (ทำไม่สำเร็จก็ไม่ทำให้ทั้งชุดล้ม) */
function bridgeDrive_(op) {
  try {
    var a = str_(op.a);
    var folder = function () { return DriveApp.getFolderById(str_(op.id)); };
    var file = function () { return DriveApp.getFileById(str_(op.id)); };
    if (a === 'claimFolder') {
      var f = folder();
      f.setName(str_(op.n));
      f.setDescription(str_(op.d));
    } else if (a === 'describe') {
      (op.file ? file() : folder()).setDescription(str_(op.d));
    } else if (a === 'rename') {
      (op.file ? file() : folder()).setName(str_(op.n));
    } else if (a === 'trash') {
      (op.folder ? folder() : file()).setTrashed(op.v !== false);
    } else if (a === 'share') {
      shareFileSafely_(file());
    } else if (a === 'addFile') {
      DriveApp.getFolderById(str_(op.folderId)).addFile(DriveApp.getFileById(str_(op.fileId)));
    }
  } catch (err) {
    console.warn('bridge drive ' + op.a + ': ' + (err && err.message || err));
  }
}

/** รับชุดการเปลี่ยนแปลงจาก Cloudflare ตามลำดับ */
function bridgeBatch_(ops) {
  return withLock_(function () {
    var mailErrors = [];
    var touchedArchive = false;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i] || {};
      if (op.t === 'rows') { bridgeRows_(op); if (op.b === 'archive') touchedArchive = true; }
      else if (op.t === 'trunc') { bridgeTrunc_(op); if (op.b === 'archive') touchedArchive = true; }
      else if (op.t === 'prop') bridgeProp_(op);
      else if (op.t === 'drive') bridgeDrive_(op);
      else if (op.t === 'mail') {
        try {
          MailApp.sendEmail(op.m);
        } catch (err) {
          mailErrors.push({ to: str_(op.m && op.m.to), subject: str_(op.m && op.m.subject), error: String(err && err.message || err) });
        }
      }
    }
    _cache.settings = null;
    return { ok: true, applied: ops.length, mailErrors: mailErrors, archiveUrl: touchedArchive ? archiveUrl_() : '' };
  }, 60000);
}

/* ------------------------------------------------------------------ Drive แทน Cloudflare */

/** งานบน Drive ที่ Cloudflare ต้องรู้ผลทันที */
function bridgeIo_(kind, a) {
  var result;
  if (kind === 'folderStatus' || kind === 'fileStatus') {
    try {
      var item = kind === 'folderStatus' ? DriveApp.getFolderById(str_(a.id)) : DriveApp.getFileById(str_(a.id));
      result = { exists: true, trashed: item.isTrashed() };
    } catch (err) {
      result = { exists: false };
    }
  } else if (kind === 'findFolders') {
    var it = str_(a.parentId) ? DriveApp.getFolderById(str_(a.parentId)).getFoldersByName(str_(a.name))
      : DriveApp.getFoldersByName(str_(a.name));
    result = [];
    while (it.hasNext()) {
      var f = it.next();
      result.push({ id: f.getId(), url: f.getUrl(), name: f.getName() });
    }
  } else if (kind === 'createFolder') {
    var created = str_(a.parentId) ? DriveApp.getFolderById(str_(a.parentId)).createFolder(str_(a.name))
      : DriveApp.createFolder(str_(a.name));
    result = { id: created.getId(), url: created.getUrl() };
  } else if (kind === 'createFile') {
    var target = DriveApp.getFolderById(str_(a.folderId));
    var file;
    if (str_(a.staged)) {
      file = DriveApp.getFileById(str_(a.staged));
      file.moveTo(target);
      file.setName(str_(a.name));
    } else {
      file = target.createFile(Utilities.newBlob(Utilities.base64Decode(str_(a.b64)),
        str_(a.mime) || 'application/octet-stream', str_(a.name)));
    }
    result = { id: file.getId(), url: file.getUrl() };
  } else if (kind === 'spareFolders') {
    result = bridgeSpareFolders_(int_(a.count, 5));
  } else if (kind === 'cleanup') {
    result = { trashed: bridgeCleanupStaging_() };
  } else {
    return { ok: false, error: 'ไม่รู้จักงาน ' + kind };
  }
  return { ok: true, result: result };
}

/** โฟลเดอร์งานเปล่าที่เตรียมไว้ล่วงหน้า ผู้ขอจึงไม่ต้องรอ Drive ตอนยื่นคำขอ */
function bridgeSpareFolders_(count) {
  var parentId = getProp_(PROP.JOBS_FOLDER_ID);
  if (!parentId) throw appError_('ยังไม่ได้ติดตั้งโฟลเดอร์ระบบ');
  var parent = DriveApp.getFolderById(parentId);
  var out = [];
  for (var i = 0; i < Math.max(1, Math.min(count, 20)); i++) {
    var f = parent.createFolder('_ว่าง เตรียมไว้สำหรับคำขอถัดไป (ระบบ)');
    out.push({ id: f.getId(), url: f.getUrl() });
  }
  return out;
}

function bridgeStagingFolder_() {
  var root = null;
  var rootId = getProp_(PROP.ROOT_FOLDER_ID);
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch (err) { root = null; }
  }
  return ensureFolder_(root, '_พักไฟล์อัปโหลด (ระบบใช้ชั่วคราว)', BRIDGE.STAGING_FOLDER_ID);
}

/** พักไฟล์ที่ผู้ใช้อัปโหลดผ่าน Cloudflare ไว้ก่อน ระบบหลักตรวจแล้วจึงย้ายเข้าโฟลเดอร์งาน */
function bridgeStage_(b) {
  var bytes;
  try {
    bytes = Utilities.base64Decode(str_(b.b64));
  } catch (err) {
    return { ok: false, error: 'ไฟล์เสียหายหรืออ่านไม่ได้ กรุณาลองใหม่' };
  }
  if (bytes.length > BRIDGE_MAX_FILE_BYTES) return { ok: false, error: 'ไฟล์ใหญ่เกิน 30 MB' };
  return bridgeStageBytes_(bytes, b.name, b.mime);
}

function bridgeStageBytes_(bytes, name, mime) {
  var safe = safeFileName_(truncate_(str_(name) || 'file', 200));
  var file = bridgeStagingFolder_().createFile(
    Utilities.newBlob(bytes, str_(mime) || 'application/octet-stream', safe));
  return { ok: true, id: file.getId(), size: bytes.length };
}

/** ลายมือชื่อแบบเดียวกับที่ Cloudflare ใช้ (HMAC-SHA256 16 ไบต์แรก เป็นเลขฐานสิบหก) */
function bridgeSigHex_(secret, message) {
  var bytes = Utilities.computeHmacSha256Signature(String(message), String(secret));
  var out = '';
  for (var i = 0; i < 16; i++) {
    var v = (bytes[i] + 256) % 256;
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}

/**
 * รับไฟล์ตรงจากเบราว์เซอร์ (ไฟล์ใหญ่ไม่ต้องผ่าน Cloudflare ซึ่งจำกัดเวลาประมวลผลต่อคำขอ)
 * ต้องมีใบอนุญาตที่ Cloudflare ออกให้หลังตรวจสิทธิ์แล้ว: "หมดอายุ.nonce.ขนาด.ลายมือชื่อ"
 * ใช้ได้ครั้งเดียว ขนาดไฟล์ต้องตรงกับที่ขอไว้ คืนใบรับไฟล์ที่ลงลายมือชื่อให้ Cloudflare ตรวจซ้ำ
 */
function bridgeUpload_(b) {
  var secret = getProp_(BRIDGE.SECRET);
  if (!secret) {
    return { ok: false, code: 'NOT_PAIRED', error: 'Apps Script ไม่ได้เชื่อมกับ Cloudflare แล้ว กรุณารีเฟรชหน้าแล้วลองใหม่' };
  }
  var invalid = { ok: false, code: 'TICKET', error: 'ใบอนุญาตอัปโหลดไม่ถูกต้องหรือหมดอายุ กรุณากดส่งไฟล์ใหม่อีกครั้ง' };
  var t = str_(b.ticket).split('.');
  if (t.length !== 4 || !/^\d+$/.test(t[0]) || !/^[0-9a-f]{8,64}$/.test(t[1]) || !/^\d+$/.test(t[2])) return invalid;
  if (Number(t[0]) < new Date().getTime()) return invalid;
  if (!timingSafeEqual_(t[3], bridgeSigHex_(secret, 'up|' + t[0] + '|' + t[1] + '|' + t[2]))) return invalid;
  var cache = CacheService.getScriptCache();
  if (cache.get('bup:' + t[1])) return invalid;
  cache.put('bup:' + t[1], '1', 21600);
  var bytes;
  try {
    bytes = Utilities.base64Decode(str_(b.b64));
  } catch (err) {
    return { ok: false, error: 'ไฟล์เสียหายหรืออ่านไม่ได้ กรุณาลองใหม่' };
  }
  if (bytes.length !== Number(t[2]) || bytes.length > BRIDGE_MAX_FILE_BYTES) {
    return { ok: false, error: 'ขนาดไฟล์ไม่ตรงกับที่ตรวจสอบไว้ กรุณาเลือกไฟล์ใหม่แล้วลองอีกครั้ง' };
  }
  var res = bridgeStageBytes_(bytes, b.name, b.mime);
  res.sig = bridgeSigHex_(secret, res.id + ':' + res.size);
  return res;
}

/** ไฟล์ที่พักไว้แต่ไม่ได้ใช้ (เช่น ผู้ใช้ปิดหน้ากลางทาง) ย้ายลงถังขยะหลัง 24 ชั่วโมง */
function bridgeCleanupStaging_() {
  var id = getProp_(BRIDGE.STAGING_FOLDER_ID);
  if (!id) return 0;
  var folder;
  try { folder = DriveApp.getFolderById(id); } catch (err) { return 0; }
  var cutoff = new Date().getTime() - BRIDGE_STAGING_HOURS * 3600 * 1000;
  var it = folder.getFiles();
  var n = 0;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getDateCreated().getTime() < cutoff) {
      f.setTrashed(true);
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------- ลิงก์เดิมของ Apps Script และการกลับมาใช้ */

function bridgeHtml_(title, body) {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff7ed;margin:0;' +
    'display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}' +
    '.c{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:28px;max-width:440px;width:100%}' +
    'h1{font-size:20px;margin:0 0 8px}p{color:#475569;line-height:1.6;font-size:15px}' +
    'a.b,button{display:inline-block;background:#ea580c;color:#fff;border:0;border-radius:999px;padding:10px 22px;' +
    'font-size:15px;text-decoration:none;cursor:pointer}input{width:100%;box-sizing:border-box;padding:10px;' +
    'border:1px solid #cbd5e1;border-radius:10px;margin:6px 0 12px;font-size:15px}.e{color:#dc2626;font-size:14px}</style>' +
    '<title>' + escapeHtml_(title) + '</title></head><body><div class="c">' + body + '</div></body></html>';
}

/** เปิดลิงก์ Apps Script เดิมตอนเป็นระบบสำรอง → ไปหน้าเดียวกันบน Cloudflare */
function bridgeRedirectPage_(params) {
  var q = [];
  var page = sanitizeParam_(params.page, /[^a-z]/g, 20);
  var job = sanitizeParam_(params.job, /[^A-Za-z0-9-]/g, 30);
  var t = sanitizeParam_(params.t, /[^A-Za-z0-9_-]/g, 64);
  if (page) q.push('page=' + encodeURIComponent(page));
  if (job) q.push('job=' + encodeURIComponent(job));
  if (t) q.push('t=' + encodeURIComponent(t));
  var url = bridgeCfUrl_() + '/' + (q.length ? '?' + q.join('&') : '');
  var html = bridgeHtml_(APP.NAME,
    '<h1>ระบบย้ายไปที่อยู่ใหม่แล้ว</h1>' +
    '<p>' + escapeHtml_(APP.NAME) + ' ย้ายไปให้บริการที่ระบบใหม่ซึ่งเร็วขึ้น ข้อมูลทั้งหมดยังอยู่ครบ</p>' +
    '<p><a class="b" target="_top" href="' + escapeHtml_(url) + '">ไปที่ระบบ</a></p>' +
    '<script>try{window.top.location.replace(' + jsonForHtml_(url) + ');}catch(e){}</script>');
  return HtmlService.createHtmlOutput(html).setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** หน้าสำหรับผู้ดูแลระบบ: กลับมาใช้ Apps Script เป็นระบบหลัก (เมื่อ Cloudflare ใช้ไม่ได้) */
function bridgeFailoverPage_() {
  var body;
  if (!isBackupMode_()) {
    body = '<h1>Apps Script เป็นระบบหลักอยู่แล้ว</h1><p>ไม่ต้องทำอะไรเพิ่ม</p>' +
      '<p><a class="b" target="_top" href="' + escapeHtml_(safeWebAppUrl_()) + '">เปิดระบบ</a></p>';
  } else {
    body = '<h1>กลับมาใช้ Apps Script เป็นระบบหลัก</h1>' +
      '<p>ใช้เมื่อระบบบน Cloudflare (' + escapeHtml_(bridgeCfUrl_()) + ') เปิดไม่ได้เท่านั้น ' +
      'ข้อมูลล่าสุดที่ Cloudflare ส่งมาถึงแล้วยังอยู่ครบ เมื่อ Cloudflare กลับมาให้จับคู่ใหม่ที่หน้า /setup</p>' +
      '<label>อีเมลผู้ดูแลระบบ</label><input id="e" type="email" autocomplete="username">' +
      '<label>รหัสผ่าน</label><input id="p" type="password" autocomplete="current-password">' +
      '<div class="e" id="m"></div><p><button id="b" onclick="go()">ยืนยันกลับมาใช้ Apps Script</button></p>' +
      '<script>function go(){var b=document.getElementById("b");b.disabled=true;' +
      'google.script.run.withSuccessHandler(function(r){if(r&&r.ok){document.querySelector(".c").innerHTML=' +
      '"<h1>เรียบร้อย</h1><p>Apps Script เป็นระบบหลักแล้ว รีเฟรชลิงก์ระบบเพื่อใช้งานต่อ</p>"+(r.data&&r.data.cfNotified?' +
      '"<p>แจ้ง Cloudflare ให้หยุดรับข้อมูลแล้ว</p>":"<p>ติดต่อ Cloudflare ไม่ได้ตอนนี้ (อาจล่มอยู่) ' +
      'เมื่อกลับมา Cloudflare จะหยุดรับข้อมูลเองภายใน 5 นาที</p>");}' +
      'else{b.disabled=false;document.getElementById("m").textContent=(r&&r.error)||"ไม่สำเร็จ";}})' +
      '.withFailureHandler(function(e){b.disabled=false;document.getElementById("m").textContent=e.message;})' +
      '.apiBridgeFailover(document.getElementById("e").value,document.getElementById("p").value);}</script>';
  }
  return HtmlService.createHtmlOutput(bridgeHtml_(APP.NAME, body)).setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * ผู้ดูแลระบบสั่งให้ Apps Script กลับมาเป็นระบบหลัก
 * ไม่ผ่าน respond_ เพราะ respond_ ปฏิเสธทุกคำสั่งตอนเป็นระบบสำรอง
 */
function apiBridgeFailover(email, password) {
  try {
    bridgeCheckAdmin_(email, password);
    var cfUrl = '';
    var secret = '';
    withLock_(function () {
      cfUrl = getProp_(BRIDGE.CF_URL);
      secret = getProp_(BRIDGE.SECRET);
      setProp_(BRIDGE.LAST_CF_URL, cfUrl);
      [BRIDGE.SECRET, BRIDGE.MODE, BRIDGE.CF_URL, BRIDGE.PENDING_SECRET, BRIDGE.PENDING_URL].forEach(function (k) {
        props_().deleteProperty(k);
      });
    });
    // บอก Cloudflare ให้หยุดรับข้อมูลทันที ไม่งั้นคนที่เปิดลิงก์ Cloudflare ค้างไว้จะยื่นคำขอไปฝั่งที่ไม่ได้ใช้แล้ว
    // ถ้า Cloudflare ล่มอยู่ Cloudflare จะรู้เองเมื่อติดต่อ Apps Script ครั้งถัดไป (ไม่เกิน 5 นาทีหลังกลับมา)
    return { ok: true, data: { url: safeWebAppUrl_(), cfNotified: bridgeTellDetach_(cfUrl, secret) } };
  } catch (err) {
    return { ok: false, error: err && err.userFacing ? err.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่' };
  }
}
