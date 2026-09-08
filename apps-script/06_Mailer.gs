/**
 * 06_Mailer.gs — อีเมลแจ้งเตือนทุกชนิด
 */

/**
 * ทำความสะอาดหัวข้ออีเมล
 * ตัดอักขระขึ้นบรรทัดใหม่ออก เพราะข้อมูลจากผู้ใช้ (เช่น ชื่อโครงการ) ถูกนำมาต่อในหัวข้อ
 * หากมีการขึ้นบรรทัดใหม่ปนมา อาจถูกใช้แทรก header ของอีเมลได้
 */
function mailSubject_(subject) {
  return truncate_(str_(subject).replace(/[\r\n\t]+/g, ' '), 200);
}

/** ส่งอีเมล (คืน true/false ไม่โยน error ออกไปนอกจากผู้เรียกต้องการ) */
function sendMail_(to, subject, htmlBody) {
  var recipients = Array.isArray(to) ? to.join(',') : str_(to);
  if (!recipients) return false;
  MailApp.sendEmail({
    to: recipients,
    subject: mailSubject_(subject),
    htmlBody: htmlBody,
    name: getSetting_('fromName', DEFAULT_SETTINGS.fromName),
    replyTo: getSetting_('replyTo', DEFAULT_SETTINGS.replyTo)
  });
  return true;
}

/**
 * อีเมลของเจ้าของสคริปต์ (บัญชีที่ deploy เว็บแอป)
 * อ่านครั้งแรกแล้วจำไว้ใน Script Properties เพื่อไม่ต้องเรียก Session ซ้ำทุกครั้ง
 */
function ownerEmail_() {
  var saved = getProp_(PROP.OWNER_EMAIL);
  if (saved) return saved;
  var email = '';
  try {
    email = str_(Session.getEffectiveUser().getEmail()).toLowerCase();
  } catch (err) {
    email = '';
  }
  if (email && isValidEmail_(email)) {
    setProp_(PROP.OWNER_EMAIL, email);
    return email;
  }
  return '';
}

/**
 * รายชื่ออีเมลที่ต้องแจ้งเตือนเมื่อมีคำขอใหม่หรือมีความเคลื่อนไหว
 * รวมอีเมลเจ้าของสคริปต์เสมอ เพื่อให้ผู้ออกแบบได้รับแจ้งแน่นอน
 * แม้ค่าตั้งค่า notifyEmails จะถูกแก้ผิดพลาด
 */
function staffRecipients_() {
  var list = splitList_(getSetting_('notifyEmails', DEFAULT_SETTINGS.notifyEmails));
  if (getSettingBool_('notifyOwnerAlways', true)) {
    list.push(ownerEmail_());
  }
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var email = str_(list[i]).toLowerCase();
    if (!email || !isValidEmail_(email) || seen[email]) continue;
    seen[email] = true;
    out.push(email);
  }
  return out;
}

/** โครงอีเมลมาตรฐานของระบบ */
function emailShell_(headline, subline, bodyHtml, ctaLabel, ctaUrl) {
  var cta = '';
  if (ctaLabel && ctaUrl) {
    cta =
      '<tr><td style="padding:8px 32px 32px 32px;">' +
        '<a href="' + escapeHtml_(ctaUrl) + '" ' +
        'style="display:inline-block;background:' + BRAND.primary + ';color:#ffffff;' +
        'text-decoration:none;font-weight:600;padding:13px 30px;border-radius:30px;font-size:15px;">' +
        escapeHtml_(ctaLabel) + '</a>' +
      '</td></tr>';
  }
  return '' +
  '<div style="background:' + BRAND.bg + ';padding:24px 12px;font-family:\'Segoe UI\',Tahoma,sans-serif;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;' +
      'border:1px solid ' + BRAND.border + ';">' +
      '<tr><td style="background:linear-gradient(135deg,' + BRAND.primary + ' 0%,' + BRAND.accent + ' 100%);' +
        'padding:28px 32px;color:#ffffff;">' +
        '<div style="font-size:20px;font-weight:700;line-height:1.4;">' + escapeHtml_(headline) + '</div>' +
        '<div style="font-size:13px;opacity:.92;margin-top:6px;">' + escapeHtml_(subline) + '</div>' +
      '</td></tr>' +
      '<tr><td style="padding:28px 32px 8px 32px;color:' + BRAND.textDark + ';font-size:14px;line-height:1.8;">' +
        bodyHtml +
      '</td></tr>' +
      cta +
      '<tr><td style="padding:18px 32px;background:' + BRAND.bg + ';border-top:1px solid ' + BRAND.border + ';' +
        'color:' + BRAND.textLight + ';font-size:12px;line-height:1.7;">' +
        escapeHtml_(APP.ORG) + '<br>' +
        'อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ หากมีข้อสงสัยกรุณาตอบกลับอีเมลนี้ได้โดยตรง' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}

/** ตารางข้อมูลแบบ key-value สำหรับใส่ในอีเมล */
function emailTable_(pairs) {
  var rows = '';
  for (var i = 0; i < pairs.length; i++) {
    var label = pairs[i][0];
    var value = pairs[i][1];
    if (value === '' || value === null || value === undefined) continue;
    rows +=
      '<tr>' +
        '<td style="padding:7px 12px 7px 0;color:' + BRAND.textLight + ';font-size:13px;' +
          'white-space:nowrap;vertical-align:top;width:38%;">' + escapeHtml_(label) + '</td>' +
        '<td style="padding:7px 0;color:' + BRAND.textDark + ';font-size:13px;font-weight:500;">' +
          value + '</td>' +
      '</tr>';
  }
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
    'style="margin:6px 0 14px 0;border-collapse:collapse;">' + rows + '</table>';
}

/** กล่องเน้นข้อความ */
function emailNotice_(text, color) {
  return '<div style="background:#fff7ed;border-left:4px solid ' + (color || BRAND.primary) + ';' +
    'border-radius:10px;padding:14px 16px;margin:6px 0 16px 0;font-size:13px;line-height:1.75;">' +
    text + '</div>';
}

/** สรุปรายการชิ้นงานเป็น HTML */
function deliverablesHtml_(jobId) {
  var items = filterBy_(SHEET.DELIVERABLES, 'jobId', jobId)
    .sort(function (a, b) { return int_(a.seq) - int_(b.seq); });
  if (items.length === 0) return '';
  var lis = items.map(function (it) {
    var parts = [escapeHtml_(it.mediaLabel)];
    if (str_(it.size)) parts.push('ขนาด ' + escapeHtml_(it.size));
    if (int_(it.quantity) > 1) parts.push('จำนวน ' + int_(it.quantity) + ' ชิ้น');
    return '<li style="margin-bottom:4px;">' + parts.join(' &middot; ') + '</li>';
  }).join('');
  return '<ul style="padding-left:20px;margin:4px 0 14px 0;font-size:13px;line-height:1.7;">' + lis + '</ul>';
}

/* -------------------------------------------------------- อีเมลถึงผู้ขอ */

/** อีเมลยืนยันการรับคำขอ พร้อมเลขที่งานและลิงก์ติดตาม */
function sendConfirmationEmail_(req) {
  var trackUrl = buildTrackUrl_(req);
  var body =
    '<p>เรียน คุณ' + escapeHtml_(req.requesterName) + '</p>' +
    '<p>ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ ได้รับคำขอรับบริการออกแบบสื่อประชาสัมพันธ์ของท่านเรียบร้อยแล้ว ' +
    'โดยระบบได้ออกเลขที่คำขอสำหรับใช้ติดตามสถานะงานดังนี้</p>' +
    '<div style="text-align:center;margin:18px 0 22px 0;">' +
      '<div style="display:inline-block;border:2px dashed ' + BRAND.primary + ';border-radius:14px;' +
        'padding:14px 28px;background:#fff7ed;">' +
        '<div style="font-size:12px;color:' + BRAND.textLight + ';">เลขที่คำขอ (Job ID)</div>' +
        '<div style="font-size:24px;font-weight:700;letter-spacing:1px;color:' + BRAND.primary + ';">' +
          escapeHtml_(req.jobId) + '</div>' +
      '</div>' +
    '</div>' +
    emailTable_([
      ['ชื่อโครงการ / กิจกรรม', escapeHtml_(req.projectName)],
      ['หน่วยงาน', escapeHtml_(req.department)],
      ['วันที่ยื่นคำขอ', escapeHtml_(formatThaiDate_(req.createdAt, true))],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))],
      ['ไฟล์แนบ', int_(req.attachmentCount) + ' ไฟล์']
    ]) +
    '<div style="font-weight:600;margin-bottom:4px;">รายการชิ้นงานที่ขอรับบริการ</div>' +
    deliverablesHtml_(req.jobId) +
    emailNotice_(
      '<strong>ขั้นตอนถัดไป</strong><br>' +
      'เจ้าหน้าที่จะตรวจสอบความครบถ้วนของข้อมูลและจัดลำดับคิวงาน ' +
      'ท่านสามารถติดตามสถานะได้ตลอดเวลาจากลิงก์ด้านล่าง ' +
      'และจะได้รับอีเมลแจ้งเตือนทุกครั้งที่สถานะงานเปลี่ยนแปลง<br>' +
      'สิทธิ์การแก้ไขชิ้นงาน: ไม่เกิน <strong>' + int_(req.revisionLimit) + ' รอบ</strong> ต่อหนึ่งคำขอ'
    );
  return sendMail_(req.requesterEmail,
    '[' + req.jobId + '] ยืนยันการรับคำขอออกแบบสื่อประชาสัมพันธ์',
    emailShell_('รับคำขอเรียบร้อยแล้ว', APP.ORG, body,
      trackUrl ? 'ติดตามสถานะงาน' : '', trackUrl));
}

/** อีเมลแจ้งเมื่อสถานะเปลี่ยน */
function sendStatusChangeEmail_(req, fromStatus, toStatus, detail) {
  var info = statusInfo_(toStatus);
  var trackUrl = buildTrackUrl_(req);
  var intro = '';
  var extra = '';
  var ctaLabel = 'ดูรายละเอียดงาน';
  var ctaUrl = trackUrl;

  if (toStatus === STATUS.DESIGNING.key) {
    intro = 'ฝ่ายสื่อสารองค์กรได้เริ่มดำเนินการออกแบบชิ้นงานของท่านแล้ว';
  } else if (toStatus === STATUS.REVIEW.key) {
    intro = 'ร่างชิ้นงานพร้อมให้ท่านตรวจสอบแล้ว กรุณาตรวจร่างและแจ้งจุดแก้ไขผ่านระบบ ' +
      'เพื่อให้การสื่อสารครบถ้วนในคราวเดียว';
    extra = emailNotice_(
      'สิทธิ์การแก้ไขคงเหลือ <strong>' +
      Math.max(0, int_(req.revisionLimit) - int_(req.revisionCount)) + ' รอบ</strong> ' +
      'จากทั้งหมด ' + int_(req.revisionLimit) + ' รอบ' +
      (str_(req.draftUrl) ? '<br>ลิงก์ร่างชิ้นงาน: <a href="' + escapeHtml_(req.draftUrl) + '">' +
        escapeHtml_(req.draftUrl) + '</a>' : '')
    );
    ctaLabel = 'ตรวจร่างและแจ้งแก้ไข';
  } else if (toStatus === STATUS.REVISING.key) {
    intro = 'ระบบได้รับข้อแก้ไขของท่านแล้ว ฝ่ายสื่อสารองค์กรกำลังปรับแก้ชิ้นงานตามที่แจ้ง';
  } else if (toStatus === STATUS.DELIVERED.key) {
    intro = 'ชิ้นงานของท่านเสร็จสมบูรณ์และส่งมอบเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ';
    var files = listAttachments_(req.jobId, 'final');
    if (files.length > 0) {
      var lis = files.map(function (f) {
        return '<li style="margin-bottom:5px;"><a href="' + escapeHtml_(f.fileUrl) + '" ' +
          'style="color:' + BRAND.primary + ';">' + escapeHtml_(f.fileName) + '</a> ' +
          '<span style="color:' + BRAND.textLight + ';">(' + escapeHtml_(f.sizeLabel) + ')</span></li>';
      }).join('');
      extra = '<div style="font-weight:600;margin-bottom:4px;">ไฟล์ฉบับสมบูรณ์</div>' +
        '<ul style="padding-left:20px;margin:4px 0 14px 0;font-size:13px;">' + lis + '</ul>';
    }
  } else if (toStatus === STATUS.INFO_NEEDED.key) {
    intro = 'เจ้าหน้าที่ขอข้อมูลเพิ่มเติมเพื่อให้สามารถเริ่มออกแบบได้ กรุณาตอบกลับอีเมลฉบับนี้';
    extra = emailNotice_('<strong>ข้อมูลที่ยังขาด</strong><br>' + nl2br_(detail), '#dc2626');
  } else if (toStatus === STATUS.CANCELLED.key) {
    intro = 'คำขอของท่านถูกยกเลิก';
    extra = emailNotice_('<strong>เหตุผล</strong><br>' + nl2br_(req.cancelReason || detail), '#64748b');
  } else {
    intro = 'สถานะคำขอของท่านมีการเปลี่ยนแปลง';
  }

  var body =
    '<p>เรียน คุณ' + escapeHtml_(req.requesterName) + '</p>' +
    '<p>' + escapeHtml_(intro) + '</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['สถานะเดิม', escapeHtml_(statusInfo_(fromStatus).label)],
      ['สถานะปัจจุบัน', '<span style="display:inline-block;background:' + info.color +
        ';color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;">' +
        escapeHtml_(info.label) + '</span>'],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))]
    ]) +
    extra +
    (detail && toStatus !== STATUS.INFO_NEEDED.key && toStatus !== STATUS.CANCELLED.key
      ? emailNotice_('<strong>หมายเหตุจากเจ้าหน้าที่</strong><br>' + nl2br_(detail)) : '');

  return sendMail_(req.requesterEmail,
    '[' + req.jobId + '] สถานะงาน: ' + info.label,
    emailShell_('สถานะงานเปลี่ยนเป็น "' + info.label + '"', req.projectName, body, ctaLabel, ctaUrl));
}

/* --------------------------------------------------- อีเมลถึงเจ้าหน้าที่ */

/** แจ้งเจ้าหน้าที่เมื่อมีคำขอใหม่ */
function sendStaffNewRequestEmail_(req) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var p = priorityInfo_(req.priority);
  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>มีคำขอรับบริการออกแบบเข้ามาใหม่ในระบบ</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ความเร่งด่วน', '<span style="display:inline-block;background:' + p.color +
        ';color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;">' + escapeHtml_(p.label) + '</span>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้ขอรับบริการ', escapeHtml_(req.requesterName) + ' (' + escapeHtml_(req.department) + ')'],
      ['ติดต่อ', escapeHtml_(req.requesterEmail) + ' / ' + escapeHtml_(req.requesterPhone)],
      ['กำหนดใช้งาน', escapeHtml_(formatThaiDate_(req.dueDate))],
      ['ไฟล์แนบ', int_(req.attachmentCount) + ' ไฟล์'],
      ['โฟลเดอร์งาน', '<a href="' + escapeHtml_(req.folderUrl) + '">เปิดโฟลเดอร์ใน Drive</a>']
    ]) +
    '<div style="font-weight:600;margin-bottom:4px;">รายการชิ้นงาน</div>' +
    deliverablesHtml_(req.jobId) +
    (str_(req.rushReason) ? emailNotice_('<strong>เหตุผลความเร่งด่วน</strong><br>' +
      nl2br_(req.rushReason), '#dc2626') : '') +
    emailNotice_('ระบบกำลังสรุป Design Brief ด้วย AI และจะแสดงในหน้าจัดการคำขอภายในไม่กี่นาที');

  return sendMail_(to, '[' + req.jobId + '] คำขอออกแบบใหม่ — ' + str_(req.projectName),
    emailShell_('คำขอใหม่เข้าคิว', p.label + ' | กำหนดใช้งาน ' + formatThaiDate_(req.dueDate),
      body, adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อผู้ขอส่งคำขอแก้ไข */
function sendRevisionToStaffEmail_(req, round, comment) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>ผู้ขอรับบริการส่งข้อแก้ไขร่างชิ้นงานเข้ามาในระบบ</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้แจ้ง', escapeHtml_(req.requesterName)],
      ['รอบการแก้ไข', 'รอบที่ ' + int_(round) + ' จาก ' + int_(req.revisionLimit) + ' รอบ']
    ]) +
    emailNotice_('<strong>จุดที่ขอแก้ไข</strong><br>' + nl2br_(comment));
  return sendMail_(to, '[' + req.jobId + '] ขอแก้ไขร่างรอบที่ ' + int_(round),
    emailShell_('มีคำขอแก้ไขร่างชิ้นงาน', req.projectName, body,
      adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}

/** แจ้งเจ้าหน้าที่เมื่อผู้ขออนุมัติร่าง */
function sendApprovalToStaffEmail_(req) {
  var to = staffRecipients_();
  if (to.length === 0) return false;
  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>ผู้ขอรับบริการอนุมัติร่างชิ้นงานแล้ว สามารถจัดทำไฟล์ฉบับสมบูรณ์และส่งมอบได้</p>' +
    emailTable_([
      ['เลขที่คำขอ', '<strong>' + escapeHtml_(req.jobId) + '</strong>'],
      ['ชื่อโครงการ', escapeHtml_(req.projectName)],
      ['ผู้อนุมัติ', escapeHtml_(req.requesterName)],
      ['ใช้รอบแก้ไขไป', int_(req.revisionCount) + ' จาก ' + int_(req.revisionLimit) + ' รอบ']
    ]);
  return sendMail_(to, '[' + req.jobId + '] ผู้ขอรับบริการอนุมัติร่างแล้ว',
    emailShell_('อนุมัติร่างชิ้นงาน', req.projectName, body,
      adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}

/** สรุปงานค้างประจำวันถึงเจ้าหน้าที่ (ทริกเกอร์ 08:00 น.) */
function dailyReminder() {
  var to = staffRecipients_();
  if (to.length === 0) return;
  var rows = readAll_(SHEET.REQUESTS).filter(function (r) {
    var s = str_(r.status);
    return s !== STATUS.DELIVERED.key && s !== STATUS.CANCELLED.key;
  });
  if (rows.length === 0) return;

  var today = new Date();
  var overdue = [];
  var dueSoon = [];
  var waiting = [];
  for (var i = 0; i < rows.length; i++) {
    var left = daysBetween_(today, rows[i].dueDate);
    if (left !== null && left < 0) overdue.push(rows[i]);
    else if (left !== null && left <= 3) dueSoon.push(rows[i]);
    if (str_(rows[i].status) === STATUS.NEW.key) waiting.push(rows[i]);
  }
  if (overdue.length === 0 && dueSoon.length === 0 && waiting.length === 0) return;

  function listHtml(items, note) {
    if (items.length === 0) return '';
    var lis = items.map(function (r) {
      return '<li style="margin-bottom:5px;"><strong>' + escapeHtml_(r.jobId) + '</strong> — ' +
        escapeHtml_(truncate_(r.projectName, 60)) + ' ' +
        '<span style="color:' + BRAND.textLight + ';">(' + escapeHtml_(statusInfo_(r.status).label) +
        ' &middot; กำหนด ' + escapeHtml_(formatThaiDate_(r.dueDate)) + ')</span></li>';
    }).join('');
    return '<div style="font-weight:600;margin:12px 0 4px 0;">' + escapeHtml_(note) + '</div>' +
      '<ul style="padding-left:20px;margin:0 0 8px 0;font-size:13px;">' + lis + '</ul>';
  }

  var adminUrl = safeWebAppUrl_() ? safeWebAppUrl_() + '?page=admin' : '';
  var body =
    '<p>สรุปคิวงานออกแบบประจำวันที่ ' + escapeHtml_(formatThaiDate_(today)) + '</p>' +
    listHtml(overdue, 'เกินกำหนดส่ง (' + overdue.length + ' งาน)') +
    listHtml(dueSoon, 'ครบกำหนดภายใน 3 วัน (' + dueSoon.length + ' งาน)') +
    listHtml(waiting, 'รอเริ่มดำเนินการ (' + waiting.length + ' งาน)');

  sendMail_(to, 'สรุปคิวงานออกแบบประจำวัน ' + formatThaiDate_(today),
    emailShell_('คิวงานประจำวัน', APP.ORG, body, adminUrl ? 'เปิดหน้าจัดการคำขอ' : '', adminUrl));
}
