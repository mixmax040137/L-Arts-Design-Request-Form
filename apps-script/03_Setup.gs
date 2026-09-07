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
    lines.push('  ขั้นตอนถัดไป: สร้างบัญชีเจ้าหน้าที่ด้วยคำสั่ง');
    lines.push("    createAdmin('pr@arts.tu.ac.th', 'ชื่อผู้ดูแลระบบ', 'รหัสผ่านที่ต้องการ')");
  } else {
    lines.push('  มีบัญชีเจ้าหน้าที่ในระบบแล้ว');
  }
  lines.push('');
  Logger.log(lines.join('\n'));

  return result;
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
  try {
    var url = ScriptApp.getService().getUrl();
    return url || '';
  } catch (err) {
    return '';
  }
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
