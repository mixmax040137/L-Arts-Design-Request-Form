# ศึกษาระบบ L'arts Stock (https://pukmud.com/stock/)

เอกสารนี้สรุปผลการ "รื้อ" ระบบบริหารจัดการคลังสินค้าและเบิกจ่ายของที่ระลึก
คณะศิลปศาสตร์ มหาวิทยาลัยธรรมศาสตร์ จากหน้าเว็บสาธารณะ (HTML/CSS/JS ที่เสิร์ฟออกมาจริง)
เพื่อใช้เป็นพิมพ์เขียวในการสร้างระบบของเราเอง

> วิธีเก็บข้อมูล: ดึง HTML ดิบของหน้า public 5 หน้า (`index.php`, `guest_form.php`,
> `inventory_view.php`, `track_status.php`, `login.php`) + หน้าผลลัพธ์การค้นหา
> `track_status.php?search=1` แล้ววิเคราะห์โครงสร้าง มาร์กอัป และ JavaScript
> ส่วนที่เป็น "อนุมาน" จะกำกับไว้ชัดเจน — หลังบ้าน (admin) ไม่ได้เข้าไปดู เพราะต้องล็อกอิน

---

## 1. Tech stack ที่ใช้จริง

| ชั้น | ของที่ใช้ | หลักฐาน |
|---|---|---|
| Server | LiteSpeed | `server: LiteSpeed` |
| Backend | **PHP 8.1.34** (PHP ล้วน ไม่ใช้ framework) | `x-powered-by: PHP/8.1.34`, ไฟล์ลงท้าย `.php` |
| Session | PHP native session | `Set-Cookie: PHPSESSID=...; secure` |
| Database | อนุมานว่า MySQL/MariaDB | เป็นชุดปกติของ hosting แบบนี้ |
| CSS | Bootstrap 5.3.3 + Bootstrap Icons 1.11.3 (CDN) + `assets/css/style.css` | `<link>` ใน `<head>` |
| JS | jQuery 3.7.1, SweetAlert2 v11, DataTables 1.13.7 (ภาษาไทยผ่าน i18n/th.json) | `<script>` ใน `<head>` |
| ฟอนต์ | Google Fonts: **Prompt** + Inter (บางหน้าใช้ Mitr + Outfit) | `<link>` fonts.googleapis.com |
| รูปภาพ | อัปโหลดเก็บเป็นไฟล์ `.webp` ใน `/stock/uploads/prod_<hex13>.webp` | `src` ของการ์ดสินค้า |

**สรุปสถาปัตยกรรม:** เป็น PHP แบบ multi-page ดั้งเดิม (server-side rendering ล้วน)
ไม่มี API / SPA — ทุกหน้าคือ PHP ที่ echo HTML ออกมาตรง ๆ แล้วให้ jQuery จัดการ
กรอง/แบ่งหน้าฝั่ง client เท่านั้น ทำตามได้ง่ายมาก ไม่ต้องใช้ของหนัก

---

## 2. Sitemap (ฝั่งผู้ใช้ทั่วไป)

```
index.php ──────────── หน้า Hub รวม 4 การ์ดทางเข้า
├── guest_form.php ─── ยื่นคำขอเบิก (2 ขั้นตอน)
├── inventory_view.php ─ ดูของในคลัง (แคตตาล็อก)
├── track_status.php ── ติดตามสถานะใบเบิก
└── login.php ───────── เข้าสู่ระบบเจ้าหน้าที่ (หลังบ้าน)
```

### 2.1 `index.php` — Navigation Hub
ไม่มีเมนู ไม่มี navbar — ใช้ **ภาพ Cover เต็มความกว้าง** (`assets/images/Cover.jpg`,
`max-height:380px; object-fit:cover; rounded-4`) แล้วตามด้วยการ์ด 4 ใบ
(`col-12 col-md-6 col-lg-3` = 4 คอลัมน์บนจอใหญ่ / 2 บนแท็บเล็ต / 1 บนมือถือ)

การ์ดแต่ละใบมีสูตรเดียวกัน: ไอคอนในกล่องสี่เหลี่ยมมนขนาด 64px → หัวข้อ → คำอธิบาย →
ลิงก์ "→" ล่างสุด ตอน hover การ์ดยก `translateY(-6px)` และไอคอนสลับเป็นพื้นสีทึบ+ตัวอักษรขาว
แต่ละใบมีธีมสีคนละสี (`card-primary` ส้ม / `card-success` เขียว / `card-info` เขียวน้ำทะเล / `card-warning` เหลืองอำพัน)

### 2.2 `guest_form.php` — แบบฟอร์มขอเบิก (Step 1 จาก 2)
มี stepper บอกขั้น: **1) ข้อมูลผู้ขอเบิก → 2) เลือกของที่ระลึก**
เหนือฟอร์มมีกล่อง "หลักเกณฑ์การเบิก" (เส้นขอบซ้ายสีส้ม) ระบุกติกา 4 ข้อ

ฟิลด์ใน Step 1 (POST กลับไปที่ `guest_form.php` เอง):

| name | ชนิด | label | required |
|---|---|---|---|
| `email` | email | อีเมลติดต่อ (Email Address) | ✔ |
| `fullname` | text | ชื่อ - นามสกุล ผู้ขอเบิก | ✔ |
| `department` | text | สาขาวิชา / งาน / ฝ่าย | ✔ |
| `purpose` | textarea (3 แถว) | มีความประสงค์ที่จะขอเบิกของที่ระลึกเพื่อนำไปใช้... | ✔ |
| `pickup_location` | radio 3 ตัวเลือก | สถานที่ขอติดต่อรับพัสดุ | ✔ |

ค่าของ `pickup_location`: `งานสารบรรณ ท่าพระจันทร์` / `งานสารบรรณ ศูนย์รังสิต` /
`ฝ่ายสื่อสารองค์กร คณะศิลปศาสตร์`

**เทคนิค UI ที่น่าลอก:** radio ถูกซ่อน (`d-none`) แล้วใช้ `<label>` ครอบการ์ด
ทำให้เลือกโดยกดที่การ์ด และไฮไลต์ด้วย CSS `.pickup-radio:checked + .pickup-card`
— ได้ UI สวยโดยไม่ต้องเขียน JS สักบรรทัด

**Validation:** ใช้ `novalidate` + `.needs-validation` ของ Bootstrap แล้วดัก `submit`
ถ้า `checkValidity()` ไม่ผ่าน จะเด้ง SweetAlert2 ("กรอกข้อมูลไม่ครบถ้วน") แทน tooltip มาตรฐาน

**Step 2** (ยังเข้าไม่ถึงเพราะต้อง POST จริงเข้าระบบ production ซึ่งไม่ควรทำ) — อนุมานจาก
stepper + จากที่หน้าติดตามค้นด้วย "เบอร์โทร" ได้ ว่า Step 2 น่าจะเก็บ **เบอร์โทรศัพท์**
และ **รายการของ + จำนวนที่ขอเบิก** โดยข้อมูล Step 1 ถูกพักไว้ใน `$_SESSION`

### 2.3 `inventory_view.php` — แคตตาล็อกของที่ระลึก
- เรนเดอร์การ์ดสินค้า **ทั้งหมด** ออกมาจาก PHP ครั้งเดียว (ตอนดึงมามี 18 ชิ้น)
  แล้วให้ jQuery กรอง/แบ่งหน้าในฝั่ง browser ล้วน ๆ (ซ่อน/แสดงด้วย `d-none`)
- ตัวควบคุม 3 ตัว: `#searchInput` (ค้นชื่อ), `#categoryFilter` (dropdown หมวดหมู่),
  `#pageSizeSelect` (12 / 24 / 48 ชิ้นต่อหน้า)
- การ์ดพก metadata ไว้ที่ `data-name` และ `data-category` เพื่อให้ JS กรองได้เร็ว
- Pagination เขียนเอง: แสดงเลขหน้าแรก/หน้าสุดท้าย/หน้ารอบตัว ±1 ที่เหลือเป็น `...`
  และ animate scroll กลับขึ้นบน grid หลังเปลี่ยนหน้า
- ถ้าไม่เจอ → โชว์ `#noProductsMessage`

ข้อมูลที่แสดงต่อ 1 ชิ้น: รูป (`object-fit:contain`), **badge จำนวนคงเหลือ** ("เบิกได้ N ชิ้น"),
badge หมวดหมู่, ชื่อ, คำอธิบาย, และ "กลุ่มเป้าหมาย"

หมวดหมู่ที่มีจริง 7 หมวด: เครื่องเขียน, ผ้าและกระเป๋า, ของตกแต่งและแกดเจ็ต,
ภาชนะใส่เครื่องดื่ม, ของที่ระลึกอื่นๆ, แฟ้มและเอกสาร, เครื่องครัวและภาชนะ

กลุ่มเป้าหมายที่พบ: กลุ่มแขกทั่วไป, กลุ่ม VIP, กลุ่มนักเรียน, กลุ่มเด็กต่างชาติ
(**เลือกได้หลายค่า** — พบการ์ดที่เขียน "กลุ่มเด็กต่างชาติ, กลุ่มนักเรียน")

**Threshold สต็อกต่ำ:** ของที่เหลือ 1, 4, 5 ชิ้น ขึ้นป้าย "(สต็อกต่ำ)" แต่ที่เหลือ 6 ชิ้นไม่ขึ้น
→ เกณฑ์คือ **≤ 5 ชิ้น** (หรือเป็นค่า `min_stock` ต่อสินค้า)

### 2.4 `track_status.php` — ติดตามสถานะ
- ฟอร์ม **GET** ช่องเดียว `search` ค้นได้ 3 อย่างในช่องเดียวกัน: เลขที่ใบเบิก / อีเมล / เบอร์โทร
- ผลลัพธ์เป็นตาราง DataTables (ปิด sort คอลัมน์สุดท้าย, 5 แถว/หน้า, ภาษาไทยจาก CDN)
  คอลัมน์: เลขที่ใบเบิก | ผู้ขอเบิก/หน่วยงาน | วันที่ยื่น (`d/m/Y H:i`) | สถานะ (badge) | ปุ่มดูรายละเอียด
- กดปุ่มแล้วเปิด **modal** ที่มี **stepper แนวนอน** (บนมือถือพลิกเป็นแนวตั้งด้วย media query)
  พร้อมแถบ progress ไล่เฉดส้ม→เหลือง และรายการของที่ขอเบิก

**Flow สถานะหลัก (Success Flow) 4 ขั้น:**

| # | ไทย | อังกฤษ (บรรทัดรอง) |
|---|---|---|
| 1 | รออนุมัติ | Pending Approval |
| 2 | เตรียมของ | Preparing Items |
| 3 | รอส่งมอบ | Awaiting Delivery |
| 4 | สำเร็จ | Completed |

แต่ละ step มี 3 สถานะทางภาพ: ปกติ / `.active` (วงกลมส้มมี ring + scale 1.1) /
`.completed` (พื้น gradient ส้ม-เหลือง + เครื่องหมายถูก) และมี CSS class `.exception-alert`
สำหรับกรณีไม่ปกติ → **มี Exception Flow แยก** (น่าจะ "ไม่อนุมัติ / ยกเลิก") ที่ตัดออกจาก stepper ปกติ

### 2.5 `login.php` — เจ้าหน้าที่
ฟอร์ม POST ธรรมดา `username` + `password` ดีไซน์การ์ดกลางจอ ไม่มี "สมัครสมาชิก"
→ บัญชีเจ้าหน้าที่ถูกสร้างจากหลังบ้านเท่านั้น

---

## 3. Data model ที่อนุมานได้

จากฟิลด์และ UI ทั้งหมด โครงสร้างตารางที่พอเพียงคือ:

```sql
-- ผู้ใช้ระบบ (เจ้าหน้าที่)
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,      -- password_hash() ของ PHP
  fullname      VARCHAR(150) NOT NULL,
  role          ENUM('admin','staff') DEFAULT 'staff',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL          -- เครื่องเขียน, ผ้าและกระเป๋า, ...
);

CREATE TABLE target_groups (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL          -- กลุ่มแขกทั่วไป, กลุ่ม VIP, ...
);

CREATE TABLE products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,                          -- "พัสดุของที่ระลึก คณะศิลปศาสตร์"
  category_id  INT REFERENCES categories(id),
  image_path   VARCHAR(255),                  -- uploads/prod_xxx.webp
  qty_on_hand  INT NOT NULL DEFAULT 0,        -- "เบิกได้ N ชิ้น"
  min_stock    INT NOT NULL DEFAULT 5,        -- เกณฑ์ "(สต็อกต่ำ)"
  is_active    TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- many-to-many เพราะพบสินค้าที่มี 2 กลุ่มเป้าหมาย
CREATE TABLE product_target_groups (
  product_id      INT,
  target_group_id INT,
  PRIMARY KEY (product_id, target_group_id)
);

CREATE TABLE requisitions (
  id              INT AUTO_INCREMENT PRIMARY KEY,   -- "เลขที่ใบเบิก" = 1, 2, ...
  email           VARCHAR(150) NOT NULL,
  fullname        VARCHAR(150) NOT NULL,
  department      VARCHAR(150) NOT NULL,
  phone           VARCHAR(20),
  purpose         TEXT NOT NULL,
  pickup_location VARCHAR(150) NOT NULL,
  status          ENUM('pending','preparing','ready','completed','rejected','cancelled')
                  DEFAULT 'pending',
  reject_reason   TEXT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at     DATETIME NULL,
  prepared_at     DATETIME NULL,
  ready_at        DATETIME NULL,
  completed_at    DATETIME NULL,
  handled_by      INT NULL REFERENCES users(id)
);

CREATE TABLE requisition_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  requisition_id  INT REFERENCES requisitions(id) ON DELETE CASCADE,
  product_id      INT REFERENCES products(id),
  qty_requested   INT NOT NULL,
  qty_approved    INT NULL
);

-- บันทึกการเคลื่อนไหวสต็อก (ต้นแบบอาจไม่มี แต่ควรมี)
CREATE TABLE stock_movements (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     INT REFERENCES products(id),
  change_qty     INT NOT NULL,               -- +รับเข้า / -เบิกออก
  reason         VARCHAR(100),               -- 'receive','issue','adjust'
  requisition_id INT NULL,
  user_id        INT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

หมายเหตุ: ที่ตั้ง `status` เป็น ENUM แบบนี้เพราะ stepper มี 4 ขั้น + exception flow
ส่วนคอลัมน์ `*_at` แยกกัน เพื่อให้ stepper โชว์เวลาของแต่ละขั้นได้ (`.step-time`)

---

## 4. Design system ที่ถอดออกมาได้

ตัวแปร CSS ที่ใช้ซ้ำทุกหน้า — ก๊อปไปตั้งต้นได้เลย:

```css
:root {
  --primary-color: #e65c00;   /* Sunset Orange — สีหลักของแบรนด์ */
  --primary-hover: #b34700;
  --accent-color:  #ff7300;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --info-color:    #0d9488;
  --text-dark:     #1e293b;   /* Slate 800 */
  --text-light:    #64748b;   /* Slate 500 */
  --bg-light:      #f8fafc;   /* Slate 50 */
  --border-color:  #e2e8f0;
  --card-shadow:   0 15px 35px -10px rgba(15,23,42,.06);
  --transition:    all .25s cubic-bezier(.4,0,.2,1);
}
```

กติกาดีไซน์ที่เห็นซ้ำ ๆ:
- **มุมโค้งเยอะ**: การ์ด `border-radius: 20–24px`, input `12px`, ปุ่มหลัก `30px` (pill)
- **เงานุ่ม ฟุ้งกว้าง** (blur สูง, opacity ต่ำ) ไม่ใช่เงาแข็ง
- **Gradient ส้ม→เหลือง** (`135deg, #e65c00 → #fbbf24`) ใช้กับ header ฟอร์มและ progress bar
- Hover = ยกขึ้น `translateY(-2px ถึง -6px)` + เงาเข้มขึ้น, active = `scale(.98)`
- ฟอนต์ **Prompt** น้ำหนัก 300–700 (ไทยอ่านง่าย เข้ากับ Bootstrap)
- Input ใช้ icon ประกบซ้าย (`input-group-icon`) และ **ไฮไลต์ทั้งกลุ่มตอน focus**
  ด้วย `:focus-within` (เปลี่ยนสีขอบ + พื้นไอคอนเป็นฟ้าอ่อน)
- ทุก alert/confirm ใช้ SweetAlert2 สีปุ่ม `#e65c00` ไม่ใช้ `alert()`

---

## 5. แผนสร้างระบบของเราเอง

### เฟส 0 — วางฐาน
- โครง `config/db.php` (PDO + prepared statements), `includes/header.php`, `includes/footer.php`
- ไฟล์ SQL ตามหัวข้อ 3 + seed หมวดหมู่/กลุ่มเป้าหมาย
- `assets/css/style.css` ใส่ `:root` ตามหัวข้อ 4

### เฟส 1 — ฝั่งผู้ใช้ (public)
1. `index.php` — hub 4 การ์ด
2. `inventory_view.php` — query สินค้า + เรนเดอร์การ์ด + JS กรอง/แบ่งหน้า
3. `guest_form.php` — Step 1 เก็บลง `$_SESSION`, Step 2 เลือกของ+จำนวน แล้ว INSERT
   ทั้ง `requisitions` + `requisition_items` ใน **transaction** เดียว
4. `track_status.php` — ค้นด้วย id/email/phone + modal stepper

### เฟส 2 — หลังบ้าน (staff)
5. `login.php` + `logout.php` — `password_verify()` + `session_regenerate_id(true)`
6. `dashboard.php` — การ์ดสรุป (ใบเบิกรออนุมัติ, ของสต็อกต่ำ, ยอดเบิกเดือนนี้)
7. `products.php` — CRUD สินค้า + อัปโหลดรูป (แปลงเป็น `.webp`, สุ่มชื่อไฟล์)
8. `requisitions.php` — รายการใบเบิก + เปลี่ยนสถานะ (ตัดสต็อกตอนอนุมัติ, คืนสต็อกตอนยกเลิก)
9. `reports.php` — รายงานตามช่วงเวลา/หมวดหมู่ + export CSV/PDF

### เฟส 3 — ของแถมที่ต้นแบบยังไม่มี (หรือมองไม่เห็นจากหน้าบ้าน)
- ส่งอีเมลแจ้งอัตโนมัติทุกครั้งที่สถานะเปลี่ยน (PHPMailer)
- QR code / ลิงก์ติดตามเฉพาะใบ แทนการค้นด้วยเบอร์โทร
- Audit log ว่าใครเปลี่ยนสถานะอะไรเมื่อไหร่ (ตาราง `stock_movements` ครอบไว้แล้วส่วนหนึ่ง)
- พิมพ์ใบเบิก PDF ให้เซ็นรับของ

---

## 6. จุดที่ควร "ทำให้ดีกว่าต้นแบบ"

1. **ความเป็นส่วนตัวของหน้าติดตาม** — ตอนนี้พิมพ์เลข `1` ก็เห็นชื่อ-นามสกุลและหน่วยงาน
   ของผู้ขอเบิกได้ทันที ควรใช้รหัสอ้างอิงแบบสุ่ม (เช่น `LA-2569-A7X3K9`) แทนเลขวิ่ง
   หรือบังคับให้กรอกอีเมลคู่กับเลขใบเบิก
2. **กรอง/แบ่งหน้าฝั่ง client** — ใช้ได้ที่ 18 ชิ้น แต่พอถึงหลักร้อยจะโหลดช้า
   ควรย้ายไป query แบบ `LIMIT/OFFSET` พร้อม `WHERE` ที่ฝั่ง SQL
3. **Rate limit + CSRF token** ที่ฟอร์มสาธารณะ กันสแปมใบเบิกและกันยิงฟอร์มข้ามเว็บ
4. **ตัดสต็อกด้วย transaction + row lock** (`SELECT ... FOR UPDATE`) กันสองคนอนุมัติ
   ของชิ้นสุดท้ายพร้อมกัน
5. **ตรวจไฟล์อัปโหลดจริงจัง** — เช็ค MIME จริง, จำกัดขนาด, บันทึกนอก webroot หรือปิดการรัน PHP ในโฟลเดอร์ `uploads/`
6. **ทำ responsive/accessibility ให้ครบ** — เพิ่ม `aria-label` ที่การ์ด radio และปุ่ม pagination

---

## 7. สรุปสั้น

ระบบนี้ "เล็กแต่ครบ": PHP ล้วน + Bootstrap 5 + jQuery, 5 หน้า public, 1 หน้าล็อกอิน,
ตารางหลักไม่เกิน 8 ตาราง จุดแข็งจริง ๆ อยู่ที่ **ดีไซน์** (โทนส้ม-เหลือง มุมโค้ง เงานุ่ม
stepper ทั้งในฟอร์มและหน้าติดตาม) และ **การออกแบบ flow ที่ไม่ต้องสมัครสมาชิก** —
คนขอเบิกกรอกฟอร์มแล้วมาเช็คสถานะทีหลังด้วยอีเมล/เบอร์โทรได้เลย
ทำตามได้จริงภายในไม่กี่วัน ถ้าเริ่มจากโครงในหัวข้อ 3–5
