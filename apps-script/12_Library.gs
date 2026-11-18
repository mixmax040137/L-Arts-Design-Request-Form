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
