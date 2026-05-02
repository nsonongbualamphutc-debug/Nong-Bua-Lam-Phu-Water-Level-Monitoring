/**
 * ============================================================
 *  ระบบแดชบอร์ดสถานการณ์น้ำจังหวัดหนองบัวลำภู
 *  Google Apps Script Backend
 *  สำนักงานสถิติจังหวัดหนองบัวลำภู
 * ============================================================
 *
 *  วิธีใช้:
 *  1. เปิดไฟล์ WaterData_Template.xlsx ใน Google Sheets
 *  2. Extensions > Apps Script
 *  3. วางโค้ดนี้ทั้งหมด แล้วบันทึก
 *  4. Deploy > New deployment > Web app
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. คัดลอก Web app URL ไปใส่ในไฟล์ HTML ทุกไฟล์
 *     ที่ตัวแปร const API_URL = "...";
 *
 * ============================================================
 */

// ===== CONFIG =====
const SHEET_STATIONS  = "Stations";
const SHEET_WATER     = "WaterLevel";
const SHEET_RAIN      = "Rainfall";
const SHEET_RESERVOIR = "Reservoir";
const SHEET_SETTINGS  = "Settings";

// ===== ENTRY POINTS =====

/**
 * รองรับ GET (อ่านข้อมูล) และ JSONP
 */
function doGet(e) {
  const action   = (e.parameter.action   || "summary").toLowerCase();
  const callback = e.parameter.callback;  // สำหรับ JSONP

  let data;
  try {
    switch (action) {
      case "summary":   data = getSummary(); break;
      case "stations":  data = getStations(e.parameter.river); break;
      case "water":     data = getWaterLevels(e.parameter.station_id, parseInt(e.parameter.days || "7")); break;
      case "rain":      data = getRainfall(parseInt(e.parameter.days || "7")); break;
      case "reservoir": data = getReservoirs(); break;
      case "history":   data = getHistory(parseInt(e.parameter.limit || "20")); break;
      case "dailyreport": data = getDailyReport(e.parameter.date); break;
      case "ping":      data = { ok: true, time: new Date().toISOString() }; break;
      default:          data = { error: "unknown action: " + action };
    }
  } catch (err) {
    data = { error: err.toString() };
  }

  return respond(data, callback);
}

/**
 * รองรับ POST (บันทึกข้อมูล)
 * รับ JSON ใน e.postData.contents หรือ form parameter
 */
function doPost(e) {
  let payload = {};
  try {
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    }
  } catch (err) {
    return respond({ ok: false, error: "Invalid JSON: " + err.toString() });
  }

  const action = (payload.action || "").toLowerCase();
  let result;
  try {
    switch (action) {
      case "savewater":     result = saveWaterLevel(payload); break;
      case "saverain":      result = saveRainfall(payload); break;
      case "savereservoir": result = saveReservoir(payload); break;
      case "savedailyreport": result = saveDailyReport(payload); break;
      default:              result = { ok: false, error: "unknown action: " + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }
  return respond(result);
}

// ===== READ FUNCTIONS =====

function getStations(river) {
  const sheet = ss().getSheetByName(SHEET_STATIONS);
  const rows = sheetToObjects(sheet);
  if (river) {
    return rows.filter(r => String(r.river || "").indexOf(river) !== -1);
  }
  return rows;
}

function getSummary() {
  const stations = getStations();
  const latest = getLatestWaterByStation();

  let normal = 0, warn = 0, crit = 0;
  const merged = stations.map(st => {
    const w = latest[st.station_id] || {};
    const level = parseFloat(w.level);
    let status = "ปกติ";
    if (!isNaN(level) && st.bank_level) {
      if (level >= parseFloat(st.bank_level)) status = "วิกฤติ";
      else if (level >= parseFloat(st.warn_level)) status = "เฝ้าระวัง";
    }
    if (status === "วิกฤติ") crit++;
    else if (status === "เฝ้าระวัง") warn++;
    else normal++;

    return Object.assign({}, st, {
      current_level: isNaN(level) ? null : level,
      flow: w.flow || null,
      status: status,
      last_update: w.date ? (w.date + " " + (w.time || "")) : null
    });
  });

  // คำนวณฝนเฉลี่ย
  const rain = getRainfall(1);
  let avgRain = 0;
  if (rain.length > 0) {
    const sum = rain.reduce((a, r) => a + (parseFloat(r.rain_24hr) || 0), 0);
    avgRain = sum / rain.length;
  }

  return {
    total: stations.length,
    normal: normal,
    warn: warn,
    crit: crit,
    avg_rain_24hr: avgRain,
    stations: merged,
    updated: new Date().toISOString()
  };
}

function getWaterLevels(stationId, days) {
  const sheet = ss().getSheetByName(SHEET_WATER);
  const rows = sheetToObjects(sheet);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 7));

  return rows
    .filter(r => {
      if (stationId && r.station_id !== stationId) return false;
      const d = parseDate(r.date);
      return d && d >= cutoff;
    })
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function getLatestWaterByStation() {
  const rows = sheetToObjects(ss().getSheetByName(SHEET_WATER));
  const latest = {};
  rows.forEach(r => {
    const sid = r.station_id;
    if (!sid) return;
    const d = parseDate(r.date);
    if (!latest[sid] || parseDate(latest[sid].date) < d) {
      latest[sid] = r;
    }
  });
  return latest;
}

function getRainfall(days) {
  const sheet = ss().getSheetByName(SHEET_RAIN);
  const rows = sheetToObjects(sheet);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 7));
  return rows
    .filter(r => {
      const d = parseDate(r.date);
      return d && d >= cutoff;
    })
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

function getReservoirs() {
  return sheetToObjects(ss().getSheetByName(SHEET_RESERVOIR));
}

function getHistory(limit) {
  const water = sheetToObjects(ss().getSheetByName(SHEET_WATER))
    .map(r => Object.assign({ type: "water" }, r));
  const rain = sheetToObjects(ss().getSheetByName(SHEET_RAIN))
    .map(r => Object.assign({ type: "rain" }, r));
  const all = water.concat(rain)
    .sort((a, b) => {
      const da = parseDate(a.date) || new Date(0);
      const db = parseDate(b.date) || new Date(0);
      return db - da;
    });
  return all.slice(0, limit || 20);
}

// ===== WRITE FUNCTIONS =====

function saveWaterLevel(p) {
  const sheet = ss().getSheetByName(SHEET_WATER);
  const headers = getHeaders(sheet);
  const row = headers.map(h => p[h] || "");
  sheet.appendRow(row);

  // อัปเดต current sheet ถ้ามี (เผื่อใช้ดึงข้อมูลล่าสุดเร็วๆ)
  return { ok: true, message: "บันทึกข้อมูลระดับน้ำเรียบร้อย", station_id: p.station_id };
}

function saveRainfall(p) {
  const sheet = ss().getSheetByName(SHEET_RAIN);
  const headers = getHeaders(sheet);
  const row = headers.map(h => p[h] || "");
  sheet.appendRow(row);
  return { ok: true, message: "บันทึกข้อมูลฝนเรียบร้อย" };
}

function getDailyReport(targetDate) {
  // ดึงรายงานวันที่เจาะจง — ถ้าไม่ระบุให้คืนรายการล่าสุด
  const sheet = ss().getSheetByName("DailyReport");
  if (!sheet) return null;
  const rows = sheetToObjects(sheet);
  if (!rows.length) return null;
  if (targetDate) {
    return rows.find(r => String(r.date).slice(0, 10) === targetDate) || null;
  }
  // sort desc by date, return latest
  rows.sort((a, b) => parseDate(b.date) - parseDate(a.date));
  return rows[0];
}

function saveDailyReport(p) {
  // รายงานรวม 4 หมวด: เขื่อน, สถานีอุตุฯ, AQI, สาธารณภัย
  // ใช้ sheet ชื่อ "DailyReport" - ถ้าไม่มีให้สร้าง
  const ss_obj = ss();
  let sheet = ss_obj.getSheetByName("DailyReport");
  if (!sheet) {
    sheet = ss_obj.insertSheet("DailyReport");
    sheet.appendRow([
      "date", "reporter",
      "dam_level", "dam_use", "dam_pct", "dam_in", "dam_out", "dam_total",
      "tmd_temp", "tmd_cloud", "tmd_rain_yest", "tmd_pressure",
      "tmd_humidity", "tmd_wind", "tmd_temp_min", "tmd_visibility", "tmd_rain_year",
      "aqi_pm25", "aqi_value", "aqi_days_over",
      "disaster_status", "disaster_amphoe", "disaster_note",
      "saved_at"
    ]);
  }
  const headers = getHeaders(sheet);
  const row = headers.map(h => h === "saved_at" ? new Date() : (p[h] || ""));

  // ถ้ามีรายงานของวันเดียวกันแล้ว -> อัปเดตทับ (UPSERT)
  const data = sheet.getDataRange().getValues();
  const dateIdx = headers.indexOf("date");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][dateIdx]).slice(0, 10) === p.date) {
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
      return { ok: true, message: "อัปเดตรายงานวันที่ " + p.date };
    }
  }
  sheet.appendRow(row);
  return { ok: true, message: "บันทึกรายงานวันที่ " + p.date };
}

function saveReservoir(p) {
  const sheet = ss().getSheetByName(SHEET_RESERVOIR);
  // อัปเดตแถวที่ตรงกับ reservoir_id ถ้ามี ไม่งั้น append
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf("reservoir_id");
  const curIdx = headers.indexOf("current_volume");

  if (idIdx >= 0) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === p.reservoir_id) {
        if (curIdx >= 0 && p.current_volume !== undefined) {
          sheet.getRange(i + 1, curIdx + 1).setValue(p.current_volume);
        }
        return { ok: true, message: "อัปเดตข้อมูลอ่างเก็บน้ำเรียบร้อย" };
      }
    }
  }
  // ไม่พบ → append
  const row = headers.map(h => p[h] || "");
  sheet.appendRow(row);
  return { ok: true, message: "เพิ่มข้อมูลอ่างเก็บน้ำเรียบร้อย" };
}

// ===== HELPERS =====

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let v = row[i];
      // แปลงวันที่เป็น string รูปแบบ YYYY-MM-DD
      if (v instanceof Date) {
        v = Utilities.formatDate(v, "Asia/Bangkok", "yyyy-MM-dd");
      }
      obj[h] = v;
    });
    return obj;
  }).filter(o => Object.values(o).some(v => v !== "" && v !== null && v !== undefined));
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function respond(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    // JSONP — เลี่ยงปัญหา CORS
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== TEST FUNCTION =====
// รันใน Apps Script Editor เพื่อทดสอบว่าอ่านข้อมูลได้
function testGetSummary() {
  const result = getSummary();
  Logger.log(JSON.stringify(result, null, 2));
}
