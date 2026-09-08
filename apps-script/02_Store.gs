/**
 * 02_Store.gs — ชั้นเข้าถึงข้อมูล (Google Sheets เป็นฐานข้อมูล)
 * ทุกฟังก์ชันในไฟล์นี้อ่าน/เขียนชีตโดยตรง ส่วน business logic อยู่ที่ไฟล์อื่น
 */

/** แคชระดับ execution เดียว ไม่ข้าม request */
var _cache = { ss: null, sheets: {}, settings: null };

function props_() {
  return PropertiesService.getScriptProperties();
}

function getProp_(key) {
  return str_(props_().getProperty(key));
}

function setProp_(key, value) {
  props_().setProperty(key, String(value));
}

/** เปิดสเปรดชีตหลัก */
function ss_() {
  if (_cache.ss) return _cache.ss;
  var id = getProp_(PROP.SPREADSHEET_ID);
  if (!id) {
    throw appError_('ยังไม่ได้ติดตั้งระบบ กรุณาเรียกใช้ฟังก์ชัน setupSystem() ใน Apps Script ก่อน');
  }
  _cache.ss = SpreadsheetApp.openById(id);
  return _cache.ss;
}

/** ดึงชีตตามชื่อ สร้างใหม่พร้อมหัวตารางหากยังไม่มี */
function sheet_(name) {
  if (_cache.sheets[name]) return _cache.sheets[name];
  var book = ss_();
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    writeHeader_(sh, name);
  }
  _cache.sheets[name] = sh;
  return sh;
}

function writeHeader_(sh, name) {
  var cols = COLUMNS[name];
  if (!cols) throw new Error('ไม่พบนิยามคอลัมน์ของชีต ' + name);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  sh.getRange(1, 1, 1, cols.length)
    .setFontWeight('bold')
    .setBackground(BRAND.primary)
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

/** อ่านทุกแถวของชีตเป็น array ของ object */
function readAll_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var cols = COLUMNS[name];
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var obj = rowToObject_(values[i], cols);
    obj._row = i + 2;
    out.push(obj);
  }
  return out;
}

function rowToObject_(row, cols) {
  var obj = {};
  for (var c = 0; c < cols.length; c++) {
    var v = row[c];
    obj[cols[c]] = isDateLike_(v) ? toIso_(v) : (v === null || v === undefined ? '' : v);
  }
  return obj;
}

function objectToRow_(obj, cols) {
  var row = [];
  for (var c = 0; c < cols.length; c++) {
    var v = obj[cols[c]];
    row.push(v === null || v === undefined ? '' : v);
  }
  return row;
}

/** หาแถวแรกที่คอลัมน์ key มีค่าเท่ากับ value */
function findBy_(name, key, value) {
  var cols = COLUMNS[name];
  var idx = cols.indexOf(key);
  if (idx < 0) throw new Error('ไม่พบคอลัมน์ ' + key + ' ในชีต ' + name);
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var target = str_(value);
  var colValues = sh.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < colValues.length; i++) {
    if (str_(colValues[i][0]) === target) {
      var rowValues = sh.getRange(i + 2, 1, 1, cols.length).getValues()[0];
      var obj = rowToObject_(rowValues, cols);
      obj._row = i + 2;
      return obj;
    }
  }
  return null;
}

/** หาทุกแถวที่คอลัมน์ key มีค่าเท่ากับ value */
function filterBy_(name, key, value) {
  var target = str_(value);
  return readAll_(name).filter(function (r) { return str_(r[key]) === target; });
}

/** เพิ่มแถวใหม่ คืน object ที่บันทึกพร้อมเลขแถว */
function insert_(name, obj) {
  var cols = COLUMNS[name];
  var sh = sheet_(name);
  var row = objectToRow_(obj, cols);
  sh.appendRow(row);
  var saved = {};
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) saved[k] = obj[k];
  saved._row = sh.getLastRow();
  return saved;
}

/** อัปเดตเฉพาะคอลัมน์ที่ส่งมาในแถวที่ระบุ */
function update_(name, rowIndex, patch) {
  var cols = COLUMNS[name];
  var sh = sheet_(name);
  if (rowIndex < 2 || rowIndex > sh.getLastRow()) {
    throw new Error('เลขแถวไม่ถูกต้อง: ' + rowIndex + ' ในชีต ' + name);
  }
  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    var idx = cols.indexOf(keys[i]);
    if (idx < 0) continue;
    var v = patch[keys[i]];
    sh.getRange(rowIndex, idx + 1).setValue(v === null || v === undefined ? '' : v);
  }
}

/** ลบแถว */
function remove_(name, rowIndex) {
  var sh = sheet_(name);
  sh.deleteRow(rowIndex);
}

/**
 * ลบทุกแถวที่คอลัมน์ key มีค่าตรงกับ value คืนจำนวนแถวที่ลบ
 * ลบจากแถวล่างขึ้นบนเสมอ เพื่อไม่ให้เลขแถวที่เหลือเลื่อนระหว่างลบ
 */
function removeWhere_(name, key, value) {
  var cols = COLUMNS[name];
  var idx = cols.indexOf(key);
  if (idx < 0) throw new Error('ไม่พบคอลัมน์ ' + key + ' ในชีต ' + name);
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  var target = str_(value);
  var values = sh.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (str_(values[i][0]) === target) rows.push(i + 2);
  }
  for (var r = rows.length - 1; r >= 0; r--) sh.deleteRow(rows[r]);
  return rows.length;
}

/** ลบข้อมูลทุกแถวของชีต โดยคงหัวตารางไว้ คืนจำนวนแถวที่ลบ */
function clearSheetRows_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  sh.deleteRows(2, lastRow - 1);
  return lastRow - 1;
}

/**
 * รันงานภายใต้ lock ระดับสคริปต์ เพื่อกันการเขียนชนกัน
 * ใช้กับทุกงานที่ออกเลขที่หรือแก้ไขสถานะ
 */
function withLock_(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  var ok = lock.tryLock(timeoutMs || 25000);
  if (!ok) {
    throw appError_('ระบบกำลังมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้งใน 1 นาที');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------- Settings */

/** อ่านค่าตั้งค่าทั้งหมด (ผสานกับค่าเริ่มต้น) */
function getSettings_() {
  if (_cache.settings) return _cache.settings;
  var settings = {};
  for (var k in DEFAULT_SETTINGS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) settings[k] = DEFAULT_SETTINGS[k];
  }
  var rows = readAll_(SHEET.SETTINGS);
  for (var i = 0; i < rows.length; i++) {
    var key = str_(rows[i].key);
    if (key) settings[key] = str_(rows[i].value);
  }
  _cache.settings = settings;
  return settings;
}

function getSetting_(key, fallback) {
  var v = getSettings_()[key];
  return (v === undefined || v === '') ? fallback : v;
}

function getSettingInt_(key, fallback) {
  var v = getSetting_(key, null);
  return v === null ? fallback : int_(v, fallback);
}

function getSettingBool_(key, fallback) {
  var v = str_(getSetting_(key, null)).toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return !!fallback;
}

/** บันทึกค่าตั้งค่า (สร้างแถวใหม่ถ้ายังไม่มี) */
function setSetting_(key, value) {
  var k = str_(key);
  if (!k) throw appError_('ต้องระบุชื่อการตั้งค่า');
  var existing = findBy_(SHEET.SETTINGS, 'key', k);
  if (existing) {
    update_(SHEET.SETTINGS, existing._row, { value: str_(value), updatedAt: nowIso_() });
  } else {
    insert_(SHEET.SETTINGS, { key: k, value: str_(value), updatedAt: nowIso_() });
  }
  _cache.settings = null;
}

/* ---------------------------------------------------------------- Counters */

/**
 * เพิ่มค่าตัวนับทีละ 1 แล้วคืนค่าใหม่
 * ต้องเรียกภายใน withLock_ เสมอ เพื่อกันเลขซ้ำ
 */
function nextCounter_(name) {
  var key = str_(name);
  var existing = findBy_(SHEET.COUNTERS, 'name', key);
  if (existing) {
    var next = int_(existing.value) + 1;
    update_(SHEET.COUNTERS, existing._row, { value: next });
    return next;
  }
  insert_(SHEET.COUNTERS, { name: key, value: 1 });
  return 1;
}

/** ออกเลขที่คำขอ รูปแบบ DR-2569-0001 (เลขปี พ.ศ. และรีเซ็ตทุกปี) */
function newJobId_() {
  var year = buddhistYear_();
  var seq = nextCounter_('job-' + year);
  var padded = ('0000' + seq).slice(-4);
  return 'DR-' + year + '-' + padded;
}

/* ---------------------------------------------------------------- Timeline */

/** บันทึกประวัติการเปลี่ยนแปลงของงาน */
function logTimeline_(jobId, actor, action, fromStatus, toStatus, detail) {
  insert_(SHEET.TIMELINE, {
    id: newId_('T'),
    jobId: str_(jobId),
    at: nowIso_(),
    actor: truncate_(actor, 150),
    action: truncate_(action, 100),
    fromStatus: str_(fromStatus),
    toStatus: str_(toStatus),
    detail: truncate_(detail, 1000)
  });
}

/** ดึงประวัติของงานหนึ่งใบ เรียงจากเก่าไปใหม่ */
function getTimeline_(jobId) {
  // เรียงจากเก่าไปใหม่ คืน 0 เมื่อเวลาเท่ากันเพื่อคงลำดับการบันทึกเดิมไว้
  return filterBy_(SHEET.TIMELINE, 'jobId', jobId).sort(function (a, b) {
    var x = str_(a.at);
    var y = str_(b.at);
    if (x === y) return 0;
    return x < y ? -1 : 1;
  });
}
