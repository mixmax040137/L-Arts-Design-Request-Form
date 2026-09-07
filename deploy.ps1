# deploy.ps1 — อัปโหลดโค้ดล่าสุดและออกเวอร์ชันใหม่ให้เว็บแอปโดยไม่ต้องเข้าเบราว์เซอร์
# ใช้กับ Windows (PowerShell)   macOS และ Linux ใช้ deploy.sh
#
#   .\deploy.ps1                   ออกเวอร์ชันใหม่ทับ deployment เดิม (URL ไม่เปลี่ยน)
#   .\deploy.ps1 "ข้อความกำกับ"     ระบุคำอธิบายเวอร์ชันเอง
#
# ต้องรัน .\setup.ps1 อย่างน้อยหนึ่งครั้งก่อน และต้องเคยกด Deploy ในเบราว์เซอร์มาแล้วหนึ่งครั้ง
#
param([string]$Description = "")

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$AppDir = Join-Path $PSScriptRoot "apps-script"
if (-not $Description) { $Description = "อัปเดต " + (Get-Date -Format "dd/MM/yyyy HH:mm") }

function Write-Step($text) { Write-Host "`n▶ $text" -ForegroundColor DarkYellow }
function Write-Ok($text)   { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Die($text)  { Write-Host "`n  ✗ $text`n" -ForegroundColor Red; exit 1 }

function Invoke-Clasp {
    param([Parameter(ValueFromRemainingArguments = $true)]$ClaspArgs)
    & npx --yes "@google/clasp@2" @ClaspArgs
}

Write-Host "`nออกเวอร์ชันใหม่ของระบบขอรับบริการออกแบบสื่อ" -ForegroundColor White

if (-not (Test-Path $AppDir)) { Write-Die "ไม่พบโฟลเดอร์ apps-script กรุณารันสคริปต์นี้จากในโฟลเดอร์โครงการ" }
Set-Location $AppDir
if (-not (Test-Path ".clasp.json")) { Write-Die "ยังไม่ได้ผูกโปรเจกต์ กรุณารัน .\setup.ps1 ก่อนหนึ่งครั้ง" }

# ------------------------------------------------------------------ ขั้นที่ 1
Write-Step "ขั้นที่ 1/3  ตรวจสอบโค้ดก่อนอัปโหลด"

if ((Test-Path (Join-Path $PSScriptRoot "package.json")) -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Push-Location $PSScriptRoot
    $testLog = & npm test 2>&1 | Out-String
    $testFailed = ($LASTEXITCODE -ne 0)
    Pop-Location
    if ($testFailed) {
        Write-Host ($testLog -split "`n" | Select-Object -Last 25 | Out-String)
        Write-Die "ชุดทดสอบไม่ผ่าน จึงยังไม่อัปโหลด"
    }
    Write-Ok "ชุดทดสอบผ่านทั้งหมด"
} else {
    Write-Host "  ข้ามการทดสอบ (ไม่พบ Node.js)" -ForegroundColor DarkGray
}

# ------------------------------------------------------------------ ขั้นที่ 2
Write-Step "ขั้นที่ 2/3  อัปโหลดโค้ด"

Invoke-Clasp push -f
if ($LASTEXITCODE -ne 0) {
    Write-Die "อัปโหลดไม่สำเร็จ ตรวจว่าเข้าสู่ระบบด้วยบัญชีที่ถูกต้องแล้วหรือยัง"
}
Write-Ok "อัปโหลดเรียบร้อย"

# ------------------------------------------------------------------ ขั้นที่ 3
Write-Step "ขั้นที่ 3/3  ออกเวอร์ชันใหม่ให้เว็บแอป"

$deployments = (Invoke-Clasp deployments 2>&1 | Out-String)
# บรรทัดที่ใช้ได้จะอยู่ในรูป  - <deploymentId> @<เลขเวอร์ชัน> ...  โดยข้าม @HEAD
$matches = [regex]::Matches($deployments, '(?m)^- ([A-Za-z0-9_-]+) @(\d+)')
$target = $null
if ($matches.Count -gt 0) {
    $target = ($matches | Sort-Object { [int]$_.Groups[2].Value } -Descending |
        Select-Object -First 1).Groups[1].Value
}

if (-not $target) {
    $scriptId = & node -p "require('./.clasp.json').scriptId"
    Write-Host "`n  ยังไม่พบ deployment ที่เผยแพร่ไว้`n" -ForegroundColor Yellow
    Write-Host "  ครั้งแรกต้องกด Deploy ในเบราว์เซอร์หนึ่งครั้งก่อน (ทำครั้งเดียวตลอดไป)"
    Write-Host "    1) เปิด https://script.google.com/d/$scriptId/edit"
    Write-Host "    2) Deploy → New deployment → Web app"
    Write-Host "       Execute as: Me   |   Who has access: Anyone"
    Write-Host "    3) จากนั้นครั้งต่อ ๆ ไปใช้ .\deploy.ps1 ได้เลย`n"
    exit 1
}

Invoke-Clasp deploy -i $target -d $Description
if ($LASTEXITCODE -ne 0) { Write-Die "ออกเวอร์ชันใหม่ไม่สำเร็จ" }
Write-Ok "ออกเวอร์ชันใหม่เรียบร้อย (deployment $target)"

Write-Host "`nเผยแพร่เวอร์ชันใหม่แล้ว" -ForegroundColor Green
Write-Host "  คำอธิบายเวอร์ชัน : $Description"
Write-Host "  ลิงก์เว็บแอป     : https://script.google.com/macros/s/$target/exec"
Write-Host "`n  URL เดิมไม่เปลี่ยน ผู้ใช้เห็นเวอร์ชันใหม่ทันทีเมื่อรีเฟรชหน้า`n" -ForegroundColor DarkGray
