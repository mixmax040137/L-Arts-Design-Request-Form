/**
 * build.js — ประกอบระบบฝั่ง Cloudflare จากซอร์สชุดเดียวกับ Apps Script
 *
 *   cloudflare/dist/app.mjs     createApp(HOST) = prelude.js + apps-script/*.gs + ทะเบียน api* + overrides.js
 *   cloudflare/dist/assets.mjs  หน้าเว็บ (page_App + ui_* รวมแล้ว) และหน้า /setup
 *
 * รัน: node cloudflare/build.js   (npm test และ npm run cf:deploy เรียกให้อัตโนมัติ)
 * แก้ที่ apps-script/ หรือ cloudflare/ เท่านั้น ห้ามแก้ใน dist/
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script');
const OUT = path.join(__dirname, 'dist');
const read = (p) => fs.readFileSync(p, 'utf8');

function build() {
  const gsFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();

  /* ---------- ทะเบียนคำสั่งที่หน้าเว็บเรียกได้: เฉพาะ api* (ไม่รวมคำสั่งของฝั่ง Apps Script เอง) ---------- */
  const apiNames = [];
  for (const f of gsFiles) {
    const re = /^function\s+(api[A-Z][A-Za-z0-9]*)\s*\(/gm;
    let m;
    while ((m = re.exec(read(path.join(SRC, f))))) {
      if (!/^apiBridge/.test(m[1])) apiNames.push(m[1]);
    }
  }
  apiNames.sort();

  const indent = (s) => s.replace(/^(?=.)/gm, '  ');
  let body = '\n/* ===== prelude.js ===== */\n' + read(path.join(__dirname, 'prelude.js'));
  for (const f of gsFiles) body += '\n/* ===== ' + f + ' ===== */\n' + read(path.join(SRC, f));
  body += '\n/* ===== ทะเบียน api* ===== */\nvar CF_API = {\n' +
    apiNames.map((n) => '  ' + n + ': ' + n).join(',\n') + '\n};\n';
  body += '\n/* ===== overrides.js ===== */\n' + read(path.join(__dirname, 'overrides.js'));

  const app = '/* สร้างอัตโนมัติโดย cloudflare/build.js — ห้ามแก้ไฟล์นี้ */\n' +
    'export const API_NAMES = ' + JSON.stringify(apiNames) + ';\n' +
    'export function createApp(HOST) {\n' + indent(body) + '\n}\n';

  /* ---------- หน้าเว็บ: ประกอบแบบเดียวกับ HtmlService (include) ---------- */
  let page = read(path.join(SRC, 'page_App.html'));
  page = page.replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (m, name) => {
    const file = path.join(SRC, name + '.html');
    if (!fs.existsSync(file)) throw new Error('ไม่พบไฟล์ที่ include: ' + name);
    return read(file).trimEnd();
  });
  if (/include\(/.test(page)) throw new Error('ยังมี include() ตกค้างในหน้าเว็บ');
  const tags = page.match(/<\?[\s\S]*?\?>/g) || [];
  if (tags.length !== 1 || !/^<\?!=\s*boot\s*\?>$/.test(tags[0])) {
    throw new Error('หน้าเว็บต้องมีแท็กเทมเพลตเดียวคือ <?!= boot ?> แต่พบ: ' + tags.join(', '));
  }
  const shim = read(path.join(__dirname, 'web', 'shim.js')).trim();
  const index = '<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์ | ศศ. มธ.</title>\n' +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n' +
    '<script>\n' + shim + '\n</script>\n</head>\n<body>\n' + page.trim() + '\n</body>\n</html>\n';

  const assets = '/* สร้างอัตโนมัติโดย cloudflare/build.js — ห้ามแก้ไฟล์นี้ */\n' +
    'export const ASSETS = {\n' +
    '  index: ' + JSON.stringify(index) + ',\n' +
    '  setup: ' + JSON.stringify(read(path.join(__dirname, 'web', 'setup.html'))) + ',\n' +
    '  favicon: ' + JSON.stringify(read(path.join(__dirname, 'web', 'favicon.svg'))) + '\n' +
    '};\n';

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'app.mjs'), app);
  fs.writeFileSync(path.join(OUT, 'assets.mjs'), assets);
  return { apiNames, appBytes: Buffer.byteLength(app), assetBytes: Buffer.byteLength(assets) };
}

module.exports = { build };

if (require.main === module) {
  const r = build();
  console.log('cloudflare/dist/app.mjs     ' + (r.appBytes / 1024).toFixed(0) + ' KB · api ' + r.apiNames.length + ' คำสั่ง');
  console.log('cloudflare/dist/assets.mjs  ' + (r.assetBytes / 1024).toFixed(0) + ' KB');
}
