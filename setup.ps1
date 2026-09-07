# setup.ps1 — ติดตั้งระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์ขึ้น Google Apps Script
# ใช้กับ Windows (PowerShell)   macOS และ Linux ใช้ setup.sh
#
#   .\setup.ps1                 สร้างโปรเจกต์ Apps Script ใหม่ให้อัตโนมัติ
#   .\setup.ps1 <SCRIPT_ID>     ใช้โปรเจกต์ที่สร้างไว้แล้ว
#
param([string]$ScriptId = "")

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$AppDir = Join-Path $PSScriptRoot "apps-script"
$Title  = "ระบบขอรับบริการออกแบบสื่อ - ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์"

function Write-Step($text) { Write-Host "`n▶ $text" -ForegroundColor DarkYellow }
function Write-Ok($text)   { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow }
function Write-Die($text)  { Write-Host "`n  ✗ $text`n" -ForegroundColor Red; exit 1 }

# เรียก clasp ผ่าน npx เพื่อไม่ต้องติดตั้งแบบ global
# ไม่คืนค่าใด ๆ ให้ตรวจผลด้วย $LASTEXITCODE หลังเรียกแทน
function Invoke-Clasp {
    param([Parameter(ValueFromRemainingArguments = $true)]$ClaspArgs)
    & npx --yes "@google/clasp@2" @ClaspArgs
}

Write-Host "`nติดตั้งระบบขอรับบริการออกแบบสื่อประชาสัมพันธ์" -ForegroundColor White
Write-Host "ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์" -ForegroundColor DarkGray

# ---------------------------------------------------------------- ขั้นที่ 1
Write-Step "ขั้นที่ 1/5  ตรวจสอบ Node.js"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Die "ไม่พบ Node.js กรุณาติดตั้งจาก https://nodejs.org (เลือกรุ่น LTS) แล้วรันสคริปต์นี้ใหม่"
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) { Write-Die "ต้องใช้ Node.js เวอร์ชัน 18 ขึ้นไป (ตอนนี้คือ $(& node -v))" }
Write-Ok "Node.js $(& node -v)"
if (-not (Test-Path $AppDir)) { Write-Die "ไม่พบโฟลเดอร์ apps-script กรุณารันสคริปต์นี้จากในโฟลเดอร์โครงการ" }

# ---------------------------------------------------------------- ขั้นที่ 2
Write-Step "ขั้นที่ 2/5  ตรวจสอบการเข้าสู่ระบบ Google"

Set-Location $AppDir
Write-Host "  กำลังเตรียม clasp ครั้งแรกอาจใช้เวลาสักครู่..." -ForegroundColor DarkGray
# ตรวจจากข้อความที่ได้ ไม่ใช้ exit code เพราะ clasp ไม่รับประกันค่านั้น
$status = (& npx --yes "@google/clasp@2" login --status 2>&1 | Out-String)
$match = [regex]::Match($status, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
if ($match.Success) {
    Write-Ok "เข้าสู่ระบบอยู่แล้ว: $($match.Value)"
    Write-Host "`n  หากไม่ใช่บัญชี pr@arts.tu.ac.th ให้กด Ctrl+C แล้วรัน:" -ForegroundColor Yellow
    Write-Host "    npx --yes `"@google/clasp@2`" logout ; .\setup.ps1"
    Read-Host "`n  กด Enter เพื่อไปต่อ" | Out-Null
} else {
    Write-Warn "ยังไม่ได้เข้าสู่ระบบ กำลังเปิดเบราว์เซอร์..."
    Write-Host "`n  สำคัญ: หน้าเลือกบัญชีจะแสดงทุกบัญชีที่ล็อกอินอยู่" -ForegroundColor White
    Write-Host "  ต้องเลือก pr@arts.tu.ac.th เท่านั้น แล้วกด Allow`n" -ForegroundColor White
    Invoke-Clasp login
    if ($LASTEXITCODE -ne 0) { Write-Die "เข้าสู่ระบบไม่สำเร็จ" }
    Write-Ok "เข้าสู่ระบบเรียบร้อย"
}

# ---------------------------------------------------------------- ขั้นที่ 3
Write-Step "ขั้นที่ 3/5  เตรียมโปรเจกต์ Apps Script"

if (Test-Path ".clasp.json") {
    Write-Ok "พบ .clasp.json เดิม จะใช้โปรเจกต์เดิมต่อ"
} elseif ($ScriptId -ne "") {
    # เขียนแบบ UTF-8 ไม่มี BOM เพื่อให้ clasp และ node อ่านไฟล์ได้แน่นอน
    $json = "{`n  `"scriptId`": `"$ScriptId`",`n  `"rootDir`": `".`"`n}"
    [System.IO.File]::WriteAllText(
        (Join-Path (Get-Location) ".clasp.json"), $json,
        (New-Object System.Text.UTF8Encoding $false))
    Write-Ok "ผูกกับโปรเจกต์ที่ระบุ: $ScriptId"
} else {
    Write-Warn "กำลังสร้างโปรเจกต์ Apps Script ใหม่..."
    $backup = Join-Path $env:TEMP "appsscript.backup.json"
    Copy-Item "appsscript.json" $backup -Force
    Invoke-Clasp create --type standalone --title $Title --rootDir .
    if ($LASTEXITCODE -ne 0) {
        Remove-Item $backup -Force -ErrorAction SilentlyContinue
        Write-Die @"
สร้างโปรเจกต์ไม่สำเร็จ — มักเกิดจากยังไม่ได้เปิด Apps Script API
      แก้โดยเปิด https://script.google.com/home/usersettings ด้วยบัญชี pr@arts.tu.ac.th
      แล้วเปิดสวิตช์ Google Apps Script API เป็น On จากนั้นรันสคริปต์นี้ใหม่
"@
    }
    # clasp create ดึง appsscript.json เปล่าจากเซิร์ฟเวอร์มาทับ ต้องคืนของเราไป
    Move-Item $backup "appsscript.json" -Force
    Write-Ok "สร้างโปรเจกต์และคืนค่า appsscript.json ของระบบเรียบร้อย"
}

$scriptIdValue = & node -p "require('./.clasp.json').scriptId"

# ---------------------------------------------------------------- ขั้นที่ 4
Write-Step "ขั้นที่ 4/5  อัปโหลดโค้ดขึ้นโปรเจกต์"

Invoke-Clasp push -f
if ($LASTEXITCODE -ne 0) {
    Write-Die "อัปโหลดไม่สำเร็จ — ตรวจว่าเปิด Apps Script API แล้วที่ https://script.google.com/home/usersettings"
}
$fileCount = (Get-ChildItem -File | Where-Object { $_.Name -match '\.(gs|html)$' -or $_.Name -eq 'appsscript.json' }).Count
Write-Ok "อัปโหลดครบ $fileCount ไฟล์"

# ---------------------------------------------------------------- ขั้นที่ 5
Write-Step "ขั้นที่ 5/5  ขั้นตอนที่ต้องทำในเบราว์เซอร์"

Write-Host @"

  เหลืออีก 3 คลิกเท่านั้น ระบบจะติดตั้งฐานข้อมูลและโฟลเดอร์ให้เองทั้งหมด

  1) เปิดโปรเจกต์
     https://script.google.com/d/$scriptIdValue/edit

  2) กด Deploy → New deployment
     - กดไอคอนเฟืองข้างคำว่า Select type แล้วเลือก Web app
     - Execute as     : Me (pr@arts.tu.ac.th)
     - Who has access : Anyone
     - กด Deploy แล้วกด Authorize access
       (หากขึ้น "Google hasn't verified this app" ให้กด Advanced → Go to ... → Allow)
     - คัดลอก Web app URL ที่ได้

  3) เปิด Web app URL ในเบราว์เซอร์
     - ระบบจะติดตั้งฐานข้อมูล โฟลเดอร์ และทริกเกอร์ให้อัตโนมัติ (ใช้เวลาราว 20 วินาที)
     - รหัสติดตั้ง จะถูกส่งไปที่อีเมล pr@arts.tu.ac.th
     - กรอกรหัสนั้นในหน้าที่ขึ้นมา พร้อมตั้งชื่อและรหัสผ่านผู้ดูแลระบบ

  เสร็จแล้วพร้อมใช้งานทันที ตั้งค่า Claude API key ได้ที่ หน้าเจ้าหน้าที่ → ตั้งค่า

  แก้โค้ดภายหลัง: รัน .\setup.ps1 อีกครั้ง แล้วกด Deploy → Manage deployments → New version

"@

Write-Host "อัปโหลดโค้ดเรียบร้อยแล้ว`n" -ForegroundColor Green
