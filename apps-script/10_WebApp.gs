/**
 * 10_WebApp.gs — จุดเชื่อมระหว่างหน้าเว็บกับฝั่งเซิร์ฟเวอร์
 *
 * ทุกฟังก์ชันที่ขึ้นต้นด้วย api* ถูกเรียกจากเบราว์เซอร์ผ่าน google.script.run
 * และคืนค่ารูปแบบเดียวกันเสมอ: { ok: true, data: ... } หรือ { ok: false, error: 'ข้อความ' }
 */

/** อนุญาตเฉพาะอักขระที่ปลอดภัย ป้องกันการแทรกโค้ดผ่านพารามิเตอร์ใน URL */
function sanitizeParam_(value, pattern, maxLength) {
  var s = str_(value).replace(pattern, '');
  return truncate_(s, maxLength);
}

/**
 * แปลง object เป็น JSON สำหรับฝังในแท็ก script
 * หลบอักขระ < > & เพื่อไม่ให้ปิดแท็ก script ได้
 */
function jsonForHtml_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** แสดงหน้าเว็บ */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var page = sanitizeParam_(params.page, /[^a-z]/g, 20);
  var allowedPages = ['home', 'form', 'track', 'login', 'admin', 'setup'];
  if (allowedPages.indexOf(page) < 0) page = 'home';

  // ติดตั้งระบบให้อัตโนมัติเมื่อเปิดเว็บแอปครั้งแรก
  var installError = '';
  try {
    ensureInstalled_();
    rememberWebAppUrl_();
  } catch (err) {
    installError = err.message || String(err);
    console.error('ติดตั้งระบบอัตโนมัติไม่สำเร็จ: ' + installError);
  }

  // ฝังข้อมูลตั้งต้นมากับหน้าเว็บเลย หน้าแรกจึงแสดงได้ทันทีโดยไม่ต้องเรียกเซิร์ฟเวอร์ซ้ำอีกรอบ
  var cfg = null;
  if (!installError) {
    try {
      cfg = bootstrapData_();
    } catch (err) {
      cfg = null; // หน้าเว็บจะเรียก apiBootstrap เองและแสดงข้อความผิดพลาดให้
    }
  }

  var boot = {
    cfg: cfg,
    page: page,
    jobId: sanitizeParam_(params.job, /[^A-Za-z0-9-]/g, 30).toUpperCase(),
    trackToken: sanitizeParam_(params.t, /[^A-Za-z0-9_-]/g, 64),
    setupKey: sanitizeParam_(params.k, /[^A-Za-z0-9]/g, 32).toUpperCase(),
    installError: truncate_(installError, 300),
    appName: APP.NAME,
    org: APP.ORG,
    version: APP.VERSION
  };
  var template = HtmlService.createTemplateFromFile('page_App');
  template.boot = jsonForHtml_(boot);
  return template.evaluate()
    .setTitle(APP.NAME + ' | ' + APP.ORG_SHORT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** แทรกไฟล์ HTML อื่นเข้ามาในหน้า */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** ห่อผลลัพธ์ให้เป็นรูปแบบเดียวกัน และแปลง error เป็นข้อความภาษาไทย */
function respond_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    var message = (err && err.message) ? err.message : String(err);
    if (!err || !err.userFacing) {
      console.error(message + (err && err.stack ? '\n' + err.stack : ''));
      if (message.indexOf('ไม่พบ') < 0 && message.indexOf('กรุณา') < 0) {
        message = 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหา กรุณาแจ้งฝ่ายสื่อสารองค์กร';
      }
    }
    return { ok: false, error: message, code: (err && err.code) ? String(err.code) : '' };
  }
}

/* ------------------------------------------------------------- สาธารณะ */

/** ข้อมูลตั้งต้นสำหรับหน้าเว็บ */
function apiBootstrap() {
  return respond_(bootstrapData_);
}

/** ข้อมูลตั้งต้นที่ทุกหน้าใช้ (ไม่มีข้อมูลลับ) */
function bootstrapData_() {
  return {
    app: { name: APP.NAME, org: APP.ORG, orgShort: APP.ORG_SHORT, version: APP.VERSION },
    needsFirstAdmin: readAll_(SHEET.USERS).length === 0,
    mediaTypes: MEDIA_TYPES,
    departments: DEPARTMENTS,
    channels: CHANNELS,
    statusFlow: STATUS_FLOW.map(function (k) {
      return { key: k, label: STATUS[k].label, en: STATUS[k].en, step: STATUS[k].step };
    }),
    statusLabels: Object.keys(STATUS).map(function (k) {
      return { key: k, label: STATUS[k].label, color: STATUS[k].color, icon: STATUS[k].icon };
    }),
    settings: {
      revisionLimit: getSettingInt_('revisionLimit', 3),
      minLeadDays: getSettingInt_('minLeadDays', 7),
      slaFirstDraftDays: getSettingInt_('slaFirstDraftDays', 5),
      maxFileMB: getSettingInt_('maxFileMB', 10),
      maxFiles: getSettingInt_('maxFiles', 8),
      allowedFileTypes: getSetting_('allowedFileTypes', DEFAULT_SETTINGS.allowedFileTypes),
      formOpen: getSettingBool_('publicFormOpen', true),
      closedMessage: getSetting_('closedMessage', DEFAULT_SETTINGS.closedMessage),
      contactEmail: getSetting_('replyTo', DEFAULT_SETTINGS.replyTo)
    }
  };
}

var SUBMIT_RATE_LIMIT = 5;

/** ตรวจว่ายื่นคำขอเกินโควตาต่อชั่วโมงหรือยัง (ยังไม่นับเพิ่ม) */
function checkSubmitRate_(email) {
  var count = int_(CacheService.getScriptCache().get('submit:' + str_(email).toLowerCase()), 0);
  if (count >= SUBMIT_RATE_LIMIT) {
    throw appError_('อีเมลนี้ยื่นคำขอครบ ' + SUBMIT_RATE_LIMIT +
      ' รายการภายในหนึ่งชั่วโมงแล้ว กรุณารอสักครู่หรือติดต่อเจ้าหน้าที่โดยตรง');
  }
}

/** นับการยื่นคำขอที่สำเร็จ (ข้อมูลไม่ครบจึงไม่ถูกนับเป็นโควตา) */
function bumpSubmitRate_(email) {
  var cache = CacheService.getScriptCache();
  var key = 'submit:' + str_(email).toLowerCase();
  cache.put(key, String(int_(cache.get(key), 0) + 1), 3600);
}

/** ยื่นคำขอใหม่ (ขั้นตอนที่ 1) */
function apiSubmitRequest(payload) {
  return respond_(function () {
    var email = pick_(payload, 'requesterEmail', '');
    checkSubmitRate_(email);
    var result = createRequest_(payload);
    bumpSubmitRate_(email);
    return result;
  });
}

/** อัปโหลดไฟล์แนบของผู้ขอรับบริการ (ขั้นตอนที่ 2) */
function apiUploadFile(jobId, trackToken, filePayload) {
  return respond_(function () {
    var id = str_(jobId).toUpperCase();
    if (!verifyTrackToken_(id, trackToken)) {
      throw appError_('ไม่มีสิทธิ์แนบไฟล์กับคำขอนี้');
    }
    var req = getRequest_(id);
    if (!req) throw appError_('ไม่พบเลขที่คำขอ ' + id);
    if (str_(req.submittedAt)) {
      throw appError_('คำขอนี้ยืนยันการยื่นแล้ว หากต้องการส่งไฟล์เพิ่มกรุณาติดต่อเจ้าหน้าที่');
    }
    return uploadAttachment_(id, filePayload, 'source', req.requesterEmail);
  });
}

/** ยืนยันการยื่นคำขอ (ขั้นตอนที่ 3) */
function apiFinalizeRequest(jobId, trackToken) {
  return respond_(function () {
    var id = str_(jobId).toUpperCase();
    if (!verifyTrackToken_(id, trackToken)) {
      throw appError_('ไม่มีสิทธิ์ยืนยันคำขอนี้');
    }
    return finalizeRequest_(id);
  });
}

/** ติดตามสถานะงาน */
function apiTrack(jobId, email, token) {
  return respond_(function () {
    var id = str_(jobId).toUpperCase();
    if (!id) throw appError_('กรุณากรอกเลขที่คำขอ');
    var view = getPublicView_(id, email, token);
    if (!view) {
      throw appError_('ไม่พบคำขอที่ตรงกับข้อมูลที่กรอก กรุณาตรวจสอบเลขที่คำขอและอีเมลที่ใช้ยื่นคำขออีกครั้ง');
    }
    return view;
  });
}

/** ผู้ขอรับบริการส่งคำขอแก้ไข */
function apiRequestRevision(jobId, email, token, comment) {
  return respond_(function () {
    return addRevision_(jobId, email, token, comment);
  });
}

/** ผู้ขอรับบริการอนุมัติร่าง */
function apiApproveDraft(jobId, email, token) {
  return respond_(function () {
    return approveDraft_(jobId, email, token);
  });
}

/* ------------------------------------------------------------ เจ้าหน้าที่ */

/** สร้างบัญชีผู้ดูแลระบบคนแรกผ่านหน้าเว็บ (ใช้รหัสติดตั้งจากอีเมล) */
function apiCreateFirstAdmin(setupKey, email, name, password) {
  return respond_(function () {
    return createFirstAdmin_(setupKey, email, name, password);
  });
}

function apiLogin(email, password) {
  return respond_(function () {
    return login_(email, password);
  });
}

function apiVerifySession(token) {
  return respond_(function () {
    return requireAuth_(token);
  });
}

function apiChangePassword(token, currentPassword, newPassword) {
  return respond_(function () {
    return changePassword_(token, currentPassword, newPassword);
  });
}

function apiAdminList(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return listRequests_(filter);
  });
}

/**
 * ตัวเลือกสถานะทั้งหมดสำหรับหน้าจัดการงาน เรียงตามขั้นตอน
 * kind: current = สถานะปัจจุบัน, next = ขั้นถัดไปตามปกติ, skip = ข้ามขั้นหรือย้อนขั้น
 */
function statusOptions_(current) {
  var cur = str_(current).toUpperCase();
  var order = STATUS_FLOW.concat(['INFO_NEEDED', 'CANCELLED']);
  return order.map(function (k) {
    var s = STATUS[k];
    var kind = k === cur ? 'current' : (isNormalTransition_(cur, k) ? 'next' : 'skip');
    return { key: s.key, label: s.label, color: s.color, icon: s.icon, kind: kind };
  });
}

function apiAdminGet(token, jobId) {
  return respond_(function () {
    requireAuth_(token);
    var view = adminJobView_(jobId);
    if (!view) throw appError_('ไม่พบเลขที่คำขอ ' + str_(jobId).toUpperCase());
    return view;
  });
}

/**
 * ข้อมูลงานหนึ่งใบสำหรับหน้าต่างรายละเอียดของเจ้าหน้าที่
 * ทุกคำสั่งที่แก้ไขงานจะส่งข้อมูลนี้กลับมาด้วย หน้าเว็บจึงไม่ต้องโหลดซ้ำอีกรอบ
 * row คือข้อมูลแถวเดียวกันในคิวงาน ใช้อัปเดตตารางโดยไม่ต้องโหลดรายการใหม่ทั้งหมด
 */
function adminJobView_(jobId) {
  var full = getRequestFull_(jobId);
  if (!full) return null;
  var r = full.request;
  var info = statusInfo_(r.status);
  var p = priorityInfo_(livePriority_(r));
  var approval = draftApproval_(full.timeline);
  var inReview = info.key === STATUS.REVIEW.key;
  return {
    request: {
      jobId: r.jobId,
      createdAt: str_(r.createdAt),
      submittedAt: str_(r.submittedAt),
      status: info.key,
      statusLabel: info.label,
      statusColor: info.color,
      nextStatuses: (STATUS_TRANSITIONS[info.key] || []).map(function (k) {
        return { key: k, label: STATUS[k].label, color: STATUS[k].color };
      }),
      statusOptions: statusOptions_(info.key),
      priority: p.key,
      priorityLabel: p.label,
      priorityColor: p.color,
      requesterName: str_(r.requesterName),
      requesterEmail: str_(r.requesterEmail),
      requesterPhone: phoneOut_(r.requesterPhone),
      department: str_(r.department),
      lineId: str_(r.lineId),
      projectName: str_(r.projectName),
      eventDate: str_(r.eventDate),
      dueDate: str_(r.dueDate),
      objective: str_(r.objective),
      targetAudience: str_(r.targetAudience),
      keyMessage: str_(r.keyMessage),
      mandatoryText: str_(r.mandatoryText),
      referenceUrl: str_(r.referenceUrl),
      channels: str_(r.channels),
      notes: str_(r.notes),
      rushReason: str_(r.rushReason),
      folderUrl: str_(r.folderUrl),
      draftUrl: str_(r.draftUrl),
      approved: inReview && approval.approved,
      approvedAt: inReview ? approval.approvedAt : '',
      briefStatus: str_(r.briefStatus),
      briefText: str_(r.briefText),
      briefMissing: str_(r.briefMissing),
      briefSource: str_(r.briefSource),
      briefGeneratedAt: str_(r.briefGeneratedAt),
      revisionCount: int_(r.revisionCount),
      revisionLimit: int_(r.revisionLimit),
      assignedTo: str_(r.assignedTo),
      deliveredAt: str_(r.deliveredAt),
      leadTimeDays: str_(r.leadTimeDays),
      cancelReason: str_(r.cancelReason),
      trackUrl: buildTrackUrl_(r)
    },
    row: listRowView_(r),
    deliverables: full.deliverables.map(function (d) {
      return {
        seq: int_(d.seq), mediaLabel: str_(d.mediaLabel), size: str_(d.size),
        quantity: int_(d.quantity), note: str_(d.note)
      };
    }),
    attachments: full.attachments.map(attachmentView_),
    revisions: full.revisions.map(function (v) {
      return {
        round: int_(v.round), createdAt: str_(v.createdAt), byName: str_(v.byName),
        comment: str_(v.comment), draftUrl: str_(v.draftUrl)
      };
    }),
    timeline: full.timeline.map(function (t) {
      return {
        at: str_(t.at), actor: str_(t.actor), action: str_(t.action),
        fromStatus: str_(t.fromStatus), toStatus: str_(t.toStatus), detail: str_(t.detail),
        fromLabel: str_(t.fromStatus) ? statusInfo_(t.fromStatus).label : '',
        toLabel: str_(t.toStatus) ? statusInfo_(t.toStatus).label : ''
      };
    })
  };
}

function apiAdminChangeStatus(token, jobId, toStatus, options) {
  return respond_(function () {
    var me = requireAuth_(token);
    changeStatus_(jobId, toStatus, me.name || me.email, options);
    return {
      jobId: str_(jobId).toUpperCase(), status: str_(toStatus).toUpperCase(),
      job: adminJobView_(jobId)
    };
  });
}

function apiAdminSetDraftUrl(token, jobId, url) {
  return respond_(function () {
    var me = requireAuth_(token);
    setDraftUrl_(jobId, url, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminAssign(token, jobId, assignee) {
  return respond_(function () {
    var me = requireAuth_(token);
    assignRequest_(jobId, assignee, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminNote(token, jobId, note) {
  return respond_(function () {
    var me = requireAuth_(token);
    addInternalNote_(jobId, note, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminSetRevisionLimit(token, jobId, limit) {
  return respond_(function () {
    var me = requireAuth_(token);
    setRevisionLimit_(jobId, limit, me.name || me.email);
    return { job: adminJobView_(jobId) };
  });
}

function apiAdminUploadFile(token, jobId, filePayload, kind) {
  return respond_(function () {
    var me = requireAuth_(token);
    var fileKind = str_(kind) === 'draft' ? 'draft' : 'final';
    return uploadAttachment_(jobId, filePayload, fileKind, me.name || me.email);
  });
}

function apiAdminDeleteFile(token, attachmentId) {
  return respond_(function () {
    var me = requireAuth_(token);
    var rec = findBy_(SHEET.ATTACHMENTS, 'id', attachmentId);
    deleteAttachment_(attachmentId, me.name || me.email);
    return { job: rec ? adminJobView_(rec.jobId) : null };
  });
}

function apiAdminRegenerateBrief(token, jobId) {
  return respond_(function () {
    requireAuth_(token);
    var result = generateBrief_(jobId, true);
    result.job = adminJobView_(jobId);
    return result;
  });
}

/**
 * ลบคำขอถาวร (เฉพาะผู้ดูแลระบบ)
 * ต้องพิมพ์เลขที่คำขอยืนยันให้ตรง เพื่อกันการกดพลาด
 */
function apiAdminDeleteRequest(token, jobId, confirmText) {
  return respond_(function () {
    var me = requireAdmin_(token);
    var id = str_(jobId).toUpperCase();
    if (str_(confirmText).toUpperCase().replace(/\s/g, '') !== id.replace(/\s/g, '')) {
      throw appError_('กรุณาพิมพ์เลขที่คำขอ ' + id + ' ให้ตรงเพื่อยืนยันการลบ');
    }
    return deleteRequest_(id, me.name || me.email);
  });
}

/**
 * ล้างคำขอทั้งหมดเพื่อเริ่มใช้งานจริง (เฉพาะผู้ดูแลระบบ)
 * เก็บบัญชีเจ้าหน้าที่และค่าตั้งค่าไว้
 */
var RESET_CONFIRM_TEXT = 'ล้างข้อมูลทั้งหมด';

function apiAdminResetData(token, confirmText) {
  return respond_(function () {
    var me = requireAdmin_(token);
    if (str_(confirmText) !== RESET_CONFIRM_TEXT) {
      throw appError_('กรุณาพิมพ์ข้อความ "' + RESET_CONFIRM_TEXT + '" ให้ตรงเพื่อยืนยัน');
    }
    return resetAllRequests_(me.name || me.email);
  });
}

function apiAdminStats(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return getStats_(filter);
  });
}

function apiAdminAssets(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return listAssetLibrary_(filter);
  });
}

function apiAdminExport(token, filter) {
  return respond_(function () {
    requireAuth_(token);
    return exportRows_(filter);
  });
}

function apiAdminSettings(token) {
  return respond_(function () {
    requireAdmin_(token);
    var s = getSettings_();
    var out = [];
    for (var key in DEFAULT_SETTINGS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
      out.push({ key: key, value: str_(s[key]) });
    }
    var base = safeWebAppUrl_();
    return {
      settings: out,
      hasApiKey: !!getProp_(PROP.ANTHROPIC_API_KEY),
      notifyTo: staffRecipients_(),
      ownerEmail: ownerEmail_(),
      links: {
        publicUrl: base,
        formUrl: base ? base + '?page=form' : '',
        trackUrl: base ? base + '?page=track' : '',
        staffUrl: base ? base + '?page=login' : '',
        spreadsheetUrl: (function () {
          var id = getProp_(PROP.SPREADSHEET_ID);
          return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '';
        })(),
        driveUrl: (function () {
          var id = getProp_(PROP.ROOT_FOLDER_ID);
          return id ? 'https://drive.google.com/drive/folders/' + id : '';
        })()
      }
    };
  });
}

/** ส่งอีเมลทดสอบไปยังผู้รับแจ้งเตือนทั้งหมด ใช้ตรวจว่าการแจ้งเตือนทำงานจริง */
function apiAdminTestEmail(token) {
  return respond_(function () {
    var me = requireAdmin_(token);
    var to = staffRecipients_();
    if (to.length === 0) {
      throw appError_('ยังไม่มีอีเมลผู้รับแจ้งเตือน กรุณากรอกช่อง "อีเมลเจ้าหน้าที่ที่รับแจ้งเตือน" ก่อน');
    }
    var body =
      '<p>นี่คืออีเมลทดสอบจากระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์</p>' +
      '<p>หากท่านได้รับอีเมลฉบับนี้ แปลว่าการแจ้งเตือนคำขอใหม่จะส่งถึงท่านได้แน่นอน</p>' +
      emailTable_([
        ['ผู้ทดสอบ', escapeHtml_(me.name || me.email)],
        ['เวลาที่ทดสอบ', escapeHtml_(formatThaiDate_(new Date(), true))],
        ['ผู้รับทั้งหมด', escapeHtml_(to.join(', '))]
      ]);
    sendMail_(to, 'ทดสอบการแจ้งเตือน — ' + APP.NAME,
      emailShell_('ทดสอบการแจ้งเตือน', APP.ORG, body, '', ''));
    return { sentTo: to };
  });
}

function apiAdminSaveSettings(token, patch) {
  return respond_(function () {
    requireAdmin_(token);
    var p = patch || {};
    // ตรวจทุกช่องก่อน ถ้ามีช่องใดผิดจะไม่บันทึกอะไรเลย
    // (เดิมบันทึกทีละช่อง ช่องก่อนหน้าช่องที่ผิดจึงถูกบันทึกไปครึ่งเดียว)
    var clean = {};
    var errors = [];
    for (var key in p) {
      if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
      try {
        clean[key] = sanitizeSetting_(key, p[key]);
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (errors.length > 0) throw appError_(errors.join('\n'));

    var current = getSettings_();
    var saved = 0;
    withLock_(function () {
      for (var k in clean) {
        if (str_(current[k]) === clean[k]) continue;
        setSetting_(k, clean[k]);
        saved++;
      }
    });
    // ส่งค่าที่หน้าเว็บใช้กลับไป แบบฟอร์มจะเปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช
    return { saved: saved, settings: bootstrapData_().settings };
  });
}

/** บันทึกหรือลบ API key ของ Claude (เก็บใน Script Properties ไม่แสดงกลับหน้าเว็บ) */
function apiAdminSetApiKey(token, apiKey) {
  return respond_(function () {
    requireAdmin_(token);
    var key = str_(apiKey);
    if (!key) {
      props_().deleteProperty(PROP.ANTHROPIC_API_KEY);
      return { hasApiKey: false };
    }
    if (key.indexOf('sk-ant-') !== 0) {
      throw appError_('รูปแบบ API key ไม่ถูกต้อง ต้องขึ้นต้นด้วย sk-ant-');
    }
    setProp_(PROP.ANTHROPIC_API_KEY, key);
    return { hasApiKey: true };
  });
}

function apiAdminUsers(token) {
  return respond_(function () {
    return listUsers_(token);
  });
}

function apiAdminSaveUser(token, payload) {
  return respond_(function () {
    return saveUser_(token, payload);
  });
}
