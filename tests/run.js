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

  test('ข้ามขั้นตอนไม่ได้ (รับคำขอ ไปเป็น ส่งมอบแล้ว)', () => {
    assertThrows(() => app.ctx.changeStatus_(jobId, 'DELIVERED', 'เจ้าหน้าที่', {}),
      'ไม่สามารถเปลี่ยนสถานะ');
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

  test('งานที่ส่งมอบแล้วเปลี่ยนสถานะต่อไม่ได้', () => {
    assertThrows(() => app.ctx.changeStatus_(jobId, 'DESIGNING', 'เจ้าหน้าที่', {}),
      'ไม่สามารถเปลี่ยนสถานะ');
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
    assertEqual(view.canRequestRevision, true);
    assertEqual(view.revisions.length, 4);
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

  test('ประมวลผลได้สูงสุด 5 ใบต่อรอบ กันเวลาทำงานเกินโควตา', () => {
    const app = bootstrapApp({ fetchHandler: claudeOkHandler });
    app.ctx.setAnthropicApiKey('sk-ant-test-key');
    for (let i = 0; i < 7; i++) {
      const job = app.ctx.createRequest_(samplePayload());
      app.ctx.finalizeRequest_(job.jobId);
    }
    app.ctx.workerTick();
    const done = app.ctx.readAll_('Requests').filter((r) => r.briefStatus === 'DONE').length;
    assertEqual(done, 5);
    app.ctx.workerTick();
    assertEqual(app.ctx.readAll_('Requests').filter((r) => r.briefStatus === 'DONE').length, 7);
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
    assertEqual(d.request.nextStatuses.length, 0, 'งานที่ส่งมอบแล้วไม่มีสถานะถัดไป');
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
