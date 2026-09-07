#!/usr/bin/env bash
#
# deploy.sh — อัปโหลดโค้ดล่าสุดและออกเวอร์ชันใหม่ให้เว็บแอปโดยไม่ต้องเข้าเบราว์เซอร์
# ใช้กับ macOS และ Linux   (Windows ใช้ deploy.ps1)
#
#   ./deploy.sh                    ออกเวอร์ชันใหม่ทับ deployment เดิม (URL ไม่เปลี่ยน)
#   ./deploy.sh "ข้อความกำกับ"      ระบุคำอธิบายเวอร์ชันเอง
#
# ต้องรัน ./setup.sh อย่างน้อยหนึ่งครั้งก่อน และต้องเคยกด Deploy ในเบราว์เซอร์มาแล้วหนึ่งครั้ง
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/apps-script"
CLASP="npx --yes @google/clasp@2"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
RED=$'\033[31m'; ORANGE=$'\033[38;5;208m'; RESET=$'\033[0m'

step() { printf '\n%s▶ %s%s\n' "$BOLD$ORANGE" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
die()  { printf '\n  %s✗ %s%s\n\n' "$RED" "$1" "$RESET" >&2; exit 1; }

DESCRIPTION="${1:-อัปเดต $(date '+%d/%m/%Y %H:%M')}"

printf '\n%s%s%s\n' "$BOLD" "ออกเวอร์ชันใหม่ของระบบขอรับบริการออกแบบสื่อ" "$RESET"

[ -d "$APP_DIR" ] || die "ไม่พบโฟลเดอร์ apps-script กรุณารันสคริปต์นี้จากในโฟลเดอร์โครงการ"
cd "$APP_DIR"
[ -f .clasp.json ] || die "ยังไม่ได้ผูกโปรเจกต์ กรุณารัน ./setup.sh ก่อนหนึ่งครั้ง"

# ------------------------------------------------------------------ ขั้นที่ 1
step "ขั้นที่ 1/3  ตรวจสอบโค้ดก่อนอัปโหลด"

if [ -f "$SCRIPT_DIR/package.json" ] && command -v node >/dev/null 2>&1; then
  if ( cd "$SCRIPT_DIR" && npm test >/tmp/larts-test.log 2>&1 ); then
    ok "ชุดทดสอบผ่านทั้งหมด"
  else
    printf '\n'
    tail -n 25 /tmp/larts-test.log
    die "ชุดทดสอบไม่ผ่าน จึงยังไม่อัปโหลด (ดูรายละเอียดเต็มที่ /tmp/larts-test.log)"
  fi
else
  printf '  %sข้ามการทดสอบ (ไม่พบ Node.js)%s\n' "$DIM" "$RESET"
fi

# ------------------------------------------------------------------ ขั้นที่ 2
step "ขั้นที่ 2/3  อัปโหลดโค้ด"

$CLASP push -f || die "อัปโหลดไม่สำเร็จ ตรวจว่าเข้าสู่ระบบด้วยบัญชีที่ถูกต้องแล้วหรือยัง (npx --yes @google/clasp@2 login --status)"
ok "อัปโหลดเรียบร้อย"

# ------------------------------------------------------------------ ขั้นที่ 3
step "ขั้นที่ 3/3  ออกเวอร์ชันใหม่ให้เว็บแอป"

DEPLOYMENTS="$($CLASP deployments 2>/dev/null || true)"
# บรรทัดที่ใช้ได้จะอยู่ในรูป  - <deploymentId> @<เลขเวอร์ชัน> ...  โดยข้าม @HEAD
TARGET="$(printf '%s\n' "$DEPLOYMENTS" \
  | grep -oE '^- [A-Za-z0-9_-]+ @[0-9]+' \
  | sed -E 's/^- ([A-Za-z0-9_-]+) @([0-9]+)/\2 \1/' \
  | sort -n -r | head -n 1 | awk '{print $2}')"

if [ -z "$TARGET" ]; then
  printf '\n'
  printf '  %sยังไม่พบ deployment ที่เผยแพร่ไว้%s\n\n' "$YELLOW" "$RESET"
  printf '  ครั้งแรกต้องกด Deploy ในเบราว์เซอร์หนึ่งครั้งก่อน (ทำครั้งเดียวตลอดไป)\n'
  printf '    1) เปิด https://script.google.com/d/%s/edit\n' "$(node -p "require('./.clasp.json').scriptId")"
  printf '    2) Deploy → New deployment → Web app\n'
  printf '       Execute as: Me   |   Who has access: Anyone\n'
  printf '    3) จากนั้นครั้งต่อ ๆ ไปใช้ ./deploy.sh ได้เลย\n\n'
  exit 1
fi

$CLASP deploy -i "$TARGET" -d "$DESCRIPTION" || die "ออกเวอร์ชันใหม่ไม่สำเร็จ"
ok "ออกเวอร์ชันใหม่เรียบร้อย (deployment $TARGET)"

printf '\n%s%sเผยแพร่เวอร์ชันใหม่แล้ว%s\n' "$BOLD" "$GREEN" "$RESET"
printf '  คำอธิบายเวอร์ชัน : %s\n' "$DESCRIPTION"
printf '  ลิงก์เว็บแอป     : https://script.google.com/macros/s/%s/exec\n' "$TARGET"
printf '\n  %sURL เดิมไม่เปลี่ยน ผู้ใช้เห็นเวอร์ชันใหม่ทันทีเมื่อรีเฟรชหน้า%s\n\n' "$DIM" "$RESET"
