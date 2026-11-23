/**
 * ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์
 * ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์
 *
 * ไฟล์นี้สร้างอัตโนมัติจาก apps-script/*.gs ด้วยคำสั่ง  npm run bundle
 * ห้ามแก้ไขไฟล์นี้โดยตรง ให้แก้ที่ apps-script/ แล้วสร้างใหม่
 *
 * รวมจาก 15 ไฟล์: 00_Config.gs, 01_Utils.gs, 02_Store.gs, 03_Setup.gs, 04_Requests.gs, 05_Files.gs, 06_Mailer.gs, 07_AI.gs, 08_Auth.gs, 09_Stats.gs, 10_WebApp.gs, 11_Requester.gs, 12_Library.gs, 13_Archive.gs, 14_Designers.gs
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
  WEBAPP_URL: 'WEBAPP_URL',
  RESOURCE_FOLDER_ID: 'RESOURCE_FOLDER_ID',
  ARCHIVE_SPREADSHEET_ID: 'ARCHIVE_SPREADSHEET_ID'
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
  COUNTERS: 'Counters',
  REPLIES: 'Replies',       // ผู้ขอตอบ "รอข้อมูลเพิ่มเติม" ผ่านระบบ
  FEEDBACK: 'Feedback',     // แบบประเมินความพึงพอใจหลังส่งมอบ
  RESOURCES: 'Resources',   // คลังไฟล์ CI ให้ดาวน์โหลดเอง
  DESIGNERS: 'Designers'    // รายชื่อผู้ออกแบบที่ผู้ขอเลือกได้
};

/**
 * สีประจำตัวผู้ออกแบบ (เรียงตามลำดับที่เพิ่ม) ใช้ในปฏิทินและกราฟภาระงาน
 * 4 สีแรกแยกกันชัดสำหรับทีม 4 คน สีเทาสงวนไว้สำหรับงานที่ยังไม่ระบุผู้ออกแบบ
 */
var DESIGNER_COLORS = ['#2563eb', '#db2777', '#059669', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#be123c'];
var UNASSIGNED_COLOR = '#94a3b8';

/** ชีตที่เก็บข้อมูลของคำขอแต่ละใบ (ใช้ตอนลบคำขอ ล้างข้อมูล และย้ายข้อมูลเก่าไปเก็บถาวร) */
var JOB_SHEETS = ['Deliverables', 'Attachments', 'Revisions', 'Timeline', 'Replies', 'Feedback'];

/** หมวดของไฟล์ในคลังไฟล์ CI */
var RESOURCE_CATEGORIES = [
  'ตราสัญลักษณ์และโลโก้',
  'เทมเพลตสื่อประชาสัมพันธ์',
  'เทมเพลตสไลด์และเอกสาร',
  'ฟอนต์และชุดสี',
  'คู่มืออัตลักษณ์องค์กร (CI)',
  'ภาพถ่ายคณะ',
  'อื่น ๆ'
];

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

/**
 * ขั้นถัดไปตามขั้นตอนปกติ (from -> [to]) ใช้แสดงเป็นปุ่มแนะนำในหน้าจัดการงาน
 * เจ้าหน้าที่เปลี่ยนไปสถานะอื่นนอกรายการนี้ได้เสมอ (ข้ามขั้น ย้อนขั้น หรือเปิดงานที่ปิดแล้วอีกครั้ง)
 * เพราะบางครั้งคุยกับผู้ขอโดยตรงและแก้ไขเสร็จทันทีโดยไม่ผ่านระบบ
 */
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
/**
 * หน่วยงานและสาขาวิชาของคณะศิลปศาสตร์ แบ่งกลุ่มตาม https://arts.tu.ac.th/th
 * (หลักสูตรปริญญาตรี บัณฑิตศึกษา ศูนย์ และสำนักงานคณะ) แบบฟอร์มแสดงเป็นกลุ่มใน dropdown
 * ชื่อสำนักงานคณะไม่มีบนเว็บไซต์ แก้ให้ตรงกับโครงสร้างจริงได้ที่นี่
 * คำขอเดิมเก็บชื่อหน่วยงานเป็นข้อความ แก้รายชื่อนี้แล้วข้อมูลเดิมไม่เปลี่ยน
 */
var DEPARTMENT_GROUPS = [
  { group: 'สาขาวิชา (ปริญญาตรี หลักสูตรปกติ)', items: [
    'สาขาวิชาภาษาไทย',
    'สาขาวิชาภาษาอังกฤษ',
    'สาขาวิชาภาษาและวรรณคดีอังกฤษ',
    'สาขาวิชาภาษาฝรั่งเศส',
    'สาขาวิชาภาษาเยอรมัน',
    'สาขาวิชาภาษารัสเซีย',
    'สาขาวิชาภาษาจีน',
    'สาขาวิชาภาษาญี่ปุ่น',
    'สาขาวิชาภาษาศาสตร์',
    'สาขาวิชาบรรณารักษศาสตร์และสารสนเทศศาสตร์',
    'สาขาวิชาประวัติศาสตร์',
    'สาขาวิชาปรัชญา',
    'สาขาวิชาสเปนและลาตินอเมริกันศึกษา',
    'สาขาวิชาจิตวิทยา',
    'สาขาวิชาภูมิศาสตร์และภูมิสารสนเทศ'
  ] },
  { group: 'หลักสูตรพิเศษและหลักสูตรนานาชาติ', items: [
    'สาขาวิชาการแปลและล่ามในยุคดิจิทัล',
    'สาขาวิชาเอเชียตะวันออกเฉียงใต้ศึกษา',
    'สาขาวิชารัสเซียและยูเรเชียศึกษา',
    'สาขาวิชานานาชาติศึกษาและการสื่อสารระดับสากล (IGC)',
    'สาขาวิชาการสื่อสารเชิงธุรกิจ (BC)'
  ] },
  { group: 'บัณฑิตศึกษา (ปริญญาโทและเอก)', items: [
    'สาขาวิชาญี่ปุ่นศึกษา',
    'สาขาวิชาพุทธศาสนศึกษา',
    'สาขาวิชาภาษาอังกฤษศึกษา',
    'สาขาวิชาวรรณกรรมและการศึกษาเปรียบเทียบ',
    'สาขาวิชาเอเชียตะวันออกเฉียงใต้และอาณาบริเวณศึกษาเปรียบเทียบ'
  ] },
  { group: 'ศูนย์และโครงการ', items: [
    'ศูนย์การแปลราชนครินทร์',
    'ศูนย์ทดสอบวัดระดับภาษา',
    'ศูนย์อบรมและพัฒนาทักษะ',
    'ศูนย์ฟิลิปปินส์ศึกษา',
    'โครงการบริการวิชาการ'
  ] },
  { group: 'สำนักงานคณะ', items: [
    'ฝ่ายบริหารงานทั่วไป',
    'ฝ่ายวิชาการ',
    'ฝ่ายการนักศึกษา',
    'ฝ่ายวิจัยและบริการวิชาการ',
    'ฝ่ายวิเทศสัมพันธ์',
    'ฝ่ายสื่อสารองค์กร',
    'งานบัณฑิตศึกษา',
    'งานคลังและพัสดุ',
    'กลุ่มงานทรัพยากรมนุษย์'
  ] }
];

/** รายชื่อแบบเรียงต่อกัน (ตัวเลือกสุดท้าย "อื่น ๆ" ให้ผู้ขอพิมพ์ชื่อหน่วยงานเอง) */
var DEPARTMENTS = (function () {
  var all = [];
  for (var i = 0; i < DEPARTMENT_GROUPS.length; i++) all = all.concat(DEPARTMENT_GROUPS[i].items);
  all.push('อื่น ๆ');
  return all;
})();

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
  publicWorkload: 'true',
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
  Counters:   ['name', 'value'],
  Replies:    ['id', 'jobId', 'createdAt', 'byName', 'byEmail', 'question', 'answer', 'fileCount', 'returnedTo'],
  Feedback:   ['id', 'jobId', 'createdAt', 'updatedAt', 'rating', 'comment', 'byEmail'],
  Resources:  ['id', 'title', 'description', 'category', 'kind', 'url', 'fileId', 'fileName', 'mimeType',
    'sizeBytes', 'active', 'sortOrder', 'createdAt', 'createdBy', 'updatedAt'],
  Designers:  ['id', 'name', 'shortName', 'specialty', 'color', 'email', 'capacity', 'accepting', 'active',
    'sortOrder', 'createdAt', 'updatedAt']
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

/**
 * เบอร์โทรสำหรับแสดงผล
 * แถวที่บันทึกก่อนแก้ปัญหาเลข 0 หาย จะเหลือ 8-9 หลักโดยไม่มี 0 นำหน้า จึงเติมกลับให้
 */
function phoneOut_(v) {
  var digits = str_(v).replace(/[^0-9]/g, '');
  if (!digits) return str_(v);
  if (digits.charAt(0) !== '0' && (digits.length === 8 || digits.length === 9)) digits = '0' + digits;
  return digits;
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
  var BOOLEAN = ['notifyOwnerAlways', 'aiEnabled', 'publicFormOpen', 'publicWorkload'];

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


/* ==========================================================================
   02_Store.gs
   ========================================================================== */

/**
 * 02_Store.gs — ชั้นเข้าถึงข้อมูล (Google Sheets เป็นฐานข้อมูล)
 * ทุกฟังก์ชันในไฟล์นี้อ่าน/เขียนชีตโดยตรง ส่วน business logic อยู่ที่ไฟล์อื่น
 */

/** ชีตที่เมื่อเปลี่ยนแล้วต้องล้างแคชคิวงานบนหน้ายื่นคำขอ */
function touchesPublicView_(name) {
  return name === SHEET.REQUESTS || name === SHEET.DESIGNERS;
}

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
    // ชีตใหม่ (เช่น ชีตที่เพิ่มในเวอร์ชันหลัง) สร้างให้เองเมื่อใช้ครั้งแรก
    // ถ้ามีคนเปิดพร้อมกันแล้วอีกคนสร้างไปก่อน ให้ใช้ชีตที่สร้างแล้วแทน
    try {
      sh = book.insertSheet(name);
      writeHeader_(sh, name);
    } catch (err) {
      sh = book.getSheetByName(name);
      if (!sh) throw err;
    }
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
  return readRows_(sheet_(name), name);
}

/** อ่านทุกแถวจากชีตที่ระบุ (ใช้ได้กับสเปรดชีตเก็บถาวรด้วย) โดยใช้โครงสร้างคอลัมน์ของชีตชื่อ name */
function readRows_(sh, name) {
  if (!sh) return [];
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

/**
 * แปลงค่าก่อนเขียนลงชีต ให้ Google Sheets เก็บเป็นข้อความตามที่กรอกจริง
 * Sheets ตีความข้อความที่พิมพ์เข้าไปเหมือนคนพิมพ์เอง จึงเกิดปัญหา 2 แบบ
 *  - ตัวเลขที่ขึ้นต้นด้วย 0 เช่นเบอร์โทร 0812345678 ถูกแปลงเป็นตัวเลขและเลข 0 หาย
 *  - ข้อความที่ขึ้นต้นด้วย = + - @ ถูกตีความเป็นสูตร เช่น "- วันที่ 20" กลายเป็น #ERROR!
 *    และเปิดช่องให้แทรกสูตรจากแบบฟอร์มสาธารณะได้
 * ใส่ ' นำหน้าเพื่อบังคับเป็นข้อความ Sheets จะไม่เก็บเครื่องหมายนี้ไว้ในค่าจริง
 */
function sheetValue_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string' || v === '') return v;
  if (/^[=+\-@']/.test(v)) return "'" + v;
  if (/^[0-9]+$/.test(v) && (v.charAt(0) === '0' || v.length > 15)) return "'" + v;
  return v;
}

function objectToRow_(obj, cols) {
  var row = [];
  for (var c = 0; c < cols.length; c++) {
    row.push(sheetValue_(obj[cols[c]]));
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
  if (touchesPublicView_(name)) bustPublicCache_();
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
    sh.getRange(rowIndex, idx + 1).setValue(sheetValue_(patch[keys[i]]));
  }
  if (touchesPublicView_(name)) bustPublicCache_();
}

/** ลบแถว */
function remove_(name, rowIndex) {
  deleteDataRows_(sheet_(name), rowIndex, 1, COLUMNS[name].length);
  if (touchesPublicView_(name)) bustPublicCache_();
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
  for (var r = rows.length - 1; r >= 0; r--) deleteDataRows_(sh, rows[r], 1, cols.length);
  return rows.length;
}

/** ลบข้อมูลทุกแถวของชีต โดยคงหัวตารางไว้ คืนจำนวนแถวที่ลบ */
function clearSheetRows_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  deleteDataRows_(sh, 2, lastRow - 1, COLUMNS[name].length);
  if (touchesPublicView_(name)) bustPublicCache_();
  return lastRow - 1;
}

/**
 * ลบแถวข้อมูลช่วงหนึ่ง
 * Google Sheets ไม่ยอมให้ลบแถวที่ไม่ได้ตรึงไว้จนหมดทุกแถว (เกิดได้เมื่อชีตยาวเกิน 1,000 แถว
 * เพราะ appendRow เพิ่มแถวพอดีกับข้อมูล) จึงล้างค่าก่อนแล้วเว้นแถวสุดท้ายไว้หนึ่งแถว
 */
function deleteDataRows_(sh, start, count, width) {
  if (count <= 0) return;
  sh.getRange(start, 1, count, width).clearContent();
  var deletable = Math.min(count, sh.getMaxRows() - start);
  if (deletable > 0) sh.deleteRows(start, deletable);
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
  bustPublicCache_(); // เช่น เปิด/ปิดการแสดงคิวงานบนหน้ายื่นคำขอ
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
    SHEET.TIMELINE, SHEET.USERS, SHEET.SETTINGS, SHEET.COUNTERS,
    SHEET.REPLIES, SHEET.FEEDBACK, SHEET.RESOURCES, SHEET.DESIGNERS];
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
function validateRequestPayload_(payload, options) {
  var p = payload || {};
  // staffEdit: เจ้าหน้าที่แก้ไขคำขอเดิม ยอมให้กำหนดใช้งานเป็นวันที่ผ่านมาแล้ว
  // ไม่บังคับเหตุผลงานด่วนและการยอมรับเงื่อนไข และพิมพ์ชื่อหน่วยงานเองได้
  var staffEdit = !!(options && options.staffEdit);
  var errors = [];
  var out = {};

  out.requesterName = truncate_(pick_(p, 'requesterName', ''), 150);
  if (out.requesterName.length < 2) errors.push('กรุณากรอกชื่อ-นามสกุลผู้ขอรับบริการ');

  out.requesterEmail = truncate_(str_(pick_(p, 'requesterEmail', '')).toLowerCase(), 254);
  if (!isValidEmail_(out.requesterEmail)) errors.push('รูปแบบอีเมลไม่ถูกต้อง');

  // เบอร์โทรไม่บังคับ แต่ถ้ากรอกต้องถูกรูปแบบ เจ้าหน้าที่จะได้โทรกลับได้จริง
  out.requesterPhone = normalizePhone_(pick_(p, 'requesterPhone', ''));
  if (out.requesterPhone && !isValidPhone_(out.requesterPhone)) {
    errors.push('เบอร์โทรศัพท์ต้องมี 9-10 หลัก หรือเว้นว่างไว้ถ้าไม่ต้องการให้ติดต่อทางโทรศัพท์');
  }

  var dept = truncate_(pick_(p, 'department', ''), 150);
  if (dept === 'อื่น ๆ' && !(staffEdit && !pick_(p, 'departmentOther', ''))) {
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
    if (daysAhead < 0 && !staffEdit) {
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
  if (due && !staffEdit) {
    var lead = daysBetween_(new Date(), due);
    if (lead >= 0 && lead < minLead && !out.rushReason) {
      errors.push('กำหนดใช้งานเหลือน้อยกว่า ' + minLead + ' วัน กรุณาระบุเหตุผลความจำเป็นเร่งด่วน');
    }
  }

  if (!staffEdit && pick_(p, 'acceptTerms', false) !== true && str_(pick_(p, 'acceptTerms', '')) !== 'true') {
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
  // ผู้ออกแบบที่ผู้ขอเลือก (ไม่เลือก = ให้ฝ่ายฯ จัดสรรให้) ตรวจก่อนออกเลขที่ เพื่อไม่ให้เลขที่ถูกใช้ไปเปล่า ๆ
  var designer = requesterDesigner_(pick_(payload, 'designerId', ''));
  var pooled = !designer && str_(pick_(payload, 'designerId', '')) === DESIGNER_POOL;

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
      assignedTo: designer ? designer.name : '',
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
    if (designer) {
      logTimeline_(jobId, data.requesterName, 'ASSIGN', '', '', 'ผู้ขอเลือกผู้ออกแบบ: ' + designer.name);
    } else if (pooled) {
      logTimeline_(jobId, data.requesterName, 'ASSIGN', '', '', 'ผู้ขอเลือกให้ฝ่ายฯ จัดสรรผู้ออกแบบให้');
    }

    return {
      jobId: jobId,
      trackToken: row.trackToken,
      designerName: designer ? designer.name : '',
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
  var id = str_(jobId).toUpperCase();
  // ตรวจและบันทึกภายใต้ lock เพื่อไม่ให้การกดซ้ำหรืองานเบื้องหลังส่งอีเมลยืนยันซ้ำ
  var state = withLock_(function () {
    var row = findBy_(SHEET.REQUESTS, 'jobId', id);
    if (!row) throw appError_('ไม่พบเลขที่คำขอ ' + id);
    if (str_(row.submittedAt)) return { req: row, already: true };

    var count = filterBy_(SHEET.ATTACHMENTS, 'jobId', id).length;
    var now = nowIso_();
    update_(SHEET.REQUESTS, row._row, { submittedAt: now, attachmentCount: count, updatedAt: now });
    row.submittedAt = now;
    row.attachmentCount = count;
    logTimeline_(id, row.requesterName, 'SUBMIT', '', STATUS.NEW.key,
      'ยืนยันการยื่นคำขอ พร้อมไฟล์แนบ ' + count + ' ไฟล์');
    return { req: row, already: false };
  });
  var req = state.req;
  if (state.already) {
    return { jobId: req.jobId, alreadyFinalized: true, trackUrl: buildTrackUrl_(req) };
  }

  // แจ้งผู้ขอรับบริการและเจ้าหน้าที่ (ไม่ให้ error ของอีเมลทำให้คำขอล้มเหลว)
  try {
    sendConfirmationEmail_(req);
  } catch (err) {
    logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'ส่งอีเมลยืนยันไม่สำเร็จ: ' + err.message);
  }
  try {
    sendStaffNewRequestEmail_(req);
  } catch (err) {
    logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่ไม่สำเร็จ: ' + err.message);
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
    timeline: getTimeline_(req.jobId),
    replies: sortByTime_(filterBy_(SHEET.REPLIES, 'jobId', req.jobId), 'createdAt'),
    feedback: findBy_(SHEET.FEEDBACK, 'jobId', req.jobId)
  };
}

/** เรียงจากเก่าไปใหม่ตามคอลัมน์เวลา คงลำดับเดิมเมื่อเวลาเท่ากัน */
function sortByTime_(rows, key) {
  return rows.slice().sort(function (a, b) {
    var x = str_(a[key]);
    var y = str_(b[key]);
    return x === y ? 0 : (x < y ? -1 : 1);
  });
}

/* ------------------------------------------- กำหนดส่งร่างแรก (SLA) */

/** บวกวันทำการ (ข้ามเสาร์ อาทิตย์ ไม่นับวันหยุดนักขัตฤกษ์) */
function addBusinessDays_(date, days) {
  var d = startOfDay_(date);
  if (!d) return null;
  var added = 0;
  var guard = 0;
  while (added < days && guard < 400) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    var w = d.getDay();
    if (w !== 0 && w !== 6) added++;
    guard++;
  }
  return d;
}

/**
 * กำหนดส่งร่างแรกตามเงื่อนไขการให้บริการ (slaFirstDraftDays วันทำการ)
 * เริ่มนับจากวันยื่นคำขอ หรือวันที่ผู้ขอส่งข้อมูลเพิ่มเติมครั้งล่าสุด (ข้อมูลครบเมื่อไรเริ่มนับเมื่อนั้น)
 * ระหว่างรอข้อมูลเพิ่มเติมไม่นับ และเมื่อส่งร่างแรกแล้วจะไม่แสดงอีก
 */
function firstDraftSla_(r, lastReplyAt) {
  var st = str_(r.status).toUpperCase();
  if (str_(r.firstDraftAt)) return null;
  if (st !== STATUS.NEW.key && st !== STATUS.DESIGNING.key) return null;
  if (!str_(r.submittedAt)) return null;
  var start = parseDate_(r.submittedAt);
  var replied = parseDate_(lastReplyAt);
  if (replied && (!start || replied > start)) start = replied;
  var due = addBusinessDays_(start, getSettingInt_('slaFirstDraftDays', 5));
  if (!due) return null;
  var left = daysBetween_(new Date(), due);
  return {
    dueDate: Utilities.formatDate(due, APP.TIMEZONE, 'yyyy-MM-dd'),
    daysLeft: left,
    overdue: left < 0
  };
}

/** เวลาที่ผู้ขอตอบข้อมูลเพิ่มเติมครั้งล่าสุดของทุกงาน (อ่านชีตครั้งเดียว) */
function lastReplyMap_() {
  var map = {};
  var rows = readAll_(SHEET.REPLIES);
  for (var i = 0; i < rows.length; i++) {
    var id = str_(rows[i].jobId);
    var at = str_(rows[i].createdAt);
    if (!map[id] || at > map[id]) map[id] = at;
  }
  return map;
}

/* ------------------------------------------- เจ้าหน้าที่แก้ไขข้อมูลคำขอ */

/** ช่องที่เจ้าหน้าที่แก้ได้ พร้อมชื่อที่แสดงในประวัติ (short = แสดงค่าเดิมและค่าใหม่) */
var EDITABLE_FIELDS = [
  { key: 'projectName', label: 'ชื่อโครงการ', short: true },
  { key: 'dueDate', label: 'กำหนดใช้งาน', short: true, date: true },
  { key: 'eventDate', label: 'วันจัดกิจกรรม', short: true, date: true },
  { key: 'requesterName', label: 'ชื่อผู้ประสานงาน', short: true },
  { key: 'requesterEmail', label: 'อีเมลผู้ประสานงาน', short: true },
  { key: 'requesterPhone', label: 'โทรศัพท์', short: true },
  { key: 'lineId', label: 'LINE ID', short: true },
  { key: 'department', label: 'หน่วยงาน', short: true },
  { key: 'objective', label: 'วัตถุประสงค์', brief: true },
  { key: 'targetAudience', label: 'กลุ่มเป้าหมาย', brief: true },
  { key: 'keyMessage', label: 'ข้อความหลัก', brief: true },
  { key: 'mandatoryText', label: 'ข้อความบังคับบนชิ้นงาน', brief: true },
  { key: 'referenceUrl', label: 'ตัวอย่างอ้างอิง', brief: true },
  { key: 'channels', label: 'ช่องทางเผยแพร่', brief: true },
  { key: 'notes', label: 'หมายเหตุ', brief: true },
  { key: 'rushReason', label: 'เหตุผลความเร่งด่วน' }
];

/** แปลงแถวคำขอกลับเป็นรูปแบบเดียวกับข้อมูลจากแบบฟอร์ม */
function requestToPayload_(req, deliverables) {
  return {
    requesterName: str_(req.requesterName),
    requesterEmail: str_(req.requesterEmail),
    requesterPhone: phoneOut_(req.requesterPhone),
    lineId: str_(req.lineId),
    department: str_(req.department),
    projectName: str_(req.projectName),
    eventDate: str_(req.eventDate).substring(0, 10),
    dueDate: str_(req.dueDate).substring(0, 10),
    objective: str_(req.objective),
    targetAudience: str_(req.targetAudience),
    keyMessage: str_(req.keyMessage),
    mandatoryText: str_(req.mandatoryText),
    referenceUrl: str_(req.referenceUrl),
    channels: splitList_(req.channels),
    notes: str_(req.notes),
    rushReason: str_(req.rushReason),
    deliverables: deliverables.map(function (d) {
      return {
        mediaType: str_(d.mediaType),
        mediaOther: str_(d.mediaType) === 'other' ? str_(d.mediaLabel) : '',
        size: str_(d.size),
        quantity: int_(d.quantity, 1),
        note: str_(d.note)
      };
    })
  };
}

function deliverablesKey_(items) {
  return JSON.stringify(items.map(function (d) {
    return [str_(d.mediaType), str_(d.mediaLabel), str_(d.size), int_(d.quantity, 1), str_(d.note)];
  }));
}

/**
 * เจ้าหน้าที่แก้ไขข้อมูลคำขอ (เช่น เลื่อนกำหนดใช้งาน แก้ชื่อโครงการ เปลี่ยนรายการชิ้นงาน)
 * ตรวจข้อมูลด้วยกติกาเดียวกับแบบฟอร์ม บันทึกเฉพาะช่องที่เปลี่ยน และบันทึกในประวัติว่าใครแก้อะไร
 * options.notify = ส่งอีเมลแจ้งผู้ขอว่ามีการปรับข้อมูล
 */
function editRequest_(jobId, payload, actor, options) {
  var id = str_(jobId).toUpperCase();
  var p = payload || {};
  var result = withLock_(function () {
    var req = getRequest_(id);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);
    var oldItems = filterBy_(SHEET.DELIVERABLES, 'jobId', id)
      .sort(function (a, b) { return int_(a.seq) - int_(b.seq); });
    var current = requestToPayload_(req, oldItems);

    var merged = {};
    for (var k in current) if (Object.prototype.hasOwnProperty.call(current, k)) merged[k] = current[k];
    for (var key in p) {
      if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
      if (Object.prototype.hasOwnProperty.call(current, key) || key === 'departmentOther') merged[key] = p[key];
    }
    var data = validateRequestPayload_(merged, { staffEdit: true });

    var patch = {};
    var changes = [];
    var briefChanged = false;
    for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
      var f = EDITABLE_FIELDS[i];
      var before = f.key === 'channels' ? joinList_(current.channels) : str_(current[f.key]);
      var after = str_(data[f.key]);
      if (before === after) continue;
      patch[f.key] = after;
      if (f.brief || f.date || f.key === 'projectName') briefChanged = true;
      var show = function (v) { return f.date ? (v ? formatThaiDate_(v) : '(ไม่ระบุ)') : (v || '(ว่าง)'); };
      changes.push({
        field: f.key, label: f.label,
        text: f.short ? f.label + ' จาก ' + truncate_(show(before), 80) + ' เป็น ' + truncate_(show(after), 80)
          : f.label
      });
    }

    var itemsChanged = deliverablesKey_(oldItems) !== deliverablesKey_(data.deliverables);
    if (itemsChanged) {
      briefChanged = true;
      changes.push({ field: 'deliverables', label: 'รายการชิ้นงาน', text: 'รายการชิ้นงาน' });
    }
    if (changes.length === 0) return { jobId: id, changes: [] };

    if (patch.dueDate) patch.priority = calcPriority_(patch.dueDate);
    // ข้อมูลที่ใช้สรุปโจทย์เปลี่ยน ให้งานเบื้องหลังสรุป Design Brief ใหม่ให้ตรงกับข้อมูลล่าสุด
    if (briefChanged && str_(req.submittedAt)) patch.briefStatus = 'PENDING';
    patch.updatedAt = nowIso_();
    patch.updatedBy = str_(actor);
    update_(SHEET.REQUESTS, req._row, patch);

    if (itemsChanged) {
      removeWhere_(SHEET.DELIVERABLES, 'jobId', id);
      for (var j = 0; j < data.deliverables.length; j++) {
        var d = data.deliverables[j];
        insert_(SHEET.DELIVERABLES, {
          id: newId_('D'), jobId: id, seq: j + 1, mediaType: d.mediaType, mediaLabel: d.mediaLabel,
          size: d.size, quantity: d.quantity, note: d.note
        });
      }
    }

    logTimeline_(id, actor, 'EDIT', '', '', 'แก้ไขข้อมูลคำขอ: ' +
      changes.map(function (c) { return c.text; }).join(' / '));
    return { jobId: id, changes: changes, briefQueued: patch.briefStatus === 'PENDING' };
  });

  if (result.briefQueued) {
    try { scheduleWorker_(); } catch (err) { /* ทริกเกอร์ทุก 5 นาทีจะทำให้เอง */ }
  }
  if (options && options.notify && result.changes.length > 0) {
    try {
      sendRequestEditedEmail_(getRequest_(id), result.changes);
      result.notified = true;
    } catch (err) {
      logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งผู้ขอเรื่องแก้ไขข้อมูลไม่สำเร็จ: ' + err.message);
    }
  }
  return result;
}

/**
 * ความเร่งด่วนตามวันที่เหลือจริง
 * ค่าที่บันทึกตอนยื่นคำขอไม่เปลี่ยนตามเวลา งานที่ยื่นล่วงหน้า 30 วันจึงยังขึ้น "ปกติ"
 * แม้เหลืออีก 1 วัน งานที่ยังไม่ปิดจึงคำนวณใหม่จากกำหนดใช้งานทุกครั้ง
 */
function livePriority_(r) {
  var st = str_(r.status).toUpperCase();
  if (st === STATUS.DELIVERED.key || st === STATUS.CANCELLED.key || !str_(r.dueDate)) {
    return priorityInfo_(r.priority).key;
  }
  return calcPriority_(r.dueDate);
}

/**
 * ผู้ขออนุมัติร่างฉบับปัจจุบันแล้วหรือยัง ดูจากประวัติ (เรียงเก่าไปใหม่)
 * การส่งร่างใหม่ให้ตรวจ หรือการขอแก้ไข จะล้างสถานะอนุมัติเดิม
 */
function draftApproval_(timeline) {
  var state = { approved: false, approvedAt: '' };
  for (var i = 0; i < timeline.length; i++) {
    var t = timeline[i];
    var action = str_(t.action);
    if (action === 'APPROVE') {
      state = { approved: true, approvedAt: str_(t.at) };
    } else if (action === 'REVISION' ||
      (action === 'STATUS' && str_(t.toStatus) === STATUS.REVIEW.key)) {
      state = { approved: false, approvedAt: '' };
    }
  }
  return state;
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
  // คำนวณ token ใหม่ทุกครั้งแทนการอ่านจากชีต token เป็น base64url จึงอาจขึ้นต้นด้วย -
  // แถวที่บันทึกก่อนมี sheetValue_ ถูก Sheets ตีความเป็นสูตรจนกลายเป็น #ERROR! ลิงก์ติดตามจึงเสีย
  return base + '?page=track&job=' + encodeURIComponent(req.jobId) +
    '&t=' + encodeURIComponent(makeTrackToken_(req.jobId));
}

/**
 * มุมมองสาธารณะสำหรับผู้ขอรับบริการ
 * ต้องยืนยันตัวตนด้วย token จากอีเมล หรืออีเมลที่ตรงกับผู้ยื่นคำขอ
 */
function getPublicView_(jobId, email, token) {
  var id = str_(jobId).toUpperCase();
  var full = getRequestFull_(id);
  var archived = false;
  if (!full) {
    full = archivedRequestFull_(id);
    archived = !!full;
  }
  if (!full) return null;
  var req = full.request;

  var authorized = false;
  if (token && verifyTrackToken_(id, token)) authorized = true;
  if (!authorized && email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase()) authorized = true;
  if (!authorized) return null;

  var live = !archived;
  var deliverables = full.deliverables.map(function (d) {
    return { mediaLabel: str_(d.mediaLabel), size: str_(d.size), quantity: int_(d.quantity), note: str_(d.note) };
  });
  var revisions = full.revisions.map(function (r) {
    return { round: int_(r.round), createdAt: str_(r.createdAt), byName: str_(r.byName), comment: str_(r.comment) };
  });

  var approval = draftApproval_(full.timeline);
  var st = str_(req.status);
  var inReview = live && st === STATUS.REVIEW.key;
  var timeline = full.timeline
    .filter(function (t) {
      var a = str_(t.action);
      // การมอบหมายของเจ้าหน้าที่เป็นข้อมูลภายใน (อาจเป็นชื่อที่พิมพ์เอง) ผู้ขอเห็นผู้ออกแบบจาก designer แทน
      // ยกเว้นรายการที่ผู้ขอเลือกผู้ออกแบบเองตอนยื่นคำขอ
      if (a === 'ASSIGN') return str_(t.detail).indexOf('ผู้ขอเลือก') === 0;
      return a !== 'EMAIL_ERROR' && a !== 'NOTE' && a !== 'EDIT' && a !== 'ERROR';
    })
    .map(function (t) {
      return {
        at: str_(t.at), action: str_(t.action), toStatus: str_(t.toStatus),
        toLabel: str_(t.toStatus) ? statusInfo_(t.toStatus).label : '',
        detail: str_(t.detail)
      };
    });

  var files = full.attachments
    .filter(function (f) { return str_(f.kind) === 'final'; })
    .map(function (f) { return { fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: int_(f.sizeBytes) }; });

  var info = statusInfo_(req.status);
  var infoNeeded = live && st === STATUS.INFO_NEEDED.key;
  return {
    jobId: req.jobId,
    archived: archived,
    status: info.key,
    statusLabel: info.label,
    statusEn: info.en,
    statusStep: info.step,
    statusColor: info.color,
    priority: priorityInfo_(livePriority_(req)).label,
    projectName: req.projectName,
    requesterName: req.requesterName,
    department: req.department,
    designer: publicDesignerOf_(req.assignedTo),
    createdAt: str_(req.createdAt),
    dueDate: str_(req.dueDate),
    deliveredAt: str_(req.deliveredAt),
    draftUrl: str_(req.draftUrl),
    revisionCount: int_(req.revisionCount),
    revisionLimit: int_(req.revisionLimit),
    cancelReason: str_(req.cancelReason),
    approved: inReview && approval.approved,
    approvedAt: inReview ? approval.approvedAt : '',
    canRequestRevision: inReview && !approval.approved &&
      int_(req.revisionCount) < int_(req.revisionLimit),
    canApprove: inReview && !approval.approved,
    infoRequest: infoNeeded ? infoQuestion_(full.timeline) : null,
    canReply: infoNeeded,
    replyMaxFiles: getSettingInt_('maxFiles', 8),
    feedback: feedbackView_(full.feedback),
    canRate: live && st === STATUS.DELIVERED.key,
    deliverables: deliverables,
    revisions: revisions,
    finalFiles: files,
    timeline: timeline
  };
}

/* ------------------------------------------------------- Status & actions */

/** ตรวจว่าเป็นขั้นถัดไปตามขั้นตอนปกติหรือไม่ (ไม่ใช่การข้ามขั้น) */
function isNormalTransition_(from, to) {
  var allowed = STATUS_TRANSITIONS[str_(from).toUpperCase()];
  if (!allowed) return false;
  return allowed.indexOf(str_(to).toUpperCase()) >= 0;
}

/** สถานะที่งานถือว่าเริ่มลงมือออกแบบแล้ว */
var WORK_STARTED_STATUSES = ['DESIGNING', 'REVIEW', 'REVISING', 'DELIVERED'];

/**
 * เปลี่ยนสถานะงาน (ใช้โดยเจ้าหน้าที่)
 * เปลี่ยนไปสถานะใดก็ได้ที่ไม่ใช่สถานะเดิม รวมถึงข้ามขั้นและเปิดงานที่ปิดแล้วอีกครั้ง
 * ข้อมูลวันที่ของงานจะถูกปรับให้สอดคล้องกับสถานะใหม่เสมอ เพื่อให้แดชบอร์ดนับถูก
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

    var patch = { status: to, updatedAt: nowIso_(), updatedBy: str_(actor) };

    // ข้ามจากรับคำขอไปรอตรวจร่างหรือส่งมอบเลยก็ถือว่าเริ่มงานแล้ว
    if (WORK_STARTED_STATUSES.indexOf(to) >= 0 && !str_(req.startedAt)) {
      patch.startedAt = nowIso_();
    }

    // เปิดงานที่ปิดไปแล้วอีกครั้ง ต้องล้างข้อมูลการปิดงานเดิม
    // ไม่เช่นนั้นแดชบอร์ดจะนับระยะเวลาและวันส่งมอบผิด
    if (to !== STATUS.DELIVERED.key && str_(req.deliveredAt)) {
      patch.deliveredAt = '';
      patch.leadTimeDays = '';
    }
    if (to !== STATUS.CANCELLED.key && str_(req.cancelReason)) {
      patch.cancelReason = '';
    }
    if (to !== STATUS.DELIVERED.key && to !== STATUS.CANCELLED.key && str_(req.closedAt)) {
      patch.closedAt = '';
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
  // ชื่อที่ตรงกับผู้ออกแบบในรายชื่อ บันทึกเป็นชื่อมาตรฐาน งานจึงนับเข้าภาระงานของคนนั้นเสมอ
  var name = resolveAssignee_(assignee);
  var before = str_(req.assignedTo);
  update_(SHEET.REQUESTS, req._row, { assignedTo: name, updatedAt: nowIso_(), updatedBy: str_(actor) });
  logTimeline_(jobId, actor, 'ASSIGN', '', '', 'มอบหมายให้ ' + (name || '(ไม่ระบุ)'));
  var updated = getRequest_(jobId);
  // แจ้งผู้รับผิดชอบคนใหม่ทางอีเมล (ผู้ออกแบบที่ใส่อีเมลไว้ หรือบัญชีเจ้าหน้าที่ที่ชื่อตรงกัน)
  var contact = name ? assigneeContact_(name) : null;
  if (contact && designerKey_(before) !== designerKey_(name)) {
    try {
      sendAssignedEmail_(updated, contact, actor);
    } catch (err) {
      logTimeline_(jobId, 'system', 'EMAIL_ERROR', '', '', 'แจ้งผู้ออกแบบไม่สำเร็จ: ' + err.message);
    }
  }
  return updated;
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

    if (draftApproval_(getTimeline_(id)).approved) {
      throw appError_('ท่านอนุมัติร่างนี้แล้ว เจ้าหน้าที่กำลังจัดทำไฟล์ฉบับสมบูรณ์ ' +
        'หากต้องการแก้ไขเพิ่มเติม กรุณาติดต่อฝ่ายสื่อสารองค์กรโดยตรง');
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
  var result = withLock_(function () {
    var req = getRequest_(id);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);

    var authorized = (token && verifyTrackToken_(id, token)) ||
      (email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase());
    if (!authorized) throw appError_('ไม่มีสิทธิ์ดำเนินการกับคำขอนี้');

    if (str_(req.status) !== STATUS.REVIEW.key) {
      throw appError_('อนุมัติได้เฉพาะเมื่องานอยู่ในสถานะรอตรวจร่างเท่านั้น');
    }
    // กดซ้ำ (เช่น รีเฟรชแล้วกดอีก) ไม่ต้องบันทึกและแจ้งเจ้าหน้าที่ซ้ำ
    if (draftApproval_(getTimeline_(id)).approved) {
      return { jobId: id, approved: true, alreadyApproved: true };
    }

    logTimeline_(id, req.requesterName, 'APPROVE', STATUS.REVIEW.key, STATUS.REVIEW.key,
      'ผู้ขอรับบริการอนุมัติร่างชิ้นงานแล้ว รอเจ้าหน้าที่ส่งมอบไฟล์ฉบับสมบูรณ์');
    update_(SHEET.REQUESTS, req._row, { updatedAt: nowIso_(), updatedBy: req.requesterEmail });
    return { jobId: id, approved: true };
  });

  if (result.alreadyApproved) return result;
  try {
    sendApprovalToStaffEmail_(getRequest_(id));
  } catch (err) {
    logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องอนุมัติไม่สำเร็จ: ' + err.message);
  }
  return result;
}

/* ------------------------------------------------------------- การลบข้อมูล */

/** ย้ายโฟลเดอร์ของงานลงถังขยะ (ไม่โยน error หากโฟลเดอร์หายไปแล้ว) */
function trashJobFolder_(folderId) {
  var id = str_(folderId);
  if (!id) return false;
  try {
    DriveApp.getFolderById(id).setTrashed(true);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * ลบคำขอถาวร พร้อมข้อมูลที่เกี่ยวข้องทั้งหมด
 * ใช้กับข้อมูลทดสอบหรือคำขอที่ยื่นผิด ไม่ใช่การยกเลิกงาน (ยกเลิกให้ใช้สถานะ CANCELLED)
 *
 * ลบ: แถวในชีต Requests, Deliverables, Attachments, Revisions, Timeline
 *     และย้ายโฟลเดอร์งานใน Drive ลงถังขยะ (กู้คืนได้ 30 วัน)
 * ไม่ลบ: เลขที่คำขอในตัวนับ เลขถัดไปจึงไม่ย้อนกลับ
 */
function deleteRequest_(jobId, actor) {
  return withLock_(function () {
    var id = str_(jobId).toUpperCase();
    var req = getRequest_(id);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);

    var summary = {
      jobId: id,
      projectName: str_(req.projectName),
      deliverables: 0,
      attachments: 0,
      revisions: 0,
      timeline: 0,
      folderTrashed: false
    };

    // ย้ายไฟล์แนบทั้งหมดลงถังขยะก่อน แล้วจึงย้ายทั้งโฟลเดอร์
    var files = filterBy_(SHEET.ATTACHMENTS, 'jobId', id);
    for (var i = 0; i < files.length; i++) {
      try {
        DriveApp.getFileById(str_(files[i].fileId)).setTrashed(true);
      } catch (err) {
        // ไฟล์อาจถูกลบไปแล้ว ข้ามได้
      }
    }
    summary.folderTrashed = trashJobFolder_(req.folderId);

    summary.deliverables = removeWhere_(SHEET.DELIVERABLES, 'jobId', id);
    summary.attachments = removeWhere_(SHEET.ATTACHMENTS, 'jobId', id);
    summary.revisions = removeWhere_(SHEET.REVISIONS, 'jobId', id);
    summary.timeline = removeWhere_(SHEET.TIMELINE, 'jobId', id);
    summary.replies = removeWhere_(SHEET.REPLIES, 'jobId', id);
    summary.feedback = removeWhere_(SHEET.FEEDBACK, 'jobId', id);
    remove_(SHEET.REQUESTS, req._row);

    // เก็บร่องรอยไว้ตรวจสอบย้อนหลังว่าใครลบอะไรเมื่อไหร่
    // บันทึกใต้ SYSTEM ไม่ใช่ใต้เลขที่คำขอ เพราะเลขนั้นถูกลบไปแล้ว
    // ถ้าบันทึกใต้เลขเดิมจะกลายเป็นแถวกำพร้าและโผล่กลับมาถ้ามีการออกเลขซ้ำ
    logTimeline_('SYSTEM', actor, 'DELETE_REQUEST', str_(req.status), '',
      'ลบคำขอถาวร ' + id + ': ' + truncate_(req.projectName, 120) +
      ' (ผู้ขอ ' + truncate_(req.requesterName, 80) + ')');

    return summary;
  });
}

/**
 * ล้างคำขอทั้งหมดเพื่อเริ่มใช้งานจริง
 * ใช้ครั้งเดียวหลังทดลองกรอกข้อมูลเสร็จ
 * เก็บบัญชีเจ้าหน้าที่และค่าตั้งค่าไว้ทั้งหมด
 */
function resetAllRequests_(actor) {
  return withLock_(function () {
    var rows = readAll_(SHEET.REQUESTS);
    var trashed = 0;
    for (var i = 0; i < rows.length; i++) {
      if (trashJobFolder_(rows[i].folderId)) trashed++;
    }

    var summary = {
      requests: clearSheetRows_(SHEET.REQUESTS),
      deliverables: clearSheetRows_(SHEET.DELIVERABLES),
      attachments: clearSheetRows_(SHEET.ATTACHMENTS),
      revisions: clearSheetRows_(SHEET.REVISIONS),
      timeline: clearSheetRows_(SHEET.TIMELINE),
      replies: clearSheetRows_(SHEET.REPLIES),
      feedback: clearSheetRows_(SHEET.FEEDBACK),
      counters: clearSheetRows_(SHEET.COUNTERS),
      foldersTrashed: trashed
    };

    logTimeline_('SYSTEM', actor, 'RESET_DATA', '', '',
      'ล้างข้อมูลคำขอทั้งหมด ' + summary.requests + ' รายการ และรีเซ็ตเลขที่คำขอกลับเป็น 0001');

    return summary;
  });
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
    if (priority && livePriority_(r) !== priority) return false;
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
        phoneOut_(r.requesterPhone), r.assignedTo].join(' ').toLowerCase();
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

  var replies = lastReplyMap_();
  return out.map(function (r) { return listRowView_(r, replies[str_(r.jobId)]); });
}

/** ข้อมูลหนึ่งแถวในคิวงานของเจ้าหน้าที่ */
function listRowView_(r, lastReplyAt) {
  var sla = firstDraftSla_(r, lastReplyAt);
  var info = statusInfo_(r.status);
  var pinfo = priorityInfo_(livePriority_(r));
  var due = parseDate_(r.dueDate);
  var daysLeft = due ? daysBetween_(new Date(), due) : null;
  var closed = str_(r.status) === STATUS.DELIVERED.key || str_(r.status) === STATUS.CANCELLED.key;
  return {
    jobId: r.jobId,
    createdAt: str_(r.createdAt),
    submitted: !!str_(r.submittedAt),
    status: info.key,
    statusLabel: info.label,
    statusColor: info.color,
    priority: pinfo.key,
    priorityLabel: pinfo.label,
    priorityColor: pinfo.color,
    requesterName: str_(r.requesterName),
    requesterEmail: str_(r.requesterEmail),
    requesterPhone: phoneOut_(r.requesterPhone),
    department: str_(r.department),
    projectName: str_(r.projectName),
    dueDate: str_(r.dueDate),
    eventDate: str_(r.eventDate),
    daysLeft: daysLeft,
    overdue: daysLeft !== null && daysLeft < 0 && !closed,
    draftDue: sla ? sla.dueDate : '',
    draftDaysLeft: sla ? sla.daysLeft : null,
    draftOverdue: !!(sla && sla.overdue),
    assignedTo: str_(r.assignedTo),
    revisionCount: int_(r.revisionCount),
    revisionLimit: int_(r.revisionLimit),
    attachmentCount: int_(r.attachmentCount),
    briefStatus: str_(r.briefStatus),
    folderUrl: str_(r.folderUrl),
    draftUrl: str_(r.draftUrl),
    deliveredAt: str_(r.deliveredAt),
    leadTimeDays: str_(r.leadTimeDays)
  };
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
function uploadAttachment_(jobId, payload, kind, uploader, options) {
  var skipLimit = !!(options && options.skipLimit); // ใช้กับไฟล์ที่แนบตอนตอบข้อมูลเพิ่มเติม ซึ่งนับแยกต่อรอบ
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
  if (fileKind === 'source' && !skipLimit) {
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

  // โฟลเดอร์อาจถูกลบหรือย้ายไปถังขยะ ให้สร้างใหม่แทนที่จะล้มเหลวทั้งคำขอ
  var folder;
  try {
    folder = DriveApp.getFolderById(req.folderId);
    if (folder.isTrashed()) throw new Error('โฟลเดอร์อยู่ในถังขยะ');
  } catch (err) {
    var rebuilt = createJobFolder_(req.jobId, req.projectName);
    update_(SHEET.REQUESTS, req._row, {
      folderId: rebuilt.id, folderUrl: rebuilt.url, updatedAt: nowIso_()
    });
    req.folderId = rebuilt.id;
    req.folderUrl = rebuilt.url;
    folder = DriveApp.getFolderById(rebuilt.id);
    logTimeline_(req.jobId, 'system', 'NOTE', '', '',
      'ไม่พบโฟลเดอร์เดิมของงาน ระบบจึงสร้างโฟลเดอร์ใหม่ให้อัตโนมัติ');
  }
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
  // บันทึกทะเบียนและนับไฟล์ภายใต้ lock เพราะหน้าเว็บอัปโหลดหลายไฟล์พร้อมกัน
  // ถ้าไม่ล็อก ไฟล์ที่เขียนทีหลังอาจนับได้น้อยกว่าความจริง
  withLock_(function () {
    insert_(SHEET.ATTACHMENTS, record);
    var row = getRequest_(req.jobId);
    if (row) {
      var newCount = filterBy_(SHEET.ATTACHMENTS, 'jobId', req.jobId).length;
      update_(SHEET.REQUESTS, row._row, { attachmentCount: newCount, updatedAt: nowIso_() });
    }
  });

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

/** ข้อมูลไฟล์หนึ่งไฟล์สำหรับหน้าเว็บ */
function attachmentView_(f) {
  return {
    id: str_(f.id),
    kind: str_(f.kind),
    fileName: str_(f.fileName),
    fileUrl: str_(f.fileUrl),
    sizeBytes: int_(f.sizeBytes),
    sizeLabel: formatBytes_(f.sizeBytes),
    uploadedAt: str_(f.uploadedAt),
    uploadedBy: str_(f.uploadedBy)
  };
}

/** รายการไฟล์ของงานหนึ่งใบ */
function listAttachments_(jobId, kind) {
  var all = filterBy_(SHEET.ATTACHMENTS, 'jobId', str_(jobId).toUpperCase());
  var k = str_(kind);
  return all.filter(function (f) { return !k || str_(f.kind) === k; }).map(attachmentView_);
}

/** คลังผลงาน: งานที่ส่งมอบแล้วพร้อมไฟล์ฉบับสมบูรณ์ */
function listAssetLibrary_(filter) {
  var f = filter || {};
  var q = str_(f.q).toLowerCase();
  var year = str_(f.year);
  var media = str_(f.mediaType);

  // รวมงานที่ย้ายไปเก็บถาวรแล้ว คลังผลงานจึงค้นงานเก่าได้ครบทุกปี
  var delivered = readAll_(SHEET.REQUESTS).concat(readArchive_(SHEET.REQUESTS)).filter(function (r) {
    return str_(r.status) === STATUS.DELIVERED.key;
  });

  var allFiles = readAll_(SHEET.ATTACHMENTS).concat(readArchive_(SHEET.ATTACHMENTS))
    .filter(function (a) { return str_(a.kind) === 'final'; });
  var filesByJob = {};
  for (var i = 0; i < allFiles.length; i++) {
    var jid = str_(allFiles[i].jobId);
    if (!filesByJob[jid]) filesByJob[jid] = [];
    filesByJob[jid].push({ fileName: allFiles[i].fileName, fileUrl: allFiles[i].fileUrl });
  }

  var allItems = readAll_(SHEET.DELIVERABLES).concat(readArchive_(SHEET.DELIVERABLES));
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

/**
 * ทำความสะอาดหัวข้ออีเมล
 * ตัดอักขระขึ้นบรรทัดใหม่ออก เพราะข้อมูลจากผู้ใช้ (เช่น ชื่อโครงการ) ถูกนำมาต่อในหัวข้อ
 * หากมีการขึ้นบรรทัดใหม่ปนมา อาจถูกใช้แทรก header ของอีเมลได้
 */
function mailSubject_(subject) {
  return truncate_(str_(subject).replace(/[\r\n\t]+/g, ' '), 200);
}

/** ส่งอีเมล (คืน true/false ไม่โยน error ออกไปนอกจากผู้เรียกต้องการ) */
function sendMail_(to, subject, htmlBody) {
  var recipients = Array.isArray(to) ? to.join(',') : str_(to);
  if (!recipients) return false;
  MailApp.sendEmail({
    to: recipients,
    subject: mailSubject_(subject),
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

/** ลิงก์เปิดงานใบนั้นในหน้าเจ้าหน้าที่โดยตรง (เข้าสู่ระบบแล้วเปิดรายละเอียดงานให้ทันที) */
function adminJobUrl_(jobId) {
  var base = safeWebAppUrl_();
  if (!base) return '';
  return base + '?page=admin' + (jobId ? '&job=' + encodeURIComponent(str_(jobId)) : '');
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
      ['ผู้ออกแบบที่เลือก', str_(req.assignedTo) ? escapeHtml_(req.assignedTo) : 'ให้ฝ่ายสื่อสารองค์กรจัดสรรให้'],
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
    extra += emailNotice_('<strong>ช่วยประเมินความพึงพอใจ (ใช้เวลาไม่ถึง 1 นาที)</strong><br>' +
      'ความเห็นของท่านช่วยให้ฝ่ายสื่อสารองค์กรพัฒนางานบริการได้ตรงความต้องการมากขึ้น');
    ctaLabel = 'ดาวน์โหลดไฟล์และประเมินความพึงพอใจ';
  } else if (toStatus === STATUS.INFO_NEEDED.key) {
    intro = 'เจ้าหน้าที่ขอข้อมูลเพิ่มเติมเพื่อให้ดำเนินงานต่อได้ กรุณากดปุ่มด้านล่างเพื่อตอบและแนบไฟล์ผ่านระบบ ' +
      'เมื่อส่งแล้วงานของท่านจะกลับเข้าคิวทันที';
    extra = emailNotice_('<strong>ข้อมูลที่ต้องการเพิ่มเติม</strong><br>' + nl2br_(detail), '#dc2626');
    ctaLabel = 'ตอบและแนบไฟล์';
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

/** แจ้งผู้ขอเมื่อเจ้าหน้าที่ปรับข้อมูลคำขอ (เมื่อเจ้าหน้าที่เลือกให้แจ้ง) */
function sendRequestEditedEmail_(req, changes) {
  var trackUrl = buildTrackUrl_(req);
  var items = changes.map(function (c) {
    return '<li style="margin-bottom:4px;">' + escapeHtml_(c.text) + '</li>';
  }).join('');
  var body =
    '<p>เรียน คุณ' + escapeHtml_(req.requesterName) + '</p>' +
    '<p>ฝ่ายสื่อสารองค์กรได้ปรับปรุงข้อมูลคำขอของท่านตามที่ได้ประสานงานกันไว้ ดังนี้</p>' +
    '<ul style="padding-left:20px;margin:4px 0 14px 0;font-size:13px;line-height:1.7;">' + items + '</ul>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))]
    ]) +
    '<p style="font-size:13px;color:' + BRAND.textLight + ';">หากข้อมูลไม่ถูกต้อง กรุณาตอบกลับอีเมลฉบับนี้</p>';
  return sendMail_(req.requesterEmail, '[' + req.jobId + '] ปรับปรุงข้อมูลคำขอ',
    emailShell_('ปรับปรุงข้อมูลคำขอ', req.projectName, body, trackUrl ? 'ดูรายละเอียดงาน' : '', trackUrl));
}

/* --------------------------------------------------- อีเมลถึงเจ้าหน้าที่ */

/** แจ้งผู้ออกแบบเมื่อมีงานมอบหมายให้ (เฉพาะผู้ออกแบบที่ใส่อีเมลไว้) */
function sendAssignedEmail_(req, designer, actor) {
  var adminUrl = adminJobUrl_(req.jobId);
  var body =
    '<p>เรียน คุณ' + escapeHtml_(designer.name) + '</p>' +
    '<p>มีงานออกแบบมอบหมายให้ท่าน' + (actor ? ' โดย ' + escapeHtml_(actor) : '') + '</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['สถานะ', escapeHtml_(statusInfo_(req.status).label)],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))]
    ]) +
    '<div style="font-weight:600;margin-bottom:4px;">รายการชิ้นงาน</div>' + deliverablesHtml_(req.jobId);
  return sendMail_(designer.email, '[' + req.jobId + '] มอบหมายงานให้คุณ — ' + str_(req.projectName),
    emailShell_('มีงานมอบหมายให้คุณ', req.projectName, body, adminUrl ? 'เปิดคำขอนี้' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อผู้ขอส่งข้อมูลเพิ่มเติมผ่านระบบ */
function sendInfoReplyToStaffEmail_(req, reply) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = adminJobUrl_(req.jobId);
  var body =
    '<p>ผู้ขอรับบริการส่งข้อมูลเพิ่มเติมแล้ว งานกลับเข้าคิวในสถานะ "' + escapeHtml_(reply.statusLabel) + '"</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้ส่ง', escapeHtml_(req.requesterName)],
      ['ไฟล์แนบเพิ่ม', int_(reply.fileCount) + ' ไฟล์' +
        (reply.fileNames && reply.fileNames.length ? ' (' + escapeHtml_(reply.fileNames.join(', ')) + ')' : '')]
    ]) +
    (reply.question ? emailNotice_('<strong>สิ่งที่ขอไป</strong><br>' + nl2br_(reply.question), '#64748b') : '') +
    (reply.answer ? emailNotice_('<strong>คำตอบจากผู้ขอ</strong><br>' + nl2br_(reply.answer)) : '');
  return sendMail_(to, '[' + req.jobId + '] ผู้ขอส่งข้อมูลเพิ่มเติมแล้ว',
    emailShell_('ได้รับข้อมูลเพิ่มเติม', req.projectName, body, adminUrl ? 'เปิดคำขอนี้' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่ทันทีเมื่อได้คะแนนความพึงพอใจต่ำ เพื่อให้ติดต่อกลับ */
function sendLowRatingEmail_(req, rating, comment) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = adminJobUrl_(req.jobId);
  var body =
    '<p>ผู้ขอรับบริการให้คะแนนความพึงพอใจต่ำ ควรติดต่อกลับเพื่อสอบถามและแก้ไข</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้ประเมิน', escapeHtml_(req.requesterName) + ' (' + escapeHtml_(req.requesterEmail) + ')'],
      ['คะแนน', '<strong style="color:#dc2626;">' + int_(rating) + ' / 5</strong>']
    ]) +
    (comment ? emailNotice_('<strong>ความเห็น</strong><br>' + nl2br_(comment), '#dc2626') : '');
  return sendMail_(to, '[' + req.jobId + '] คะแนนความพึงพอใจ ' + int_(rating) + '/5',
    emailShell_('ผลประเมินที่ควรติดตาม', req.projectName, body, adminUrl ? 'เปิดคำขอนี้' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อมีคำขอใหม่ */
function sendStaffNewRequestEmail_(req) {
  var to = staffRecipients_();
  // ผู้ขอเลือกผู้ออกแบบไว้ และผู้ออกแบบมีอีเมล ให้ได้รับแจ้งด้วย
  var designer = str_(req.assignedTo) ? findDesigner_(req.assignedTo) : null;
  if (designer && designer.email && to.indexOf(designer.email) < 0) to.push(designer.email);
  if (to.length === 0) return false;
  var p = priorityInfo_(req.priority);
  var adminUrl = adminJobUrl_(req.jobId);
  var body =
    '<p>มีคำขอรับบริการออกแบบเข้ามาใหม่ในระบบ</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ความเร่งด่วน', '<span style="display:inline-block;background:' + p.color +
        ';color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;">' + escapeHtml_(p.label) + '</span>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้ขอรับบริการ', escapeHtml_(req.requesterName) + ' (' + escapeHtml_(req.department) + ')'],
      ['ผู้ออกแบบที่ผู้ขอเลือก', str_(req.assignedTo) ? '<strong>' + escapeHtml_(req.assignedTo) + '</strong>'
        : 'ให้ฝ่ายฯ จัดสรรให้ <span style="color:#b45309">(กรุณามอบหมายผู้รับผิดชอบ)</span>'],
      ['ติดต่อ', escapeHtml_(req.requesterEmail) +
        (str_(req.requesterPhone) ? ' / ' + escapeHtml_(phoneOut_(req.requesterPhone)) : '')],
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
      body, adminUrl ? 'เปิดคำขอนี้' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อผู้ขอส่งคำขอแก้ไข */
function sendRevisionToStaffEmail_(req, round, comment) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = adminJobUrl_(req.jobId);
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
  var adminUrl = adminJobUrl_(req.jobId);
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
  var draftLate = [];
  var draftSoon = [];
  var replies = lastReplyMap_();
  for (var i = 0; i < rows.length; i++) {
    var left = daysBetween_(today, rows[i].dueDate);
    if (left !== null && left < 0) overdue.push(rows[i]);
    else if (left !== null && left <= 3) dueSoon.push(rows[i]);
    if (str_(rows[i].status) === STATUS.NEW.key && str_(rows[i].submittedAt)) waiting.push(rows[i]);
    var sla = firstDraftSla_(rows[i], replies[str_(rows[i].jobId)]);
    if (sla && sla.overdue) draftLate.push(rows[i]);
    else if (sla && sla.daysLeft <= 1) draftSoon.push(rows[i]);
  }
  if (overdue.length === 0 && dueSoon.length === 0 && waiting.length === 0 &&
    draftLate.length === 0 && draftSoon.length === 0) return;

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

  var adminUrl = adminJobUrl_('');
  var body =
    '<p>สรุปคิวงานออกแบบประจำวันที่ ' + escapeHtml_(formatThaiDate_(today)) + '</p>' +
    listHtml(overdue, 'เกินกำหนดส่ง (' + overdue.length + ' งาน)') +
    listHtml(dueSoon, 'ครบกำหนดภายใน 3 วัน (' + dueSoon.length + ' งาน)') +
    listHtml(draftLate, 'เกินกำหนดส่งร่างแรกตามเงื่อนไขบริการ (' + draftLate.length + ' งาน)') +
    listHtml(draftSoon, 'ต้องส่งร่างแรกภายในวันนี้หรือพรุ่งนี้ (' + draftSoon.length + ' งาน)') +
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
  // การเรียก AI ใช้เวลาหลายวินาที ระหว่างนั้นอาจมีการลบคำขออื่นจนเลขแถวเลื่อน
  // จึงต้องหาแถวใหม่ก่อนเขียน ไม่เช่นนั้นผลสรุปอาจไปทับคำขอใบอื่น
  var latest = getRequest_(req.jobId);
  if (!latest) return { jobId: req.jobId, skipped: true, deleted: true };
  update_(SHEET.REQUESTS, latest._row, {
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
  // ทริกเกอร์ทุก 5 นาทีกับทริกเกอร์ครั้งเดียวหลังมีคำขอใหม่อาจทำงานชนกัน
  // ถ้ารอบก่อนยังไม่เสร็จให้ข้ามไป ไม่เช่นนั้นจะเรียก AI สรุปงานใบเดียวกันซ้ำ
  var cache = CacheService.getScriptCache();
  if (cache.get('worker:running')) return;
  cache.put('worker:running', '1', 300);
  try {
    workerTickBody_();
  } finally {
    cache.remove('worker:running');
  }
}

function workerTickBody_() {
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

  // 2) สรุป Design Brief
  //    จำกัดจำนวนต่อรอบและคุมเวลารวม เพราะการเรียก AI หนึ่งครั้งใช้เวลาไม่แน่นอน
  //    และ Apps Script ตัดการทำงานที่เกิน 6 นาที ใบที่เหลือจะถูกทำในรอบถัดไป
  var deadline = now.getTime() + 3.5 * 60 * 1000;
  var pending = readAll_(SHEET.REQUESTS).filter(function (r) {
    return str_(r.briefStatus) === 'PENDING' && str_(r.submittedAt);
  }).slice(0, 3);

  for (var j = 0; j < pending.length; j++) {
    if (new Date().getTime() > deadline) break;
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

/**
 * ลายนิ้วมือของรหัสผ่านปัจจุบัน ฝังไว้ใน token
 * เปลี่ยนรหัสผ่านแล้ว salt เปลี่ยน token เก่าบนเครื่องอื่นจึงใช้ไม่ได้ทันที
 */
function passwordStamp_(salt) {
  return hmac_('stamp:' + str_(salt), getProp_(PROP.SECRET)).substring(0, 12);
}

/** สร้าง token ของ session */
function makeToken_(user) {
  var payload = {
    e: str_(user.email),
    n: str_(user.name),
    r: str_(user.role) || 'staff',
    k: passwordStamp_(user.salt),
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
  // token ที่ออกก่อนเปลี่ยนรหัสผ่านใช้ไม่ได้อีก (token รุ่นเก่าที่ไม่มีค่านี้ยังใช้ได้จนหมดอายุ)
  if (payload.k && payload.k !== passwordStamp_(user.salt)) return null;

  return { email: str_(user.email), name: str_(user.name), role: str_(user.role) || 'staff' };
}

/** ตรวจสิทธิ์ ถ้าไม่ผ่านจะโยน error */
function requireAuth_(token) {
  var user = verifyToken_(token);
  if (!user) {
    var e = appError_('เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
    e.code = 'AUTH'; // หน้าเว็บใช้รหัสนี้พาไปหน้าเข้าสู่ระบบ
    throw e;
  }
  return user;
}

/** ตรวจสิทธิ์ระดับผู้ดูแลระบบ */
function requireAdmin_(token) {
  var user = requireAuth_(token);
  if (str_(user.role) !== 'admin') {
    var e = appError_('เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้คำสั่งนี้ได้');
    e.code = 'FORBIDDEN';
    throw e;
  }
  return user;
}

/** จำนวนผู้ดูแลระบบที่ยังเปิดใช้งาน ไม่นับบัญชีที่ระบุ */
function otherActiveAdmins_(exceptEmail) {
  var except = str_(exceptEmail).toLowerCase();
  return readAll_(SHEET.USERS).filter(function (u) {
    return str_(u.role) === 'admin' && str_(u.active).toUpperCase() === 'TRUE' &&
      str_(u.email).toLowerCase() !== except;
  }).length;
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
    if (mail === me.email && p.active !== undefined && p.active !== true) {
      throw appError_('ไม่สามารถปิดใช้งานบัญชีของตนเองได้');
    }
    if (mail === me.email && role !== 'admin') {
      throw appError_('ไม่สามารถลดสิทธิ์ผู้ดูแลระบบของบัญชีตนเองได้ ' +
        'กรุณาให้ผู้ดูแลระบบคนอื่นเป็นผู้เปลี่ยนให้');
    }
    // กันไม่ให้ระบบเหลือผู้ดูแลระบบเป็นศูนย์ ซึ่งจะไม่มีใครเข้าหน้าตั้งค่าได้อีก
    var wasActiveAdmin = str_(existing.role) === 'admin' &&
      str_(existing.active).toUpperCase() === 'TRUE';
    var staysActiveAdmin = role === 'admin' && (p.active === undefined || p.active === true);
    if (wasActiveAdmin && !staysActiveAdmin && otherActiveAdmins_(mail) === 0) {
      throw appError_('บัญชีนี้เป็นผู้ดูแลระบบคนสุดท้าย จึงลดสิทธิ์หรือปิดใช้งานไม่ได้ ' +
        'กรุณาเพิ่มผู้ดูแลระบบคนอื่นก่อน');
    }
    var patch = { name: name, role: role };
    if (password) {
      if (password.length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      patch.salt = Utilities.getUuid();
      patch.passwordHash = hashPassword_(password, patch.salt);
    }
    if (p.active !== undefined) {
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

  // รวมงานที่ย้ายไปเก็บถาวรแล้ว ตัวเลขย้อนหลังรายปีจึงไม่หายไปหลังย้ายข้อมูล
  var all = readAll_(SHEET.REQUESTS).concat(readArchive_(SHEET.REQUESTS));
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
  var deliverables = readAll_(SHEET.DELIVERABLES).concat(readArchive_(SHEET.DELIVERABLES));
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
    satisfaction: satisfactionStats_(rows, totals.delivered),
    briefCoverage: (function () {
      var withBrief = rows.filter(function (r) { return str_(r.briefStatus) === 'DONE'; }).length;
      return rows.length > 0 ? Math.round((withBrief / rows.length) * 100) : null;
    })(),
    completeOnFirstSubmit: (function () {
      // ร้อยละของคำขอที่ข้อมูลครบตั้งแต่ครั้งแรก (ไม่ถูกตีกลับขอข้อมูลเพิ่ม)
      if (rows.length === 0) return null;
      var timeline = readAll_(SHEET.TIMELINE).concat(readArchive_(SHEET.TIMELINE));
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

/**
 * สรุปผลประเมินความพึงพอใจของงานในช่วงเวลาที่เลือก
 * responseRate = ร้อยละของงานที่ส่งมอบแล้วที่ผู้ขอตอบแบบประเมิน
 */
function satisfactionStats_(rows, deliveredCount) {
  var byJob = {};
  for (var i = 0; i < rows.length; i++) byJob[str_(rows[i].jobId)] = rows[i];
  var all = readAll_(SHEET.FEEDBACK).concat(readArchive_(SHEET.FEEDBACK)).filter(function (f) {
    return !!byJob[str_(f.jobId)];
  });
  var dist = [0, 0, 0, 0, 0];
  var sum = 0;
  for (var j = 0; j < all.length; j++) {
    var score = int_(all[j].rating);
    if (score < 1 || score > 5) continue;
    dist[score - 1]++;
    sum += score;
  }
  var count = dist[0] + dist[1] + dist[2] + dist[3] + dist[4];
  var recent = sortByTime_(all.filter(function (f) { return !!str_(f.comment); }), 'updatedAt')
    .reverse().slice(0, 6).map(function (f) {
      var r = byJob[str_(f.jobId)];
      return {
        jobId: str_(f.jobId), projectName: str_(r.projectName), rating: int_(f.rating),
        comment: str_(f.comment), at: str_(f.updatedAt) || str_(f.createdAt)
      };
    });
  return {
    count: count,
    avg: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    responseRate: deliveredCount > 0 ? Math.round((count / deliveredCount) * 100) : null,
    dist: dist,
    recent: recent
  };
}

/** ข้อมูลสำหรับส่งออกเป็น CSV (รายงานประจำปี) */
function exportRows_(filter) {
  var rows = listRequests_(filter || {});
  var media = {};
  var items = readAll_(SHEET.DELIVERABLES);
  for (var i = 0; i < items.length; i++) {
    var id = str_(items[i].jobId);
    var label = str_(items[i].mediaLabel) + (int_(items[i].quantity) > 1 ? ' x' + int_(items[i].quantity) : '');
    media[id] = media[id] ? media[id] + ', ' + label : label;
  }
  var header = ['เลขที่คำขอ', 'วันที่ยื่น', 'สถานะ', 'ความเร่งด่วน', 'ผู้ขอรับบริการ', 'อีเมล',
    'โทรศัพท์', 'หน่วยงาน', 'ชื่อโครงการ', 'ชิ้นงาน', 'กำหนดใช้งาน', 'วันที่ส่งมอบ',
    'ระยะเวลาดำเนินการ (วัน)', 'ผู้รับผิดชอบ', 'รอบแก้ไข', 'คะแนนความพึงพอใจ', 'ความเห็นผู้ขอ'];
  var feedback = {};
  var fb = readAll_(SHEET.FEEDBACK);
  for (var f = 0; f < fb.length; f++) feedback[str_(fb[f].jobId)] = fb[f];
  var body = rows.map(function (r) {
    var rating = feedback[str_(r.jobId)];
    return [r.jobId, r.createdAt, r.statusLabel, r.priorityLabel, r.requesterName, r.requesterEmail,
      r.requesterPhone, r.department, r.projectName, media[str_(r.jobId)] || '', r.dueDate,
      r.deliveredAt, r.leadTimeDays, r.assignedTo, r.revisionCount + '/' + r.revisionLimit,
      rating ? int_(rating.rating) : '', rating ? str_(rating.comment) : ''];
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
  var allowedPages = ['home', 'form', 'track', 'login', 'admin', 'setup', 'resources'];
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

  // ฝังข้อมูลตั้งต้นมากับหน้าเว็บเลย หน้าแรกจึงแสดงได้ทันทีโดยไม่ต้องเรียกเซิร์ฟเวอร์ซ้ำอีกรอบ
  var cfg = null;
  if (!installError) {
    try {
      cfg = bootstrapData_();
    } catch (err) {
      cfg = null; // หน้าเว็บจะเรียก apiBootstrap เองและแสดงข้อความผิดพลาดให้
    }
  }

  var boot = {
    cfg: cfg,
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
    return { ok: false, error: message, code: (err && err.code) ? String(err.code) : '' };
  }
}

/* ------------------------------------------------------------- สาธารณะ */

/** ข้อมูลตั้งต้นสำหรับหน้าเว็บ */
function apiBootstrap() {
  return respond_(bootstrapData_);
}

/** ข้อมูลตั้งต้นที่ทุกหน้าใช้ (ไม่มีข้อมูลลับ) */
function bootstrapData_() {
  return {
    app: { name: APP.NAME, org: APP.ORG, orgShort: APP.ORG_SHORT, version: APP.VERSION },
    needsFirstAdmin: readAll_(SHEET.USERS).length === 0,
    mediaTypes: MEDIA_TYPES,
    departments: DEPARTMENTS,
    departmentGroups: DEPARTMENT_GROUPS,
    channels: CHANNELS,
    statusFlow: STATUS_FLOW.map(function (k) {
      return { key: k, label: STATUS[k].label, en: STATUS[k].en, step: STATUS[k].step };
    }),
    statusLabels: Object.keys(STATUS).map(function (k) {
      return { key: k, label: STATUS[k].label, color: STATUS[k].color, icon: STATUS[k].icon };
    }),
    resourceCategories: RESOURCE_CATEGORIES,
    designers: listDesigners_(false).map(designerPublic_),
    designerPalette: DESIGNER_COLORS,
    settings: {
      revisionLimit: getSettingInt_('revisionLimit', 3),
      minLeadDays: getSettingInt_('minLeadDays', 7),
      slaFirstDraftDays: getSettingInt_('slaFirstDraftDays', 5),
      maxFileMB: getSettingInt_('maxFileMB', 10),
      maxFiles: getSettingInt_('maxFiles', 8),
      allowedFileTypes: getSetting_('allowedFileTypes', DEFAULT_SETTINGS.allowedFileTypes),
      formOpen: getSettingBool_('publicFormOpen', true),
      publicWorkload: getSettingBool_('publicWorkload', true),
      closedMessage: getSetting_('closedMessage', DEFAULT_SETTINGS.closedMessage),
      contactEmail: getSetting_('replyTo', DEFAULT_SETTINGS.replyTo)
    }
  };
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

/**
 * ตัวเลือกสถานะทั้งหมดสำหรับหน้าจัดการงาน เรียงตามขั้นตอน
 * kind: current = สถานะปัจจุบัน, next = ขั้นถัดไปตามปกติ, skip = ข้ามขั้นหรือย้อนขั้น
 */
function statusOptions_(current) {
  var cur = str_(current).toUpperCase();
  var order = STATUS_FLOW.concat(['INFO_NEEDED', 'CANCELLED']);
  return order.map(function (k) {
    var s = STATUS[k];
    var kind = k === cur ? 'current' : (isNormalTransition_(cur, k) ? 'next' : 'skip');
    return { key: s.key, label: s.label, color: s.color, icon: s.icon, kind: kind };
  });
}

function apiAdminGet(token, jobId) {
  return respond_(function () {
    requireAuth_(token);
    var view = adminJobView_(jobId);
    if (!view) throw appError_('ไม่พบเลขที่คำขอ ' + str_(jobId).toUpperCase());
    return view;
  });
}

/**
 * ข้อมูลงานหนึ่งใบสำหรับหน้าต่างรายละเอียดของเจ้าหน้าที่
 * ทุกคำสั่งที่แก้ไขงานจะส่งข้อมูลนี้กลับมาด้วย หน้าเว็บจึงไม่ต้องโหลดซ้ำอีกรอบ
 * row คือข้อมูลแถวเดียวกันในคิวงาน ใช้อัปเดตตารางโดยไม่ต้องโหลดรายการใหม่ทั้งหมด
 */
function adminJobView_(jobId) {
  var full = getRequestFull_(jobId);
  var archived = false;
  if (!full) {
    // งานที่ย้ายไปเก็บถาวรแล้ว เปิดดูได้แบบอ่านอย่างเดียว
    full = archivedRequestFull_(jobId);
    archived = !!full;
  }
  if (!full) return null;
  var r = full.request;
  var info = statusInfo_(r.status);
  var p = priorityInfo_(livePriority_(r));
  var approval = draftApproval_(full.timeline);
  var inReview = info.key === STATUS.REVIEW.key;
  var lastReply = full.replies.length ? str_(full.replies[full.replies.length - 1].createdAt) : '';
  var sla = archived ? null : firstDraftSla_(r, lastReply);
  return {
    archived: archived,
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
      statusOptions: statusOptions_(info.key),
      priority: p.key,
      priorityLabel: p.label,
      priorityColor: p.color,
      requesterName: str_(r.requesterName),
      requesterEmail: str_(r.requesterEmail),
      requesterPhone: phoneOut_(r.requesterPhone),
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
      approved: inReview && approval.approved,
      approvedAt: inReview ? approval.approvedAt : '',
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
      firstDraftAt: str_(r.firstDraftAt),
      draftDue: sla ? sla.dueDate : '',
      draftDaysLeft: sla ? sla.daysLeft : null,
      draftOverdue: !!(sla && sla.overdue),
      infoRequest: info.key === STATUS.INFO_NEEDED.key ? infoQuestion_(full.timeline) : null,
      trackUrl: buildTrackUrl_(r)
    },
    row: archived ? null : listRowView_(r, lastReply),
    edit: archived ? null : requestToPayload_(r, full.deliverables),
    replies: full.replies.map(replyView_),
    feedback: feedbackView_(full.feedback),
    deliverables: full.deliverables.map(function (d) {
      return {
        seq: int_(d.seq), mediaLabel: str_(d.mediaLabel), size: str_(d.size),
        quantity: int_(d.quantity), note: str_(d.note)
      };
    }),
    attachments: full.attachments.map(attachmentView_),
    revisions: full.revisions.map(function (v) {
      return {
        round: int_(v.round), createdAt: str_(v.createdAt), byName: str_(v.byName),
        comment: str_(v.comment), draftUrl: str_(v.draftUrl)
      };
    }),
    timeline: full.timeline.map(function (t) {
      return {
        at: str_(t.at), actor: str_(t.actor), action: str_(t.action),
        fromStatus: str_(t.fromStatus), toStatus: str_(t.toStatus), detail: str_(t.detail),
        fromLabel: str_(t.fromStatus) ? statusInfo_(t.fromStatus).label : '',
        toLabel: str_(t.toStatus) ? statusInfo_(t.toStatus).label : ''
      };
    })
  };
}

function apiAdminChangeStatus(token, jobId, toStatus, options) {
  return respond_(function () {
    var me = requireAuth_(token);
    changeStatus_(jobId, toStatus, me.name || me.email, options);
    return {
      jobId: str_(jobId).toUpperCase(), status: str_(toStatus).toUpperCase(),
      job: adminJobView_(jobId)
    };
  });
}

function apiAdminSetDraftUrl(token, jobId, url) {
  return respond_(function () {
    var me = requireAuth_(token);
    setDraftUrl_(jobId, url, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminAssign(token, jobId, assignee) {
  return respond_(function () {
    var me = requireAuth_(token);
    assignRequest_(jobId, assignee, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminNote(token, jobId, note) {
  return respond_(function () {
    var me = requireAuth_(token);
    addInternalNote_(jobId, note, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminSetRevisionLimit(token, jobId, limit) {
  return respond_(function () {
    var me = requireAuth_(token);
    setRevisionLimit_(jobId, limit, me.name || me.email);
    return { job: adminJobView_(jobId) };
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
    var rec = findBy_(SHEET.ATTACHMENTS, 'id', attachmentId);
    deleteAttachment_(attachmentId, me.name || me.email);
    return { job: rec ? adminJobView_(rec.jobId) : null };
  });
}

function apiAdminRegenerateBrief(token, jobId) {
  return respond_(function () {
    requireAuth_(token);
    var result = generateBrief_(jobId, true);
    result.job = adminJobView_(jobId);
    return result;
  });
}

/** เจ้าหน้าที่แก้ไขข้อมูลคำขอ */
function apiAdminEditRequest(token, jobId, payload, options) {
  return respond_(function () {
    var me = requireAuth_(token);
    var result = editRequest_(jobId, payload, me.name || me.email, options);
    result.job = adminJobView_(jobId);
    return result;
  });
}

/* ------------------------------------------ ผู้ขอตอบข้อมูลเพิ่มเติม / ประเมิน */

function apiInfoUpload(jobId, email, token, filePayload) {
  return respond_(function () {
    return uploadInfoFile_(jobId, email, token, filePayload);
  });
}

function apiInfoReply(jobId, email, token, answer) {
  return respond_(function () {
    return submitInfoReply_(jobId, email, token, answer);
  });
}

function apiSubmitFeedback(jobId, email, token, rating, comment) {
  return respond_(function () {
    return submitFeedback_(jobId, email, token, rating, comment);
  });
}

/* ------------------------------------------------------- คลังไฟล์ CI */

/** รายการไฟล์ CI สำหรับทุกคน (ไม่ต้องเข้าสู่ระบบ) */
function apiResources() {
  return respond_(function () {
    return { categories: RESOURCE_CATEGORIES, items: listResources_(false) };
  });
}

function apiAdminResources(token) {
  return respond_(function () {
    requireAuth_(token);
    var base = safeWebAppUrl_();
    return {
      categories: RESOURCE_CATEGORIES,
      items: listResources_(true),
      pageUrl: base ? base + '?page=resources' : ''
    };
  });
}

function apiAdminSaveResource(token, payload) {
  return respond_(function () {
    var me = requireAuth_(token);
    // ไม่ล็อกทั้งระบบระหว่างอัปโหลดไฟล์ใหญ่ เพราะจะทำให้ผู้ใช้อื่นรอนาน (คลังไฟล์ไม่มีการออกเลข)
    var item = saveResource_(payload, me.name || me.email);
    return { item: item, items: listResources_(true) };
  });
}

function apiAdminDeleteResource(token, id) {
  return respond_(function () {
    requireAuth_(token);
    deleteResource_(id);
    return { items: listResources_(true) };
  });
}

/* ---------------------------------------------- ผู้ออกแบบและคิวงานสาธารณะ */

/** ภาระงาน ปฏิทิน และตารางงานที่กำลังทำ สำหรับหน้ายื่นคำขอ (ไม่ต้องเข้าสู่ระบบ ไม่มีข้อมูลผู้ขอ) */
function apiPublicWorkload() {
  return respond_(publicWorkload_);
}

/** รายชื่อผู้ออกแบบพร้อมภาระงาน (เจ้าหน้าที่ทุกคนดูได้ ใช้ในปุ่มมอบหมาย) */
function apiAdminDesigners(token) {
  return respond_(function () {
    requireAuth_(token);
    return adminDesigners_();
  });
}

function apiAdminSaveDesigner(token, payload) {
  return respond_(function () {
    requireAdmin_(token);
    var result = saveDesigner_(payload);
    result.list = adminDesigners_();
    result.designers = listDesigners_(false).map(designerPublic_);
    return result;
  });
}

function apiAdminDeleteDesigner(token, id) {
  return respond_(function () {
    requireAdmin_(token);
    deleteDesigner_(id);
    return { list: adminDesigners_(), designers: listDesigners_(false).map(designerPublic_) };
  });
}

/* ------------------------------------------------- ย้ายข้อมูลเก่าไปเก็บถาวร */

var ARCHIVE_CONFIRM_TEXT = 'ย้ายข้อมูล';

function apiAdminArchivePreview(token, cutoff) {
  return respond_(function () {
    requireAdmin_(token);
    return previewArchive_(cutoff);
  });
}

function apiAdminArchiveRun(token, cutoff, confirmText) {
  return respond_(function () {
    var me = requireAdmin_(token);
    if (str_(confirmText) !== ARCHIVE_CONFIRM_TEXT) {
      throw appError_('กรุณาพิมพ์คำว่า "' + ARCHIVE_CONFIRM_TEXT + '" ให้ตรงเพื่อยืนยัน');
    }
    return runArchive_(cutoff, me.name || me.email);
  });
}

/**
 * ลบคำขอถาวร (เฉพาะผู้ดูแลระบบ)
 * ต้องพิมพ์เลขที่คำขอยืนยันให้ตรง เพื่อกันการกดพลาด
 */
function apiAdminDeleteRequest(token, jobId, confirmText) {
  return respond_(function () {
    var me = requireAdmin_(token);
    var id = str_(jobId).toUpperCase();
    if (str_(confirmText).toUpperCase().replace(/\s/g, '') !== id.replace(/\s/g, '')) {
      throw appError_('กรุณาพิมพ์เลขที่คำขอ ' + id + ' ให้ตรงเพื่อยืนยันการลบ');
    }
    return deleteRequest_(id, me.name || me.email);
  });
}

/**
 * ล้างคำขอทั้งหมดเพื่อเริ่มใช้งานจริง (เฉพาะผู้ดูแลระบบ)
 * เก็บบัญชีเจ้าหน้าที่และค่าตั้งค่าไว้
 */
var RESET_CONFIRM_TEXT = 'ล้างข้อมูลทั้งหมด';

function apiAdminResetData(token, confirmText) {
  return respond_(function () {
    var me = requireAdmin_(token);
    if (str_(confirmText) !== RESET_CONFIRM_TEXT) {
      throw appError_('กรุณาพิมพ์ข้อความ "' + RESET_CONFIRM_TEXT + '" ให้ตรงเพื่อยืนยัน');
    }
    return resetAllRequests_(me.name || me.email);
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
      archive: archiveInfo_(),
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
    // ตรวจทุกช่องก่อน ถ้ามีช่องใดผิดจะไม่บันทึกอะไรเลย
    // (เดิมบันทึกทีละช่อง ช่องก่อนหน้าช่องที่ผิดจึงถูกบันทึกไปครึ่งเดียว)
    var clean = {};
    var errors = [];
    for (var key in p) {
      if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
      try {
        clean[key] = sanitizeSetting_(key, p[key]);
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (errors.length > 0) throw appError_(errors.join('\n'));

    var current = getSettings_();
    var saved = 0;
    withLock_(function () {
      for (var k in clean) {
        if (str_(current[k]) === clean[k]) continue;
        setSetting_(k, clean[k]);
        saved++;
      }
    });
    // ส่งค่าที่หน้าเว็บใช้กลับไป แบบฟอร์มจะเปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช
    return { saved: saved, settings: bootstrapData_().settings };
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


/* ==========================================================================
   11_Requester.gs
   ========================================================================== */

/**
 * 11_Requester.gs — สิ่งที่ผู้ขอรับบริการทำเองได้ผ่านหน้าติดตาม
 *  - ตอบ "รอข้อมูลเพิ่มเติม" พร้อมแนบไฟล์ แล้วงานกลับเข้าคิวอัตโนมัติ
 *  - ประเมินความพึงพอใจหลังส่งมอบ
 * ยืนยันตัวตนด้วย token จากลิงก์ในอีเมล หรืออีเมลที่ใช้ยื่นคำขอ เหมือนหน้าติดตาม
 */

/** ตรวจสิทธิ์ผู้ขอ คืนแถวคำขอ */
function requireRequester_(jobId, email, token) {
  var id = str_(jobId).toUpperCase();
  var req = getRequest_(id);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);
  var ok = (token && verifyTrackToken_(id, token)) ||
    (email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase());
  if (!ok) throw appError_('ไม่มีสิทธิ์ดำเนินการกับคำขอนี้ กรุณาเปิดจากลิงก์ในอีเมล หรือกรอกอีเมลที่ใช้ยื่นคำขอ');
  return req;
}

/* ------------------------------------------- ตอบ "รอข้อมูลเพิ่มเติม" */

/**
 * คำถามล่าสุดที่เจ้าหน้าที่ขอข้อมูลเพิ่ม (จากประวัติ เรียงเก่าไปใหม่)
 * fromStatus คือสถานะก่อนขอข้อมูล ใช้คืนงานกลับไปที่เดิมเมื่อผู้ขอตอบแล้ว
 */
function infoQuestion_(timeline) {
  var found = null;
  for (var i = 0; i < timeline.length; i++) {
    var t = timeline[i];
    if (str_(t.action) === 'STATUS' && str_(t.toStatus) === STATUS.INFO_NEEDED.key) {
      found = { question: str_(t.detail), at: str_(t.at), fromStatus: str_(t.fromStatus), index: i };
    }
  }
  return found;
}

/**
 * ชื่อไฟล์ที่ผู้ขอแนบหลังเจ้าหน้าที่ขอข้อมูลครั้งล่าสุด
 * นับจากลำดับในประวัติ (ทุกครั้งที่แนบจะบันทึก INFO_FILE ต่อท้าย) แทนการเทียบเวลา
 * เพราะไฟล์ที่แนบในวินาทีเดียวกับคำถามจะแยกไม่ออกว่ามาก่อนหรือหลัง
 */
function infoFilesSince_(timeline, question) {
  var from = question ? question.index : -1;
  var names = [];
  for (var i = from + 1; i < timeline.length; i++) {
    if (str_(timeline[i].action) === 'INFO_FILE') names.push(str_(timeline[i].detail).replace(/^[^:]*:\s*/, ''));
  }
  return names;
}

/**
 * ผู้ขอแนบไฟล์ประกอบคำตอบ (ทำได้เฉพาะตอนสถานะรอข้อมูลเพิ่มเติม)
 * จำกัดจำนวนต่อการตอบหนึ่งครั้งตามค่า maxFiles
 */
function uploadInfoFile_(jobId, email, token, payload) {
  var req = requireRequester_(jobId, email, token);
  if (str_(req.status) !== STATUS.INFO_NEEDED.key) {
    throw appError_('แนบไฟล์เพิ่มได้เฉพาะตอนที่เจ้าหน้าที่ขอข้อมูลเพิ่มเติม ' +
      'หากต้องการส่งไฟล์ในขั้นตอนอื่น กรุณาติดต่อฝ่ายสื่อสารองค์กร');
  }
  var timeline = getTimeline_(req.jobId);
  var max = getSettingInt_('maxFiles', 8);
  if (infoFilesSince_(timeline, infoQuestion_(timeline)).length >= max) {
    throw appError_('แนบไฟล์ได้สูงสุด ' + max + ' ไฟล์ต่อการตอบหนึ่งครั้ง');
  }
  var saved = uploadAttachment_(req.jobId, payload, 'source', req.requesterEmail, { skipLimit: true });
  logTimeline_(req.jobId, req.requesterName, 'INFO_FILE', '', '', 'แนบไฟล์ประกอบข้อมูลเพิ่มเติม: ' + saved.fileName);
  return saved;
}

/**
 * ผู้ขอส่งข้อมูลเพิ่มเติม งานกลับไปสถานะก่อนขอข้อมูล (ถ้าไม่ทราบให้กลับไป "รับคำขอ")
 * แจ้งเจ้าหน้าที่ทางอีเมล และนับกำหนดส่งร่างแรกใหม่จากวันที่ข้อมูลครบ
 */
function submitInfoReply_(jobId, email, token, answer) {
  var id = str_(jobId).toUpperCase();
  var result = withLock_(function () {
    var req = requireRequester_(id, email, token);
    if (str_(req.status) !== STATUS.INFO_NEEDED.key) {
      throw appError_('คำขอนี้ไม่ได้อยู่ในสถานะรอข้อมูลเพิ่มเติมแล้ว ' +
        'อาจมีเจ้าหน้าที่ดำเนินการต่อไปแล้ว กรุณารีเฟรชหน้านี้');
    }
    var timeline = getTimeline_(id);
    var q = infoQuestion_(timeline) || { question: '', at: '', fromStatus: '', index: -1 };
    var files = infoFilesSince_(timeline, q);
    var text = truncate_(answer, 3000);
    if (text.length < 2 && files.length === 0) {
      throw appError_('กรุณาพิมพ์ข้อมูลที่ต้องการส่ง หรือแนบไฟล์อย่างน้อย 1 ไฟล์');
    }

    var back = str_(q.fromStatus).toUpperCase();
    var allowed = [STATUS.NEW.key, STATUS.DESIGNING.key, STATUS.REVIEW.key, STATUS.REVISING.key];
    if (allowed.indexOf(back) < 0) back = STATUS.NEW.key;

    insert_(SHEET.REPLIES, {
      id: newId_('Q'),
      jobId: id,
      createdAt: nowIso_(),
      byName: str_(req.requesterName),
      byEmail: str_(req.requesterEmail),
      question: truncate_(q.question, 2000),
      answer: text,
      fileCount: files.length,
      returnedTo: back
    });
    update_(SHEET.REQUESTS, req._row, {
      status: back,
      attachmentCount: filterBy_(SHEET.ATTACHMENTS, 'jobId', id).length,
      updatedAt: nowIso_(),
      updatedBy: str_(req.requesterEmail)
    });
    logTimeline_(id, req.requesterName, 'INFO_REPLY', STATUS.INFO_NEEDED.key, back,
      'ผู้ขอส่งข้อมูลเพิ่มเติม' + (files.length ? ' พร้อมไฟล์ ' + files.length + ' ไฟล์' : '') +
      (text ? ': ' + truncate_(text, 300) : ''));
    return { jobId: id, status: back, statusLabel: statusInfo_(back).label, fileCount: files.length,
      answer: text, question: q.question, fileNames: files };
  });

  try {
    sendInfoReplyToStaffEmail_(getRequest_(id), result);
  } catch (err) {
    logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องข้อมูลเพิ่มเติมไม่สำเร็จ: ' + err.message);
  }
  return { jobId: result.jobId, status: result.status, statusLabel: result.statusLabel, fileCount: result.fileCount };
}

/** ข้อมูลที่ผู้ขอตอบกลับ สำหรับหน้าเจ้าหน้าที่ */
function replyView_(r) {
  return {
    createdAt: str_(r.createdAt),
    byName: str_(r.byName),
    question: str_(r.question),
    answer: str_(r.answer),
    fileCount: int_(r.fileCount),
    returnedTo: str_(r.returnedTo),
    returnedToLabel: str_(r.returnedTo) ? statusInfo_(r.returnedTo).label : ''
  };
}

/* ------------------------------------------- ประเมินความพึงพอใจ */

var RATING_LABELS = ['', 'ควรปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'ดีเยี่ยม'];

function feedbackView_(f) {
  if (!f) return null;
  var rating = int_(f.rating);
  return {
    rating: rating,
    ratingLabel: RATING_LABELS[rating] || '',
    comment: str_(f.comment),
    createdAt: str_(f.createdAt),
    updatedAt: str_(f.updatedAt)
  };
}

/**
 * ผู้ขอประเมินความพึงพอใจหลังส่งมอบ (1-5) แก้คะแนนภายหลังได้ เก็บงานละหนึ่งแถว
 * คะแนน 1-2 แจ้งเจ้าหน้าที่ทันที เพื่อให้ติดต่อกลับได้เร็ว
 */
function submitFeedback_(jobId, email, token, rating, comment) {
  var id = str_(jobId).toUpperCase();
  var score = int_(rating, 0);
  if (score < 1 || score > 5) throw appError_('กรุณาเลือกคะแนน 1 ถึง 5 ดาว');
  var text = truncate_(comment, 1000);

  var result = withLock_(function () {
    var req = requireRequester_(id, email, token);
    if (str_(req.status) !== STATUS.DELIVERED.key) {
      throw appError_('ประเมินความพึงพอใจได้หลังจากส่งมอบชิ้นงานแล้วเท่านั้น');
    }
    var existing = findBy_(SHEET.FEEDBACK, 'jobId', id);
    var previous = existing ? int_(existing.rating) : 0;
    if (existing) {
      update_(SHEET.FEEDBACK, existing._row, { rating: score, comment: text, updatedAt: nowIso_() });
    } else {
      insert_(SHEET.FEEDBACK, {
        id: newId_('S'), jobId: id, createdAt: nowIso_(), updatedAt: nowIso_(),
        rating: score, comment: text, byEmail: str_(req.requesterEmail)
      });
    }
    logTimeline_(id, req.requesterName, 'FEEDBACK', '', '',
      (existing ? 'ผู้ขอแก้ไขผลประเมินเป็น ' : 'ผู้ขอประเมินความพึงพอใจ ') + score + '/5' +
      (text ? ': ' + truncate_(text, 200) : ''));
    return { jobId: id, rating: score, updated: !!existing, alert: score <= 2 && (previous === 0 || previous > 2) };
  });

  if (result.alert) {
    try {
      sendLowRatingEmail_(getRequest_(id), score, text);
    } catch (err) {
      logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องผลประเมินไม่สำเร็จ: ' + err.message);
    }
  }
  return { jobId: id, rating: result.rating, updated: result.updated };
}


/* ==========================================================================
   12_Library.gs
   ========================================================================== */

/**
 * 12_Library.gs — คลังไฟล์ CI ให้หน่วยงานดาวน์โหลดเอง
 * เช่น โลโก้ เทมเพลตโปสเตอร์ เทมเพลตสไลด์ ฟอนต์ คู่มือ CI
 * งานเล็กที่หน่วยงานทำเองได้จะได้ไม่ต้องยื่นคำขอ
 *
 * แต่ละรายการเป็นได้ 2 แบบ
 *  - file : ไฟล์ที่อัปโหลดเก็บในโฟลเดอร์ "คลังไฟล์ CI" บน Drive และเปิดสิทธิ์ให้ดาวน์โหลดผ่านลิงก์
 *  - link : ลิงก์ไปยังที่อื่น เช่น เทมเพลต Canva หรือโฟลเดอร์ Drive ที่มีไฟล์ขนาดใหญ่
 */

var RESOURCE_MAX_MB = 25;
var RESOURCE_EXTRA_TYPES = 'ttf,otf,woff,woff2,indd,idml,key,mp4,mov,gif';

/** โฟลเดอร์เก็บไฟล์ CI (สร้างให้อัตโนมัติเมื่อใช้ครั้งแรก) */
function resourceFolder_() {
  var rootId = getProp_(PROP.ROOT_FOLDER_ID);
  var root = null;
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch (err) { root = null; }
  }
  return ensureFolder_(root, 'คลังไฟล์ CI (ดาวน์โหลดได้)', PROP.RESOURCE_FOLDER_ID);
}

function resourceView_(r, includeHidden) {
  var kind = str_(r.kind) === 'link' ? 'link' : 'file';
  var fileId = str_(r.fileId);
  var name = str_(r.fileName);
  var dot = name.lastIndexOf('.');
  var out = {
    id: str_(r.id),
    title: str_(r.title),
    description: str_(r.description),
    category: str_(r.category) || 'อื่น ๆ',
    kind: kind,
    url: str_(r.url),
    downloadUrl: kind === 'file' && fileId
      ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId) : str_(r.url),
    fileName: name,
    ext: dot > 0 ? name.substring(dot + 1).toUpperCase() : '',
    sizeLabel: kind === 'file' ? formatBytes_(r.sizeBytes) : '',
    updatedAt: str_(r.updatedAt) || str_(r.createdAt),
    sortOrder: int_(r.sortOrder, 0)
  };
  if (includeHidden) {
    out.active = str_(r.active).toUpperCase() !== 'FALSE';
    out.createdBy = str_(r.createdBy);
  }
  return out;
}

/** รายการไฟล์ CI เรียงตามหมวด ลำดับ และชื่อ (includeHidden สำหรับหน้าเจ้าหน้าที่) */
function listResources_(includeHidden) {
  var order = {};
  for (var i = 0; i < RESOURCE_CATEGORIES.length; i++) order[RESOURCE_CATEGORIES[i]] = i;
  return readAll_(SHEET.RESOURCES)
    .filter(function (r) { return includeHidden || str_(r.active).toUpperCase() !== 'FALSE'; })
    .map(function (r) { return resourceView_(r, includeHidden); })
    .sort(function (a, b) {
      var ca = order.hasOwnProperty(a.category) ? order[a.category] : 99;
      var cb = order.hasOwnProperty(b.category) ? order[b.category] : 99;
      if (ca !== cb) return ca - cb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0);
    });
}

/** เก็บไฟล์ลงโฟลเดอร์ CI และเปิดให้ดาวน์โหลดผ่านลิงก์ */
function storeResourceFile_(file) {
  var fileName = truncate_(pick_(file, 'fileName', ''), 200);
  var dataB64 = str_(pick_(file, 'dataB64', ''));
  if (!fileName || !dataB64) throw appError_('กรุณาเลือกไฟล์ที่ต้องการอัปโหลด');
  var allowed = getSetting_('allowedFileTypes', DEFAULT_SETTINGS.allowedFileTypes) + ',' + RESOURCE_EXTRA_TYPES;
  if (!isAllowedFile_(fileName, allowed)) {
    throw appError_('ไม่รองรับไฟล์ชนิดนี้ ถ้าจำเป็นให้อัปโหลดไว้ใน Drive แล้วเพิ่มเป็น "ลิงก์" แทน');
  }
  var bytes;
  try {
    bytes = Utilities.base64Decode(dataB64);
  } catch (err) {
    throw appError_('ไฟล์เสียหายหรืออ่านไม่ได้ กรุณาลองใหม่');
  }
  if (bytes.length > RESOURCE_MAX_MB * 1024 * 1024) {
    throw appError_('ไฟล์ใหญ่เกิน ' + RESOURCE_MAX_MB + ' MB กรุณาอัปโหลดไว้ใน Drive แล้วเพิ่มเป็น "ลิงก์" แทน');
  }
  var mime = str_(pick_(file, 'mimeType', '')) || 'application/octet-stream';
  var created = resourceFolder_().createFile(Utilities.newBlob(bytes, mime, safeFileName_(fileName)));
  var url = shareFileSafely_(created);
  return { fileId: created.getId(), url: url, fileName: safeFileName_(fileName), mimeType: mime, sizeBytes: bytes.length };
}

/**
 * เพิ่มหรือแก้ไขรายการในคลังไฟล์ CI
 * payload: { id?, title, description, category, kind: 'file'|'link', url?, file?: {fileName, mimeType, dataB64},
 *            active?, sortOrder? }
 */
function saveResource_(payload, actor) {
  var p = payload || {};
  var id = str_(p.id);
  var title = truncate_(pick_(p, 'title', ''), 150);
  if (title.length < 2) throw appError_('กรุณาตั้งชื่อรายการ เช่น "โลโก้คณะศิลปศาสตร์ (ไฟล์เวกเตอร์)"');
  var category = str_(p.category);
  if (RESOURCE_CATEGORIES.indexOf(category) < 0) category = 'อื่น ๆ';
  var kind = str_(p.kind) === 'link' ? 'link' : 'file';
  var existing = id ? findBy_(SHEET.RESOURCES, 'id', id) : null;
  if (id && !existing) throw appError_('ไม่พบรายการนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');

  var patch = {
    title: title,
    description: truncate_(pick_(p, 'description', ''), 500),
    category: category,
    kind: kind,
    active: p.active === false || str_(p.active) === 'false' ? 'FALSE' : 'TRUE',
    sortOrder: Math.max(0, Math.min(999, int_(p.sortOrder, 0))),
    updatedAt: nowIso_()
  };

  var newFile = p.file && str_(p.file.dataB64) ? p.file : null;
  if (kind === 'link') {
    var url = truncate_(pick_(p, 'url', ''), 2000);
    if (!isValidUrl_(url)) throw appError_('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    patch.url = url;
    patch.fileId = '';
    patch.fileName = '';
    patch.mimeType = '';
    patch.sizeBytes = '';
  } else if (newFile) {
    var stored = storeResourceFile_(newFile);
    patch.url = stored.url;
    patch.fileId = stored.fileId;
    patch.fileName = stored.fileName;
    patch.mimeType = stored.mimeType;
    patch.sizeBytes = stored.sizeBytes;
  } else if (!existing || str_(existing.kind) !== 'file' || !str_(existing.fileId)) {
    throw appError_('กรุณาเลือกไฟล์ที่ต้องการอัปโหลด');
  }

  // เปลี่ยนไฟล์ใหม่หรือเปลี่ยนเป็นลิงก์ ให้ย้ายไฟล์เดิมลงถังขยะ
  if (existing && str_(existing.fileId) && (newFile || kind === 'link')) {
    try { DriveApp.getFileById(str_(existing.fileId)).setTrashed(true); } catch (err) { /* ไฟล์อาจหายไปแล้ว */ }
  }

  if (existing) {
    update_(SHEET.RESOURCES, existing._row, patch);
    return resourceView_(findBy_(SHEET.RESOURCES, 'id', id), true);
  }
  patch.id = newId_('C');
  patch.createdAt = nowIso_();
  patch.createdBy = truncate_(actor, 150);
  insert_(SHEET.RESOURCES, patch);
  return resourceView_(patch, true);
}

/** ลบรายการ และย้ายไฟล์ลงถังขยะของ Drive (กู้คืนได้ 30 วัน) */
function deleteResource_(id) {
  var existing = findBy_(SHEET.RESOURCES, 'id', str_(id));
  if (!existing) throw appError_('ไม่พบรายการนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
  if (str_(existing.fileId)) {
    try { DriveApp.getFileById(str_(existing.fileId)).setTrashed(true); } catch (err) { /* ไฟล์อาจหายไปแล้ว */ }
  }
  remove_(SHEET.RESOURCES, existing._row);
  return true;
}


/* ==========================================================================
   13_Archive.gs
   ========================================================================== */

/**
 * 13_Archive.gs — ย้ายคำขอที่ปิดงานไปนานแล้วไปเก็บในสเปรดชีตแยก
 *
 * ทุกคำสั่งในหน้าเจ้าหน้าที่อ่านชีตทั้งชีต เมื่อข้อมูลสะสมหลายปีระบบจะช้าลงเรื่อย ๆ
 * การย้ายงานเก่าที่ปิดแล้วออกไปทำให้คิวงานและการเปิดงานเร็วเท่าเดิมตลอด
 *
 * งานที่ย้ายไปแล้วยังใช้ได้แบบอ่านอย่างเดียว:
 *  - ผู้ขอเปิดลิงก์ติดตามเดิมได้ เจ้าหน้าที่เปิดดูรายละเอียดได้
 *  - แดชบอร์ดและคลังผลงานนับรวมข้อมูลที่เก็บถาวรด้วย
 * ไฟล์บน Drive ไม่ถูกย้าย ลิงก์ไฟล์ทั้งหมดยังเปิดได้เหมือนเดิม
 */

var ARCHIVE_SHEETS = ['Requests', 'Deliverables', 'Attachments', 'Revisions', 'Timeline', 'Replies', 'Feedback'];

/** เปิดสเปรดชีตเก็บถาวร (create = สร้างใหม่ถ้ายังไม่มี) */
function archiveBook_(create) {
  if (_cache.archive) return _cache.archive;
  var id = getProp_(PROP.ARCHIVE_SPREADSHEET_ID);
  if (id) {
    try {
      _cache.archive = SpreadsheetApp.openById(id);
      return _cache.archive;
    } catch (err) {
      if (!create) return null;
    }
  }
  if (!create) return null;
  var book = SpreadsheetApp.create(APP.NAME + ' — ข้อมูลเก็บถาวร');
  setProp_(PROP.ARCHIVE_SPREADSHEET_ID, book.getId());
  try {
    var rootId = getProp_(PROP.ROOT_FOLDER_ID);
    if (rootId) DriveApp.getFolderById(rootId).addFile(DriveApp.getFileById(book.getId()));
  } catch (err) {
    // ย้ายเข้าโฟลเดอร์ไม่ได้ก็ยังใช้งานได้ อยู่ใน My Drive แทน
  }
  _cache.archive = book;
  return book;
}

function archiveSheet_(book, name) {
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    writeHeader_(sh, name);
  }
  return sh;
}

/** อ่านแถวจากชีตเก็บถาวร (คืน array ว่างถ้ายังไม่เคยย้ายข้อมูล) */
function readArchive_(name) {
  var book = archiveBook_(false);
  if (!book) return [];
  return readRows_(book.getSheetByName(name), name);
}

/** ข้อมูลครบชุดของงานที่ย้ายไปเก็บถาวรแล้ว รูปแบบเดียวกับ getRequestFull_ */
function archivedRequestFull_(jobId) {
  var id = str_(jobId).toUpperCase();
  if (!id || !archiveBook_(false)) return null;
  var req = null;
  var reqs = readArchive_(SHEET.REQUESTS);
  for (var i = 0; i < reqs.length; i++) {
    if (str_(reqs[i].jobId) === id) { req = reqs[i]; break; }
  }
  if (!req) return null;
  function byJob(name) {
    return readArchive_(name).filter(function (r) { return str_(r.jobId) === id; });
  }
  var feedback = byJob(SHEET.FEEDBACK);
  return {
    request: req,
    archived: true,
    deliverables: byJob(SHEET.DELIVERABLES).sort(function (a, b) { return int_(a.seq) - int_(b.seq); }),
    attachments: byJob(SHEET.ATTACHMENTS),
    revisions: byJob(SHEET.REVISIONS).sort(function (a, b) { return int_(a.round) - int_(b.round); }),
    timeline: sortByTime_(byJob(SHEET.TIMELINE), 'at'),
    replies: sortByTime_(byJob(SHEET.REPLIES), 'createdAt'),
    feedback: feedback.length ? feedback[0] : null
  };
}

/** วันที่ปิดงาน ใช้ตัดสินว่างานเก่าพอจะย้ายหรือยัง */
function closedAtOf_(r) {
  return str_(r.closedAt) || str_(r.deliveredAt) || str_(r.updatedAt) || str_(r.createdAt);
}

/** ตรวจวันที่ตัดรอบ ต้องเป็นวันที่ในอดีตรูปแบบ yyyy-MM-dd */
function archiveCutoff_(cutoff) {
  var s = str_(cutoff);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !parseDate_(s)) {
    throw appError_('กรุณาเลือกช่วงข้อมูลที่จะย้ายไปเก็บถาวร');
  }
  if (daysBetween_(new Date(), s) > 0) throw appError_('วันที่ตัดรอบต้องไม่เป็นวันในอนาคต');
  return s;
}

/** งานที่จะถูกย้าย: ส่งมอบแล้วหรือยกเลิกแล้ว และปิดงานก่อนวันที่ตัดรอบ */
function archiveCandidates_(cutoff) {
  var c = archiveCutoff_(cutoff);
  return readAll_(SHEET.REQUESTS).filter(function (r) {
    var st = str_(r.status);
    if (st !== STATUS.DELIVERED.key && st !== STATUS.CANCELLED.key) return false;
    return closedAtOf_(r).substring(0, 10) < c;
  });
}

/** ดูก่อนย้ายจริง ว่าจะย้ายกี่งาน */
function previewArchive_(cutoff) {
  var rows = archiveCandidates_(cutoff);
  var live = readAll_(SHEET.REQUESTS).length;
  return {
    cutoff: str_(cutoff),
    count: rows.length,
    remaining: live - rows.length,
    sample: rows.slice(0, 8).map(function (r) {
      return { jobId: str_(r.jobId), projectName: str_(r.projectName), closedAt: closedAtOf_(r) };
    }),
    archiveUrl: archiveUrl_()
  };
}

function archiveUrl_() {
  var id = getProp_(PROP.ARCHIVE_SPREADSHEET_ID);
  return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '';
}

/**
 * ย้ายข้อมูลจริง ทำภายใต้ lock และย้ายทีละชีตแบบเขียนทั้งก้อน (เร็วกว่าลบทีละแถวมาก)
 * คัดลอกไปสเปรดชีตเก็บถาวรก่อน แล้วจึงลบออกจากชีตหลัก ข้อมูลจึงไม่หายแม้ทำไม่เสร็จกลางทาง
 */
function runArchive_(cutoff, actor) {
  return withLock_(function () {
    var candidates = archiveCandidates_(cutoff);
    if (candidates.length === 0) {
      return { cutoff: str_(cutoff), moved: 0, sheets: {}, archiveUrl: archiveUrl_() };
    }
    var ids = {};
    for (var i = 0; i < candidates.length; i++) ids[str_(candidates[i].jobId)] = true;

    var book = archiveBook_(true);
    var summary = {};
    for (var s = 0; s < ARCHIVE_SHEETS.length; s++) {
      var name = ARCHIVE_SHEETS[s];
      var cols = COLUMNS[name];
      var jobCol = cols.indexOf('jobId');
      var sh = sheet_(name);
      var last = sh.getLastRow();
      if (last < 2) { summary[name] = 0; continue; }
      var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
      var move = [];
      var keep = [];
      for (var r = 0; r < values.length; r++) {
        (ids[str_(values[r][jobCol])] ? move : keep).push(values[r].map(sheetValue_));
      }
      summary[name] = move.length;
      if (move.length === 0) continue;

      var target = archiveSheet_(book, name);
      var startRow = target.getLastRow() + 1;
      // Sheets ไม่ยอมเขียนเกินจำนวนแถวที่มี (ชีตใหม่มี 1,000 แถว) จึงต้องเพิ่มแถวก่อนเมื่อย้ายข้อมูลจำนวนมาก
      var shortBy = startRow + move.length - 1 - target.getMaxRows();
      if (shortBy > 0) target.insertRowsAfter(target.getMaxRows(), shortBy);
      target.getRange(startRow, 1, move.length, cols.length).setValues(move);

      if (keep.length > 0) sh.getRange(2, 1, keep.length, cols.length).setValues(keep);
      deleteDataRows_(sh, 2 + keep.length, values.length - keep.length, cols.length);
    }

    bustPublicCache_();
    logTimeline_('SYSTEM', actor, 'ARCHIVE', '', '',
      'ย้ายคำขอที่ปิดงานก่อน ' + formatThaiDate_(cutoff) + ' จำนวน ' + candidates.length +
      ' รายการไปเก็บถาวร');
    return { cutoff: str_(cutoff), moved: candidates.length, sheets: summary, archiveUrl: archiveUrl_() };
  }, 60000);
}

/** ข้อมูลสรุปของที่เก็บถาวรสำหรับหน้าตั้งค่า */
function archiveInfo_() {
  return { archiveUrl: archiveUrl_(), archivedCount: readArchive_(SHEET.REQUESTS).length };
}


/* ==========================================================================
   14_Designers.gs
   ========================================================================== */

/**
 * 14_Designers.gs — รายชื่อผู้ออกแบบ การเลือกผู้ออกแบบ และคิวงานสาธารณะ
 *
 * ผู้ขอเลือกผู้ออกแบบเองได้ตอนยื่นคำขอ (หรือให้ฝ่ายฯ จัดสรรให้)
 * งานผูกกับผู้ออกแบบผ่านช่อง assignedTo ของคำขอ (เก็บชื่อผู้ออกแบบ) ซึ่งเจ้าหน้าที่เปลี่ยนได้ด้วยปุ่ม "มอบหมาย"
 * เมื่อเปลี่ยนชื่อผู้ออกแบบ ระบบเปลี่ยนชื่อในงานที่ผูกอยู่ให้ด้วย งานจึงไม่หลุดจากผู้ออกแบบ
 *
 * หน้ายื่นคำขอแสดงภาระงานของแต่ละคน ปฏิทิน และตารางงานที่กำลังทำ
 * ข้อมูลส่วนนั้นเปิดให้ทุกคนเห็น จึงส่งเฉพาะชื่อโครงการ กำหนดใช้งาน สถานะ และผู้ออกแบบ
 * ไม่ส่งชื่อ อีเมล หรือเบอร์โทรของผู้ขอเด็ดขาด
 */

var PUBLIC_WORKLOAD_CACHE_KEY = 'public:workload:v2';
var DESIGNER_POOL = 'pool';            // ผู้ขอเลือก "ให้ฝ่ายฯ จัดสรรให้"
var STAFF_LABEL = 'เจ้าหน้าที่ฝ่ายฯ'; // ชื่อที่ผู้ขอเห็นเมื่องานอยู่กับคนที่ไม่อยู่ในรายชื่อผู้ออกแบบ
var STAFF_COLOR = '#64748b';
var DEFAULT_DESIGNER_CAPACITY = 6;

/** คีย์สำหรับเทียบชื่อ ไม่สนช่องว่างซ้ำและตัวพิมพ์ใหญ่เล็ก */
function designerKey_(name) {
  return str_(name).replace(/\s+/g, ' ').toLowerCase();
}

function designerRecord_(r, index) {
  var color = str_(r.color);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = DESIGNER_COLORS[index % DESIGNER_COLORS.length];
  var name = str_(r.name);
  return {
    id: str_(r.id),
    name: name,
    shortName: str_(r.shortName) || name.split(' ')[0],
    shortNameAuto: !str_(r.shortName),
    specialty: str_(r.specialty),
    color: color.toLowerCase(),
    email: str_(r.email),
    capacity: Math.max(1, int_(r.capacity, DEFAULT_DESIGNER_CAPACITY) || DEFAULT_DESIGNER_CAPACITY),
    accepting: str_(r.accepting).toUpperCase() !== 'FALSE',
    active: str_(r.active).toUpperCase() !== 'FALSE',
    sortOrder: int_(r.sortOrder, 0),
    _row: r._row
  };
}

/** รายชื่อผู้ออกแบบเรียงตามลำดับ (includeInactive = รวมคนที่ซ่อนไว้ สำหรับหน้าตั้งค่า) */
function listDesigners_(includeInactive) {
  var rows = readAll_(SHEET.DESIGNERS).slice().sort(function (a, b) {
    var d = int_(a.sortOrder, 0) - int_(b.sortOrder, 0);
    if (d !== 0) return d;
    var x = str_(a.createdAt);
    var y = str_(b.createdAt);
    return x === y ? 0 : (x < y ? -1 : 1);
  });
  return rows.map(designerRecord_).filter(function (d) { return includeInactive || d.active; });
}

/** ข้อมูลที่เปิดเผยได้ (ไม่มีอีเมล) */
function designerPublic_(d) {
  return {
    id: d.id, name: d.name, shortName: d.shortName, specialty: d.specialty,
    color: d.color, accepting: d.accepting, capacity: d.capacity
  };
}

/** หาผู้ออกแบบจาก id หรือชื่อ (รวมคนที่ซ่อนไว้) */
function findDesigner_(idOrName) {
  var key = designerKey_(idOrName);
  if (!key) return null;
  var all = listDesigners_(true);
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === str_(idOrName) || designerKey_(all[i].name) === key) return all[i];
  }
  return null;
}

/** ชื่อที่จะบันทึกเป็นผู้รับผิดชอบ ถ้าตรงกับผู้ออกแบบในรายชื่อให้ใช้ชื่อมาตรฐานของคนนั้น */
function resolveAssignee_(text) {
  var d = findDesigner_(text);
  return d ? d.name : truncate_(str_(text).replace(/\s+/g, ' '), 150);
}

/**
 * ผู้ออกแบบที่ผู้ขอเลือกตอนยื่นคำขอ คืน null เมื่อเลือก "ให้ฝ่ายฯ จัดสรรให้"
 * ผู้ขอต้องเลือกเองทุกครั้ง (ผู้ออกแบบคนใดคนหนึ่ง หรือ DESIGNER_POOL)
 * ยกเว้นยังไม่มีรายชื่อผู้ออกแบบเลย ซึ่งหน้าเว็บจะซ่อนตัวเลือกไว้
 */
function requesterDesigner_(designerId) {
  var id = str_(designerId);
  if (id === DESIGNER_POOL) return null;
  var e = null;
  if (!id) {
    if (listDesigners_(false).length === 0) return null;
    e = appError_('กรุณาเลือกผู้ออกแบบที่ต้องการในขั้นที่ 2 หรือเลือก "ให้ฝ่ายฯ จัดสรรให้" ถ้ายังไม่แน่ใจ');
    e.code = 'DESIGNER';
    throw e;
  }
  var d = findDesigner_(id);
  if (!d || !d.active || d.id !== id) {
    e = appError_('ผู้ออกแบบที่เลือกไม่อยู่ในรายชื่อแล้ว กรุณาเลือกใหม่ หรือเลือก "ให้ฝ่ายฯ จัดสรรให้"');
  } else if (!d.accepting) {
    e = appError_(d.name + ' งดรับงานใหม่ชั่วคราว กรุณาเลือกผู้ออกแบบคนอื่น หรือเลือก "ให้ฝ่ายฯ จัดสรรให้"');
  }
  if (e) {
    e.code = 'DESIGNER'; // หน้าเว็บใช้รหัสนี้พากลับไปเลือกผู้ออกแบบใหม่พร้อมรายชื่อล่าสุด
    throw e;
  }
  return d;
}

/**
 * ผู้ออกแบบของงานสำหรับหน้าติดตามของผู้ขอ
 * แสดงเฉพาะชื่อที่อยู่ในรายชื่อผู้ออกแบบ (ซึ่งเปิดเผยบนคิวงานอยู่แล้ว)
 * ชื่ออื่นที่เจ้าหน้าที่พิมพ์เอง เช่น ฟรีแลนซ์ภายนอก ถือเป็นข้อมูลภายใน
 */
function publicDesignerOf_(assignedTo) {
  var name = str_(assignedTo);
  if (!name) return null;
  var d = findDesigner_(name);
  if (!d || designerKey_(d.name) !== designerKey_(name)) return { name: STAFF_LABEL, color: STAFF_COLOR, staff: true };
  return { name: d.name, color: d.color };
}

/** ชื่อบัญชีเจ้าหน้าที่ที่ใช้งานอยู่ (ไม่มีอีเมล) สำหรับเลือกผู้รับผิดชอบ */
function activeStaffNames_() {
  var seen = {};
  var out = [];
  readAll_(SHEET.USERS).forEach(function (u) {
    if (str_(u.active).toUpperCase() !== 'TRUE') return;
    var name = str_(u.name).replace(/\s+/g, ' ');
    if (!name || seen[designerKey_(name)]) return;
    seen[designerKey_(name)] = true;
    out.push(name);
  });
  return out;
}

/**
 * อีเมลของผู้รับผิดชอบ ใช้แจ้งเมื่อได้รับมอบหมายงาน
 * ใช้อีเมลในรายชื่อผู้ออกแบบก่อน ถ้าไม่มีให้ใช้อีเมลบัญชีเจ้าหน้าที่ที่ชื่อตรงกัน
 */
function assigneeContact_(name) {
  var key = designerKey_(name);
  if (!key) return null;
  var d = findDesigner_(name);
  if (d && designerKey_(d.name) === key && d.email) return { name: d.name, email: d.email };
  var users = readAll_(SHEET.USERS);
  for (var i = 0; i < users.length; i++) {
    if (str_(users[i].active).toUpperCase() === 'TRUE' && designerKey_(users[i].name) === key && str_(users[i].email)) {
      return { name: str_(users[i].name), email: str_(users[i].email) };
    }
  }
  return null;
}

/** งานที่กำลังดำเนินการ (ยื่นแล้ว และยังไม่ส่งมอบหรือยกเลิก) */
function activeJobRows_() {
  return readAll_(SHEET.REQUESTS).filter(function (r) {
    var st = str_(r.status);
    return str_(r.submittedAt) && st !== STATUS.DELIVERED.key && st !== STATUS.CANCELLED.key;
  });
}

/** ระดับความหนักของงานเทียบกับจำนวนงานที่รับได้พร้อมกัน */
function loadLevel_(count, capacity) {
  var pct = capacity > 0 ? Math.round((count / capacity) * 100) : 0;
  if (count === 0) return { pct: 0, level: 'free', label: 'ว่าง' };
  if (pct < 40) return { pct: pct, level: 'free', label: 'งานน้อย' };
  if (pct < 75) return { pct: pct, level: 'normal', label: 'ปานกลาง' };
  if (pct < 100) return { pct: pct, level: 'busy', label: 'ค่อนข้างมาก' };
  return { pct: pct, level: 'full', label: 'เต็ม' };
}

/**
 * ภาระงานของผู้ออกแบบแต่ละคน งานที่ยังไม่มีผู้รับผิดชอบ (other)
 * และงานที่มอบหมายให้คนที่ไม่อยู่ในรายชื่อผู้ออกแบบ (staff) เช่น บัญชีเจ้าหน้าที่อื่น
 */
function computeWorkload_(designers, rows) {
  var byKey = {};
  var stats = designers.map(function (d) {
    var s = { designer: d, active: 0, dueSoon: 0, overdue: 0 };
    byKey[designerKey_(d.name)] = s;
    return s;
  });
  var other = { active: 0, dueSoon: 0, overdue: 0 };
  var staff = { active: 0, dueSoon: 0, overdue: 0 };
  var today = new Date();
  var jobs = rows.map(function (r) {
    var s = byKey[designerKey_(r.assignedTo)] || null;
    var isStaff = !s && !!str_(r.assignedTo);
    var bucket = s || (isStaff ? staff : other);
    var left = daysBetween_(today, r.dueDate);
    bucket.active++;
    if (left !== null && left < 0) bucket.overdue++;
    else if (left !== null && left <= 7) bucket.dueSoon++;
    return { row: r, designer: s ? s.designer : null, staff: isStaff, daysLeft: left };
  });
  return { stats: stats, other: other, staff: staff, jobs: jobs };
}

/**
 * คิวงานสาธารณะสำหรับหน้ายื่นคำขอ แคชไว้ 1 นาที (ล้างทันทีเมื่อมีการเปลี่ยนแปลงคำขอหรือรายชื่อ)
 */
function publicWorkload_() {
  if (!getSettingBool_('publicWorkload', true)) return { enabled: false };
  var cache = CacheService.getScriptCache();
  var hit = cache.get(PUBLIC_WORKLOAD_CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* แคชเสีย คำนวณใหม่ */ }
  }

  var designers = listDesigners_(false);
  var w = computeWorkload_(designers, activeJobRows_());
  var result = {
    enabled: true,
    generatedAt: nowIso_(),
    designers: w.stats.map(function (s) {
      var lv = loadLevel_(s.active, s.designer.capacity);
      var out = designerPublic_(s.designer);
      out.active = s.active;
      out.dueSoon = s.dueSoon;
      out.overdue = s.overdue;
      out.loadPct = lv.pct;
      out.level = lv.level;
      out.levelLabel = lv.label;
      return out;
    }),
    unassigned: { active: w.other.active, dueSoon: w.other.dueSoon, color: UNASSIGNED_COLOR },
    staff: { active: w.staff.active, dueSoon: w.staff.dueSoon, color: STAFF_COLOR, label: STAFF_LABEL },
    jobs: w.jobs.map(function (j) {
      var info = statusInfo_(j.row.status);
      return {
        projectName: truncate_(j.row.projectName, 120),
        dueDate: str_(j.row.dueDate).substring(0, 10),
        daysLeft: j.daysLeft,
        status: info.key,
        statusLabel: info.label,
        statusColor: info.color,
        designerId: j.designer ? j.designer.id : (j.staff ? '__staff' : ''),
        designerName: j.designer ? j.designer.name : (j.staff ? STAFF_LABEL : ''),
        color: j.designer ? j.designer.color : (j.staff ? STAFF_COLOR : UNASSIGNED_COLOR)
      };
    }).sort(function (a, b) {
      return a.dueDate === b.dueDate ? 0 : (a.dueDate < b.dueDate ? -1 : 1);
    })
  };
  try {
    cache.put(PUBLIC_WORKLOAD_CACHE_KEY, JSON.stringify(result), 60);
  } catch (err) {
    // ข้อมูลใหญ่เกินที่แคชรับได้ ก็ส่งค่าที่คำนวณสด ๆ ไปเลย
  }
  return result;
}

/** ล้างแคชคิวงานสาธารณะ (เรียกทุกครั้งที่คำขอหรือรายชื่อผู้ออกแบบเปลี่ยน) */
function bustPublicCache_() {
  try {
    CacheService.getScriptCache().remove(PUBLIC_WORKLOAD_CACHE_KEY);
  } catch (err) {
    // แคชหมดอายุเองใน 1 นาทีอยู่แล้ว
  }
}

/** รายชื่อผู้ออกแบบพร้อมภาระงาน สำหรับหน้าเจ้าหน้าที่ */
function adminDesigners_() {
  var all = listDesigners_(true);
  var w = computeWorkload_(all, activeJobRows_());
  var known = {};
  all.forEach(function (d) { known[designerKey_(d.name)] = true; });
  // ชื่อที่เคยมอบหมายงานแต่ยังไม่อยู่ในรายชื่อ ช่วยให้เพิ่มคนเดิมแล้วงานเดิมผูกให้ทันที
  var suggest = {};
  readAll_(SHEET.REQUESTS).forEach(function (r) {
    var name = str_(r.assignedTo).replace(/\s+/g, ' ');
    if (!name || known[designerKey_(name)]) return;
    suggest[name] = (suggest[name] || 0) + 1;
  });
  return {
    designers: w.stats.map(function (s) {
      var lv = loadLevel_(s.active, s.designer.capacity);
      var d = s.designer;
      return {
        id: d.id, name: d.name, shortName: d.shortName, shortNameAuto: d.shortNameAuto, specialty: d.specialty,
        color: d.color, email: d.email, capacity: d.capacity, accepting: d.accepting, active: d.active, sortOrder: d.sortOrder,
        activeJobs: s.active, dueSoon: s.dueSoon, overdue: s.overdue, loadPct: lv.pct, levelLabel: lv.label
      };
    }),
    unassigned: w.other.active,
    staff: activeStaffNames_().filter(function (n) { return !known[designerKey_(n)]; }),
    suggestions: Object.keys(suggest).map(function (n) { return { name: n, jobs: suggest[n] }; }),
    palette: DESIGNER_COLORS
  };
}

/**
 * เพิ่มหรือแก้ไขผู้ออกแบบ
 * เปลี่ยนชื่อแล้ว งานที่ผูกกับชื่อเดิมจะเปลี่ยนเป็นชื่อใหม่ให้ด้วย
 */
function saveDesigner_(payload, actor) {
  var p = payload || {};
  var name = truncate_(str_(pick_(p, 'name', '')).replace(/\s+/g, ' '), 80);
  if (name.length < 2) throw appError_('กรุณากรอกชื่อผู้ออกแบบ');
  var email = str_(pick_(p, 'email', '')).toLowerCase();
  if (email && !isValidEmail_(email)) throw appError_('อีเมลไม่ถูกต้อง ถ้าไม่ต้องการให้ระบบแจ้งเตือนให้เว้นว่าง');
  var color = str_(p.color).toLowerCase();
  if (color && !/^#[0-9a-f]{6}$/.test(color)) throw appError_('สีไม่ถูกต้อง กรุณาเลือกจากชุดสี');
  var capacity = int_(p.capacity, DEFAULT_DESIGNER_CAPACITY);
  if (capacity < 1 || capacity > 50) throw appError_('จำนวนงานที่รับได้พร้อมกันต้องอยู่ระหว่าง 1 ถึง 50');

  return withLock_(function () {
    var id = str_(p.id);
    var all = listDesigners_(true);
    var existing = null;
    for (var i = 0; i < all.length; i++) {
      if (id && all[i].id === id) existing = all[i];
      else if (designerKey_(all[i].name) === designerKey_(name)) {
        throw appError_('มีผู้ออกแบบชื่อ "' + all[i].name + '" อยู่แล้ว');
      }
    }
    if (id && !existing) throw appError_('ไม่พบผู้ออกแบบคนนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');

    var record = {
      name: name,
      shortName: truncate_(pick_(p, 'shortName', ''), 30),
      specialty: truncate_(pick_(p, 'specialty', ''), 200),
      color: color || (existing ? existing.color : DESIGNER_COLORS[all.length % DESIGNER_COLORS.length]),
      email: email,
      capacity: capacity,
      accepting: p.accepting === false || str_(p.accepting) === 'false' ? 'FALSE' : 'TRUE',
      active: p.active === false || str_(p.active) === 'false' ? 'FALSE' : 'TRUE',
      sortOrder: Math.max(0, Math.min(999, int_(p.sortOrder, existing ? existing.sortOrder : all.length))),
      updatedAt: nowIso_()
    };

    var renamed = 0;
    if (existing) {
      if (designerKey_(existing.name) !== designerKey_(name) || existing.name !== name) {
        readAll_(SHEET.REQUESTS).forEach(function (r) {
          if (designerKey_(r.assignedTo) !== designerKey_(existing.name)) return;
          update_(SHEET.REQUESTS, r._row, { assignedTo: name });
          renamed++;
        });
      }
      update_(SHEET.DESIGNERS, existing._row, record);
    } else {
      record.id = newId_('P');
      record.createdAt = nowIso_();
      insert_(SHEET.DESIGNERS, record);
    }
    var saved = findDesigner_(existing ? existing.id : record.id);
    return { designer: saved ? designerPublic_(saved) : null, renamedJobs: renamed };
  });
}

/** ลบผู้ออกแบบ (ทำได้เมื่อไม่มีงานที่กำลังทำอยู่) */
function deleteDesigner_(id) {
  return withLock_(function () {
    var d = findDesigner_(id);
    if (!d || d.id !== str_(id)) throw appError_('ไม่พบผู้ออกแบบคนนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    var busy = activeJobRows_().filter(function (r) {
      return designerKey_(r.assignedTo) === designerKey_(d.name);
    }).length;
    if (busy > 0) {
      throw appError_(d.name + ' ยังมีงานที่กำลังทำอยู่ ' + busy + ' งาน กรุณามอบหมายงานให้คนอื่นก่อน ' +
        'หรือกด "แก้ไข" แล้วปิด "แสดงให้ผู้ขอเลือก" แทนการลบ');
    }
    remove_(SHEET.DESIGNERS, d._row);
    return true;
  });
}

