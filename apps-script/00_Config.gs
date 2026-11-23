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
 * หน่วยงานในสำนักงานคณะตามหน้าบุคลากร https://arts.tu.ac.th/th/staff
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
    'สำนักงานเลขานุการคณะศิลปศาสตร์',
    'สำนักงานคณบดี',
    'งานบริหารทรัพยากรมนุษย์ บริหารงานทั่วไปและธุรการ',
    'ฝ่ายสารบรรณและรับ-ส่ง',
    'กลุ่มงานทรัพยากรมนุษย์',
    'หน่วยเทคโนโลยีสารสนเทศ',
    'หน่วยสื่อสารองค์กร',
    'หน่วยเลขานุการสาขาวิชา',
    'หน่วยอาคารและสถานที่',
    'งานการคลังและพัสดุ',
    'กลุ่มงานพัสดุ',
    'งานงบประมาณ แผน และพัฒนาคุณภาพการศึกษา',
    'กลุ่มงานมาตรฐานการศึกษา',
    'งานบริหารการศึกษาและวิจัย',
    'กลุ่มงานบัณฑิตศึกษา',
    'กลุ่มงานส่งเสริมผลงานวิชาการและวิจัย',
    'กลุ่มงานเครือข่ายสัมพันธ์',
    'โครงการบริการการศึกษา',
    'โครงการบริการสังคม',
    'หน่วยบริการยานพาหนะ',
    'พนักงานสถานที่ ศูนย์รังสิต',
    'พนักงานสถานที่ ท่าพระจันทร์'
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
