/* google.script.run บน Cloudflare: ส่งคำสั่งไป /api แทน (หน้าเว็บชุดเดิมไม่ต้องแก้)
   รูปแบบผลลัพธ์เหมือน Apps Script ทุกอย่าง: withSuccessHandler ได้ค่าที่ฟังก์ชันฝั่งเซิร์ฟเวอร์คืน */
(function () {
  function call(fn, args, ok, fail) {
    fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn: fn, args: args })
    }).then(function (r) {
      return r.text().then(function (t) {
        try { return JSON.parse(t); } catch (e) {
          throw new Error(r.status === 413 ? 'ไฟล์ใหญ่เกินไป กรุณาเลือกไฟล์ที่เล็กลง'
            : 'เชื่อมต่อระบบไม่สำเร็จ (HTTP ' + r.status + ') กรุณาลองใหม่อีกครั้ง');
        }
      });
    }, function () {
      throw new Error('เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
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
