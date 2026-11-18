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
