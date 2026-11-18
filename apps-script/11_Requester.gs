/**
 * 11_Requester.gs — สิ่งที่ผู้ขอรับบริการทำเองได้ผ่านหน้าติดตาม
 *  - ตอบ "รอข้อมูลเพิ่มเติม" พร้อมแนบไฟล์ แล้วงานกลับเข้าคิวอัตโนมัติ
 *  - ประเมินความพึงพอใจหลังส่งมอบ
 * ยืนยันตัวตนด้วย token จากลิงก์ในอีเมล หรืออีเมลที่ใช้ยื่นคำขอ เหมือนหน้าติดตาม
 */

/** ตรวจสิทธิ์ผู้ขอ คืนแถวคำขอ */
function requireRequester_(jobId, email, token) {
  var id = str_(jobId).toUpperCase();
  var req = getRequest_(id);
  if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);
  var ok = (token && verifyTrackToken_(id, token)) ||
    (email && str_(email).toLowerCase() === str_(req.requesterEmail).toLowerCase());
  if (!ok) throw appError_('ไม่มีสิทธิ์ดำเนินการกับคำขอนี้ กรุณาเปิดจากลิงก์ในอีเมล หรือกรอกอีเมลที่ใช้ยื่นคำขอ');
  return req;
}

/* ------------------------------------------- ตอบ "รอข้อมูลเพิ่มเติม" */

/**
 * คำถามล่าสุดที่เจ้าหน้าที่ขอข้อมูลเพิ่ม (จากประวัติ เรียงเก่าไปใหม่)
 * fromStatus คือสถานะก่อนขอข้อมูล ใช้คืนงานกลับไปที่เดิมเมื่อผู้ขอตอบแล้ว
 */
function infoQuestion_(timeline) {
  var found = null;
  for (var i = 0; i < timeline.length; i++) {
    var t = timeline[i];
    if (str_(t.action) === 'STATUS' && str_(t.toStatus) === STATUS.INFO_NEEDED.key) {
      found = { question: str_(t.detail), at: str_(t.at), fromStatus: str_(t.fromStatus), index: i };
    }
  }
  return found;
}

/**
 * ชื่อไฟล์ที่ผู้ขอแนบหลังเจ้าหน้าที่ขอข้อมูลครั้งล่าสุด
 * นับจากลำดับในประวัติ (ทุกครั้งที่แนบจะบันทึก INFO_FILE ต่อท้าย) แทนการเทียบเวลา
 * เพราะไฟล์ที่แนบในวินาทีเดียวกับคำถามจะแยกไม่ออกว่ามาก่อนหรือหลัง
 */
function infoFilesSince_(timeline, question) {
  var from = question ? question.index : -1;
  var names = [];
  for (var i = from + 1; i < timeline.length; i++) {
    if (str_(timeline[i].action) === 'INFO_FILE') names.push(str_(timeline[i].detail).replace(/^[^:]*:\s*/, ''));
  }
  return names;
}

/**
 * ผู้ขอแนบไฟล์ประกอบคำตอบ (ทำได้เฉพาะตอนสถานะรอข้อมูลเพิ่มเติม)
 * จำกัดจำนวนต่อการตอบหนึ่งครั้งตามค่า maxFiles
 */
function uploadInfoFile_(jobId, email, token, payload) {
  var req = requireRequester_(jobId, email, token);
  if (str_(req.status) !== STATUS.INFO_NEEDED.key) {
    throw appError_('แนบไฟล์เพิ่มได้เฉพาะตอนที่เจ้าหน้าที่ขอข้อมูลเพิ่มเติม ' +
      'หากต้องการส่งไฟล์ในขั้นตอนอื่น กรุณาติดต่อฝ่ายสื่อสารองค์กร');
  }
  var timeline = getTimeline_(req.jobId);
  var max = getSettingInt_('maxFiles', 8);
  if (infoFilesSince_(timeline, infoQuestion_(timeline)).length >= max) {
    throw appError_('แนบไฟล์ได้สูงสุด ' + max + ' ไฟล์ต่อการตอบหนึ่งครั้ง');
  }
  var saved = uploadAttachment_(req.jobId, payload, 'source', req.requesterEmail, { skipLimit: true });
  logTimeline_(req.jobId, req.requesterName, 'INFO_FILE', '', '', 'แนบไฟล์ประกอบข้อมูลเพิ่มเติม: ' + saved.fileName);
  return saved;
}

/**
 * ผู้ขอส่งข้อมูลเพิ่มเติม งานกลับไปสถานะก่อนขอข้อมูล (ถ้าไม่ทราบให้กลับไป "รับคำขอ")
 * แจ้งเจ้าหน้าที่ทางอีเมล และนับกำหนดส่งร่างแรกใหม่จากวันที่ข้อมูลครบ
 */
function submitInfoReply_(jobId, email, token, answer) {
  var id = str_(jobId).toUpperCase();
  var result = withLock_(function () {
    var req = requireRequester_(id, email, token);
    if (str_(req.status) !== STATUS.INFO_NEEDED.key) {
      throw appError_('คำขอนี้ไม่ได้อยู่ในสถานะรอข้อมูลเพิ่มเติมแล้ว ' +
        'อาจมีเจ้าหน้าที่ดำเนินการต่อไปแล้ว กรุณารีเฟรชหน้านี้');
    }
    var timeline = getTimeline_(id);
    var q = infoQuestion_(timeline) || { question: '', at: '', fromStatus: '', index: -1 };
    var files = infoFilesSince_(timeline, q);
    var text = truncate_(answer, 3000);
    if (text.length < 2 && files.length === 0) {
      throw appError_('กรุณาพิมพ์ข้อมูลที่ต้องการส่ง หรือแนบไฟล์อย่างน้อย 1 ไฟล์');
    }

    var back = str_(q.fromStatus).toUpperCase();
    var allowed = [STATUS.NEW.key, STATUS.DESIGNING.key, STATUS.REVIEW.key, STATUS.REVISING.key];
    if (allowed.indexOf(back) < 0) back = STATUS.NEW.key;

    insert_(SHEET.REPLIES, {
      id: newId_('Q'),
      jobId: id,
      createdAt: nowIso_(),
      byName: str_(req.requesterName),
      byEmail: str_(req.requesterEmail),
      question: truncate_(q.question, 2000),
      answer: text,
      fileCount: files.length,
      returnedTo: back
    });
    update_(SHEET.REQUESTS, req._row, {
      status: back,
      attachmentCount: filterBy_(SHEET.ATTACHMENTS, 'jobId', id).length,
      updatedAt: nowIso_(),
      updatedBy: str_(req.requesterEmail)
    });
    logTimeline_(id, req.requesterName, 'INFO_REPLY', STATUS.INFO_NEEDED.key, back,
      'ผู้ขอส่งข้อมูลเพิ่มเติม' + (files.length ? ' พร้อมไฟล์ ' + files.length + ' ไฟล์' : '') +
      (text ? ': ' + truncate_(text, 300) : ''));
    return { jobId: id, status: back, statusLabel: statusInfo_(back).label, fileCount: files.length,
      answer: text, question: q.question, fileNames: files };
  });

  try {
    sendInfoReplyToStaffEmail_(getRequest_(id), result);
  } catch (err) {
    logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องข้อมูลเพิ่มเติมไม่สำเร็จ: ' + err.message);
  }
  return { jobId: result.jobId, status: result.status, statusLabel: result.statusLabel, fileCount: result.fileCount };
}

/** ข้อมูลที่ผู้ขอตอบกลับ สำหรับหน้าเจ้าหน้าที่ */
function replyView_(r) {
  return {
    createdAt: str_(r.createdAt),
    byName: str_(r.byName),
    question: str_(r.question),
    answer: str_(r.answer),
    fileCount: int_(r.fileCount),
    returnedTo: str_(r.returnedTo),
    returnedToLabel: str_(r.returnedTo) ? statusInfo_(r.returnedTo).label : ''
  };
}

/* ------------------------------------------- ประเมินความพึงพอใจ */

var RATING_LABELS = ['', 'ควรปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'ดีเยี่ยม'];

function feedbackView_(f) {
  if (!f) return null;
  var rating = int_(f.rating);
  return {
    rating: rating,
    ratingLabel: RATING_LABELS[rating] || '',
    comment: str_(f.comment),
    createdAt: str_(f.createdAt),
    updatedAt: str_(f.updatedAt)
  };
}

/**
 * ผู้ขอประเมินความพึงพอใจหลังส่งมอบ (1-5) แก้คะแนนภายหลังได้ เก็บงานละหนึ่งแถว
 * คะแนน 1-2 แจ้งเจ้าหน้าที่ทันที เพื่อให้ติดต่อกลับได้เร็ว
 */
function submitFeedback_(jobId, email, token, rating, comment) {
  var id = str_(jobId).toUpperCase();
  var score = int_(rating, 0);
  if (score < 1 || score > 5) throw appError_('กรุณาเลือกคะแนน 1 ถึง 5 ดาว');
  var text = truncate_(comment, 1000);

  var result = withLock_(function () {
    var req = requireRequester_(id, email, token);
    if (str_(req.status) !== STATUS.DELIVERED.key) {
      throw appError_('ประเมินความพึงพอใจได้หลังจากส่งมอบชิ้นงานแล้วเท่านั้น');
    }
    var existing = findBy_(SHEET.FEEDBACK, 'jobId', id);
    var previous = existing ? int_(existing.rating) : 0;
    if (existing) {
      update_(SHEET.FEEDBACK, existing._row, { rating: score, comment: text, updatedAt: nowIso_() });
    } else {
      insert_(SHEET.FEEDBACK, {
        id: newId_('S'), jobId: id, createdAt: nowIso_(), updatedAt: nowIso_(),
        rating: score, comment: text, byEmail: str_(req.requesterEmail)
      });
    }
    logTimeline_(id, req.requesterName, 'FEEDBACK', '', '',
      (existing ? 'ผู้ขอแก้ไขผลประเมินเป็น ' : 'ผู้ขอประเมินความพึงพอใจ ') + score + '/5' +
      (text ? ': ' + truncate_(text, 200) : ''));
    return { jobId: id, rating: score, updated: !!existing, alert: score <= 2 && (previous === 0 || previous > 2) };
  });

  if (result.alert) {
    try {
      sendLowRatingEmail_(getRequest_(id), score, text);
    } catch (err) {
      logTimeline_(id, 'system', 'EMAIL_ERROR', '', '', 'แจ้งเจ้าหน้าที่เรื่องผลประเมินไม่สำเร็จ: ' + err.message);
    }
  }
  return { jobId: id, rating: result.rating, updated: result.updated };
}
