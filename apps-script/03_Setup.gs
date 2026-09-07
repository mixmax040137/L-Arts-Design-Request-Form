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

    // ตั้งอีเมลแจ้งเตือนเจ้าหน้าที่ให้ตรงกับบัญชีแรกโดยอัตโนมัติ
    if (getSetting_('notifyEmails', '') === DEFAULT_SETTINGS.notifyEmails) {
      setSetting_('notifyEmails', mail);
      setSetting_('replyTo', mail);
    }

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
