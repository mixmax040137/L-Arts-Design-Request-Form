/**
 * 01_Utils.gs — ฟังก์ชันช่วยเหลือทั่วไป (ไม่มี side effect กับชีต)
 */

/** สร้าง error ที่มีข้อความภาษาไทยสำหรับแสดงผู้ใช้ */
function appError_(message) {
  var e = new Error(message);
  e.userFacing = true;
  return e;
}

/** อ่านค่าจาก object แบบปลอดภัย */
function pick_(obj, key, fallback) {
  if (obj === null || obj === undefined) return fallback;
  var v = obj[key];
  if (v === null || v === undefined || v === '') return fallback;
  return v;
}

/**
 * ตรวจว่าเป็นวัตถุวันที่ที่ใช้งานได้
 * ใช้การดูความสามารถแทน instanceof เพราะค่าที่อ่านจากชีตอาจมาจากคนละ realm
 */
function isDateLike_(v) {
  return !!v && typeof v === 'object' && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

/** แปลงเป็นข้อความและตัดช่องว่างหัวท้าย */
function str_(v) {
  if (v === null || v === undefined) return '';
  if (isDateLike_(v)) return toIso_(v);
  return String(v).trim();
}

/** แปลงเป็นจำนวนเต็ม */
function int_(v, fallback) {
  var raw = (v === null || v === undefined) ? '' : String(v);
  var n = parseInt(raw.replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
}

/** ตัดข้อความให้ไม่เกินความยาวที่กำหนด */
function truncate_(v, max) {
  var s = str_(v);
  return s.length <= max ? s : s.substring(0, max);
}

/** วันที่และเวลาปัจจุบันเป็นข้อความมาตรฐาน (โซนเวลาไทย) */
function nowIso_() {
  return toIso_(new Date());
}

/** แปลง Date เป็นข้อความรูปแบบ yyyy-MM-dd HH:mm:ss โซนเวลาไทย */
function toIso_(d) {
  if (!isDateLike_(d)) return '';
  return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/** แปลงค่าที่อ่านจากชีตให้เป็น Date (รองรับทั้ง Date และข้อความ) */
function parseDate_(v) {
  if (isDateLike_(v)) return v;
  if (v && typeof v === 'object' && typeof v.getTime === 'function') return null;
  var s = str_(v);
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return new Date(
      int_(m[1]), int_(m[2]) - 1, int_(m[3]),
      int_(m[4] || '0'), int_(m[5] || '0'), int_(m[6] || '0')
    );
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

var THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/** วันที่แบบไทย เช่น 7 กันยายน 2569 */
function formatThaiDate_(v, withTime) {
  var d = parseDate_(v);
  if (!d) return '';
  var day = int_(Utilities.formatDate(d, APP.TIMEZONE, 'd'));
  var monthIdx = int_(Utilities.formatDate(d, APP.TIMEZONE, 'M')) - 1;
  var year = int_(Utilities.formatDate(d, APP.TIMEZONE, 'yyyy')) + 543;
  var out = day + ' ' + THAI_MONTHS[monthIdx] + ' ' + year;
  if (withTime) out += ' เวลา ' + Utilities.formatDate(d, APP.TIMEZONE, 'HH:mm') + ' น.';
  return out;
}

/** ปี พ.ศ. */
function buddhistYear_(d) {
  var date = d || new Date();
  return int_(Utilities.formatDate(date, APP.TIMEZONE, 'yyyy')) + 543;
}

/** จำนวนวันเต็มระหว่างสองวัน (b ลบ a) */
function daysBetween_(a, b) {
  var da = startOfDay_(a);
  var db = startOfDay_(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function startOfDay_(d) {
  var x = parseDate_(d);
  if (!x) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/** ตรวจรูปแบบอีเมล */
function isValidEmail_(v) {
  var s = str_(v);
  if (!s || s.length > 254) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
}

/** ตรวจเบอร์โทรศัพท์ไทย 9-10 หลัก */
function isValidPhone_(v) {
  var digits = normalizePhone_(v);
  return digits.length >= 9 && digits.length <= 10;
}

/** ทำให้เบอร์โทรเป็นตัวเลขล้วน */
function normalizePhone_(v) {
  return str_(v).replace(/[^0-9]/g, '');
}

/** ตรวจว่าเป็น URL http หรือ https ที่ใช้ได้ */
function isValidUrl_(v) {
  var s = str_(v);
  if (!s || s.length > 2000) return false;
  return /^https?:\/\/[^\s<>"']+$/i.test(s);
}

/** escape ข้อความก่อนแทรกใน HTML */
function escapeHtml_(v) {
  return str_(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** แปลงการขึ้นบรรทัดใหม่เป็นแท็ก br โดย escape ก่อนเสมอ */
function nl2br_(v) {
  return escapeHtml_(v).replace(/\n/g, '<br>');
}

/** สร้างรหัสสุ่มสั้น */
function newId_(prefix) {
  var uuid = Utilities.getUuid().replace(/-/g, '');
  return (prefix ? prefix + '-' : '') + uuid.substring(0, 12).toUpperCase();
}

/** ทำความสะอาดชื่อไฟล์ให้ปลอดภัย */
function safeFileName_(name) {
  var s = str_(name).replace(/[\\\/:*?"<>|]/g, '_');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) s = 'file';
  return truncate_(s, 120);
}

/** base64url encode ของข้อความ */
function b64url_(s) {
  return Utilities.base64EncodeWebSafe(String(s)).replace(/=+$/, '');
}

/** base64url decode กลับเป็นข้อความ */
function unb64url_(s) {
  var padded = String(s);
  while (padded.length % 4 !== 0) padded += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

/** HMAC-SHA256 คืนค่าเป็น base64url */
function hmac_(message, key) {
  var bytes = Utilities.computeHmacSha256Signature(String(message), String(key));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/** เปรียบเทียบข้อความแบบใช้เวลาคงที่ เพื่อกัน timing attack */
function timingSafeEqual_(a, b) {
  var sa = (a === null || a === undefined) ? '' : String(a);
  var sb = (b === null || b === undefined) ? '' : String(b);
  if (sa.length !== sb.length) return false;
  var diff = 0;
  for (var i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

/** หาข้อมูลสถานะจาก key */
function statusInfo_(key) {
  var k = str_(key).toUpperCase();
  return STATUS[k] ? STATUS[k] : STATUS.NEW;
}

/** หาข้อมูลประเภทสื่อจาก key */
function mediaInfo_(key) {
  var k = str_(key);
  for (var i = 0; i < MEDIA_TYPES.length; i++) {
    if (MEDIA_TYPES[i].key === k) return MEDIA_TYPES[i];
  }
  return null;
}

/** คำนวณระดับความเร่งด่วนจากกำหนดส่ง */
function calcPriority_(dueDate, fromDate) {
  var days = daysBetween_(fromDate || new Date(), dueDate);
  if (days === null) return PRIORITY.NORMAL.key;
  if (days <= PRIORITY.URGENT.maxDays) return PRIORITY.URGENT.key;
  if (days <= PRIORITY.HIGH.maxDays) return PRIORITY.HIGH.key;
  return PRIORITY.NORMAL.key;
}

function priorityInfo_(key) {
  var k = str_(key).toUpperCase();
  return PRIORITY[k] ? PRIORITY[k] : PRIORITY.NORMAL;
}

/** ตรวจนามสกุลไฟล์ว่าอยู่ในรายการที่อนุญาต */
function isAllowedFile_(fileName, allowedCsv) {
  var name = str_(fileName).toLowerCase();
  var dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return false;
  var ext = name.substring(dot + 1);
  var allowed = str_(allowedCsv).toLowerCase().split(',').map(function (x) { return x.trim(); });
  return allowed.indexOf(ext) >= 0;
}

/** แปลงขนาดไฟล์เป็นข้อความอ่านง่าย */
function formatBytes_(bytes) {
  var n = int_(bytes);
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/** รวม array เป็นข้อความคั่นด้วยจุลภาค */
function joinList_(arr) {
  if (!arr) return '';
  if (!Array.isArray(arr)) return str_(arr);
  return arr.map(function (x) { return str_(x); }).filter(function (x) { return !!x; }).join(', ');
}

/** แยกข้อความคั่นด้วยจุลภาคกลับเป็น array */
function splitList_(v) {
  return str_(v).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
}

/**
 * ตรวจและปรับค่าตั้งค่าให้อยู่ในช่วงที่ระบบทำงานได้จริง
 * ค่าที่พิมพ์ผิด เช่น maxFileMB = 999 หรือ 0 จะทำให้อัปโหลดไฟล์พังทั้งระบบ
 * จึงต้องกันไว้ตั้งแต่ตอนบันทึก คืนค่าเป็นสตริงเสมอเพราะชีตเก็บเป็นข้อความ
 */
function sanitizeSetting_(key, value) {
  var NUMERIC = {
    revisionLimit: { min: 1, max: 20, label: 'จำนวนรอบแก้ไขสูงสุด' },
    minLeadDays: { min: 0, max: 90, label: 'จำนวนวันล่วงหน้าขั้นต่ำ' },
    slaFirstDraftDays: { min: 1, max: 90, label: 'จำนวนวันส่งร่างแรก' },
    maxFileMB: { min: 1, max: 25, label: 'ขนาดไฟล์สูงสุด (MB)' },
    maxFiles: { min: 1, max: 20, label: 'จำนวนไฟล์แนบสูงสุด' }
  };
  var BOOLEAN = ['notifyOwnerAlways', 'aiEnabled', 'publicFormOpen'];

  if (Object.prototype.hasOwnProperty.call(NUMERIC, key)) {
    var rule = NUMERIC[key];
    var raw = str_(value);
    if (!raw || !/^-?\d+$/.test(raw)) {
      throw appError_(rule.label + ' ต้องเป็นตัวเลขจำนวนเต็มระหว่าง ' +
        rule.min + ' ถึง ' + rule.max);
    }
    var n = int_(raw, rule.min);
    if (n < rule.min || n > rule.max) {
      throw appError_(rule.label + ' ต้องอยู่ระหว่าง ' + rule.min + ' ถึง ' + rule.max +
        ' (ใส่มา ' + n + ')');
    }
    return String(n);
  }

  if (BOOLEAN.indexOf(key) >= 0) {
    var b = str_(value).toLowerCase();
    if (b === 'true' || b === '1' || b === 'yes') return 'true';
    if (b === 'false' || b === '0' || b === 'no' || b === '') return 'false';
    throw appError_('ค่าของ ' + key + ' ต้องเป็น true หรือ false เท่านั้น');
  }

  if (key === 'notifyEmails') {
    var list = splitList_(value);
    var clean = [];
    for (var i = 0; i < list.length; i++) {
      var email = str_(list[i]).toLowerCase();
      if (!email) continue;
      if (!isValidEmail_(email)) {
        throw appError_('อีเมลผู้รับแจ้งเตือนไม่ถูกต้อง: ' + email +
          ' กรุณาคั่นแต่ละอีเมลด้วยเครื่องหมายจุลภาค');
      }
      if (clean.indexOf(email) < 0) clean.push(email);
    }
    if (!clean.length) {
      throw appError_('ต้องมีอีเมลผู้รับแจ้งเตือนอย่างน้อยหนึ่งรายชื่อ');
    }
    return clean.join(', ');
  }

  if (key === 'replyTo') {
    var reply = str_(value).toLowerCase();
    if (reply && !isValidEmail_(reply)) {
      throw appError_('อีเมลสำหรับตอบกลับไม่ถูกต้อง: ' + reply);
    }
    return reply;
  }

  if (key === 'allowedFileTypes') {
    var exts = splitList_(value);
    var out = [];
    for (var j = 0; j < exts.length; j++) {
      var ext = str_(exts[j]).toLowerCase().replace(/^[.\s]+/, '').replace(/\s+/g, '');
      if (!ext) continue;
      if (!/^[a-z0-9]{1,10}$/.test(ext)) {
        throw appError_('นามสกุลไฟล์ไม่ถูกต้อง: ' + exts[j] +
          ' ให้ใส่เฉพาะตัวอักษรภาษาอังกฤษหรือตัวเลข เช่น pdf,jpg,png');
      }
      if (out.indexOf(ext) < 0) out.push(ext);
    }
    if (!out.length) {
      throw appError_('ต้องระบุชนิดไฟล์ที่อนุญาตอย่างน้อยหนึ่งชนิด');
    }
    return out.join(',');
  }

  if (key === 'aiModel') {
    var model = str_(value).trim();
    if (!model) throw appError_('ต้องระบุชื่อโมเดลของ Claude');
    if (!/^[A-Za-z0-9._-]{3,60}$/.test(model)) {
      throw appError_('ชื่อโมเดลไม่ถูกต้อง เช่น claude-opus-5');
    }
    return model;
  }

  if (key === 'fromName') {
    var from = truncate_(str_(value).replace(/[\r\n\t]+/g, ' '), 100);
    if (!from) throw appError_('ต้องระบุชื่อผู้ส่งอีเมล');
    return from;
  }

  if (key === 'closedMessage') {
    return truncate_(str_(value), 500);
  }

  return truncate_(str_(value), 500);
}
