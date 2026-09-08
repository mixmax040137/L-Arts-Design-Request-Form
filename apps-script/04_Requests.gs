/**
 * 04_Requests.gs — ตรรกะหลักของคำขอรับบริการออกแบบ
 */

/* ------------------------------------------------------------- Validation */

/**
 * ตรวจสอบและทำความสะอาดข้อมูลจากแบบฟอร์ม
 * คืน object ที่พร้อมบันทึก หรือโยน error พร้อมข้อความภาษาไทย
 */
function validateRequestPayload_(payload) {
  var p = payload || {};
  var errors = [];
  var out = {};

  out.requesterName = truncate_(pick_(p, 'requesterName', ''), 150);
  if (out.requesterName.length < 2) errors.push('กรุณากรอกชื่อ-นามสกุลผู้ขอรับบริการ');

  out.requesterEmail = truncate_(str_(pick_(p, 'requesterEmail', '')).toLowerCase(), 254);
  if (!isValidEmail_(out.requesterEmail)) errors.push('รูปแบบอีเมลไม่ถูกต้อง');

  out.requesterPhone = normalizePhone_(pick_(p, 'requesterPhone', ''));
  if (!isValidPhone_(out.requesterPhone)) errors.push('กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก');

  var dept = truncate_(pick_(p, 'department', ''), 150);
  if (dept === 'อื่น ๆ') {
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
    if (daysAhead < 0) {
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
  if (due) {
    var lead = daysBetween_(new Date(), due);
    if (lead >= 0 && lead < minLead && !out.rushReason) {
      errors.push('กำหนดส่งน้อยกว่า ' + minLead + ' วันทำการ กรุณาระบุเหตุผลความจำเป็นเร่งด่วน');
    }
  }

  if (pick_(p, 'acceptTerms', false) !== true && str_(pick_(p, 'acceptTerms', '')) !== 'true') {
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
      assignedTo: '',
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

    return {
      jobId: jobId,
      trackToken: row.trackToken,
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
  var req = findBy_(SHEET.REQUESTS, 'jobId', jobId);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  if (str_(req.submittedAt)) {
    return { jobId: req.jobId, alreadyFinalized: true, trackUrl: buildTrackUrl_(req) };
  }

  var count = filterBy_(SHEET.ATTACHMENTS, 'jobId', jobId).length;
  update_(SHEET.REQUESTS, req._row, {
    submittedAt: nowIso_(),
    attachmentCount: count,
    updatedAt: nowIso_()
  });
  req.submittedAt = nowIso_();
  req.attachmentCount = count;

  logTimeline_(jobId, req.requesterName, 'SUBMIT', '', STATUS.NEW.key,
    'ยืนยันการยื่นคำขอ พร้อมไฟล์แนบ ' + count + ' ไฟล์');

  // แจ้งผู้ขอรับบริการและเจ้าหน้าที่ (ไม่ให้ error ของอีเมลทำให้คำขอล้มเหลว)
  try {
    sendConfirmationEmail_(req);
  } catch (err) {
    logTimeline_(jobId, 'system', 'EMAIL_ERROR', '', '', 'ส่งอีเมลยืนยันไม่สำเร็จ: ' + err.message);
  }
  try {
    sendStaffNewRequestEmail_(req);
  } catch (err) {
    logTimeline_(jobId, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่ไม่สำเร็จ: ' + err.message);
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
    timeline: getTimeline_(req.jobId)
  };
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
  return base + '?page=track&job=' + encodeURIComponent(req.jobId) + '&t=' + encodeURIComponent(req.trackToken);
}

/**
 * มุมมองสาธารณะสำหรับผู้ขอรับบริการ
 * ต้องยืนยันตัวตนด้วย token จากอีเมล หรืออีเมลที่ตรงกับผู้ยื่นคำขอ
 */
function getPublicView_(jobId, email, token) {
  var id = str_(jobId).toUpperCase();
  var req = getRequest_(id);
  if (!req) return null;

  var authorized = false;
  if (token && verifyTrackToken_(id, token)) authorized = true;
  if (!authorized && email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase()) authorized = true;
  if (!authorized) return null;

  var deliverables = filterBy_(SHEET.DELIVERABLES, 'jobId', id)
    .sort(function (a, b) { return int_(a.seq) - int_(b.seq); })
    .map(function (d) {
      return { mediaLabel: d.mediaLabel, size: d.size, quantity: int_(d.quantity), note: str_(d.note) };
    });

  var revisions = filterBy_(SHEET.REVISIONS, 'jobId', id)
    .sort(function (a, b) { return int_(a.round) - int_(b.round); })
    .map(function (r) {
      return { round: int_(r.round), createdAt: str_(r.createdAt), byName: str_(r.byName), comment: str_(r.comment) };
    });

  var timeline = getTimeline_(id)
    .filter(function (t) { return str_(t.action) !== 'EMAIL_ERROR' && str_(t.action) !== 'NOTE'; })
    .map(function (t) {
      return { at: str_(t.at), action: str_(t.action), toStatus: str_(t.toStatus), detail: str_(t.detail) };
    });

  var files = filterBy_(SHEET.ATTACHMENTS, 'jobId', id)
    .filter(function (f) { return str_(f.kind) === 'final'; })
    .map(function (f) { return { fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: int_(f.sizeBytes) }; });

  var info = statusInfo_(req.status);
  return {
    jobId: req.jobId,
    status: info.key,
    statusLabel: info.label,
    statusEn: info.en,
    statusStep: info.step,
    statusColor: info.color,
    priority: priorityInfo_(req.priority).label,
    projectName: req.projectName,
    requesterName: req.requesterName,
    department: req.department,
    createdAt: str_(req.createdAt),
    dueDate: str_(req.dueDate),
    deliveredAt: str_(req.deliveredAt),
    draftUrl: str_(req.draftUrl),
    revisionCount: int_(req.revisionCount),
    revisionLimit: int_(req.revisionLimit),
    cancelReason: str_(req.cancelReason),
    canRequestRevision: str_(req.status) === STATUS.REVIEW.key && int_(req.revisionCount) < int_(req.revisionLimit),
    canApprove: str_(req.status) === STATUS.REVIEW.key,
    deliverables: deliverables,
    revisions: revisions,
    finalFiles: files,
    timeline: timeline
  };
}

/* ------------------------------------------------------- Status & actions */

/** ตรวจว่าเปลี่ยนสถานะได้หรือไม่ */
function canTransition_(from, to) {
  var allowed = STATUS_TRANSITIONS[str_(from).toUpperCase()];
  if (!allowed) return false;
  return allowed.indexOf(str_(to).toUpperCase()) >= 0;
}

/**
 * เปลี่ยนสถานะงาน (ใช้โดยเจ้าหน้าที่)
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
    if (!canTransition_(from, to)) {
      throw appError_('ไม่สามารถเปลี่ยนสถานะจาก "' + statusInfo_(from).label +
        '" ไปเป็น "' + statusInfo_(to).label + '" ได้');
    }

    var patch = { status: to, updatedAt: nowIso_(), updatedBy: str_(actor) };

    if (to === STATUS.DESIGNING.key && !str_(req.startedAt)) {
      patch.startedAt = nowIso_();
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
  var name = truncate_(assignee, 150);
  update_(SHEET.REQUESTS, req._row, { assignedTo: name, updatedAt: nowIso_(), updatedBy: str_(actor) });
  logTimeline_(jobId, actor, 'ASSIGN', '', '', 'มอบหมายให้ ' + (name || '(ไม่ระบุ)'));
  return getRequest_(jobId);
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

    logTimeline_(id, req.requesterName, 'APPROVE', STATUS.REVIEW.key, STATUS.REVIEW.key,
      'ผู้ขอรับบริการอนุมัติร่างชิ้นงานแล้ว รอเจ้าหน้าที่ส่งมอบไฟล์ฉบับสมบูรณ์');
    update_(SHEET.REQUESTS, req._row, { updatedAt: nowIso_(), updatedBy: req.requesterEmail });
    return { jobId: id, approved: true };
  });

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
    if (priority && str_(r.priority).toUpperCase() !== priority) return false;
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
        r.requesterPhone, r.assignedTo].join(' ').toLowerCase();
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

  return out.map(function (r) {
    var info = statusInfo_(r.status);
    var pinfo = priorityInfo_(r.priority);
    var due = parseDate_(r.dueDate);
    var daysLeft = due ? daysBetween_(new Date(), due) : null;
    return {
      jobId: r.jobId,
      createdAt: str_(r.createdAt),
      status: info.key,
      statusLabel: info.label,
      statusColor: info.color,
      priority: pinfo.key,
      priorityLabel: pinfo.label,
      priorityColor: pinfo.color,
      requesterName: r.requesterName,
      requesterEmail: r.requesterEmail,
      requesterPhone: r.requesterPhone,
      department: r.department,
      projectName: r.projectName,
      dueDate: str_(r.dueDate),
      daysLeft: daysLeft,
      overdue: daysLeft !== null && daysLeft < 0 && str_(r.status) !== STATUS.DELIVERED.key &&
        str_(r.status) !== STATUS.CANCELLED.key,
      assignedTo: str_(r.assignedTo),
      revisionCount: int_(r.revisionCount),
      revisionLimit: int_(r.revisionLimit),
      attachmentCount: int_(r.attachmentCount),
      briefStatus: str_(r.briefStatus),
      folderUrl: str_(r.folderUrl),
      draftUrl: str_(r.draftUrl)
    };
  });
}
