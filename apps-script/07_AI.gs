/**
 * 07_AI.gs — สรุปคำตอบจากแบบฟอร์มให้เป็น Design Brief มาตรฐานด้วย Claude
 *
 * ถ้าไม่ได้ตั้งค่า API key หรือเรียก API ไม่สำเร็จ ระบบจะสรุปด้วยสูตรสำเร็จแทน
 * เพื่อให้เจ้าหน้าที่มี Design Brief ใช้งานได้เสมอ
 */

var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2023-06-01';

/** โครงสร้าง JSON ที่บังคับให้โมเดลตอบกลับ */
var BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    objective: { type: 'string', description: 'วัตถุประสงค์ของชิ้นงาน 1-2 ประโยค' },
    targetAudience: { type: 'string', description: 'กลุ่มเป้าหมายที่ชัดเจน' },
    keyMessage: { type: 'string', description: 'ข้อความหลักที่ต้องสื่อสาร' },
    toneAndStyle: { type: 'string', description: 'โทนและแนวทางการออกแบบที่เหมาะสม' },
    deliverables: { type: 'string', description: 'ชิ้นงานและขนาดที่ต้องผลิต' },
    deadline: { type: 'string', description: 'กำหนดส่งและข้อสังเกตเรื่องเวลา' },
    mandatoryElements: {
      type: 'array', items: { type: 'string' },
      description: 'องค์ประกอบที่ต้องมีบนชิ้นงาน เช่น ตราสัญลักษณ์ วัน เวลา สถานที่ QR code'
    },
    missingInfo: {
      type: 'array', items: { type: 'string' },
      description: 'ข้อมูลที่ยังขาดและควรสอบถามผู้ขอรับบริการให้ครบในคราวเดียว'
    }
  },
  required: ['objective', 'targetAudience', 'keyMessage', 'toneAndStyle',
    'deliverables', 'deadline', 'mandatoryElements', 'missingInfo'],
  additionalProperties: false
};

var BRIEF_SYSTEM_PROMPT = [
  'คุณเป็นผู้ช่วยของนักประชาสัมพันธ์ ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์',
  'หน้าที่ของคุณคือแปลงคำตอบในแบบฟอร์มขอรับบริการออกแบบให้เป็น Design Brief มาตรฐานภาษาไทย',
  'ที่นักออกแบบอ่านแล้วเริ่มงานได้ทันที',
  '',
  'หลักการ:',
  '- ใช้เฉพาะข้อมูลที่ผู้ขอรับบริการกรอกมาเท่านั้น ห้ามแต่งข้อเท็จจริงเพิ่ม เช่น วัน เวลา สถานที่ ชื่อวิทยากร',
  '- เขียนกระชับ เป็นภาษาราชการที่อ่านง่าย ไม่ต้องมีคำนำหรือคำลงท้าย',
  '- ระบุใน missingInfo เฉพาะข้อมูลที่จำเป็นต่อการเริ่มออกแบบแต่ยังไม่มีในคำขอ',
  '  เขียนเป็นคำถามสั้น ๆ ที่ส่งถามผู้ขอรับบริการได้ทันทีในคราวเดียว',
  '- ถ้าข้อมูลครบถ้วนดีแล้ว ให้ missingInfo เป็น array ว่าง'
].join('\n');

/** ประกอบข้อมูลคำขอเป็นข้อความสำหรับส่งให้โมเดล */
function buildBriefPrompt_(full) {
  var r = full.request;
  var items = full.deliverables.map(function (d) {
    var line = '- ' + str_(d.mediaLabel) + ' ขนาด ' + str_(d.size) + ' จำนวน ' + int_(d.quantity) + ' ชิ้น';
    if (str_(d.note)) line += ' (หมายเหตุ: ' + str_(d.note) + ')';
    return line;
  }).join('\n');

  var files = full.attachments.filter(function (a) { return str_(a.kind) === 'source'; })
    .map(function (a) { return '- ' + str_(a.fileName); }).join('\n');

  var lines = [
    'ข้อมูลจากแบบฟอร์มขอรับบริการออกแบบสื่อประชาสัมพันธ์',
    '',
    'เลขที่คำขอ: ' + str_(r.jobId),
    'ชื่อโครงการ/กิจกรรม: ' + str_(r.projectName),
    'หน่วยงานผู้ขอ: ' + str_(r.department),
    'ผู้ประสานงาน: ' + str_(r.requesterName),
    'วันจัดกิจกรรม: ' + (str_(r.eventDate) ? formatThaiDate_(r.eventDate) : 'ไม่ได้ระบุ'),
    'กำหนดใช้งานชิ้นงาน: ' + formatThaiDate_(r.dueDate),
    'ช่องทางเผยแพร่: ' + str_(r.channels),
    '',
    'วัตถุประสงค์ที่ผู้ขอระบุ:',
    str_(r.objective),
    '',
    'กลุ่มเป้าหมายที่ผู้ขอระบุ:',
    str_(r.targetAudience),
    '',
    'ข้อความหลักที่ต้องการสื่อ:',
    str_(r.keyMessage),
    '',
    'ข้อความบังคับที่ต้องปรากฏบนชิ้นงาน:',
    str_(r.mandatoryText) || 'ไม่ได้ระบุ',
    '',
    'รายการชิ้นงานที่ขอ:',
    items || 'ไม่ได้ระบุ',
    '',
    'ลิงก์ตัวอย่างอ้างอิง: ' + (str_(r.referenceUrl) || 'ไม่ได้ระบุ'),
    'หมายเหตุเพิ่มเติม: ' + (str_(r.notes) || 'ไม่มี'),
    'เหตุผลความเร่งด่วน: ' + (str_(r.rushReason) || 'ไม่มี'),
    '',
    'ไฟล์ที่แนบมา:',
    files || 'ไม่มีไฟล์แนบ'
  ];
  return lines.join('\n');
}

/** เรียก Claude API คืน object ตาม BRIEF_SCHEMA หรือโยน error */
function callClaudeForBrief_(promptText) {
  var apiKey = getProp_(PROP.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error('NO_API_KEY');

  var model = getSetting_('aiModel', DEFAULT_SETTINGS.aiModel);
  var payload = {
    model: model,
    max_tokens: 4000,
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: promptText }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: BRIEF_SCHEMA }
    }
  };

  var headers = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION
  };

  // เปิดใช้ server-side fallback เฉพาะรุ่นที่รองรับ เพื่อไม่ให้คำขอถูกปฏิเสธแล้วจบ
  if (model.indexOf('claude-opus-5') === 0 || model.indexOf('claude-fable-5') === 0) {
    payload.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  var lastError = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    var res = UrlFetchApp.fetch(ANTHROPIC_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();

    if (code === 200) {
      var body = JSON.parse(text);
      if (str_(body.stop_reason) === 'refusal') {
        throw new Error('โมเดลปฏิเสธคำขอนี้ (refusal) จึงใช้การสรุปอัตโนมัติแทน');
      }
      var content = body.content || [];
      for (var i = 0; i < content.length; i++) {
        if (content[i].type === 'text' && str_(content[i].text)) {
          return JSON.parse(content[i].text);
        }
      }
      throw new Error('ไม่พบเนื้อหาที่ตอบกลับจากโมเดล');
    }

    lastError = new Error('Claude API ตอบกลับรหัส ' + code + ': ' + truncate_(text, 300));
    // 429 และ 5xx ลองใหม่ได้ ส่วน 4xx อื่น ๆ ไม่ต้องลองซ้ำ
    if (code !== 429 && code < 500) break;
    Utilities.sleep(attempt * 2000);
  }
  throw lastError || new Error('เรียก Claude API ไม่สำเร็จ');
}

/** สรุป Design Brief ด้วยสูตรสำเร็จ (ใช้เมื่อไม่มี AI) */
function fallbackBrief_(full) {
  var r = full.request;
  var items = full.deliverables.map(function (d) {
    return str_(d.mediaLabel) + ' ขนาด ' + str_(d.size) + ' จำนวน ' + int_(d.quantity) + ' ชิ้น';
  }).join(' / ');

  var missing = [];
  if (!str_(r.mandatoryText)) missing.push('ข้อความบังคับบนชิ้นงาน เช่น ชื่องาน วัน เวลา สถานที่ ผู้จัด');
  if (!str_(r.eventDate)) missing.push('วันที่จัดกิจกรรม');
  if (!str_(r.referenceUrl)) missing.push('ตัวอย่างงานอ้างอิงหรือแนวทางที่ชอบ');
  if (int_(r.attachmentCount) === 0) missing.push('ไฟล์ประกอบ เช่น ตราสัญลักษณ์เวกเตอร์ ภาพความละเอียดสูง');

  return {
    objective: str_(r.objective),
    targetAudience: str_(r.targetAudience),
    keyMessage: str_(r.keyMessage),
    toneAndStyle: 'ใช้อัตลักษณ์องค์กร (CI) ของคณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์ เป็นหลัก',
    deliverables: items,
    deadline: 'กำหนดใช้งาน ' + formatThaiDate_(r.dueDate) +
      (str_(r.rushReason) ? ' (งานเร่งด่วน: ' + str_(r.rushReason) + ')' : ''),
    mandatoryElements: str_(r.mandatoryText)
      ? str_(r.mandatoryText).split('\n').map(function (x) { return str_(x); })
        .filter(function (x) { return !!x; })
      : [],
    missingInfo: missing
  };
}

/** แปลง object ของ brief เป็นข้อความอ่านง่าย */
function briefToText_(brief) {
  var parts = [
    'วัตถุประสงค์: ' + str_(brief.objective),
    'กลุ่มเป้าหมาย: ' + str_(brief.targetAudience),
    'ข้อความหลัก: ' + str_(brief.keyMessage),
    'โทนและแนวทางออกแบบ: ' + str_(brief.toneAndStyle),
    'ชิ้นงานและขนาด: ' + str_(brief.deliverables),
    'กำหนดส่ง: ' + str_(brief.deadline)
  ];
  var must = Array.isArray(brief.mandatoryElements) ? brief.mandatoryElements : [];
  if (must.length > 0) {
    parts.push('องค์ประกอบที่ต้องมี:');
    for (var i = 0; i < must.length; i++) parts.push('  - ' + str_(must[i]));
  }
  return parts.join('\n');
}

/**
 * สร้าง Design Brief ของงานหนึ่งใบแล้วบันทึกลงชีต
 * force = true เพื่อสร้างใหม่ทับของเดิม
 */
function generateBrief_(jobId, force) {
  var full = getRequestFull_(jobId);
  if (!full) throw appError_('ไม่พบเลขที่คำขอ ' + jobId);
  var req = full.request;
  if (!force && str_(req.briefStatus) === 'DONE') {
    return { jobId: req.jobId, skipped: true };
  }

  var brief;
  var source;
  var aiEnabled = getSettingBool_('aiEnabled', true);
  if (aiEnabled && getProp_(PROP.ANTHROPIC_API_KEY)) {
    try {
      brief = callClaudeForBrief_(buildBriefPrompt_(full));
      source = 'AI';
    } catch (err) {
      brief = fallbackBrief_(full);
      source = 'AUTO';
      logTimeline_(req.jobId, 'system', 'BRIEF_FALLBACK', '', '',
        'สรุปด้วย AI ไม่สำเร็จ จึงใช้การสรุปอัตโนมัติแทน: ' + truncate_(err.message, 300));
    }
  } else {
    brief = fallbackBrief_(full);
    source = 'AUTO';
  }

  var missing = Array.isArray(brief.missingInfo) ? brief.missingInfo : [];
  update_(SHEET.REQUESTS, req._row, {
    briefStatus: 'DONE',
    briefText: truncate_(briefToText_(brief), 8000),
    briefMissing: truncate_(missing.join(' | '), 2000),
    briefGeneratedAt: nowIso_(),
    briefSource: source,
    updatedAt: nowIso_()
  });

  logTimeline_(req.jobId, 'system', 'BRIEF', '', '',
    'สรุป Design Brief เรียบร้อย (' + (source === 'AI' ? 'ด้วย AI' : 'อัตโนมัติ') + ')' +
    (missing.length > 0 ? ' พบข้อมูลที่ยังขาด ' + missing.length + ' รายการ' : ' ข้อมูลครบถ้วน'));

  return { jobId: req.jobId, source: source, missing: missing };
}

/* ------------------------------------------------------------ ตัวทำงานเบื้องหลัง */

/** ตั้งทริกเกอร์ให้ทำงานทันที (ใช้ตอนมีคำขอใหม่) */
function scheduleWorker_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'workerOnce') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('workerOnce').timeBased().after(30 * 1000).create();
}

/** ทริกเกอร์ครั้งเดียวหลังมีคำขอใหม่ */
function workerOnce() {
  workerTick();
}

/**
 * งานเบื้องหลังหลัก ทำงานทุก 5 นาที
 *  1) ปิดคำขอที่ผู้ใช้ยื่นแล้วแต่ค้างอยู่ (เช่น ปิดเบราว์เซอร์ระหว่างอัปโหลด)
 *  2) สรุป Design Brief ของคำขอที่ยังไม่ได้สรุป
 */
function workerTick() {
  var rows;
  try {
    rows = readAll_(SHEET.REQUESTS);
  } catch (err) {
    return; // ยังไม่ได้ติดตั้งระบบ
  }

  var now = new Date();

  // 1) ปิดคำขอที่ค้างเกิน 15 นาที
  //    แต่ต้องไม่แตะคำขอที่เพิ่งมีความเคลื่อนไหวใน 10 นาทีล่าสุด
  //    เพราะผู้ใช้อาจกำลังทยอยอัปโหลดไฟล์ขนาดใหญ่อยู่
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (str_(r.submittedAt)) continue;
    var created = parseDate_(r.createdAt);
    if (!created) continue;
    if (now.getTime() - created.getTime() < 15 * 60 * 1000) continue;
    var touched = parseDate_(r.updatedAt);
    if (touched && now.getTime() - touched.getTime() < 10 * 60 * 1000) continue;
    try {
      finalizeRequest_(r.jobId);
    } catch (err) {
      logTimeline_(r.jobId, 'system', 'ERROR', '', '', 'ปิดคำขออัตโนมัติไม่สำเร็จ: ' + err.message);
    }
  }

  // 2) สรุป Design Brief (ครั้งละไม่เกิน 5 ใบ กันเวลาทำงานเกินโควตา)
  var pending = readAll_(SHEET.REQUESTS).filter(function (r) {
    return str_(r.briefStatus) === 'PENDING' && str_(r.submittedAt);
  }).slice(0, 5);

  for (var j = 0; j < pending.length; j++) {
    try {
      generateBrief_(pending[j].jobId, false);
    } catch (err) {
      var row = getRequest_(pending[j].jobId);
      if (row) {
        update_(SHEET.REQUESTS, row._row, { briefStatus: 'ERROR', updatedAt: nowIso_() });
      }
      logTimeline_(pending[j].jobId, 'system', 'ERROR', '', '',
        'สรุป Design Brief ไม่สำเร็จ: ' + truncate_(err.message, 300));
    }
  }
}
