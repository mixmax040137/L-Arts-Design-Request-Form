/**
 * 09_Stats.gs — สรุปสถิติสำหรับแดชบอร์ดและรายงานประจำปี
 */

/**
 * สถิติภาพรวม
 * filter: { from, to }  (ถ้าไม่ระบุจะนับทั้งหมด)
 */
function getStats_(filter) {
  var f = filter || {};
  var from = startOfDay_(f.from);
  var to = f.to ? new Date(startOfDay_(f.to).getTime() + 86400000) : null;

  var all = readAll_(SHEET.REQUESTS);
  var rows = all.filter(function (r) {
    var created = parseDate_(r.createdAt);
    if (!created) return false;
    if (from && created < from) return false;
    if (to && created >= to) return false;
    return true;
  });

  var jobIds = {};
  for (var i = 0; i < rows.length; i++) jobIds[str_(rows[i].jobId)] = true;

  // นับตามสถานะ
  var statusCount = {};
  var keys = Object.keys(STATUS);
  for (var k = 0; k < keys.length; k++) statusCount[keys[k]] = 0;

  var today = new Date();
  var totals = { all: rows.length, active: 0, delivered: 0, overdue: 0, cancelled: 0 };
  var leadTimes = [];
  var revisionCounts = [];
  var onTime = 0;
  var onTimeBase = 0;
  var firstDraftDays = [];

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var st = str_(row.status).toUpperCase();
    if (statusCount[st] === undefined) statusCount[st] = 0;
    statusCount[st]++;

    if (st === STATUS.DELIVERED.key) {
      totals.delivered++;
      var lt = int_(row.leadTimeDays, -1);
      if (lt >= 0) leadTimes.push(lt);
      revisionCounts.push(int_(row.revisionCount));
      var due = parseDate_(row.dueDate);
      var deliveredAt = parseDate_(row.deliveredAt);
      if (due && deliveredAt) {
        onTimeBase++;
        if (daysBetween_(deliveredAt, due) >= 0) onTime++;
      }
      var fd = daysBetween_(row.submittedAt || row.createdAt, row.firstDraftAt);
      if (fd !== null && fd >= 0) firstDraftDays.push(fd);
    } else if (st === STATUS.CANCELLED.key) {
      totals.cancelled++;
    } else {
      totals.active++;
      var left = daysBetween_(today, row.dueDate);
      if (left !== null && left < 0) totals.overdue++;
    }
  }

  var byStatus = [];
  for (var s = 0; s < keys.length; s++) {
    var info = STATUS[keys[s]];
    byStatus.push({
      key: info.key,
      label: info.label,
      color: info.color,
      count: statusCount[info.key] || 0
    });
  }

  // นับตามประเภทสื่อ (นับตามจำนวนรายการชิ้นงาน)
  var mediaCount = {};
  var deliverables = readAll_(SHEET.DELIVERABLES);
  for (var d = 0; d < deliverables.length; d++) {
    if (!jobIds[str_(deliverables[d].jobId)]) continue;
    var label = str_(deliverables[d].mediaLabel) || 'ไม่ระบุ';
    mediaCount[label] = (mediaCount[label] || 0) + 1;
  }
  var byMedia = Object.keys(mediaCount).map(function (label) {
    return { label: label, count: mediaCount[label] };
  }).sort(function (a, b) { return b.count - a.count; });

  // นับตามหน่วยงาน
  var deptCount = {};
  for (var q = 0; q < rows.length; q++) {
    var dept = str_(rows[q].department) || 'ไม่ระบุ';
    deptCount[dept] = (deptCount[dept] || 0) + 1;
  }
  var byDepartment = Object.keys(deptCount).map(function (label) {
    return { label: label, count: deptCount[label] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);

  // นับรายเดือน 12 เดือนล่าสุด
  var monthMap = {};
  for (var m = 0; m < rows.length; m++) {
    var created = parseDate_(rows[m].createdAt);
    if (!created) continue;
    var key = Utilities.formatDate(created, APP.TIMEZONE, 'yyyy-MM');
    if (!monthMap[key]) monthMap[key] = { received: 0, delivered: 0 };
    monthMap[key].received++;
    if (str_(rows[m].status) === STATUS.DELIVERED.key) monthMap[key].delivered++;
  }
  var byMonth = Object.keys(monthMap).sort().slice(-12).map(function (key) {
    var parts = key.split('-');
    var monthIdx = int_(parts[1]) - 1;
    return {
      key: key,
      label: THAI_MONTHS[monthIdx].substring(0, 3) + ' ' + (int_(parts[0]) + 543 - 2500),
      received: monthMap[key].received,
      delivered: monthMap[key].delivered
    };
  });

  function average(arr) {
    if (arr.length === 0) return null;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    return Math.round((sum / arr.length) * 10) / 10;
  }

  return {
    generatedAt: nowIso_(),
    range: {
      from: f.from ? str_(f.from) : '',
      to: f.to ? str_(f.to) : ''
    },
    totals: totals,
    byStatus: byStatus,
    byMedia: byMedia,
    byDepartment: byDepartment,
    byMonth: byMonth,
    avgLeadTimeDays: average(leadTimes),
    avgFirstDraftDays: average(firstDraftDays),
    avgRevisions: average(revisionCounts),
    onTimeRate: onTimeBase > 0 ? Math.round((onTime / onTimeBase) * 100) : null,
    briefCoverage: (function () {
      var withBrief = rows.filter(function (r) { return str_(r.briefStatus) === 'DONE'; }).length;
      return rows.length > 0 ? Math.round((withBrief / rows.length) * 100) : null;
    })(),
    completeOnFirstSubmit: (function () {
      // ร้อยละของคำขอที่ข้อมูลครบตั้งแต่ครั้งแรก (ไม่ถูกตีกลับขอข้อมูลเพิ่ม)
      if (rows.length === 0) return null;
      var timeline = readAll_(SHEET.TIMELINE);
      var bounced = {};
      for (var i = 0; i < timeline.length; i++) {
        if (str_(timeline[i].toStatus) === STATUS.INFO_NEEDED.key) {
          bounced[str_(timeline[i].jobId)] = true;
        }
      }
      var clean = 0;
      for (var j = 0; j < rows.length; j++) {
        if (!bounced[str_(rows[j].jobId)]) clean++;
      }
      return Math.round((clean / rows.length) * 100);
    })()
  };
}

/** ข้อมูลสำหรับส่งออกเป็น CSV (รายงานประจำปี) */
function exportRows_(filter) {
  var rows = listRequests_(filter || {});
  var header = ['เลขที่คำขอ', 'วันที่ยื่น', 'สถานะ', 'ความเร่งด่วน', 'ผู้ขอรับบริการ',
    'หน่วยงาน', 'ชื่อโครงการ', 'กำหนดใช้งาน', 'ผู้รับผิดชอบ', 'รอบแก้ไข'];
  var body = rows.map(function (r) {
    return [r.jobId, r.createdAt, r.statusLabel, r.priorityLabel, r.requesterName,
      r.department, r.projectName, r.dueDate, r.assignedTo,
      r.revisionCount + '/' + r.revisionLimit];
  });
  return { header: header, rows: body };
}
