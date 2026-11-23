/**
 * run.js — ชุดทดสอบอัตโนมัติของระบบขอรับบริการออกแบบ
 * รันด้วย:  npm test   (หรือ  TZ=Asia/Bangkok node tests/run.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRuntime } = require('./mock-gas');

const SRC_DIR = path.join(__dirname, '..', 'apps-script');
const SERVER_FILES = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.gs')).sort();

/* ------------------------------------------------------------ test tools */

let passed = 0;
let failed = 0;
const failures = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log('\n\x1b[1m' + name + '\x1b[0m');
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (err) {
    failed++;
    failures.push({ group: currentGroup, name, err });
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    \x1b[31m' + err.message + '\x1b[0m');
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'คาดว่าเป็นจริง แต่ได้ค่าเท็จ');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ค่าไม่ตรงกัน') +
      '\n      ได้     : ' + JSON.stringify(actual) +
      '\n      คาดหวัง : ' + JSON.stringify(expected));
  }
}

function assertThrows(fn, needle, message) {
  let threw = false;
  let actual = '';
  try { fn(); } catch (err) { threw = true; actual = err.message; }
  if (!threw) throw new Error((message || 'คาดว่าจะโยน error') + ' แต่ไม่โยน');
  if (needle && actual.indexOf(needle) < 0) {
    throw new Error((message || 'ข้อความ error ไม่ตรง') +
      '\n      ได้     : ' + actual +
      '\n      ต้องมีคำว่า : ' + needle);
  }
  return actual;
}

/* -------------------------------------------------------------- fixtures */

function loadApp(options) {
  const rt = createRuntime(options);
  const sandbox = Object.assign({}, rt.globals);
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const file of SERVER_FILES) {
    const code = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    vm.runInContext(code, ctx, { filename: file });
  }
  return { ctx, state: rt.state };
}

function dateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}

function samplePayload(overrides) {
  return Object.assign({
    requesterName: 'ธิติวุฒิ บุญแก้ว',
    requesterEmail: 'thitiwut@arts.tu.ac.th',
    requesterPhone: '081-234-5678',
    department: 'ฝ่ายสื่อสารองค์กร',
    lineId: 'prlarts',
    projectName: 'โครงการอบรมการเขียนบทความวิชาการ',
    eventDate: dateStr(30),
    dueDate: dateStr(20),
    objective: 'ประชาสัมพันธ์ให้นักศึกษาและบุคลากรทราบและสมัครเข้าร่วมโครงการ',
    targetAudience: 'นักศึกษาระดับปริญญาตรีและบุคลากรคณะศิลปศาสตร์',
    keyMessage: 'เปิดรับสมัครแล้ววันนี้ถึง 30 กันยายน',
    mandatoryText: 'วันที่ 15 ตุลาคม 2569\nห้องประชุมชั้น 3 อาคารคณะศิลปศาสตร์',
    referenceUrl: 'https://example.com/reference',
    channels: ['Facebook คณะศิลปศาสตร์', 'เว็บไซต์คณะ'],
    notes: 'ขอโทนสีส้มตามอัตลักษณ์คณะ',
    acceptTerms: true,
    deliverables: [
      { mediaType: 'poster', size: 'A3 (29.7 x 42 ซม.)', quantity: 1, note: '' },
      { mediaType: 'social', size: 'จัตุรัส 1080 x 1080 px', quantity: 2, note: 'ทำ 2 แบบ' }
    ]
  }, overrides || {});
}

const BRIEF_JSON = {
  objective: 'ประชาสัมพันธ์โครงการอบรมการเขียนบทความวิชาการ',
  targetAudience: 'นักศึกษาปริญญาตรีและบุคลากรคณะศิลปศาสตร์',
  keyMessage: 'เปิดรับสมัครถึง 30 กันยายน',
  toneAndStyle: 'ทางการกึ่งร่วมสมัย ใช้โทนสีส้มตามอัตลักษณ์คณะ',
  deliverables: 'โปสเตอร์ A3 จำนวน 1 ชิ้น และภาพโซเชียล 1080x1080 จำนวน 2 ชิ้น',
  deadline: 'ใช้งาน ' + dateStr(20),
  mandatoryElements: ['วันที่ 15 ตุลาคม 2569', 'ห้องประชุมชั้น 3'],
  missingInfo: ['ขอไฟล์ตราสัญลักษณ์แบบเวกเตอร์']
};

function claudeOkHandler() {
  return {
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      id: 'msg_test', model: 'claude-opus-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(BRIEF_JSON) }],
      usage: { input_tokens: 800, output_tokens: 300 }
    })
  };
}

/** ติดตั้งระบบพร้อมบัญชีผู้ดูแล และคืนบริบทที่พร้อมใช้ */
function bootstrapApp(options) {
  const app = loadApp(options);
  app.ctx.setupSystem();
  app.ctx.createAdmin('pr@arts.tu.ac.th', 'ผู้ดูแลระบบ', 'SuperSecret123');
  return app;
}

/* ==========================================================================
   1. การติดตั้งระบบ
   ========================================================================== */
group('1. การติดตั้งระบบ (setupSystem)');

{
  const app = loadApp();
  const result = app.ctx.setupSystem();

  test('สร้างสเปรดชีตและบันทึก id ไว้ใน Script Properties', () => {
    assert(!!app.state.props.SPREADSHEET_ID, 'ไม่พบ SPREADSHEET_ID');
    assert(!!result.spreadsheetUrl, 'ไม่มี URL ของสเปรดชีต');
  });

  test('สร้างชีตครบทั้ง 8 ชีตพร้อมหัวตารางถูกต้อง', () => {
    const book = app.ctx.ss_();
    const names = ['Requests', 'Deliverables', 'Attachments', 'Revisions',
      'Timeline', 'Users', 'Settings', 'Counters'];
    for (const name of names) {
      const sheet = book.getSheetByName(name);
      assert(!!sheet, 'ไม่พบชีต ' + name);
      const header = sheet.getRange(1, 1, 1, app.ctx.COLUMNS[name].length).getValues()[0];
      assertEqual(header.join('|'), app.ctx.COLUMNS[name].join('|'), 'หัวตารางของ ' + name + ' ไม่ตรง');
    }
  });

  test('ลบชีตเริ่มต้น Sheet1 ที่ว่างเปล่าออก', () => {
    assertEqual(app.ctx.ss_().getSheetByName('Sheet1'), null);
  });

  test('สร้างกุญแจลับและโฟลเดอร์ Drive', () => {
    assert(app.state.props.APP_SECRET.length > 30, 'กุญแจลับสั้นเกินไป');
    assert(!!app.state.props.ROOT_FOLDER_ID, 'ไม่พบโฟลเดอร์หลัก');
    assert(!!app.state.props.JOBS_FOLDER_ID, 'ไม่พบโฟลเดอร์งาน');
    assert(!!app.state.props.ASSET_FOLDER_ID, 'ไม่พบโฟลเดอร์คลังผลงาน');
  });

  test('เติมค่าตั้งต้นครบทุกรายการ', () => {
    const settings = app.ctx.getSettings_();
    assertEqual(settings.revisionLimit, '3');
    assertEqual(settings.minLeadDays, '7');
    assertEqual(settings.aiModel, 'claude-opus-5');
  });

  test('ติดตั้งทริกเกอร์เบื้องหลัง 2 ตัว', () => {
    const handlers = app.state.triggers.map((t) => t.getHandlerFunction()).sort();
    assertEqual(handlers.join(','), 'dailyReminder,workerTick');
  });

  test('เรียก setupSystem ซ้ำได้โดยไม่สร้างของซ้ำซ้อน', () => {
    const secretBefore = app.state.props.APP_SECRET;
    const sheetIdBefore = app.state.props.SPREADSHEET_ID;
    app.ctx.setupSystem();
    assertEqual(app.state.props.APP_SECRET, secretBefore, 'กุญแจลับต้องไม่เปลี่ยน');
    assertEqual(app.state.props.SPREADSHEET_ID, sheetIdBefore, 'สเปรดชีตต้องไม่ถูกสร้างใหม่');
    assertEqual(app.state.triggers.length, 2, 'ทริกเกอร์ต้องไม่ซ้ำ');
    assertEqual(app.ctx.readAll_('Settings').length,
      Object.keys(app.ctx.DEFAULT_SETTINGS).length, 'ค่าตั้งต้นต้องไม่ซ้ำ');
  });

  test('ระบบที่ยังไม่ติดตั้งจะแจ้งเตือนอย่างชัดเจน', () => {
    const fresh = loadApp();
    assertThrows(() => fresh.ctx.readAll_('Requests'), 'ยังไม่ได้ติดตั้งระบบ');
  });
}

/* ==========================================================================
   2. การตรวจสอบข้อมูลของแบบฟอร์ม
   ========================================================================== */
group('2. การตรวจสอบข้อมูลแบบฟอร์ม (validation)');

{
  const app = bootstrapApp();
  const V = (payload) => app.ctx.validateRequestPayload_(payload);

  test('ข้อมูลครบถ้วนผ่านการตรวจสอบ', () => {
    const clean = V(samplePayload());
    assertEqual(clean.requesterPhone, '0812345678', 'ต้องตัดขีดออกจากเบอร์โทร');
    assertEqual(clean.deliverables.length, 2);
    assertEqual(clean.channels, 'Facebook คณะศิลปศาสตร์, เว็บไซต์คณะ');
  });

  test('ปฏิเสธอีเมลผิดรูปแบบ', () => {
    assertThrows(() => V(samplePayload({ requesterEmail: 'not-an-email' })), 'อีเมล');
  });

  test('ไม่กรอกเบอร์โทรได้ (ไม่บังคับ)', () => {
    assertEqual(V(samplePayload({ requesterPhone: '' })).requesterPhone, '');
    assertEqual(V(samplePayload({ requesterPhone: '  ' })).requesterPhone, '');
  });

  test('รายชื่อหน่วยงานครบตามเว็บไซต์คณะ แบ่งกลุ่ม และไม่ซ้ำกัน', () => {
    const groups = app.ctx.DEPARTMENT_GROUPS;
    const all = app.ctx.DEPARTMENTS;
    assertEqual(groups[0].items.length, 15, 'สาขาวิชาปริญญาตรีหลักสูตรปกติต้องมี 15 สาขา');
    assertEqual(groups[4].items.length, 22, 'สำนักงานคณะ 25 หน่วยตามหน้าบุคลากร โดยรวมหน่วยเลขานุการสาขาวิชา 4 หน่วยเป็นหน่วยเดียว');
    ['สาขาวิชาสเปนและลาตินอเมริกันศึกษา', 'สาขาวิชาภูมิศาสตร์และภูมิสารสนเทศ', 'สาขาวิชาการแปลและล่ามในยุคดิจิทัล',
      'สาขาวิชาพุทธศาสนศึกษา', 'ศูนย์การแปลราชนครินทร์', 'กลุ่มงานบัณฑิตศึกษา', 'หน่วยสื่อสารองค์กร'].forEach((d) =>
      assert(all.indexOf(d) >= 0, 'ขาด ' + d));
    assertEqual(new Set(all).size, all.length, 'ห้ามมีชื่อซ้ำ');
    assertEqual(all[all.length - 1], 'อื่น ๆ', '"อื่น ๆ" ต้องอยู่ท้ายสุด');
  });

  test('ปฏิเสธเบอร์โทรที่สั้นเกินไป', () => {
    assertThrows(() => V(samplePayload({ requesterPhone: '123' })), 'เบอร์โทรศัพท์');
  });

  test('ปฏิเสธวันที่ต้องการใช้งานที่ผ่านมาแล้ว', () => {
    assertThrows(() => V(samplePayload({ dueDate: dateStr(-3) })), 'ไม่เป็นวันที่ผ่านมาแล้ว');
  });

  test('งานด่วนต้องระบุเหตุผล', () => {
    assertThrows(() => V(samplePayload({ dueDate: dateStr(2), rushReason: '' })), 'เร่งด่วน');
    const ok = V(samplePayload({ dueDate: dateStr(2), rushReason: 'ผู้บริหารสั่งการเร่งด่วน' }));
    assertEqual(ok.rushReason, 'ผู้บริหารสั่งการเร่งด่วน');
  });

  test('ต้องยอมรับเงื่อนไขก่อนส่ง', () => {
    assertThrows(() => V(samplePayload({ acceptTerms: false })), 'ยอมรับเงื่อนไข');
  });

  test('ต้องมีชิ้นงานอย่างน้อย 1 รายการ', () => {
    assertThrows(() => V(samplePayload({ deliverables: [] })), 'ประเภทสื่อ');
  });

  test('ชิ้นงานต้องระบุขนาด', () => {
    assertThrows(() => V(samplePayload({
      deliverables: [{ mediaType: 'poster', size: '', sizeOther: '', quantity: 1 }]
    })), 'ขนาด');
  });

  test('ประเภทสื่ออื่น ๆ ต้องระบุชื่อ', () => {
    assertThrows(() => V(samplePayload({
      deliverables: [{ mediaType: 'other', mediaOther: '', size: '10x10', quantity: 1 }]
    })), 'อื่น ๆ');
  });

  test('ต้องเลือกช่องทางเผยแพร่', () => {
    assertThrows(() => V(samplePayload({ channels: [] })), 'ช่องทาง');
  });

  test('ปฏิเสธลิงก์อ้างอิงที่ไม่ใช่ http/https', () => {
    assertThrows(() => V(samplePayload({ referenceUrl: 'javascript:alert(1)' })), 'ลิงก์ตัวอย่าง');
  });

  test('รวมข้อผิดพลาดหลายข้อไว้ในข้อความเดียว', () => {
    const message = assertThrows(() => V({}), 'กรุณา');
    assert(message.split('\n').length >= 5, 'ควรแจ้งข้อผิดพลาดหลายข้อพร้อมกัน');
  });

  test('ตัดข้อความยาวเกินกำหนดแทนที่จะทำให้ระบบพัง', () => {
    const clean = V(samplePayload({ projectName: 'ก'.repeat(500) }));
    assertEqual(clean.projectName.length, 250);
  });

  test('จำกัดจำนวนชิ้นงานไม่เกิน 10 รายการ', () => {
    const many = [];
    for (let i = 0; i < 15; i++) many.push({ mediaType: 'poster', size: 'A4 (21 x 29.7 ซม.)', quantity: 1 });
    assertEqual(V(samplePayload({ deliverables: many })).deliverables.length, 10);
  });
}

/* ==========================================================================
   3. การสร้างคำขอและออกเลขที่งาน
   ========================================================================== */
group('3. การสร้างคำขอและออกเลขที่งาน');

{
  const app = bootstrapApp();
  const created = app.ctx.createRequest_(samplePayload());
  const year = app.ctx.buddhistYear_();

  test('ออกเลขที่คำขอรูปแบบ DR-ปีพ.ศ.-เลขลำดับ 4 หลัก', () => {
    assertEqual(created.jobId, 'DR-' + year + '-0001');
  });

  test('เลขที่คำขอเรียงต่อเนื่องไม่ซ้ำ', () => {
    const ids = [created.jobId];
    for (let i = 0; i < 4; i++) ids.push(app.ctx.createRequest_(samplePayload()).jobId);
    assertEqual(ids[4], 'DR-' + year + '-0005');
    assertEqual(new Set(ids).size, 5, 'เลขที่คำขอต้องไม่ซ้ำกัน');
  });

  test('บันทึกข้อมูลลงชีต Requests ครบถ้วน', () => {
    const req = app.ctx.getRequest_(created.jobId);
    assertEqual(req.status, 'NEW');
    assertEqual(req.requesterEmail, 'thitiwut@arts.tu.ac.th');
    assertEqual(req.briefStatus, 'PENDING');
    assertEqual(Number(req.revisionLimit), 3);
    assertEqual(req.submittedAt, '', 'ยังไม่ยืนยัน submittedAt ต้องว่าง');
  });

  test('บันทึกรายการชิ้นงานแยกแถวตามลำดับ', () => {
    const items = app.ctx.filterBy_('Deliverables', 'jobId', created.jobId);
    assertEqual(items.length, 2);
    assertEqual(items[0].mediaLabel, 'โปสเตอร์ประชาสัมพันธ์');
    assertEqual(Number(items[1].quantity), 2);
  });

  test('สร้างโฟลเดอร์เฉพาะของงานใน Drive', () => {
    const req = app.ctx.getRequest_(created.jobId);
    assert(!!req.folderId, 'ไม่มี folderId');
    const folder = app.state.drive.folders[req.folderId];
    assert(!!folder, 'ไม่พบโฟลเดอร์ใน Drive');
    assert(folder.getName().indexOf(created.jobId) === 0, 'ชื่อโฟลเดอร์ต้องขึ้นต้นด้วยเลขที่คำขอ');
  });

  test('บันทึกประวัติการยื่นคำขอลง Timeline', () => {
    const timeline = app.ctx.getTimeline_(created.jobId);
    assertEqual(timeline[0].action, 'CREATE');
  });

  test('คำนวณความเร่งด่วนจากกำหนดส่ง', () => {
    const urgent = app.ctx.createRequest_(samplePayload({
      dueDate: dateStr(2), rushReason: 'งานผู้บริหาร'
    }));
    assertEqual(app.ctx.getRequest_(urgent.jobId).priority, 'URGENT');
    const normal = app.ctx.createRequest_(samplePayload({ dueDate: dateStr(30) }));
    assertEqual(app.ctx.getRequest_(normal.jobId).priority, 'NORMAL');
  });

  test('สร้าง track token ที่ตรวจสอบได้และปลอมไม่ได้', () => {
    assert(app.ctx.verifyTrackToken_(created.jobId, created.trackToken), 'token ที่ถูกต้องต้องผ่าน');
    assert(!app.ctx.verifyTrackToken_(created.jobId, 'ปลอม'), 'token ปลอมต้องไม่ผ่าน');
    assert(!app.ctx.verifyTrackToken_('DR-2569-9999', created.trackToken), 'token ข้ามงานต้องไม่ผ่าน');
  });

  test('ปิดรับคำขอแล้วจะยื่นไม่ได้', () => {
    app.ctx.setSetting_('publicFormOpen', 'false');
    assertThrows(() => app.ctx.createRequest_(samplePayload()), 'ปิดรับคำขอ');
    app.ctx.setSetting_('publicFormOpen', 'true');
  });
}

/* ==========================================================================
   4. การแนบไฟล์
   ========================================================================== */
group('4. การแนบไฟล์');

{
  const app = bootstrapApp();
  const created = app.ctx.createRequest_(samplePayload());
  const b64 = Buffer.from('เนื้อหาไฟล์ทดสอบ').toString('base64');

  test('อัปโหลดไฟล์ที่ถูกต้องได้และบันทึกทะเบียน', () => {
    const res = app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'โลโก้คณะ.png', mimeType: 'image/png', dataB64: b64 }, 'source', 'user@tu.ac.th');
    assert(res.fileName.indexOf(created.jobId + '_SRC_') === 0, 'ชื่อไฟล์ต้องเป็นรูปแบบมาตรฐาน');
    assertEqual(app.ctx.filterBy_('Attachments', 'jobId', created.jobId).length, 1);
    assertEqual(Number(app.ctx.getRequest_(created.jobId).attachmentCount), 1);
  });

  test('ปฏิเสธไฟล์ชนิดที่ไม่อนุญาต', () => {
    assertThrows(() => app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'virus.exe', mimeType: 'application/octet-stream', dataB64: b64 }, 'source', 'x'),
      'ไม่รองรับไฟล์ชนิดนี้');
  });

  test('ปฏิเสธไฟล์ที่ไม่มีนามสกุล', () => {
    assertThrows(() => app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'ไฟล์ไม่มีนามสกุล', mimeType: 'text/plain', dataB64: b64 }, 'source', 'x'),
      'ไม่รองรับไฟล์ชนิดนี้');
  });

  test('ปฏิเสธไฟล์ที่ใหญ่เกินกำหนด', () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1).toString('base64');
    assertThrows(() => app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'ใหญ่มาก.pdf', mimeType: 'application/pdf', dataB64: big }, 'source', 'x'),
      'เกินกำหนด');
  });

  test('จำกัดจำนวนไฟล์แนบต่อคำขอ', () => {
    for (let i = 0; i < 7; i++) {
      app.ctx.uploadAttachment_(created.jobId,
        { fileName: 'ไฟล์' + i + '.pdf', mimeType: 'application/pdf', dataB64: b64 }, 'source', 'x');
    }
    assertThrows(() => app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'เกิน.pdf', mimeType: 'application/pdf', dataB64: b64 }, 'source', 'x'),
      'สูงสุด 8 ไฟล์');
  });

  test('ไฟล์ส่งมอบตั้งชื่อมาตรฐานและเปิดสิทธิ์ให้เปิดผ่านลิงก์', () => {
    const res = app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'artwork.pdf', mimeType: 'application/pdf', dataB64: b64 }, 'final', 'เจ้าหน้าที่');
    assert(res.fileName.indexOf(created.jobId + '_FINAL_') === 0, 'ชื่อไฟล์ส่งมอบไม่ถูกรูปแบบ');
    assert(/_01\.pdf$/.test(res.fileName), 'ต้องมีเลขลำดับต่อท้าย');
    const rec = app.ctx.filterBy_('Attachments', 'kind', 'final')[0];
    const file = app.state.drive.files[rec.fileId];
    assertEqual(file.sharing.access, 'ANYONE_WITH_LINK');
  });

  test('ลบไฟล์แล้วจำนวนไฟล์แนบลดลงและไฟล์ถูกย้ายลงถังขยะ', () => {
    const list = app.ctx.listAttachments_(created.jobId, 'source');
    const before = list.length;
    const target = list[0];
    app.ctx.deleteAttachment_(target.id, 'เจ้าหน้าที่');
    assertEqual(app.ctx.listAttachments_(created.jobId, 'source').length, before - 1);
    const fileId = Object.keys(app.state.drive.files)
      .find((id) => app.state.drive.files[id].name === target.fileName);
    assertEqual(app.state.drive.files[fileId].trashed, true);
  });

  test('อัปโหลดไฟล์เข้าเลขที่คำขอที่ไม่มีจริงไม่ได้', () => {
    assertThrows(() => app.ctx.uploadAttachment_('DR-9999-0001',
      { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: b64 }, 'source', 'x'), 'ไม่พบเลขที่คำขอ');
  });
}

/* ==========================================================================
   5. การยืนยันคำขอและอีเมล
   ========================================================================== */
group('5. การยืนยันคำขอและการส่งอีเมล');

{
  const app = bootstrapApp();
  const created = app.ctx.createRequest_(samplePayload());
  const result = app.ctx.finalizeRequest_(created.jobId);

  test('ส่งอีเมลยืนยันถึงผู้ขอและแจ้งเจ้าหน้าที่', () => {
    assertEqual(app.state.outbox.length, 2, 'ต้องส่งอีเมล 2 ฉบับ');
    const toRequester = app.state.outbox.find((m) => m.to === 'thitiwut@arts.tu.ac.th');
    assert(!!toRequester, 'ไม่พบอีเมลถึงผู้ขอรับบริการ');
    assert(toRequester.subject.indexOf(created.jobId) >= 0, 'หัวข้ออีเมลต้องมีเลขที่คำขอ');
    assert(toRequester.htmlBody.indexOf(created.jobId) >= 0, 'เนื้อหาต้องมีเลขที่คำขอ');
    const toStaff = app.state.outbox.find((m) => m.to === 'pr@arts.tu.ac.th');
    assert(!!toStaff, 'ไม่พบอีเมลแจ้งเจ้าหน้าที่');
  });

  test('อีเมลมีลิงก์ติดตามสถานะที่ถูกต้อง', () => {
    const mail = app.state.outbox[0];
    assert(mail.htmlBody.indexOf('page=track') >= 0, 'ต้องมีลิงก์ติดตาม');
    assert(mail.htmlBody.indexOf(created.trackToken) >= 0, 'ลิงก์ต้องมี token');
  });

  test('บันทึกเวลายืนยันและจำนวนไฟล์แนบ', () => {
    const req = app.ctx.getRequest_(created.jobId);
    assert(!!req.submittedAt, 'ต้องบันทึก submittedAt');
    assertEqual(result.jobId, created.jobId);
  });

  test('เรียกยืนยันซ้ำไม่ส่งอีเมลซ้ำ', () => {
    const before = app.state.outbox.length;
    const again = app.ctx.finalizeRequest_(created.jobId);
    assertEqual(again.alreadyFinalized, true);
    assertEqual(app.state.outbox.length, before, 'ต้องไม่ส่งอีเมลเพิ่ม');
  });

  test('อีเมลล้มเหลวต้องไม่ทำให้คำขอล้มเหลว', () => {
    const app2 = bootstrapApp();
    app2.ctx.MailApp.sendEmail = () => { throw new Error('quota exceeded'); };
    const c2 = app2.ctx.createRequest_(samplePayload());
    const r2 = app2.ctx.finalizeRequest_(c2.jobId);
    assertEqual(r2.jobId, c2.jobId, 'คำขอต้องยืนยันสำเร็จแม้ส่งอีเมลไม่ได้');
    const errors = app2.ctx.getTimeline_(c2.jobId).filter((t) => t.action === 'EMAIL_ERROR');
    assert(errors.length >= 1, 'ต้องบันทึกความผิดพลาดของอีเมลไว้');
  });
}

/* ==========================================================================
   6. การติดตามสถานะของผู้ขอรับบริการ
   ========================================================================== */
group('6. การติดตามสถานะ (สิทธิ์การเข้าถึง)');

{
  const app = bootstrapApp();
  const created = app.ctx.createRequest_(samplePayload());
  app.ctx.finalizeRequest_(created.jobId);

  test('เข้าถึงได้ด้วยอีเมลที่ตรงกับผู้ยื่นคำขอ', () => {
    const view = app.ctx.getPublicView_(created.jobId, 'thitiwut@arts.tu.ac.th', '');
    assert(!!view, 'ควรเข้าถึงได้');
    assertEqual(view.statusLabel, 'รับคำขอ');
    assertEqual(view.deliverables.length, 2);
  });

  test('เข้าถึงได้ด้วย token จากลิงก์ในอีเมล', () => {
    assert(!!app.ctx.getPublicView_(created.jobId, '', created.trackToken));
  });

  test('อีเมลไม่ตรงเข้าถึงไม่ได้', () => {
    assertEqual(app.ctx.getPublicView_(created.jobId, 'someone@else.com', ''), null);
  });

  test('ไม่มีทั้งอีเมลและ token เข้าถึงไม่ได้', () => {
    assertEqual(app.ctx.getPublicView_(created.jobId, '', ''), null);
  });

  test('อีเมลไม่คำนึงถึงตัวพิมพ์เล็กใหญ่', () => {
    assert(!!app.ctx.getPublicView_(created.jobId, 'THITIWUT@ARTS.TU.AC.TH', ''));
  });

  test('มุมมองสาธารณะไม่เปิดเผยข้อมูลภายใน', () => {
    const view = app.ctx.getPublicView_(created.jobId, 'thitiwut@arts.tu.ac.th', '');
    assertEqual(view.folderUrl, undefined, 'ต้องไม่เปิดเผยลิงก์โฟลเดอร์ Drive');
    assertEqual(view.briefText, undefined, 'ต้องไม่เปิดเผย Design Brief ภายใน');
    assertEqual(view.assignedTo, undefined, 'ต้องไม่เปิดเผยผู้รับผิดชอบภายใน');
  });

  test('หน้าติดตามแสดงผู้ออกแบบเฉพาะคนที่อยู่ในรายชื่อ ชื่ออื่นที่พิมพ์เองไม่แสดง', () => {
    const a2 = bootstrapApp();
    const d = a2.ctx.saveDesigner_({ name: 'ธิติวุฒิ บุญแก้ว' }).designer;
    const job = a2.ctx.createRequest_(samplePayload({ designerId: 'pool' }));
    a2.ctx.finalizeRequest_(job.jobId);
    const view = () => a2.ctx.getPublicView_(job.jobId, '', job.trackToken);
    assertEqual(view().designer, null, 'ยังไม่มอบหมายต้องไม่มีผู้ออกแบบ');
    a2.ctx.assignRequest_(job.jobId, 'ฟรีแลนซ์ภายนอก', 'x');
    assertEqual(view().designer.name, 'เจ้าหน้าที่ฝ่ายฯ', 'ชื่อที่ไม่อยู่ในรายชื่อแสดงเป็นเจ้าหน้าที่ฝ่ายฯ');
    assertEqual(JSON.stringify(view()).indexOf('ฟรีแลนซ์ภายนอก'), -1, 'ชื่อที่ไม่อยู่ในรายชื่อเป็นข้อมูลภายใน');
    a2.ctx.assignRequest_(job.jobId, 'ธิติวุฒิ  บุญแก้ว', 'x');
    assertEqual(view().designer.name, 'ธิติวุฒิ บุญแก้ว');
    assertEqual(view().designer.color, d.color);
    assertEqual(view().designer.email, undefined, 'ต้องไม่ส่งอีเมลผู้ออกแบบ');
    const tl = JSON.stringify(view().timeline);
    assertEqual(tl.indexOf('ฟรีแลนซ์ภายนอก'), -1, 'ประวัติของผู้ขอต้องไม่มีชื่อที่เจ้าหน้าที่พิมพ์เอง');
    assertEqual(tl.indexOf('มอบหมายให้'), -1, 'การมอบหมายของเจ้าหน้าที่เป็นข้อมูลภายใน');
  });

  test('ประวัติของผู้ขอยังแสดงผู้ออกแบบที่ผู้ขอเลือกเอง', () => {
    const a2 = bootstrapApp();
    const d = a2.ctx.saveDesigner_({ name: 'กนกพร ศรีสุข' }).designer;
    const job = a2.ctx.createRequest_(samplePayload({ designerId: d.id }));
    a2.ctx.finalizeRequest_(job.jobId);
    const tl = a2.ctx.getPublicView_(job.jobId, '', job.trackToken).timeline;
    assert(tl.some((t) => t.action === 'ASSIGN' && t.detail.indexOf('กนกพร ศรีสุข') >= 0));
  });

  test('บันทึกภายในไม่ปรากฏในไทม์ไลน์ของผู้ขอ', () => {
    app.ctx.addInternalNote_(created.jobId, 'ความลับภายในทีม', 'เจ้าหน้าที่');
    const view = app.ctx.getPublicView_(created.jobId, 'thitiwut@arts.tu.ac.th', '');
    const leaked = view.timeline.some((t) => (t.detail || '').indexOf('ความลับภายในทีม') >= 0);
    assert(!leaked, 'บันทึกภายในต้องไม่รั่วไปหน้าผู้ขอรับบริการ');
  });

  test('apiTrack แจ้งข้อความที่เข้าใจง่ายเมื่อไม่พบคำขอ', () => {
    const res = app.ctx.apiTrack('DR-9999-0001', 'x@y.com', '');
    assertEqual(res.ok, false);
    assert(res.error.indexOf('ไม่พบคำขอ') >= 0, 'ข้อความต้องอ่านเข้าใจง่าย');
  });
}

/* ==========================================================================
   7. การเปลี่ยนสถานะงาน
   ========================================================================== */
group('7. การเปลี่ยนสถานะงาน');

{
  const app = bootstrapApp();
  const created = app.ctx.createRequest_(samplePayload());
  app.ctx.finalizeRequest_(created.jobId);
  const jobId = created.jobId;

  test('สถานะปลายทางที่ไม่มีอยู่จริงต้องถูกปฏิเสธ', () => {
    assertThrows(() => app.ctx.changeStatus_(jobId, 'DONE', 'เจ้าหน้าที่', {}),
      'สถานะปลายทางไม่ถูกต้อง');
    assertEqual(app.ctx.getRequest_(jobId).status, 'NEW', 'สถานะต้องไม่เปลี่ยน');
  });

  test('เปลี่ยนเป็นอยู่ระหว่างออกแบบและบันทึกเวลาเริ่มงาน', () => {
    const updated = app.ctx.changeStatus_(jobId, 'DESIGNING', 'เจ้าหน้าที่', {});
    assertEqual(updated.status, 'DESIGNING');
    assert(!!updated.startedAt, 'ต้องบันทึกเวลาเริ่มงาน');
  });

  test('เปลี่ยนเป็นรอตรวจร่างต้องมีลิงก์ร่าง', () => {
    assertThrows(() => app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', {}), 'ลิงก์ร่างชิ้นงาน');
    assertThrows(() => app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่',
      { draftUrl: 'ไม่ใช่ลิงก์' }), 'http');
  });

  test('ส่งร่างให้ตรวจพร้อมบันทึกเวลาร่างแรก', () => {
    const updated = app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่',
      { draftUrl: 'https://canva.com/design/abc' });
    assertEqual(updated.status, 'REVIEW');
    assert(!!updated.firstDraftAt, 'ต้องบันทึกเวลาร่างแรก');
    assertEqual(updated.draftUrl, 'https://canva.com/design/abc');
  });

  test('ส่งอีเมลแจ้งผู้ขอทุกครั้งที่เปลี่ยนสถานะ', () => {
    const mails = app.state.outbox.filter((m) => m.to === 'thitiwut@arts.tu.ac.th');
    assert(mails.length >= 3, 'ต้องมีอีเมลแจ้งสถานะ');
    const last = mails[mails.length - 1];
    assert(last.subject.indexOf('รอตรวจร่าง') >= 0, 'หัวข้ออีเมลต้องบอกสถานะล่าสุด');
  });

  test('เปลี่ยนเป็นสถานะเดิมไม่ได้', () => {
    assertThrows(() => app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', {}), 'อยู่แล้ว');
  });

  test('ส่งมอบงานพร้อมคำนวณระยะเวลาดำเนินการ', () => {
    const updated = app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', {});
    assertEqual(updated.status, 'DELIVERED');
    assert(!!updated.deliveredAt, 'ต้องบันทึกเวลาส่งมอบ');
    assertEqual(Number(updated.leadTimeDays), 0, 'ยื่นและส่งมอบวันเดียวกันคือ 0 วัน');
  });

  test('งานที่ส่งมอบแล้วเปิดกลับมาแก้ไขได้ และล้างวันที่ส่งมอบเดิม', () => {
    const reopened = app.ctx.changeStatus_(jobId, 'REVISING', 'เจ้าหน้าที่', {});
    assertEqual(reopened.status, 'REVISING');
    assertEqual(app.ctx.str_(reopened.deliveredAt), '', 'ต้องล้างวันที่ส่งมอบเดิม');
    assertEqual(app.ctx.str_(reopened.leadTimeDays), '', 'ต้องล้างระยะเวลาดำเนินการเดิม');
    assertEqual(app.ctx.str_(reopened.closedAt), '', 'ต้องล้างวันที่ปิดงาน');
  });

  test('ยกเลิกคำขอต้องระบุเหตุผล', () => {
    const other = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(other.jobId);
    assertThrows(() => app.ctx.changeStatus_(other.jobId, 'CANCELLED', 'เจ้าหน้าที่', {}), 'เหตุผล');
    const cancelled = app.ctx.changeStatus_(other.jobId, 'CANCELLED', 'เจ้าหน้าที่',
      { cancelReason: 'ผู้ขอแจ้งยกเลิกโครงการ' });
    assertEqual(cancelled.status, 'CANCELLED');
    assertEqual(cancelled.cancelReason, 'ผู้ขอแจ้งยกเลิกโครงการ');
  });

  test('ขอข้อมูลเพิ่มเติมต้องระบุรายการที่ขาด', () => {
    const other = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(other.jobId);
    assertThrows(() => app.ctx.changeStatus_(other.jobId, 'INFO_NEEDED', 'เจ้าหน้าที่', {}), 'ข้อมูล');
    const updated = app.ctx.changeStatus_(other.jobId, 'INFO_NEEDED', 'เจ้าหน้าที่',
      { detail: 'ขอไฟล์โลโก้เวกเตอร์' });
    assertEqual(updated.status, 'INFO_NEEDED');
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assert(mail.htmlBody.indexOf('ขอไฟล์โลโก้เวกเตอร์') >= 0, 'อีเมลต้องบอกข้อมูลที่ขาด');
  });

  test('มอบหมายงานและบันทึกประวัติ', () => {
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.assignRequest_(job.jobId, 'ธิติวุฒิ บุญแก้ว', 'ผู้ดูแลระบบ');
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, 'ธิติวุฒิ บุญแก้ว');
    assert(app.ctx.getTimeline_(job.jobId).some((t) => t.action === 'ASSIGN'));
  });
}

/* ==========================================================================
   8. รอบการแก้ไขและการอนุมัติ
   ========================================================================== */
group('8. รอบการแก้ไขและการอนุมัติร่าง');

{
  const app = bootstrapApp();
  const created = app.ctx.createRequest_(samplePayload());
  app.ctx.finalizeRequest_(created.jobId);
  const jobId = created.jobId;
  const email = 'thitiwut@arts.tu.ac.th';

  app.ctx.changeStatus_(jobId, 'DESIGNING', 'เจ้าหน้าที่', {});

  test('ขอแก้ไขก่อนถึงสถานะรอตรวจร่างไม่ได้', () => {
    assertThrows(() => app.ctx.addRevision_(jobId, email, '', 'ขอแก้ไขหน่อย'), 'ยังส่งคำขอแก้ไขไม่ได้');
  });

  app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/x' });

  test('ผู้อื่นส่งคำขอแก้ไขแทนไม่ได้', () => {
    assertThrows(() => app.ctx.addRevision_(jobId, 'hacker@evil.com', '', 'ลบงานทิ้ง'), 'ไม่มีสิทธิ์');
  });

  test('ข้อความสั้นเกินไปถูกปฏิเสธ', () => {
    assertThrows(() => app.ctx.addRevision_(jobId, email, '', 'แก้'), 'รายละเอียด');
  });

  test('ขอแก้ไขรอบที่ 1 สำเร็จและเปลี่ยนสถานะเป็นกำลังแก้ไข', () => {
    const res = app.ctx.addRevision_(jobId, email, '', 'ขอแก้วันที่จาก 15 เป็น 18 ตุลาคม');
    assertEqual(res.round, 1);
    assertEqual(res.remaining, 2);
    assertEqual(app.ctx.getRequest_(jobId).status, 'REVISING');
    assertEqual(Number(app.ctx.getRequest_(jobId).revisionCount), 1);
  });

  test('แจ้งเจ้าหน้าที่ทางอีเมลเมื่อมีคำขอแก้ไข', () => {
    const mail = app.state.outbox.filter((m) => m.to === 'pr@arts.tu.ac.th').pop();
    assert(mail.subject.indexOf('ขอแก้ไขร่างรอบที่ 1') >= 0, 'หัวข้ออีเมลไม่ถูกต้อง');
  });

  test('ใช้สิทธิ์แก้ไขครบตามจำนวนที่กำหนดแล้วถูกปฏิเสธ', () => {
    for (let round = 2; round <= 3; round++) {
      app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/v' + round });
      app.ctx.addRevision_(jobId, email, '', 'ขอแก้ไขเพิ่มเติมรอบที่ ' + round);
    }
    assertEqual(Number(app.ctx.getRequest_(jobId).revisionCount), 3);
    app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/v4' });
    assertThrows(() => app.ctx.addRevision_(jobId, email, '', 'ขอแก้ไขอีกรอบหนึ่ง'), 'ครบ 3 รอบ');
  });

  test('ผู้ดูแลขยายสิทธิ์รอบแก้ไขให้เป็นกรณีพิเศษได้', () => {
    app.ctx.setRevisionLimit_(jobId, 5, 'ผู้ดูแลระบบ');
    const res = app.ctx.addRevision_(jobId, email, '', 'ขอแก้ไขรอบพิเศษหลังขยายสิทธิ์');
    assertEqual(res.round, 4);
  });

  test('ลดจำนวนรอบต่ำกว่าที่ใช้ไปแล้วไม่ได้', () => {
    assertThrows(() => app.ctx.setRevisionLimit_(jobId, 2, 'ผู้ดูแลระบบ'), 'น้อยกว่าจำนวนที่ใช้ไปแล้ว');
  });

  test('อนุมัติร่างได้เฉพาะตอนอยู่สถานะรอตรวจร่าง', () => {
    assertThrows(() => app.ctx.approveDraft_(jobId, email, ''), 'รอตรวจร่าง');
    app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/final' });
    const res = app.ctx.approveDraft_(jobId, email, '');
    assertEqual(res.approved, true);
    assert(app.ctx.getTimeline_(jobId).some((t) => t.action === 'APPROVE'), 'ต้องบันทึกการอนุมัติ');
  });

  test('ผู้ขอเห็นสิทธิ์แก้ไขคงเหลือถูกต้องในหน้าติดตาม', () => {
    const view = app.ctx.getPublicView_(jobId, email, '');
    assertEqual(view.revisionCount, 4);
    assertEqual(view.revisionLimit, 5);
    assertEqual(view.revisions.length, 4);
    // เพิ่งอนุมัติร่างไปในเทสต์ก่อนหน้า จึงต้องซ่อนปุ่มอนุมัติและปุ่มขอแก้ไข
    assertEqual(view.approved, true);
    assertEqual(view.canApprove, false, 'อนุมัติแล้วต้องไม่ให้อนุมัติซ้ำ');
    assertEqual(view.canRequestRevision, false, 'อนุมัติแล้วต้องไม่ให้ขอแก้ไขต่อ');

    // ส่งร่างใหม่ให้ตรวจ สิทธิ์ต้องกลับมา
    app.ctx.changeStatus_(jobId, 'DESIGNING', 'เจ้าหน้าที่', {});
    app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/final-2' });
    const again = app.ctx.getPublicView_(jobId, email, '');
    assertEqual(again.approved, false);
    assertEqual(again.canApprove, true);
    assertEqual(again.canRequestRevision, true);
  });
}

/* ==========================================================================
   9. Design Brief ด้วย AI
   ========================================================================== */
group('9. การสรุป Design Brief');

{
  test('เรียก Claude API ด้วยรูปแบบคำขอที่ถูกต้อง', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    const res = app.ctx.generateBrief_(created.jobId, true);

    assertEqual(res.source, 'AI');
    assertEqual(app.state.fetches.length, 1, 'ต้องเรียก API หนึ่งครั้ง');
    const call = app.state.fetches[0];
    assertEqual(call.url, 'https://api.anthropic.com/v1/messages');
    assertEqual(call.params.headers['anthropic-version'], '2023-06-01');
    assertEqual(call.params.headers['x-api-key'], 'sk-ant-test-key');
    assertEqual(call.params.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assertEqual(call.params.muteHttpExceptions, true);

    const body = JSON.parse(call.params.payload);
    assertEqual(body.model, 'claude-opus-5');
    assertEqual(body.fallbacks, 'default');
    assertEqual(body.output_config.format.type, 'json_schema');
    assertEqual(body.output_config.format.schema.additionalProperties, false);
    assertEqual(body.messages[0].role, 'user');
    assert(body.messages[0].content.indexOf(created.jobId) >= 0, 'ต้องส่งข้อมูลคำขอไปด้วย');
    assert(body.messages[0].content.indexOf('โครงการอบรมการเขียนบทความวิชาการ') >= 0);
    assert(!body.thinking, 'ไม่ควรส่ง budget_tokens หรือ thinking แบบเก่า');
  });

  test('บันทึกผลสรุปและรายการข้อมูลที่ยังขาด', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    app.ctx.generateBrief_(created.jobId, true);

    const req = app.ctx.getRequest_(created.jobId);
    assertEqual(req.briefStatus, 'DONE');
    assertEqual(req.briefSource, 'AI');
    assert(req.briefText.indexOf('วัตถุประสงค์:') >= 0, 'ต้องมีหัวข้อวัตถุประสงค์');
    assert(req.briefText.indexOf('กลุ่มเป้าหมาย:') >= 0);
    assertEqual(req.briefMissing, 'ขอไฟล์ตราสัญลักษณ์แบบเวกเตอร์');
  });

  test('ไม่มี API key ระบบยังสรุปให้อัตโนมัติได้', () => {
    const app = bootstrapApp();
    const created = app.ctx.createRequest_(samplePayload({ mandatoryText: '', eventDate: '' }));
    app.ctx.finalizeRequest_(created.jobId);
    const res = app.ctx.generateBrief_(created.jobId, true);
    assertEqual(res.source, 'AUTO');
    assertEqual(app.state.fetches.length, 0, 'ต้องไม่เรียก API');
    const req = app.ctx.getRequest_(created.jobId);
    assertEqual(req.briefStatus, 'DONE');
    assert(req.briefMissing.indexOf('ข้อความบังคับ') >= 0, 'ต้องตรวจพบข้อมูลที่ขาด');
  });

  test('API ล้มเหลวแล้วสรุปสำรองแทน ไม่ทำให้ระบบพัง', () => {
    const app = bootstrapApp({
      fetchHandler: () => ({ getResponseCode: () => 500, getContentText: () => 'server error' })
    });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    const res = app.ctx.generateBrief_(created.jobId, true);
    assertEqual(res.source, 'AUTO');
    assertEqual(app.state.fetches.length, 3, 'ต้องลองใหม่ 3 ครั้งสำหรับ error 5xx');
    assert(app.ctx.getTimeline_(created.jobId).some((t) => t.action === 'BRIEF_FALLBACK'),
      'ต้องบันทึกว่าใช้การสรุปสำรอง');
  });

  test('error 4xx ไม่ลองซ้ำ', () => {
    const app = bootstrapApp({
      fetchHandler: () => ({
        getResponseCode: () => 401,
        getContentText: () => '{"error":{"message":"invalid api key"}}'
      })
    });
    app.ctx.setAnthropicApiKey('sk-ant-bad-key');
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    app.ctx.generateBrief_(created.jobId, true);
    assertEqual(app.state.fetches.length, 1, 'error 4xx ต้องไม่ลองซ้ำ');
  });

  test('โมเดลปฏิเสธคำขอ (refusal) ใช้การสรุปสำรอง', () => {
    const app = bootstrapApp({
      fetchHandler: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'other' },
          content: []
        })
      })
    });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    const res = app.ctx.generateBrief_(created.jobId, true);
    assertEqual(res.source, 'AUTO', 'ต้องไม่ทำให้ระบบล้มเหลว');
  });

  test('ปิดการใช้ AI ในการตั้งค่าแล้วไม่เรียก API', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    app.ctx.setSetting_('aiEnabled', 'false');
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    assertEqual(app.ctx.generateBrief_(created.jobId, true).source, 'AUTO');
    assertEqual(app.state.fetches.length, 0);
  });
}

/* ==========================================================================
   10. งานเบื้องหลัง
   ========================================================================== */
group('10. งานเบื้องหลัง (workerTick)');

{
  test('สรุป Design Brief ของคำขอที่ยืนยันแล้ว', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const a = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(a.jobId);
    assertEqual(app.ctx.getRequest_(a.jobId).briefStatus, 'PENDING');
    app.ctx.workerTick();
    assertEqual(app.ctx.getRequest_(a.jobId).briefStatus, 'DONE');
  });

  test('ไม่สรุปคำขอที่ยังไม่ยืนยัน', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const a = app.ctx.createRequest_(samplePayload());
    app.ctx.workerTick();
    assertEqual(app.ctx.getRequest_(a.jobId).briefStatus, 'PENDING', 'ต้องรอการยืนยันก่อน');
  });

  test('ปิดคำขอที่ค้างเกิน 15 นาทีและเงียบไปแล้วให้อัตโนมัติ', () => {
    const app = bootstrapApp();
    const a = app.ctx.createRequest_(samplePayload());
    const row = app.ctx.getRequest_(a.jobId);
    // ยื่นมา 20 นาทีแล้วและไม่มีความเคลื่อนไหวอีกเลย
    app.ctx.update_('Requests', row._row, {
      createdAt: '2000-01-01 00:00:00',
      updatedAt: '2000-01-01 00:00:00'
    });
    app.ctx.workerTick();
    assert(!!app.ctx.getRequest_(a.jobId).submittedAt, 'ต้องปิดคำขอให้อัตโนมัติ');
    assert(app.state.outbox.length >= 1, 'ต้องส่งอีเมลยืนยันให้ด้วย');
  });

  test('ประมวลผลได้สูงสุด 3 ใบต่อรอบ กันเวลาทำงานเกินโควตา', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    for (let i = 0; i < 7; i++) {
      const job = app.ctx.createRequest_(samplePayload());
      app.ctx.finalizeRequest_(job.jobId);
    }
    app.ctx.workerTick();
    const done = app.ctx.readAll_('Requests').filter((r) => r.briefStatus === 'DONE').length;
    assertEqual(done, 3, 'หนึ่งรอบต้องทำไม่เกิน 3 ใบ เพราะ UrlFetch หนึ่งครั้งใช้เวลานาน');
    app.ctx.workerTick();
    app.ctx.workerTick();
    app.ctx.workerTick();
    assertEqual(app.ctx.readAll_('Requests').filter((r) => r.briefStatus === 'DONE').length, 7,
      'รอบถัดไปต้องทำงานที่ค้างต่อจนครบ');
  });

  test('workerTick ไม่พังเมื่อระบบยังไม่ติดตั้ง', () => {
    const fresh = loadApp();
    fresh.ctx.workerTick();
  });

  test('ตั้งทริกเกอร์ทำงานทันทีโดยไม่สะสมทริกเกอร์ค้าง', () => {
    const app = bootstrapApp();
    for (let i = 0; i < 5; i++) app.ctx.scheduleWorker_();
    const once = app.state.triggers.filter((t) => t.getHandlerFunction() === 'workerOnce');
    assertEqual(once.length, 1, 'ต้องเหลือทริกเกอร์ครั้งเดียวเพียงตัวเดียว');
  });
}

/* ==========================================================================
   11. ระบบเข้าสู่ระบบของเจ้าหน้าที่
   ========================================================================== */
group('11. ระบบเข้าสู่ระบบและสิทธิ์');

{
  const app = bootstrapApp();

  test('เข้าสู่ระบบด้วยรหัสผ่านถูกต้องได้ token', () => {
    const res = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123');
    assert(!!res.token, 'ต้องได้ token');
    assertEqual(res.user.role, 'admin');
    assert(res.token.indexOf('.') > 0, 'token ต้องมีลายเซ็น');
  });

  test('ไม่เก็บรหัสผ่านเป็นข้อความธรรมดา', () => {
    const user = app.ctx.findBy_('Users', 'email', 'pr@arts.tu.ac.th');
    assert(user.passwordHash.indexOf('SuperSecret123') < 0, 'ห้ามเก็บรหัสผ่านตรง ๆ');
    assert(user.passwordHash.length > 20, 'ค่าแฮชสั้นผิดปกติ');
    assert(!!user.salt, 'ต้องมี salt');
  });

  test('รหัสผ่านผิดเข้าไม่ได้', () => {
    assertThrows(() => app.ctx.login_('pr@arts.tu.ac.th', 'ผิดแน่นอน'), 'ไม่ถูกต้อง');
  });

  test('อีเมลที่ไม่มีในระบบเข้าไม่ได้', () => {
    assertThrows(() => app.ctx.login_('ghost@arts.tu.ac.th', 'อะไรก็ได้'), 'ไม่ถูกต้อง');
  });

  test('ล็อกบัญชีชั่วคราวเมื่อกรอกผิดเกิน 5 ครั้ง', () => {
    const app2 = bootstrapApp();
    for (let i = 0; i < 5; i++) {
      try { app2.ctx.login_('pr@arts.tu.ac.th', 'ผิด' + i); } catch (e) { /* ตามคาด */ }
    }
    assertThrows(() => app2.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123'), 'รอ 15 นาที');
  });

  test('เข้าสู่ระบบสำเร็จล้างตัวนับที่ผิดพลาด', () => {
    const app2 = bootstrapApp();
    for (let i = 0; i < 3; i++) {
      try { app2.ctx.login_('pr@arts.tu.ac.th', 'ผิด'); } catch (e) { /* ตามคาด */ }
    }
    app2.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123');
    assertEqual(app2.ctx.getLoginAttempts_('pr@arts.tu.ac.th'), 0);
  });

  test('token ที่ถูกแก้ไขใช้ไม่ได้', () => {
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    const parts = token.split('.');
    const forged = Buffer.from(JSON.stringify({
      e: 'pr@arts.tu.ac.th', n: 'ปลอม', r: 'admin', exp: Date.now() + 999999
    })).toString('base64url');
    assertEqual(app.ctx.verifyToken_(forged + '.' + parts[1]), null, 'payload ปลอมต้องไม่ผ่าน');
    assertEqual(app.ctx.verifyToken_(parts[0] + '.เซ็นปลอม'), null, 'ลายเซ็นปลอมต้องไม่ผ่าน');
    assertEqual(app.ctx.verifyToken_('ไม่ใช่ token'), null);
    assertEqual(app.ctx.verifyToken_(''), null);
  });

  test('token หมดอายุใช้ไม่ได้', () => {
    const expired = { email: 'pr@arts.tu.ac.th', name: 'ผู้ดูแล', role: 'admin' };
    const payload = app.ctx.b64url_(JSON.stringify({
      e: expired.email, n: expired.name, r: 'admin', exp: Date.now() - 1000
    }));
    const signed = payload + '.' + app.ctx.hmac_(payload, app.state.props.APP_SECRET);
    assertEqual(app.ctx.verifyToken_(signed), null);
  });

  test('บัญชีที่ถูกปิดใช้งานใช้ token เดิมต่อไม่ได้', () => {
    const app2 = bootstrapApp();
    const token = app2.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    assert(!!app2.ctx.verifyToken_(token), 'ก่อนปิดต้องใช้ได้');
    const user = app2.ctx.findBy_('Users', 'email', 'pr@arts.tu.ac.th');
    app2.ctx.update_('Users', user._row, { active: 'FALSE' });
    assertEqual(app2.ctx.verifyToken_(token), null, 'หลังปิดต้องใช้ไม่ได้');
  });

  test('เปลี่ยนรหัสผ่านต้องยืนยันรหัสผ่านเดิม', () => {
    const app2 = bootstrapApp();
    const token = app2.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    assertThrows(() => app2.ctx.changePassword_(token, 'ผิด', 'NewPassword123'), 'รหัสผ่านปัจจุบัน');
    assertThrows(() => app2.ctx.changePassword_(token, 'SuperSecret123', 'สั้น'), 'อย่างน้อย 8');
    app2.ctx.changePassword_(token, 'SuperSecret123', 'NewPassword123');
    assert(!!app2.ctx.login_('pr@arts.tu.ac.th', 'NewPassword123').token, 'รหัสใหม่ต้องใช้ได้');
    assertThrows(() => app2.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123'), 'ไม่ถูกต้อง');
  });

  test('เจ้าหน้าที่ทั่วไปเข้าหน้าตั้งค่าไม่ได้', () => {
    const app2 = bootstrapApp();
    const adminToken = app2.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    app2.ctx.saveUser_(adminToken, {
      email: 'staff@arts.tu.ac.th', name: 'เจ้าหน้าที่ทั่วไป', role: 'staff', password: 'StaffPass123'
    });
    const staffToken = app2.ctx.login_('staff@arts.tu.ac.th', 'StaffPass123').token;
    assertThrows(() => app2.ctx.listUsers_(staffToken), 'ผู้ดูแลระบบ');
    assert(Array.isArray(app2.ctx.listRequests_({})), 'แต่ต้องดูคิวงานได้');
  });

  test('ทุก API ของเจ้าหน้าที่ต้องมี token', () => {
    const endpoints = [
      () => app.ctx.apiAdminList('', {}),
      () => app.ctx.apiAdminGet('', 'DR-2569-0001'),
      () => app.ctx.apiAdminStats('', {}),
      () => app.ctx.apiAdminSettings(''),
      () => app.ctx.apiAdminUsers(''),
      () => app.ctx.apiAdminChangeStatus('', 'DR-2569-0001', 'DESIGNING', {}),
      () => app.ctx.apiAdminAssets('', {}),
      () => app.ctx.apiAdminExport('', {})
    ];
    for (const call of endpoints) {
      const res = call();
      assertEqual(res.ok, false, 'ต้องปฏิเสธเมื่อไม่มี token');
      assert(res.error.indexOf('เข้าสู่ระบบ') >= 0 || res.error.indexOf('สิทธิ์') >= 0,
        'ข้อความต้องบอกว่าต้องเข้าสู่ระบบ');
    }
  });
}

/* ==========================================================================
   12. API สาธารณะ
   ========================================================================== */
group('12. API สาธารณะและการป้องกัน');

{
  const app = bootstrapApp();

  test('apiBootstrap ส่งข้อมูลตั้งต้นครบถ้วน', () => {
    const res = app.ctx.apiBootstrap();
    assertEqual(res.ok, true);
    assert(res.data.mediaTypes.length >= 10, 'ต้องมีประเภทสื่อ');
    assert(res.data.departments.length >= 15, 'ต้องมีรายชื่อหน่วยงาน');
    assertEqual(res.data.statusFlow.length, 5, 'สถานะหลักต้องมี 5 ระดับ');
    assertEqual(res.data.settings.revisionLimit, 3);
  });

  test('apiSubmitRequest คืนรูปแบบ envelope ที่ถูกต้อง', () => {
    const res = app.ctx.apiSubmitRequest(samplePayload());
    assertEqual(res.ok, true);
    assert(!!res.data.jobId && !!res.data.trackToken);
  });

  test('apiSubmitRequest ที่ข้อมูลไม่ครบคืนข้อความภาษาไทย', () => {
    const res = app.ctx.apiSubmitRequest({ requesterName: 'ก' });
    assertEqual(res.ok, false);
    assert(res.error.indexOf('กรุณา') >= 0);
  });

  test('จำกัดการยื่นคำขอไม่เกิน 5 ครั้งต่อชั่วโมงต่ออีเมล', () => {
    const app2 = bootstrapApp();
    let lastError = '';
    for (let i = 0; i < 6; i++) {
      const res = app2.ctx.apiSubmitRequest(samplePayload());
      if (!res.ok) lastError = res.error;
    }
    assert(lastError.indexOf('ครบ 5 รายการ') >= 0, 'ต้องจำกัดจำนวนการยื่น');
  });

  test('อัปโหลดไฟล์ต้องมี track token ที่ถูกต้อง', () => {
    const created = app.ctx.apiSubmitRequest(samplePayload({
      requesterEmail: 'another@arts.tu.ac.th'
    })).data;
    const file = { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: Buffer.from('x').toString('base64') };
    assertEqual(app.ctx.apiUploadFile(created.jobId, 'token-ปลอม', file).ok, false);
    assertEqual(app.ctx.apiUploadFile(created.jobId, created.trackToken, file).ok, true);
  });

  test('อัปโหลดไฟล์เพิ่มหลังยืนยันคำขอแล้วไม่ได้', () => {
    const created = app.ctx.apiSubmitRequest(samplePayload({
      requesterEmail: 'third@arts.tu.ac.th'
    })).data;
    app.ctx.apiFinalizeRequest(created.jobId, created.trackToken);
    const res = app.ctx.apiUploadFile(created.jobId, created.trackToken,
      { fileName: 'b.pdf', mimeType: 'application/pdf', dataB64: Buffer.from('x').toString('base64') });
    assertEqual(res.ok, false);
    assert(res.error.indexOf('ยืนยันการยื่นแล้ว') >= 0);
  });

  test('ยืนยันคำขอด้วย token ปลอมไม่ได้', () => {
    const created = app.ctx.apiSubmitRequest(samplePayload({
      requesterEmail: 'fourth@arts.tu.ac.th'
    })).data;
    assertEqual(app.ctx.apiFinalizeRequest(created.jobId, 'ปลอม').ok, false);
  });

  test('ข้อผิดพลาดที่ไม่คาดคิดไม่เปิดเผยรายละเอียดภายใน', () => {
    const res = app.ctx.respond_(function () {
      throw new TypeError('Cannot read properties of undefined (reading secretInternal)');
    });
    assertEqual(res.ok, false);
    assert(res.error.indexOf('secretInternal') < 0, 'ต้องไม่เปิดเผยรายละเอียดภายใน');
    assert(res.error.indexOf('เกิดข้อผิดพลาดในระบบ') >= 0);
  });

  test('doGet คืนหน้าเว็บได้ทั้งกรณีมีและไม่มีพารามิเตอร์', () => {
    assert(!!app.ctx.doGet({ parameter: {} }), 'ต้องคืนหน้าเว็บ');
    assert(!!app.ctx.doGet({ parameter: { page: 'track', job: 'DR-2569-0001', t: 'abc' } }));
    assert(!!app.ctx.doGet(undefined), 'เรียกโดยไม่มี event object ต้องไม่พัง');
  });
}

/* ==========================================================================
   13. คิวงาน สถิติ และคลังผลงาน
   ========================================================================== */
group('13. คิวงาน สถิติ และคลังผลงาน');

{
  const app = bootstrapApp({ fetchHandler: claudeOkHandler });
  const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;

  const jobs = [];
  const setups = [
    { dueDate: dateStr(20), department: 'สาขาวิชาภาษาไทย', projectName: 'งานเปิดบ้านภาษาไทย' },
    { dueDate: dateStr(2), rushReason: 'ด่วนจากผู้บริหาร', department: 'ฝ่ายวิชาการ', projectName: 'ประชุมวิชาการ' },
    { dueDate: dateStr(15), department: 'ฝ่ายวิเทศสัมพันธ์', projectName: 'ต้อนรับคณะดูงาน' }
  ];
  for (const s of setups) {
    const job = app.ctx.createRequest_(samplePayload(s));
    app.ctx.finalizeRequest_(job.jobId);
    jobs.push(job.jobId);
  }

  // งานแรกเดินจนส่งมอบ
  app.ctx.changeStatus_(jobs[0], 'DESIGNING', 'เจ้าหน้าที่', {});
  app.ctx.changeStatus_(jobs[0], 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/a' });
  app.ctx.addRevision_(jobs[0], 'thitiwut@arts.tu.ac.th', '', 'ขอแก้ไขข้อความหัวเรื่อง');
  app.ctx.changeStatus_(jobs[0], 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/a2' });
  app.ctx.uploadAttachment_(jobs[0],
    { fileName: 'final.pdf', mimeType: 'application/pdf', dataB64: Buffer.from('pdf').toString('base64') },
    'final', 'เจ้าหน้าที่');
  app.ctx.changeStatus_(jobs[0], 'DELIVERED', 'เจ้าหน้าที่', {});
  // งานที่สองถูกตีกลับขอข้อมูลเพิ่ม
  app.ctx.changeStatus_(jobs[1], 'INFO_NEEDED', 'เจ้าหน้าที่', { detail: 'ขอไฟล์โลโก้' });

  test('กรองคิวงานตามสถานะได้', () => {
    assertEqual(app.ctx.listRequests_({ status: 'DELIVERED' }).length, 1);
    assertEqual(app.ctx.listRequests_({ status: 'NEW' }).length, 1);
    assertEqual(app.ctx.listRequests_({}).length, 3);
  });

  test('กรองตามความเร่งด่วนและค้นหาด้วยคำค้นได้', () => {
    assertEqual(app.ctx.listRequests_({ priority: 'URGENT' }).length, 1);
    assertEqual(app.ctx.listRequests_({ q: 'ภาษาไทย' }).length, 1);
    assertEqual(app.ctx.listRequests_({ q: jobs[2] }).length, 1);
    assertEqual(app.ctx.listRequests_({ q: 'ไม่มีคำนี้แน่นอน' }).length, 0);
  });

  test('คิวงานเรียงจากใหม่ไปเก่าและคำนวณวันคงเหลือ', () => {
    const rows = app.ctx.listRequests_({});
    assertEqual(rows[0].jobId, jobs[2], 'งานล่าสุดต้องอยู่บนสุด');
    const urgent = rows.find((r) => r.jobId === jobs[1]);
    assertEqual(urgent.daysLeft, 2);
    assertEqual(urgent.overdue, false);
  });

  test('งานที่เลยกำหนดถูกทำเครื่องหมายว่าเกินกำหนด', () => {
    const job = app.ctx.createRequest_(samplePayload({ dueDate: dateStr(1), rushReason: 'ด่วน' }));
    const row = app.ctx.getRequest_(job.jobId);
    app.ctx.update_('Requests', row._row, { dueDate: dateStr(-5) });
    const found = app.ctx.listRequests_({ q: job.jobId })[0];
    assertEqual(found.overdue, true);
    assertEqual(found.daysLeft, -5);
  });

  test('สถิติภาพรวมคำนวณถูกต้อง', () => {
    const stats = app.ctx.getStats_({});
    assertEqual(stats.totals.delivered, 1);
    assertEqual(stats.totals.all, 4);
    assertEqual(stats.avgRevisions, 1, 'งานที่ส่งมอบมีการแก้ไข 1 รอบ');
    assertEqual(stats.avgLeadTimeDays, 0);
    assertEqual(stats.onTimeRate, 100, 'ส่งมอบก่อนกำหนดคือตรงเวลา');
  });

  test('สถิติแยกตามประเภทสื่อและหน่วยงาน', () => {
    const stats = app.ctx.getStats_({});
    const poster = stats.byMedia.find((m) => m.label === 'โปสเตอร์ประชาสัมพันธ์');
    assertEqual(poster.count, 4, 'ทุกคำขอมีโปสเตอร์ 1 ชิ้น');
    assert(stats.byDepartment.length >= 3, 'ต้องแยกตามหน่วยงาน');
    assert(stats.byMonth.length >= 1, 'ต้องมีข้อมูลรายเดือน');
  });

  test('วัดร้อยละคำขอที่ข้อมูลครบตั้งแต่ครั้งแรก', () => {
    const stats = app.ctx.getStats_({});
    assertEqual(stats.completeOnFirstSubmit, 75, 'มี 1 ใน 4 ใบที่ถูกตีกลับขอข้อมูลเพิ่ม');
  });

  test('กรองสถิติตามช่วงวันที่ได้', () => {
    const future = app.ctx.getStats_({ from: dateStr(5), to: dateStr(10) });
    assertEqual(future.totals.all, 0, 'ช่วงวันที่ในอนาคตต้องไม่มีข้อมูล');
    const today = app.ctx.getStats_({ from: dateStr(0), to: dateStr(0) });
    assertEqual(today.totals.all, 4);
  });

  test('คลังผลงานแสดงเฉพาะงานที่ส่งมอบแล้วพร้อมไฟล์', () => {
    const assets = app.ctx.listAssetLibrary_({});
    assertEqual(assets.length, 1);
    assertEqual(assets[0].jobId, jobs[0]);
    assertEqual(assets[0].files.length, 1);
    assert(assets[0].media.indexOf('โปสเตอร์') >= 0);
  });

  test('ส่งออกข้อมูลเป็นตารางพร้อมหัวคอลัมน์ภาษาไทย', () => {
    const res = app.ctx.apiAdminExport(token, {});
    assertEqual(res.ok, true);
    assertEqual(res.data.header[0], 'เลขที่คำขอ');
    assertEqual(res.data.rows.length, 4);
  });

  test('apiAdminGet คืนข้อมูลครบสำหรับหน้าจัดการ', () => {
    const res = app.ctx.apiAdminGet(token, jobs[0]);
    assertEqual(res.ok, true);
    const d = res.data;
    assertEqual(d.request.jobId, jobs[0]);
    assertEqual(d.deliverables.length, 2);
    assertEqual(d.revisions.length, 1);
    assert(d.timeline.length >= 5, 'ต้องมีประวัติการทำงาน');
    assert(!!d.request.trackUrl, 'ต้องมีลิงก์ติดตามให้เจ้าหน้าที่ส่งต่อได้');
    assertEqual(d.request.nextStatuses.length, 0, 'งานที่ส่งมอบแล้วไม่มีขั้นถัดไปตามปกติ');
    assertEqual(d.request.statusOptions.length, 7, 'แต่ต้องมีตัวเลือกครบทุกสถานะให้เปิดงานใหม่ได้');
  });
}

/* ==========================================================================
   14. ตัวช่วยและความปลอดภัยของข้อมูล
   ========================================================================== */
group('14. ฟังก์ชันช่วยเหลือและความปลอดภัย');

{
  const app = bootstrapApp();

  test('escapeHtml_ ป้องกันการแทรกสคริปต์', () => {
    const dirty = '<script>alert("xss")</script>';
    const clean = app.ctx.escapeHtml_(dirty);
    assert(clean.indexOf('<script>') < 0, 'ต้องไม่มีแท็กสคริปต์');
    assertEqual(clean, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('ข้อมูลผู้ใช้ที่มีอักขระพิเศษถูก escape ในอีเมล', () => {
    const created = app.ctx.createRequest_(samplePayload({
      projectName: 'โครงการ <img src=x onerror=alert(1)>'
    }));
    app.ctx.finalizeRequest_(created.jobId);
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assert(mail.htmlBody.indexOf('<img src=x') < 0, 'ต้องไม่มีแท็กที่ผู้ใช้ใส่มา');
    assert(mail.htmlBody.indexOf('&lt;img') >= 0, 'ต้องถูกแปลงเป็นข้อความ');
  });

  test('safeFileName_ ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้', () => {
    assertEqual(app.ctx.safeFileName_('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
    assertEqual(app.ctx.safeFileName_('   '), 'file');
  });

  test('daysBetween_ คำนวณข้ามเดือนถูกต้อง', () => {
    assertEqual(app.ctx.daysBetween_('2026-01-30', '2026-02-02'), 3);
    assertEqual(app.ctx.daysBetween_('2026-03-01', '2026-02-28'), -1);
    assertEqual(app.ctx.daysBetween_('', '2026-01-01'), null);
  });

  test('formatThaiDate_ แปลงเป็นปี พ.ศ. ถูกต้อง', () => {
    assertEqual(app.ctx.formatThaiDate_('2026-09-07'), '7 กันยายน 2569');
    assertEqual(app.ctx.formatThaiDate_('2026-09-07 14:30:00', true), '7 กันยายน 2569 เวลา 14:30 น.');
    assertEqual(app.ctx.formatThaiDate_(''), '');
  });

  test('isValidEmail_ และ isValidPhone_ ทำงานตามคาด', () => {
    assert(app.ctx.isValidEmail_('a.b-c@arts.tu.ac.th'));
    assert(!app.ctx.isValidEmail_('a@b'));
    assert(!app.ctx.isValidEmail_('a b@c.com'));
    assert(app.ctx.isValidPhone_('081-234-5678'));
    assert(app.ctx.isValidPhone_('02 123 4567'));
    assert(!app.ctx.isValidPhone_('12345'));
  });

  test('timingSafeEqual_ เปรียบเทียบถูกต้อง', () => {
    assert(app.ctx.timingSafeEqual_('abc', 'abc'));
    assert(!app.ctx.timingSafeEqual_('abc', 'abd'));
    assert(!app.ctx.timingSafeEqual_('abc', 'abcd'));
    assert(app.ctx.timingSafeEqual_('', ''));
  });

  test('formatBytes_ แสดงขนาดไฟล์อ่านง่าย', () => {
    assertEqual(app.ctx.formatBytes_(512), '512 B');
    assertEqual(app.ctx.formatBytes_(2048), '2.0 KB');
    assertEqual(app.ctx.formatBytes_(3 * 1024 * 1024), '3.0 MB');
  });

  test('ตัวนับเลขที่งานไม่ซ้ำแม้เรียกต่อเนื่องจำนวนมาก', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(app.ctx.nextCounter_('test-counter'));
    assertEqual(seen.size, 50);
  });

  test('บันทึกและอ่านค่าตั้งค่าได้ทันที', () => {
    app.ctx.setSetting_('revisionLimit', '5');
    assertEqual(app.ctx.getSettingInt_('revisionLimit', 3), 5);
    app.ctx.setSetting_('publicFormOpen', 'false');
    assertEqual(app.ctx.getSettingBool_('publicFormOpen', true), false);
    app.ctx.setSetting_('publicFormOpen', 'true');
  });

  test('checkSystem รายงานสถานะระบบได้', () => {
    const report = app.ctx.checkSystem();
    assertEqual(report.hasSecret, true);
    assert(report.users >= 1);
    assert(report.triggers.length >= 2);
  });
}

/* ==========================================================================
   15. การป้องกันการแทรกโค้ดผ่าน URL และการแก้ลิงก์ร่าง
   ========================================================================== */
group('15. ความปลอดภัยของพารามิเตอร์ใน URL และลิงก์ร่าง');

{
  const app = bootstrapApp();

  test('พารามิเตอร์อันตรายใน URL ถูกกรองก่อนฝังในหน้าเว็บ', () => {
    const evil = '</script><script>alert(1)</script>';
    const boot = app.ctx.jsonForHtml_({
      jobId: app.ctx.sanitizeParam_(evil, /[^A-Za-z0-9-]/g, 30),
      note: evil
    });
    assert(boot.indexOf('</script>') < 0, 'ต้องไม่มีแท็กปิด script ใน JSON ที่ฝังลงหน้าเว็บ');
    assert(boot.indexOf('<') < 0, 'ต้องหลบอักขระ < ทั้งหมด');
    assert(boot.indexOf('\\u003c') >= 0, 'ต้องแปลงเป็น unicode escape');
  });

  test('sanitizeParam_ เก็บเฉพาะอักขระที่อนุญาต', () => {
    assertEqual(app.ctx.sanitizeParam_('DR-2569-0001', /[^A-Za-z0-9-]/g, 30), 'DR-2569-0001');
    assertEqual(app.ctx.sanitizeParam_('<img src=x>', /[^A-Za-z0-9-]/g, 30), 'imgsrcx');
    assertEqual(app.ctx.sanitizeParam_('ก'.repeat(100), /[^A-Za-z0-9-]/g, 30), '');
  });

  test('doGet ยอมรับเฉพาะชื่อหน้าที่มีอยู่จริง', () => {
    assert(!!app.ctx.doGet({ parameter: { page: 'javascript:alert(1)' } }), 'ต้องไม่พัง');
    assert(!!app.ctx.doGet({ parameter: { page: 'ไม่มีหน้านี้' } }));
  });

  test('แก้ไขลิงก์ร่างได้ทุกสถานะโดยไม่เปลี่ยนสถานะงาน', () => {
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    app.ctx.changeStatus_(created.jobId, 'DESIGNING', 'เจ้าหน้าที่', {});
    app.ctx.changeStatus_(created.jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/v1' });
    app.ctx.addRevision_(created.jobId, 'thitiwut@arts.tu.ac.th', '', 'ขอแก้ไขข้อความหัวเรื่อง');

    app.ctx.setDraftUrl_(created.jobId, 'https://canva.com/v2', 'เจ้าหน้าที่');
    const req = app.ctx.getRequest_(created.jobId);
    assertEqual(req.draftUrl, 'https://canva.com/v2');
    assertEqual(req.status, 'REVISING', 'ต้องไม่เปลี่ยนสถานะ');

    const updated = app.ctx.changeStatus_(created.jobId, 'REVIEW', 'เจ้าหน้าที่',
      { draftUrl: 'https://canva.com/v2' });
    assertEqual(updated.draftUrl, 'https://canva.com/v2', 'ผู้ขอต้องได้ลิงก์เวอร์ชันใหม่');
  });

  test('ลิงก์ร่างที่ไม่ถูกต้องถูกปฏิเสธ', () => {
    const created = app.ctx.createRequest_(samplePayload());
    assertThrows(() => app.ctx.setDraftUrl_(created.jobId, 'javascript:alert(1)', 'x'), 'http');
    assertThrows(() => app.ctx.setDraftUrl_('DR-9999-0001', 'https://ok.com', 'x'), 'ไม่พบเลขที่คำขอ');
  });

  test('คำขอที่ข้อมูลไม่ครบไม่ถูกนับเป็นโควตาการยื่น', () => {
    const app2 = bootstrapApp();
    for (let i = 0; i < 8; i++) {
      const res = app2.ctx.apiSubmitRequest({ requesterEmail: 'quota@arts.tu.ac.th' });
      assertEqual(res.ok, false, 'ข้อมูลไม่ครบต้องไม่ผ่าน');
    }
    const ok = app2.ctx.apiSubmitRequest(samplePayload({ requesterEmail: 'quota@arts.tu.ac.th' }));
    assertEqual(ok.ok, true, 'ยังต้องยื่นคำขอที่ถูกต้องได้');
  });

  test('apiAdminSetDraftUrl ต้องเข้าสู่ระบบก่อน', () => {
    assertEqual(app.ctx.apiAdminSetDraftUrl('', 'DR-2569-0001', 'https://a.com').ok, false);
  });
}

/* ==========================================================================
   16. ติดตั้งอัตโนมัติและการสร้างบัญชีผู้ดูแลระบบคนแรก
   ========================================================================== */
group('16. ติดตั้งอัตโนมัติเมื่อเปิดเว็บแอปครั้งแรก');

{
  test('เปิดเว็บแอปครั้งแรกแล้วระบบติดตั้งตัวเองครบถ้วน', () => {
    const app = loadApp();
    assertEqual(app.state.props.SPREADSHEET_ID, undefined, 'เริ่มต้นต้องยังไม่ติดตั้ง');
    app.ctx.doGet({ parameter: {} });
    assert(!!app.state.props.SPREADSHEET_ID, 'ต้องสร้างฐานข้อมูลให้');
    assert(!!app.state.props.ROOT_FOLDER_ID, 'ต้องสร้างโฟลเดอร์ให้');
    assert(!!app.state.props.SETUP_KEY, 'ต้องออกรหัสติดตั้ง');
    assertEqual(app.state.triggers.length, 2, 'ต้องติดตั้งทริกเกอร์ให้');
  });

  test('ส่งรหัสติดตั้งไปยังอีเมลเจ้าของสคริปต์', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    assertEqual(app.state.outbox.length, 1, 'ต้องส่งอีเมลหนึ่งฉบับ');
    const mail = app.state.outbox[0];
    assertEqual(mail.to, 'pr@arts.tu.ac.th');
    assert(mail.htmlBody.indexOf(app.state.props.SETUP_KEY) >= 0, 'อีเมลต้องมีรหัสติดตั้ง');
    assert(mail.htmlBody.indexOf('page=setup') >= 0, 'อีเมลต้องมีลิงก์ไปหน้าตั้งค่า');
  });

  test('เปิดซ้ำไม่ติดตั้งใหม่และไม่ส่งอีเมลซ้ำ', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    const sheetId = app.state.props.SPREADSHEET_ID;
    const key = app.state.props.SETUP_KEY;
    app.ctx.doGet({ parameter: {} });
    app.ctx.doGet({ parameter: { page: 'form' } });
    assertEqual(app.state.props.SPREADSHEET_ID, sheetId, 'ต้องไม่สร้างฐานข้อมูลใหม่');
    assertEqual(app.state.props.SETUP_KEY, key, 'รหัสติดตั้งต้องไม่เปลี่ยน');
    assertEqual(app.state.outbox.length, 1, 'ต้องไม่ส่งอีเมลซ้ำ');
  });

  test('apiBootstrap บอกว่ายังต้องสร้างบัญชีผู้ดูแลระบบ', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    assertEqual(app.ctx.apiBootstrap().data.needsFirstAdmin, true);
    app.ctx.createAdmin('pr@arts.tu.ac.th', 'ผู้ดูแล', 'SuperSecret123');
    assertEqual(app.ctx.apiBootstrap().data.needsFirstAdmin, false);
  });

  test('สร้างบัญชีแรกด้วยรหัสติดตั้งที่ถูกต้อง', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    const key = app.state.props.SETUP_KEY;
    const res = app.ctx.apiCreateFirstAdmin(key, 'pr@arts.tu.ac.th', 'ธิติวุฒิ บุญแก้ว', 'FirstAdmin123');
    assertEqual(res.ok, true);
    assert(!!app.ctx.login_('pr@arts.tu.ac.th', 'FirstAdmin123').token, 'ต้องเข้าสู่ระบบได้ทันที');
    assertEqual(app.ctx.findBy_('Users', 'email', 'pr@arts.tu.ac.th').role, 'admin');
  });

  test('รหัสติดตั้งผิดสร้างบัญชีไม่ได้', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    const res = app.ctx.apiCreateFirstAdmin('WRONGKEY99', 'pr@arts.tu.ac.th', 'ชื่อ', 'Password123');
    assertEqual(res.ok, false);
    assert(res.error.indexOf('รหัสติดตั้งไม่ถูกต้อง') >= 0);
    assertEqual(app.ctx.readAll_('Users').length, 0, 'ต้องไม่สร้างบัญชี');
  });

  test('รหัสติดตั้งใช้ได้ครั้งเดียว', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    const key = app.state.props.SETUP_KEY;
    app.ctx.apiCreateFirstAdmin(key, 'pr@arts.tu.ac.th', 'คนแรก', 'FirstAdmin123');
    assertEqual(app.state.props.SETUP_KEY, undefined, 'ต้องลบรหัสติดตั้งทิ้ง');
    const again = app.ctx.apiCreateFirstAdmin(key, 'hacker@evil.com', 'ผู้บุกรุก', 'Hacker12345');
    assertEqual(again.ok, false);
    assert(again.error.indexOf('มีบัญชีผู้ดูแลอยู่แล้ว') >= 0);
    assertEqual(app.ctx.readAll_('Users').length, 1, 'ต้องมีบัญชีเดียว');
  });

  test('ตรวจข้อมูลของบัญชีแรกก่อนสร้าง', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    const key = app.state.props.SETUP_KEY;
    assert(app.ctx.apiCreateFirstAdmin(key, 'ไม่ใช่อีเมล', 'ชื่อ', 'Password123').error.indexOf('อีเมล') >= 0);
    assert(app.ctx.apiCreateFirstAdmin(key, 'a@b.com', 'ชื่อ', 'สั้น').error.indexOf('8 ตัวอักษร') >= 0);
    assert(app.ctx.apiCreateFirstAdmin(key, 'a@b.com', '', 'Password123').error.indexOf('ชื่อ') >= 0);
    assertEqual(app.ctx.readAll_('Users').length, 0);
  });

  test('เพิ่มอีเมลบัญชีแรกเข้ารายชื่อผู้รับแจ้งเตือนโดยไม่ลบของเดิม', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    app.ctx.apiCreateFirstAdmin(app.state.props.SETUP_KEY, 'newpr@arts.tu.ac.th', 'ผู้ดูแล', 'FirstAdmin123');
    const notify = app.ctx.getSetting_('notifyEmails', '');
    assert(notify.indexOf('pr@arts.tu.ac.th') >= 0, 'อีเมลเดิมของฝ่ายต้องยังอยู่');
    assert(notify.indexOf('newpr@arts.tu.ac.th') >= 0, 'อีเมลบัญชีแรกต้องถูกเพิ่มเข้าไป');
    assertEqual(app.ctx.staffRecipients_().length, 2, 'ต้องแจ้งเตือนทั้งสองอีเมล');
  });

  test('createAdmin จากตัวแก้ไขก็ยกเลิกรหัสติดตั้งเช่นกัน', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    assert(!!app.state.props.SETUP_KEY);
    app.ctx.createAdmin('pr@arts.tu.ac.th', 'ผู้ดูแล', 'SuperSecret123');
    assertEqual(app.state.props.SETUP_KEY, undefined);
  });

  test('doGet ไม่พังแม้ติดตั้งอัตโนมัติล้มเหลว', () => {
    const app = loadApp();
    app.ctx.SpreadsheetApp.create = () => { throw new Error('Drive quota exceeded'); };
    assert(!!app.ctx.doGet({ parameter: {} }), 'ต้องยังคืนหน้าเว็บได้');
  });

  test('ตั้งค่า API key จากหน้าเว็บได้เฉพาะผู้ดูแลระบบ', () => {
    const app = bootstrapApp();
    const adminToken = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    app.ctx.saveUser_(adminToken, {
      email: 'staff@arts.tu.ac.th', name: 'เจ้าหน้าที่', role: 'staff', password: 'StaffPass123'
    });
    const staffToken = app.ctx.login_('staff@arts.tu.ac.th', 'StaffPass123').token;

    assertEqual(app.ctx.apiAdminSetApiKey(staffToken, 'sk-ant-abc').ok, false, 'เจ้าหน้าที่ทั่วไปต้องทำไม่ได้');
    assertEqual(app.ctx.apiAdminSetApiKey('', 'sk-ant-abc').ok, false, 'ไม่มี token ต้องทำไม่ได้');

    const bad = app.ctx.apiAdminSetApiKey(adminToken, 'คีย์มั่ว');
    assertEqual(bad.ok, false);
    assert(bad.error.indexOf('sk-ant-') >= 0, 'ต้องตรวจรูปแบบคีย์');

    const ok = app.ctx.apiAdminSetApiKey(adminToken, 'sk-ant-test-123');
    assertEqual(ok.ok, true);
    assertEqual(app.state.props.ANTHROPIC_API_KEY, 'sk-ant-test-123');
    assertEqual(app.ctx.apiAdminSettings(adminToken).data.hasApiKey, true);

    app.ctx.apiAdminSetApiKey(adminToken, '');
    assertEqual(app.state.props.ANTHROPIC_API_KEY, undefined, 'ส่งค่าว่างคือลบคีย์');
  });

  test('ไม่คืนค่า API key กลับมาที่หน้าเว็บ', () => {
    const app = bootstrapApp();
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    app.ctx.apiAdminSetApiKey(token, 'sk-ant-secret-value');
    const settings = app.ctx.apiAdminSettings(token);
    assert(JSON.stringify(settings).indexOf('sk-ant-secret-value') < 0, 'ต้องไม่ส่งคีย์กลับหน้าเว็บ');
    assertEqual(settings.data.hasApiKey, true, 'บอกได้แค่ว่ามีคีย์แล้ว');
  });
}

/* ==========================================================================
   17. ไฟล์รวมสำหรับติดตั้งด้วยการคัดลอก (dist/)
   ========================================================================== */
group('17. ไฟล์รวมสำหรับติดตั้งด้วยการคัดลอก');

{
  const bundle = require('../scripts/bundle');

  /** โหลดระบบจากไฟล์รวม dist/Code.gs แทนไฟล์แยก */
  function loadBundledApp(options) {
    const rt = createRuntime(options);
    const sandbox = Object.assign({}, rt.globals);
    sandbox.globalThis = sandbox;
    const ctx = vm.createContext(sandbox);
    const code = fs.readFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), 'utf8');
    vm.runInContext(code, ctx, { filename: 'dist/Code.gs' });
    return { ctx, state: rt.state };
  }

  test('dist/ ตรงกับซอร์สปัจจุบัน', () => {
    const stale = bundle.check();
    assertEqual(stale.join(', '), '', 'ไฟล์ที่ไม่ตรง (แก้ด้วย npm run bundle)');
  });

  test('ไฟล์รวมมีครบทุกไฟล์ที่ต้องนำขึ้น Apps Script', () => {
    const names = Object.keys(bundle.expectedFiles());
    assertEqual(names.length, 8, 'ต้องมี 8 ไฟล์');
    assert(names.indexOf('Code.gs') >= 0 && names.indexOf('appsscript.json') >= 0);
    for (const html of bundle.HTML_FILES) {
      assert(names.indexOf(html) >= 0, 'ขาดไฟล์ ' + html);
    }
  });

  test('ไฟล์รวมทำงานได้ครบวงจรเหมือนไฟล์แยก', () => {
    const app = loadBundledApp({ fetchHandler: claudeOkHandler });
    app.ctx.setupSystem();
    app.ctx.createAdmin('pr@arts.tu.ac.th', 'ผู้ดูแลระบบ', 'SuperSecret123');
    app.ctx.setAnthropicApiKey('sk-ant-test-key');

    const created = app.ctx.createRequest_(samplePayload());
    assert(/^DR-\d{4}-0001$/.test(created.jobId), 'ต้องออกเลขที่คำขอได้');
    app.ctx.uploadAttachment_(created.jobId,
      { fileName: 'logo.png', mimeType: 'image/png', dataB64: Buffer.from('x').toString('base64') },
      'source', 'ผู้ขอ');
    app.ctx.finalizeRequest_(created.jobId);
    app.ctx.workerTick();
    assertEqual(app.ctx.getRequest_(created.jobId).briefStatus, 'DONE');

    app.ctx.changeStatus_(created.jobId, 'DESIGNING', 'เจ้าหน้าที่', {});
    app.ctx.changeStatus_(created.jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/x' });
    app.ctx.addRevision_(created.jobId, 'thitiwut@arts.tu.ac.th', '', 'ขอแก้ไขข้อความหัวเรื่อง');
    app.ctx.changeStatus_(created.jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/x2' });
    app.ctx.changeStatus_(created.jobId, 'DELIVERED', 'เจ้าหน้าที่', {});

    const view = app.ctx.getPublicView_(created.jobId, 'thitiwut@arts.tu.ac.th', '');
    assertEqual(view.statusLabel, 'ส่งมอบแล้ว');
    assertEqual(view.revisionCount, 1);
    assert(!!app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token, 'เข้าสู่ระบบได้');
    assertEqual(app.ctx.getStats_({}).totals.delivered, 1);
  });

  test('ไฟล์รวมติดตั้งตัวเองได้เหมือนกัน', () => {
    const app = loadBundledApp();
    app.ctx.doGet({ parameter: {} });
    assert(!!app.state.props.SPREADSHEET_ID, 'ต้องติดตั้งฐานข้อมูลให้');
    assert(!!app.state.props.SETUP_KEY, 'ต้องออกรหัสติดตั้ง');
    assertEqual(app.state.outbox.length, 1, 'ต้องส่งอีเมลรหัสติดตั้ง');
  });
}

/* ==========================================================================
   18. การแจ้งเตือนผู้ออกแบบและลิงก์ของระบบ
   ========================================================================== */
group('18. การแจ้งเตือนผู้ออกแบบ (ผู้รับอีเมลคำขอใหม่)');

{
  test('ผู้รับแจ้งเตือนรวมอีเมลเจ้าของระบบเสมอ', () => {
    const app = bootstrapApp();
    app.ctx.setSetting_('notifyEmails', 'someone@arts.tu.ac.th');
    const to = app.ctx.staffRecipients_();
    assert(to.indexOf('pr@arts.tu.ac.th') >= 0, 'ต้องมีอีเมลเจ้าของระบบ');
    assert(to.indexOf('someone@arts.tu.ac.th') >= 0, 'ต้องมีอีเมลที่ตั้งค่าไว้ด้วย');
  });

  test('ไม่ส่งซ้ำเมื่ออีเมลซ้ำกันหรือพิมพ์ตัวใหญ่', () => {
    const app = bootstrapApp();
    app.ctx.setSetting_('notifyEmails', 'PR@ARTS.TU.AC.TH, pr@arts.tu.ac.th, ไม่ใช่อีเมล');
    const to = app.ctx.staffRecipients_();
    assertEqual(to.length, 1, 'ต้องเหลืออีเมลเดียว');
    assertEqual(to[0], 'pr@arts.tu.ac.th');
  });

  test('ปิดการแจ้งเจ้าของระบบได้ถ้าต้องการ', () => {
    const app = bootstrapApp();
    app.ctx.setSetting_('notifyEmails', 'someone@arts.tu.ac.th');
    app.ctx.setSetting_('notifyOwnerAlways', 'false');
    const to = app.ctx.staffRecipients_();
    assertEqual(to.join(','), 'someone@arts.tu.ac.th');
  });

  test('สร้างบัญชีแรกด้วยอีเมลอื่น แต่ pr@arts.tu.ac.th ยังได้รับแจ้งเตือน', () => {
    const app = loadApp();
    app.ctx.doGet({ parameter: {} });
    app.ctx.apiCreateFirstAdmin(app.state.props.SETUP_KEY,
      'mixmax040137@gmail.com', 'ผู้ดูแลระบบ', 'FirstAdmin123');

    const notify = app.ctx.getSetting_('notifyEmails', '');
    assert(notify.indexOf('pr@arts.tu.ac.th') >= 0, 'ต้องไม่ลบอีเมลเดิมของฝ่ายทิ้ง');
    assert(notify.indexOf('mixmax040137@gmail.com') >= 0, 'ต้องเพิ่มอีเมลบัญชีแรกเข้าไปด้วย');

    app.state.outbox.length = 0;
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);

    const staffMail = app.state.outbox.find(function (m) {
      return String(m.subject).indexOf('คำขอออกแบบใหม่') >= 0;
    });
    assert(!!staffMail, 'ต้องมีอีเมลแจ้งคำขอใหม่ถึงเจ้าหน้าที่');
    assert(String(staffMail.to).indexOf('pr@arts.tu.ac.th') >= 0,
      'ผู้ออกแบบที่ pr@arts.tu.ac.th ต้องได้รับอีเมลคำขอ');
    assert(String(staffMail.to).indexOf('mixmax040137@gmail.com') >= 0,
      'บัญชีผู้ดูแลก็ต้องได้รับด้วย');
  });

  test('อีเมลคำขอใหม่มีข้อมูลครบสำหรับเริ่มงาน', () => {
    const app = bootstrapApp();
    const created = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(created.jobId);
    const mail = app.state.outbox.find(function (m) { return String(m.to).indexOf('pr@arts.tu.ac.th') >= 0; });
    assert(!!mail, 'ต้องส่งถึง pr@arts.tu.ac.th');
    assert(mail.htmlBody.indexOf(created.jobId) >= 0, 'ต้องมีเลขที่คำขอ');
    assert(mail.htmlBody.indexOf('โครงการอบรมการเขียนบทความวิชาการ') >= 0, 'ต้องมีชื่อโครงการ');
    assert(mail.htmlBody.indexOf('thitiwut@arts.tu.ac.th') >= 0, 'ต้องมีอีเมลผู้ขอไว้ติดต่อกลับ');
    assert(mail.htmlBody.indexOf('โปสเตอร์ประชาสัมพันธ์') >= 0, 'ต้องมีรายการชิ้นงาน');
    assert(mail.htmlBody.indexOf('เปิดโฟลเดอร์ใน Drive') >= 0, 'ต้องมีลิงก์โฟลเดอร์งาน');
  });

  test('ส่งอีเมลทดสอบได้เฉพาะผู้ดูแลระบบ', () => {
    const app = bootstrapApp();
    const adminToken = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    app.ctx.saveUser_(adminToken, {
      email: 'staff@arts.tu.ac.th', name: 'เจ้าหน้าที่', role: 'staff', password: 'StaffPass123'
    });
    const staffToken = app.ctx.login_('staff@arts.tu.ac.th', 'StaffPass123').token;

    assertEqual(app.ctx.apiAdminTestEmail(staffToken).ok, false, 'เจ้าหน้าที่ทั่วไปต้องทำไม่ได้');
    assertEqual(app.ctx.apiAdminTestEmail('').ok, false, 'ไม่มี token ต้องทำไม่ได้');

    app.state.outbox.length = 0;
    const res = app.ctx.apiAdminTestEmail(adminToken);
    assertEqual(res.ok, true);
    assert(res.data.sentTo.indexOf('pr@arts.tu.ac.th') >= 0);
    assertEqual(app.state.outbox.length, 1);
    assert(app.state.outbox[0].subject.indexOf('ทดสอบการแจ้งเตือน') >= 0);
  });

  test('หน้าตั้งค่าคืนลิงก์ของระบบให้เจ้าหน้าที่คัดลอกได้', () => {
    const app = bootstrapApp();
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    const res = app.ctx.apiAdminSettings(token);
    assertEqual(res.ok, true);
    const links = res.data.links;
    assert(links.publicUrl.indexOf('/exec') > 0, 'ต้องมีลิงก์สาธารณะ');
    assertEqual(links.staffUrl, links.publicUrl + '?page=login');
    assert(links.spreadsheetUrl.indexOf('docs.google.com/spreadsheets') >= 0);
    assert(links.driveUrl.indexOf('drive.google.com') >= 0);
    assert(res.data.notifyTo.indexOf('pr@arts.tu.ac.th') >= 0, 'ต้องบอกว่าใครได้รับแจ้งเตือนบ้าง');
  });

  test('ไม่ปิดคำขออัตโนมัติขณะผู้ใช้ยังทยอยอัปโหลดไฟล์อยู่', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    const row = app.ctx.getRequest_(job.jobId);
    // ยื่นมานานแล้ว แต่เพิ่งอัปโหลดไฟล์เมื่อครู่นี้
    app.ctx.update_('Requests', row._row, {
      createdAt: '2000-01-01 00:00:00',
      updatedAt: app.ctx.nowIso_()
    });
    app.ctx.workerTick();
    assertEqual(app.ctx.getRequest_(job.jobId).submittedAt, '', 'ต้องรอให้อัปโหลดเสร็จก่อน');

    // พอเงียบไปนานแล้วจึงปิดให้อัตโนมัติ
    app.ctx.update_('Requests', row._row, { updatedAt: '2000-01-01 00:00:00' });
    app.ctx.workerTick();
    assert(!!app.ctx.getRequest_(job.jobId).submittedAt, 'เมื่อเงียบแล้วต้องปิดคำขอให้');
  });
}

/* ==========================================================================
   19. URL ของเว็บแอปที่ใช้ในลิงก์อีเมล
   ========================================================================== */
group('19. URL ของเว็บแอปในลิงก์อีเมล');

{
  const EXEC = 'https://script.google.com/macros/s/DEPLOYID/exec';
  const DEV = 'https://script.google.com/macros/s/DEPLOYID/dev';

  test('จดจำ URL จริงไว้ตอนมีคนเปิดเว็บแอป', () => {
    const app = loadApp({ webAppUrl: EXEC });
    assertEqual(app.state.props.WEBAPP_URL, undefined, 'เริ่มต้นต้องยังไม่มี');
    app.ctx.doGet({ parameter: {} });
    assertEqual(app.state.props.WEBAPP_URL, EXEC);
  });

  test('ไม่จดจำ URL ทดสอบที่ลงท้าย /dev', () => {
    const app = loadApp({ webAppUrl: DEV });
    app.ctx.doGet({ parameter: {} });
    assertEqual(app.state.props.WEBAPP_URL, undefined, 'ต้องไม่เก็บ URL แบบ /dev');
  });

  test('ลิงก์ติดตามในอีเมลใช้ /exec เสมอแม้ส่งจากงานเบื้องหลัง', () => {
    const app = loadApp({ webAppUrl: EXEC });
    app.ctx.doGet({ parameter: {} });
    app.ctx.createAdmin('pr@arts.tu.ac.th', 'ผู้ดูแล', 'SuperSecret123');

    const created = app.ctx.createRequest_(samplePayload());
    const row = app.ctx.getRequest_(created.jobId);
    app.ctx.update_('Requests', row._row, {
      createdAt: '2000-01-01 00:00:00', updatedAt: '2000-01-01 00:00:00'
    });

    // จำลองบริบททริกเกอร์: ScriptApp คืนค่า /dev ซึ่งผู้ขอรับบริการเปิดไม่ได้
    app.state.webAppUrl = DEV;
    app.state.outbox.length = 0;
    app.ctx.workerTick();

    const mail = app.state.outbox.find(function (m) {
      return String(m.to).indexOf('thitiwut@arts.tu.ac.th') >= 0;
    });
    assert(!!mail, 'ต้องส่งอีเมลยืนยันให้ผู้ขอ');
    assert(mail.htmlBody.indexOf('/exec?page=track') >= 0, 'ลิงก์ต้องเป็น /exec');
    assert(mail.htmlBody.indexOf('/dev?page=track') < 0, 'ต้องไม่มีลิงก์ /dev หลุดไปหาผู้ขอ');
  });

  test('showLinks รายงานลิงก์และสถานะระบบได้', () => {
    const app = loadApp({ webAppUrl: EXEC });
    app.ctx.doGet({ parameter: {} });
    app.ctx.createAdmin('pr@arts.tu.ac.th', 'ผู้ดูแล', 'SuperSecret123');
    const res = app.ctx.showLinks();
    assertEqual(res.webAppUrl, EXEC);
    const log = app.state.logs.join('\n');
    assert(log.indexOf(EXEC) >= 0, 'ต้องแสดงลิงก์ผู้ขอรับบริการ');
    assert(log.indexOf('?page=login') >= 0, 'ต้องแสดงลิงก์เจ้าหน้าที่');
    assert(log.indexOf('docs.google.com/spreadsheets') >= 0, 'ต้องแสดงลิงก์ฐานข้อมูล');
  });

  test('showLinks เตือนเมื่อยังไม่เคยมีใครเปิดเว็บแอป', () => {
    const app = loadApp({ webAppUrl: '' });
    app.ctx.setupSystem();
    app.ctx.showLinks();
    const log = app.state.logs.join('\n');
    assert(log.indexOf('ยังไม่พบ URL ของเว็บแอป') >= 0, 'ต้องบอกว่าหาไม่เจอ');
    assert(log.indexOf('Library') >= 0, 'ต้องเตือนเรื่องคัดลอกช่อง Library ผิด');
  });
}

/* ==========================================================================
   20. ลบคำขอและล้างข้อมูลทดลอง
   ========================================================================== */
group('20. ลบคำขอและล้างข้อมูลทดลอง');

{
  /** สร้างระบบพร้อมคำขอหนึ่งใบที่มีไฟล์แนบ ชิ้นงาน และประวัติครบ */
  function appWithOneJob() {
    const app = bootstrapApp();
    const adminToken = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.uploadAttachment_(job.jobId, {
      fileName: 'brief.pdf', mimeType: 'application/pdf',
      dataB64: Utilities0.base64Encode('เนื้อหาทดสอบ')
    }, 'source', 'thitiwut@arts.tu.ac.th');
    app.ctx.finalizeRequest_(job.jobId);
    return { app, adminToken, job };
  }

  const Utilities0 = loadApp().ctx.Utilities;

  test('ลบคำขอแล้วข้อมูลที่เกี่ยวข้องหายทุกชีต ไม่เหลือแถวกำพร้า', () => {
    const { app, job } = appWithOneJob();
    const before = app.ctx.readAll_('Attachments').length;
    assert(before > 0, 'ต้องมีไฟล์แนบก่อนลบ');

    const summary = app.ctx.deleteRequest_(job.jobId, 'ผู้ดูแลระบบ');
    assertEqual(summary.jobId, job.jobId);
    assert(summary.deliverables > 0, 'ต้องลบรายการชิ้นงานด้วย');
    assert(summary.attachments > 0, 'ต้องลบทะเบียนไฟล์ด้วย');

    assertEqual(app.ctx.getRequest_(job.jobId), null, 'คำขอต้องหายไปแล้ว');
    assertEqual(app.ctx.filterBy_('Deliverables', 'jobId', job.jobId).length, 0);
    assertEqual(app.ctx.filterBy_('Attachments', 'jobId', job.jobId).length, 0);
    assertEqual(app.ctx.filterBy_('Revisions', 'jobId', job.jobId).length, 0);
    assertEqual(app.ctx.filterBy_('Timeline', 'jobId', job.jobId).length, 0);
  });

  test('ลบคำขอแล้วย้ายโฟลเดอร์และไฟล์บน Drive ลงถังขยะ', () => {
    const { app, job } = appWithOneJob();
    const req = app.ctx.getRequest_(job.jobId);
    const folderId = req.folderId;
    const fileId = app.ctx.filterBy_('Attachments', 'jobId', job.jobId)[0].fileId;

    const summary = app.ctx.deleteRequest_(job.jobId, 'ผู้ดูแลระบบ');
    assertEqual(summary.folderTrashed, true, 'ต้องย้ายโฟลเดอร์ลงถังขยะ');
    assertEqual(app.state.drive.files[fileId].trashed, true, 'ไฟล์ต้องอยู่ในถังขยะ');
    assertEqual(app.state.drive.folders[folderId].trashed, true, 'โฟลเดอร์ต้องอยู่ในถังขยะ');
  });

  test('ลบคำขอที่ไม่มีอยู่จริงต้องบอกให้ชัด', () => {
    const app = bootstrapApp();
    assertThrows(() => app.ctx.deleteRequest_('DR-2569-9999', 'ผู้ดูแลระบบ'),
      'ไม่พบเลขที่คำขอ');
  });

  test('ลบคำขอผ่านหน้าเว็บได้เฉพาะผู้ดูแลระบบ', () => {
    const { app, job } = appWithOneJob();
    app.ctx.saveUser_(app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token, {
      email: 'staff@arts.tu.ac.th', name: 'เจ้าหน้าที่', role: 'staff', password: 'StaffPass123'
    });
    const staffToken = app.ctx.login_('staff@arts.tu.ac.th', 'StaffPass123').token;

    assertEqual(app.ctx.apiAdminDeleteRequest(staffToken, job.jobId, job.jobId).ok, false,
      'เจ้าหน้าที่ทั่วไปต้องลบไม่ได้');
    assertEqual(app.ctx.apiAdminDeleteRequest('', job.jobId, job.jobId).ok, false,
      'ไม่มี token ต้องลบไม่ได้');
    assert(!!app.ctx.getRequest_(job.jobId), 'คำขอต้องยังอยู่');
  });

  test('ต้องพิมพ์เลขที่คำขอให้ตรงจึงจะลบได้', () => {
    const { app, adminToken, job } = appWithOneJob();
    const wrong = app.ctx.apiAdminDeleteRequest(adminToken, job.jobId, 'DR-2569-0002');
    assertEqual(wrong.ok, false);
    assert(wrong.error.indexOf(job.jobId) >= 0, 'ต้องบอกเลขที่ที่ถูกต้องในข้อความ');
    assert(!!app.ctx.getRequest_(job.jobId), 'พิมพ์ผิดต้องไม่ลบ');

    const ok = app.ctx.apiAdminDeleteRequest(adminToken, job.jobId, job.jobId.toLowerCase());
    assertEqual(ok.ok, true, 'พิมพ์ตัวเล็กต้องยังผ่าน');
    assertEqual(app.ctx.getRequest_(job.jobId), null);
  });

  test('ล้างข้อมูลทั้งหมดแล้วเลขที่คำขอเริ่มนับใหม่จาก 0001', () => {
    const app = bootstrapApp();
    let last = '';
    for (let i = 0; i < 3; i++) last = app.ctx.createRequest_(samplePayload()).jobId;
    assert(last.indexOf('0003') > 0, 'ควรออกเลขถึงใบที่ 3 แล้ว ได้ ' + last);

    const summary = app.ctx.resetAllRequests_('ผู้ดูแลระบบ');
    assertEqual(summary.requests, 3);
    assertEqual(app.ctx.listRequests_({}).length, 0, 'คิวงานต้องว่าง');

    const fresh = app.ctx.createRequest_(samplePayload());
    assert(fresh.jobId.indexOf('0001') > 0, 'ต้องเริ่มนับใหม่ ได้ ' + fresh.jobId);
  });

  test('ล้างข้อมูลไม่แตะบัญชีผู้ใช้และค่าตั้งค่า', () => {
    const app = bootstrapApp();
    app.ctx.createRequest_(samplePayload());
    const usersBefore = app.ctx.readAll_('Users').length;
    const limitBefore = app.ctx.getSetting_('revisionLimit', '3');

    app.ctx.resetAllRequests_('ผู้ดูแลระบบ');
    assertEqual(app.ctx.readAll_('Users').length, usersBefore, 'บัญชีต้องอยู่ครบ');
    assertEqual(app.ctx.getSetting_('revisionLimit', '3'), limitBefore, 'ค่าตั้งค่าต้องไม่หาย');
    assert(!!app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token, 'ต้องยังเข้าสู่ระบบได้');
  });

  test('ล้างข้อมูลผ่านหน้าเว็บต้องพิมพ์ข้อความยืนยันให้ตรง', () => {
    const app = bootstrapApp();
    const adminToken = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    app.ctx.createRequest_(samplePayload());

    assertEqual(app.ctx.apiAdminResetData(adminToken, 'ลบ').ok, false, 'พิมพ์ไม่ตรงต้องไม่ทำงาน');
    assertEqual(app.ctx.readAll_('Requests').length, 1, 'ข้อมูลต้องยังอยู่');

    app.ctx.saveUser_(adminToken, {
      email: 'staff2@arts.tu.ac.th', name: 'เจ้าหน้าที่', role: 'staff', password: 'StaffPass123'
    });
    const staffToken = app.ctx.login_('staff2@arts.tu.ac.th', 'StaffPass123').token;
    assertEqual(app.ctx.apiAdminResetData(staffToken, 'ล้างข้อมูลทั้งหมด').ok, false,
      'เจ้าหน้าที่ทั่วไปต้องล้างข้อมูลไม่ได้');
    assertEqual(app.ctx.readAll_('Requests').length, 1);

    const ok = app.ctx.apiAdminResetData(adminToken, 'ล้างข้อมูลทั้งหมด');
    assertEqual(ok.ok, true);
    assertEqual(app.ctx.readAll_('Requests').length, 0);
  });

  test('ลบแถวในชีตเองแล้วคำขอหายจากระบบ แต่ทะเบียนไฟล์ยังค้าง', () => {
    const { app, job } = appWithOneJob();
    const sheet = app.ctx.sheet_('Requests');
    sheet.deleteRow(2);

    assertEqual(app.ctx.getRequest_(job.jobId), null, 'ลบแถวแล้วต้องหายจากระบบ');
    assert(app.ctx.filterBy_('Attachments', 'jobId', job.jobId).length > 0,
      'แต่ทะเบียนไฟล์ยังค้างอยู่ จึงควรลบผ่านระบบแทน');
  });
}

/* ==========================================================================
   21. ตรวจค่าตั้งค่าก่อนบันทึก
   ========================================================================== */
group('21. ตรวจค่าตั้งค่าก่อนบันทึก');

{
  function adminApp() {
    const app = bootstrapApp();
    return { app, token: app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token };
  }

  test('ค่าตัวเลขนอกช่วงที่ระบบรับได้ต้องถูกปฏิเสธ', () => {
    const { app, token } = adminApp();
    const cases = [
      ['maxFileMB', '0'], ['maxFileMB', '999'],
      ['maxFiles', '0'], ['maxFiles', '100'],
      ['revisionLimit', '0'], ['revisionLimit', '50'],
      ['minLeadDays', '-1'], ['slaFirstDraftDays', '0']
    ];
    for (const [key, value] of cases) {
      const patch = {};
      patch[key] = value;
      const res = app.ctx.apiAdminSaveSettings(token, patch);
      assertEqual(res.ok, false, key + ' = ' + value + ' ต้องถูกปฏิเสธ');
    }
    assertEqual(app.ctx.getSetting_('maxFileMB', '10'), '10', 'ค่าเดิมต้องไม่ถูกเปลี่ยน');
  });

  test('ค่าตัวเลขที่ไม่ใช่ตัวเลขต้องถูกปฏิเสธพร้อมบอกช่วงที่ถูกต้อง', () => {
    const { app, token } = adminApp();
    const res = app.ctx.apiAdminSaveSettings(token, { maxFileMB: 'สิบ' });
    assertEqual(res.ok, false);
    assert(res.error.indexOf('1') >= 0 && res.error.indexOf('25') >= 0,
      'ข้อความต้องบอกช่วงที่ใส่ได้ ได้ : ' + res.error);
  });

  test('ค่าตัวเลขที่อยู่ในช่วงบันทึกได้และเก็บเป็นตัวเลขล้วน', () => {
    const { app, token } = adminApp();
    const res = app.ctx.apiAdminSaveSettings(token, {
      maxFileMB: ' 15 ', maxFiles: '12', revisionLimit: '5', minLeadDays: '0'
    });
    assertEqual(res.ok, true);
    assertEqual(app.ctx.getSetting_('maxFileMB', '10'), '15');
    assertEqual(app.ctx.getSetting_('maxFiles', '8'), '12');
    assertEqual(app.ctx.getSetting_('minLeadDays', '7'), '0');
  });

  test('รายชื่ออีเมลแจ้งเตือนต้องถูกต้องและไม่ซ้ำ', () => {
    const { app, token } = adminApp();
    const bad = app.ctx.apiAdminSaveSettings(token, { notifyEmails: 'pr@arts.tu.ac.th, ไม่ใช่อีเมล' });
    assertEqual(bad.ok, false);

    const empty = app.ctx.apiAdminSaveSettings(token, { notifyEmails: '  ' });
    assertEqual(empty.ok, false, 'ห้ามเหลือศูนย์รายชื่อ เพราะจะไม่มีใครรู้ว่ามีคำขอเข้ามา');

    const ok = app.ctx.apiAdminSaveSettings(token, {
      notifyEmails: 'PR@arts.tu.ac.th, pr@arts.tu.ac.th , design@arts.tu.ac.th'
    });
    assertEqual(ok.ok, true);
    assertEqual(app.ctx.getSetting_('notifyEmails', ''), 'pr@arts.tu.ac.th, design@arts.tu.ac.th');
  });

  test('ชนิดไฟล์ที่อนุญาตต้องเป็นนามสกุลจริงและตัดจุดนำหน้าออกให้', () => {
    const { app, token } = adminApp();
    assertEqual(app.ctx.apiAdminSaveSettings(token, { allowedFileTypes: 'pdf, ไฟล์ภาพ' }).ok, false);
    assertEqual(app.ctx.apiAdminSaveSettings(token, { allowedFileTypes: ' ' }).ok, false);

    assertEqual(app.ctx.apiAdminSaveSettings(token, { allowedFileTypes: '.PDF, jpg, .jpg' }).ok, true);
    assertEqual(app.ctx.getSetting_('allowedFileTypes', ''), 'pdf,jpg');
  });

  test('ค่าเปิดปิดต้องเป็น true หรือ false เท่านั้น', () => {
    const { app, token } = adminApp();
    assertEqual(app.ctx.apiAdminSaveSettings(token, { publicFormOpen: 'เปิด' }).ok, false);
    assertEqual(app.ctx.apiAdminSaveSettings(token, { aiEnabled: true }).ok, true);
    assertEqual(app.ctx.getSetting_('aiEnabled', ''), 'true');
    assertEqual(app.ctx.apiAdminSaveSettings(token, { publicFormOpen: '0' }).ok, true);
    assertEqual(app.ctx.getSetting_('publicFormOpen', ''), 'false');
  });

  test('ค่าที่ไม่รู้จักและค่าที่มีการขึ้นบรรทัดใหม่ต้องไม่หลุดเข้าไป', () => {
    const { app, token } = adminApp();
    const res = app.ctx.apiAdminSaveSettings(token, {
      ไม่มีคีย์นี้: 'x', fromName: 'ฝ่ายสื่อสารองค์กร\nBcc: attacker@example.com'
    });
    assertEqual(res.ok, true);
    assertEqual(res.data.saved, 1, 'ต้องบันทึกเฉพาะคีย์ที่รู้จัก');
    assert(app.ctx.getSetting_('fromName', '').indexOf('\n') < 0, 'ต้องไม่มีการขึ้นบรรทัดใหม่');
  });

  test('อีเมลตอบกลับผิดรูปแบบต้องถูกปฏิเสธ แต่เว้นว่างได้', () => {
    const { app, token } = adminApp();
    assertEqual(app.ctx.apiAdminSaveSettings(token, { replyTo: 'ไม่ใช่อีเมล' }).ok, false);
    assertEqual(app.ctx.apiAdminSaveSettings(token, { replyTo: '' }).ok, true);
    assertEqual(app.ctx.getSettings_().replyTo, '', 'เว้นว่างได้ ระบบจะใช้ค่าเริ่มต้นแทน');
  });

  test('หัวข้ออีเมลไม่ถูกแทรกบรรทัดใหม่จากชื่อโครงการของผู้ขอ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload({
      projectName: 'โครงการทดสอบ\nBcc: attacker@example.com'
    }));
    app.ctx.finalizeRequest_(job.jobId);
    const mails = app.state.outbox;
    assert(mails.length > 0, 'ต้องมีอีเมลถูกส่ง');
    for (const mail of mails) {
      assert(String(mail.subject).indexOf('\n') < 0, 'หัวข้ออีเมลต้องไม่มีการขึ้นบรรทัดใหม่');
      assert(String(mail.subject).indexOf('\r') < 0, 'หัวข้ออีเมลต้องไม่มีอักขระ CR');
    }
  });
}

/* ==========================================================================
   22. เปลี่ยนสถานะได้อิสระ (ข้ามขั้น ย้อนขั้น เปิดงานใหม่)
   ========================================================================== */
group('22. เปลี่ยนสถานะได้อิสระ (ข้ามขั้น ย้อนขั้น เปิดงานใหม่)');

{
  function freshJob() {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    return { app, jobId: job.jobId };
  }
  const requester = 'thitiwut@arts.tu.ac.th';
  const mailsTo = (app) => app.state.outbox.filter((m) => m.to === requester).length;

  test('ข้ามจากรับคำขอไปส่งมอบได้ทันที พร้อมบันทึกวันที่ครบ', () => {
    const { app, jobId } = freshJob();
    const done = app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', {});
    assertEqual(done.status, 'DELIVERED');
    assert(!!app.ctx.str_(done.startedAt), 'ข้ามมาส่งมอบเลยต้องถือว่าเริ่มงานแล้ว');
    assert(!!app.ctx.str_(done.deliveredAt), 'ต้องบันทึกวันที่ส่งมอบ');
    assertEqual(Number(done.leadTimeDays), 0);
    const log = app.ctx.getTimeline_(jobId).filter((t) => t.action === 'STATUS');
    assertEqual(log.length, 1);
    assertEqual(log[0].fromStatus, 'NEW');
    assertEqual(log[0].toStatus, 'DELIVERED');
  });

  test('ข้ามไปรอตรวจร่างยังต้องมีลิงก์ร่าง เพราะผู้ขอต้องเปิดดูได้', () => {
    const { app, jobId } = freshJob();
    assertThrows(() => app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', {}), 'ลิงก์ร่างชิ้นงาน');
    const updated = app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่',
      { draftUrl: 'https://canva.com/design/xyz' });
    assertEqual(updated.status, 'REVIEW');
    assert(!!app.ctx.str_(updated.startedAt), 'ต้องบันทึกเวลาเริ่มงาน');
    assert(!!app.ctx.str_(updated.firstDraftAt), 'ต้องบันทึกเวลาร่างแรก');
  });

  test('ย้อนขั้นได้ เช่น รอตรวจร่าง กลับไปรับคำขอ', () => {
    const { app, jobId } = freshJob();
    app.ctx.changeStatus_(jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/d/1' });
    const back = app.ctx.changeStatus_(jobId, 'NEW', 'เจ้าหน้าที่', { detail: 'รอผู้ขอยืนยันข้อความอีกครั้ง' });
    assertEqual(back.status, 'NEW');
    assertEqual(back.draftUrl, 'https://canva.com/d/1', 'ลิงก์ร่างเดิมต้องยังอยู่');
  });

  test('เลือกไม่ส่งอีเมลได้เมื่อแจ้งผู้ขอโดยตรงแล้ว แต่ยังบันทึกประวัติ', () => {
    const { app, jobId } = freshJob();
    const before = mailsTo(app);
    app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', { notify: false });
    assertEqual(mailsTo(app), before, 'ต้องไม่ส่งอีเมลถึงผู้ขอ');
    assert(app.ctx.getTimeline_(jobId).some((t) => t.action === 'STATUS' && t.toStatus === 'DELIVERED'),
      'ต้องบันทึกในประวัติแม้ไม่ส่งอีเมล');
  });

  test('เปิดงานที่ส่งมอบแล้วอีกครั้ง แดชบอร์ดและคลังผลงานต้องไม่นับเป็นงานส่งมอบ', () => {
    const { app, jobId } = freshJob();
    app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', {});
    assertEqual(app.ctx.getStats_({}).totals.delivered, 1);
    assertEqual(app.ctx.listAssetLibrary_({}).length, 1);

    app.ctx.changeStatus_(jobId, 'REVISING', 'เจ้าหน้าที่', { detail: 'ผู้ขอโทรมาขอแก้วันที่' });
    assertEqual(app.ctx.getStats_({}).totals.delivered, 0, 'ต้องไม่นับเป็นส่งมอบแล้ว');
    assertEqual(app.ctx.getStats_({}).totals.active, 1, 'ต้องกลับมานับเป็นงานที่กำลังทำ');
    assertEqual(app.ctx.listAssetLibrary_({}).length, 0, 'ต้องออกจากคลังผลงานชั่วคราว');

    const again = app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', {});
    assert(!!app.ctx.str_(again.deliveredAt), 'ส่งมอบรอบใหม่ต้องบันทึกวันที่ใหม่');
    assertEqual(app.ctx.getStats_({}).totals.delivered, 1);
  });

  test('ยกเลิกงานที่ส่งมอบแล้วต้องล้างวันที่ส่งมอบและยังต้องระบุเหตุผล', () => {
    const { app, jobId } = freshJob();
    app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', {});
    assertThrows(() => app.ctx.changeStatus_(jobId, 'CANCELLED', 'เจ้าหน้าที่', {}), 'เหตุผล');
    const c = app.ctx.changeStatus_(jobId, 'CANCELLED', 'เจ้าหน้าที่', { cancelReason: 'โครงการถูกยกเลิก' });
    assertEqual(c.status, 'CANCELLED');
    assertEqual(app.ctx.str_(c.deliveredAt), '', 'งานยกเลิกต้องไม่มีวันที่ส่งมอบ');
    assertEqual(app.ctx.str_(c.leadTimeDays), '');
    assert(!!app.ctx.str_(c.closedAt), 'ต้องบันทึกวันที่ปิดงาน');
    assertEqual(app.ctx.getStats_({}).totals.cancelled, 1);
  });

  test('เปิดงานที่ยกเลิกแล้วอีกครั้งต้องล้างเหตุผลการยกเลิก', () => {
    const { app, jobId } = freshJob();
    app.ctx.changeStatus_(jobId, 'CANCELLED', 'เจ้าหน้าที่', { cancelReason: 'กดผิด' });
    const back = app.ctx.changeStatus_(jobId, 'DESIGNING', 'เจ้าหน้าที่', {});
    assertEqual(back.status, 'DESIGNING');
    assertEqual(app.ctx.str_(back.cancelReason), '', 'ต้องล้างเหตุผลการยกเลิก');
    assertEqual(app.ctx.str_(back.closedAt), '', 'ต้องล้างวันที่ปิดงาน');
    assertEqual(app.ctx.getPublicView_(jobId, requester, '').cancelReason, '',
      'หน้าติดตามของผู้ขอต้องไม่แสดงเหตุผลการยกเลิกเดิม');
  });

  test('หน้าจัดการงานได้ตัวเลือกครบทุกสถานะ แยกขั้นถัดไปกับการข้ามขั้น', () => {
    const { app, jobId } = freshJob();
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    const opts = app.ctx.apiAdminGet(token, jobId).data.request.statusOptions;
    assertEqual(opts.map((o) => o.key).join(','),
      'NEW,DESIGNING,REVIEW,REVISING,DELIVERED,INFO_NEEDED,CANCELLED', 'ต้องเรียงตามขั้นตอน');
    assertEqual(opts.filter((o) => o.kind === 'current').map((o) => o.key).join(), 'NEW');
    assertEqual(opts.filter((o) => o.kind === 'next').map((o) => o.key).sort().join(),
      ['DESIGNING', 'INFO_NEEDED', 'CANCELLED'].sort().join(), 'ขั้นถัดไปต้องตรงกับขั้นตอนปกติ');
    assertEqual(opts.filter((o) => o.kind === 'skip').map((o) => o.key).sort().join(),
      ['REVIEW', 'REVISING', 'DELIVERED'].sort().join());
    for (const o of opts) assert(!!o.label && !!o.color && !!o.icon, 'ทุกตัวเลือกต้องมีป้าย สี และไอคอน');
  });

  test('เจ้าหน้าที่ทั่วไปข้ามขั้นได้ แต่คนที่ไม่ได้เข้าสู่ระบบทำไม่ได้', () => {
    const { app, jobId } = freshJob();
    const adminToken = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    app.ctx.saveUser_(adminToken, {
      email: 'designer@arts.tu.ac.th', name: 'นักออกแบบ', role: 'staff', password: 'StaffPass123'
    });
    const staffToken = app.ctx.login_('designer@arts.tu.ac.th', 'StaffPass123').token;

    assertEqual(app.ctx.apiAdminChangeStatus('', jobId, 'DELIVERED', {}).ok, false);
    assertEqual(app.ctx.apiAdminChangeStatus('ปลอม', jobId, 'DELIVERED', {}).ok, false);
    assertEqual(app.ctx.getRequest_(jobId).status, 'NEW');

    const res = app.ctx.apiAdminChangeStatus(staffToken, jobId, 'DELIVERED', { notify: false });
    assertEqual(res.ok, true);
    assertEqual(app.ctx.getRequest_(jobId).status, 'DELIVERED');
  });

  test('ประวัติการเปลี่ยนสถานะแสดงชื่อสถานะภาษาไทย ไม่ใช่รหัส STATUS', () => {
    const { app, jobId } = freshJob();
    app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', { notify: false });
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    const row = app.ctx.apiAdminGet(token, jobId).data.timeline.filter((t) => t.action === 'STATUS')[0];
    assertEqual(row.fromLabel, 'รับคำขอ');
    assertEqual(row.toLabel, 'ส่งมอบแล้ว');
    const pub = app.ctx.getPublicView_(jobId, requester, '').timeline.filter((t) => t.action === 'STATUS')[0];
    assertEqual(pub.toLabel, 'ส่งมอบแล้ว');
  });
}

/* ==========================================================================
   23. แก้บั๊กรอบตรวจทั้งระบบ (ข้อมูลในชีต ความเร็ว และสิทธิ์)
   ========================================================================== */
group('23. แก้บั๊กรอบตรวจทั้งระบบ');

{
  const requester = 'thitiwut@arts.tu.ac.th';
  const app0 = loadApp();
  function loginAdmin(app) { return app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token; }
  function addStaff(app, email, role) {
    app.ctx.saveUser_(loginAdmin(app), { email, name: 'บัญชี ' + email, role: role || 'staff', password: 'Password123' });
    return app.ctx.login_(email, 'Password123').token;
  }

  test('เบอร์โทรที่ขึ้นต้นด้วย 0 ไม่หายเมื่อบันทึกลงชีต', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload({ requesterPhone: '095-814-4106' }));
    assertEqual(app.ctx.str_(app.ctx.getRequest_(job.jobId).requesterPhone), '0958144106');
  });

  test('ข้อความที่ขึ้นต้นด้วย - = + @ ถูกเก็บเป็นข้อความ ไม่กลายเป็นสูตรหรือ #ERROR!', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload({
      projectName: '=HYPERLINK("https://evil.example","คลิก")',
      mandatoryText: '- วันที่ 20 ตุลาคม เวลา 10.00 น.\n- ห้อง 206',
      keyMessage: '+ เปิดรับสมัครแล้ววันนี้',
      notes: '@ทีมออกแบบ ขอโทนสีส้ม'
    }));
    const r = app.ctx.getRequest_(job.jobId);
    assertEqual(r.projectName, '=HYPERLINK("https://evil.example","คลิก")');
    assertEqual(r.mandatoryText, '- วันที่ 20 ตุลาคม เวลา 10.00 น.\n- ห้อง 206');
    assertEqual(r.keyMessage, '+ เปิดรับสมัครแล้ววันนี้');
    assertEqual(r.notes, '@ทีมออกแบบ ขอโทนสีส้ม');
  });

  test('การแก้ไขค่าในแถวเดิมก็ป้องกันเหมือนกัน', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.assignRequest_(job.jobId, '-ทีมกราฟิก', 'ผู้ดูแลระบบ');
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, '-ทีมกราฟิก');
  });

  test('เบอร์โทรเดิมที่เลข 0 หายไปแล้ว แสดงผลถูกต้องทั้งในคิวงานและอีเมล', () => {
    assertEqual(app0.ctx.phoneOut_(958144106), '0958144106', 'มือถือ 10 หลัก');
    assertEqual(app0.ctx.phoneOut_(21234567), '021234567', 'โทรศัพท์บ้าน 9 หลัก');
    assertEqual(app0.ctx.phoneOut_('0812345678'), '0812345678', 'ค่าที่ถูกต้องอยู่แล้วต้องไม่เปลี่ยน');
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    const row = app.ctx.getRequest_(job.jobId);
    app.ctx.sheet_('Requests').getRange(row._row, app.ctx.COLUMNS.Requests.indexOf('requesterPhone') + 1).setValue(958144106);
    assertEqual(app.ctx.listRequests_({})[0].requesterPhone, '0958144106');
    assertEqual(app.ctx.listRequests_({ q: '0958144106' }).length, 1, 'ค้นหาด้วยเบอร์ที่มี 0 ต้องเจอ');
  });

  test('บันทึกค่าตั้งค่าแบบทั้งหมดหรือไม่บันทึกเลย เมื่อมีช่องใดผิด', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    const res = app.ctx.apiAdminSaveSettings(token, { maxFiles: '12', maxFileMB: '0', revisionLimit: '99' });
    assertEqual(res.ok, false);
    assert(res.error.indexOf('ขนาดไฟล์') >= 0 && res.error.indexOf('รอบแก้ไข') >= 0, 'ต้องบอกทุกช่องที่ผิดในครั้งเดียว');
    assertEqual(app.ctx.getSetting_('maxFiles', '8'), '8', 'ช่องที่ถูกต้องต้องยังไม่ถูกบันทึก');
  });

  test('บันทึกค่าตั้งค่าแล้วส่งค่าใหม่กลับไปให้แบบฟอร์มใช้ทันที', () => {
    const app = bootstrapApp();
    const res = app.ctx.apiAdminSaveSettings(loginAdmin(app), { maxFiles: '12', publicFormOpen: 'false' });
    assertEqual(res.ok, true);
    assertEqual(res.data.saved, 2);
    assertEqual(res.data.settings.maxFiles, 12);
    assertEqual(res.data.settings.formOpen, false);
    const again = app.ctx.apiAdminSaveSettings(loginAdmin(app), { maxFiles: '12' });
    assertEqual(again.data.saved, 0, 'ค่าที่ไม่เปลี่ยนไม่ต้องเขียนซ้ำ');
  });

  test('ความเร่งด่วนคำนวณจากวันที่เหลือจริง ไม่ค้างค่าตอนยื่นคำขอ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload({ dueDate: dateStr(30) }));
    assertEqual(app.ctx.listRequests_({})[0].priority, 'NORMAL');
    // จำลองเวลาผ่านไปจนเหลือ 2 วัน โดยเลื่อนกำหนดใช้งานในชีต (ค่าที่บันทึกยังเป็น NORMAL)
    const row = app.ctx.getRequest_(job.jobId);
    app.ctx.update_('Requests', row._row, { dueDate: dateStr(2) });
    assertEqual(app.ctx.getRequest_(job.jobId).priority, 'NORMAL', 'ค่าในชีตยังเป็นค่าเดิม');
    assertEqual(app.ctx.listRequests_({})[0].priority, 'URGENT', 'แต่คิวงานต้องแสดงตามจริง');
    assertEqual(app.ctx.listRequests_({ priority: 'URGENT' }).length, 1, 'กรองด้วยความเร่งด่วนจริง');
    const token = loginAdmin(app);
    assertEqual(app.ctx.apiAdminGet(token, job.jobId).data.request.priority, 'URGENT');
  });

  test('อนุมัติร่างซ้ำไม่แจ้งเจ้าหน้าที่ซ้ำ และขอแก้ไขหลังอนุมัติไม่ได้', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.changeStatus_(job.jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/d', notify: false });
    const staffMails = () => app.state.outbox.filter((m) => /อนุมัติร่าง/.test(m.subject)).length;

    assertEqual(app.ctx.approveDraft_(job.jobId, requester, '').approved, true);
    assertEqual(staffMails(), 1);
    const second = app.ctx.approveDraft_(job.jobId, requester, '');
    assertEqual(second.alreadyApproved, true);
    assertEqual(staffMails(), 1, 'กดซ้ำต้องไม่ส่งอีเมลซ้ำ');
    assertEqual(app.ctx.getTimeline_(job.jobId).filter((t) => t.action === 'APPROVE').length, 1);
    assertThrows(() => app.ctx.addRevision_(job.jobId, requester, '', 'ขอแก้สีพื้นหลังเป็นสีฟ้า'), 'อนุมัติร่างนี้แล้ว');
  });

  test('หน้าจัดการงานบอกว่าผู้ขออนุมัติร่างแล้ว', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.changeStatus_(job.jobId, 'REVIEW', 'เจ้าหน้าที่', { draftUrl: 'https://canva.com/d', notify: false });
    const token = loginAdmin(app);
    assertEqual(app.ctx.apiAdminGet(token, job.jobId).data.request.approved, false);
    app.ctx.approveDraft_(job.jobId, requester, '');
    const view = app.ctx.apiAdminGet(token, job.jobId).data.request;
    assertEqual(view.approved, true);
    assert(!!view.approvedAt, 'ต้องบอกเวลาที่อนุมัติ');
  });

  test('ทุกคำสั่งของเจ้าหน้าที่ส่งข้อมูลงานล่าสุดกลับมา ไม่ต้องโหลดซ้ำ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    const token = loginAdmin(app);

    const status = app.ctx.apiAdminChangeStatus(token, job.jobId, 'DESIGNING', { notify: false }).data;
    assertEqual(status.job.request.status, 'DESIGNING');
    assertEqual(status.job.row.status, 'DESIGNING', 'ต้องมีข้อมูลแถวสำหรับอัปเดตคิวงาน');

    assertEqual(app.ctx.apiAdminAssign(token, job.jobId, 'ธิติวุฒิ').data.job.row.assignedTo, 'ธิติวุฒิ');
    const note = app.ctx.apiAdminNote(token, job.jobId, 'โทรคุยกับผู้ขอแล้ว').data.job;
    assert(note.timeline.some((t) => t.detail === 'โทรคุยกับผู้ขอแล้ว'), 'บันทึกภายในต้องอยู่ในข้อมูลที่ส่งกลับ');
    assertEqual(app.ctx.apiAdminSetRevisionLimit(token, job.jobId, 5).data.job.request.revisionLimit, 5);
    assertEqual(app.ctx.apiAdminSetDraftUrl(token, job.jobId, 'https://canva.com/x').data.job.request.draftUrl,
      'https://canva.com/x');
    assertEqual(app.ctx.apiAdminRegenerateBrief(token, job.jobId).data.job.request.briefStatus, 'DONE');

    const up = app.ctx.apiAdminUploadFile(token, job.jobId, {
      fileName: 'final.pdf', mimeType: 'application/pdf', dataB64: app0.ctx.Utilities.base64Encode('pdf')
    }, 'final').data;
    const del = app.ctx.apiAdminDeleteFile(token, up.id).data;
    assertEqual(del.job.attachments.length, 0, 'ลบไฟล์แล้วข้อมูลที่ส่งกลับต้องไม่มีไฟล์นั้น');
  });

  test('ผู้ดูแลระบบลดสิทธิ์หรือปิดใช้งานบัญชีตนเองไม่ได้', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    assertThrows(() => app.ctx.saveUser_(token, {
      email: 'pr@arts.tu.ac.th', name: 'ผู้ดูแลระบบ', role: 'staff'
    }), 'ตนเอง');
    assertThrows(() => app.ctx.saveUser_(token, {
      email: 'pr@arts.tu.ac.th', name: 'ผู้ดูแลระบบ', role: 'admin', active: false
    }), 'ตนเอง');
    assertEqual(app.ctx.verifyToken_(token).role, 'admin', 'สิทธิ์ต้องไม่เปลี่ยน');
  });

  test('ระบบต้องเหลือผู้ดูแลระบบที่ใช้งานได้อย่างน้อยหนึ่งคนเสมอ', () => {
    const app = bootstrapApp();
    const admin2 = addStaff(app, 'admin2@arts.tu.ac.th', 'admin');
    // admin2 ปิดใช้งาน pr@arts ได้ เพราะยังเหลือ admin2
    app.ctx.saveUser_(admin2, { email: 'pr@arts.tu.ac.th', name: 'ผู้ดูแลระบบ', role: 'admin', active: false });
    assertEqual(app.ctx.otherActiveAdmins_('admin2@arts.tu.ac.th'), 0, 'เหลือ admin2 เป็นผู้ดูแลคนเดียว');
    // เปิด pr@arts กลับมาแต่เป็นเจ้าหน้าที่ แล้วพยายามให้เหลือศูนย์ผ่านการแก้บัญชี admin2 โดยตรงในฟังก์ชันตรวจ
    assertThrows(() => app.ctx.saveUser_(admin2, {
      email: 'admin2@arts.tu.ac.th', name: 'ผู้ดูแลคนที่สอง', role: 'staff'
    }), 'ตนเอง');
  });

  test('ผู้ดูแลระบบลดสิทธิ์ผู้ดูแลอีกคนได้ เมื่อยังเหลือผู้ดูแลอย่างน้อยหนึ่งคน', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    addStaff(app, 'admin2@arts.tu.ac.th', 'admin');
    const res = app.ctx.saveUser_(token, { email: 'admin2@arts.tu.ac.th', name: 'ผู้ดูแลคนที่สอง', role: 'staff' });
    assertEqual(res.updated, true);
  });

  test('เปลี่ยนรหัสผ่านแล้ว เซสชันเก่าบนเครื่องอื่นใช้ไม่ได้ทันที', () => {
    const app = bootstrapApp();
    const oldToken = loginAdmin(app);
    const otherDevice = loginAdmin(app);
    app.ctx.changePassword_(oldToken, 'SuperSecret123', 'NewPassword456');
    assertEqual(app.ctx.verifyToken_(otherDevice), null, 'token ที่ออกก่อนเปลี่ยนรหัสต้องใช้ไม่ได้');
    assert(!!app.ctx.verifyToken_(app.ctx.login_('pr@arts.tu.ac.th', 'NewPassword456').token), 'รหัสใหม่ต้องใช้ได้');
  });

  test('ข้อผิดพลาดเรื่องสิทธิ์มีรหัสให้หน้าเว็บแยกได้ ไม่ต้องเดาจากข้อความ', () => {
    const app = bootstrapApp();
    assertEqual(app.ctx.apiAdminList('', {}).code, 'AUTH');
    const staffToken = addStaff(app, 'staff@arts.tu.ac.th');
    assertEqual(app.ctx.apiAdminSettings(staffToken).code, 'FORBIDDEN');
    assertEqual(app.ctx.apiTrack('', '', '').code, '', 'ข้อผิดพลาดทั่วไปไม่มีรหัส');
  });

  test('สรุป Design Brief ไม่เขียนทับคำขอใบอื่น เมื่อมีการลบคำขอระหว่างรอ AI', () => {
    let app;
    let deleteDuring = '';
    const handler = function () {
      if (deleteDuring) { app.ctx.deleteRequest_(deleteDuring, 'ผู้ดูแลระบบ'); deleteDuring = ''; }
      return claudeOkHandler();
    };
    app = bootstrapApp({ fetchHandler: handler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const a = app.ctx.createRequest_(samplePayload({ projectName: 'งานใบแรก' }));
    const b = app.ctx.createRequest_(samplePayload({ projectName: 'งานใบที่สอง' }));
    const c = app.ctx.createRequest_(samplePayload({ projectName: 'งานใบที่สาม' }));
    deleteDuring = a.jobId;
    app.ctx.generateBrief_(b.jobId, true);
    assertEqual(app.ctx.getRequest_(b.jobId).briefStatus, 'DONE', 'งานใบที่สองต้องได้ผลสรุป');
    assertEqual(app.ctx.getRequest_(c.jobId).briefStatus, 'PENDING', 'งานใบที่สามต้องไม่ถูกเขียนทับ');
  });

  test('งานเบื้องหลังไม่ทำงานซ้อนกันเมื่อรอบก่อนยังไม่เสร็จ', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.CacheService.getScriptCache().put('worker:running', '1', 300);
    app.ctx.workerTick();
    assertEqual(app.ctx.getRequest_(job.jobId).briefStatus, 'PENDING', 'ต้องรอรอบถัดไป');
    app.ctx.CacheService.getScriptCache().remove('worker:running');
    app.ctx.workerTick();
    assertEqual(app.ctx.getRequest_(job.jobId).briefStatus, 'DONE');
  });

  test('ลิงก์ในอีเมลถึงเจ้าหน้าที่เปิดคำขอใบนั้นได้ทันที', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    const mail = app.state.outbox.filter((m) => /คำขอออกแบบใหม่/.test(m.subject))[0];
    assert(mail.htmlBody.indexOf('page=admin&amp;job=' + job.jobId) >= 0, 'ลิงก์ต้องพาไปที่งานใบนี้');
  });

  test('ไฟล์ส่งออกมีเบอร์โทร อีเมล ชิ้นงาน และวันที่ส่งมอบ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload({ requesterPhone: '0812345678' }));
    app.ctx.changeStatus_(job.jobId, 'DELIVERED', 'เจ้าหน้าที่', { notify: false });
    const out = app.ctx.apiAdminExport(loginAdmin(app), {}).data;
    const row = out.rows[0];
    const col = (name) => row[out.header.indexOf(name)];
    assertEqual(col('โทรศัพท์'), '0812345678');
    assertEqual(col('อีเมล'), requester);
    assert(String(col('ชิ้นงาน')).indexOf('โปสเตอร์') >= 0, 'ต้องมีรายการชิ้นงาน');
    assert(!!col('วันที่ส่งมอบ'), 'ต้องมีวันที่ส่งมอบ');
  });

  test('ลิงก์ติดตามยังใช้ได้แม้ token ในชีตเสียเพราะถูกตีความเป็นสูตร', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    const row = app.ctx.getRequest_(job.jobId);
    // จำลองแถวเก่าที่ token ขึ้นต้นด้วย - แล้ว Sheets แปลงเป็น #ERROR!
    app.ctx.sheet_('Requests').getRange(row._row, app.ctx.COLUMNS.Requests.indexOf('trackToken') + 1)
      .setValues([['#ERROR!']]);
    const url = app.ctx.buildTrackUrl_(app.ctx.getRequest_(job.jobId));
    const t = decodeURIComponent(url.split('&t=')[1]);
    assert(app.ctx.verifyTrackToken_(job.jobId, t), 'token ในลิงก์ต้องผ่านการตรวจสอบ');
    assert(!!app.ctx.getPublicView_(job.jobId, '', t), 'เปิดหน้าติดตามด้วยลิงก์นี้ได้');
  });

  test('token ที่ขึ้นต้นด้วยขีดถูกบันทึกเป็นข้อความ', () => {
    assertEqual(app0.ctx.sheetValue_('-AbC_123'), "'-AbC_123");
    assertEqual(app0.ctx.sheetValue_('AbC-123'), 'AbC-123', 'ขีดตรงกลางไม่ต้องป้องกัน');
    assertEqual(app0.ctx.sheetValue_(15), 15, 'ตัวเลขจริงคงเดิม');
    assertEqual(app0.ctx.sheetValue_('2569'), '2569', 'ตัวเลขที่ไม่ขึ้นต้นด้วย 0 ไม่ต้องป้องกัน');
  });

  test('หน้าเว็บได้ข้อมูลตั้งต้นมาพร้อมหน้าเลย ไม่ต้องเรียกเซิร์ฟเวอร์อีกรอบ', () => {
    const app = bootstrapApp();
    app.ctx.doGet({ parameter: { page: 'admin', job: 'dr-2569-0001' } });
    const boot = JSON.parse(app.state.lastTemplate.boot);
    assert(!!boot.cfg, 'ต้องมีข้อมูลตั้งต้น');
    assertEqual(boot.cfg.settings.maxFiles, 8);
    assertEqual(boot.cfg.needsFirstAdmin, false);
    assertEqual(boot.jobId, 'DR-2569-0001', 'เลขที่งานจากลิงก์อีเมลต้องส่งต่อให้หน้าเว็บ');
    assertEqual(JSON.stringify(boot.cfg).indexOf('sk-ant'), -1, 'ต้องไม่มีข้อมูลลับ');
  });
}

/* ==========================================================================
   24. ข้อจำกัดของ Google Sheets เรื่องการลบแถว
   ========================================================================== */
group('24. ลบแถวในชีตที่ยาวเกิน 1,000 แถวได้');

{
  test('ล้างข้อมูลทั้งหมดได้แม้ชีตมีข้อมูลเกิน 1,000 แถว', () => {
    const app = bootstrapApp();
    const sh = app.ctx.sheet_('Timeline');
    for (let i = 0; i < 1200; i++) app.ctx.logTimeline_('DR-2569-0001', 'ทดสอบ', 'NOTE', '', '', 'แถวที่ ' + i);
    assert(sh.getMaxRows() >= 1200, 'ชีตต้องขยายตามข้อมูล');
    const n = app.ctx.clearSheetRows_('Timeline');
    assertEqual(n, 1200);
    assertEqual(app.ctx.readAll_('Timeline').length, 0);
  });

  test('ลบแถวเดียวที่เป็นแถวข้อมูลสุดท้ายของชีตได้', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    const sh = app.ctx.sheet_('Deliverables');
    sh._maxRows = sh._data.length; // จำลองชีตที่ไม่มีแถวว่างเหลือ
    app.ctx.removeWhere_('Deliverables', 'jobId', job.jobId);
    assertEqual(app.ctx.filterBy_('Deliverables', 'jobId', job.jobId).length, 0);
  });
}

/* ==========================================================================
   25. เจ้าหน้าที่แก้ไขข้อมูลคำขอ
   ========================================================================== */
group('25. เจ้าหน้าที่แก้ไขข้อมูลคำขอ');

{
  const loginAdmin = (app) => app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
  function jobFor(app, overrides) {
    const job = app.ctx.createRequest_(samplePayload(overrides));
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.generateBrief_(job.jobId, false);
    return job.jobId;
  }

  test('เลื่อนกำหนดใช้งานแล้วบันทึกประวัติว่าเปลี่ยนจากวันไหนเป็นวันไหน', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    const res = app.ctx.editRequest_(id, { dueDate: dateStr(40) }, 'ผู้ดูแลระบบ');
    assertEqual(res.changes.length, 1);
    assertEqual(app.ctx.str_(app.ctx.getRequest_(id).dueDate).substring(0, 10), dateStr(40));
    const log = app.ctx.getTimeline_(id).filter((t) => t.action === 'EDIT')[0];
    assert(log && log.detail.indexOf('กำหนดใช้งาน จาก') >= 0, 'ต้องบอกค่าเดิมและค่าใหม่');
    assertEqual(log.actor, 'ผู้ดูแลระบบ');
  });

  test('แก้ได้แม้กำหนดใช้งานเดิมผ่านไปแล้ว และไม่บังคับเหตุผลงานด่วน', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    const row = app.ctx.getRequest_(id);
    app.ctx.update_('Requests', row._row, { dueDate: dateStr(-5) });
    const res = app.ctx.editRequest_(id, { projectName: 'ชื่อโครงการที่แก้แล้ว' }, 'ผู้ดูแลระบบ');
    assertEqual(res.changes[0].field, 'projectName');
    app.ctx.editRequest_(id, { dueDate: dateStr(1), rushReason: '' }, 'ผู้ดูแลระบบ');
  });

  test('ข้อมูลผิดรูปแบบถูกปฏิเสธเหมือนแบบฟอร์ม และไม่มีอะไรถูกบันทึก', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    assertThrows(() => app.ctx.editRequest_(id, { requesterEmail: 'ไม่ใช่อีเมล', projectName: 'ชื่อใหม่' }, 'x'), 'อีเมล');
    assertEqual(app.ctx.getRequest_(id).projectName, 'โครงการอบรมการเขียนบทความวิชาการ');
  });

  test('ไม่มีอะไรเปลี่ยนก็ไม่บันทึกประวัติ', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    const res = app.ctx.editRequest_(id, { projectName: 'โครงการอบรมการเขียนบทความวิชาการ' }, 'x');
    assertEqual(res.changes.length, 0);
    assertEqual(app.ctx.getTimeline_(id).filter((t) => t.action === 'EDIT').length, 0);
  });

  test('แก้รายการชิ้นงานได้ และสั่งสรุป Design Brief ใหม่ให้ตรงข้อมูลล่าสุด', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    assertEqual(app.ctx.getRequest_(id).briefStatus, 'DONE');
    app.ctx.editRequest_(id, { deliverables: [
      { mediaType: 'vinyl', size: '2 x 3 เมตร', quantity: 1, note: 'ติดหน้าอาคาร' },
      { mediaType: 'other', mediaOther: 'สติกเกอร์', size: '5 x 5 ซม.', quantity: 200 }
    ] }, 'ผู้ดูแลระบบ');
    const items = app.ctx.filterBy_('Deliverables', 'jobId', id);
    assertEqual(items.length, 2);
    assertEqual(items[1].mediaLabel, 'สติกเกอร์');
    assertEqual(app.ctx.getRequest_(id).briefStatus, 'PENDING', 'ต้องรอสรุปใหม่');
  });

  test('แก้เฉพาะเบอร์โทรไม่ต้องสรุป Design Brief ใหม่', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    app.ctx.editRequest_(id, { requesterPhone: '0899999999' }, 'x');
    assertEqual(app.ctx.getRequest_(id).briefStatus, 'DONE');
    assertEqual(app.ctx.str_(app.ctx.getRequest_(id).requesterPhone), '0899999999');
  });

  test('เลื่อนกำหนดใช้งานแล้วความเร่งด่วนที่บันทึกไว้ปรับตาม', () => {
    const app = bootstrapApp();
    const id = jobFor(app, { dueDate: dateStr(30) });
    app.ctx.editRequest_(id, { dueDate: dateStr(2), rushReason: 'เลื่อนงานเร็วขึ้น' }, 'x');
    assertEqual(app.ctx.getRequest_(id).priority, 'URGENT');
  });

  test('เลือกแจ้งผู้ขอทางอีเมลได้', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    const before = app.state.outbox.length;
    const res = app.ctx.editRequest_(id, { dueDate: dateStr(25) }, 'x', { notify: true });
    assertEqual(res.notified, true);
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assertEqual(app.state.outbox.length, before + 1);
    assert(/ปรับปรุงข้อมูลคำขอ/.test(mail.subject));
  });

  test('แก้ผ่านหน้าเว็บต้องเข้าสู่ระบบ และได้ข้อมูลงานล่าสุดกลับมา', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    assertEqual(app.ctx.apiAdminEditRequest('', id, { projectName: 'x' }).code, 'AUTH');
    const res = app.ctx.apiAdminEditRequest(loginAdmin(app), id, { projectName: 'ชื่อใหม่ผ่านเว็บ' }, {});
    assertEqual(res.ok, true);
    assertEqual(res.data.job.request.projectName, 'ชื่อใหม่ผ่านเว็บ');
    assertEqual(res.data.job.edit.projectName, 'ชื่อใหม่ผ่านเว็บ', 'ต้องมีข้อมูลตั้งต้นสำหรับฟอร์มแก้ไข');
  });

  test('ประวัติการแก้ไขเป็นข้อมูลภายใน ไม่แสดงในหน้าติดตามของผู้ขอ', () => {
    const app = bootstrapApp();
    const id = jobFor(app);
    app.ctx.editRequest_(id, { notes: 'โน้ตใหม่' }, 'x');
    const view = app.ctx.getPublicView_(id, 'thitiwut@arts.tu.ac.th', '');
    assert(!view.timeline.some((t) => t.action === 'EDIT'));
  });
}

/* ==========================================================================
   26. ผู้ขอตอบ "รอข้อมูลเพิ่มเติม" ผ่านระบบ
   ========================================================================== */
group('26. ผู้ขอตอบข้อมูลเพิ่มเติมผ่านระบบ');

{
  const email = 'thitiwut@arts.tu.ac.th';
  const b64 = (t) => loadApp().ctx.Utilities.base64Encode(t);
  function askInfo(app, from) {
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    if (from && from !== 'NEW') app.ctx.changeStatus_(job.jobId, from, 'เจ้าหน้าที่', { notify: false });
    app.ctx.changeStatus_(job.jobId, 'INFO_NEEDED', 'เจ้าหน้าที่', { detail: 'ขอไฟล์โลโก้เวกเตอร์', notify: false });
    return job;
  }

  test('หน้าติดตามแสดงคำถามของเจ้าหน้าที่และเปิดให้ตอบ', () => {
    const app = bootstrapApp();
    const job = askInfo(app);
    const view = app.ctx.getPublicView_(job.jobId, email, '');
    assertEqual(view.canReply, true);
    assertEqual(view.infoRequest.question, 'ขอไฟล์โลโก้เวกเตอร์');
  });

  test('ตอบพร้อมแนบไฟล์แล้วงานกลับไปสถานะเดิม และแจ้งเจ้าหน้าที่', () => {
    const app = bootstrapApp();
    const job = askInfo(app, 'DESIGNING');
    app.ctx.uploadInfoFile_(job.jobId, '', job.trackToken, { fileName: 'logo.ai', mimeType: 'application/pdf', dataB64: b64('ai') });
    const res = app.ctx.submitInfoReply_(job.jobId, '', job.trackToken, 'แนบโลโก้ให้แล้วครับ');
    assertEqual(res.status, 'DESIGNING', 'ต้องกลับไปสถานะก่อนขอข้อมูล');
    assertEqual(res.fileCount, 1);
    const reply = app.ctx.filterBy_('Replies', 'jobId', job.jobId)[0];
    assertEqual(reply.answer, 'แนบโลโก้ให้แล้วครับ');
    assertEqual(reply.question, 'ขอไฟล์โลโก้เวกเตอร์');
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assert(/ส่งข้อมูลเพิ่มเติมแล้ว/.test(mail.subject), 'ต้องแจ้งเจ้าหน้าที่');
    assert(mail.htmlBody.indexOf('logo') >= 0, 'อีเมลต้องบอกชื่อไฟล์');
  });

  test('ถ้าไม่ทราบสถานะเดิม งานกลับไปที่รับคำขอ', () => {
    const app = bootstrapApp();
    const job = askInfo(app);
    assertEqual(app.ctx.submitInfoReply_(job.jobId, email, '', 'ข้อมูลครบแล้ว').status, 'NEW');
  });

  test('ตอบได้เฉพาะตอนรอข้อมูลเพิ่มเติม และต้องมีข้อความหรือไฟล์', () => {
    const app = bootstrapApp();
    const job = askInfo(app);
    assertThrows(() => app.ctx.submitInfoReply_(job.jobId, email, '', ' '), 'แนบไฟล์');
    app.ctx.submitInfoReply_(job.jobId, email, '', 'ส่งข้อมูลแล้ว');
    assertThrows(() => app.ctx.submitInfoReply_(job.jobId, email, '', 'ส่งซ้ำ'), 'ไม่ได้อยู่ในสถานะรอข้อมูล');
    assertThrows(() => app.ctx.uploadInfoFile_(job.jobId, email, '',
      { fileName: 'a.pdf', mimeType: 'application/pdf', dataB64: b64('x') }), 'เฉพาะตอนที่เจ้าหน้าที่ขอข้อมูล');
  });

  test('คนอื่นที่ไม่มีลิงก์หรืออีเมลที่ถูกต้องตอบแทนไม่ได้', () => {
    const app = bootstrapApp();
    const job = askInfo(app);
    assertThrows(() => app.ctx.submitInfoReply_(job.jobId, 'someone@else.com', '', 'แอบตอบ'), 'ไม่มีสิทธิ์');
    assertThrows(() => app.ctx.submitInfoReply_(job.jobId, '', 'token-ปลอม', 'แอบตอบ'), 'ไม่มีสิทธิ์');
  });

  test('แนบไฟล์ได้ไม่เกินจำนวนที่กำหนดต่อการตอบหนึ่งครั้ง แม้ตอนยื่นแนบไฟล์ไปเต็มแล้ว', () => {
    const app = bootstrapApp();
    app.ctx.setSetting_('maxFiles', '2');
    const job = app.ctx.createRequest_(samplePayload());
    for (let i = 0; i < 2; i++) {
      app.ctx.uploadAttachment_(job.jobId, { fileName: 'src' + i + '.pdf', mimeType: 'application/pdf', dataB64: b64('s') }, 'source', email);
    }
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.changeStatus_(job.jobId, 'INFO_NEEDED', 'x', { detail: 'ขอเพิ่ม', notify: false });
    const up = (n) => app.ctx.uploadInfoFile_(job.jobId, email, '', { fileName: n, mimeType: 'application/pdf', dataB64: b64(n) });
    up('a.pdf'); up('b.pdf');
    assertThrows(() => up('c.pdf'), 'สูงสุด 2 ไฟล์');
  });

  test('เจ้าหน้าที่เห็นคำตอบในหน้ารายละเอียดงาน', () => {
    const app = bootstrapApp();
    const job = askInfo(app);
    app.ctx.submitInfoReply_(job.jobId, email, '', 'คำตอบของผู้ขอ');
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    const view = app.ctx.apiAdminGet(token, job.jobId).data;
    assertEqual(view.replies.length, 1);
    assertEqual(view.replies[0].answer, 'คำตอบของผู้ขอ');
    assertEqual(view.replies[0].returnedToLabel, 'รับคำขอ');
  });

  test('อีเมลขอข้อมูลเพิ่มเติมมีปุ่มให้ตอบผ่านระบบ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.changeStatus_(job.jobId, 'INFO_NEEDED', 'x', { detail: 'ขอวันจัดงาน' });
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assert(mail.htmlBody.indexOf('ตอบและแนบไฟล์') >= 0);
    assert(mail.htmlBody.indexOf('page=track') >= 0);
  });

  test('ผ่าน API ได้ทั้งการแนบไฟล์และการตอบ', () => {
    const app = bootstrapApp();
    const job = askInfo(app);
    assertEqual(app.ctx.apiInfoUpload(job.jobId, email, '', { fileName: 'x.pdf', mimeType: 'application/pdf', dataB64: b64('x') }).ok, true);
    const res = app.ctx.apiInfoReply(job.jobId, email, '', 'ส่งแล้ว');
    assertEqual(res.ok, true);
    assertEqual(res.data.fileCount, 1);
  });
}

/* ==========================================================================
   27. กำหนดส่งร่างแรกตามเงื่อนไขบริการ
   ========================================================================== */
group('27. กำหนดส่งร่างแรก (SLA)');

{
  test('บวกวันทำการข้ามเสาร์อาทิตย์', () => {
    const app = loadApp();
    // ศุกร์ 6 พ.ย. 2569 + 1 วันทำการ = จันทร์ 9 พ.ย.
    const d = app.ctx.addBusinessDays_('2026-11-06', 1);
    assertEqual(app.ctx.Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd'), '2026-11-09');
    const d5 = app.ctx.addBusinessDays_('2026-11-06', 5);
    assertEqual(app.ctx.Utilities.formatDate(d5, 'Asia/Bangkok', 'yyyy-MM-dd'), '2026-11-13');
  });

  test('คิวงานบอกกำหนดส่งร่างแรก และหายไปเมื่อส่งร่างแล้ว', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    const row = app.ctx.listRequests_({})[0];
    assert(!!row.draftDue, 'ต้องมีกำหนดส่งร่างแรก');
    assert(row.draftDaysLeft >= 5, 'ยังเหลืออย่างน้อย 5 วันปฏิทิน');
    assertEqual(row.draftOverdue, false);
    app.ctx.changeStatus_(job.jobId, 'REVIEW', 'x', { draftUrl: 'https://canva.com/a', notify: false });
    assertEqual(app.ctx.listRequests_({})[0].draftDue, '', 'ส่งร่างแล้วไม่ต้องแสดง');
  });

  test('เกินกำหนดส่งร่างแรกถูกแจ้งในคิวงานและอีเมลสรุปประจำวัน', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    const row = app.ctx.getRequest_(job.jobId);
    app.ctx.update_('Requests', row._row, { submittedAt: dateStr(-20) + ' 09:00:00' });
    assertEqual(app.ctx.listRequests_({})[0].draftOverdue, true);
    app.ctx.dailyReminder();
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assert(mail.htmlBody.indexOf('เกินกำหนดส่งร่างแรก') >= 0, 'อีเมลสรุปต้องมีหัวข้อร่างแรกเกินกำหนด');
  });

  test('ระหว่างรอข้อมูลเพิ่มเติมไม่นับ และเริ่มนับใหม่เมื่อผู้ขอตอบ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.finalizeRequest_(job.jobId);
    const row = app.ctx.getRequest_(job.jobId);
    app.ctx.update_('Requests', row._row, { submittedAt: dateStr(-20) + ' 09:00:00' });
    app.ctx.changeStatus_(job.jobId, 'INFO_NEEDED', 'x', { detail: 'ขอข้อมูล', notify: false });
    assertEqual(app.ctx.listRequests_({})[0].draftDue, '', 'รอข้อมูลอยู่ไม่ต้องนับ');
    app.ctx.submitInfoReply_(job.jobId, 'thitiwut@arts.tu.ac.th', '', 'ส่งข้อมูลแล้ว');
    const after = app.ctx.listRequests_({})[0];
    assertEqual(after.draftOverdue, false, 'นับใหม่จากวันที่ข้อมูลครบ');
    assert(after.draftDaysLeft >= 5);
  });
}

/* ==========================================================================
   28. ประเมินความพึงพอใจหลังส่งมอบ
   ========================================================================== */
group('28. ประเมินความพึงพอใจ');

{
  const email = 'thitiwut@arts.tu.ac.th';
  function delivered(app, overrides) {
    const job = app.ctx.createRequest_(samplePayload(overrides));
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.changeStatus_(job.jobId, 'DELIVERED', 'x', { notify: false });
    return job;
  }

  test('ประเมินได้หลังส่งมอบเท่านั้น และต้องให้คะแนน 1-5', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    assertThrows(() => app.ctx.submitFeedback_(job.jobId, email, '', 5, ''), 'หลังจากส่งมอบ');
    app.ctx.changeStatus_(job.jobId, 'DELIVERED', 'x', { notify: false });
    assertThrows(() => app.ctx.submitFeedback_(job.jobId, email, '', 0, ''), '1 ถึง 5');
    assertThrows(() => app.ctx.submitFeedback_(job.jobId, email, '', 6, ''), '1 ถึง 5');
    assertEqual(app.ctx.submitFeedback_(job.jobId, email, '', 5, 'ดีมาก').rating, 5);
  });

  test('ประเมินซ้ำเป็นการแก้คะแนนเดิม ไม่เพิ่มแถวใหม่', () => {
    const app = bootstrapApp();
    const job = delivered(app);
    app.ctx.submitFeedback_(job.jobId, email, '', 3, '');
    const res = app.ctx.submitFeedback_(job.jobId, email, '', 4, 'แก้คะแนน');
    assertEqual(res.updated, true);
    const rows = app.ctx.filterBy_('Feedback', 'jobId', job.jobId);
    assertEqual(rows.length, 1);
    assertEqual(Number(rows[0].rating), 4);
  });

  test('คะแนนต่ำแจ้งเจ้าหน้าที่ทันที คะแนนดีไม่ต้องแจ้ง', () => {
    const app = bootstrapApp();
    const low = (m) => /คะแนนความพึงพอใจ/.test(m.subject);
    const good = delivered(app);
    app.ctx.submitFeedback_(good.jobId, email, '', 5, '');
    assertEqual(app.state.outbox.filter(low).length, 0);
    const bad = delivered(app);
    app.ctx.submitFeedback_(bad.jobId, email, '', 2, 'ส่งช้า');
    assertEqual(app.state.outbox.filter(low).length, 1);
  });

  test('หน้าติดตามและหน้าเจ้าหน้าที่เห็นผลประเมิน', () => {
    const app = bootstrapApp();
    const job = delivered(app);
    assertEqual(app.ctx.getPublicView_(job.jobId, email, '').canRate, true);
    app.ctx.submitFeedback_(job.jobId, email, '', 4, 'ขอบคุณครับ');
    assertEqual(app.ctx.getPublicView_(job.jobId, email, '').feedback.rating, 4);
    const token = app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
    assertEqual(app.ctx.apiAdminGet(token, job.jobId).data.feedback.comment, 'ขอบคุณครับ');
  });

  test('แดชบอร์ดสรุปคะแนนเฉลี่ย สัดส่วนการตอบ และความเห็นล่าสุด', () => {
    const app = bootstrapApp();
    const a = delivered(app); const b = delivered(app); delivered(app);
    app.ctx.submitFeedback_(a.jobId, email, '', 5, 'เยี่ยม');
    app.ctx.submitFeedback_(b.jobId, email, '', 4, '');
    const s = app.ctx.getStats_({}).satisfaction;
    assertEqual(s.count, 2);
    assertEqual(s.avg, 4.5);
    assertEqual(s.responseRate, 67);
    assertEqual(s.dist.join(','), '0,0,0,1,1');
    assertEqual(s.recent.length, 1, 'แสดงเฉพาะที่มีความเห็น');
  });

  test('อีเมลส่งมอบชวนประเมินความพึงพอใจ และไฟล์ส่งออกมีคะแนน', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    app.ctx.changeStatus_(job.jobId, 'DELIVERED', 'x', {});
    const mail = app.state.outbox[app.state.outbox.length - 1];
    assert(mail.htmlBody.indexOf('ประเมินความพึงพอใจ') >= 0);
    app.ctx.submitFeedback_(job.jobId, email, '', 5, '');
    const out = app.ctx.exportRows_({});
    assertEqual(out.rows[0][out.header.indexOf('คะแนนความพึงพอใจ')], 5);
  });
}

/* ==========================================================================
   29. คลังไฟล์ CI ให้ดาวน์โหลดเอง
   ========================================================================== */
group('29. คลังไฟล์ CI');

{
  const b64 = (t) => loadApp().ctx.Utilities.base64Encode(t);
  const loginAdmin = (app) => app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;

  test('เพิ่มไฟล์แล้วทุกคนเห็นและดาวน์โหลดได้โดยไม่ต้องเข้าสู่ระบบ', () => {
    const app = bootstrapApp();
    const res = app.ctx.apiAdminSaveResource(loginAdmin(app), {
      title: 'โลโก้คณะศิลปศาสตร์', category: 'ตราสัญลักษณ์และโลโก้', kind: 'file',
      file: { fileName: 'logo.ai', mimeType: 'application/postscript', dataB64: b64('ai') }
    });
    assertEqual(res.ok, true);
    const pub = app.ctx.apiResources().data;
    assertEqual(pub.items.length, 1);
    assert(pub.items[0].downloadUrl.indexOf('export=download') >= 0, 'ต้องมีลิงก์ดาวน์โหลดตรง');
    const file = app.state.drive.files[app.ctx.findBy_('Resources', 'id', pub.items[0].id).fileId];
    assert(!!file, 'ไฟล์ต้องอยู่บน Drive');
  });

  test('เพิ่มเป็นลิงก์ได้ สำหรับเทมเพลต Canva หรือไฟล์ใหญ่', () => {
    const app = bootstrapApp();
    const res = app.ctx.apiAdminSaveResource(loginAdmin(app), {
      title: 'เทมเพลตโปสเตอร์ Canva', category: 'เทมเพลตสื่อประชาสัมพันธ์', kind: 'link',
      url: 'https://www.canva.com/design/abc/view'
    });
    assertEqual(res.data.item.kind, 'link');
    assertEqual(app.ctx.apiResources().data.items[0].downloadUrl, 'https://www.canva.com/design/abc/view');
    assertEqual(app.ctx.apiAdminSaveResource(loginAdmin(app), { title: 'ลิงก์เสีย', kind: 'link', url: 'ftp://x' }).ok, false);
  });

  test('ซ่อนรายการแล้วผู้ขอไม่เห็น แต่เจ้าหน้าที่ยังเห็น', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    const item = app.ctx.apiAdminSaveResource(token, { title: 'คู่มือ CI', kind: 'link', url: 'https://a.com/ci.pdf' }).data.item;
    app.ctx.apiAdminSaveResource(token, { id: item.id, title: 'คู่มือ CI', kind: 'link', url: 'https://a.com/ci.pdf', active: false });
    assertEqual(app.ctx.apiResources().data.items.length, 0);
    assertEqual(app.ctx.apiAdminResources(token).data.items[0].active, false);
  });

  test('เปลี่ยนไฟล์ใหม่หรือลบรายการแล้วไฟล์เดิมลงถังขยะ', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    const item = app.ctx.apiAdminSaveResource(token, { title: 'ฟอนต์', kind: 'file',
      file: { fileName: 'font.ttf', mimeType: 'font/ttf', dataB64: b64('v1') } }).data.item;
    const oldId = app.ctx.findBy_('Resources', 'id', item.id).fileId;
    app.ctx.apiAdminSaveResource(token, { id: item.id, title: 'ฟอนต์', kind: 'file',
      file: { fileName: 'font.ttf', mimeType: 'font/ttf', dataB64: b64('v2') } });
    assertEqual(app.state.drive.files[oldId].trashed, true);
    const newId = app.ctx.findBy_('Resources', 'id', item.id).fileId;
    app.ctx.apiAdminDeleteResource(token, item.id);
    assertEqual(app.state.drive.files[newId].trashed, true);
    assertEqual(app.ctx.readAll_('Resources').length, 0);
  });

  test('แก้ชื่อหรือคำอธิบายโดยไม่เปลี่ยนไฟล์ได้', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    const item = app.ctx.apiAdminSaveResource(token, { title: 'โลโก้', kind: 'file',
      file: { fileName: 'logo.png', mimeType: 'image/png', dataB64: b64('png') } }).data.item;
    const res = app.ctx.apiAdminSaveResource(token, { id: item.id, title: 'โลโก้ (PNG พื้นใส)', kind: 'file' });
    assertEqual(res.ok, true);
    assertEqual(res.data.item.title, 'โลโก้ (PNG พื้นใส)');
    assertEqual(res.data.item.fileName, 'logo.png');
  });

  test('ต้องเข้าสู่ระบบจึงจัดการคลังไฟล์ได้ และไฟล์ชนิดอันตรายถูกปฏิเสธ', () => {
    const app = bootstrapApp();
    assertEqual(app.ctx.apiAdminSaveResource('', { title: 'x', kind: 'link', url: 'https://a.com' }).code, 'AUTH');
    assertEqual(app.ctx.apiAdminDeleteResource('', 'C-1').code, 'AUTH');
    const bad = app.ctx.apiAdminSaveResource(loginAdmin(app), { title: 'สคริปต์', kind: 'file',
      file: { fileName: 'run.exe', mimeType: 'application/octet-stream', dataB64: b64('x') } });
    assertEqual(bad.ok, false);
  });

  test('หน้าคลังไฟล์ CI เปิดได้จากลิงก์ตรง', () => {
    const app = bootstrapApp();
    app.ctx.doGet({ parameter: { page: 'resources' } });
    assertEqual(JSON.parse(app.state.lastTemplate.boot).page, 'resources');
  });
}

/* ==========================================================================
   30. ย้ายข้อมูลเก่าไปเก็บถาวร
   ========================================================================== */
group('30. ย้ายข้อมูลเก่าไปเก็บถาวร');

{
  const email = 'thitiwut@arts.tu.ac.th';
  const loginAdmin = (app) => app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
  /** สร้างงานที่ปิดไปแล้วเมื่อ daysAgo วันก่อน */
  function closedJob(app, daysAgo, status) {
    const job = app.ctx.createRequest_(samplePayload({ projectName: 'งานปิดเมื่อ ' + daysAgo + ' วันก่อน' }));
    app.ctx.finalizeRequest_(job.jobId);
    app.ctx.changeStatus_(job.jobId, status || 'DELIVERED', 'x',
      { notify: false, cancelReason: 'ยกเลิกทดสอบ' });
    const row = app.ctx.getRequest_(job.jobId);
    const when = dateStr(-daysAgo) + ' 10:00:00';
    app.ctx.update_('Requests', row._row, { closedAt: when, deliveredAt: status === 'CANCELLED' ? '' : when });
    return job;
  }

  test('ดูก่อนย้ายได้ว่าจะย้ายกี่งาน และไม่ย้ายงานที่ยังไม่ปิด', () => {
    const app = bootstrapApp();
    closedJob(app, 400); closedJob(app, 380, 'CANCELLED'); closedJob(app, 10);
    app.ctx.createRequest_(samplePayload());
    const p = app.ctx.previewArchive_(dateStr(-365));
    assertEqual(p.count, 2);
    assertEqual(p.remaining, 2);
  });

  test('ย้ายแล้วข้อมูลทุกชีตของงานไปอยู่ในสเปรดชีตเก็บถาวร และหายจากคิวงาน', () => {
    const app = bootstrapApp();
    const old = closedJob(app, 400);
    app.ctx.submitFeedback_(old.jobId, email, '', 5, 'เยี่ยม');
    const keep = closedJob(app, 10);
    const res = app.ctx.runArchive_(dateStr(-365), 'ผู้ดูแลระบบ');
    assertEqual(res.moved, 1);
    assert(res.sheets.Timeline > 0 && res.sheets.Deliverables > 0 && res.sheets.Feedback === 1);
    assertEqual(app.ctx.getRequest_(old.jobId), null, 'ต้องออกจากชีตหลัก');
    assert(!!app.ctx.getRequest_(keep.jobId), 'งานใหม่ต้องอยู่ครบ');
    assertEqual(app.ctx.filterBy_('Timeline', 'jobId', old.jobId).length, 0);
    assertEqual(app.ctx.readArchive_('Requests').length, 1);
    assert(!!res.archiveUrl, 'ต้องมีลิงก์สเปรดชีตเก็บถาวร');
  });

  test('ข้อมูลที่ย้ายไม่เพี้ยน: เบอร์โทรขึ้นต้นด้วย 0 และข้อความขึ้นต้นด้วยขีดยังอยู่ครบ', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload({ requesterPhone: '0812345678', mandatoryText: '- บรรทัดแรก' }));
    app.ctx.changeStatus_(job.jobId, 'DELIVERED', 'x', { notify: false });
    const row = app.ctx.getRequest_(job.jobId);
    app.ctx.update_('Requests', row._row, { closedAt: dateStr(-400) + ' 10:00:00' });
    app.ctx.runArchive_(dateStr(-365), 'x');
    const r = app.ctx.readArchive_('Requests')[0];
    assertEqual(app.ctx.str_(r.requesterPhone), '0812345678');
    assertEqual(r.mandatoryText, '- บรรทัดแรก');
  });

  test('ผู้ขอยังเปิดลิงก์ติดตามเดิมได้ และเจ้าหน้าที่เปิดดูแบบอ่านอย่างเดียวได้', () => {
    const app = bootstrapApp();
    const old = closedJob(app, 400);
    app.ctx.runArchive_(dateStr(-365), 'x');
    const view = app.ctx.getPublicView_(old.jobId, '', old.trackToken);
    assert(!!view, 'ต้องเปิดได้');
    assertEqual(view.archived, true);
    assertEqual(view.canRate, false, 'งานที่เก็บถาวรประเมินเพิ่มไม่ได้');
    const admin = app.ctx.apiAdminGet(loginAdmin(app), old.jobId).data;
    assertEqual(admin.archived, true);
    assertEqual(admin.row, null);
    assertThrows(() => app.ctx.changeStatus_(old.jobId, 'NEW', 'x', {}), 'ไม่พบ');
  });

  test('แดชบอร์ดและคลังผลงานยังนับงานที่ย้ายไปแล้ว', () => {
    const app = bootstrapApp();
    const old = closedJob(app, 400);
    app.ctx.submitFeedback_(old.jobId, email, '', 4, '');
    closedJob(app, 10);
    const before = app.ctx.getStats_({});
    app.ctx.runArchive_(dateStr(-365), 'x');
    const after = app.ctx.getStats_({});
    assertEqual(after.totals.delivered, before.totals.delivered);
    assertEqual(after.satisfaction.count, 1);
    assertEqual(app.ctx.listAssetLibrary_({}).length, 2);
  });

  test('เฉพาะผู้ดูแลระบบ และต้องพิมพ์คำยืนยันให้ตรง', () => {
    const app = bootstrapApp();
    closedJob(app, 400);
    const admin = loginAdmin(app);
    app.ctx.saveUser_(admin, { email: 'staff@arts.tu.ac.th', name: 'เจ้าหน้าที่', role: 'staff', password: 'Password123' });
    const staff = app.ctx.login_('staff@arts.tu.ac.th', 'Password123').token;
    assertEqual(app.ctx.apiAdminArchiveRun(staff, dateStr(-365), 'ย้ายข้อมูล').code, 'FORBIDDEN');
    assertEqual(app.ctx.apiAdminArchiveRun(admin, dateStr(-365), 'ย้าย').ok, false);
    assertEqual(app.ctx.apiAdminArchivePreview(admin, 'ไม่ใช่วันที่').ok, false);
    assertEqual(app.ctx.apiAdminArchivePreview(admin, dateStr(5)).ok, false, 'วันในอนาคตไม่ได้');
    assertEqual(app.ctx.apiAdminArchiveRun(admin, dateStr(-365), 'ย้ายข้อมูล').data.moved, 1);
  });

  test('ย้ายข้อมูลจำนวนมากเกิน 1,000 แถวได้ (สเปรดชีตเก็บถาวรขยายแถวให้เอง)', () => {
    const app = bootstrapApp();
    const old = closedJob(app, 400);
    for (let i = 0; i < 1100; i++) app.ctx.logTimeline_(old.jobId, 'x', 'NOTE', '', '', 'บันทึก ' + i);
    const res = app.ctx.runArchive_(dateStr(-365), 'x');
    assert(res.sheets.Timeline > 1100, 'ต้องย้ายประวัติครบ ได้ ' + res.sheets.Timeline);
    assertEqual(app.ctx.readArchive_('Timeline').length, res.sheets.Timeline);
    assertEqual(app.ctx.filterBy_('Timeline', 'jobId', old.jobId).length, 0);
  });

  test('ย้ายซ้ำได้หลายรอบ ข้อมูลต่อท้ายในสเปรดชีตเดิม', () => {
    const app = bootstrapApp();
    closedJob(app, 800);
    app.ctx.runArchive_(dateStr(-700), 'x');
    closedJob(app, 400);
    app.ctx.runArchive_(dateStr(-365), 'x');
    assertEqual(app.ctx.readArchive_('Requests').length, 2);
    assertEqual(app.ctx.runArchive_(dateStr(-365), 'x').moved, 0, 'ไม่มีอะไรให้ย้ายแล้ว');
  });
}

/* ==========================================================================
   31. ผู้ขอเลือกผู้ออกแบบ และคิวงานบนหน้ายื่นคำขอ
   ========================================================================== */
group('31. เลือกผู้ออกแบบและคิวงานสาธารณะ');

{
  const loginAdmin = (app) => app.ctx.login_('pr@arts.tu.ac.th', 'SuperSecret123').token;
  function team(app) {
    const t = loginAdmin(app);
    const add = (p) => app.ctx.apiAdminSaveDesigner(t, p).data.designer;
    return {
      a: add({ name: 'ธิติวุฒิ บุญแก้ว', shortName: 'ต้น', specialty: 'โปสเตอร์ อินโฟกราฟิก', email: 'ton@arts.tu.ac.th', capacity: 4 }),
      b: add({ name: 'สุดารัตน์ ใจดี', shortName: 'ดา', specialty: 'โซเชียลมีเดีย' }),
      c: add({ name: 'ปิยะ มีสุข', capacity: 2, accepting: false }),
      d: add({ name: 'วรรณา ศรีสุข', active: false })
    };
  }
  function submit(app, overrides) {
    const job = app.ctx.createRequest_(samplePayload(Object.assign({ requesterName: 'ผู้ขอ ไม่ควรเปิดเผย', designerId: 'pool' }, overrides)));
    app.ctx.finalizeRequest_(job.jobId);
    return job;
  }

  test('เพิ่มผู้ออกแบบได้ สีไม่ซ้ำกันสำหรับ 4 คนแรก และหน้าเว็บไม่เห็นอีเมล', () => {
    const app = bootstrapApp();
    const t = team(app);
    const cfg = app.ctx.bootstrapData_();
    assertEqual(cfg.designers.length, 3, 'คนที่ซ่อนไว้ต้องไม่อยู่ในตัวเลือก');
    const colors = [t.a.color, t.b.color, t.c.color, t.d.color];
    assertEqual(new Set(colors).size, 4, 'ต้องได้ 4 สีที่ต่างกัน');
    assertEqual(JSON.stringify(cfg).indexOf('ton@arts.tu.ac.th'), -1, 'ห้ามส่งอีเมลผู้ออกแบบไปหน้าเว็บ');
  });

  test('ผู้ขอเลือกผู้ออกแบบแล้วงานผูกกับคนนั้นทันที และผู้ออกแบบได้รับอีเมล', () => {
    const app = bootstrapApp();
    const t = team(app);
    const job = submit(app, { designerId: t.a.id });
    assertEqual(job.designerName, 'ธิติวุฒิ บุญแก้ว');
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, 'ธิติวุฒิ บุญแก้ว');
    assert(app.ctx.getTimeline_(job.jobId).some((x) => x.action === 'ASSIGN' && x.detail.indexOf('ผู้ขอเลือก') >= 0));
    const staffMail = app.state.outbox.filter((m) => /คำขอออกแบบใหม่/.test(m.subject))[0];
    assert(staffMail.to.indexOf('ton@arts.tu.ac.th') >= 0, 'ผู้ออกแบบที่ถูกเลือกต้องได้รับแจ้ง');
    assert(staffMail.htmlBody.indexOf('ผู้ออกแบบที่ผู้ขอเลือก') >= 0);
    const confirm = app.state.outbox.filter((m) => /ยืนยันการรับคำขอ/.test(m.subject))[0];
    assert(confirm.htmlBody.indexOf('ธิติวุฒิ บุญแก้ว') >= 0, 'อีเมลยืนยันต้องบอกผู้ออกแบบที่เลือก');
  });

  test('เลือก "ให้ฝ่ายฯ จัดสรรให้" ได้ งานรอเจ้าหน้าที่มอบหมาย และบันทึกว่าผู้ขอเลือกเอง', () => {
    const app = bootstrapApp();
    team(app);
    const job = submit(app, { designerId: 'pool' });
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, '');
    assert(app.ctx.getTimeline_(job.jobId).some((x) => x.action === 'ASSIGN' && x.detail.indexOf('ให้ฝ่ายฯ จัดสรร') >= 0));
    const staffMail = app.state.outbox.filter((m) => /คำขอออกแบบใหม่/.test(m.subject))[0];
    assert(staffMail.htmlBody.indexOf('กรุณามอบหมายผู้รับผิดชอบ') >= 0, 'อีเมลเจ้าหน้าที่ต้องเตือนให้มอบหมาย');
  });

  test('ผู้ขอต้องเลือกผู้ออกแบบหรือ "ให้ฝ่ายฯ จัดสรรให้" เสมอ ไม่เลือกเลยส่งไม่ได้และไม่เสียเลขที่คำขอ', () => {
    const app = bootstrapApp();
    team(app);
    const res = app.ctx.apiSubmitRequest(samplePayload());
    assertEqual(res.ok, false);
    assertEqual(res.code, 'DESIGNER', 'หน้าเว็บต้องพากลับไปเลือกผู้ออกแบบได้');
    assert(res.error.indexOf('ให้ฝ่ายฯ จัดสรรให้') >= 0, 'ข้อความต้องบอกวิธีแก้');
    assertEqual(app.ctx.readAll_('Requests').length, 0);
    const job = app.ctx.createRequest_(samplePayload({ designerId: 'pool' }));
    assert(job.jobId.indexOf('0001') > 0, 'เลขที่คำขอต้องไม่ถูกใช้ไปเปล่า ๆ ' + job.jobId);
  });

  test('ยังไม่มีรายชื่อผู้ออกแบบ ไม่บังคับเลือก (ระบบที่ยังไม่ได้ตั้งค่ายังรับคำขอได้)', () => {
    const app = bootstrapApp();
    const job = app.ctx.createRequest_(samplePayload());
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, '');
  });

  test('เลือกคนที่งดรับงาน ถูกซ่อน หรือไม่มีอยู่จริงไม่ได้ และไม่เสียเลขที่คำขอ', () => {
    const app = bootstrapApp();
    const t = team(app);
    assertThrows(() => app.ctx.createRequest_(samplePayload({ designerId: t.c.id })), 'งดรับงานใหม่');
    assertThrows(() => app.ctx.createRequest_(samplePayload({ designerId: t.d.id })), 'ไม่อยู่ในรายชื่อ');
    assertThrows(() => app.ctx.createRequest_(samplePayload({ designerId: 'P-ปลอม' })), 'ไม่อยู่ในรายชื่อ');
    const job = app.ctx.createRequest_(samplePayload({ designerId: 'pool' }));
    assert(job.jobId.indexOf('0001') > 0, 'เลขที่คำขอต้องเริ่มที่ 0001 ได้ ' + job.jobId);
  });

  test('คิวงานสาธารณะนับงานของแต่ละคนถูกต้อง และไม่เปิดเผยข้อมูลผู้ขอ', () => {
    const app = bootstrapApp();
    const t = team(app);
    submit(app, { designerId: t.a.id, dueDate: dateStr(5), rushReason: 'ด่วน' });
    submit(app, { designerId: t.a.id, dueDate: dateStr(20) });
    submit(app, { designerId: t.b.id, dueDate: dateStr(10) });
    submit(app);
    const done = submit(app, { designerId: t.b.id });
    app.ctx.changeStatus_(done.jobId, 'DELIVERED', 'x', { notify: false });
    app.ctx.createRequest_(samplePayload({ designerId: t.a.id })); // ยังไม่ยืนยัน ไม่ต้องนับ

    const w = app.ctx.apiPublicWorkload().data;
    assertEqual(w.enabled, true);
    const byName = Object.fromEntries(w.designers.map((d) => [d.name, d]));
    assertEqual(byName['ธิติวุฒิ บุญแก้ว'].active, 2);
    assertEqual(byName['ธิติวุฒิ บุญแก้ว'].dueSoon, 1);
    assertEqual(byName['ธิติวุฒิ บุญแก้ว'].loadPct, 50);
    assertEqual(byName['สุดารัตน์ ใจดี'].active, 1, 'งานที่ส่งมอบแล้วไม่นับ');
    assertEqual(w.unassigned.active, 1);
    assertEqual(w.jobs.length, 4);
    assert(w.jobs[0].dueDate <= w.jobs[1].dueDate, 'เรียงตามกำหนดใช้งาน');
    assertEqual(w.jobs.filter((j) => j.designerId === t.a.id).every((j) => j.color === t.a.color), true);
    const raw = JSON.stringify(w);
    ['ผู้ขอ ไม่ควรเปิดเผย', 'thitiwut@arts.tu.ac.th', '0812345678', 'ฝ่ายสื่อสารองค์กร', 'ton@arts.tu.ac.th']
      .forEach((secret) => assertEqual(raw.indexOf(secret), -1, 'ห้ามมีข้อมูลส่วนตัว: ' + secret));
  });

  test('คิวงานบนหน้าเว็บอัปเดตทันทีเมื่อสถานะเปลี่ยน (ไม่ค้างแคช)', () => {
    const app = bootstrapApp();
    const t = team(app);
    const job = submit(app, { designerId: t.a.id });
    const before = app.ctx.apiPublicWorkload().data;
    assertEqual(before.jobs.length, 1);
    app.ctx.changeStatus_(job.jobId, 'DELIVERED', 'x', { notify: false });
    assertEqual(app.ctx.apiPublicWorkload().data.jobs.length, 0);
    const again = submit(app);
    app.ctx.apiPublicWorkload();
    app.ctx.assignRequest_(again.jobId, t.b.name, 'x');
    const after = app.ctx.apiPublicWorkload().data;
    assertEqual(after.jobs[0].designerId, t.b.id, 'มอบหมายแล้วต้องเห็นทันที');
  });

  test('ปิดการแสดงคิวงานบนหน้ายื่นคำขอได้จากหน้าตั้งค่า', () => {
    const app = bootstrapApp();
    app.ctx.apiPublicWorkload();
    app.ctx.apiAdminSaveSettings(loginAdmin(app), { publicWorkload: 'false' });
    const w = app.ctx.apiPublicWorkload().data;
    assertEqual(w.enabled, false);
    assertEqual(w.jobs, undefined, 'ปิดแล้วต้องไม่ส่งข้อมูลงาน');
  });

  test('เปลี่ยนชื่อผู้ออกแบบแล้วงานที่ผูกอยู่เปลี่ยนตาม ไม่หลุดจากคิว', () => {
    const app = bootstrapApp();
    const t = team(app);
    const job = submit(app, { designerId: t.a.id });
    const res = app.ctx.apiAdminSaveDesigner(loginAdmin(app), { id: t.a.id, name: 'ธิติวุฒิ บุญแก้ว (ต้น)', capacity: 4 });
    assertEqual(res.data.renamedJobs, 1);
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, 'ธิติวุฒิ บุญแก้ว (ต้น)');
    const w = app.ctx.apiPublicWorkload().data;
    assertEqual(w.designers.find((d) => d.id === t.a.id).active, 1);
  });

  test('มอบหมายด้วยชื่อที่พิมพ์ต่างกันเล็กน้อยก็ผูกกับผู้ออกแบบคนเดิม และแจ้งผู้ออกแบบครั้งเดียว', () => {
    const app = bootstrapApp();
    const t = team(app);
    const job = submit(app);
    const assigned = () => app.state.outbox.filter((m) => /มอบหมายงานให้คุณ/.test(m.subject)).length;
    app.ctx.assignRequest_(job.jobId, '  ธิติวุฒิ   บุญแก้ว ', 'ผู้ดูแลระบบ');
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, 'ธิติวุฒิ บุญแก้ว');
    assertEqual(assigned(), 1);
    app.ctx.assignRequest_(job.jobId, 'ธิติวุฒิ บุญแก้ว', 'ผู้ดูแลระบบ');
    assertEqual(assigned(), 1, 'มอบหมายซ้ำคนเดิมไม่ต้องแจ้งซ้ำ');
    app.ctx.assignRequest_(job.jobId, t.b.name, 'ผู้ดูแลระบบ');
    assertEqual(assigned(), 1, 'คนที่ไม่มีอีเมลไม่ต้องส่ง');
  });

  test('ลบผู้ออกแบบที่ยังมีงานค้างไม่ได้ แต่ลบคนที่ไม่มีงานได้', () => {
    const app = bootstrapApp();
    const t = team(app);
    submit(app, { designerId: t.a.id });
    const token = loginAdmin(app);
    const blocked = app.ctx.apiAdminDeleteDesigner(token, t.a.id);
    assertEqual(blocked.ok, false);
    assert(blocked.error.indexOf('ยังมีงานที่กำลังทำอยู่ 1 งาน') >= 0);
    assertEqual(app.ctx.apiAdminDeleteDesigner(token, t.b.id).ok, true);
    assertEqual(app.ctx.listDesigners_(true).length, 3);
  });

  test('จัดการรายชื่อผู้ออกแบบได้เฉพาะผู้ดูแลระบบ แต่เจ้าหน้าที่ดูรายชื่อได้', () => {
    const app = bootstrapApp();
    const admin = loginAdmin(app);
    app.ctx.saveUser_(admin, { email: 'staff@arts.tu.ac.th', name: 'เจ้าหน้าที่', role: 'staff', password: 'Password123' });
    const staff = app.ctx.login_('staff@arts.tu.ac.th', 'Password123').token;
    assertEqual(app.ctx.apiAdminSaveDesigner(staff, { name: 'ใครสักคน' }).code, 'FORBIDDEN');
    assertEqual(app.ctx.apiAdminSaveDesigner('', { name: 'ใครสักคน' }).code, 'AUTH');
    assertEqual(app.ctx.apiAdminDeleteDesigner(staff, 'P-1').code, 'FORBIDDEN');
    assertEqual(app.ctx.apiAdminDesigners(staff).ok, true);
    assertEqual(app.ctx.apiAdminDesigners('').code, 'AUTH');
    assertEqual(app.ctx.apiPublicWorkload().ok, true, 'คิวงานสาธารณะไม่ต้องเข้าสู่ระบบ');
  });

  test('ข้อมูลผู้ออกแบบผิดรูปแบบหรือชื่อซ้ำถูกปฏิเสธ', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    app.ctx.apiAdminSaveDesigner(token, { name: 'ธิติวุฒิ บุญแก้ว' });
    assert(app.ctx.apiAdminSaveDesigner(token, { name: 'ธิติวุฒิ  บุญแก้ว' }).error.indexOf('อยู่แล้ว') >= 0);
    assertEqual(app.ctx.apiAdminSaveDesigner(token, { name: 'ก' }).ok, false);
    assertEqual(app.ctx.apiAdminSaveDesigner(token, { name: 'คนใหม่', email: 'ไม่ใช่อีเมล' }).ok, false);
    assertEqual(app.ctx.apiAdminSaveDesigner(token, { name: 'คนใหม่', color: 'red' }).ok, false);
    assertEqual(app.ctx.apiAdminSaveDesigner(token, { name: 'คนใหม่', capacity: 0 }).ok, false);
  });

  test('ชื่อที่เคยมอบหมายงานไว้ก่อนมีรายชื่อ ถูกแนะนำให้เพิ่ม และเพิ่มแล้วงานเดิมนับรวมทันที', () => {
    const app = bootstrapApp();
    const job = submit(app);
    app.ctx.assignRequest_(job.jobId, 'ปรีชา งานดี', 'x');
    const token = loginAdmin(app);
    const list = app.ctx.apiAdminDesigners(token).data;
    assertEqual(list.suggestions[0].name, 'ปรีชา งานดี');
    app.ctx.apiAdminSaveDesigner(token, { name: 'ปรีชา งานดี' });
    const w = app.ctx.apiPublicWorkload().data;
    assertEqual(w.designers[0].active, 1);
    assertEqual(w.unassigned.active, 0);
    assertEqual(app.ctx.apiAdminDesigners(token).data.suggestions.length, 0);
  });

  test('เลือกผู้ออกแบบที่ไม่พร้อมรับงาน หน้าเว็บได้รหัส DESIGNER เพื่อพากลับไปเลือกใหม่', () => {
    const app = bootstrapApp();
    const t = team(app);
    const res = app.ctx.apiSubmitRequest(samplePayload({ designerId: t.c.id }));
    assertEqual(res.ok, false);
    assertEqual(res.code, 'DESIGNER');
    assert(res.error.indexOf('ให้ฝ่ายฯ จัดสรรให้') >= 0, 'ข้อความต้องบอกวิธีแก้');
    const ok = app.ctx.apiSubmitRequest(samplePayload({ designerId: t.a.id }));
    assertEqual(ok.ok, true);
    assertEqual(ok.data.designerName, 'ธิติวุฒิ บุญแก้ว');
  });

  test('ล้างข้อมูลทดสอบแล้วรายชื่อผู้ออกแบบยังอยู่ และคิวงานกลับเป็นศูนย์ทันที', () => {
    const app = bootstrapApp();
    const t = team(app);
    submit(app, { designerId: t.a.id });
    assertEqual(app.ctx.apiPublicWorkload().data.designers[0].active, 1);
    app.ctx.resetAllRequests_('x');
    const w = app.ctx.apiPublicWorkload().data;
    assertEqual(w.designers.length, 3, 'รายชื่อผู้ออกแบบต้องไม่ถูกลบ');
    assertEqual(w.designers[0].active, 0, 'แคชต้องถูกล้าง ไม่แสดงงานที่ลบไปแล้ว');
    assertEqual(w.jobs.length, 0);
  });

  test('เจ้าหน้าที่ทั่วไปได้รายชื่อบัญชีเจ้าหน้าที่สำหรับ dropdown และมอบงานให้กันเองได้ พร้อมอีเมลแจ้ง', () => {
    const app = bootstrapApp();
    const t = team(app);
    const adminToken = loginAdmin(app);
    app.ctx.saveUser_(adminToken, { email: 'mai@arts.tu.ac.th', name: 'มาลัย  ทองดี', role: 'staff', password: 'StaffPass123' });
    app.ctx.saveUser_(adminToken, { email: 'old@arts.tu.ac.th', name: 'คนเก่า ลาออก', role: 'staff', password: 'StaffPass123' });
    app.ctx.saveUser_(adminToken, { email: 'old@arts.tu.ac.th', name: 'คนเก่า ลาออก', role: 'staff', active: false });
    app.ctx.saveUser_(adminToken, { email: 'ton2@arts.tu.ac.th', name: 'ธิติวุฒิ บุญแก้ว', role: 'staff', password: 'StaffPass123' });
    const staffToken = app.ctx.login_('mai@arts.tu.ac.th', 'StaffPass123').token;

    const list = app.ctx.apiAdminDesigners(staffToken);
    assertEqual(list.ok, true, 'เจ้าหน้าที่ทั่วไปต้องเรียกได้');
    assert(list.data.staff.indexOf('มาลัย ทองดี') >= 0, 'ต้องมีบัญชีเจ้าหน้าที่ที่ไม่อยู่ในรายชื่อผู้ออกแบบ');
    assertEqual(list.data.staff.indexOf('คนเก่า ลาออก'), -1, 'บัญชีที่ปิดใช้งานต้องไม่อยู่ในรายชื่อ');
    assertEqual(list.data.staff.indexOf('ธิติวุฒิ บุญแก้ว'), -1, 'คนที่เป็นผู้ออกแบบอยู่แล้วไม่ต้องซ้ำ');
    assertEqual(JSON.stringify(list.data.staff).indexOf('@'), -1, 'ไม่ต้องส่งอีเมลบัญชี');

    const job = submit(app, { designerId: t.a.id });
    app.state.outbox.length = 0;
    const res = app.ctx.apiAdminAssign(staffToken, job.jobId, 'มาลัย ทองดี');
    assertEqual(res.ok, true, 'เจ้าหน้าที่ทั่วไปต้องมอบหมายงานได้');
    assertEqual(res.data.job.row.assignedTo, 'มาลัย ทองดี');
    const mail = app.state.outbox.filter((m) => /มอบหมายงานให้คุณ/.test(m.subject))[0];
    assert(mail && mail.to.indexOf('mai@arts.tu.ac.th') >= 0, 'บัญชีเจ้าหน้าที่ที่ได้รับมอบหมายต้องได้อีเมล');

    // คิวงานสาธารณะ: งานของเจ้าหน้าที่ที่ไม่อยู่ในรายชื่อผู้ออกแบบ ไม่นับเป็น "รอจัดสรร" และไม่เปิดเผยชื่อ
    const w = app.ctx.apiPublicWorkload().data;
    assertEqual(w.unassigned.active, 0);
    assertEqual(w.staff.active, 1);
    assertEqual(w.jobs[0].designerName, 'เจ้าหน้าที่ฝ่ายฯ');
    assertEqual(JSON.stringify(w).indexOf('มาลัย'), -1);
    assertEqual(app.ctx.apiAdminAssign('ปลอม', job.jobId, 'x').code, 'AUTH', 'ไม่เข้าสู่ระบบต้องมอบหมายไม่ได้');
  });

  test('ผู้ออกแบบไม่มีอีเมลในรายชื่อ ใช้อีเมลบัญชีเจ้าหน้าที่ชื่อเดียวกันแจ้งงาน', () => {
    const app = bootstrapApp();
    const t = team(app);
    app.ctx.saveUser_(loginAdmin(app), { email: 'da@arts.tu.ac.th', name: 'สุดารัตน์ ใจดี', role: 'staff', password: 'StaffPass123' });
    const job = submit(app);
    app.state.outbox.length = 0;
    app.ctx.assignRequest_(job.jobId, t.b.name, 'x');
    const mail = app.state.outbox.filter((m) => /มอบหมายงานให้คุณ/.test(m.subject))[0];
    assert(mail && mail.to.indexOf('da@arts.tu.ac.th') >= 0);
  });

  test('ระดับความหนักของงาน: ว่าง งานน้อย ปานกลาง ค่อนข้างมาก เต็ม', () => {
    const app = bootstrapApp();
    const lv = (n, cap) => app.ctx.loadLevel_(n, cap).label;
    assertEqual(lv(0, 6), 'ว่าง');
    assertEqual(lv(1, 6), 'งานน้อย', 'มีงาน 1 งานต้องไม่บอกว่าว่าง');
    assertEqual(lv(3, 6), 'ปานกลาง');
    assertEqual(lv(3, 4), 'ค่อนข้างมาก', '75% ต้องเป็นค่อนข้างมาก');
    assertEqual(lv(4, 4), 'เต็ม');
    assertEqual(app.ctx.loadLevel_(9, 4).pct, 225, 'เกินความจุต้องคืนเปอร์เซ็นต์จริง หน้าเว็บตัดแถบที่ 100% เอง');
  });

  test('ไม่ระบุชื่อย่อ ใช้ชื่อแรกแทน และหน้าตั้งค่ารู้ว่าเป็นค่าอัตโนมัติ', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    app.ctx.apiAdminSaveDesigner(token, { name: 'สมศรี  รักงาน' });
    const d = app.ctx.apiAdminDesigners(token).data.designers[0];
    assertEqual(d.name, 'สมศรี รักงาน', 'ช่องว่างซ้ำต้องถูกยุบ');
    assertEqual(d.shortName, 'สมศรี');
    assertEqual(d.shortNameAuto, true);
    // เปลี่ยนชื่อโดยไม่ระบุชื่อย่อ ชื่อย่อต้องเปลี่ยนตาม ไม่ค้างเป็นชื่อเดิม
    app.ctx.apiAdminSaveDesigner(token, { id: d.id, name: 'สมใจ รักงาน', shortName: '' });
    assertEqual(app.ctx.apiAdminDesigners(token).data.designers[0].shortName, 'สมใจ');
    app.ctx.apiAdminSaveDesigner(token, { id: d.id, name: 'สมใจ รักงาน', shortName: 'พี่ใจ' });
    const e = app.ctx.apiAdminDesigners(token).data.designers[0];
    assertEqual(e.shortName, 'พี่ใจ');
    assertEqual(e.shortNameAuto, false);
  });

  test('ชื่อผู้ออกแบบที่มีแท็ก HTML ถูกเก็บเป็นข้อความ และอีเมลแจ้งงานไม่รันแท็ก', () => {
    const app = bootstrapApp();
    const token = loginAdmin(app);
    const d = app.ctx.apiAdminSaveDesigner(token, { name: '<img src=x onerror=alert(1)>', email: 'x@arts.tu.ac.th' }).data.designer;
    const job = submit(app, { designerId: d.id });
    const mail = app.state.outbox.filter((m) => /คำขอออกแบบใหม่/.test(m.subject))[0];
    assert(mail.htmlBody.indexOf('<img src=x') < 0, 'อีเมลต้อง escape ชื่อผู้ออกแบบ');
    assertEqual(app.ctx.getRequest_(job.jobId).assignedTo, '<img src=x onerror=alert(1)>');
  });
}

/* ==========================================================================
   สรุปผล
   ========================================================================== */
console.log('\n' + '='.repeat(62));
if (failed === 0) {
  console.log('\x1b[32m\x1b[1m  ผ่านทั้งหมด ' + passed + ' การทดสอบ\x1b[0m');
} else {
  console.log('\x1b[31m\x1b[1m  ผ่าน ' + passed + ' / ไม่ผ่าน ' + failed + '\x1b[0m');
  for (const f of failures) {
    console.log('\n  \x1b[31m' + f.group + ' → ' + f.name + '\x1b[0m');
    console.log('  ' + (f.err.stack || f.err.message).split('\n').slice(0, 4).join('\n  '));
  }
}
console.log('='.repeat(62) + '\n');
process.exit(failed === 0 ? 0 : 1);
