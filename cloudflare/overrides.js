/* =====================================================================
   overrides.js — ส่วนที่ทำงานต่างจาก Apps Script เมื่อรันบน Cloudflare
   วางไว้ "หลัง" โค้ด .gs ทั้งหมดภายใน createApp(HOST) ฟังก์ชันชื่อเดียวกันตัวหลังชนะ

   แก้ให้น้อยที่สุด ตรรกะของระบบทั้งหมดยังเป็นโค้ดชุดเดียวกับ Apps Script
   ที่ต้องทับมีแค่เรื่อง "ที่อยู่" "การติดตั้ง" และ "โฟลเดอร์งานบน Drive"
   ===================================================================== */

/** Cloudflare เป็นระบบหลักเสมอ (โหมดสำรองเป็นของฝั่ง Apps Script) */
function isBackupMode_() { return false; }

/* ---------- ที่อยู่ของระบบ = โดเมนของ Cloudflare ----------
   Script Properties ที่ย้ายมาจาก Apps Script มี WEBAPP_URL เป็นที่อยู่ของ Apps Script
   ลิงก์ในอีเมลและหน้าตั้งค่าต้องชี้มาที่ Cloudflare */
function safeWebAppUrl_() { var o = HOST.origin(); return o ? o + '/' : ''; }
function rememberWebAppUrl_() { /* ที่อยู่ไม่เปลี่ยน */ }

/* ---------- ติดตั้งระบบ: ทำบน Apps Script แล้วย้ายข้อมูลมาตอนจับคู่ ---------- */
function ensureInstalled_() { return false; }
function installTriggers_() { /* งานตามเวลาทำโดย alarm ของ Durable Object */ }

/* ---------- ลิงก์สเปรดชีตเก็บถาวร: ชี้ไปสำเนาบน Google Sheets ของ Apps Script ---------- */
function archiveUrl_() {
  var id = getProp_(PROP.ARCHIVE_SPREADSHEET_ID);
  if (id && !/^cf-/.test(id)) return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  return str_(HOST.getProp('__gas_archive_url'));
}

/**
 * โฟลเดอร์ประจำงาน: ใช้โฟลเดอร์ที่ Apps Script เตรียมไว้ล่วงหน้า (ตั้งชื่อให้ภายหลังในคิว)
 * ผู้ขอจึงไม่ต้องรอ Google สร้างโฟลเดอร์ตอนกดส่งคำขอ ถ้าโฟลเดอร์สำรองหมดค่อยสร้างใหม่ทันที
 */
function createJobFolder_(jobId, projectName) {
  var name = jobId + ' ' + safeFileName_(truncate_(projectName, 80));
  var description = 'คำขอรับบริการออกแบบ ' + jobId + ' | ' + APP.ORG;
  var spare = HOST.takeSpareFolder();
  if (spare) {
    HOST.enqueue({ t: 'drive', a: 'claimFolder', id: spare.id, n: name, d: description });
    return { id: spare.id, url: spare.url };
  }
  var parentId = getProp_(PROP.JOBS_FOLDER_ID);
  if (!parentId) throw appError_('ยังไม่ได้ติดตั้งโฟลเดอร์ระบบ กรุณาติดต่อผู้ดูแลระบบ');
  var folder = DriveApp.getFolderById(parentId).createFolder(name);
  folder.setDescription(description);
  return { id: folder.getId(), url: folder.getUrl() };
}

/* ---------- ฟังก์ชันที่ server.mjs เรียก ---------- */

var CF_EXPORTS = {
  version: APP.VERSION,

  /** เริ่มคำสั่งใหม่: ล้างแคชระดับคำสั่ง (บน Apps Script หายเองทุกครั้งที่รัน แต่ที่นี่ตัวรันอยู่ต่อ) */
  begin: function () {
    _cache = { ss: null, sheets: {}, settings: null };
  },

  /** เรียก api* จากหน้าเว็บ (เหมือน google.script.run) */
  call: function (fn, args) {
    var f = CF_API[fn];
    if (typeof f !== 'function') return { ok: false, error: 'ไม่พบคำสั่ง ' + fn };
    return f.apply(null, Array.isArray(args) ? args : []);
  },

  /** ข้อมูลตั้งต้นที่ฝังในหน้าเว็บ (รัน doGet เดิม แล้วหยิบค่า boot ที่ใส่ในเทมเพลต) */
  boot: function (params) {
    var out = doGet({ parameter: params || {} });
    return out && out._template ? String(out._template.boot) : 'null';
  },

  /** งานตามเวลา */
  run: function (handler) {
    if (handler === 'workerTick') return workerTick();
    if (handler === 'workerOnce') return workerOnce();
    if (handler === 'dailyReminder') return dailyReminder();
    throw new Error('ไม่รู้จักงาน ' + handler);
  },

  /** ตรวจบัญชีผู้ดูแลระบบ (ใช้กับหน้า /setup) คืนชื่อ หรือโยน error ที่บอกเหตุผล */
  checkAdmin: function (email, password) {
    var res = login_(email, password);
    if (res.user.role !== 'admin') throw appError_('ต้องใช้บัญชีผู้ดูแลระบบ');
    return res.user.name;
  },

  /** จำนวนแถวของทุกชีตในสเปรดชีตหลัก (หน้า /setup) */
  counts: function () {
    var out = {};
    Object.keys(COLUMNS).forEach(function (name) {
      try { out[name] = Math.max(0, sheet_(name).getLastRow() - 1); } catch (e) { out[name] = 0; }
    });
    return out;
  },

  /** สร้างชีตที่ยังไม่มีให้ครบ (หลังย้ายข้อมูล) */
  ensureSheets: function () { Object.keys(COLUMNS).forEach(function (name) { sheet_(name); }); },

  makeDate: function (ms) { return new Date(ms); },
  isDate: cfIsDate
};
return CF_EXPORTS;
