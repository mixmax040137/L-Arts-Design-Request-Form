/* google.script.run บน Cloudflare: ส่งคำสั่งไป /api แทน (หน้าเว็บชุดเดิมไม่ต้องแก้)
   รูปแบบผลลัพธ์เหมือน Apps Script ทุกอย่าง: withSuccessHandler ได้ค่าที่ฟังก์ชันฝั่งเซิร์ฟเวอร์คืน

   ไฟล์แนบ: ขอใบอนุญาตจาก Cloudflare ก่อน (ตรวจสิทธิ์ ชนิด จำนวน และขนาดไฟล์ด้วยตรรกะเดิมของระบบ)
   แล้วส่งไฟล์ตรงไป Apps Script ซึ่งเก็บไว้ใน Drive และคืนใบรับไฟล์ จากนั้นจึงส่งคำสั่งพร้อมใบรับไฟล์ไป /api
   ไฟล์ใหญ่จึงไม่ต้องผ่าน Cloudflare (แผนฟรีจำกัดเวลาประมวลผลต่อคำขอ) ถ้าส่งตรงไม่ได้จะส่งผ่าน Cloudflare แทน */
(function () {
  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) {
        try { return JSON.parse(t); } catch (e) {
          throw new Error(r.status === 413 ? 'ไฟล์ใหญ่เกินไป กรุณาเลือกไฟล์ที่เล็กลง'
            : 'เชื่อมต่อระบบไม่สำเร็จ (HTTP ' + r.status + ') กรุณาลองใหม่อีกครั้ง');
        }
      });
    }, function () {
      throw new Error('เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
    });
  }

  /** ไฟล์ในอาร์กิวเมนต์ (ลำดับเดียวกับ collectFiles ใน server.mjs) */
  function filesIn(args) {
    var out = [];
    args.forEach(function (a) {
      if (a && typeof a === 'object') {
        if (typeof a.dataB64 === 'string') out.push(a);
        if (a.file && typeof a.file === 'object' && typeof a.file.dataB64 === 'string') out.push(a.file);
      }
    });
    return out;
  }

  function b64Size(s) {
    var pad = /==$/.test(s) ? 2 : (/=$/.test(s) ? 1 : 0);
    return Math.max(0, Math.floor(s.length * 3 / 4) - pad);
  }

  /** ส่งไฟล์ตรงไป Apps Script คืนผลผิดพลาดที่ต้องแสดง หรือ null (สำเร็จ หรือให้ส่งผ่าน Cloudflare แทน) */
  function sendDirect(fn, args, files) {
    var probe = JSON.parse(JSON.stringify(args, function (k, v) {
      return k === 'dataB64' && typeof v === 'string' ? 'precheck:' + b64Size(v) : v;
    }));
    return postJson('/api/ticket', { fn: fn, args: probe }).then(function (t) {
      if (!t || !t.ok) return t || { ok: false, error: 'ตรวจสอบไฟล์ไม่สำเร็จ กรุณาลองใหม่' };
      if (!t.gasUrl || !t.tickets || t.tickets.length !== files.length) return null;
      return Promise.all(files.map(function (f, i) {
        return fetch(t.gasUrl, {
          method: 'POST',   // text/plain: ไม่ต้องขออนุญาตข้ามโดเมนก่อนส่ง (Apps Script ไม่ตอบ preflight)
          body: JSON.stringify({ op: 'upload', ticket: t.tickets[i], name: f.fileName, mime: f.mimeType, b64: f.dataB64 })
        }).then(function (r) { return r.json(); }).then(function (u) {
          if (u && u.ok && u.id && u.sig) {
            f.dataB64 = 'staged:' + u.id + ':' + u.size + ':' + u.sig;
            return null;
          }
          // Apps Script รุ่นที่ยังไม่รองรับการรับไฟล์ตรง: ส่งผ่าน Cloudflare แทน
          if (u && u.code === 'NOT_PAIRED') return null;
          return u || null;
        }, function () { return null; });   // ส่งตรงไม่ได้ (เครือข่ายหรือเบราว์เซอร์บล็อก): ส่งผ่าน Cloudflare แทน
      })).then(function (errs) {
        for (var i = 0; i < errs.length; i++) if (errs[i]) return errs[i];
        return null;
      });
    });
  }

  function call(fn, args, ok, fail) {
    var files = filesIn(args).filter(function (f) { return f.dataB64 && !/^staged:/.test(f.dataB64); });
    var before = files.length ? sendDirect(fn, args, files) : Promise.resolve(null);
    before.then(function (err) {
      return err || postJson('/api', { fn: fn, args: args });
    }).then(function (d) { if (ok) ok(d); }, function (e) {
      if (fail) fail(e instanceof Error ? e : new Error(String(e)));
    });
  }

  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (t, p) {
        if (p === 'withSuccessHandler') return function (f) { return runner(f, fail); };
        if (p === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (p === 'withUserObject') return function () { return runner(ok, fail); };
        return function () { call(String(p), Array.prototype.slice.call(arguments), ok, fail); };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: function () { return runner(null, null); } });
})();
