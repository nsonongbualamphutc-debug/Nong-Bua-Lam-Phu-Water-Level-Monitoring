# 💧 ระบบติดตามสถานการณ์น้ำ จังหวัดหนองบัวลำภู

ระบบแดชบอร์ด Real-time สำหรับติดตามระดับน้ำ 12 สถานี ใน 2 ลำน้ำ (พะเนียง + โมง) ครอบคลุม 4 อำเภอ พร้อมพยากรณ์อากาศ เรดาร์ฝน ระบบกรอกข้อมูล และฟีเจอร์ระดับองค์กร

---

## 📦 ไฟล์ในชุดนี้

| ไฟล์ | คำอธิบาย |
|---|---|
| `index.html` | แดชบอร์ดหน้าหลัก |
| `Code.gs` | Backend ของ Google Apps Script |
| `README.md` | คู่มือนี้ |

---

## ⚙️ ขั้นตอนการติดตั้ง (ครั้งแรก)

### 1️⃣ สร้าง Google Sheet
1. ไปที่ [sheets.google.com](https://sheets.google.com) → สร้าง Sheet ใหม่
2. ตั้งชื่อเช่น `Water Dashboard Nong Bua Lam Phu`

### 2️⃣ ติดตั้ง Apps Script
1. ในชีต → เมนู **Extensions → Apps Script**
2. ลบโค้ดเดิมในไฟล์ `Code.gs`
3. คัดลอกเนื้อหาจาก `Code.gs` ที่ส่งให้ → วางทับ
4. กด 💾 Save (Ctrl+S)

### 3️⃣ รัน Setup ครั้งแรก
1. ใน Apps Script Editor → เลือกฟังก์ชัน **`setupSheets`** จาก dropdown
2. กดปุ่ม **▶ Run**
3. **Authorize**: อนุญาต permission ทั้งหมด (Drive + Sheets + URL Fetch)
4. รอจน popup `✅ Setup เรียบร้อย`
5. กลับไปที่ Sheet — จะมี 5 ชีต: `Stations`, `Current`, `History`, `Audit`, `RateLimit`

### 4️⃣ จัดการ PIN
1. เปิด Apps Script → **Project Settings**
2. เลื่อนลงไปที่ **Script properties** → **Add script property**
3. ตั้งค่า:
   - Property: `APP_PIN`
   - Value: PIN ที่จะใช้สำหรับบันทึกข้อมูล
4. กด **Save**

> หน้า `input.html` จะไม่เก็บ PIN จริงไว้ในไฟล์แล้ว ระบบจะส่ง PIN ที่ผู้ใช้กรอกไปให้ `Code.gs` ตรวจตอนบันทึกข้อมูล

### 5️⃣ Deploy เป็น Web App
1. ใน Apps Script → กด **Deploy → New deployment**
2. คลิก ⚙️ ข้าง "Select type" → เลือก **Web app**
3. ตั้งค่า:
   - **Description**: `Water Dashboard API v2`
   - **Execute as**: **Me** (อีเมลของคุณ)
   - **Who has access**: **Anyone**
4. กด **Deploy** → อนุญาต permission อีกครั้ง
5. **คัดลอก URL** ที่ขึ้นมา (รูปแบบ: `https://script.google.com/macros/s/AKfycby.../exec`)

### 6️⃣ ใส่ URL ลงใน Dashboard
1. เปิดไฟล์ `config.js` ด้วย Notepad / VS Code
2. ค้นหา (Ctrl+F): `API_URL`
3. แทนที่ด้วย URL ที่ได้จากขั้นตอน 5
4. บันทึกไฟล์

```javascript
// บรรทัดที่ต้องแก้
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycby.../exec'
};
```

### 7️⃣ Deploy ขึ้น GitHub Pages
1. Push ไฟล์ทั้งหมดขึ้น GitHub repository โดยให้ `index.html` อยู่ที่ root
2. Settings → Pages → Source: `main` branch / root
3. รอ 1-2 นาที จะได้ URL `https://onoshung.github.io/<repo>/`

---

## 🔄 การอัปเดต Apps Script (สำคัญ!)

**เมื่อแก้ Code.gs แล้ว ต้องสร้าง deployment ใหม่:**

1. Apps Script → **Deploy → Manage deployments**
2. คลิก ✏️ icon (edit) ที่ deployment เดิม
3. **Version** dropdown → เลือก **New version**
4. กด **Deploy**

ถ้าใช้ URL เดิม (ลงท้าย `/exec`) ไม่ต้องแก้ใน HTML ใหม่ แต่หากเลือก "Test deployment" จะได้ URL ใหม่

---

## 📲 ตั้งค่า LINE Notify (ทางเลือก — แนะนำ)

ระบบจะส่งข้อความเข้า LINE เมื่อสถานะสถานีเปลี่ยน (เช่น เขียว → แดง)

1. ไปที่ [https://notify-bot.line.me/my/](https://notify-bot.line.me/my/) → เข้าสู่ระบบ LINE
2. Generate token → เลือก group หรือคุยส่วนตัว → ตั้งชื่อ `Water NB`
3. คัดลอก token (ขึ้นต้นด้วยอักษรแบบสุ่ม ~40 ตัว)
4. กลับไปที่ Apps Script → ⚙️ **Project Settings**
5. เลื่อนลงไป **Script properties** → **Add script property**
   - Property: `LINE_TOKEN`
   - Value: token ที่คัดลอกมา
6. กด **Save**

> **หมายเหตุ:** LINE Notify ทาง LINE Corporation ประกาศจะ deprecate ในอนาคต — โค้ดสามารถปรับให้ใช้ LINE Messaging API หรือ Discord webhook แทนได้

---

## 📅 ตั้งค่า Daily Report (รายงานสรุปทุกเช้า) ⭐ ใหม่

ระบบส่งสรุปสถานการณ์น้ำเข้า LINE ทุกวันเวลา 6:30 น. อัตโนมัติ

### ตั้งค่า
1. ตั้ง LINE Notify Token ก่อน (ดูหัวข้อด้านบน)
2. (ทางเลือก) ตั้ง token แยกเฉพาะ daily report:
   - Property: `LINE_TOKEN_DAILY` (ถ้าไม่ตั้ง จะใช้ `LINE_TOKEN` แทน)
3. ใน Apps Script Editor → เลือกฟังก์ชัน **`installDailyReportTrigger`** → กด **▶ Run**
4. รอ popup `✅ ติดตั้ง Daily Report Trigger สำเร็จ`

### ตัวอย่างข้อความที่ได้รับทุกเช้า
```
📊 สรุปสถานการณ์น้ำ จ.หนองบัวลำภู
📅 26 เม.ย. 2569

🟢 ปกติ: 9 | 🟡 เฝ้าระวัง: 2 | 🔴 วิกฤติ: 1
📈 เปรียบเทียบ: แย่ลงจากเมื่อวาน +1

🌧️ ฝน 24 ชม. ที่ผ่านมา: 12.4 มม.
🔮 พยากรณ์ฝน 3 วันถัดไป: 45.2 มม.

🚨 ต้องติดตาม:
🔴 บ้านฝั่งแดง (236.7 ม.รทก.)
🟡 ปตร.ปู่หลอด (202.6 ม.รทก.)

✅ กรอกข้อมูลครบทุกสถานีแล้ว
```

### คำสั่งอื่น
- **ทดสอบ:** `testDailyReport()` — ดูข้อความใน Logger ก่อนส่งจริง
- **ยกเลิก:** `uninstallDailyReportTrigger()` — ลบ trigger

---

## 🔐 ระบบ Sign-in & Roles (Google Account) ⭐ ใหม่

นอกจากใช้ PIN กรอกข้อมูล ระบบรองรับการให้สิทธิ์ผ่านบัญชี Google ด้วย — ผู้ที่ได้สิทธิ์ไม่ต้องกรอก PIN

### Roles ที่มี
| Role | สิทธิ์ |
|---|---|
| `admin` | กรอก/แก้ทุกสถานี |
| `district_admin` | กรอกได้เฉพาะสถานีที่กำหนด (หลายสถานี) |
| `station_officer` | กรอกได้เฉพาะสถานีเดียว |
| `viewer` | ดูอย่างเดียว ไม่กรอก |

### วิธีเพิ่ม User
1. เปิดชีต **Users**
2. เพิ่มแถวใหม่:

| email | name | role | allowedStations | active | note |
|---|---|---|---|---|---|
| `boss@gov.go.th` | ผู้ว่าฯ | `admin` | `all` | `TRUE` | ผู้ว่าราชการจังหวัด |
| `naklang@gov.go.th` | นายอำเภอนากลาง | `district_admin` | `4,5` | `TRUE` | สถานี 4,5 |
| `officer1@gov.go.th` | จนท.สถานี 1 | `station_officer` | `1` | `TRUE` | นางสาว... |

3. **ลำคัญ**: Web App ต้อง deploy ด้วย `Execute as: User accessing the web app` หรือเปิด Sign-in โหมด เพื่อให้ `Session.getActiveUser()` ทำงาน

### หน้าเว็บแสดง role อัตโนมัติ
- มุมขวาบนของ header จะแสดง 👤 ชื่อ + แท็ก role
- เมื่อกดปุ่ม "📝 กรอกข้อมูล" — ถ้ามีสิทธิ์ Google จะข้าม PIN ให้
- ถ้าไม่ได้ login หรือไม่มีสิทธิ์ → ใช้ PIN ตามเดิม

---

## ⚡ Performance Optimization ⭐ ใหม่

ระบบมีการป้องกัน Apps Script quota เต็ม:

- **Server-side cache** — `getAllData` cache 60 วินาที (ลด Sheet read 95%+)
- **Client smart cache** — localStorage 60 วินาที + stale-while-revalidate
- **Submit throttle** — 1 บันทึก/สถานี/30 วินาที (กัน spam)
- **Cache bust อัตโนมัติ** — เมื่อ submit สำเร็จ ระบบ clear cache ให้
- **Apps Script quota ปกติ:** 20,000 URL Fetch/วัน — รองรับผู้ใช้ ~50-100 คน

---

## 🏘️ ชั้นข้อมูลพื้นที่เสี่ยง ⭐ ใหม่

แผนที่หลักมีปุ่มเปิด/ปิดชั้นข้อมูลพื้นที่เสี่ยง:
- รัศมี ~2.5 กม. รอบสถานี **ปลายน้ำสุด 6 อันดับ** (ตาม `elev` ต่ำสุด)
- เปลี่ยนสีตามสถานะของสถานีเหนือมัน (แดง/เหลือง/เขียว)
- คลิกพื้นที่จะเห็น popup รายชื่อหมู่บ้าน + รัศมี + สถานะ
- กดปุ่ม **🏘️ พื้นที่เสี่ยง** ที่ map toolbar

> **หมายเหตุ:** การคำนวณพื้นที่เสี่ยงเป็น approximate — ในการใช้งานจริงควรใส่ GeoJSON ที่ได้จากกรมโยธาฯ หรือ ปภ. แทน

---

## 🇹🇭 TMD API (กรมอุตุนิยมวิทยา) ⭐ ใหม่

ระบบเตรียมพร้อมสำหรับเชื่อม TMD API จริง — เป็นทางเลือกเพิ่มเติม Open-Meteo

### วิธีตั้งค่า
1. สมัคร API key ฟรีที่ [https://data.tmd.go.th/](https://data.tmd.go.th/)
2. คัดลอก API token
3. แก้ไข `config.js` หาบรรทัด:
   ```js
   const TMD_API_KEY = ''; // ใส่ API key ที่นี่
   ```
4. ใส่ key → บันทึก
5. หน้าเว็บจะแสดงประกาศจาก TMD ใต้ weather forecast

ถ้าไม่ใส่ key — ระบบใช้ Open-Meteo ตามปกติ + แสดงลิงก์ tmd.go.th สำหรับประกาศเตือนภัย

---

## 📅 Compare with Date — ดูสถานะย้อนหลัง 🆕 Phase 4

ฟีเจอร์ "ย้อนเวลา" ดูสถานะของทุกสถานี ณ วันที่เลือกได้

- แถบ Date Picker ด้านบน — เลือกวันที่ต้องการ
- ระบบจะเปลี่ยนข้อมูลทั้งหน้า: KPI / แผนที่ / สถานะ ให้ตรงกับวันที่เลือก
- กราฟยังคงแสดงเส้นเวลาตามปกติ (เปรียบเทียบได้)
- กดปุ่ม "⏎ กลับสู่วันนี้" เมื่อต้องการกลับมา

> **Use case:** ผู้บริหารถามว่า "เมื่อ 3 วันก่อนสถานีฝั่งแดงเป็นยังไง?" — คลิกเดียวเห็นเลย

---

## 🤖 AI Insight — สรุปสถานการณ์ด้วย AI 🆕 Phase 4

ใช้ Claude หรือ Gemini สรุปสถานการณ์เป็นภาษาธรรมชาติ — เหมาะสำหรับผู้บริหารอ่าน 30 วินาที

### ตั้งค่า
1. สมัคร API key ที่:
   - **Anthropic Claude**: [console.anthropic.com](https://console.anthropic.com) (แนะนำ — คุณภาพดีที่สุด)
   - **Google Gemini**: [aistudio.google.com](https://aistudio.google.com/app/apikey) (มีโควต้าฟรี)
2. ตั้ง Script Property:
   - `ANTHROPIC_API_KEY` หรือ `GEMINI_API_KEY`
3. หน้าเว็บ → กดปุ่ม **✨ สร้างคำสรุป** ใน AI Insight card
4. รอ 5-10 วิ — ได้ข้อความสรุป 3-5 ประโยค ครอบคลุม: ความเสี่ยง / จุดเฝ้าระวัง / คำแนะนำ

### ตัวอย่างผลลัพธ์
> "สถานการณ์น้ำในจังหวัดหนองบัวลำภูโดยรวมอยู่ในเกณฑ์เฝ้าระวัง โดยมีสถานีบ้านฝั่งแดงและวังหมื่นที่ใกล้เกณฑ์เฝ้าระวังในช่วง 3 วันที่ผ่านมา ประกอบกับพยากรณ์ฝนสะสม 3 วันข้างหน้าที่ 45 มม. แนะนำให้เจ้าหน้าที่ในพื้นที่อำเภอเมืองและนาวังเตรียมความพร้อมเครื่องสูบน้ำและประชาสัมพันธ์ให้ประชาชนในพื้นที่ลุ่มเฝ้าระวังเป็นพิเศษ"

---

## 🚨 Telegram Bot — ทางเลือกเสริม LINE 🆕 Phase 4

LINE Notify จะถูก deprecate — รองรับ Telegram Bot เป็นทางเลือก

### ตั้งค่า
1. คุยกับ [@BotFather](https://t.me/botfather) ใน Telegram
2. ส่ง `/newbot` → ตั้งชื่อ → ได้ **Bot Token**
3. ส่งข้อความใดก็ได้ในแชทกับ bot ของคุณ
4. เปิด `https://api.telegram.org/bot<TOKEN>/getUpdates` → หา `chat.id`
5. ตั้ง Script Properties:
   - `TELEGRAM_BOT_TOKEN` = bot token
   - `TELEGRAM_CHAT_ID` = chat id
6. ระบบจะส่งทั้ง LINE + Telegram อัตโนมัติ

---

## 🏷️ Custom Rule Engine 🆕 Phase 4

สร้างเงื่อนไขแจ้งเตือนเองได้ในชีต `Rules`

### Conditions ที่รองรับ
| Condition | Threshold | Description |
|---|---|---|
| `rise_per_day` | 0.5 | ระดับน้ำเพิ่มเร็วเกิน 0.5 ม./วัน |
| `red_count` | 2 | สถานีวิกฤติ ≥ 2 แห่ง (ครบ duration_days) |
| `yellow_count` | 3 | สถานีเฝ้าระวัง ≥ 3 แห่ง (ครบ duration_days) |
| `rain_3days` | 100 | ฝนพยากรณ์สะสม 3 วัน ≥ 100 มม. |
| `level_above_yellow_days` | 1 | สถานีอยู่เหนือเกณฑ์เฝ้าระวังนาน N วัน |

### ติดตั้ง trigger
- รัน `installRuleEngineTrigger()` — ตรวจทุก 1 ชม.
- ส่งแจ้งเตือนตาม channel: `line` / `telegram` / `both`
- ป้องกัน spam: rule เดียวกันยิงแค่ครั้งเดียวต่อวัน

---

## 🌊 EGAT/RID Integration (เขื่อนข้อมูลจริง) 🆕 Phase 4

เปลี่ยนจากข้อมูล mock เป็นข้อมูลจริงจากเขื่อน

### วิธี
1. แก้ในชีต `Dams` — คอลัมน์ `current_mcm` ด้วยค่าล่าสุด (manual)
2. หรือ **อัตโนมัติ**: เปลี่ยน `source` จาก `manual` → `egat` / `rid`
3. แก้ฟังก์ชัน `syncDamsFromAPI()` ใน Code.gs ให้ใส่ endpoint จริง:
   - **EGAT**: ติดต่อขอ API ที่ [www.egat.co.th](https://www.egat.co.th)
   - **RID**: ขอที่ [water.rid.go.th](https://water.rid.go.th)
   - **ThaiWater (สทนช.)**: [water.thaiwater.net](https://water.thaiwater.net) (รวมข้อมูลทั้ง EGAT+RID)
4. รัน `installDamsSyncTrigger()` — sync อัตโนมัติทุก 6 ชม.

---

## 🎯 Geofence Push Notification 🆕 Phase 4

แจ้งเตือนเมื่อผู้ใช้อยู่ใกล้สถานีในสถานะวิกฤติ

- เมื่อกด "📡 ใช้ตำแหน่งปัจจุบัน" → ระบบตรวจสถานีในรัศมี 5 กม.
- ถ้ามีสถานี **แดง** ในรัศมี → แสดง banner สีแดงและส่ง browser notification
- ใช้คู่กับ PWA — ติดตั้งบน home screen รับแจ้งเตือนได้ทันที

---

## 📊 Looker Studio Integration 🆕 Phase 4

สร้าง dashboard เชิงลึกได้ผ่าน Google Looker Studio (ฟรี)

1. ไปที่ [datastudio.google.com](https://datastudio.google.com)
2. Create → Data source → **Google Sheets**
3. เลือกชีต `History` หรือ `Audit`
4. สร้างกราฟตามต้องการ (เช่น heatmap, time series, slicer)
5. แชร์/Embed ได้บนเว็บไซต์อื่น

> **Use case:** ทำรายงานประจำเดือนสำหรับศาลากลาง / นำเสนอที่ประชุม

---

## 🔐 PIN เริ่มต้น

| สถานี | PIN | อำเภอ |
|---|---|---|
| 1. วังปลาป้อม | `1234` | นาวัง |
| 2. โคกกระทอ | `1235` | นาวัง |
| 3. วังสามหาบ | `1236` | นาวัง |
| 4. บ้านหนองด่าน | `1237` | นากลาง |
| 5. บ้านฝั่งแดง | `1238` | นากลาง |
| 6. ปตร.หนองหว้าใหญ่ | `1239` | เมือง |
| 7. วังหมื่น | `1240` | เมือง |
| 8. ปตร.ปู่หลอด | `1241` | เมือง |
| 9. บ้านข้องโป้ | `1242` | เมือง |
| 10. ปตร.หัวนา | `1243` | เมือง |
| 11. คลองบุญทัน | `1244` | สุวรรณคูหา |
| 12. บ้านโคก | `1245` | สุวรรณคูหา |

> ⚠️ **เปลี่ยน PIN ก่อนใช้งานจริง** — แก้ในชีต Stations คอลัมน์ `pinPlain` แล้วรัน function `rehashAllPins()` ใน Apps Script (หรือรัน setupSheets ใหม่)

---

## 👥 บทบาทผู้ใช้

### 👁️ User ทั่วไป (ดูเท่านั้น)
- ดูสถานะ 12 สถานี
- ดู Real-time weather + พยากรณ์ 7 วัน
- ใช้ GPS หาสถานีใกล้ตัว
- ดูประวัติย้อนหลัง 30 วัน
- ดูเรดาร์ฝน + Heat map + ลุ่มน้ำ
- พิมพ์รายงาน / สแกน QR แชร์

### ✍️ Admin ประจำสถานี (กรอกข้อมูล)
- คลิกปุ่ม **📝 กรอกข้อมูล** (FAB ลอยมุมขวาล่าง / ปุ่มในการ์ด / popup แผนที่)
- กรอก PIN → กรอกระดับน้ำ (ม.รทก.) → ระบบคำนวณธงให้อัตโนมัติ
- (ทางเลือก) แนบรูป + หมายเหตุ
- ติ๊ก "💾 จดจำ PIN" — ครั้งหน้าไม่ต้องกรอกใหม่
- รองรับ **ออฟไลน์** — เน็ตหลุด ข้อมูลถูกเก็บใน queue ส่งอัตโนมัติเมื่อกลับมาออนไลน์

---

## 🎯 ฟีเจอร์ทั้งหมด

### 🌧️ ข้อมูลอากาศ Real-time
- **Open-Meteo API** อัปเดตทุกชั่วโมง (ฟรี ไม่ต้อง API key)
- พยากรณ์ 7 วัน (อุณหภูมิสูง/ต่ำ + ปริมาณฝน)
- ใช้ GPS ดูอากาศตรงตำแหน่งจริง
- Auto-refresh ทุก 5 นาที

### 🛰️ เรดาร์ฝน Real-time
- **RainViewer API** ภาพเรดาร์ฝนย้อนหลัง 2 ชม. + พยากรณ์ 30 นาที 🔮
- Animation loop อัตโนมัติ
- ปุ่มควบคุม ⏮️ ⏸️ ⏭️
- Marker สถานีน้ำซ้อนบนเรดาร์

### 🚩 ระบบธงเตือน
- **🔴 วิกฤติ** ≥ ระดับตลิ่ง
- **🟡 เฝ้าระวัง** ≥ เกณฑ์เฝ้าระวัง
- **🟢 ปกติ** ต่ำกว่าเกณฑ์
- เกณฑ์แต่ละสถานีตั้งใน Sheet (คอลัมน์ red, yellow, green)
- ระบบคำนวณอัตโนมัติเมื่อกรอกข้อมูล

### 📊 Executive Summary (ผู้บริหาร)
- การ์ดบนสุดสรุปสถานการณ์ใน 1 ประโยค
- เปรียบเทียบเมื่อวาน: ▲ แย่ลง / ▼ ดีขึ้น / — เท่า
- แนวโน้ม 7 วัน: ↗ เพิ่มขึ้น / ↘ ลดลง / → คงที่

### 📈 กราฟและการวิเคราะห์
- **กราฟระดับน้ำรายวัน** — เลือกช่วง 7/14/30/60 วัน
- **เส้นพยากรณ์ 7 วัน** (Linear regression) เมื่อเลือกสถานีเดียว
- **Dual-axis chart** ฝน + ระดับน้ำ ดูความสัมพันธ์
- **Gauge ruler แนวตั้ง** — เห็นระดับน้ำเทียบเกณฑ์ทันที
- **กราฟปริมาณฝน 7 วัน** จาก Open-Meteo
- **กราฟสถานะธงแยกตามลำน้ำ** (stacked bar)

### 🌧️ Rainfall Ranking
- Top 10 สถานีฝนตกหนักสุด 24 ชม.
- เหรียญทอง/เงิน/ทองแดง สำหรับ Top 3
- จัดประเภทฝน: เบา / ปานกลาง / หนัก / หนักมาก (ตามเกณฑ์กรมอุตุ)

### 📅 Compliance Report
- แสดงสถานีที่ยังไม่กรอกข้อมูลวันนี้
- Progress bar % สำเร็จ
- คลิกชื่อสถานีที่ยังไม่กรอก → เปิดฟอร์มทันที

### 🗺️ แผนที่อัจฉริยะ
- **CartoDB Light/Dark** tile (เปลี่ยนตาม Dark mode)
- **5 Layer toggle**: สถานี / ลำน้ำ / ลุ่มน้ำ / เขื่อน / Heat ฝน
- **Polyline เชื่อมสถานี** ในลำน้ำเดียวกัน (ตามทิศทางการไหล)
- **Watershed polygon** ลุ่มน้ำพะเนียง (ลุ่มน้ำชี) + ลำน้ำโมง (ลุ่มน้ำโขง)
- **Heat map ฝน** — circle gradient ตามปริมาณ
- **เขื่อนใกล้เคียง** 3 แห่ง (อุบลรัตน์, ลำปาว, ห้วยหลวง)

### 🏞️ Dam Panel
- 3 เขื่อน/อ่างเก็บน้ำใกล้เคียง
- % ความจุ + กราฟแท่ง + สถานะ (ปกติ/ใกล้เต็ม/เต็มความจุ)
- **หมายเหตุ**: ตอนนี้เป็น mock data — สามารถเชื่อมต่อ API ของ EGAT/RID ในภายหลัง

### 📈 Historical Comparison (ค่าเฉลี่ย 30 ปี)
- เปรียบเทียบฝนเดือนนี้ vs ค่าเฉลี่ย 30 ปี (Open-Meteo Archive API)
- แสดง Min/Max ในรอบ 30 ปี
- ตีความอัตโนมัติ (เช่น "+25% — ฝนตกมากกว่าปกติ ติดตามสถานการณ์")

### 💼 ฟีเจอร์ระดับองค์กร
- **📺 TV/Kiosk Mode** — Fullscreen + ฟอนต์ใหญ่ + auto-refresh 1 นาที (สำหรับห้องประชุม)
- **🌙 Dark Mode** — สบายตาตอนกลางคืน
- **🌐 ไทย/EN** — สลับภาษาได้
- **📲 PWA** — Install to Home Screen + ใช้งานออฟไลน์
- **🔗 QR Code + Share** — แชร์ LINE / คัดลอกลิงก์ / ดาวน์โหลด QR
- **🖨️ Print-friendly** — สั่งพิมพ์เป็น A4 ได้สวย
- **📥 Export CSV** — ดาวน์โหลดข้อมูล (UTF-8 BOM, อ่านใน Excel)

### 🔒 Security & Reliability
- **PIN hash SHA-256** — ไม่เก็บ plain text
- **Rate limit** — ผิด PIN >5 ครั้ง/5 นาที = block
- **UPSERT 1 บันทึก/วัน/สถานี** — กรอกซ้ำ = แก้ไข ไม่ append
- **Audit trail** — ทุกการแก้ไขเก็บแยกใน sheet `Audit`
- **LockService** — ป้องกัน race condition
- **Offline queue** — เน็ตหลุดไม่หาย ส่งอัตโนมัติเมื่อกลับมา
- **clientHash** ติด localStorage แต่ละเครื่อง — ใช้ตรวจ rate limit

### 📱 Mobile UX
- **FAB ลอย** มุมขวาล่าง (มือถือ) — กดง่ายด้วยนิ้วโป้ง
- **Modal เต็มจอ** บนมือถือ — ไม่ต้องเลื่อน
- **ปุ่มขนาด ≥48px** ตามมาตรฐาน touch target
- **iOS no-zoom** — input font 16px ป้องกัน zoom
- **Remember PIN** ในเครื่องนั้น
- **Auto-fill PIN** + focus ไปที่ช่องระดับน้ำเลย

### 📷 แนบรูปสถานการณ์
- ในฟอร์มกรอก มีพื้นที่อัปโหลดรูป
- มือถือเปิดกล้องหลังอัตโนมัติ (`capture="environment"`)
- **Auto-compress** เป็น JPEG q=0.7 max 1024px (ลดขนาดได้ 5-10 เท่า)
- เก็บใน Google Drive folder `WaterDashboard_Photos`
- URL ของรูปบันทึกใน column `note` ของ History sheet

### 🔔 ระบบแจ้งเตือน
- **Sound alert** — เมื่อสถานะเปลี่ยนเป็นแดง (3 beep) / เหลือง (2 beep)
- **Toast notification** — แจ้ง success/error ในจอ
- **Visual pulse** — KPI วิกฤติเด้งเตือน + Risk banner เรืองแสง
- **LINE Notify** — ส่งข้อความเข้า LINE เมื่อสถานะเปลี่ยน
- **Status change detection** — เปรียบเทียบหลัง auto-refresh ถ้าเปลี่ยนจะแจ้งทันที

---

## 🔧 การจัดการระบบ

### เพิ่ม/ลด/แก้ไขสถานี
1. แก้ไขโดยตรงในชีต **Stations**
2. รหัส (`id`) ห้ามซ้ำ
3. ใส่ pinPlain ใหม่ → รัน `rehashAllPins()` ใน Apps Script
4. หรือรัน `setupSheets()` ใหม่ทั้งหมด (จะ reset ข้อมูล)

### เพิ่มสถานีใหม่
1. เพิ่มแถวในชีต `Stations` (ใส่ครบทุกคอลัมน์)
2. เพิ่มแถวเปล่าในชีต `Current` ที่มี `id` เดียวกัน
3. รีโหลดหน้าเว็บ

### ปรับเกณฑ์ธงของสถานี
- แก้ในชีต `Stations` คอลัมน์ `red`, `yellow`, `green`
- ระบบจะใช้เกณฑ์ใหม่ทันทีในการคำนวณครั้งถัดไป

### ลบข้อมูลทดสอบทั้งหมด
- ลบเนื้อหาในชีต `Current` (เก็บ header), `History`, `Audit`
- ในชีต Current ใส่แถวว่างให้ครบ 12 id

### ดูประวัติการแก้ไข (Audit)
- เปิดชีต `Audit` — ทุกการกรอก/แก้ไขถูกบันทึกพร้อม timestamp + clientHash

---

## ❓ Troubleshooting

| ปัญหา | สาเหตุ | วิธีแก้ |
|---|---|---|
| หน้าเว็บโหลดช้ามาก | API หลายตัวยิงพร้อมกัน | ปกติ — รอ 5-10 วิรอบแรก รอบหลังเร็วขึ้น (cache) |
| "ใช้ข้อมูลตั้งต้น" | ยังไม่ได้ใส่ `API_URL` | ตรวจสอบขั้นตอน 6 |
| "PIN ไม่ถูกต้อง" | PIN hash ไม่ตรง | ตรวจ PIN ใน Stations คอลัมน์ pinPlain → รัน `rehashAllPins()` |
| GPS ไม่ทำงาน | ต้องเปิด HTTPS | GitHub Pages ใช้ HTTPS อัตโนมัติ + อนุญาต location ในเบราว์เซอร์ |
| LINE ไม่ส่ง | Token ไม่ได้ตั้ง | ตรวจ Script Properties → key=`LINE_TOKEN` |
| Photo upload ไม่ขึ้น Drive | ยังไม่อนุญาต Drive permission | รัน `uploadPhoto()` ใน Apps Script ด้วยตนเอง 1 ครั้งเพื่อ trigger authorize |
| เรดาร์ไม่โหลด | RainViewer API ล่ม | ปกติ retry ทุก 10 นาที |
| Heat map ไม่เห็น | ยังไม่กดปุ่ม "🌧️ Heat ฝน" | กดปุ่มใน toolbar มุมขวาบนแผนที่ |
| Auto-refresh ไม่ทำงาน | Tab อยู่ใน background | บางเบราว์เซอร์หยุด timer — กลับมาที่ tab จะ refresh ทันที |
| ค่าเฉลี่ย 30 ปี ไม่ขึ้น | Open-Meteo Archive ตอบช้า | รอ 5-10 วิ + ตรวจ Network tab |
| TV mode ไม่ fullscreen | บางเบราว์เซอร์บล็อก | กด F11 เพิ่มเติม |
| Dark mode สีเพี้ยน | Hard cache | Ctrl+Shift+R refresh |

---

## 🛠️ การพัฒนาต่อ

### Tech Stack
- **Frontend**: HTML + CSS + JS (vanilla, no build tool)
- **Map**: Leaflet.js 1.9.4 + CartoDB tiles
- **Charts**: Chart.js 4.4
- **Weather**: Open-Meteo API + Open-Meteo Archive API (ฟรี)
- **Radar**: RainViewer API (ฟรี)
- **QR**: qrcode.js 1.5
- **Backend**: Google Apps Script + Google Sheets
- **Notify**: LINE Notify API

### Endpoints ของ Code.gs
| Action | Method | Description |
|---|---|---|
| `getAll` | GET | สถานี + ค่าล่าสุด (cached 60s) |
| `whoami` | GET | ตรวจสอบ user + role |
| `getHistory` | GET | ประวัติของสถานีหนึ่ง |
| `getAllHistory` | GET | ประวัติทุกสถานี |
| `getOnDate` | GET | สถานะของทุกสถานีในวันที่ระบุ 🆕 |
| `getDams` | GET | ข้อมูลเขื่อนจาก Sheet 🆕 |
| `aiInsight` | GET | AI สรุปสถานการณ์ 🆕 |
| `submit` | GET | บันทึกระดับน้ำ (UPSERT, throttled) |
| `compliance` | GET | สถานีที่ยังไม่กรอกวันนี้ |
| `forecast` | GET | พยากรณ์ระดับน้ำ |
| `exportCSV` | GET | ส่งออก CSV |
| `uploadPhoto` | POST | อัปโหลดรูป (base64) |

### Phase 5 — ฟีเจอร์ที่ยังไม่ได้ทำ
- 👥 Multi-province — รองรับหลายจังหวัด (ต้อง refactor schema)
- 🏷️ Auto-tagging incidents (เกิดเหตุ/แก้ไข/ปิดเหตุ)
- 📡 IoT sensor integration (ESP32 + ultrasonic + 4G)
- 🗺️ GeoJSON พื้นที่เสี่ยงจริงจาก ปภ./กรมโยธาฯ
- 🔊 Voice command (Web Speech API)
- 🎥 Live camera feed บางสถานี
- 📑 PDF report auto-generation

---

## 📊 โครงสร้าง Sheet

### Sheet: Stations
| คอลัมน์ | คำอธิบาย |
|---|---|
| id | รหัสสถานี (1-12) |
| river | `paneang` หรือ `mong` |
| riverName | ชื่อลำน้ำ (ภาษาไทย) |
| name | ชื่อสถานี |
| village, moo, tambon, amphoe | ที่ตั้ง |
| lat, lng | พิกัด GPS |
| elev | ความสูง (ม.รทก.) |
| red, yellow, green | เกณฑ์ธง |
| pinHash | PIN ที่ hash แล้ว (อย่าแก้ตรงๆ) |
| pinPlain | PIN ดิบ (ลบทิ้งหลัง setup) |

### Sheet: Current
| คอลัมน์ | คำอธิบาย |
|---|---|
| id | รหัสสถานี |
| currentLevel | ระดับล่าสุด (ม.รทก.) |
| status | red/yellow/green |
| updatedAt | timestamp |
| updatedBy | ใครกรอก |
| note | หมายเหตุ + URL รูป |

### Sheet: History (1 บันทึก/วัน/สถานี)
| คอลัมน์ | คำอธิบาย |
|---|---|
| date | YYYY-MM-DD |
| stationId, stationName | สถานี |
| level, status | ค่า + ธง |
| updatedAt | เวลาที่บันทึกล่าสุดของวัน |
| recordedBy | สถานี-id |
| note | หมายเหตุ + URL รูป |

### Sheet: Audit (ทุกการแก้ไข — ไม่หาย)
| คอลัมน์ | คำอธิบาย |
|---|---|
| timestamp | ทุกครั้งที่กรอก |
| date, stationId, stationName | สถานี |
| action | `create` / `update` |
| level, status | ค่าที่กรอก |
| recordedBy | สถานี-id |
| note | หมายเหตุ |
| clientHash | ระบุเครื่องที่กรอก (ไม่ใช่ user) |

### Sheet: RateLimit (ซ่อน — ใช้ภายใน)
ระบบเก็บ failed attempts เพื่อ throttle PIN attacks

### Sheet: Users (Role-based access)
| คอลัมน์ | คำอธิบาย |
|---|---|
| email | Google email |
| name | ชื่อแสดงผล |
| role | `admin` / `district_admin` / `station_officer` / `viewer` |
| allowedStations | `all` หรือ `1,2,3` (id ของสถานี คั่นด้วย ,) |
| active | `TRUE` / `FALSE` |
| note | หมายเหตุภายใน |

### Sheet: Rules (Custom alert rules) 🆕
| คอลัมน์ | คำอธิบาย |
|---|---|
| id | รหัสกฎ |
| name | ชื่อกฎ |
| condition | `rise_per_day` / `red_count` / `yellow_count` / `rain_3days` / `level_above_yellow_days` |
| threshold | ค่าเกณฑ์ |
| duration_days | จำนวนวันที่ต้องครบเงื่อนไข |
| channel | `line` / `telegram` / `both` |
| active | `TRUE` / `FALSE` |
| lastFired | วันที่ยิงแจ้งเตือนล่าสุด |
| note | หมายเหตุ |

### Sheet: Dams (เขื่อน) 🆕
| คอลัมน์ | คำอธิบาย |
|---|---|
| id | รหัสเขื่อน |
| name | ชื่อเขื่อน |
| province | จังหวัด |
| lat, lng | พิกัด |
| capacity_mcm | ความจุ (ล้าน ลบ.ม.) |
| current_mcm | ปริมาณปัจจุบัน |
| source | `manual` / `egat` / `rid` |
| updatedAt | timestamp อัปเดตล่าสุด |
| note | หมายเหตุ |

---

## 📝 Credits

- **Open-Meteo** — Weather + Archive API (ฟรี ไม่ต้อง key)
- **RainViewer** — Radar tiles (ฟรี)
- **CartoDB** — Map tiles (ฟรี)
- **Leaflet.js** — Map library (BSD-2)
- **Chart.js** — Chart library (MIT)
- **Sarabun font** — Google Fonts (OFL)
- **สำนักงานสถิติจังหวัดหนองบัวลำภู** — ข้อมูลสถานี

---

💧 **ระบบติดตามสถานการณ์น้ำ จังหวัดหนองบัวลำภู** v4.0 (Phase 4: AI + Telegram + Rule Engine + Geofence + Compare-date + EGAT/RID + Looker)
