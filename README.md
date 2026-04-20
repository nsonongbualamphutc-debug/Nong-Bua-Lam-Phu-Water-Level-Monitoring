# 🌊 ระบบเฝ้าระวังสถานการณ์น้ำ จ.หนองบัวลำภู
## Water Level Monitoring System — Nong Bua Lam Phu Province

ระบบแดชบอร์ดเฝ้าระวังสถานการณ์น้ำแบบ Real-time สำหรับจังหวัดหนองบัวลำภู ครอบคลุมสถานีวัดระดับน้ำ 12 แห่ง ใน 2 ลำน้ำ

### 🔗 Demo: [https://onoshung.github.io/Water-Monitor-NBL/](https://onoshung.github.io/Water-Monitor-NBL/)

---

## ✨ คุณสมบัติหลัก

### 🗺️ แผนที่ Leaflet
- แสดงตำแหน่งสถานี 12 แห่ง บนแผนที่จริง (CartoDB Dark)
- เส้นทางไหลของน้ำ ลำน้ำพะเนียง & ลำน้ำโมง
- Marker สีตามระดับเตือนภัย (เขียว/เหลือง/แดง)
- Pulse animation สำหรับสถานีวิกฤติ
- แสดงค่าระดับน้ำ ม.รทก. ณ แต่ละสถานี

### 📊 Dashboard
- KPI Cards: สถานีทั้งหมด / ปกติ / เฝ้าระวัง / วิกฤติ
- Alert Banner อัตโนมัติเมื่อมีสถานีวิกฤติ
- Elevation Profile ระดับความสูงสถานี
- รายละเอียดสถานี พร้อมแถบเทียบเกณฑ์เตือนภัย

### 📝 แบบฟอร์มรายงาน
- กรอกระดับน้ำ → คำนวณสถานะอัตโนมัติ
- เลือกสภาพอากาศ (พายุฤดูร้อน, ดีเปรสชัน ฯลฯ)
- ปริมาณน้ำฝนสะสม
- ประวัติการรายงาน

### ⚙️ Google Sheets Backend
- เชื่อมต่อ Google Sheets ผ่าน Apps Script
- JSONP (ไม่มีปัญหา CORS)
- Auto-refresh ระดับน้ำ
- แจ้งเตือน LINE Notify & Email อัตโนมัติ

---

## 📁 โครงสร้างไฟล์

```
Water-Monitor-NBL/
├── index.html      ← แดชบอร์ดหลัก (Single file, deploy บน GitHub Pages)
├── Code.gs         ← Google Apps Script backend
└── README.md
```

## 🚀 วิธีติดตั้ง

### 1. GitHub Pages (Frontend)
```bash
git clone https://github.com/onoshung/Water-Monitor-NBL.git
# เปิด Settings → Pages → Source: main branch
```

### 2. Google Sheets Backend
1. สร้าง Google Sheet ใหม่
2. **Extensions → Apps Script**
3. วางโค้ด `Code.gs` ทั้งหมด
4. รัน `initSheets()` ครั้งแรก → จะสร้าง 3 Sheet อัตโนมัติ:
   - `CurrentLevels` — ระดับน้ำปัจจุบัน
   - `ReportHistory` — ประวัติรายงาน
   - `StationConfig` — ตั้งค่าเกณฑ์เตือนภัย
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. คัดลอก URL → วางในแดชบอร์ด (แท็บ ⚙️ ตั้งค่า)

### 3. LINE Notify (แจ้งเตือน)
1. ไป https://notify-bot.line.me/th/ → สร้าง Token
2. ใน Apps Script: **File → Project properties → Script properties**
3. เพิ่ม: `LINE_NOTIFY_TOKEN` = `your_token`
4. เพิ่ม: `ALERT_EMAIL` = `your@email.com`
5. รัน `setupAlertTrigger()` → ตรวจสอบทุก 15 นาที

---

## 📊 สถานีวัดระดับน้ำ

### ลำน้ำพะเนียง (10 สถานี)
| # | สถานี | อำเภอ | ความสูง (ม.รทก.) | เกณฑ์วิกฤติ |
|---|--------|--------|-------------------|-------------|
| 1 | วังปลาป้อม | นาวัง | 290 | ≥ 290 ม. |
| 2 | โคกกระทอ | นาวัง | 266 | ≥ 266 ม. |
| 3 | วังสามหาบ | นาวัง | 258 | ≥ 258 ม. |
| 4 | บ้านหนองด่าน | นากลาง | 249 | ≥ 249 ม. |
| 5 | บ้านฝั่งแดง | นากลาง | 237 | ≥ 237 ม. |
| 6 | ปตร.หนองหว้าใหญ่ | เมืองฯ | 216 | ≥ 216 ม. |
| 7 | วังหมื่น | เมืองฯ | 210 | ≥ 210 ม. |
| 8 | ปตร.ปู่หลอด | เมืองฯ | 203 | ≥ 203 ม. |
| 9 | บ้านข้องโป้ | เมืองฯ | 201 | ≥ 201 ม. |
| 10 | ปตร.หัวนา | เมืองฯ | 191 | ≥ 191 ม. |

### ลำน้ำโมง (2 สถานี)
| # | สถานี | อำเภอ | ความสูง (ม.รทก.) | เกณฑ์วิกฤติ |
|---|--------|--------|-------------------|-------------|
| 1 | คลองบุญทัน | สุวรรณคูหา | 231 | ≥ 231 ม. |
| 2 | บ้านโคก | สุวรรณคูหา | 218 | ≥ 218 ม. |

---

## 🛡️ เทคโนโลยี

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Map**: Leaflet.js + CartoDB Dark Tiles
- **Backend**: Google Apps Script + Google Sheets
- **Hosting**: GitHub Pages
- **Fonts**: Kanit, Sarabun (Google Fonts)
- **แจ้งเตือน**: LINE Notify, Email (MailApp)

---

## 👤 พัฒนาโดย

สำนักงานสถิติจังหวัดหนองบัวลำภู  
Provincial Statistics Office, Nong Bua Lam Phu

---

*ข้อมูลสถานีวัดระดับน้ำจาก: สำนักงานป้องกันและบรรเทาสาธารณภัย จ.หนองบัวลำภู*
