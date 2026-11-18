/**
 * 08_Auth.gs — ระบบเข้าสู่ระบบสำหรับเจ้าหน้าที่
 *
 * เว็บแอปถูก deploy แบบ "Anyone" เพื่อให้ผู้ขอรับบริการใช้งานได้โดยไม่ต้องล็อกอิน Google
 * ระบบจึงมีระบบยืนยันตัวตนของตัวเอง: รหัสผ่านเก็บเป็นค่าแฮชแบบวนซ้ำ
 * และออก token ที่เซ็นด้วย HMAC เก็บไว้ฝั่งเบราว์เซอร์
 */

/** แฮชรหัสผ่านแบบวนซ้ำพร้อม salt และกุญแจลับของระบบ */
function hashPassword_(password, salt) {
  var pepper = getProp_(PROP.SECRET);
  if (!pepper) throw new Error('ระบบยังไม่มีกุญแจลับ กรุณาเรียก setupSystem() ก่อน');
  var acc = str_(salt) + ':' + String(password);
  for (var i = 0; i < PASSWORD_ROUNDS; i++) {
    acc = hmac_(acc, pepper);
  }
  return acc;
}

/**
 * ลายนิ้วมือของรหัสผ่านปัจจุบัน ฝังไว้ใน token
 * เปลี่ยนรหัสผ่านแล้ว salt เปลี่ยน token เก่าบนเครื่องอื่นจึงใช้ไม่ได้ทันที
 */
function passwordStamp_(salt) {
  return hmac_('stamp:' + str_(salt), getProp_(PROP.SECRET)).substring(0, 12);
}

/** สร้าง token ของ session */
function makeToken_(user) {
  var payload = {
    e: str_(user.email),
    n: str_(user.name),
    r: str_(user.role) || 'staff',
    k: passwordStamp_(user.salt),
    exp: new Date().getTime() + SESSION_TTL_MS
  };
  var encoded = b64url_(JSON.stringify(payload));
  return encoded + '.' + hmac_(encoded, getProp_(PROP.SECRET));
}

/** ตรวจสอบ token คืนข้อมูลผู้ใช้ หรือ null ถ้าไม่ถูกต้อง/หมดอายุ */
function verifyToken_(token) {
  var t = str_(token);
  if (!t) return null;
  var dot = t.indexOf('.');
  if (dot <= 0 || dot === t.length - 1) return null;

  var encoded = t.substring(0, dot);
  var signature = t.substring(dot + 1);
  if (!timingSafeEqual_(hmac_(encoded, getProp_(PROP.SECRET)), signature)) return null;

  var payload;
  try {
    payload = JSON.parse(unb64url_(encoded));
  } catch (err) {
    return null;
  }
  if (!payload || !payload.e || !payload.exp) return null;
  if (new Date().getTime() > int_(payload.exp)) return null;

  // ตรวจว่าบัญชียังใช้งานได้อยู่
  var user = findBy_(SHEET.USERS, 'email', str_(payload.e).toLowerCase());
  if (!user) return null;
  if (str_(user.active).toUpperCase() !== 'TRUE') return null;
  // token ที่ออกก่อนเปลี่ยนรหัสผ่านใช้ไม่ได้อีก (token รุ่นเก่าที่ไม่มีค่านี้ยังใช้ได้จนหมดอายุ)
  if (payload.k && payload.k !== passwordStamp_(user.salt)) return null;

  return { email: str_(user.email), name: str_(user.name), role: str_(user.role) || 'staff' };
}

/** ตรวจสิทธิ์ ถ้าไม่ผ่านจะโยน error */
function requireAuth_(token) {
  var user = verifyToken_(token);
  if (!user) {
    var e = appError_('เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
    e.code = 'AUTH'; // หน้าเว็บใช้รหัสนี้พาไปหน้าเข้าสู่ระบบ
    throw e;
  }
  return user;
}

/** ตรวจสิทธิ์ระดับผู้ดูแลระบบ */
function requireAdmin_(token) {
  var user = requireAuth_(token);
  if (str_(user.role) !== 'admin') {
    var e = appError_('เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้คำสั่งนี้ได้');
    e.code = 'FORBIDDEN';
    throw e;
  }
  return user;
}

/** จำนวนผู้ดูแลระบบที่ยังเปิดใช้งาน ไม่นับบัญชีที่ระบุ */
function otherActiveAdmins_(exceptEmail) {
  var except = str_(exceptEmail).toLowerCase();
  return readAll_(SHEET.USERS).filter(function (u) {
    return str_(u.role) === 'admin' && str_(u.active).toUpperCase() === 'TRUE' &&
      str_(u.email).toLowerCase() !== except;
  }).length;
}

/** นับความพยายามเข้าสู่ระบบที่ผิดพลาด */
function loginAttemptKey_(email) {
  return 'login-fail:' + str_(email).toLowerCase();
}

function getLoginAttempts_(email) {
  var cache = CacheService.getScriptCache();
  return int_(cache.get(loginAttemptKey_(email)), 0);
}

function bumpLoginAttempts_(email) {
  var cache = CacheService.getScriptCache();
  var key = loginAttemptKey_(email);
  var next = int_(cache.get(key), 0) + 1;
  cache.put(key, String(next), LOGIN_LOCK_SECONDS);
  return next;
}

function clearLoginAttempts_(email) {
  CacheService.getScriptCache().remove(loginAttemptKey_(email));
}

/** เข้าสู่ระบบ คืน token และข้อมูลผู้ใช้ */
function login_(email, password) {
  var mail = str_(email).toLowerCase();
  if (!isValidEmail_(mail)) throw appError_('รูปแบบอีเมลไม่ถูกต้อง');
  if (!str_(password)) throw appError_('กรุณากรอกรหัสผ่าน');

  if (getLoginAttempts_(mail) >= LOGIN_MAX_ATTEMPTS) {
    throw appError_('กรอกรหัสผ่านผิดเกินกำหนด กรุณารอ 15 นาทีแล้วลองใหม่');
  }

  var user = findBy_(SHEET.USERS, 'email', mail);
  var ok = false;
  if (user && str_(user.active).toUpperCase() === 'TRUE') {
    ok = timingSafeEqual_(hashPassword_(password, user.salt), str_(user.passwordHash));
  }

  if (!ok) {
    var attempts = bumpLoginAttempts_(mail);
    var left = LOGIN_MAX_ATTEMPTS - attempts;
    throw appError_('อีเมลหรือรหัสผ่านไม่ถูกต้อง' +
      (left > 0 ? ' (เหลือโอกาสอีก ' + left + ' ครั้ง)' : ''));
  }

  clearLoginAttempts_(mail);
  update_(SHEET.USERS, user._row, { lastLoginAt: nowIso_() });

  return {
    token: makeToken_(user),
    user: { email: str_(user.email), name: str_(user.name), role: str_(user.role) || 'staff' },
    expiresAt: new Date().getTime() + SESSION_TTL_MS
  };
}

/** เปลี่ยนรหัสผ่านของตนเอง */
function changePassword_(token, currentPassword, newPassword) {
  var me = requireAuth_(token);
  if (str_(newPassword).length < 8) throw appError_('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  var user = findBy_(SHEET.USERS, 'email', me.email);
  if (!user) throw appError_('ไม่พบบัญชีผู้ใช้');
  if (!timingSafeEqual_(hashPassword_(currentPassword, user.salt), str_(user.passwordHash))) {
    throw appError_('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  var salt = Utilities.getUuid();
  update_(SHEET.USERS, user._row, {
    salt: salt,
    passwordHash: hashPassword_(newPassword, salt)
  });
  return true;
}

/** รายชื่อเจ้าหน้าที่ (ผู้ดูแลระบบเท่านั้น) */
function listUsers_(token) {
  requireAdmin_(token);
  return readAll_(SHEET.USERS).map(function (u) {
    return {
      email: str_(u.email),
      name: str_(u.name),
      role: str_(u.role),
      active: str_(u.active).toUpperCase() === 'TRUE',
      createdAt: str_(u.createdAt),
      lastLoginAt: str_(u.lastLoginAt)
    };
  });
}

/** เพิ่มหรือแก้ไขบัญชีเจ้าหน้าที่ (ผู้ดูแลระบบเท่านั้น) */
function saveUser_(token, payload) {
  var me = requireAdmin_(token);
  var p = payload || {};
  var mail = str_(p.email).toLowerCase();
  if (!isValidEmail_(mail)) throw appError_('รูปแบบอีเมลไม่ถูกต้อง');
  var name = truncate_(pick_(p, 'name', ''), 150);
  if (!name) throw appError_('กรุณากรอกชื่อผู้ใช้');
  var role = str_(p.role) === 'admin' ? 'admin' : 'staff';
  var password = str_(p.password);

  var existing = findBy_(SHEET.USERS, 'email', mail);
  if (existing) {
    if (mail === me.email && p.active !== undefined && p.active !== true) {
      throw appError_('ไม่สามารถปิดใช้งานบัญชีของตนเองได้');
    }
    if (mail === me.email && role !== 'admin') {
      throw appError_('ไม่สามารถลดสิทธิ์ผู้ดูแลระบบของบัญชีตนเองได้ ' +
        'กรุณาให้ผู้ดูแลระบบคนอื่นเป็นผู้เปลี่ยนให้');
    }
    // กันไม่ให้ระบบเหลือผู้ดูแลระบบเป็นศูนย์ ซึ่งจะไม่มีใครเข้าหน้าตั้งค่าได้อีก
    var wasActiveAdmin = str_(existing.role) === 'admin' &&
      str_(existing.active).toUpperCase() === 'TRUE';
    var staysActiveAdmin = role === 'admin' && (p.active === undefined || p.active === true);
    if (wasActiveAdmin && !staysActiveAdmin && otherActiveAdmins_(mail) === 0) {
      throw appError_('บัญชีนี้เป็นผู้ดูแลระบบคนสุดท้าย จึงลดสิทธิ์หรือปิดใช้งานไม่ได้ ' +
        'กรุณาเพิ่มผู้ดูแลระบบคนอื่นก่อน');
    }
    var patch = { name: name, role: role };
    if (password) {
      if (password.length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      patch.salt = Utilities.getUuid();
      patch.passwordHash = hashPassword_(password, patch.salt);
    }
    if (p.active !== undefined) {
      patch.active = p.active ? 'TRUE' : 'FALSE';
    }
    update_(SHEET.USERS, existing._row, patch);
    return { updated: true, email: mail };
  }

  if (password.length < 8) throw appError_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  var salt = Utilities.getUuid();
  insert_(SHEET.USERS, {
    email: mail,
    name: name,
    role: role,
    passwordHash: hashPassword_(password, salt),
    salt: salt,
    active: 'TRUE',
    createdAt: nowIso_(),
    lastLoginAt: ''
  });
  return { created: true, email: mail };
}
