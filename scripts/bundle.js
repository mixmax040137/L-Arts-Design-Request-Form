/**
 * bundle.js — รวมไฟล์ .gs ทั้ง 11 ไฟล์ให้เหลือไฟล์เดียว สำหรับคนที่ติดตั้งด้วยการคัดลอกทีละไฟล์
 *
 *   node scripts/bundle.js          สร้าง/อัปเดตโฟลเดอร์ dist/
 *   node scripts/bundle.js --check  ตรวจว่า dist/ ตรงกับซอร์สหรือยัง (ใช้ในชุดทดสอบ)
 *
 * ไฟล์ .gs รวมกันได้เพราะ Apps Script นำทุกไฟล์มาต่อกันอยู่แล้ว
 * และโค้ดฐานนี้ไม่มีการอ้างถึงตัวแปรข้ามไฟล์ตอนโหลด ลำดับจึงไม่มีผล
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script');
const DIST = path.join(ROOT, 'dist');

const HTML_FILES = [
  'page_App.html', 'ui_Style.html', 'ui_Script_Core.html',
  'ui_Script_Form.html', 'ui_Script_Track.html', 'ui_Script_Admin.html'
];

function serverFiles() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
}

/** สร้างเนื้อหาไฟล์ Code.gs ที่รวมทุกไฟล์ */
function buildCodeGs() {
  const files = serverFiles();
  const parts = [
    '/**',
    ' * ระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์',
    ' * ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์',
    ' *',
    ' * ไฟล์นี้สร้างอัตโนมัติจาก apps-script/*.gs ด้วยคำสั่ง  npm run bundle',
    ' * ห้ามแก้ไขไฟล์นี้โดยตรง ให้แก้ที่ apps-script/ แล้วสร้างใหม่',
    ' *',
    ' * รวมจาก ' + files.length + ' ไฟล์: ' + files.join(', '),
    ' */',
    ''
  ];

  for (const file of files) {
    const body = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\s+$/, '');
    parts.push(
      '',
      '/* ' + '='.repeat(74),
      '   ' + file,
      '   ' + '='.repeat(74) + ' */',
      '',
      body,
      ''
    );
  }
  return parts.join('\n') + '\n';
}

function expectedFiles() {
  const out = { 'Code.gs': buildCodeGs() };
  out['appsscript.json'] = fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8');
  for (const name of HTML_FILES) {
    out[name] = fs.readFileSync(path.join(SRC, name), 'utf8');
  }
  return out;
}

function write() {
  fs.mkdirSync(DIST, { recursive: true });
  const files = expectedFiles();
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(DIST, name), content);
  }
  const bytes = Buffer.byteLength(files['Code.gs'], 'utf8');
  console.log('สร้าง dist/ เรียบร้อย — ' + Object.keys(files).length + ' ไฟล์');
  console.log('  Code.gs รวมจาก ' + serverFiles().length + ' ไฟล์ ขนาด ' +
    Math.round(bytes / 1024) + ' KB');
  for (const name of Object.keys(files)) console.log('  - ' + name);
}

/** คืนรายการไฟล์ที่ไม่ตรง (ว่าง = ตรงทั้งหมด) */
function check() {
  const files = expectedFiles();
  const stale = [];
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(DIST, name);
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
      stale.push(name);
    }
  }
  return stale;
}

if (require.main === module) {
  if (process.argv.indexOf('--check') >= 0) {
    const stale = check();
    if (stale.length > 0) {
      console.error('dist/ ไม่ตรงกับซอร์ส กรุณารัน  npm run bundle');
      console.error('ไฟล์ที่ไม่ตรง: ' + stale.join(', '));
      process.exit(1);
    }
    console.log('dist/ ตรงกับซอร์สแล้ว');
  } else {
    write();
  }
}

module.exports = { buildCodeGs, expectedFiles, check, HTML_FILES };
