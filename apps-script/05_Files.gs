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
