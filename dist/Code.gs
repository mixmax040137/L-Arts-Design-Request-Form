/**
 * ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์
 * ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์
 *
 * ไฟล์นี้สร้างอัตโนมัติจาก apps-script/*.gs ด้วยคำสั่ง  npm run bundle
 * ห้ามแก้ไขไฟล์นี้โดยตรง ให้แก้ที่ apps-script/ แล้วสร้างใหม่
 *
 * รวมจาก 11 ไฟล์: 00_Config.gs, 01_Utils.gs, 02_Store.gs, 03_Setup.gs, 04_Requests.gs, 05_Files.gs, 06_Mailer.gs, 07_AI.gs, 08_Auth.gs, 09_Stats.gs, 10_WebApp.gs
 */


/* ==========================================================================
   00_Config.gs
   ========================================================================== */

/**
 * ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์ (Design Request System)
 * ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์
 *
 * 00_Config.gs — ค่าคงที่ทั้งหมดของระบบ
 * ไฟล์นี้ต้องไม่มีการเรียกใช้ฟังก์ชันจากไฟล์อื่นในระดับ top-level
 */

var APP = {
  NAME: 'ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์',
  SHORT_NAME: 'L-Arts Design Request',
  ORG: 'ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์',
  ORG_SHORT: 'คณะศิลปศาสตร์ มธ.',
  VERSION: '1.0.0',
  TIMEZONE: 'Asia/Bangkok',
  ROOT_FOLDER_NAME: 'Design Request System'
};

/** คีย์ที่เก็บใน Script Properties */
var PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
  JOBS_FOLDER_ID: 'JOBS_FOLDER_ID',
  ASSET_FOLDER_ID: 'ASSET_FOLDER_ID',
  SECRET: 'APP_SECRET',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  SETUP_AT: 'SETUP_AT',
  SETUP_KEY: 'SETUP_KEY',
  OWNER_EMAIL: 'OWNER_EMAIL',
  WEBAPP_URL: 'WEBAPP_URL'
};

/** ชื่อชีตทั้งหมด */
var SHEET = {
  REQUESTS: 'Requests',
  DELIVERABLES: 'Deliverables',
  ATTACHMENTS: 'Attachments',
  REVISIONS: 'Revisions',
  TIMELINE: 'Timeline',
  USERS: 'Users',
  SETTINGS: 'Settings',
  COUNTERS: 'Counters'
};

/**
 * สถานะงาน 5 ระดับหลัก + สถานะยกเว้น 2 สถานะ
 * step > 0 = อยู่ใน stepper ปกติ, step = 0 = สถานะยกเว้น (แสดงแยก)
 */
var STATUS = {
  NEW:        { key: 'NEW',        label: 'รับคำขอ',              en: 'Received',        step: 1, color: '#0d9488', icon: 'bi-inbox-fill' },
  DESIGNING:  { key: 'DESIGNING',  label: 'อยู่ระหว่างออกแบบ',      en: 'Designing',       step: 2, color: '#e65c00', icon: 'bi-pencil-square' },
  REVIEW:     { key: 'REVIEW',     label: 'รอตรวจร่าง',            en: 'Awaiting Review', step: 3, color: '#d97706', icon: 'bi-eye-fill' },
  REVISING:   { key: 'REVISING',   label: 'อยู่ระหว่างแก้ไข',       en: 'Revising',        step: 4, color: '#7c3aed', icon: 'bi-arrow-repeat' },
  DELIVERED:  { key: 'DELIVERED',  label: 'ส่งมอบแล้ว',            en: 'Delivered',       step: 5, color: '#059669', icon: 'bi-check-circle-fill' },
  INFO_NEEDED:{ key: 'INFO_NEEDED',label: 'รอข้อมูลเพิ่มเติม',      en: 'Info Needed',     step: 0, color: '#dc2626', icon: 'bi-exclamation-triangle-fill' },
  CANCELLED:  { key: 'CANCELLED',  label: 'ยกเลิกคำขอ',            en: 'Cancelled',       step: 0, color: '#64748b', icon: 'bi-x-circle-fill' }
};

/** ลำดับสถานะใน stepper */
var STATUS_FLOW = ['NEW', 'DESIGNING', 'REVIEW', 'REVISING', 'DELIVERED'];

/** การเปลี่ยนสถานะที่อนุญาต (from -> [to]) */
var STATUS_TRANSITIONS = {
  NEW:         ['DESIGNING', 'INFO_NEEDED', 'CANCELLED'],
  INFO_NEEDED: ['NEW', 'DESIGNING', 'CANCELLED'],
  DESIGNING:   ['REVIEW', 'INFO_NEEDED', 'CANCELLED'],
  REVIEW:      ['REVISING', 'DELIVERED', 'DESIGNING', 'CANCELLED'],
  REVISING:    ['REVIEW', 'DELIVERED', 'CANCELLED'],
  DELIVERED:   [],
  CANCELLED:   []
};

/** ประเภทสื่อ + ขนาดมาตรฐานที่เลือกได้ */
var MEDIA_TYPES = [
  { key: 'poster',      label: 'โปสเตอร์ประชาสัมพันธ์',      sizes: ['A4 (21 x 29.7 ซม.)', 'A3 (29.7 x 42 ซม.)', 'A2 (42 x 59.4 ซม.)', 'A1 (59.4 x 84.1 ซม.)'] },
  { key: 'social',      label: 'สื่อโซเชียลมีเดีย',           sizes: ['จัตุรัส 1080 x 1080 px', 'แนวตั้ง 1080 x 1350 px', 'สตอรี่ 1080 x 1920 px', 'แนวนอน 1200 x 628 px'] },
  { key: 'banner_web',  label: 'แบนเนอร์เว็บไซต์',            sizes: ['1920 x 600 px', '1200 x 628 px', '1080 x 1080 px'] },
  { key: 'vinyl',       label: 'ป้ายไวนิล / แบ็คดรอป',        sizes: ['1 x 2 เมตร', '1.2 x 2.4 เมตร', '2 x 3 เมตร', '2.4 x 4 เมตร'] },
  { key: 'certificate', label: 'เกียรติบัตร / ประกาศนียบัตร',  sizes: ['A4 แนวนอน', 'A4 แนวตั้ง'] },
  { key: 'infographic', label: 'อินโฟกราฟิก',                sizes: ['1080 x 1350 px', '1080 x 1920 px', 'A4 แนวตั้ง'] },
  { key: 'cover',       label: 'ปกเอกสาร / ปกรายงาน',        sizes: ['A4 แนวตั้ง', 'A5 แนวตั้ง'] },
  { key: 'ecard',       label: 'อีการ์ด / การ์ดเชิญ',         sizes: ['1080 x 1080 px', '1200 x 628 px', 'A5 แนวนอน'] },
  { key: 'standee',     label: 'ป้ายสแตนดี้ / X-Stand',       sizes: ['60 x 160 ซม.', '80 x 180 ซม.'] },
  { key: 'slide',       label: 'เทมเพลตสไลด์นำเสนอ',          sizes: ['16:9 (1920 x 1080 px)', '4:3 (1024 x 768 px)'] },
  { key: 'other',       label: 'อื่น ๆ (ระบุเอง)',            sizes: [] }
];

/** ช่องทางเผยแพร่ */
var CHANNELS = [
  'Facebook คณะศิลปศาสตร์',
  'Instagram',
  'เว็บไซต์คณะ',
  'จอ LED / จอในอาคาร',
  'ป้ายพิมพ์จริง (โรงพิมพ์)',
  'อีเมล / จดหมายเวียน',
  'LINE Official',
  'อื่น ๆ'
];

/** หน่วยงาน / สาขาวิชา ภายในคณะ */
var DEPARTMENTS = [
  'สาขาวิชาภาษาไทย',
  'สาขาวิชาภาษาอังกฤษ',
  'สาขาวิชาภาษาฝรั่งเศส',
  'สาขาวิชาภาษาเยอรมัน',
  'สาขาวิชาภาษาญี่ปุ่น',
  'สาขาวิชาภาษาจีน',
  'สาขาวิชาภาษารัสเซีย',
  'สาขาวิชาภาษาศาสตร์',
  'สาขาวิชาบรรณารักษศาสตร์และสารสนเทศศาสตร์',
  'สาขาวิชาจิตวิทยา',
  'สาขาวิชาประวัติศาสตร์',
  'สาขาวิชาปรัชญา',
  'สาขาวิชาภูมิศาสตร์',
  'สาขาวิชาการแปลและการล่าม',
  'ฝ่ายบริหารงานทั่วไป',
  'ฝ่ายวิชาการ',
  'ฝ่ายการนักศึกษา',
  'ฝ่ายวิจัยและบริการวิชาการ',
  'ฝ่ายวิเทศสัมพันธ์',
  'ฝ่ายสื่อสารองค์กร',
  'งานคลังและพัสดุ',
  'งานบริหารทรัพยากรมนุษย์',
  'อื่น ๆ'
];

/** ระดับความเร่งด่วน คำนวณจากจำนวนวันก่อนกำหนดส่ง */
var PRIORITY = {
  URGENT: { key: 'URGENT', label: 'ด่วนมาก', color: '#dc2626', maxDays: 3 },
  HIGH:   { key: 'HIGH',   label: 'ด่วน',    color: '#d97706', maxDays: 7 },
  NORMAL: { key: 'NORMAL', label: 'ปกติ',    color: '#0d9488', maxDays: 9999 }
};

/** ค่าตั้งต้นของ Settings (แก้ไขได้ในชีต Settings หรือหน้าผู้ดูแลระบบ) */
var DEFAULT_SETTINGS = {
  revisionLimit: '3',
  minLeadDays: '7',
  slaFirstDraftDays: '5',
  notifyEmails: 'pr@arts.tu.ac.th',
  notifyOwnerAlways: 'true',
  fromName: 'ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มธ.',
  replyTo: 'pr@arts.tu.ac.th',
  maxFileMB: '10',
  maxFiles: '8',
  allowedFileTypes: 'pdf,jpg,jpeg,png,ai,psd,eps,svg,doc,docx,xls,xlsx,ppt,pptx,zip,webp',
  aiEnabled: 'true',
  aiModel: 'claude-opus-5',
  publicFormOpen: 'true',
  closedMessage: 'ขณะนี้ระบบปิดรับคำขอชั่วคราว กรุณาติดต่อฝ่ายสื่อสารองค์กรโดยตรง'
};

/** อายุ token ของเจ้าหน้าที่ (มิลลิวินาที) = 12 ชั่วโมง */
var SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** จำนวนรอบการ hash รหัสผ่าน */
var PASSWORD_ROUNDS = 2000;

/** จำกัดจำนวนครั้งการ login ที่ผิดพลาด */
var LOGIN_MAX_ATTEMPTS = 5;
var LOGIN_LOCK_SECONDS = 900;

/** โครงสร้างคอลัมน์ของแต่ละชีต (ลำดับสำคัญ) */
var COLUMNS = {
  Requests: [
    'jobId', 'createdAt', 'status', 'priority',
    'requesterName', 'requesterEmail', 'requesterPhone', 'department', 'lineId',
    'projectName', 'eventDate', 'dueDate', 'objective', 'targetAudience',
    'keyMessage', 'mandatoryText', 'referenceUrl', 'channels', 'notes',
    'rushReason', 'folderId', 'folderUrl', 'attachmentCount',
    'briefStatus', 'briefText', 'briefMissing', 'briefGeneratedAt', 'briefSource',
    'draftUrl', 'revisionCount', 'revisionLimit', 'assignedTo',
    'submittedAt', 'startedAt', 'firstDraftAt', 'deliveredAt', 'closedAt',
    'leadTimeDays', 'cancelReason', 'trackToken', 'updatedAt', 'updatedBy'
  ],
  Deliverables: ['id', 'jobId', 'seq', 'mediaType', 'mediaLabel', 'size', 'quantity', 'note'],
  Attachments: ['id', 'jobId', 'kind', 'fileName', 'fileId', 'fileUrl', 'mimeType', 'sizeBytes', 'uploadedAt', 'uploadedBy'],
  Revisions:  ['id', 'jobId', 'round', 'createdAt', 'byName', 'byEmail', 'comment', 'draftUrl', 'resolvedAt'],
  Timeline:   ['id', 'jobId', 'at', 'actor', 'action', 'fromStatus', 'toStatus', 'detail'],
  Users:      ['email', 'name', 'role', 'passwordHash', 'salt', 'active', 'createdAt', 'lastLoginAt'],
  Settings:   ['key', 'value', 'updatedAt'],
  Counters:   ['name', 'value']
};

/** สีหลักของระบบ (ใช้ทั้งใน UI และอีเมล) */
var BRAND = {
  primary: '#e65c00',
  primaryDark: '#b34700',
  accent: '#fbbf24',
  textDark: '#1e293b',
  textLight: '#64748b',
  bg: '#f8fafc',
  border: '#e2e8f0'
};


/* ==========================================================================
   01_Utils.gs
   ========================================================================== */

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


/* ==========================================================================
   02_Store.gs
   ========================================================================== */

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


/* ==========================================================================
   03_Setup.gs
   ========================================================================== */

/**
 * 03_Setup.gs — ติดตั้งระบบครั้งแรก
 *
 * ขั้นตอนใช้งาน (ทำครั้งเดียวด้วยบัญชี pr@arts.tu.ac.th):
 *   1) เปิด Apps Script แล้วเลือกฟังก์ชัน setupSystem แล้วกด Run
 *   2) อนุญาตสิทธิ์ที่ระบบร้องขอ
 *   3) เรียก createAdmin('pr@arts.tu.ac.th', 'ชื่อผู้ดูแล', 'รหัสผ่าน') เพื่อสร้างบัญชีเจ้าหน้าที่
 *   4) Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 */

/** ติดตั้งระบบ: สร้างสเปรดชีต โฟลเดอร์ Drive ค่าตั้งต้น และทริกเกอร์ (เรียกซ้ำได้) */
function setupSystem() {
  var result = { steps: [] };

  // 1) ความลับของระบบ ใช้เซ็น token
  if (!getProp_(PROP.SECRET)) {
    setProp_(PROP.SECRET, Utilities.getUuid() + Utilities.getUuid());
    result.steps.push('สร้างกุญแจลับของระบบ (APP_SECRET)');
  } else {
    result.steps.push('พบกุญแจลับของระบบเดิม จึงใช้ค่าเดิม');
  }

  // 2) สเปรดชีตฐานข้อมูล
  var ssId = getProp_(PROP.SPREADSHEET_ID);
  var book;
  if (ssId) {
    try {
      book = SpreadsheetApp.openById(ssId);
      result.steps.push('พบฐานข้อมูลเดิม: ' + book.getName());
    } catch (err) {
      book = null;
    }
  }
  if (!book) {
    book = SpreadsheetApp.create(APP.SHORT_NAME + ' — ฐานข้อมูล');
    setProp_(PROP.SPREADSHEET_ID, book.getId());
    result.steps.push('สร้างฐานข้อมูลใหม่: ' + book.getName());
  }
  _cache.ss = book;
  _cache.sheets = {};

  // 3) สร้างชีตทั้งหมดพร้อมหัวตาราง
  var names = [SHEET.REQUESTS, SHEET.DELIVERABLES, SHEET.ATTACHMENTS, SHEET.REVISIONS,
    SHEET.TIMELINE, SHEET.USERS, SHEET.SETTINGS, SHEET.COUNTERS];
  for (var i = 0; i < names.length; i++) {
    ensureSheet_(book, names[i]);
  }
  result.steps.push('ตรวจสอบชีตครบ ' + names.length + ' ชีต');

  // ลบชีตเริ่มต้นที่ว่างเปล่าออก
  var defaultSheet = book.getSheetByName('Sheet1') || book.getSheetByName('ชีต1');
  if (defaultSheet && book.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    book.deleteSheet(defaultSheet);
  }

  // 4) โฟลเดอร์ใน Drive
  var root = ensureFolder_(null, APP.ROOT_FOLDER_NAME, PROP.ROOT_FOLDER_ID);
  var jobs = ensureFolder_(root, 'คำขอรับบริการ (Jobs)', PROP.JOBS_FOLDER_ID);
  var assets = ensureFolder_(root, 'คลังผลงาน (Asset Library)', PROP.ASSET_FOLDER_ID);
  result.steps.push('เตรียมโฟลเดอร์ Drive เรียบร้อย');

  // ย้ายสเปรดชีตเข้าโฟลเดอร์ระบบ (ทำครั้งเดียว)
  try {
    var file = DriveApp.getFileById(book.getId());
    var parents = file.getParents();
    var alreadyThere = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === root.getId()) { alreadyThere = true; break; }
    }
    if (!alreadyThere) root.addFile(file);
  } catch (err) {
    result.steps.push('หมายเหตุ: ย้ายไฟล์ฐานข้อมูลเข้าโฟลเดอร์ไม่สำเร็จ (' + err.message + ')');
  }

  // 5) ค่าตั้งต้น
  _cache.settings = null;
  var settingsSheet = book.getSheetByName(SHEET.SETTINGS);
  var existingKeys = {};
  if (settingsSheet.getLastRow() > 1) {
    var vals = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues();
    for (var v = 0; v < vals.length; v++) existingKeys[str_(vals[v][0])] = true;
  }
  var added = 0;
  for (var key in DEFAULT_SETTINGS) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
    if (existingKeys[key]) continue;
    settingsSheet.appendRow([key, DEFAULT_SETTINGS[key], nowIso_()]);
    added++;
  }
  result.steps.push('เพิ่มค่าตั้งต้นใหม่ ' + added + ' รายการ');

  // 6) ทริกเกอร์เบื้องหลัง
  installTriggers_();
  result.steps.push('ติดตั้งทริกเกอร์เบื้องหลังเรียบร้อย');

  setProp_(PROP.SETUP_AT, nowIso_());

  result.spreadsheetUrl = book.getUrl();
  result.driveFolderUrl = root.getUrl();
  result.webAppUrl = safeWebAppUrl_();
  result.hasAdmin = readAll_(SHEET.USERS).length > 0;

  // ยังไม่มีบัญชีเจ้าหน้าที่ ให้ออกรหัสติดตั้งไว้สร้างบัญชีแรกผ่านหน้าเว็บ
  if (!result.hasAdmin) {
    result.setupKey = ensureSetupKey_();
    result.steps.push('ออกรหัสติดตั้งสำหรับสร้างบัญชีผู้ดูแลระบบคนแรก');
  } else {
    props_().deleteProperty(PROP.SETUP_KEY);
  }

  var lines = [
    '',
    '==============================================',
    ' ติดตั้ง ' + APP.NAME + ' เรียบร้อย',
    '==============================================',
    ''
  ];
  for (var s = 0; s < result.steps.length; s++) lines.push('  - ' + result.steps[s]);
  lines.push('');
  lines.push('  ฐานข้อมูล : ' + result.spreadsheetUrl);
  lines.push('  โฟลเดอร์  : ' + result.driveFolderUrl);
  lines.push('');
  if (!result.hasAdmin) {
    lines.push('  ขั้นตอนถัดไป: เปิดเว็บแอปแล้วสร้างบัญชีผู้ดูแลระบบคนแรก');
    lines.push('  รหัสติดตั้ง (ใช้ครั้งเดียว) : ' + result.setupKey);
    if (result.webAppUrl) {
      lines.push('  ลิงก์สร้างบัญชี : ' + result.webAppUrl + '?page=setup&k=' + result.setupKey);
    } else {
      lines.push('  (ยังไม่ได้ Deploy เว็บแอป เมื่อ Deploy แล้วเปิด URL ได้เลย ระบบจะพาไปหน้าสร้างบัญชี)');
    }
  } else {
    lines.push('  มีบัญชีเจ้าหน้าที่ในระบบแล้ว');
  }
  lines.push('');
  Logger.log(lines.join('\n'));

  return result;
}

/** ออกรหัสติดตั้งสำหรับสร้างบัญชีผู้ดูแลระบบคนแรก (ใช้ค่าเดิมถ้ามีอยู่แล้ว) */
function ensureSetupKey_() {
  var existing = getProp_(PROP.SETUP_KEY);
  if (existing) return existing;
  var key = Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase();
  setProp_(PROP.SETUP_KEY, key);
  return key;
}

/**
 * ติดตั้งระบบอัตโนมัติเมื่อเปิดเว็บแอปครั้งแรก
 * ทำงานด้วยสิทธิ์ของเจ้าของสคริปต์ จึงไม่ต้องเข้าไปกด Run ในตัวแก้ไข
 * คืน true เมื่อเพิ่งติดตั้งในรอบนี้
 */
function ensureInstalled_() {
  if (getProp_(PROP.SPREADSHEET_ID)) return false;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) return false;
  try {
    // ตรวจซ้ำหลังได้ล็อก เผื่อมีคนเปิดพร้อมกัน
    if (getProp_(PROP.SPREADSHEET_ID)) return false;
    var result = setupSystem();
    if (result && result.setupKey) {
      try {
        sendSetupKeyEmail_(result.setupKey, result.webAppUrl);
      } catch (err) {
        Logger.log('ส่งอีเมลรหัสติดตั้งไม่สำเร็จ: ' + err.message);
      }
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** ส่งรหัสติดตั้งไปยังเจ้าของสคริปต์ */
function sendSetupKeyEmail_(setupKey, webAppUrl) {
  var owner = '';
  try {
    owner = str_(Session.getEffectiveUser().getEmail());
  } catch (err) {
    owner = '';
  }
  if (!owner) owner = splitList_(getSetting_('notifyEmails', DEFAULT_SETTINGS.notifyEmails))[0] || '';
  if (!owner) return false;

  var link = webAppUrl ? webAppUrl + '?page=setup&k=' + encodeURIComponent(setupKey) : '';
  var body =
    '<p>ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์ติดตั้งตัวเองเรียบร้อยแล้ว ' +
    'เหลือเพียงขั้นตอนสุดท้ายคือสร้างบัญชีผู้ดูแลระบบคนแรก</p>' +
    '<div style="text-align:center;margin:18px 0 22px 0">' +
      '<div style="display:inline-block;border:2px dashed ' + BRAND.primary + ';border-radius:14px;' +
        'padding:14px 28px;background:#fff7ed">' +
        '<div style="font-size:12px;color:' + BRAND.textLight + '">รหัสติดตั้ง (ใช้ได้ครั้งเดียว)</div>' +
        '<div style="font-size:24px;font-weight:700;letter-spacing:3px;color:' + BRAND.primary + '">' +
          escapeHtml_(setupKey) + '</div>' +
      '</div>' +
    '</div>' +
    emailNotice_('กดปุ่มด้านล่างเพื่อตั้งชื่อและรหัสผ่านของบัญชีผู้ดูแลระบบ ' +
      'เมื่อสร้างบัญชีเสร็จ รหัสนี้จะถูกยกเลิกทันทีและใช้ซ้ำไม่ได้<br>' +
      'หากท่านไม่ได้เป็นผู้ติดตั้งระบบนี้ กรุณาอย่าเปิดลิงก์และแจ้งผู้ดูแลระบบทันที');

  return sendMail_(owner, 'สร้างบัญชีผู้ดูแลระบบ — ' + APP.NAME,
    emailShell_('ติดตั้งระบบเรียบร้อย', APP.ORG, body,
      link ? 'สร้างบัญชีผู้ดูแลระบบ' : '', link));
}

/**
 * สร้างบัญชีผู้ดูแลระบบคนแรกผ่านหน้าเว็บ
 * ทำได้เฉพาะตอนที่ยังไม่มีบัญชีใดในระบบ และต้องใช้รหัสติดตั้งที่ส่งไปทางอีเมลเท่านั้น
 */
function createFirstAdmin_(setupKey, email, name, password) {
  return withLock_(function () {
    if (readAll_(SHEET.USERS).length > 0) {
      throw appError_('ระบบมีบัญชีผู้ดูแลอยู่แล้ว กรุณาเข้าสู่ระบบตามปกติ');
    }
    var stored = getProp_(PROP.SETUP_KEY);
    if (!stored) throw appError_('ไม่พบรหัสติดตั้งในระบบ กรุณาเรียก setupSystem() ใน Apps Script อีกครั้ง');
    if (!timingSafeEqual_(stored, str_(setupKey).toUpperCase())) {
      throw appError_('รหัสติดตั้งไม่ถูกต้อง กรุณาตรวจสอบอีเมลที่ระบบส่งไปให้');
    }

    var mail = str_(email).toLowerCase();
    if (!isValidEmail_(mail)) throw appError_('รูปแบบอีเมลไม่ถูกต้อง');
    if (!str_(name)) throw appError_('กรุณากรอกชื่อ-นามสกุล');
    if (str_(password).length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');

    var salt = Utilities.getUuid();
    insert_(SHEET.USERS, {
      email: mail,
      name: truncate_(name, 150),
      role: 'admin',
      passwordHash: hashPassword_(password, salt),
      salt: salt,
      active: 'TRUE',
      createdAt: nowIso_(),
      lastLoginAt: ''
    });
    props_().deleteProperty(PROP.SETUP_KEY);

    // เพิ่มอีเมลบัญชีแรกเข้ารายชื่อผู้รับแจ้งเตือน โดยไม่ลบอีเมลเดิมของฝ่ายทิ้ง
    var notify = splitList_(getSetting_('notifyEmails', DEFAULT_SETTINGS.notifyEmails));
    if (notify.indexOf(mail) < 0) notify.push(mail);
    setSetting_('notifyEmails', notify.join(', '));

    return { created: true, email: mail };
  });
}

/** สร้างชีตพร้อมหัวตารางหากยังไม่มี และเติมคอลัมน์ที่ขาด */
function ensureSheet_(book, name) {
  var cols = COLUMNS[name];
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.getRange(1, 1, 1, cols.length)
      .setFontWeight('bold')
      .setBackground(BRAND.primary)
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);
    return sh;
  }
  // ชีตมีอยู่แล้ว: ตรวจว่าหัวตารางตรงกับนิยามหรือไม่
  var width = Math.max(sh.getLastColumn(), cols.length);
  var header = sh.getRange(1, 1, 1, width).getValues()[0];
  var needFix = false;
  for (var i = 0; i < cols.length; i++) {
    if (str_(header[i]) !== cols[i]) { needFix = true; break; }
  }
  if (needFix && sh.getLastRow() <= 1) {
    sh.clear();
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.getRange(1, 1, 1, cols.length)
      .setFontWeight('bold')
      .setBackground(BRAND.primary)
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else if (needFix) {
    throw new Error('หัวตารางของชีต ' + name + ' ไม่ตรงกับที่ระบบกำหนด และมีข้อมูลอยู่แล้ว ' +
      'กรุณาสำรองข้อมูลแล้วแก้ไขหัวตารางให้ตรงกับ COLUMNS.' + name);
  }
  return sh;
}

/** สร้างโฟลเดอร์หากยังไม่มี แล้วจำ id ไว้ใน Script Properties */
function ensureFolder_(parent, name, propKey) {
  var id = propKey ? getProp_(propKey) : '';
  if (id) {
    try {
      var existing = DriveApp.getFolderById(id);
      if (!existing.isTrashed()) return existing;
    } catch (err) {
      // ไฟล์ถูกลบ สร้างใหม่ด้านล่าง
    }
  }
  var scope = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  var folder = scope.hasNext() ? scope.next()
    : (parent ? parent.createFolder(name) : DriveApp.createFolder(name));
  if (propKey) setProp_(propKey, folder.getId());
  return folder;
}

/** ติดตั้งทริกเกอร์เบื้องหลัง (ลบของเดิมก่อนเพื่อไม่ให้ซ้ำ) */
function installTriggers_() {
  var handlers = ['workerTick', 'dailyReminder'];
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (handlers.indexOf(existing[i].getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('workerTick').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailyReminder').timeBased().atHour(8).everyDays(1)
    .inTimezone(APP.TIMEZONE).create();
}

/** สร้างบัญชีเจ้าหน้าที่ (เรียกจาก Apps Script editor) */
function createAdmin(email, name, password) {
  var mail = str_(email).toLowerCase();
  if (!isValidEmail_(mail)) throw appError_('อีเมลไม่ถูกต้อง');
  if (str_(password).length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');

  var existing = findBy_(SHEET.USERS, 'email', mail);
  var salt = Utilities.getUuid();
  var hash = hashPassword_(password, salt);
  if (existing) {
    update_(SHEET.USERS, existing._row, {
      name: str_(name) || existing.name,
      passwordHash: hash,
      salt: salt,
      active: 'TRUE',
      role: existing.role || 'admin'
    });
    Logger.log('อัปเดตบัญชีเจ้าหน้าที่ ' + mail + ' เรียบร้อย');
    return { updated: true, email: mail };
  }
  insert_(SHEET.USERS, {
    email: mail,
    name: str_(name) || mail,
    role: 'admin',
    passwordHash: hash,
    salt: salt,
    active: 'TRUE',
    createdAt: nowIso_(),
    lastLoginAt: ''
  });
  props_().deleteProperty(PROP.SETUP_KEY);
  Logger.log('สร้างบัญชีเจ้าหน้าที่ ' + mail + ' เรียบร้อย');
  return { created: true, email: mail };
}

/** ตั้งค่า API key ของ Claude สำหรับสรุป Design Brief */
function setAnthropicApiKey(key) {
  var k = str_(key);
  if (!k) {
    props_().deleteProperty(PROP.ANTHROPIC_API_KEY);
    Logger.log('ลบ API key แล้ว ระบบจะสรุป Design Brief ด้วยสูตรสำเร็จแทน');
    return;
  }
  setProp_(PROP.ANTHROPIC_API_KEY, k);
  Logger.log('บันทึก API key เรียบร้อย ระบบจะใช้ AI สรุป Design Brief');
}

/** คืน URL ของเว็บแอปแบบไม่ทำให้เกิด error ตอนยังไม่ deploy */
function safeWebAppUrl_() {
  var saved = getProp_(PROP.WEBAPP_URL);
  if (saved) return saved;
  try {
    var url = ScriptApp.getService().getUrl();
    return url || '';
  } catch (err) {
    return '';
  }
}

/**
 * จดจำ URL จริงของเว็บแอปไว้ใน Script Properties
 * เรียกจาก doGet เท่านั้น เพราะเป็นบริบทเดียวที่ ScriptApp คืนค่า /exec ที่ถูกต้องแน่นอน
 * งานเบื้องหลัง (ทริกเกอร์) เรียกแล้วอาจได้ /dev หรือค่าว่าง ทำให้ลิงก์ในอีเมลใช้ไม่ได้
 */
function rememberWebAppUrl_() {
  try {
    var url = str_(ScriptApp.getService().getUrl());
    if (!url || url.indexOf('/exec') < 0) return;
    if (url !== getProp_(PROP.WEBAPP_URL)) setProp_(PROP.WEBAPP_URL, url);
  } catch (err) {
    // ไม่ต้องทำอะไร ใช้ค่าเดิมต่อไป
  }
}

/**
 * แสดงลิงก์และสถานะทั้งหมดของระบบใน Execution log
 * ใช้เมื่อหา URL ที่ถูกต้องไม่เจอ หรือต้องการตรวจว่าติดตั้งครบหรือยัง
 */
function showLinks() {
  var base = safeWebAppUrl_();
  var live = '';
  try { live = str_(ScriptApp.getService().getUrl()); } catch (err) { live = ''; }

  var lines = ['', '=============================================='];
  lines.push(' ลิงก์ของระบบ ' + APP.NAME);
  lines.push('==============================================', '');

  if (base) {
    lines.push('  สำหรับผู้ขอรับบริการ (แจกลิงก์นี้)');
    lines.push('    ' + base);
    lines.push('');
    lines.push('  สำหรับเจ้าหน้าที่');
    lines.push('    ' + base + '?page=login');
  } else {
    lines.push('  ยังไม่พบ URL ของเว็บแอป');
    lines.push('  แปลว่ายังไม่เคยมีใครเปิดเว็บแอปผ่านลิงก์ /exec เลย');
    lines.push('  ให้ไปที่ Deploy > Manage deployments แล้วคัดลอกช่อง "Web app" > URL');
    lines.push('  (อย่าคัดลอกช่อง "Library" เพราะเปิดเป็นหน้าเว็บไม่ได้)');
  }

  if (live && live.indexOf('/dev') > 0) {
    lines.push('');
    lines.push('  หมายเหตุ: ตอนนี้รันจากตัวแก้ไข ระบบจึงเห็นเป็น URL ทดสอบ');
    lines.push('    ' + live);
    lines.push('  ห้ามแจก URL ที่ลงท้าย /dev ให้ผู้ขอรับบริการ เพราะคนอื่นเปิดไม่ได้');
  }

  var ssId = getProp_(PROP.SPREADSHEET_ID);
  var folderId = getProp_(PROP.ROOT_FOLDER_ID);
  lines.push('');
  lines.push('  ฐานข้อมูล : ' + (ssId ? 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit' : 'ยังไม่ได้ติดตั้ง'));
  lines.push('  โฟลเดอร์  : ' + (folderId ? 'https://drive.google.com/drive/folders/' + folderId : 'ยังไม่ได้ติดตั้ง'));
  lines.push('');

  try {
    lines.push('  บัญชีเจ้าหน้าที่ในระบบ : ' + readAll_(SHEET.USERS).length + ' บัญชี');
    lines.push('  คำขอทั้งหมด           : ' + Math.max(0, sheet_(SHEET.REQUESTS).getLastRow() - 1) + ' รายการ');
    lines.push('  อีเมลที่รับแจ้งเตือน    : ' + (staffRecipients_().join(', ') || 'ยังไม่มี'));
  } catch (err) {
    lines.push('  อ่านข้อมูลไม่สำเร็จ: ' + err.message);
  }
  lines.push('');

  Logger.log(lines.join('\n'));
  return { webAppUrl: base, liveUrl: live };
}

/** แสดงสถานะการติดตั้งของระบบ (ใช้ตรวจสอบภายหลัง) */
function checkSystem() {
  var report = {
    version: APP.VERSION,
    setupAt: getProp_(PROP.SETUP_AT),
    spreadsheetId: getProp_(PROP.SPREADSHEET_ID),
    rootFolderId: getProp_(PROP.ROOT_FOLDER_ID),
    hasSecret: !!getProp_(PROP.SECRET),
    hasApiKey: !!getProp_(PROP.ANTHROPIC_API_KEY),
    webAppUrl: safeWebAppUrl_(),
    users: 0,
    requests: 0,
    triggers: []
  };
  try {
    report.users = readAll_(SHEET.USERS).length;
    report.requests = sheet_(SHEET.REQUESTS).getLastRow() - 1;
  } catch (err) {
    report.error = err.message;
  }
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    report.triggers.push(triggers[i].getHandlerFunction());
  }
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


/* ==========================================================================
   04_Requests.gs
   ========================================================================== */

/**
 * 04_Requests.gs — ตรรกะหลักของคำขอรับบริการออกแบบ
 */

/* ------------------------------------------------------------- Validation */

/**
 * ตรวจสอบและทำความสะอาดข้อมูลจากแบบฟอร์ม
 * คืน object ที่พร้อมบันทึก หรือโยน error พร้อมข้อความภาษาไทย
 */
function validateRequestPayload_(payload) {
  var p = payload || {};
  var errors = [];
  var out = {};

  out.requesterName = truncate_(pick_(p, 'requesterName', ''), 150);
  if (out.requesterName.length < 2) errors.push('กรุณากรอกชื่อ-นามสกุลผู้ขอรับบริการ');

  out.requesterEmail = truncate_(str_(pick_(p, 'requesterEmail', '')).toLowerCase(), 254);
  if (!isValidEmail_(out.requesterEmail)) errors.push('รูปแบบอีเมลไม่ถูกต้อง');

  out.requesterPhone = normalizePhone_(pick_(p, 'requesterPhone', ''));
  if (!isValidPhone_(out.requesterPhone)) errors.push('กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก');

  var dept = truncate_(pick_(p, 'department', ''), 150);
  if (dept === 'อื่น ๆ') {
    var other = truncate_(pick_(p, 'departmentOther', ''), 150);
    if (!other) errors.push('กรุณาระบุชื่อหน่วยงานหรือสาขาวิชา');
    dept = other || dept;
  }
  if (!dept) errors.push('กรุณาเลือกหน่วยงาน / สาขาวิชา');
  out.department = dept;

  out.lineId = truncate_(pick_(p, 'lineId', ''), 80);

  out.projectName = truncate_(pick_(p, 'projectName', ''), 250);
  if (out.projectName.length < 3) errors.push('กรุณากรอกชื่อโครงการหรือกิจกรรม');

  var eventDate = parseDate_(pick_(p, 'eventDate', ''));
  out.eventDate = eventDate ? Utilities.formatDate(eventDate, APP.TIMEZONE, 'yyyy-MM-dd') : '';

  var due = parseDate_(pick_(p, 'dueDate', ''));
  if (!due) {
    errors.push('กรุณาระบุวันที่ต้องการใช้งานชิ้นงาน');
    out.dueDate = '';
  } else {
    var daysAhead = daysBetween_(new Date(), due);
    if (daysAhead < 0) {
      errors.push('วันที่ต้องการใช้งานต้องไม่เป็นวันที่ผ่านมาแล้ว');
    }
    out.dueDate = Utilities.formatDate(due, APP.TIMEZONE, 'yyyy-MM-dd');
  }

  out.objective = truncate_(pick_(p, 'objective', ''), 1500);
  if (out.objective.length < 10) errors.push('กรุณาระบุวัตถุประสงค์ของชิ้นงานอย่างน้อย 10 ตัวอักษร');

  out.targetAudience = truncate_(pick_(p, 'targetAudience', ''), 500);
  if (out.targetAudience.length < 2) errors.push('กรุณาระบุกลุ่มเป้าหมาย');

  out.keyMessage = truncate_(pick_(p, 'keyMessage', ''), 1500);
  if (out.keyMessage.length < 5) errors.push('กรุณาระบุข้อความหลักที่ต้องการสื่อสาร');

  out.mandatoryText = truncate_(pick_(p, 'mandatoryText', ''), 3000);
  out.notes = truncate_(pick_(p, 'notes', ''), 2000);

  var ref = truncate_(pick_(p, 'referenceUrl', ''), 2000);
  if (ref && !isValidUrl_(ref)) errors.push('ลิงก์ตัวอย่างอ้างอิงต้องขึ้นต้นด้วย http:// หรือ https://');
  out.referenceUrl = ref;

  var channels = pick_(p, 'channels', []);
  if (!Array.isArray(channels)) channels = splitList_(channels);
  channels = channels.map(function (c) { return truncate_(c, 80); })
    .filter(function (c) { return !!c; }).slice(0, 10);
  if (channels.length === 0) errors.push('กรุณาเลือกช่องทางที่จะนำชิ้นงานไปเผยแพร่อย่างน้อย 1 ช่องทาง');
  out.channels = joinList_(channels);

  // รายการชิ้นงานที่ขอ
  var items = pick_(p, 'deliverables', []);
  if (!Array.isArray(items)) items = [];
  var cleanItems = [];
  for (var i = 0; i < items.length && cleanItems.length < 10; i++) {
    var it = items[i] || {};
    var mediaKey = str_(it.mediaType);
    var info = mediaInfo_(mediaKey);
    if (!info) continue;
    var size = truncate_(pick_(it, 'size', ''), 120);
    if (size === 'อื่น ๆ (ระบุเอง)' || !size) size = truncate_(pick_(it, 'sizeOther', ''), 120);
    var label = info.label;
    if (mediaKey === 'other') {
      var otherLabel = truncate_(pick_(it, 'mediaOther', ''), 120);
      if (!otherLabel) {
        errors.push('กรุณาระบุประเภทสื่อในรายการที่เลือก "อื่น ๆ"');
      } else {
        label = otherLabel;
      }
    }
    if (!size) {
      errors.push('กรุณาระบุขนาดของชิ้นงาน "' + label + '"');
    }
    var qty = int_(pick_(it, 'quantity', 1), 1);
    if (qty < 1) qty = 1;
    if (qty > 1000) qty = 1000;
    cleanItems.push({
      mediaType: mediaKey,
      mediaLabel: label,
      size: size,
      quantity: qty,
      note: truncate_(pick_(it, 'note', ''), 500)
    });
  }
  if (cleanItems.length === 0) errors.push('กรุณาเลือกประเภทสื่อที่ต้องการอย่างน้อย 1 รายการ');
  out.deliverables = cleanItems;

  // งานด่วนต้องมีเหตุผล
  var minLead = getSettingInt_('minLeadDays', 7);
  out.rushReason = truncate_(pick_(p, 'rushReason', ''), 500);
  if (due) {
    var lead = daysBetween_(new Date(), due);
    if (lead >= 0 && lead < minLead && !out.rushReason) {
      errors.push('กำหนดส่งน้อยกว่า ' + minLead + ' วันทำการ กรุณาระบุเหตุผลความจำเป็นเร่งด่วน');
    }
  }

  if (pick_(p, 'acceptTerms', false) !== true && str_(pick_(p, 'acceptTerms', '')) !== 'true') {
    errors.push('กรุณายอมรับเงื่อนไขการให้บริการก่อนส่งคำขอ');
  }

  if (errors.length > 0) {
    throw appError_(errors.join('\n'));
  }
  return out;
}

/* --------------------------------------------------------------- Creating */

/** สร้างคำขอใหม่ คืนข้อมูลที่จำเป็นสำหรับหน้าอัปโหลดไฟล์ */
function createRequest_(payload) {
  if (!getSettingBool_('publicFormOpen', true)) {
    throw appError_(getSetting_('closedMessage', 'ขณะนี้ระบบปิดรับคำขอชั่วคราว'));
  }
  var data = validateRequestPayload_(payload);

  return withLock_(function () {
    var jobId = newJobId_();
    var folder = createJobFolder_(jobId, data.projectName);
    var now = nowIso_();
    var revisionLimit = getSettingInt_('revisionLimit', 3);

    var row = {
      jobId: jobId,
      createdAt: now,
      status: STATUS.NEW.key,
      priority: calcPriority_(data.dueDate),
      requesterName: data.requesterName,
      requesterEmail: data.requesterEmail,
      requesterPhone: data.requesterPhone,
      department: data.department,
      lineId: data.lineId,
      projectName: data.projectName,
      eventDate: data.eventDate,
      dueDate: data.dueDate,
      objective: data.objective,
      targetAudience: data.targetAudience,
      keyMessage: data.keyMessage,
      mandatoryText: data.mandatoryText,
      referenceUrl: data.referenceUrl,
      channels: data.channels,
      notes: data.notes,
      rushReason: data.rushReason,
      folderId: folder.id,
      folderUrl: folder.url,
      attachmentCount: 0,
      briefStatus: 'PENDING',
      briefText: '',
      briefMissing: '',
      briefGeneratedAt: '',
      briefSource: '',
      draftUrl: '',
      revisionCount: 0,
      revisionLimit: revisionLimit,
      assignedTo: '',
      submittedAt: '',
      startedAt: '',
      firstDraftAt: '',
      deliveredAt: '',
      closedAt: '',
      leadTimeDays: '',
      cancelReason: '',
      trackToken: makeTrackToken_(jobId),
      updatedAt: now,
      updatedBy: data.requesterEmail
    };
    insert_(SHEET.REQUESTS, row);

    for (var i = 0; i < data.deliverables.length; i++) {
      var d = data.deliverables[i];
      insert_(SHEET.DELIVERABLES, {
        id: newId_('D'),
        jobId: jobId,
        seq: i + 1,
        mediaType: d.mediaType,
        mediaLabel: d.mediaLabel,
        size: d.size,
        quantity: d.quantity,
        note: d.note
      });
    }

    logTimeline_(jobId, data.requesterName, 'CREATE', '', STATUS.NEW.key, 'ผู้ขอรับบริการยื่นคำขอผ่านแบบฟอร์มออนไลน์');

    return {
      jobId: jobId,
      trackToken: row.trackToken,
      folderUrl: folder.url,
      maxFiles: getSettingInt_('maxFiles', 8),
      maxFileMB: getSettingInt_('maxFileMB', 10),
      allowedFileTypes: getSetting_('allowedFileTypes', DEFAULT_SETTINGS.allowedFileTypes)
    };
  });
}

/**
 * ปิดการยื่นคำขอ: ส่งอีเมลยืนยัน แจ้งเจ้าหน้าที่ และเข้าคิวสรุป Design Brief
 * เรียกซ้ำได้ (idempotent) โดยดูจากคอลัมน์ submittedAt
 */
function finalizeRequest_(jobId) {
  var req = findBy_(SHEET.REQUESTS, 'jobId', jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  if (str_(req.submittedAt)) {
    return { jobId: req.jobId, alreadyFinalized: true, trackUrl: buildTrackUrl_(req) };
  }

  var count = filterBy_(SHEET.ATTACHMENTS, 'jobId', jobId).length;
  update_(SHEET.REQUESTS, req._row, {
    submittedAt: nowIso_(),
    attachmentCount: count,
    updatedAt: nowIso_()
  });
  req.submittedAt = nowIso_();
  req.attachmentCount = count;

  logTimeline_(jobId, req.requesterName, 'SUBMIT', '', STATUS.NEW.key,
    'ยืนยันการยื่นคำขอ พร้อมไฟล์แนบ ' + count + ' ไฟล์');

  // แจ้งผู้ขอรับบริการและเจ้าหน้าที่ (ไม่ให้ error ของอีเมลทำให้คำขอล้มเหลว)
  try {
    sendConfirmationEmail_(req);
  } catch (err) {
    logTimeline_(jobId, 'system', 'EMAIL_ERROR', '', '', 'ส่งอีเมลยืนยันไม่สำเร็จ: ' + err.message);
  }
  try {
    sendStaffNewRequestEmail_(req);
  } catch (err) {
    logTimeline_(jobId, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่ไม่สำเร็จ: ' + err.message);
  }
  try {
    scheduleWorker_();
  } catch (err) {
    // ทริกเกอร์ประจำทุก 5 นาทีจะจัดการให้เองอยู่แล้ว
  }

  return { jobId: req.jobId, trackUrl: buildTrackUrl_(req) };
}

/* ---------------------------------------------------------------- Reading */

function getRequest_(jobId) {
  return findBy_(SHEET.REQUESTS, 'jobId', str_(jobId).toUpperCase());
}

/** รวมข้อมูลคำขอ + รายการชิ้นงาน + ไฟล์ + ประวัติ */
function getRequestFull_(jobId) {
  var req = getRequest_(jobId);
  if (!req) return null;
  return {
    request: req,
    deliverables: filterBy_(SHEET.DELIVERABLES, 'jobId', req.jobId)
      .sort(function (a, b) { return int_(a.seq) - int_(b.seq); }),
    attachments: filterBy_(SHEET.ATTACHMENTS, 'jobId', req.jobId),
    revisions: filterBy_(SHEET.REVISIONS, 'jobId', req.jobId)
      .sort(function (a, b) { return int_(a.round) - int_(b.round); }),
    timeline: getTimeline_(req.jobId)
  };
}

/** สร้าง token สำหรับลิงก์ติดตามสถานะแบบคลิกเดียว */
function makeTrackToken_(jobId) {
  return hmac_('track:' + str_(jobId).toUpperCase(), getProp_(PROP.SECRET)).substring(0, 24);
}

function verifyTrackToken_(jobId, token) {
  return timingSafeEqual_(makeTrackToken_(jobId), str_(token));
}

function buildTrackUrl_(req) {
  var base = safeWebAppUrl_();
  if (!base) return '';
  return base + '?page=track&job=' + encodeURIComponent(req.jobId) + '&t=' + encodeURIComponent(req.trackToken);
}

/**
 * มุมมองสาธารณะสำหรับผู้ขอรับบริการ
 * ต้องยืนยันตัวตนด้วย token จากอีเมล หรืออีเมลที่ตรงกับผู้ยื่นคำขอ
 */
function getPublicView_(jobId, email, token) {
  var id = str_(jobId).toUpperCase();
  var req = getRequest_(id);
  if (!req) return null;

  var authorized = false;
  if (token && verifyTrackToken_(id, token)) authorized = true;
  if (!authorized && email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase()) authorized = true;
  if (!authorized) return null;

  var deliverables = filterBy_(SHEET.DELIVERABLES, 'jobId', id)
    .sort(function (a, b) { return int_(a.seq) - int_(b.seq); })
    .map(function (d) {
      return { mediaLabel: d.mediaLabel, size: d.size, quantity: int_(d.quantity), note: str_(d.note) };
    });

  var revisions = filterBy_(SHEET.REVISIONS, 'jobId', id)
    .sort(function (a, b) { return int_(a.round) - int_(b.round); })
    .map(function (r) {
      return { round: int_(r.round), createdAt: str_(r.createdAt), byName: str_(r.byName), comment: str_(r.comment) };
    });

  var timeline = getTimeline_(id)
    .filter(function (t) { return str_(t.action) !== 'EMAIL_ERROR' && str_(t.action) !== 'NOTE'; })
    .map(function (t) {
      return { at: str_(t.at), action: str_(t.action), toStatus: str_(t.toStatus), detail: str_(t.detail) };
    });

  var files = filterBy_(SHEET.ATTACHMENTS, 'jobId', id)
    .filter(function (f) { return str_(f.kind) === 'final'; })
    .map(function (f) { return { fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: int_(f.sizeBytes) }; });

  var info = statusInfo_(req.status);
  return {
    jobId: req.jobId,
    status: info.key,
    statusLabel: info.label,
    statusEn: info.en,
    statusStep: info.step,
    statusColor: info.color,
    priority: priorityInfo_(req.priority).label,
    projectName: req.projectName,
    requesterName: req.requesterName,
    department: req.department,
    createdAt: str_(req.createdAt),
    dueDate: str_(req.dueDate),
    deliveredAt: str_(req.deliveredAt),
    draftUrl: str_(req.draftUrl),
    revisionCount: int_(req.revisionCount),
    revisionLimit: int_(req.revisionLimit),
    cancelReason: str_(req.cancelReason),
    canRequestRevision: str_(req.status) === STATUS.REVIEW.key && int_(req.revisionCount) < int_(req.revisionLimit),
    canApprove: str_(req.status) === STATUS.REVIEW.key,
    deliverables: deliverables,
    revisions: revisions,
    finalFiles: files,
    timeline: timeline
  };
}

/* ------------------------------------------------------- Status & actions */

/** ตรวจว่าเปลี่ยนสถานะได้หรือไม่ */
function canTransition_(from, to) {
  var allowed = STATUS_TRANSITIONS[str_(from).toUpperCase()];
  if (!allowed) return false;
  return allowed.indexOf(str_(to).toUpperCase()) >= 0;
}

/**
 * เปลี่ยนสถานะงาน (ใช้โดยเจ้าหน้าที่)
 * options: { detail, draftUrl, cancelReason, notify }
 */
function changeStatus_(jobId, toStatus, actor, options) {
  var opts = options || {};
  return withLock_(function () {
    var req = getRequest_(jobId);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
    var from = str_(req.status).toUpperCase();
    var to = str_(toStatus).toUpperCase();
    if (!STATUS[to]) throw appError_('สถานะปลายทางไม่ถูกต้อง');
    if (from === to) throw appError_('งานนี้อยู่ในสถานะ "' + statusInfo_(to).label + '" อยู่แล้ว');
    if (!canTransition_(from, to)) {
      throw appError_('ไม่สามารถเปลี่ยนสถานะจาก "' + statusInfo_(from).label +
        '" ไปเป็น "' + statusInfo_(to).label + '" ได้');
    }

    var patch = { status: to, updatedAt: nowIso_(), updatedBy: str_(actor) };

    if (to === STATUS.DESIGNING.key && !str_(req.startedAt)) {
      patch.startedAt = nowIso_();
    }

    if (to === STATUS.REVIEW.key) {
      var draftUrl = str_(pick_(opts, 'draftUrl', req.draftUrl));
      if (!draftUrl) throw appError_('กรุณาระบุลิงก์ร่างชิ้นงานก่อนเปลี่ยนเป็นสถานะรอตรวจร่าง');
      if (!isValidUrl_(draftUrl)) throw appError_('ลิงก์ร่างชิ้นงานต้องขึ้นต้นด้วย http:// หรือ https://');
      patch.draftUrl = draftUrl;
      if (!str_(req.firstDraftAt)) patch.firstDraftAt = nowIso_();
    }

    if (to === STATUS.DELIVERED.key) {
      patch.deliveredAt = nowIso_();
      patch.closedAt = nowIso_();
      var lead = daysBetween_(req.submittedAt || req.createdAt, new Date());
      patch.leadTimeDays = lead === null ? '' : lead;
    }

    if (to === STATUS.CANCELLED.key) {
      var reason = truncate_(pick_(opts, 'cancelReason', ''), 500);
      if (!reason) throw appError_('กรุณาระบุเหตุผลในการยกเลิกคำขอ');
      patch.cancelReason = reason;
      patch.closedAt = nowIso_();
    }

    if (to === STATUS.INFO_NEEDED.key) {
      var ask = truncate_(pick_(opts, 'detail', ''), 1000);
      if (!ask) throw appError_('กรุณาระบุรายการข้อมูลที่ต้องการเพิ่มเติม');
    }

    update_(SHEET.REQUESTS, req._row, patch);
    logTimeline_(jobId, actor, 'STATUS', from, to, truncate_(pick_(opts, 'detail', ''), 1000));

    var updated = getRequest_(jobId);
    if (pick_(opts, 'notify', true) !== false) {
      try {
        sendStatusChangeEmail_(updated, from, to, str_(pick_(opts, 'detail', '')));
      } catch (err) {
        logTimeline_(jobId, 'system', 'EMAIL_ERROR', '', '', 'ส่งอีเมลแจ้งสถานะไม่สำเร็จ: ' + err.message);
      }
    }
    return updated;
  });
}

/**
 * บันทึกหรือแก้ไขลิงก์ร่างชิ้นงานโดยไม่เปลี่ยนสถานะ
 * ใช้ตอนอัปโหลดร่างเวอร์ชันใหม่ระหว่างรอบแก้ไข
 */
function setDraftUrl_(jobId, url, actor) {
  var req = getRequest_(jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  var link = truncate_(url, 2000);
  if (!isValidUrl_(link)) throw appError_('ลิงก์ร่างชิ้นงานต้องขึ้นต้นด้วย http:// หรือ https://');
  update_(SHEET.REQUESTS, req._row, {
    draftUrl: link, updatedAt: nowIso_(), updatedBy: str_(actor)
  });
  logTimeline_(jobId, actor, 'DRAFT_LINK', '', '', 'บันทึกลิงก์ร่างชิ้นงาน: ' + link);
  return getRequest_(jobId);
}

/** มอบหมายผู้รับผิดชอบ */
function assignRequest_(jobId, assignee, actor) {
  var req = getRequest_(jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  var name = truncate_(assignee, 150);
  update_(SHEET.REQUESTS, req._row, { assignedTo: name, updatedAt: nowIso_(), updatedBy: str_(actor) });
  logTimeline_(jobId, actor, 'ASSIGN', '', '', 'มอบหมายให้ ' + (name || '(ไม่ระบุ)'));
  return getRequest_(jobId);
}

/** ปรับจำนวนรอบแก้ไขสูงสุดของงานใบนี้ */
function setRevisionLimit_(jobId, limit, actor) {
  var req = getRequest_(jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  var n = int_(limit, 0);
  if (n < 1 || n > 20) throw appError_('จำนวนรอบแก้ไขต้องอยู่ระหว่าง 1 ถึง 20');
  if (n < int_(req.revisionCount)) {
    throw appError_('กำหนดรอบแก้ไขน้อยกว่าจำนวนที่ใช้ไปแล้ว (' + int_(req.revisionCount) + ' รอบ) ไม่ได้');
  }
  update_(SHEET.REQUESTS, req._row, { revisionLimit: n, updatedAt: nowIso_(), updatedBy: str_(actor) });
  logTimeline_(jobId, actor, 'NOTE', '', '', 'ปรับจำนวนรอบแก้ไขสูงสุดเป็น ' + n + ' รอบ');
  return getRequest_(jobId);
}

/** บันทึกโน้ตภายใน */
function addInternalNote_(jobId, note, actor) {
  var req = getRequest_(jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  var text = truncate_(note, 1000);
  if (!text) throw appError_('กรุณากรอกข้อความ');
  logTimeline_(jobId, actor, 'NOTE', '', '', text);
  update_(SHEET.REQUESTS, req._row, { updatedAt: nowIso_(), updatedBy: str_(actor) });
  return true;
}

/* -------------------------------------------------------------- Revisions */

/**
 * ผู้ขอรับบริการส่งคำขอแก้ไขร่าง
 * ต้องอยู่สถานะรอตรวจร่าง และยังไม่เกินจำนวนรอบที่กำหนด
 */
function addRevision_(jobId, email, token, comment) {
  return withLock_(function () {
    var id = str_(jobId).toUpperCase();
    var req = getRequest_(id);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);

    var authorized = (token && verifyTrackToken_(id, token)) ||
      (email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase());
    if (!authorized) throw appError_('ไม่มีสิทธิ์ดำเนินการกับคำขอนี้');

    if (str_(req.status) !== STATUS.REVIEW.key) {
      throw appError_('ขณะนี้งานอยู่ในสถานะ "' + statusInfo_(req.status).label +
        '" จึงยังส่งคำขอแก้ไขไม่ได้ ระบบจะเปิดให้แก้ไขเมื่อมีร่างชิ้นงานให้ตรวจ');
    }

    var used = int_(req.revisionCount);
    var limit = int_(req.revisionLimit) || getSettingInt_('revisionLimit', 3);
    if (used >= limit) {
      throw appError_('ใช้สิทธิ์แก้ไขครบ ' + limit + ' รอบแล้ว กรุณาติดต่อฝ่ายสื่อสารองค์กรโดยตรง');
    }

    var text = truncate_(comment, 2000);
    if (text.length < 5) throw appError_('กรุณาระบุรายละเอียดจุดที่ต้องการแก้ไข');

    var round = used + 1;
    insert_(SHEET.REVISIONS, {
      id: newId_('R'),
      jobId: id,
      round: round,
      createdAt: nowIso_(),
      byName: req.requesterName,
      byEmail: req.requesterEmail,
      comment: text,
      draftUrl: str_(req.draftUrl),
      resolvedAt: ''
    });

    update_(SHEET.REQUESTS, req._row, {
      revisionCount: round,
      status: STATUS.REVISING.key,
      updatedAt: nowIso_(),
      updatedBy: req.requesterEmail
    });

    logTimeline_(id, req.requesterName, 'REVISION', STATUS.REVIEW.key, STATUS.REVISING.key,
      'ขอแก้ไขรอบที่ ' + round + ': ' + truncate_(text, 300));

    try {
      sendRevisionToStaffEmail_(getRequest_(id), round, text);
    } catch (err) {
      logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องขอแก้ไขไม่สำเร็จ: ' + err.message);
    }

    return { jobId: id, round: round, remaining: limit - round };
  });
}

/** ผู้ขอรับบริการอนุมัติร่างชิ้นงาน */
function approveDraft_(jobId, email, token) {
  var id = str_(jobId).toUpperCase();
  var req = getRequest_(id);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);

  var authorized = (token && verifyTrackToken_(id, token)) ||
    (email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase());
  if (!authorized) throw appError_('ไม่มีสิทธิ์ดำเนินการกับคำขอนี้');

  if (str_(req.status) !== STATUS.REVIEW.key) {
    throw appError_('อนุมัติได้เฉพาะเมื่องานอยู่ในสถานะรอตรวจร่างเท่านั้น');
  }

  logTimeline_(id, req.requesterName, 'APPROVE', STATUS.REVIEW.key, STATUS.REVIEW.key,
    'ผู้ขอรับบริการอนุมัติร่างชิ้นงานแล้ว รอเจ้าหน้าที่ส่งมอบไฟล์ฉบับสมบูรณ์');
  update_(SHEET.REQUESTS, req._row, { updatedAt: nowIso_(), updatedBy: req.requesterEmail });

  try {
    sendApprovalToStaffEmail_(getRequest_(id));
  } catch (err) {
    logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องอนุมัติไม่สำเร็จ: ' + err.message);
  }
  return { jobId: id, approved: true };
}

/* ------------------------------------------------------------- Admin list */

/**
 * รายการคำขอสำหรับหน้าเจ้าหน้าที่
 * filter: { status, priority, q, from, to, assignedTo }
 */
function listRequests_(filter) {
  var f = filter || {};
  var rows = readAll_(SHEET.REQUESTS);
  var status = str_(f.status).toUpperCase();
  var priority = str_(f.priority).toUpperCase();
  var q = str_(f.q).toLowerCase();
  var from = parseDate_(f.from);
  var to = parseDate_(f.to);
  var assignee = str_(f.assignedTo).toLowerCase();

  var out = rows.filter(function (r) {
    if (status && str_(r.status).toUpperCase() !== status) return false;
    if (priority && str_(r.priority).toUpperCase() !== priority) return false;
    if (assignee && str_(r.assignedTo).toLowerCase().indexOf(assignee) < 0) return false;
    if (from || to) {
      var created = parseDate_(r.createdAt);
      if (!created) return false;
      if (from && created < startOfDay_(from)) return false;
      if (to) {
        var end = startOfDay_(to);
        end = new Date(end.getTime() + 86400000);
        if (created >= end) return false;
      }
    }
    if (q) {
      var hay = [r.jobId, r.projectName, r.requesterName, r.requesterEmail, r.department,
        r.requesterPhone, r.assignedTo].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });

  // เรียงจากใหม่ไปเก่า ถ้าเวลาตรงกันให้ใช้เลขที่คำขอเป็นตัวตัดสิน
  out.sort(function (a, b) {
    var x = str_(a.createdAt);
    var y = str_(b.createdAt);
    if (x !== y) return x < y ? 1 : -1;
    var ja = str_(a.jobId);
    var jb = str_(b.jobId);
    if (ja === jb) return 0;
    return ja < jb ? 1 : -1;
  });

  return out.map(function (r) {
    var info = statusInfo_(r.status);
    var pinfo = priorityInfo_(r.priority);
    var due = parseDate_(r.dueDate);
    var daysLeft = due ? daysBetween_(new Date(), due) : null;
    return {
      jobId: r.jobId,
      createdAt: str_(r.createdAt),
      status: info.key,
      statusLabel: info.label,
      statusColor: info.color,
      priority: pinfo.key,
      priorityLabel: pinfo.label,
      priorityColor: pinfo.color,
      requesterName: r.requesterName,
      requesterEmail: r.requesterEmail,
      requesterPhone: r.requesterPhone,
      department: r.department,
      projectName: r.projectName,
      dueDate: str_(r.dueDate),
      daysLeft: daysLeft,
      overdue: daysLeft !== null && daysLeft < 0 && str_(r.status) !== STATUS.DELIVERED.key &&
        str_(r.status) !== STATUS.CANCELLED.key,
      assignedTo: str_(r.assignedTo),
      revisionCount: int_(r.revisionCount),
      revisionLimit: int_(r.revisionLimit),
      attachmentCount: int_(r.attachmentCount),
      briefStatus: str_(r.briefStatus),
      folderUrl: str_(r.folderUrl),
      draftUrl: str_(r.draftUrl)
    };
  });
}


/* ==========================================================================
   05_Files.gs
   ========================================================================== */

/**
 * 05_Files.gs — จัดการไฟล์บน Google Drive
 * โครงสร้าง: Design Request System / คำขอรับบริการ (Jobs) / <เลขที่คำขอ> <ชื่อโครงการ>
 */

/** สร้างโฟลเดอร์ประจำงานหนึ่งใบ */
function createJobFolder_(jobId, projectName) {
  var parentId = getProp_(PROP.JOBS_FOLDER_ID);
  if (!parentId) throw appError_('ยังไม่ได้ติดตั้งโฟลเดอร์ระบบ กรุณาเรียก setupSystem() ก่อน');
  var parent = DriveApp.getFolderById(parentId);
  var name = jobId + ' ' + safeFileName_(truncate_(projectName, 80));
  var folder = parent.createFolder(name);
  folder.setDescription('คำขอรับบริการออกแบบ ' + jobId + ' | ' + APP.ORG);
  return { id: folder.getId(), url: folder.getUrl() };
}

/**
 * ตั้งชื่อไฟล์ตามมาตรฐาน เพื่อให้สืบค้นย้อนหลังได้
 *  - ไฟล์ต้นทางจากผู้ขอ : DR-2569-0001_SRC_ชื่อเดิม.ext
 *  - ไฟล์ส่งมอบ         : DR-2569-0001_FINAL_ชื่อโครงการ_01.ext
 */
function standardFileName_(req, originalName, kind, seq) {
  var name = safeFileName_(originalName);
  var dot = name.lastIndexOf('.');
  var base = dot > 0 ? name.substring(0, dot) : name;
  var ext = dot > 0 ? name.substring(dot + 1).toLowerCase() : 'dat';
  if (kind === 'final') {
    var project = safeFileName_(truncate_(req.projectName, 60));
    var idx = ('00' + int_(seq, 1)).slice(-2);
    return req.jobId + '_FINAL_' + project + '_' + idx + '.' + ext;
  }
  if (kind === 'draft') {
    return req.jobId + '_DRAFT_' + truncate_(base, 60) + '.' + ext;
  }
  return req.jobId + '_SRC_' + truncate_(base, 60) + '.' + ext;
}

/**
 * อัปโหลดไฟล์แนบเข้าโฟลเดอร์ของงาน
 * payload: { fileName, mimeType, dataB64 }
 * kind: 'source' (ผู้ขอแนบ) | 'final' (ไฟล์ส่งมอบ) | 'draft'
 */
function uploadAttachment_(jobId, payload, kind, uploader) {
  var req = getRequest_(jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);

  var fileKind = ['source', 'final', 'draft'].indexOf(str_(kind)) >= 0 ? str_(kind) : 'source';
  var fileName = truncate_(pick_(payload, 'fileName', ''), 200);
  var dataB64 = str_(pick_(payload, 'dataB64', ''));
  if (!fileName) throw appError_('ไม่พบชื่อไฟล์');
  if (!dataB64) throw appError_('ไม่พบข้อมูลไฟล์');

  var allowed = getSetting_('allowedFileTypes', DEFAULT_SETTINGS.allowedFileTypes);
  if (!isAllowedFile_(fileName, allowed)) {
    throw appError_('ไม่รองรับไฟล์ชนิดนี้ (รองรับเฉพาะ ' + allowed + ')');
  }

  var maxFiles = getSettingInt_('maxFiles', 8);
  var existing = filterBy_(SHEET.ATTACHMENTS, 'jobId', req.jobId);
  if (fileKind === 'source') {
    var sourceCount = existing.filter(function (f) { return str_(f.kind) === 'source'; }).length;
    if (sourceCount >= maxFiles) {
      throw appError_('แนบไฟล์ได้สูงสุด ' + maxFiles + ' ไฟล์ต่อหนึ่งคำขอ');
    }
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(dataB64);
  } catch (err) {
    throw appError_('ไฟล์เสียหายหรืออ่านไม่ได้ กรุณาลองใหม่');
  }
  var maxBytes = getSettingInt_('maxFileMB', 10) * 1024 * 1024;
  if (bytes.length > maxBytes) {
    throw appError_('ไฟล์ "' + fileName + '" มีขนาด ' + formatBytes_(bytes.length) +
      ' เกินกำหนด ' + getSettingInt_('maxFileMB', 10) + ' MB');
  }

  var mime = str_(pick_(payload, 'mimeType', '')) || 'application/octet-stream';
  var finalSeq = existing.filter(function (f) { return str_(f.kind) === 'final'; }).length + 1;
  var storedName = standardFileName_(req, fileName, fileKind, finalSeq);

  var folder = DriveApp.getFolderById(req.folderId);
  var blob = Utilities.newBlob(bytes, mime, storedName);
  var file = folder.createFile(blob);

  var url = file.getUrl();
  if (fileKind === 'final') {
    url = shareFileSafely_(file);
  }

  var record = {
    id: newId_('F'),
    jobId: req.jobId,
    kind: fileKind,
    fileName: storedName,
    fileId: file.getId(),
    fileUrl: url,
    mimeType: mime,
    sizeBytes: bytes.length,
    uploadedAt: nowIso_(),
    uploadedBy: truncate_(uploader || req.requesterEmail, 150)
  };
  insert_(SHEET.ATTACHMENTS, record);

  var newCount = filterBy_(SHEET.ATTACHMENTS, 'jobId', req.jobId).length;
  update_(SHEET.REQUESTS, req._row, { attachmentCount: newCount, updatedAt: nowIso_() });

  if (fileKind !== 'source') {
    logTimeline_(req.jobId, uploader, 'UPLOAD', '', '',
      'อัปโหลดไฟล์ ' + (fileKind === 'final' ? 'ฉบับสมบูรณ์' : 'ร่าง') + ': ' + storedName);
  }

  return {
    id: record.id,
    fileName: storedName,
    fileUrl: url,
    sizeBytes: bytes.length,
    sizeLabel: formatBytes_(bytes.length)
  };
}

/**
 * เปิดสิทธิ์ให้เปิดไฟล์ผ่านลิงก์ได้
 * หากนโยบายองค์กรไม่อนุญาตแบบสาธารณะ จะลดเหลือเฉพาะคนในโดเมน
 */
function shareFileSafely_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err2) {
      // ปล่อยเป็นค่าเริ่มต้น ผู้รับต้องกดขอสิทธิ์
    }
    return file.getUrl();
  }
}

/** ลบไฟล์แนบ (ย้ายลงถังขยะ) */
function deleteAttachment_(attachmentId, actor) {
  var rec = findBy_(SHEET.ATTACHMENTS, 'id', attachmentId);
  if (!rec) throw appError_('ไม่พบไฟล์ที่ต้องการลบ');
  try {
    DriveApp.getFileById(rec.fileId).setTrashed(true);
  } catch (err) {
    // ไฟล์อาจถูกลบไปแล้ว ให้ลบเฉพาะทะเบียน
  }
  remove_(SHEET.ATTACHMENTS, rec._row);
  var req = getRequest_(rec.jobId);
  if (req) {
    var newCount = filterBy_(SHEET.ATTACHMENTS, 'jobId', rec.jobId).length;
    update_(SHEET.REQUESTS, req._row, { attachmentCount: newCount, updatedAt: nowIso_() });
  }
  logTimeline_(rec.jobId, actor, 'DELETE_FILE', '', '', 'ลบไฟล์ ' + rec.fileName);
  return true;
}

/** รายการไฟล์ของงานหนึ่งใบ */
function listAttachments_(jobId, kind) {
  var all = filterBy_(SHEET.ATTACHMENTS, 'jobId', str_(jobId).toUpperCase());
  var k = str_(kind);
  return all.filter(function (f) { return !k || str_(f.kind) === k; })
    .map(function (f) {
      return {
        id: f.id,
        kind: f.kind,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        sizeBytes: int_(f.sizeBytes),
        sizeLabel: formatBytes_(f.sizeBytes),
        uploadedAt: str_(f.uploadedAt),
        uploadedBy: str_(f.uploadedBy)
      };
    });
}

/** คลังผลงาน: งานที่ส่งมอบแล้วพร้อมไฟล์ฉบับสมบูรณ์ */
function listAssetLibrary_(filter) {
  var f = filter || {};
  var q = str_(f.q).toLowerCase();
  var year = str_(f.year);
  var media = str_(f.mediaType);

  var delivered = readAll_(SHEET.REQUESTS).filter(function (r) {
    return str_(r.status) === STATUS.DELIVERED.key;
  });

  var allFiles = readAll_(SHEET.ATTACHMENTS).filter(function (a) { return str_(a.kind) === 'final'; });
  var filesByJob = {};
  for (var i = 0; i < allFiles.length; i++) {
    var jid = str_(allFiles[i].jobId);
    if (!filesByJob[jid]) filesByJob[jid] = [];
    filesByJob[jid].push({ fileName: allFiles[i].fileName, fileUrl: allFiles[i].fileUrl });
  }

  var allItems = readAll_(SHEET.DELIVERABLES);
  var itemsByJob = {};
  for (var j = 0; j < allItems.length; j++) {
    var k = str_(allItems[j].jobId);
    if (!itemsByJob[k]) itemsByJob[k] = [];
    itemsByJob[k].push(allItems[j]);
  }

  return delivered.filter(function (r) {
    if (year && str_(r.deliveredAt).substring(0, 4) !== year) return false;
    if (media) {
      var items = itemsByJob[str_(r.jobId)] || [];
      var found = items.some(function (it) { return str_(it.mediaType) === media; });
      if (!found) return false;
    }
    if (q) {
      var hay = [r.jobId, r.projectName, r.department, r.requesterName].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) {
    var x = str_(a.deliveredAt);
    var y = str_(b.deliveredAt);
    if (x !== y) return x < y ? 1 : -1;
    var ja = str_(a.jobId);
    var jb = str_(b.jobId);
    if (ja === jb) return 0;
    return ja < jb ? 1 : -1;
  }).map(function (r) {
    var items = itemsByJob[str_(r.jobId)] || [];
    return {
      jobId: r.jobId,
      projectName: r.projectName,
      department: r.department,
      deliveredAt: str_(r.deliveredAt),
      folderUrl: str_(r.folderUrl),
      media: items.map(function (it) { return str_(it.mediaLabel); }).join(', '),
      files: filesByJob[str_(r.jobId)] || []
    };
  });
}


/* ==========================================================================
   06_Mailer.gs
   ========================================================================== */

/**
 * 06_Mailer.gs — อีเมลแจ้งเตือนทุกชนิด
 */

/** ส่งอีเมล (คืน true/false ไม่โยน error ออกไปนอกจากผู้เรียกต้องการ) */
function sendMail_(to, subject, htmlBody) {
  var recipients = Array.isArray(to) ? to.join(',') : str_(to);
  if (!recipients) return false;
  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    htmlBody: htmlBody,
    name: getSetting_('fromName', DEFAULT_SETTINGS.fromName),
    replyTo: getSetting_('replyTo', DEFAULT_SETTINGS.replyTo)
  });
  return true;
}

/**
 * อีเมลของเจ้าของสคริปต์ (บัญชีที่ deploy เว็บแอป)
 * อ่านครั้งแรกแล้วจำไว้ใน Script Properties เพื่อไม่ต้องเรียก Session ซ้ำทุกครั้ง
 */
function ownerEmail_() {
  var saved = getProp_(PROP.OWNER_EMAIL);
  if (saved) return saved;
  var email = '';
  try {
    email = str_(Session.getEffectiveUser().getEmail()).toLowerCase();
  } catch (err) {
    email = '';
  }
  if (email && isValidEmail_(email)) {
    setProp_(PROP.OWNER_EMAIL, email);
    return email;
  }
  return '';
}

/**
 * รายชื่ออีเมลที่ต้องแจ้งเตือนเมื่อมีคำขอใหม่หรือมีความเคลื่อนไหว
 * รวมอีเมลเจ้าของสคริปต์เสมอ เพื่อให้ผู้ออกแบบได้รับแจ้งแน่นอน
 * แม้ค่าตั้งค่า notifyEmails จะถูกแก้ผิดพลาด
 */
function staffRecipients_() {
  var list = splitList_(getSetting_('notifyEmails', DEFAULT_SETTINGS.notifyEmails));
  if (getSettingBool_('notifyOwnerAlways', true)) {
    list.push(ownerEmail_());
  }
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var email = str_(list[i]).toLowerCase();
    if (!email || !isValidEmail_(email) || seen[email]) continue;
    seen[email] = true;
    out.push(email);
  }
  return out;
}

/** โครงอีเมลมาตรฐานของระบบ */
function emailShell_(headline, subline, bodyHtml, ctaLabel, ctaUrl) {
  var cta = '';
  if (ctaLabel && ctaUrl) {
    cta =
      '<tr><td style="padding:8px 32px 32px 32px;">' +
        '<a href="' + escapeHtml_(ctaUrl) + '" ' +
        'style="display:inline-block;background:' + BRAND.primary + ';color:#ffffff;' +
        'text-decoration:none;font-weight:600;padding:13px 30px;border-radius:30px;font-size:15px;">' +
        escapeHtml_(ctaLabel) + '</a>' +
      '</td></tr>';
  }
  return '' +
  '<div style="background:' + BRAND.bg + ';padding:24px 12px;font-family:\'Segoe UI\',Tahoma,sans-serif;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;' +
      'border:1px solid ' + BRAND.border + ';">' +
      '<tr><td style="background:linear-gradient(135deg,' + BRAND.primary + ' 0%,' + BRAND.accent + ' 100%);' +
        'padding:28px 32px;color:#ffffff;">' +
        '<div style="font-size:20px;font-weight:700;line-height:1.4;">' + escapeHtml_(headline) + '</div>' +
        '<div style="font-size:13px;opacity:.92;margin-top:6px;">' + escapeHtml_(subline) + '</div>' +
      '</td></tr>' +
      '<tr><td style="padding:28px 32px 8px 32px;color:' + BRAND.textDark + ';font-size:14px;line-height:1.8;">' +
        bodyHtml +
      '</td></tr>' +
      cta +
      '<tr><td style="padding:18px 32px;background:' + BRAND.bg + ';border-top:1px solid ' + BRAND.border + ';' +
        'color:' + BRAND.textLight + ';font-size:12px;line-height:1.7;">' +
        escapeHtml_(APP.ORG) + '<br>' +
        'อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ หากมีข้อสงสัยกรุณาตอบกลับอีเมลนี้ได้โดยตรง' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}

/** ตารางข้อมูลแบบ key-value สำหรับใส่ในอีเมล */
function emailTable_(pairs) {
  var rows = '';
  for (var i = 0; i < pairs.length; i++) {
    var label = pairs[i][0];
    var value = pairs[i][1];
    if (value === '' || value === null || value === undefined) continue;
    rows +=
      '<tr>' +
        '<td style="padding:7px 12px 7px 0;color:' + BRAND.textLight + ';font-size:13px;' +
          'white-space:nowrap;vertical-align:top;width:38%;">' + escapeHtml_(label) + '</td>' +
        '<td style="padding:7px 0;color:' + BRAND.textDark + ';font-size:13px;font-weight:500;">' +
          value + '</td>' +
      '</tr>';
  }
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
    'style="margin:6px 0 14px 0;border-collapse:collapse;">' + rows + '</table>';
}

/** กล่องเน้นข้อความ */
function emailNotice_(text, color) {
  return '<div style="background:#fff7ed;border-left:4px solid ' + (color || BRAND.primary) + ';' +
    'border-radius:10px;padding:14px 16px;margin:6px 0 16px 0;font-size:13px;line-height:1.75;">' +
    text + '</div>';
}

/** สรุปรายการชิ้นงานเป็น HTML */
function deliverablesHtml_(jobId) {
  var items = filterBy_(SHEET.DELIVERABLES, 'jobId', jobId)
    .sort(function (a, b) { return int_(a.seq) - int_(b.seq); });
  if (items.length === 0) return '';
  var lis = items.map(function (it) {
    var parts = [escapeHtml_(it.mediaLabel)];
    if (str_(it.size)) parts.push('ขนาด ' + escapeHtml_(it.size));
    if (int_(it.quantity) > 1) parts.push('จำนวน ' + int_(it.quantity) + ' ชิ้น');
    return '<li style="margin-bottom:4px;">' + parts.join(' &middot; ') + '</li>';
  }).join('');
  return '<ul style="padding-left:20px;margin:4px 0 14px 0;font-size:13px;line-height:1.7;">' + lis + '</ul>';
}

/* -------------------------------------------------------- อีเมลถึงผู้ขอ */

/** อีเมลยืนยันการรับคำขอ พร้อมเลขที่งานและลิงก์ติดตาม */
function sendConfirmationEmail_(req) {
  var trackUrl = buildTrackUrl_(req);
  var body =
    '<p>เรียน คุณ' + escapeHtml_(req.requesterName) + '</p>' +
    '<p>ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ ได้รับคำขอรับบริการออกแบบสื่อประชาสัมพันธ์ของท่านเรียบร้อยแล้ว ' +
    'โดยระบบได้ออกเลขที่คำขอสำหรับใช้ติดตามสถานะงานดังนี้</p>' +
    '<div style="text-align:center;margin:18px 0 22px 0;">' +
      '<div style="display:inline-block;border:2px dashed ' + BRAND.primary + ';border-radius:14px;' +
        'padding:14px 28px;background:#fff7ed;">' +
        '<div style="font-size:12px;color:' + BRAND.textLight + ';">เลขที่คำขอ (Job ID)</div>' +
        '<div style="font-size:24px;font-weight:700;letter-spacing:1px;color:' + BRAND.primary + ';">' +
          escapeHtml_(req.jobId) + '</div>' +
      '</div>' +
    '</div>' +
    emailTable_([
      ['ชื่อโครงการ / กิจกรรม', escapeHtml_(req.projectName)],
      ['หน่วยงาน', escapeHtml_(req.department)],
      ['วันที่ยื่นคำขอ', escapeHtml_(formatThaiDate_(req.createdAt, true))],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))],
      ['ไฟล์แนบ', int_(req.attachmentCount) + ' ไฟล์']
    ]) +
    '<div style="font-weight:600;margin-bottom:4px;">รายการชิ้นงานที่ขอรับบริการ</div>' +
    deliverablesHtml_(req.jobId) +
    emailNotice_(
      '<strong>ขั้นตอนถัดไป</strong><br>' +
      'เจ้าหน้าที่จะตรวจสอบความครบถ้วนของข้อมูลและจัดลำดับคิวงาน ' +
      'ท่านสามารถติดตามสถานะได้ตลอดเวลาจากลิงก์ด้านล่าง ' +
      'และจะได้รับอีเมลแจ้งเตือนทุกครั้งที่สถานะงานเปลี่ยนแปลง<br>' +
      'สิทธิ์การแก้ไขชิ้นงาน: ไม่เกิน <strong>' + int_(req.revisionLimit) + ' รอบ</strong> ต่อหนึ่งคำขอ'
    );
  return sendMail_(req.requesterEmail,
    '[' + req.jobId + '] ยืนยันการรับคำขอออกแบบสื่อประชาสัมพันธ์',
    emailShell_('รับคำขอเรียบร้อยแล้ว', APP.ORG, body,
      trackUrl ? 'ติดตามสถานะงาน' : '', trackUrl));
}

/** อีเมลแจ้งเมื่อสถานะเปลี่ยน */
function sendStatusChangeEmail_(req, fromStatus, toStatus, detail) {
  var info = statusInfo_(toStatus);
  var trackUrl = buildTrackUrl_(req);
  var intro = '';
  var extra = '';
  var ctaLabel = 'ดูรายละเอียดงาน';
  var ctaUrl = trackUrl;

  if (toStatus === STATUS.DESIGNING.key) {
    intro = 'ฝ่ายสื่อสารองค์กรได้เริ่มดำเนินการออกแบบชิ้นงานของท่านแล้ว';
  } else if (toStatus === STATUS.REVIEW.key) {
    intro = 'ร่างชิ้นงานพร้อมให้ท่านตรวจสอบแล้ว กรุณาตรวจร่างและแจ้งจุดแก้ไขผ่านระบบ ' +
      'เพื่อให้การสื่อสารครบถ้วนในคราวเดียว';
    extra = emailNotice_(
      'สิทธิ์การแก้ไขคงเหลือ <strong>' +
      Math.max(0, int_(req.revisionLimit) - int_(req.revisionCount)) + ' รอบ</strong> ' +
      'จากทั้งหมด ' + int_(req.revisionLimit) + ' รอบ' +
      (str_(req.draftUrl) ? '<br>ลิงก์ร่างชิ้นงาน: <a href="' + escapeHtml_(req.draftUrl) + '">' +
        escapeHtml_(req.draftUrl) + '</a>' : '')
    );
    ctaLabel = 'ตรวจร่างและแจ้งแก้ไข';
  } else if (toStatus === STATUS.REVISING.key) {
    intro = 'ระบบได้รับข้อแก้ไขของท่านแล้ว ฝ่ายสื่อสารองค์กรกำลังปรับแก้ชิ้นงานตามที่แจ้ง';
  } else if (toStatus === STATUS.DELIVERED.key) {
    intro = 'ชิ้นงานของท่านเสร็จสมบูรณ์และส่งมอบเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ';
    var files = listAttachments_(req.jobId, 'final');
    if (files.length > 0) {
      var lis = files.map(function (f) {
        return '<li style="margin-bottom:5px;"><a href="' + escapeHtml_(f.fileUrl) + '" ' +
          'style="color:' + BRAND.primary + ';">' + escapeHtml_(f.fileName) + '</a> ' +
          '<span style="color:' + BRAND.textLight + ';">(' + escapeHtml_(f.sizeLabel) + ')</span></li>';
      }).join('');
      extra = '<div style="font-weight:600;margin-bottom:4px;">ไฟล์ฉบับสมบูรณ์</div>' +
        '<ul style="padding-left:20px;margin:4px 0 14px 0;font-size:13px;">' + lis + '</ul>';
    }
  } else if (toStatus === STATUS.INFO_NEEDED.key) {
    intro = 'เจ้าหน้าที่ขอข้อมูลเพิ่มเติมเพื่อให้สามารถเริ่มออกแบบได้ กรุณาตอบกลับอีเมลฉบับนี้';
    extra = emailNotice_('<strong>ข้อมูลที่ยังขาด</strong><br>' + nl2br_(detail), '#dc2626');
  } else if (toStatus === STATUS.CANCELLED.key) {
    intro = 'คำขอของท่านถูกยกเลิก';
    extra = emailNotice_('<strong>เหตุผล</strong><br>' + nl2br_(req.cancelReason || detail), '#64748b');
  } else {
    intro = 'สถานะคำขอของท่านมีการเปลี่ยนแปลง';
  }

  var body =
    '<p>เรียน คุณ' + escapeHtml_(req.requesterName) + '</p>' +
    '<p>' + escapeHtml_(intro) + '</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['สถานะเดิม', escapeHtml_(statusInfo_(fromStatus).label)],
      ['สถานะปัจจุบัน', '<span style="display:inline-block;background:' + info.color +
        ';color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;">' +
        escapeHtml_(info.label) + '</span>'],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))]
    ]) +
    extra +
    (detail && toStatus !== STATUS.INFO_NEEDED.key && toStatus !== STATUS.CANCELLED.key
      ? emailNotice_('<strong>หมายเหตุจากเจ้าหน้าที่</strong><br>' + nl2br_(detail)) : '');

  return sendMail_(req.requesterEmail,
    '[' + req.jobId + '] สถานะงาน: ' + info.label,
    emailShell_('สถานะงานเปลี่ยนเป็น "' + info.label + '"', req.projectName, body, ctaLabel, ctaUrl));
}

/* --------------------------------------------------- อีเมลถึงเจ้าหน้าที่ */

/** แจ้งเจ้าหน้าที่เมื่อมีคำขอใหม่ */
function sendStaffNewRequestEmail_(req) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var p = priorityInfo_(req.priority);
  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>มีคำขอรับบริการออกแบบเข้ามาใหม่ในระบบ</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ความเร่งด่วน', '<span style="display:inline-block;background:' + p.color +
        ';color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;">' + escapeHtml_(p.label) + '</span>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้ขอรับบริการ', escapeHtml_(req.requesterName) + ' (' + escapeHtml_(req.department) + ')'],
      ['ติดต่อ', escapeHtml_(req.requesterEmail) + ' / ' + escapeHtml_(req.requesterPhone)],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))],
      ['ไฟล์แนบ', int_(req.attachmentCount) + ' ไฟล์'],
      ['โฟลเดอร์งาน', '<a href="' + escapeHtml_(req.folderUrl) + '">เปิดโฟลเดอร์ใน Drive</a>']
    ]) +
    '<div style="font-weight:600;margin-bottom:4px;">รายการชิ้นงาน</div>' +
    deliverablesHtml_(req.jobId) +
    (str_(req.rushReason) ? emailNotice_('<strong>เหตุผลความเร่งด่วน</strong><br>' +
      nl2br_(req.rushReason), '#dc2626') : '') +
    emailNotice_('ระบบกำลังสรุป Design Brief ด้วย AI และจะแสดงในหน้าจัดการคำขอภายในไม่กี่นาที');

  return sendMail_(to, '[' + req.jobId + '] คำขอออกแบบใหม่ — ' + str_(req.projectName),
    emailShell_('คำขอใหม่เข้าคิว', p.label + ' | กำหนดใช้งาน ' + formatThaiDate_(req.dueDate),
      body, adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อผู้ขอส่งคำขอแก้ไข */
function sendRevisionToStaffEmail_(req, round, comment) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>ผู้ขอรับบริการส่งข้อแก้ไขร่างชิ้นงานเข้ามาในระบบ</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้แจ้ง', escapeHtml_(req.requesterName)],
      ['รอบการแก้ไข', 'รอบที่ ' + int_(round) + ' จาก ' + int_(req.revisionLimit) + ' รอบ']
    ]) +
    emailNotice_('<strong>จุดที่ขอแก้ไข</strong><br>' + nl2br_(comment));
  return sendMail_(to, '[' + req.jobId + '] ขอแก้ไขร่างรอบที่ ' + int_(round),
    emailShell_('มีคำขอแก้ไขร่างชิ้นงาน', req.projectName, body,
      adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อผู้ขออนุมัติร่าง */
function sendApprovalToStaffEmail_(req) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>ผู้ขอรับบริการอนุมัติร่างชิ้นงานแล้ว สามารถจัดทำไฟล์ฉบับสมบูรณ์และส่งมอบได้</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้อนุมัติ', escapeHtml_(req.requesterName)],
      ['ใช้รอบแก้ไขไป', int_(req.revisionCount) + ' จาก ' + int_(req.revisionLimit) + ' รอบ']
    ]);
  return sendMail_(to, '[' + req.jobId + '] ผู้ขอรับบริการอนุมัติร่างแล้ว',
    emailShell_('อนุมัติร่างชิ้นงาน', req.projectName, body,
      adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}

/** สรุปงานค้างประจำวันถึงเจ้าหน้าที่ (ทริกเกอร์ 08:00 น.) */
function dailyReminder() {
  var to = staffRecipients_();
  if (to.length === 0) return;
  var rows = readAll_(SHEET.REQUESTS).filter(function (r) {
    var s = str_(r.status);
    return s !== STATUS.DELIVERED.key && s !== STATUS.CANCELLED.key;
  });
  if (rows.length === 0) return;

  var today = new Date();
  var overdue = [];
  var dueSoon = [];
  var waiting = [];
  for (var i = 0; i < rows.length; i++) {
    var left = daysBetween_(today, rows[i].dueDate);
    if (left !== null && left < 0) overdue.push(rows[i]);
    else if (left !== null && left <= 3) dueSoon.push(rows[i]);
    if (str_(rows[i].status) === STATUS.NEW.key) waiting.push(rows[i]);
  }
  if (overdue.length === 0 && dueSoon.length === 0 && waiting.length === 0) return;

  function listHtml(items, note) {
    if (items.length === 0) return '';
    var lis = items.map(function (r) {
      return '<li style="margin-bottom:5px;"><strong>' + escapeHtml_(r.jobId) + '</strong> — ' +
        escapeHtml_(truncate_(r.projectName, 60)) + ' ' +
        '<span style="color:' + BRAND.textLight + ';">(' + escapeHtml_(statusInfo_(r.status).label) +
        ' &middot; กำหนด ' + escapeHtml_(formatThaiDate_(r.dueDate)) + ')</span></li>';
    }).join('');
    return '<div style="font-weight:600;margin:12px 0 4px 0;">' + escapeHtml_(note) + '</div>' +
      '<ul style="padding-left:20px;margin:0 0 8px 0;font-size:13px;">' + lis + '</ul>';
  }

  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>สรุปคิวงานออกแบบประจำวันที่ ' + escapeHtml_(formatThaiDate_(today)) + '</p>' +
    listHtml(overdue, 'เกินกำหนดส่ง (' + overdue.length + ' งาน)') +
    listHtml(dueSoon, 'ครบกำหนดภายใน 3 วัน (' + dueSoon.length + ' งาน)') +
    listHtml(waiting, 'รอเริ่มดำเนินการ (' + waiting.length + ' งาน)');

  sendMail_(to, 'สรุปคิวงานออกแบบประจำวัน ' + formatThaiDate_(today),
    emailShell_('คิวงานประจำวัน', APP.ORG, body, adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}


/* ==========================================================================
   07_AI.gs
   ========================================================================== */

/**
 * 07_AI.gs — สรุปคำตอบจากแบบฟอร์มให้เป็น Design Brief มาตรฐานด้วย Claude
 *
 * ถ้าไม่ได้ตั้งค่า API key หรือเรียก API ไม่สำเร็จ ระบบจะสรุปด้วยสูตรสำเร็จแทน
 * เพื่อให้เจ้าหน้าที่มี Design Brief ใช้งานได้เสมอ
 */

var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2023-06-01';

/** โครงสร้าง JSON ที่บังคับให้โมเดลตอบกลับ */
var BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    objective: { type: 'string', description: 'วัตถุประสงค์ของชิ้นงาน 1-2 ประโยค' },
    targetAudience: { type: 'string', description: 'กลุ่มเป้าหมายที่ชัดเจน' },
    keyMessage: { type: 'string', description: 'ข้อความหลักที่ต้องสื่อสาร' },
    toneAndStyle: { type: 'string', description: 'โทนและแนวทางการออกแบบที่เหมาะสม' },
    deliverables: { type: 'string', description: 'ชิ้นงานและขนาดที่ต้องผลิต' },
    deadline: { type: 'string', description: 'กำหนดส่งและข้อสังเกตเรื่องเวลา' },
    mandatoryElements: {
      type: 'array', items: { type: 'string' },
      description: 'องค์ประกอบที่ต้องมีบนชิ้นงาน เช่น ตราสัญลักษณ์ วัน เวลา สถานที่ QR code'
    },
    missingInfo: {
      type: 'array', items: { type: 'string' },
      description: 'ข้อมูลที่ยังขาดและควรสอบถามผู้ขอรับบริการให้ครบในคราวเดียว'
    }
  },
  required: ['objective', 'targetAudience', 'keyMessage', 'toneAndStyle',
    'deliverables', 'deadline', 'mandatoryElements', 'missingInfo'],
  additionalProperties: false
};

var BRIEF_SYSTEM_PROMPT = [
  'คุณเป็นผู้ช่วยของนักประชาสัมพันธ์ ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์',
  'หน้าที่ของคุณคือแปลงคำตอบในแบบฟอร์มขอรับบริการออกแบบให้เป็น Design Brief มาตรฐานภาษาไทย',
  'ที่นักออกแบบอ่านแล้วเริ่มงานได้ทันที',
  '',
  'หลักการ:',
  '- ใช้เฉพาะข้อมูลที่ผู้ขอรับบริการกรอกมาเท่านั้น ห้ามแต่งข้อเท็จจริงเพิ่ม เช่น วัน เวลา สถานที่ ชื่อวิทยากร',
  '- เขียนกระชับ เป็นภาษาราชการที่อ่านง่าย ไม่ต้องมีคำนำหรือคำลงท้าย',
  '- ระบุใน missingInfo เฉพาะข้อมูลที่จำเป็นต่อการเริ่มออกแบบแต่ยังไม่มีในคำขอ',
  '  เขียนเป็นคำถามสั้น ๆ ที่ส่งถามผู้ขอรับบริการได้ทันทีในคราวเดียว',
  '- ถ้าข้อมูลครบถ้วนดีแล้ว ให้ missingInfo เป็น array ว่าง'
].join('\n');

/** ประกอบข้อมูลคำขอเป็นข้อความสำหรับส่งให้โมเดล */
function buildBriefPrompt_(full) {
  var r = full.request;
  var items = full.deliverables.map(function (d) {
    var line = '- ' + str_(d.mediaLabel) + ' ขนาด ' + str_(d.size) + ' จำนวน ' + int_(d.quantity) + ' ชิ้น';
    if (str_(d.note)) line += ' (หมายเหตุ: ' + str_(d.note) + ')';
    return line;
  }).join('\n');

  var files = full.attachments.filter(function (a) { return str_(a.kind) === 'source'; })
    .map(function (a) { return '- ' + str_(a.fileName); }).join('\n');

  var lines = [
    'ข้อมูลจากแบบฟอร์มขอรับบริการออกแบบสื่อประชาสัมพันธ์',
    '',
    'เลขที่คำขอ: ' + str_(r.jobId),
    'ชื่อโครงการ/กิจกรรม: ' + str_(r.projectName),
    'หน่วยงานผู้ขอ: ' + str_(r.department),
    'ผู้ประสานงาน: ' + str_(r.requesterName),
    'วันจัดกิจกรรม: ' + (str_(r.eventDate) ? formatThaiDate_(r.eventDate) : 'ไม่ได้ระบุ'),
    'กำหนดใช้งานชิ้นงาน: ' + formatThaiDate_(r.dueDate),
    'ช่องทางเผยแพร่: ' + str_(r.channels),
    '',
    'วัตถุประสงค์ที่ผู้ขอระบุ:',
    str_(r.objective),
    '',
    'กลุ่มเป้าหมายที่ผู้ขอระบุ:',
    str_(r.targetAudience),
    '',
    'ข้อความหลักที่ต้องการสื่อ:',
    str_(r.keyMessage),
    '',
    'ข้อความบังคับที่ต้องปรากฏบนชิ้นงาน:',
    str_(r.mandatoryText) || 'ไม่ได้ระบุ',
    '',
    'รายการชิ้นงานที่ขอ:',
    items || 'ไม่ได้ระบุ',
    '',
    'ลิงก์ตัวอย่างอ้างอิง: ' + (str_(r.referenceUrl) || 'ไม่ได้ระบุ'),
    'หมายเหตุเพิ่มเติม: ' + (str_(r.notes) || 'ไม่มี'),
    'เหตุผลความเร่งด่วน: ' + (str_(r.rushReason) || 'ไม่มี'),
    '',
    'ไฟล์ที่แนบมา:',
    files || 'ไม่มีไฟล์แนบ'
  ];
  return lines.join('\n');
}

/** เรียก Claude API คืน object ตาม BRIEF_SCHEMA หรือโยน error */
function callClaudeForBrief_(promptText) {
  var apiKey = getProp_(PROP.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error('NO_API_KEY');

  var model = getSetting_('aiModel', DEFAULT_SETTINGS.aiModel);
  var payload = {
    model: model,
    max_tokens: 4000,
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: promptText }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: BRIEF_SCHEMA }
    }
  };

  var headers = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION
  };

  // เปิดใช้ server-side fallback เฉพาะรุ่นที่รองรับ เพื่อไม่ให้คำขอถูกปฏิเสธแล้วจบ
  if (model.indexOf('claude-opus-5') === 0 || model.indexOf('claude-fable-5') === 0) {
    payload.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  var lastError = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    var res = UrlFetchApp.fetch(ANTHROPIC_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();

    if (code === 200) {
      var body = JSON.parse(text);
      if (str_(body.stop_reason) === 'refusal') {
        throw new Error('โมเดลปฏิเสธคำขอนี้ (refusal) จึงใช้การสรุปอัตโนมัติแทน');
      }
      var content = body.content || [];
      for (var i = 0; i < content.length; i++) {
        if (content[i].type === 'text' && str_(content[i].text)) {
          return JSON.parse(content[i].text);
        }
      }
      throw new Error('ไม่พบเนื้อหาที่ตอบกลับจากโมเดล');
    }

    lastError = new Error('Claude API ตอบกลับรหัส ' + code + ': ' + truncate_(text, 300));
    // 429 และ 5xx ลองใหม่ได้ ส่วน 4xx อื่น ๆ ไม่ต้องลองซ้ำ
    if (code !== 429 && code < 500) break;
    Utilities.sleep(attempt * 2000);
  }
  throw lastError || new Error('เรียก Claude API ไม่สำเร็จ');
}

/** สรุป Design Brief ด้วยสูตรสำเร็จ (ใช้เมื่อไม่มี AI) */
function fallbackBrief_(full) {
  var r = full.request;
  var items = full.deliverables.map(function (d) {
    return str_(d.mediaLabel) + ' ขนาด ' + str_(d.size) + ' จำนวน ' + int_(d.quantity) + ' ชิ้น';
  }).join(' / ');

  var missing = [];
  if (!str_(r.mandatoryText)) missing.push('ข้อความบังคับบนชิ้นงาน เช่น ชื่องาน วัน เวลา สถานที่ ผู้จัด');
  if (!str_(r.eventDate)) missing.push('วันที่จัดกิจกรรม');
  if (!str_(r.referenceUrl)) missing.push('ตัวอย่างงานอ้างอิงหรือแนวทางที่ชอบ');
  if (int_(r.attachmentCount) === 0) missing.push('ไฟล์ประกอบ เช่น ตราสัญลักษณ์เวกเตอร์ ภาพความละเอียดสูง');

  return {
    objective: str_(r.objective),
    targetAudience: str_(r.targetAudience),
    keyMessage: str_(r.keyMessage),
    toneAndStyle: 'ใช้อัตลักษณ์องค์กร (CI) ของคณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์ เป็นหลัก',
    deliverables: items,
    deadline: 'กำหนดใช้งาน ' + formatThaiDate_(r.dueDate) +
      (str_(r.rushReason) ? ' (งานเร่งด่วน: ' + str_(r.rushReason) + ')' : ''),
    mandatoryElements: str_(r.mandatoryText)
      ? str_(r.mandatoryText).split('\n').map(function (x) { return str_(x); })
        .filter(function (x) { return !!x; })
      : [],
    missingInfo: missing
  };
}

/** แปลง object ของ brief เป็นข้อความอ่านง่าย */
function briefToText_(brief) {
  var parts = [
    'วัตถุประสงค์: ' + str_(brief.objective),
    'กลุ่มเป้าหมาย: ' + str_(brief.targetAudience),
    'ข้อความหลัก: ' + str_(brief.keyMessage),
    'โทนและแนวทางออกแบบ: ' + str_(brief.toneAndStyle),
    'ชิ้นงานและขนาด: ' + str_(brief.deliverables),
    'กำหนดส่ง: ' + str_(brief.deadline)
  ];
  var must = Array.isArray(brief.mandatoryElements) ? brief.mandatoryElements : [];
  if (must.length > 0) {
    parts.push('องค์ประกอบที่ต้องมี:');
    for (var i = 0; i < must.length; i++) parts.push('  - ' + str_(must[i]));
  }
  return parts.join('\n');
}

/**
 * สร้าง Design Brief ของงานหนึ่งใบแล้วบันทึกลงชีต
 * force = true เพื่อสร้างใหม่ทับของเดิม
 */
function generateBrief_(jobId, force) {
  var full = getRequestFull_(jobId);
  if (!full) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  var req = full.request;
  if (!force && str_(req.briefStatus) === 'DONE') {
    return { jobId: req.jobId, skipped: true };
  }

  var brief;
  var source;
  var aiEnabled = getSettingBool_('aiEnabled', true);
  if (aiEnabled && getProp_(PROP.ANTHROPIC_API_KEY)) {
    try {
      brief = callClaudeForBrief_(buildBriefPrompt_(full));
      source = 'AI';
    } catch (err) {
      brief = fallbackBrief_(full);
      source = 'AUTO';
      logTimeline_(req.jobId, 'system', 'BRIEF_FALLBACK', '', '',
        'สรุปด้วย AI ไม่สำเร็จ จึงใช้การสรุปอัตโนมัติแทน: ' + truncate_(err.message, 300));
    }
  } else {
    brief = fallbackBrief_(full);
    source = 'AUTO';
  }

  var missing = Array.isArray(brief.missingInfo) ? brief.missingInfo : [];
  update_(SHEET.REQUESTS, req._row, {
    briefStatus: 'DONE',
    briefText: truncate_(briefToText_(brief), 8000),
    briefMissing: truncate_(missing.join(' | '), 2000),
    briefGeneratedAt: nowIso_(),
    briefSource: source,
    updatedAt: nowIso_()
  });

  logTimeline_(req.jobId, 'system', 'BRIEF', '', '',
    'สรุป Design Brief เรียบร้อย (' + (source === 'AI' ? 'ด้วย AI' : 'อัตโนมัติ') + ')' +
    (missing.length > 0 ? ' พบข้อมูลที่ยังขาด ' + missing.length + ' รายการ' : ' ข้อมูลครบถ้วน'));

  return { jobId: req.jobId, source: source, missing: missing };
}

/* ------------------------------------------------------------ ตัวทำงานเบื้องหลัง */

/** ตั้งทริกเกอร์ให้ทำงานทันที (ใช้ตอนมีคำขอใหม่) */
function scheduleWorker_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'workerOnce') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('workerOnce').timeBased().after(30 * 1000).create();
}

/** ทริกเกอร์ครั้งเดียวหลังมีคำขอใหม่ */
function workerOnce() {
  workerTick();
}

/**
 * งานเบื้องหลังหลัก ทำงานทุก 5 นาที
 *  1) ปิดคำขอที่ผู้ใช้ยื่นแล้วแต่ค้างอยู่ (เช่น ปิดเบราว์เซอร์ระหว่างอัปโหลด)
 *  2) สรุป Design Brief ของคำขอที่ยังไม่ได้สรุป
 */
function workerTick() {
  var rows;
  try {
    rows = readAll_(SHEET.REQUESTS);
  } catch (err) {
    return; // ยังไม่ได้ติดตั้งระบบ
  }

  var now = new Date();

  // 1) ปิดคำขอที่ค้างเกิน 15 นาที
  //    แต่ต้องไม่แตะคำขอที่เพิ่งมีความเคลื่อนไหวใน 10 นาทีล่าสุด
  //    เพราะผู้ใช้อาจกำลังทยอยอัปโหลดไฟล์ขนาดใหญ่อยู่
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (str_(r.submittedAt)) continue;
    var created = parseDate_(r.createdAt);
    if (!created) continue;
    if (now.getTime() - created.getTime() < 15 * 60 * 1000) continue;
    var touched = parseDate_(r.updatedAt);
    if (touched && now.getTime() - touched.getTime() < 10 * 60 * 1000) continue;
    try {
      finalizeRequest_(r.jobId);
    } catch (err) {
      logTimeline_(r.jobId, 'system', 'ERROR', '', '', 'ปิดคำขออัตโนมัติไม่สำเร็จ: ' + err.message);
    }
  }

  // 2) สรุป Design Brief (ครั้งละไม่เกิน 5 ใบ กันเวลาทำงานเกินโควตา)
  var pending = readAll_(SHEET.REQUESTS).filter(function (r) {
    return str_(r.briefStatus) === 'PENDING' && str_(r.submittedAt);
  }).slice(0, 5);

  for (var j = 0; j < pending.length; j++) {
    try {
      generateBrief_(pending[j].jobId, false);
    } catch (err) {
      var row = getRequest_(pending[j].jobId);
      if (row) {
        update_(SHEET.REQUESTS, row._row, { briefStatus: 'ERROR', updatedAt: nowIso_() });
      }
      logTimeline_(pending[j].jobId, 'system', 'ERROR', '', '',
        'สรุป Design Brief ไม่สำเร็จ: ' + truncate_(err.message, 300));
    }
  }
}


/* ==========================================================================
   08_Auth.gs
   ========================================================================== */

/**
 * 08_Auth.gs — ระบบเข้าสู่ระบบสำหรับเจ้าหน้าที่
 *
 * เว็บแอปถูก deploy แบบ "Anyone" เพื่อให้ผู้ขอรับบริการใช้งานได้โดยไม่ต้องล็อกอิน Google
 * ระบบจึงมีระบบยืนยันตัวตนของตัวเอง: รหัสผ่านเก็บเป็นค่าแฮชแบบวนซ้ำ
 * และออก token ที่เซ็นด้วย HMAC เก็บไว้ฝั่งเบราว์เซอร์
 */

/** แฮชรหัสผ่านแบบวนซ้ำพร้อม salt และกุญแจลับของระบบ */
function hashPassword_(password, salt) {
  var pepper = getProp_(PROP.SECRET);
  if (!pepper) throw new Error('ระบบยังไม่มีกุญแจลับ กรุณาเรียก setupSystem() ก่อน');
  var acc = str_(salt) + ':' + String(password);
  for (var i = 0; i < PASSWORD_ROUNDS; i++) {
    acc = hmac_(acc, pepper);
  }
  return acc;
}

/** สร้าง token ของ session */
function makeToken_(user) {
  var payload = {
    e: str_(user.email),
    n: str_(user.name),
    r: str_(user.role) || 'staff',
    exp: new Date().getTime() + SESSION_TTL_MS
  };
  var encoded = b64url_(JSON.stringify(payload));
  return encoded + '.' + hmac_(encoded, getProp_(PROP.SECRET));
}

/** ตรวจสอบ token คืนข้อมูลผู้ใช้ หรือ null ถ้าไม่ถูกต้อง/หมดอายุ */
function verifyToken_(token) {
  var t = str_(token);
  if (!t) return null;
  var dot = t.indexOf('.');
  if (dot <= 0 || dot === t.length - 1) return null;

  var encoded = t.substring(0, dot);
  var signature = t.substring(dot + 1);
  if (!timingSafeEqual_(hmac_(encoded, getProp_(PROP.SECRET)), signature)) return null;

  var payload;
  try {
    payload = JSON.parse(unb64url_(encoded));
  } catch (err) {
    return null;
  }
  if (!payload || !payload.e || !payload.exp) return null;
  if (new Date().getTime() > int_(payload.exp)) return null;

  // ตรวจว่าบัญชียังใช้งานได้อยู่
  var user = findBy_(SHEET.USERS, 'email', str_(payload.e).toLowerCase());
  if (!user) return null;
  if (str_(user.active).toUpperCase() !== 'TRUE') return null;

  return { email: str_(user.email), name: str_(user.name), role: str_(user.role) || 'staff' };
}

/** ตรวจสิทธิ์ ถ้าไม่ผ่านจะโยน error */
function requireAuth_(token) {
  var user = verifyToken_(token);
  if (!user) throw appError_('เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
  return user;
}

/** ตรวจสิทธิ์ระดับผู้ดูแลระบบ */
function requireAdmin_(token) {
  var user = requireAuth_(token);
  if (str_(user.role) !== 'admin') {
    throw appError_('เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้คำสั่งนี้ได้');
  }
  return user;
}

/** นับความพยายามเข้าสู่ระบบที่ผิดพลาด */
function loginAttemptKey_(email) {
  return 'login-fail:' + str_(email).toLowerCase();
}

function getLoginAttempts_(email) {
  var cache = CacheService.getScriptCache();
  return int_(cache.get(loginAttemptKey_(email)), 0);
}

function bumpLoginAttempts_(email) {
  var cache = CacheService.getScriptCache();
  var key = loginAttemptKey_(email);
  var next = int_(cache.get(key), 0) + 1;
  cache.put(key, String(next), LOGIN_LOCK_SECONDS);
  return next;
}

function clearLoginAttempts_(email) {
  CacheService.getScriptCache().remove(loginAttemptKey_(email));
}

/** เข้าสู่ระบบ คืน token และข้อมูลผู้ใช้ */
function login_(email, password) {
  var mail = str_(email).toLowerCase();
  if (!isValidEmail_(mail)) throw appError_('รูปแบบอีเมลไม่ถูกต้อง');
  if (!str_(password)) throw appError_('กรุณากรอกรหัสผ่าน');

  if (getLoginAttempts_(mail) >= LOGIN_MAX_ATTEMPTS) {
    throw appError_('กรอกรหัสผ่านผิดเกินกำหนด กรุณารอ 15 นาทีแล้วลองใหม่');
  }

  var user = findBy_(SHEET.USERS, 'email', mail);
  var ok = false;
  if (user && str_(user.active).toUpperCase() === 'TRUE') {
    ok = timingSafeEqual_(hashPassword_(password, user.salt), str_(user.passwordHash));
  }

  if (!ok) {
    var attempts = bumpLoginAttempts_(mail);
    var left = LOGIN_MAX_ATTEMPTS - attempts;
    throw appError_('อีเมลหรือรหัสผ่านไม่ถูกต้อง' +
      (left > 0 ? ' (เหลือโอกาสอีก ' + left + ' ครั้ง)' : ''));
  }

  clearLoginAttempts_(mail);
  update_(SHEET.USERS, user._row, { lastLoginAt: nowIso_() });

  return {
    token: makeToken_(user),
    user: { email: str_(user.email), name: str_(user.name), role: str_(user.role) || 'staff' },
    expiresAt: new Date().getTime() + SESSION_TTL_MS
  };
}

/** เปลี่ยนรหัสผ่านของตนเอง */
function changePassword_(token, currentPassword, newPassword) {
  var me = requireAuth_(token);
  if (str_(newPassword).length < 8) throw appError_('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  var user = findBy_(SHEET.USERS, 'email', me.email);
  if (!user) throw appError_('ไม่พบบัญชีผู้ใช้');
  if (!timingSafeEqual_(hashPassword_(currentPassword, user.salt), str_(user.passwordHash))) {
    throw appError_('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  var salt = Utilities.getUuid();
  update_(SHEET.USERS, user._row, {
    salt: salt,
    passwordHash: hashPassword_(newPassword, salt)
  });
  return true;
}

/** รายชื่อเจ้าหน้าที่ (ผู้ดูแลระบบเท่านั้น) */
function listUsers_(token) {
  requireAdmin_(token);
  return readAll_(SHEET.USERS).map(function (u) {
    return {
      email: str_(u.email),
      name: str_(u.name),
      role: str_(u.role),
      active: str_(u.active).toUpperCase() === 'TRUE',
      createdAt: str_(u.createdAt),
      lastLoginAt: str_(u.lastLoginAt)
    };
  });
}

/** เพิ่มหรือแก้ไขบัญชีเจ้าหน้าที่ (ผู้ดูแลระบบเท่านั้น) */
function saveUser_(token, payload) {
  var me = requireAdmin_(token);
  var p = payload || {};
  var mail = str_(p.email).toLowerCase();
  if (!isValidEmail_(mail)) throw appError_('รูปแบบอีเมลไม่ถูกต้อง');
  var name = truncate_(pick_(p, 'name', ''), 150);
  if (!name) throw appError_('กรุณากรอกชื่อผู้ใช้');
  var role = str_(p.role) === 'admin' ? 'admin' : 'staff';
  var password = str_(p.password);

  var existing = findBy_(SHEET.USERS, 'email', mail);
  if (existing) {
    var patch = { name: name, role: role };
    if (password) {
      if (password.length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      patch.salt = Utilities.getUuid();
      patch.passwordHash = hashPassword_(password, patch.salt);
    }
    if (p.active !== undefined) {
      if (mail === me.email && p.active !== true) {
        throw appError_('ไม่สามารถปิดใช้งานบัญชีของตนเองได้');
      }
      patch.active = p.active ? 'TRUE' : 'FALSE';
    }
    update_(SHEET.USERS, existing._row, patch);
    return { updated: true, email: mail };
  }

  if (password.length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  var salt = Utilities.getUuid();
  insert_(SHEET.USERS, {
    email: mail,
    name: name,
    role: role,
    passwordHash: hashPassword_(password, salt),
    salt: salt,
    active: 'TRUE',
    createdAt: nowIso_(),
    lastLoginAt: ''
  });
  return { created: true, email: mail };
}


/* ==========================================================================
   09_Stats.gs
   ========================================================================== */

/**
 * 09_Stats.gs — สรุปสถิติสำหรับแดชบอร์ดและรายงานประจำปี
 */

/**
 * สถิติภาพรวม
 * filter: { from, to }  (ถ้าไม่ระบุจะนับทั้งหมด)
 */
function getStats_(filter) {
  var f = filter || {};
  var from = startOfDay_(f.from);
  var to = f.to ? new Date(startOfDay_(f.to).getTime() + 86400000) : null;

  var all = readAll_(SHEET.REQUESTS);
  var rows = all.filter(function (r) {
    var created = parseDate_(r.createdAt);
    if (!created) return false;
    if (from && created < from) return false;
    if (to && created >= to) return false;
    return true;
  });

  var jobIds = {};
  for (var i = 0; i < rows.length; i++) jobIds[str_(rows[i].jobId)] = true;

  // นับตามสถานะ
  var statusCount = {};
  var keys = Object.keys(STATUS);
  for (var k = 0; k < keys.length; k++) statusCount[keys[k]] = 0;

  var today = new Date();
  var totals = { all: rows.length, active: 0, delivered: 0, overdue: 0, cancelled: 0 };
  var leadTimes = [];
  var revisionCounts = [];
  var onTime = 0;
  var onTimeBase = 0;
  var firstDraftDays = [];

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var st = str_(row.status).toUpperCase();
    if (statusCount[st] === undefined) statusCount[st] = 0;
    statusCount[st]++;

    if (st === STATUS.DELIVERED.key) {
      totals.delivered++;
      var lt = int_(row.leadTimeDays, -1);
      if (lt >= 0) leadTimes.push(lt);
      revisionCounts.push(int_(row.revisionCount));
      var due = parseDate_(row.dueDate);
      var deliveredAt = parseDate_(row.deliveredAt);
      if (due && deliveredAt) {
        onTimeBase++;
        if (daysBetween_(deliveredAt, due) >= 0) onTime++;
      }
      var fd = daysBetween_(row.submittedAt || row.createdAt, row.firstDraftAt);
      if (fd !== null && fd >= 0) firstDraftDays.push(fd);
    } else if (st === STATUS.CANCELLED.key) {
      totals.cancelled++;
    } else {
      totals.active++;
      var left = daysBetween_(today, row.dueDate);
      if (left !== null && left < 0) totals.overdue++;
    }
  }

  var byStatus = [];
  for (var s = 0; s < keys.length; s++) {
    var info = STATUS[keys[s]];
    byStatus.push({
      key: info.key,
      label: info.label,
      color: info.color,
      count: statusCount[info.key] || 0
    });
  }

  // นับตามประเภทสื่อ (นับตามจำนวนรายการชิ้นงาน)
  var mediaCount = {};
  var deliverables = readAll_(SHEET.DELIVERABLES);
  for (var d = 0; d < deliverables.length; d++) {
    if (!jobIds[str_(deliverables[d].jobId)]) continue;
    var label = str_(deliverables[d].mediaLabel) || 'ไม่ระบุ';
    mediaCount[label] = (mediaCount[label] || 0) + 1;
  }
  var byMedia = Object.keys(mediaCount).map(function (label) {
    return { label: label, count: mediaCount[label] };
  }).sort(function (a, b) { return b.count - a.count; });

  // นับตามหน่วยงาน
  var deptCount = {};
  for (var q = 0; q < rows.length; q++) {
    var dept = str_(rows[q].department) || 'ไม่ระบุ';
    deptCount[dept] = (deptCount[dept] || 0) + 1;
  }
  var byDepartment = Object.keys(deptCount).map(function (label) {
    return { label: label, count: deptCount[label] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);

  // นับรายเดือน 12 เดือนล่าสุด
  var monthMap = {};
  for (var m = 0; m < rows.length; m++) {
    var created = parseDate_(rows[m].createdAt);
    if (!created) continue;
    var key = Utilities.formatDate(created, APP.TIMEZONE, 'yyyy-MM');
    if (!monthMap[key]) monthMap[key] = { received: 0, delivered: 0 };
    monthMap[key].received++;
    if (str_(rows[m].status) === STATUS.DELIVERED.key) monthMap[key].delivered++;
  }
  var byMonth = Object.keys(monthMap).sort().slice(-12).map(function (key) {
    var parts = key.split('-');
    var monthIdx = int_(parts[1]) - 1;
    return {
      key: key,
      label: THAI_MONTHS[monthIdx].substring(0, 3) + ' ' + (int_(parts[0]) + 543 - 2500),
      received: monthMap[key].received,
      delivered: monthMap[key].delivered
    };
  });

  function average(arr) {
    if (arr.length === 0) return null;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    return Math.round((sum / arr.length) * 10) / 10;
  }

  return {
    generatedAt: nowIso_(),
    range: {
      from: f.from ? str_(f.from) : '',
      to: f.to ? str_(f.to) : ''
    },
    totals: totals,
    byStatus: byStatus,
    byMedia: byMedia,
    byDepartment: byDepartment,
    byMonth: byMonth,
    avgLeadTimeDays: average(leadTimes),
    avgFirstDraftDays: average(firstDraftDays),
    avgRevisions: average(revisionCounts),
    onTimeRate: onTimeBase > 0 ? Math.round((onTime / onTimeBase) * 100) : null,
    briefCoverage: (function () {
      var withBrief = rows.filter(function (r) { return str_(r.briefStatus) === 'DONE'; }).length;
      return rows.length > 0 ? Math.round((withBrief / rows.length) * 100) : null;
    })(),
    completeOnFirstSubmit: (function () {
      // ร้อยละของคำขอที่ข้อมูลครบตั้งแต่ครั้งแรก (ไม่ถูกตีกลับขอข้อมูลเพิ่ม)
      if (rows.length === 0) return null;
      var timeline = readAll_(SHEET.TIMELINE);
      var bounced = {};
      for (var i = 0; i < timeline.length; i++) {
        if (str_(timeline[i].toStatus) === STATUS.INFO_NEEDED.key) {
          bounced[str_(timeline[i].jobId)] = true;
        }
      }
      var clean = 0;
      for (var j = 0; j < rows.length; j++) {
        if (!bounced[str_(rows[j].jobId)]) clean++;
      }
      return Math.round((clean / rows.length) * 100);
    })()
  };
}

/** ข้อมูลสำหรับส่งออกเป็น CSV (รายงานประจำปี) */
function exportRows_(filter) {
  var rows = listRequests_(filter || {});
  var header = ['เลขที่คำขอ', 'วันที่ยื่น', 'สถานะ', 'ความเร่งด่วน', 'ผู้ขอรับบริการ',
    'หน่วยงาน', 'ชื่อโครงการ', 'กำหนดใช้งาน', 'ผู้รับผิดชอบ', 'รอบแก้ไข'];
  var body = rows.map(function (r) {
    return [r.jobId, r.createdAt, r.statusLabel, r.priorityLabel, r.requesterName,
      r.department, r.projectName, r.dueDate, r.assignedTo,
      r.revisionCount + '/' + r.revisionLimit];
  });
  return { header: header, rows: body };
}


/* ==========================================================================
   10_WebApp.gs
   ========================================================================== */

/**
 * 10_WebApp.gs — จุดเชื่อมระหว่างหน้าเว็บกับฝั่งเซิร์ฟเวอร์
 *
 * ทุกฟังก์ชันที่ขึ้นต้นด้วย api* ถูกเรียกจากเบราว์เซอร์ผ่าน google.script.run
 * และคืนค่ารูปแบบเดียวกันเสมอ: { ok: true, data: ... } หรือ { ok: false, error: 'ข้อความ' }
 */

/** อนุญาตเฉพาะอักขระที่ปลอดภัย ป้องกันการแทรกโค้ดผ่านพารามิเตอร์ใน URL */
function sanitizeParam_(value, pattern, maxLength) {
  var s = str_(value).replace(pattern, '');
  return truncate_(s, maxLength);
}

/**
 * แปลง object เป็น JSON สำหรับฝังในแท็ก script
 * หลบอักขระ < > & เพื่อไม่ให้ปิดแท็ก script ได้
 */
function jsonForHtml_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** แสดงหน้าเว็บ */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var page = sanitizeParam_(params.page, /[^a-z]/g, 20);
  var allowedPages = ['home', 'form', 'track', 'login', 'admin', 'setup'];
  if (allowedPages.indexOf(page) < 0) page = 'home';

  // ติดตั้งระบบให้อัตโนมัติเมื่อเปิดเว็บแอปครั้งแรก
  var installError = '';
  try {
    ensureInstalled_();
    rememberWebAppUrl_();
  } catch (err) {
    installError = err.message || String(err);
    console.error('ติดตั้งระบบอัตโนมัติไม่สำเร็จ: ' + installError);
  }

  var boot = {
    page: page,
    jobId: sanitizeParam_(params.job, /[^A-Za-z0-9-]/g, 30).toUpperCase(),
    trackToken: sanitizeParam_(params.t, /[^A-Za-z0-9_-]/g, 64),
    setupKey: sanitizeParam_(params.k, /[^A-Za-z0-9]/g, 32).toUpperCase(),
    installError: truncate_(installError, 300),
    appName: APP.NAME,
    org: APP.ORG,
    version: APP.VERSION
  };
  var template = HtmlService.createTemplateFromFile('page_App');
  template.boot = jsonForHtml_(boot);
  return template.evaluate()
    .setTitle(APP.NAME + ' | ' + APP.ORG_SHORT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** แทรกไฟล์ HTML อื่นเข้ามาในหน้า */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** ห่อผลลัพธ์ให้เป็นรูปแบบเดียวกัน และแปลง error เป็นข้อความภาษาไทย */
function respond_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    var message = (err && err.message) ? err.message : String(err);
    if (!err || !err.userFacing) {
      console.error(message + (err && err.stack ? '\n' + err.stack : ''));
      if (message.indexOf('ไม่พบ') < 0 && message.indexOf('กรุณา') < 0) {
        message = 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหา กรุณาแจ้งฝ่ายสื่อสารองค์กร';
      }
    }
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------- สาธารณะ */

/** ข้อมูลตั้งต้นสำหรับหน้าเว็บ */
function apiBootstrap() {
  return respond_(function () {
    return {
      app: { name: APP.NAME, org: APP.ORG, orgShort: APP.ORG_SHORT, version: APP.VERSION },
      needsFirstAdmin: readAll_(SHEET.USERS).length === 0,
      mediaTypes: MEDIA_TYPES,
      departments: DEPARTMENTS,
      channels: CHANNELS,
      statusFlow: STATUS_FLOW.map(function (k) {
        return { key: k, label: STATUS[k].label, en: STATUS[k].en, step: STATUS[k].step };
      }),
      settings: {
        revisionLimit: getSettingInt_('revisionLimit', 3),
        minLeadDays: getSettingInt_('minLeadDays', 7),
        slaFirstDraftDays: getSettingInt_('slaFirstDraftDays', 5),
        maxFileMB: getSettingInt_('maxFileMB', 10),
        maxFiles: getSettingInt_('maxFiles', 8),
        allowedFileTypes: getSetting_('allowedFileTypes', DEFAULT_SETTINGS.allowedFileTypes),
        formOpen: getSettingBool_('publicFormOpen', true),
        closedMessage: getSetting_('closedMessage', DEFAULT_SETTINGS.closedMessage),
        contactEmail: getSetting_('replyTo', DEFAULT_SETTINGS.replyTo)
      }
    };
  });
}

var SUBMIT_RATE_LIMIT = 5;

/** ตรวจว่ายื่นคำขอเกินโควตาต่อชั่วโมงหรือยัง (ยังไม่นับเพิ่ม) */
function checkSubmitRate_(email) {
  var count = int_(CacheService.getScriptCache().get('submit:' + str_(email).toLowerCase()), 0);
  if (count >= SUBMIT_RATE_LIMIT) {
    throw appError_('อีเมลนี้ยื่นคำขอครบ ' + SUBMIT_RATE_LIMIT +
      ' รายการภายในหนึ่งชั่วโมงแล้ว กรุณารอสักครู่หรือติดต่อเจ้าหน้าที่โดยตรง');
  }
}

/** นับการยื่นคำขอที่สำเร็จ (ข้อมูลไม่ครบจึงไม่ถูกนับเป็นโควตา) */
function bumpSubmitRate_(email) {
  var cache = CacheService.getScriptCache();
  var key = 'submit:' + str_(email).toLowerCase();
  cache.put(key, String(int_(cache.get(key), 0) + 1), 3600);
}

/** ยื่นคำขอใหม่ (ขั้นตอนที่ 1) */
function apiSubmitRequest(payload) {
  return respond_(function () {
    var email = pick_(payload, 'requesterEmail', '');
    checkSubmitRate_(email);
    var result = createRequest_(payload);
    bumpSubmitRate_(email);
    return result;
  });
}

/** อัปโหลดไฟล์แนบของผู้ขอรับบริการ (ขั้นตอนที่ 2) */
function apiUploadFile(jobId, trackToken, filePayload) {
  return respond_(function () {
    var id = str_(jobId).toUpperCase();
    if (!verifyTrackToken_(id, trackToken)) {
      throw appError_('ไม่มีสิทธิ์แนบไฟล์กับคำขอนี้');
    }
    var req = getRequest_(id);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);
    if (str_(req.submittedAt)) {
      throw appError_('คำขอนี้ยืนยันการยื่นแล้ว หากต้องการส่งไฟล์เพิ่มกรุณาติดต่อเจ้าหน้าที่');
    }
    return uploadAttachment_(id, filePayload, 'source', req.requesterEmail);
  });
}

/** ยืนยันการยื่นคำขอ (ขั้นตอนที่ 3) */
function apiFinalizeRequest(jobId, trackToken) {
  return respond_(function () {
    var id = str_(jobId).toUpperCase();
    if (!verifyTrackToken_(id, trackToken)) {
      throw appError_('ไม่มีสิทธิ์ยืนยันคำขอนี้');
    }
    return finalizeRequest_(id);
  });
}

/** ติดตามสถานะงาน */
function apiTrack(jobId, email, token) {
  return respond_(function () {
    var id = str_(jobId).toUpperCase();
    if (!id) throw appError_('กรุณากรอกเลขที่คำขอ');
    var view = getPublicView_(id, email, token);
    if (!view) {
      throw appError_('ไม่พบคำขอที่ตรงกับข้อมูลที่กรอก กรุณาตรวจสอบเลขที่คำขอและอีเมลที่ใช้ยื่นคำขออีกครั้ง');
    }
    return view;
  });
}

/** ผู้ขอรับบริการส่งคำขอแก้ไข */
function apiRequestRevision(jobId, email, token, comment) {
  return respond_(function () {
    return addRevision_(jobId, email, token, comment);
  });
}

/** ผู้ขอรับบริการอนุมัติร่าง */
function apiApproveDraft(jobId, email, token) {
  return respond_(function () {
    return approveDraft_(jobId, email, token);
  });
}

/* ------------------------------------------------------------ เจ้าหน้าที่ */

/** สร้างบัญชีผู้ดูแลระบบคนแรกผ่านหน้าเว็บ (ใช้รหัสติดตั้งจากอีเมล) */
function apiCreateFirstAdmin(setupKey, email, name, password) {
  return respond_(function () {
    return createFirstAdmin_(setupKey, email, name, password);
  });
}

function apiLogin(email, password) {
  return respond_(function () {
    return login_(email, password);
  });
}

function apiVerifySession(token) {
  return respond_(function () {
    return requireAuth_(token);
  });
}

function apiChangePassword(token, currentPassword, newPassword) {
  return respond_(function () {
    return changePassword_(token, currentPassword, newPassword);
  });
}

function apiAdminList(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return listRequests_(filter);
  });
}

function apiAdminGet(token, jobId) {
  return respond_(function () {
    requireAuth_(token);
    var full = getRequestFull_(jobId);
    if (!full) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
    var r = full.request;
    var info = statusInfo_(r.status);
    var p = priorityInfo_(r.priority);
    return {
      request: {
        jobId: r.jobId,
        createdAt: str_(r.createdAt),
        submittedAt: str_(r.submittedAt),
        status: info.key,
        statusLabel: info.label,
        statusColor: info.color,
        nextStatuses: (STATUS_TRANSITIONS[info.key] || []).map(function (k) {
          return { key: k, label: STATUS[k].label, color: STATUS[k].color };
        }),
        priority: p.key,
        priorityLabel: p.label,
        priorityColor: p.color,
        requesterName: str_(r.requesterName),
        requesterEmail: str_(r.requesterEmail),
        requesterPhone: str_(r.requesterPhone),
        department: str_(r.department),
        lineId: str_(r.lineId),
        projectName: str_(r.projectName),
        eventDate: str_(r.eventDate),
        dueDate: str_(r.dueDate),
        objective: str_(r.objective),
        targetAudience: str_(r.targetAudience),
        keyMessage: str_(r.keyMessage),
        mandatoryText: str_(r.mandatoryText),
        referenceUrl: str_(r.referenceUrl),
        channels: str_(r.channels),
        notes: str_(r.notes),
        rushReason: str_(r.rushReason),
        folderUrl: str_(r.folderUrl),
        draftUrl: str_(r.draftUrl),
        briefStatus: str_(r.briefStatus),
        briefText: str_(r.briefText),
        briefMissing: str_(r.briefMissing),
        briefSource: str_(r.briefSource),
        briefGeneratedAt: str_(r.briefGeneratedAt),
        revisionCount: int_(r.revisionCount),
        revisionLimit: int_(r.revisionLimit),
        assignedTo: str_(r.assignedTo),
        deliveredAt: str_(r.deliveredAt),
        leadTimeDays: str_(r.leadTimeDays),
        cancelReason: str_(r.cancelReason),
        trackUrl: buildTrackUrl_(r)
      },
      deliverables: full.deliverables.map(function (d) {
        return {
          seq: int_(d.seq), mediaLabel: str_(d.mediaLabel), size: str_(d.size),
          quantity: int_(d.quantity), note: str_(d.note)
        };
      }),
      attachments: listAttachments_(r.jobId),
      revisions: full.revisions.map(function (v) {
        return {
          round: int_(v.round), createdAt: str_(v.createdAt), byName: str_(v.byName),
          comment: str_(v.comment), draftUrl: str_(v.draftUrl)
        };
      }),
      timeline: full.timeline.map(function (t) {
        return {
          at: str_(t.at), actor: str_(t.actor), action: str_(t.action),
          fromStatus: str_(t.fromStatus), toStatus: str_(t.toStatus), detail: str_(t.detail)
        };
      })
    };
  });
}

function apiAdminChangeStatus(token, jobId, toStatus, options) {
  return respond_(function () {
    var me = requireAuth_(token);
    changeStatus_(jobId, toStatus, me.name || me.email, options);
    return { jobId: str_(jobId).toUpperCase(), status: str_(toStatus).toUpperCase() };
  });
}

function apiAdminSetDraftUrl(token, jobId, url) {
  return respond_(function () {
    var me = requireAuth_(token);
    setDraftUrl_(jobId, url, me.name || me.email);
    return true;
  });
}

function apiAdminAssign(token, jobId, assignee) {
  return respond_(function () {
    var me = requireAuth_(token);
    assignRequest_(jobId, assignee, me.name || me.email);
    return true;
  });
}

function apiAdminNote(token, jobId, note) {
  return respond_(function () {
    var me = requireAuth_(token);
    return addInternalNote_(jobId, note, me.name || me.email);
  });
}

function apiAdminSetRevisionLimit(token, jobId, limit) {
  return respond_(function () {
    var me = requireAuth_(token);
    setRevisionLimit_(jobId, limit, me.name || me.email);
    return true;
  });
}

function apiAdminUploadFile(token, jobId, filePayload, kind) {
  return respond_(function () {
    var me = requireAuth_(token);
    var fileKind = str_(kind) === 'draft' ? 'draft' : 'final';
    return uploadAttachment_(jobId, filePayload, fileKind, me.name || me.email);
  });
}

function apiAdminDeleteFile(token, attachmentId) {
  return respond_(function () {
    var me = requireAuth_(token);
    return deleteAttachment_(attachmentId, me.name || me.email);
  });
}

function apiAdminRegenerateBrief(token, jobId) {
  return respond_(function () {
    requireAuth_(token);
    return generateBrief_(jobId, true);
  });
}

function apiAdminStats(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return getStats_(filter);
  });
}

function apiAdminAssets(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return listAssetLibrary_(filter);
  });
}

function apiAdminExport(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return exportRows_(filter);
  });
}

function apiAdminSettings(token) {
  return respond_(function () {
    requireAdmin_(token);
    var s = getSettings_();
    var out = [];
    for (var key in DEFAULT_SETTINGS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
      out.push({ key: key, value: str_(s[key]) });
    }
    var base = safeWebAppUrl_();
    return {
      settings: out,
      hasApiKey: !!getProp_(PROP.ANTHROPIC_API_KEY),
      notifyTo: staffRecipients_(),
      ownerEmail: ownerEmail_(),
      links: {
        publicUrl: base,
        formUrl: base ? base + '?page=form' : '',
        trackUrl: base ? base + '?page=track' : '',
        staffUrl: base ? base + '?page=login' : '',
        spreadsheetUrl: (function () {
          var id = getProp_(PROP.SPREADSHEET_ID);
          return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '';
        })(),
        driveUrl: (function () {
          var id = getProp_(PROP.ROOT_FOLDER_ID);
          return id ? 'https://drive.google.com/drive/folders/' + id : '';
        })()
      }
    };
  });
}

/** ส่งอีเมลทดสอบไปยังผู้รับแจ้งเตือนทั้งหมด ใช้ตรวจว่าการแจ้งเตือนทำงานจริง */
function apiAdminTestEmail(token) {
  return respond_(function () {
    var me = requireAdmin_(token);
    var to = staffRecipients_();
    if (to.length === 0) {
      throw appError_('ยังไม่มีอีเมลผู้รับแจ้งเตือน กรุณากรอกช่อง "อีเมลเจ้าหน้าที่ที่รับแจ้งเตือน" ก่อน');
    }
    var body =
      '<p>นี่คืออีเมลทดสอบจากระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์</p>' +
      '<p>หากท่านได้รับอีเมลฉบับนี้ แปลว่าการแจ้งเตือนคำขอใหม่จะส่งถึงท่านได้แน่นอน</p>' +
      emailTable_([
        ['ผู้ทดสอบ', escapeHtml_(me.name || me.email)],
        ['เวลาที่ทดสอบ', escapeHtml_(formatThaiDate_(new Date(), true))],
        ['ผู้รับทั้งหมด', escapeHtml_(to.join(', '))]
      ]);
    sendMail_(to, 'ทดสอบการแจ้งเตือน — ' + APP.NAME,
      emailShell_('ทดสอบการแจ้งเตือน', APP.ORG, body, '', ''));
    return { sentTo: to };
  });
}

function apiAdminSaveSettings(token, patch) {
  return respond_(function () {
    requireAdmin_(token);
    var p = patch || {};
    var saved = 0;
    for (var key in p) {
      if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
      setSetting_(key, p[key]);
      saved++;
    }
    return { saved: saved };
  });
}

/** บันทึกหรือลบ API key ของ Claude (เก็บใน Script Properties ไม่แสดงกลับหน้าเว็บ) */
function apiAdminSetApiKey(token, apiKey) {
  return respond_(function () {
    requireAdmin_(token);
    var key = str_(apiKey);
    if (!key) {
      props_().deleteProperty(PROP.ANTHROPIC_API_KEY);
      return { hasApiKey: false };
    }
    if (key.indexOf('sk-ant-') !== 0) {
      throw appError_('รูปแบบ API key ไม่ถูกต้อง ต้องขึ้นต้นด้วย sk-ant-');
    }
    setProp_(PROP.ANTHROPIC_API_KEY, key);
    return { hasApiKey: true };
  });
}

function apiAdminUsers(token) {
  return respond_(function () {
    return listUsers_(token);
  });
}

function apiAdminSaveUser(token, payload) {
  return respond_(function () {
    return saveUser_(token, payload);
  });
}

