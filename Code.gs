/**
 * ═══════════════════════════════════════════════════════════════
 * ระบบเฝ้าระวังสถานการณ์น้ำ จ.หนองบัวลำภู
 * Google Apps Script Backend — Code.gs
 * ═══════════════════════════════════════════════════════════════
 * 
 * วิธีติดตั้ง:
 * 1. สร้าง Google Sheet ใหม่
 * 2. Extensions → Apps Script
 * 3. วางโค้ดนี้ทั้งหมดแทนที่โค้ดเดิม
 * 4. รัน initSheets() ครั้งแรก (จะสร้าง Sheet อัตโนมัติ)
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. คัดลอก URL ไปวางในแดชบอร์ด (ตั้งค่า)
 * ═══════════════════════════════════════════════════════════════
 */

// ─── สถานีวัดระดับน้ำ ───
const STATION_CONFIG = [
  {id:1,name:"วังปลาป้อม",amphoe:"นาวัง",river:"ลำน้ำพะเนียง",red:290,yellow:289.5,greenMax:289},
  {id:2,name:"โคกกระทอ",amphoe:"นาวัง",river:"ลำน้ำพะเนียง",red:266,yellow:265.5,greenMax:265},
  {id:3,name:"วังสามหาบ",amphoe:"นาวัง",river:"ลำน้ำพะเนียง",red:258,yellow:257.5,greenMax:257},
  {id:4,name:"บ้านหนองด่าน",amphoe:"นากลาง",river:"ลำน้ำพะเนียง",red:249,yellow:248.5,greenMax:248},
  {id:5,name:"บ้านฝั่งแดง",amphoe:"นากลาง",river:"ลำน้ำพะเนียง",red:237,yellow:236.5,greenMax:236},
  {id:6,name:"ปตร.หนองหว้าใหญ่",amphoe:"เมืองฯ",river:"ลำน้ำพะเนียง",red:216,yellow:215.5,greenMax:215},
  {id:7,name:"วังหมื่น",amphoe:"เมืองฯ",river:"ลำน้ำพะเนียง",red:210,yellow:209.5,greenMax:209},
  {id:8,name:"ปตร.ปู่หลอด",amphoe:"เมืองฯ",river:"ลำน้ำพะเนียง",red:203,yellow:202.5,greenMax:202.5},
  {id:9,name:"บ้านข้องโป้",amphoe:"เมืองฯ",river:"ลำน้ำพะเนียง",red:201,yellow:200.5,greenMax:200},
  {id:10,name:"ปตร.หัวนา",amphoe:"เมืองฯ",river:"ลำน้ำพะเนียง",red:191,yellow:190.5,greenMax:190},
  {id:11,name:"คลองบุญทัน",amphoe:"สุวรรณคูหา",river:"ลำน้ำโมง",red:231,yellow:230.5,greenMax:230},
  {id:12,name:"บ้านโคก",amphoe:"สุวรรณคูหา",river:"ลำน้ำโมง",red:218,yellow:217.5,greenMax:217}
];

/**
 * สร้าง Sheet เริ่มต้น — รัน 1 ครั้ง
 */
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ─── Sheet: CurrentLevels ───
  let current = ss.getSheetByName('CurrentLevels');
  if (!current) {
    current = ss.insertSheet('CurrentLevels');
    current.appendRow(['stationId','stationName','amphoe','river','level','status','lastUpdate','weather','rain','note']);
    STATION_CONFIG.forEach(s => {
      current.appendRow([s.id, s.name, s.amphoe, s.river, '', '', '', '', '', '']);
    });
    // จัดรูปแบบ header
    current.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    current.setFrozenRows(1);
    current.autoResizeColumns(1, 10);
  }
  
  // ─── Sheet: ReportHistory ───
  let history = ss.getSheetByName('ReportHistory');
  if (!history) {
    history = ss.insertSheet('ReportHistory');
    history.appendRow(['timestamp','date','time','stationId','stationName','level','status','weather','rain','note','reporter']);
    history.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    history.setFrozenRows(1);
    history.autoResizeColumns(1, 11);
  }
  
  // ─── Sheet: StationConfig ───
  let config = ss.getSheetByName('StationConfig');
  if (!config) {
    config = ss.insertSheet('StationConfig');
    config.appendRow(['stationId','stationName','amphoe','river','red','yellow','greenMax']);
    STATION_CONFIG.forEach(s => {
      config.appendRow([s.id, s.name, s.amphoe, s.river, s.red, s.yellow, s.greenMax]);
    });
    config.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    config.setFrozenRows(1);
    config.autoResizeColumns(1, 7);
  }
  
  SpreadsheetApp.getUi().alert('✅ สร้าง Sheet เรียบร้อย!\n\nCurrentLevels — ระดับน้ำปัจจุบัน\nReportHistory — ประวัติรายงาน\nStationConfig — ตั้งค่าสถานี');
}

/**
 * Web App Handler — GET
 */
function doGet(e) {
  const action = e.parameter.action || 'getLevels';
  const callback = e.parameter.callback || 'callback';
  let result;
  
  try {
    switch (action) {
      case 'getLevels':
        result = getLevels();
        break;
      case 'addReport':
        result = addReport(e.parameter);
        break;
      case 'getHistory':
        result = getHistory(e.parameter.limit || 20);
        break;
      case 'getConfig':
        result = getConfig();
        break;
      default:
        result = {error: 'Unknown action: ' + action};
    }
  } catch (err) {
    result = {error: err.toString()};
  }
  
  // JSONP response
  const output = callback + '(' + JSON.stringify(result) + ')';
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * POST handler (alternative)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    let result;
    
    if (data.action === 'addReport') {
      result = addReport(data);
    } else if (data.action === 'batchUpdate') {
      result = batchUpdateLevels(data.levels);
    } else {
      result = {error: 'Unknown action'};
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ดึงระดับน้ำปัจจุบัน
 */
function getLevels() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CurrentLevels');
  if (!sheet) return {error: 'Sheet CurrentLevels not found. Run initSheets() first.'};
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const levels = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = data[i][j]; });
    if (row.stationId && row.level !== '') {
      levels.push({
        stationId: row.stationId,
        name: row.stationName,
        level: row.level,
        status: row.status,
        lastUpdate: row.lastUpdate ? row.lastUpdate.toString() : '',
        weather: row.weather || '',
        rain: row.rain || ''
      });
    }
  }
  
  return {
    success: true,
    levels: levels,
    timestamp: new Date().toISOString()
  };
}

/**
 * บันทึกรายงานระดับน้ำ
 */
function addReport(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationId = parseInt(params.stationId || params.station_id);
  const level = parseFloat(params.level);
  
  if (!stationId || isNaN(level)) {
    return {error: 'stationId and level are required'};
  }
  
  const stationName = params.station || params.stationName || '';
  const status = params.status || getStatusText(stationId, level);
  const date = params.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const time = params.time || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HH:mm');
  const weather = params.weather || '';
  const rain = params.rain || '';
  const note = params.note || '';
  const now = new Date();
  
  // 1. อัพเดท CurrentLevels
  const current = ss.getSheetByName('CurrentLevels');
  if (current) {
    const data = current.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == stationId) {
        current.getRange(i + 1, 5).setValue(level);       // level
        current.getRange(i + 1, 6).setValue(status);       // status
        current.getRange(i + 1, 7).setValue(now);          // lastUpdate
        current.getRange(i + 1, 8).setValue(weather);      // weather
        current.getRange(i + 1, 9).setValue(rain);         // rain
        current.getRange(i + 1, 10).setValue(note);        // note
        
        // Conditional formatting — สีพื้นหลังตามสถานะ
        const statusColors = {'ธงเขียว': '#d4edda', 'ธงเหลือง': '#fff3cd', 'ธงแดง': '#f8d7da'};
        const bgColor = statusColors[status] || '#fff';
        current.getRange(i + 1, 5, 1, 2).setBackground(bgColor);
        break;
      }
    }
  }
  
  // 2. เพิ่มใน ReportHistory
  const history = ss.getSheetByName('ReportHistory');
  if (history) {
    history.insertRowAfter(1);
    history.getRange(2, 1, 1, 11).setValues([[
      now, date, time, stationId, stationName, level, status, weather, rain, note, Session.getActiveUser().getEmail() || 'web'
    ]]);
  }
  
  return {
    success: true,
    message: 'Report saved',
    stationId: stationId,
    level: level,
    status: status,
    timestamp: now.toISOString()
  };
}

/**
 * คำนวณสถานะจากระดับน้ำ
 */
function getStatusText(stationId, level) {
  const station = STATION_CONFIG.find(s => s.id == stationId);
  if (!station) return 'ไม่ทราบ';
  if (level >= station.red) return 'ธงแดง';
  if (level >= station.yellow) return 'ธงเหลือง';
  return 'ธงเขียว';
}

/**
 * ดึงประวัติรายงาน
 */
function getHistory(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ReportHistory');
  if (!sheet) return {error: 'Sheet ReportHistory not found'};
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const reports = [];
  const maxRows = Math.min(data.length, parseInt(limit) + 1);
  
  for (let i = 1; i < maxRows; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = data[i][j]; });
    row.timestamp = row.timestamp ? row.timestamp.toString() : '';
    reports.push(row);
  }
  
  return {success: true, reports: reports};
}

/**
 * ดึงตั้งค่าสถานี
 */
function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('StationConfig');
  if (!sheet) return {error: 'Sheet StationConfig not found'};
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const config = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = data[i][j]; });
    config.push(row);
  }
  
  return {success: true, config: config};
}

/**
 * Batch update ระดับน้ำหลายสถานี
 */
function batchUpdateLevels(levels) {
  if (!levels || !Array.isArray(levels)) return {error: 'levels array required'};
  
  let updated = 0;
  levels.forEach(item => {
    try {
      addReport({
        stationId: item.stationId,
        level: item.level,
        station: item.name || '',
        weather: item.weather || '',
        rain: item.rain || ''
      });
      updated++;
    } catch (e) {}
  });
  
  return {success: true, updated: updated};
}

/**
 * สร้าง Trigger สำหรับแจ้งเตือนอัตโนมัติ
 * รันทุก 15 นาที ถ้ามีสถานีวิกฤติจะส่ง LINE Notify
 */
function setupAlertTrigger() {
  // ลบ trigger เดิม
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAlerts') ScriptApp.deleteTrigger(t);
  });
  
  // สร้าง trigger ใหม่ ทุก 15 นาที
  ScriptApp.newTrigger('checkAlerts')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  SpreadsheetApp.getUi().alert('✅ ตั้งค่าแจ้งเตือนอัตโนมัติทุก 15 นาที');
}

/**
 * ตรวจสอบสถานะและแจ้งเตือน
 */
function checkAlerts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CurrentLevels');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const criticals = [];
  const warnings = [];
  
  for (let i = 1; i < data.length; i++) {
    const stationId = data[i][0];
    const name = data[i][1];
    const level = data[i][4];
    const status = data[i][5];
    
    if (status === 'ธงแดง') criticals.push({name, level});
    else if (status === 'ธงเหลือง') warnings.push({name, level});
  }
  
  if (criticals.length > 0) {
    const message = `🔴 แจ้งเตือนวิกฤติ จ.หนองบัวลำภู\n` +
      `สถานีวิกฤติ ${criticals.length} แห่ง:\n` +
      criticals.map(c => `• ${c.name}: ${c.level} ม.รทก.`).join('\n') +
      (warnings.length ? `\n\n🟡 เฝ้าระวัง ${warnings.length} แห่ง` : '');
    
    // ส่ง LINE Notify (ใส่ Token ใน Script Properties)
    const lineToken = PropertiesService.getScriptProperties().getProperty('LINE_NOTIFY_TOKEN');
    if (lineToken) sendLineNotify(lineToken, message);
    
    // ส่ง Email แจ้งเตือน (ใส่ Email ใน Script Properties)
    const alertEmail = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
    if (alertEmail) {
      MailApp.sendEmail({
        to: alertEmail,
        subject: `⚠️ แจ้งเตือนวิกฤติน้ำ จ.หนองบัวลำภู — ${criticals.length} สถานี`,
        body: message
      });
    }
  }
}

/**
 * ส่ง LINE Notify
 */
function sendLineNotify(token, message) {
  const url = 'https://notify-api.line.me/api/notify';
  const options = {
    method: 'post',
    headers: {'Authorization': 'Bearer ' + token},
    payload: {'message': message}
  };
  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.error('LINE Notify error:', e);
  }
}

/**
 * สร้าง Menu
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌊 ระบบน้ำ')
    .addItem('🔧 สร้าง Sheet เริ่มต้น', 'initSheets')
    .addItem('🔔 ตั้งค่าแจ้งเตือนอัตโนมัติ', 'setupAlertTrigger')
    .addItem('📊 ดูสถานะปัจจุบัน', 'showCurrentStatus')
    .addToUi();
}

/**
 * แสดงสถานะปัจจุบัน (Dialog)
 */
function showCurrentStatus() {
  const result = getLevels();
  if (result.error) {
    SpreadsheetApp.getUi().alert('❌ ' + result.error);
    return;
  }
  
  let msg = '📊 สถานะระดับน้ำ จ.หนองบัวลำภู\n\n';
  result.levels.forEach(l => {
    const emoji = l.status === 'ธงแดง' ? '🔴' : l.status === 'ธงเหลือง' ? '🟡' : '🟢';
    msg += `${emoji} ${l.name}: ${l.level} ม.รทก. (${l.status})\n`;
  });
  
  SpreadsheetApp.getUi().alert(msg);
}
