/**
 * 14_Designers.gs — รายชื่อผู้ออกแบบ การเลือกผู้ออกแบบ และคิวงานสาธารณะ
 *
 * ผู้ขอเลือกผู้ออกแบบเองได้ตอนยื่นคำขอ (หรือให้ฝ่ายฯ จัดสรรให้)
 * งานผูกกับผู้ออกแบบผ่านช่อง assignedTo ของคำขอ (เก็บชื่อผู้ออกแบบ) ซึ่งเจ้าหน้าที่เปลี่ยนได้ด้วยปุ่ม "มอบหมาย"
 * เมื่อเปลี่ยนชื่อผู้ออกแบบ ระบบเปลี่ยนชื่อในงานที่ผูกอยู่ให้ด้วย งานจึงไม่หลุดจากผู้ออกแบบ
 *
 * หน้ายื่นคำขอแสดงภาระงานของแต่ละคน ปฏิทิน และตารางงานที่กำลังทำ
 * ข้อมูลส่วนนั้นเปิดให้ทุกคนเห็น จึงส่งเฉพาะชื่อโครงการ กำหนดใช้งาน สถานะ และผู้ออกแบบ
 * ไม่ส่งชื่อ อีเมล หรือเบอร์โทรของผู้ขอเด็ดขาด
 */

var PUBLIC_WORKLOAD_CACHE_KEY = 'public:workload:v2';
var DESIGNER_POOL = 'pool';            // ผู้ขอเลือก "ให้ฝ่ายฯ จัดสรรให้"
var STAFF_LABEL = 'เจ้าหน้าที่ฝ่ายฯ'; // ชื่อที่ผู้ขอเห็นเมื่องานอยู่กับคนที่ไม่อยู่ในรายชื่อผู้ออกแบบ
var STAFF_COLOR = '#64748b';
var DEFAULT_DESIGNER_CAPACITY = 6;

/** คีย์สำหรับเทียบชื่อ ไม่สนช่องว่างซ้ำและตัวพิมพ์ใหญ่เล็ก */
function designerKey_(name) {
  return str_(name).replace(/\s+/g, ' ').toLowerCase();
}

function designerRecord_(r, index) {
  var color = str_(r.color);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = DESIGNER_COLORS[index % DESIGNER_COLORS.length];
  var name = str_(r.name);
  return {
    id: str_(r.id),
    name: name,
    shortName: str_(r.shortName) || name.split(' ')[0],
    shortNameAuto: !str_(r.shortName),
    specialty: str_(r.specialty),
    color: color.toLowerCase(),
    email: str_(r.email),
    capacity: Math.max(1, int_(r.capacity, DEFAULT_DESIGNER_CAPACITY) || DEFAULT_DESIGNER_CAPACITY),
    accepting: str_(r.accepting).toUpperCase() !== 'FALSE',
    active: str_(r.active).toUpperCase() !== 'FALSE',
    sortOrder: int_(r.sortOrder, 0),
    _row: r._row
  };
}

/** รายชื่อผู้ออกแบบเรียงตามลำดับ (includeInactive = รวมคนที่ซ่อนไว้ สำหรับหน้าตั้งค่า) */
function listDesigners_(includeInactive) {
  var rows = readAll_(SHEET.DESIGNERS).slice().sort(function (a, b) {
    var d = int_(a.sortOrder, 0) - int_(b.sortOrder, 0);
    if (d !== 0) return d;
    var x = str_(a.createdAt);
    var y = str_(b.createdAt);
    return x === y ? 0 : (x < y ? -1 : 1);
  });
  return rows.map(designerRecord_).filter(function (d) { return includeInactive || d.active; });
}

/** ข้อมูลที่เปิดเผยได้ (ไม่มีอีเมล) */
function designerPublic_(d) {
  return {
    id: d.id, name: d.name, shortName: d.shortName, specialty: d.specialty,
    color: d.color, accepting: d.accepting, capacity: d.capacity
  };
}

/** หาผู้ออกแบบจาก id หรือชื่อ (รวมคนที่ซ่อนไว้) */
function findDesigner_(idOrName) {
  var key = designerKey_(idOrName);
  if (!key) return null;
  var all = listDesigners_(true);
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === str_(idOrName) || designerKey_(all[i].name) === key) return all[i];
  }
  return null;
}

/** ชื่อที่จะบันทึกเป็นผู้รับผิดชอบ ถ้าตรงกับผู้ออกแบบในรายชื่อให้ใช้ชื่อมาตรฐานของคนนั้น */
function resolveAssignee_(text) {
  var d = findDesigner_(text);
  return d ? d.name : truncate_(str_(text).replace(/\s+/g, ' '), 150);
}

/**
 * ผู้ออกแบบที่ผู้ขอเลือกตอนยื่นคำขอ คืน null เมื่อเลือก "ให้ฝ่ายฯ จัดสรรให้"
 * ผู้ขอต้องเลือกเองทุกครั้ง (ผู้ออกแบบคนใดคนหนึ่ง หรือ DESIGNER_POOL)
 * ยกเว้นยังไม่มีรายชื่อผู้ออกแบบเลย ซึ่งหน้าเว็บจะซ่อนตัวเลือกไว้
 */
function requesterDesigner_(designerId) {
  var id = str_(designerId);
  if (id === DESIGNER_POOL) return null;
  var e = null;
  if (!id) {
    if (listDesigners_(false).length === 0) return null;
    e = appError_('กรุณาเลือกผู้ออกแบบที่ต้องการในขั้นที่ 2 หรือเลือก "ให้ฝ่ายฯ จัดสรรให้" ถ้ายังไม่แน่ใจ');
    e.code = 'DESIGNER';
    throw e;
  }
  var d = findDesigner_(id);
  if (!d || !d.active || d.id !== id) {
    e = appError_('ผู้ออกแบบที่เลือกไม่อยู่ในรายชื่อแล้ว กรุณาเลือกใหม่ หรือเลือก "ให้ฝ่ายฯ จัดสรรให้"');
  } else if (!d.accepting) {
    e = appError_(d.name + ' งดรับงานใหม่ชั่วคราว กรุณาเลือกผู้ออกแบบคนอื่น หรือเลือก "ให้ฝ่ายฯ จัดสรรให้"');
  }
  if (e) {
    e.code = 'DESIGNER'; // หน้าเว็บใช้รหัสนี้พากลับไปเลือกผู้ออกแบบใหม่พร้อมรายชื่อล่าสุด
    throw e;
  }
  return d;
}

/**
 * ผู้ออกแบบของงานสำหรับหน้าติดตามของผู้ขอ
 * แสดงเฉพาะชื่อที่อยู่ในรายชื่อผู้ออกแบบ (ซึ่งเปิดเผยบนคิวงานอยู่แล้ว)
 * ชื่ออื่นที่เจ้าหน้าที่พิมพ์เอง เช่น ฟรีแลนซ์ภายนอก ถือเป็นข้อมูลภายใน
 */
function publicDesignerOf_(assignedTo) {
  var name = str_(assignedTo);
  if (!name) return null;
  var d = findDesigner_(name);
  if (!d || designerKey_(d.name) !== designerKey_(name)) return { name: STAFF_LABEL, color: STAFF_COLOR, staff: true };
  return { name: d.name, color: d.color };
}

/** ชื่อบัญชีเจ้าหน้าที่ที่ใช้งานอยู่ (ไม่มีอีเมล) สำหรับเลือกผู้รับผิดชอบ */
function activeStaffNames_() {
  var seen = {};
  var out = [];
  readAll_(SHEET.USERS).forEach(function (u) {
    if (str_(u.active).toUpperCase() !== 'TRUE') return;
    var name = str_(u.name).replace(/\s+/g, ' ');
    if (!name || seen[designerKey_(name)]) return;
    seen[designerKey_(name)] = true;
    out.push(name);
  });
  return out;
}

/**
 * อีเมลของผู้รับผิดชอบ ใช้แจ้งเมื่อได้รับมอบหมายงาน
 * ใช้อีเมลในรายชื่อผู้ออกแบบก่อน ถ้าไม่มีให้ใช้อีเมลบัญชีเจ้าหน้าที่ที่ชื่อตรงกัน
 */
function assigneeContact_(name) {
  var key = designerKey_(name);
  if (!key) return null;
  var d = findDesigner_(name);
  if (d && designerKey_(d.name) === key && d.email) return { name: d.name, email: d.email };
  var users = readAll_(SHEET.USERS);
  for (var i = 0; i < users.length; i++) {
    if (str_(users[i].active).toUpperCase() === 'TRUE' && designerKey_(users[i].name) === key && str_(users[i].email)) {
      return { name: str_(users[i].name), email: str_(users[i].email) };
    }
  }
  return null;
}

/** งานที่กำลังดำเนินการ (ยื่นแล้ว และยังไม่ส่งมอบหรือยกเลิก) */
function activeJobRows_() {
  return readAll_(SHEET.REQUESTS).filter(function (r) {
    var st = str_(r.status);
    return str_(r.submittedAt) && st !== STATUS.DELIVERED.key && st !== STATUS.CANCELLED.key;
  });
}

/** ระดับความหนักของงานเทียบกับจำนวนงานที่รับได้พร้อมกัน */
function loadLevel_(count, capacity) {
  var pct = capacity > 0 ? Math.round((count / capacity) * 100) : 0;
  if (count === 0) return { pct: 0, level: 'free', label: 'ว่าง' };
  if (pct < 40) return { pct: pct, level: 'free', label: 'งานน้อย' };
  if (pct < 75) return { pct: pct, level: 'normal', label: 'ปานกลาง' };
  if (pct < 100) return { pct: pct, level: 'busy', label: 'ค่อนข้างมาก' };
  return { pct: pct, level: 'full', label: 'เต็ม' };
}

/**
 * ภาระงานของผู้ออกแบบแต่ละคน งานที่ยังไม่มีผู้รับผิดชอบ (other)
 * และงานที่มอบหมายให้คนที่ไม่อยู่ในรายชื่อผู้ออกแบบ (staff) เช่น บัญชีเจ้าหน้าที่อื่น
 */
function computeWorkload_(designers, rows) {
  var byKey = {};
  var stats = designers.map(function (d) {
    var s = { designer: d, active: 0, dueSoon: 0, overdue: 0 };
    byKey[designerKey_(d.name)] = s;
    return s;
  });
  var other = { active: 0, dueSoon: 0, overdue: 0 };
  var staff = { active: 0, dueSoon: 0, overdue: 0 };
  var today = new Date();
  var jobs = rows.map(function (r) {
    var s = byKey[designerKey_(r.assignedTo)] || null;
    var isStaff = !s && !!str_(r.assignedTo);
    var bucket = s || (isStaff ? staff : other);
    var left = daysBetween_(today, r.dueDate);
    bucket.active++;
    if (left !== null && left < 0) bucket.overdue++;
    else if (left !== null && left <= 7) bucket.dueSoon++;
    return { row: r, designer: s ? s.designer : null, staff: isStaff, daysLeft: left };
  });
  return { stats: stats, other: other, staff: staff, jobs: jobs };
}

/**
 * คิวงานสาธารณะสำหรับหน้ายื่นคำขอ แคชไว้ 1 นาที (ล้างทันทีเมื่อมีการเปลี่ยนแปลงคำขอหรือรายชื่อ)
 */
function publicWorkload_() {
  if (!getSettingBool_('publicWorkload', true)) return { enabled: false };
  var cache = CacheService.getScriptCache();
  var hit = cache.get(PUBLIC_WORKLOAD_CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* แคชเสีย คำนวณใหม่ */ }
  }

  var designers = listDesigners_(false);
  var w = computeWorkload_(designers, activeJobRows_());
  var result = {
    enabled: true,
    generatedAt: nowIso_(),
    designers: w.stats.map(function (s) {
      var lv = loadLevel_(s.active, s.designer.capacity);
      var out = designerPublic_(s.designer);
      out.active = s.active;
      out.dueSoon = s.dueSoon;
      out.overdue = s.overdue;
      out.loadPct = lv.pct;
      out.level = lv.level;
      out.levelLabel = lv.label;
      return out;
    }),
    unassigned: { active: w.other.active, dueSoon: w.other.dueSoon, color: UNASSIGNED_COLOR },
    staff: { active: w.staff.active, dueSoon: w.staff.dueSoon, color: STAFF_COLOR, label: STAFF_LABEL },
    jobs: w.jobs.map(function (j) {
      var info = statusInfo_(j.row.status);
      return {
        projectName: truncate_(j.row.projectName, 120),
        dueDate: str_(j.row.dueDate).substring(0, 10),
        daysLeft: j.daysLeft,
        status: info.key,
        statusLabel: info.label,
        statusColor: info.color,
        designerId: j.designer ? j.designer.id : (j.staff ? '__staff' : ''),
        designerName: j.designer ? j.designer.name : (j.staff ? STAFF_LABEL : ''),
        color: j.designer ? j.designer.color : (j.staff ? STAFF_COLOR : UNASSIGNED_COLOR)
      };
    }).sort(function (a, b) {
      return a.dueDate === b.dueDate ? 0 : (a.dueDate < b.dueDate ? -1 : 1);
    })
  };
  try {
    cache.put(PUBLIC_WORKLOAD_CACHE_KEY, JSON.stringify(result), 60);
  } catch (err) {
    // ข้อมูลใหญ่เกินที่แคชรับได้ ก็ส่งค่าที่คำนวณสด ๆ ไปเลย
  }
  return result;
}

/** ล้างแคชคิวงานสาธารณะ (เรียกทุกครั้งที่คำขอหรือรายชื่อผู้ออกแบบเปลี่ยน) */
function bustPublicCache_() {
  try {
    CacheService.getScriptCache().remove(PUBLIC_WORKLOAD_CACHE_KEY);
  } catch (err) {
    // แคชหมดอายุเองใน 1 นาทีอยู่แล้ว
  }
}

/** รายชื่อผู้ออกแบบพร้อมภาระงาน สำหรับหน้าเจ้าหน้าที่ */
function adminDesigners_() {
  var all = listDesigners_(true);
  var w = computeWorkload_(all, activeJobRows_());
  var known = {};
  all.forEach(function (d) { known[designerKey_(d.name)] = true; });
  // ชื่อที่เคยมอบหมายงานแต่ยังไม่อยู่ในรายชื่อ ช่วยให้เพิ่มคนเดิมแล้วงานเดิมผูกให้ทันที
  var suggest = {};
  readAll_(SHEET.REQUESTS).forEach(function (r) {
    var name = str_(r.assignedTo).replace(/\s+/g, ' ');
    if (!name || known[designerKey_(name)]) return;
    suggest[name] = (suggest[name] || 0) + 1;
  });
  return {
    designers: w.stats.map(function (s) {
      var lv = loadLevel_(s.active, s.designer.capacity);
      var d = s.designer;
      return {
        id: d.id, name: d.name, shortName: d.shortName, shortNameAuto: d.shortNameAuto, specialty: d.specialty,
        color: d.color, email: d.email, capacity: d.capacity, accepting: d.accepting, active: d.active, sortOrder: d.sortOrder,
        activeJobs: s.active, dueSoon: s.dueSoon, overdue: s.overdue, loadPct: lv.pct, levelLabel: lv.label
      };
    }),
    unassigned: w.other.active,
    staff: activeStaffNames_().filter(function (n) { return !known[designerKey_(n)]; }),
    suggestions: Object.keys(suggest).map(function (n) { return { name: n, jobs: suggest[n] }; }),
    palette: DESIGNER_COLORS
  };
}

/**
 * เพิ่มหรือแก้ไขผู้ออกแบบ
 * เปลี่ยนชื่อแล้ว งานที่ผูกกับชื่อเดิมจะเปลี่ยนเป็นชื่อใหม่ให้ด้วย
 */
function saveDesigner_(payload, actor) {
  var p = payload || {};
  var name = truncate_(str_(pick_(p, 'name', '')).replace(/\s+/g, ' '), 80);
  if (name.length < 2) throw appError_('กรุณากรอกชื่อผู้ออกแบบ');
  var email = str_(pick_(p, 'email', '')).toLowerCase();
  if (email && !isValidEmail_(email)) throw appError_('อีเมลไม่ถูกต้อง ถ้าไม่ต้องการให้ระบบแจ้งเตือนให้เว้นว่าง');
  var color = str_(p.color).toLowerCase();
  if (color && !/^#[0-9a-f]{6}$/.test(color)) throw appError_('สีไม่ถูกต้อง กรุณาเลือกจากชุดสี');
  var capacity = int_(p.capacity, DEFAULT_DESIGNER_CAPACITY);
  if (capacity < 1 || capacity > 50) throw appError_('จำนวนงานที่รับได้พร้อมกันต้องอยู่ระหว่าง 1 ถึง 50');

  return withLock_(function () {
    var id = str_(p.id);
    var all = listDesigners_(true);
    var existing = null;
    for (var i = 0; i < all.length; i++) {
      if (id && all[i].id === id) existing = all[i];
      else if (designerKey_(all[i].name) === designerKey_(name)) {
        throw appError_('มีผู้ออกแบบชื่อ "' + all[i].name + '" อยู่แล้ว');
      }
    }
    if (id && !existing) throw appError_('ไม่พบผู้ออกแบบคนนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');

    var record = {
      name: name,
      shortName: truncate_(pick_(p, 'shortName', ''), 30),
      specialty: truncate_(pick_(p, 'specialty', ''), 200),
      color: color || (existing ? existing.color : DESIGNER_COLORS[all.length % DESIGNER_COLORS.length]),
      email: email,
      capacity: capacity,
      accepting: p.accepting === false || str_(p.accepting) === 'false' ? 'FALSE' : 'TRUE',
      active: p.active === false || str_(p.active) === 'false' ? 'FALSE' : 'TRUE',
      sortOrder: Math.max(0, Math.min(999, int_(p.sortOrder, existing ? existing.sortOrder : all.length))),
      updatedAt: nowIso_()
    };

    var renamed = 0;
    if (existing) {
      if (designerKey_(existing.name) !== designerKey_(name) || existing.name !== name) {
        readAll_(SHEET.REQUESTS).forEach(function (r) {
          if (designerKey_(r.assignedTo) !== designerKey_(existing.name)) return;
          update_(SHEET.REQUESTS, r._row, { assignedTo: name });
          renamed++;
        });
      }
      update_(SHEET.DESIGNERS, existing._row, record);
    } else {
      record.id = newId_('P');
      record.createdAt = nowIso_();
      insert_(SHEET.DESIGNERS, record);
    }
    var saved = findDesigner_(existing ? existing.id : record.id);
    return { designer: saved ? designerPublic_(saved) : null, renamedJobs: renamed };
  });
}

/** ลบผู้ออกแบบ (ทำได้เมื่อไม่มีงานที่กำลังทำอยู่) */
function deleteDesigner_(id) {
  return withLock_(function () {
    var d = findDesigner_(id);
    if (!d || d.id !== str_(id)) throw appError_('ไม่พบผู้ออกแบบคนนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    var busy = activeJobRows_().filter(function (r) {
      return designerKey_(r.assignedTo) === designerKey_(d.name);
    }).length;
    if (busy > 0) {
      throw appError_(d.name + ' ยังมีงานที่กำลังทำอยู่ ' + busy + ' งาน กรุณามอบหมายงานให้คนอื่นก่อน ' +
        'หรือกด "แก้ไข" แล้วปิด "แสดงให้ผู้ขอเลือก" แทนการลบ');
    }
    remove_(SHEET.DESIGNERS, d._row);
    return true;
  });
}
