#!/usr/bin/env bash
#
# setup.sh — ติดตั้งระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์ขึ้น Google Apps Script
# ใช้กับ macOS และ Linux   (Windows ใช้ setup.ps1)
#
#   ./setup.sh                 สร้างโปรเจกต์ Apps Script ใหม่ให้อัตโนมัติ
#   ./setup.sh <SCRIPT_ID>     ใช้โปรเจกต์ที่สร้างไว้แล้ว
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/apps-script"
CLASP="npx --yes @google/clasp@2"
TITLE="ระบบขอรับบริการออกแบบสื่อ - ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
RED=$'\033[31m'; ORANGE=$'\033[38;5;208m'; RESET=$'\033[0m'

step() { printf '\n%s▶ %s%s\n' "$BOLD$ORANGE" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '\n  %s✗ %s%s\n\n' "$RED" "$1" "$RESET" >&2; exit 1; }

printf '\n%s%s%s\n' "$BOLD" "ติดตั้งระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์" "$RESET"
printf '%sฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์%s\n' "$DIM" "$RESET"

# ---------------------------------------------------------------- ขั้นที่ 1
step "ขั้นที่ 1/5  ตรวจสอบ Node.js"

command -v node >/dev/null 2>&1 || die "ไม่พบ Node.js กรุณาติดตั้งจาก https://nodejs.org (เลือกรุ่น LTS) แล้วรันสคริปต์นี้ใหม่"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "ต้องใช้ Node.js เวอร์ชัน 18 ขึ้นไป (ตอนนี้คือ $(node -v))"
ok "Node.js $(node -v)"
[ -d "$APP_DIR" ] || die "ไม่พบโฟลเดอร์ apps-script กรุณารันสคริปต์นี้จากในโฟลเดอร์โครงการ"

# ---------------------------------------------------------------- ขั้นที่ 2
step "ขั้นที่ 2/5  ตรวจสอบการเข้าสู่ระบบ Google"

cd "$APP_DIR"
if $CLASP login --status >/dev/null 2>&1; then
  ACCOUNT="$($CLASP login --status 2>/dev/null | tail -n 1 | tr -d '\r')"
  ok "เข้าสู่ระบบอยู่แล้ว: $ACCOUNT"
  printf '\n  %sหากไม่ใช่บัญชี pr@arts.tu.ac.th ให้กด Ctrl+C แล้วรัน:%s\n' "$YELLOW" "$RESET"
  printf '    npx --yes @google/clasp@2 logout && ./setup.sh\n\n'
  printf '  กด Enter เพื่อไปต่อ... '
  read -r _ || true
else
  warn "ยังไม่ได้เข้าสู่ระบบ กำลังเปิดเบราว์เซอร์..."
  printf '\n  %sสำคัญ: หน้าเลือกบัญชีจะแสดงทุกบัญชีที่ล็อกอินอยู่%s\n' "$BOLD" "$RESET"
  printf '  %sต้องเลือก pr@arts.tu.ac.th เท่านั้น แล้วกด Allow%s\n\n' "$BOLD" "$RESET"
  $CLASP login || die "เข้าสู่ระบบไม่สำเร็จ"
  ok "เข้าสู่ระบบเรียบร้อย"
fi

# ---------------------------------------------------------------- ขั้นที่ 3
step "ขั้นที่ 3/5  เตรียมโปรเจกต์ Apps Script"

if [ -f .clasp.json ]; then
  ok "พบ .clasp.json เดิม จะใช้โปรเจกต์เดิมต่อ"
elif [ "${1:-}" != "" ]; then
  printf '{\n  "scriptId": "%s",\n  "rootDir": "."\n}\n' "$1" > .clasp.json
  ok "ผูกกับโปรเจกต์ที่ระบุ: $1"
else
  warn "กำลังสร้างโปรเจกต์ Apps Script ใหม่..."
  cp appsscript.json /tmp/appsscript.backup.json
  if ! $CLASP create --type standalone --title "$TITLE" --rootDir . ; then
    rm -f /tmp/appsscript.backup.json
    die "สร้างโปรเจกต์ไม่สำเร็จ — มักเกิดจากยังไม่ได้เปิด Apps Script API
      แก้โดยเปิด https://script.google.com/home/usersettings ด้วยบัญชี pr@arts.tu.ac.th
      แล้วเปิดสวิตช์ Google Apps Script API เป็น On จากนั้นรันสคริปต์นี้ใหม่"
  fi
  # clasp create ดึง appsscript.json เปล่าจากเซิร์ฟเวอร์มาทับ ต้องคืนของเราไป
  mv /tmp/appsscript.backup.json appsscript.json
  ok "สร้างโปรเจกต์และคืนค่า appsscript.json ของระบบเรียบร้อย"
fi

SCRIPT_ID="$(node -p "require('./.clasp.json').scriptId")"

# ---------------------------------------------------------------- ขั้นที่ 4
step "ขั้นที่ 4/5  อัปโหลดโค้ดขึ้นโปรเจกต์"

$CLASP push -f || die "อัปโหลดไม่สำเร็จ — ตรวจว่าเปิด Apps Script API แล้วที่ https://script.google.com/home/usersettings"

FILE_COUNT="$(ls -1 ./*.gs ./*.html appsscript.json 2>/dev/null | wc -l | tr -d ' ')"
ok "อัปโหลดครบ $FILE_COUNT ไฟล์"

# ---------------------------------------------------------------- ขั้นที่ 5
step "ขั้นที่ 5/5  ขั้นตอนที่ต้องทำในเบราว์เซอร์"

cat <<INSTRUCTIONS

  เหลืออีก 3 คลิกเท่านั้น ระบบจะติดตั้งฐานข้อมูลและโฟลเดอร์ให้เองทั้งหมด

  ${BOLD}1) เปิดโปรเจกต์${RESET}
     https://script.google.com/d/$SCRIPT_ID/edit

  ${BOLD}2) กด Deploy → New deployment${RESET}
     - กดไอคอนเฟืองข้างคำว่า Select type แล้วเลือก ${BOLD}Web app${RESET}
     - Execute as        : ${BOLD}Me (pr@arts.tu.ac.th)${RESET}
     - Who has access    : ${BOLD}Anyone${RESET}
     - กด Deploy แล้วกด ${BOLD}Authorize access${RESET}
       (หากขึ้น "Google hasn't verified this app" ให้กด Advanced → Go to ... → Allow)
     - คัดลอก ${BOLD}Web app URL${RESET} ที่ได้

  ${BOLD}3) เปิด Web app URL ในเบราว์เซอร์${RESET}
     - ระบบจะติดตั้งฐานข้อมูล โฟลเดอร์ และทริกเกอร์ให้อัตโนมัติ (ใช้เวลาราว 20 วินาที)
     - ${BOLD}รหัสติดตั้ง${RESET} จะถูกส่งไปที่อีเมล pr@arts.tu.ac.th
     - กรอกรหัสนั้นในหน้าที่ขึ้นมา พร้อมตั้งชื่อและรหัสผ่านผู้ดูแลระบบ

  เสร็จแล้วพร้อมใช้งานทันที ตั้งค่า Claude API key ได้ที่ ${BOLD}หน้าเจ้าหน้าที่ → ตั้งค่า${RESET}

  ${DIM}แก้โค้ดภายหลัง: รัน ./setup.sh อีกครั้ง แล้วกด Deploy → Manage deployments → New version${RESET}

INSTRUCTIONS

printf '%s%sอัปโหลดโค้ดเรียบร้อยแล้ว%s\n\n' "$BOLD" "$GREEN" "$RESET"
