/**
 * ระบบติดตามสถานการณ์น้ำ จังหวัดหนองบัวลำภู
 * Google Apps Script Backend v2
 *
 * ฟีเจอร์:
 *  - PIN hash (SHA-256)
 *  - Rate limit (5 ครั้ง/5 นาที)
 *  - 1 บันทึก/วัน/สถานี (UPSERT) + audit trail
 *  - LINE Notify เตือนเมื่อเปลี่ยนสถานะ
 *  - Compliance report (สถานีไหนยังไม่กรอกวันนี้)
 *  - Export CSV
 *  - Trend forecast (linear regression)
 *
 * การติดตั้ง:
 *  1. สร้าง Google Sheet → Extensions → Apps Script
 *  2. วาง code นี้
 *  3. (ทางเลือก) ใส่ LINE Notify token ที่ Project Settings → Script Properties → key="LINE_TOKEN"
 *  4. รัน setupSheets() ครั้งแรก
 *  5. Deploy → Web app → Execute as: Me · Who has access: Anyone
 */

const SHEET_STATIONS = 'Stations';
const SHEET_CURRENT  = 'Current';
const SHEET_HISTORY  = 'History';
const SHEET_AUDIT    = 'Audit';
const SHEET_RATELIMIT= 'RateLimit';
const SHEET_USERS    = 'Users';
const SHEET_RULES    = 'Rules';
const SHEET_DAMS     = 'Dams';

const TZ = 'Asia/Bangkok';
const CACHE_TTL_SEC = 60;
const SUBMIT_THROTTLE_SEC = 30;

/* ============================================================
 * SETUP
 * ============================================================ */
function setupSheets(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let st = ss.getSheetByName(SHEET_STATIONS);
  if (!st) st = ss.insertSheet(SHEET_STATIONS);
  st.clear();
  const stHeader = ['id','river','riverName','name','village','moo','tambon','amphoe','lat','lng','elev','red','yellow','green','pinHash','pinPlain'];
  st.getRange(1,1,1,stHeader.length).setValues([stHeader]).setFontWeight('bold').setBackground('#0ea5e9').setFontColor('#fff');
  const stData = [
    [1, 'paneang','ลำน้ำพะเนียง','วังปลาป้อม','บ้านโคกเจริญ',2,'วังปลาป้อม','นาวัง',17.42065,101.99304,290,290,289.5,289,'','1234'],
    [2, 'paneang','ลำน้ำพะเนียง','โคกกระทอ','บ้านโคกกระทอ',3,'นาเหล่า','นาวัง',17.34314,102.07167,266,266,265.5,265,'','1235'],
    [3, 'paneang','ลำน้ำพะเนียง','วังสามหาบ','บ้านวังสามหาบ',8,'เทพคีรี','นาวัง',17.3099,102.10789,258,258,257.5,257,'','1236'],
    [4, 'paneang','ลำน้ำพะเนียง','บ้านหนองด่าน','บ้านหนองด่าน',14,'ด่านช้าง','นากลาง',17.27936,102.16552,249,249,248.5,248,'','1237'],
    [5, 'paneang','ลำน้ำพะเนียง','บ้านฝั่งแดง','บ้านฝั่งแดง',14,'ฝั่งแดง','นากลาง',17.2673,102.22728,237,237,236.5,236,'','1238'],
    [6, 'paneang','ลำน้ำพะเนียง','ประตูระบายน้ำหนองหว้าใหญ่','บ้านหนองหว้าใหญ่',1,'หนองหว้า','เมืองหนองบัวลำภู',17.17981,102.38617,216,216,215.5,215,'','1239'],
    [7, 'paneang','ลำน้ำพะเนียง','วังหมื่น','บ้านวังหมื่น',4,'หนองบัว','เมืองหนองบัวลำภู',17.18317,102.43244,210,210,209.5,209,'','1240'],
    [8, 'paneang','ลำน้ำพะเนียง','ประตูระบายน้ำปู่หลอด','บ้านโนนคูณ',3,'บ้านขาม','เมืองหนองบัวลำภู',17.11487,102.45435,203,203,202.5,202.5,'','1241'],
    [9, 'paneang','ลำน้ำพะเนียง','บ้านข้องโป้','บ้านข้องโป้',7,'บ้านขาม','เมืองหนองบัวลำภู',17.08217,102.45068,201,201,200.5,200,'','1242'],
    [10,'paneang','ลำน้ำพะเนียง','ประตูระบายน้ำหัวนา','บ้านดอนหัน',10,'หัวนา','เมืองหนองบัวลำภู',17.00067,102.424,191,191,190.5,190,'','1243'],
    [11,'mong','ลำน้ำโมง','คลองบุญทัน','บ้านบุญทัน',1,'บุญทัน','สุวรรณคูหา',17.54512,102.16832,231,231,230.5,230,'','1244'],
    [12,'mong','ลำน้ำโมง','บ้านโคก','บ้านโคก',1,'บ้านโคก','สุวรรณคูหา',17.54952,102.20425,218,218,217.5,217,'','1245'],
  ];
  stData.forEach(r=>{ r[14] = sha256(String(r[15])); });
  st.getRange(2,1,stData.length,stHeader.length).setValues(stData);
  st.setFrozenRows(1);
  st.autoResizeColumns(1,stHeader.length);
  st.getRange('P:P').setBackground('#fee2e2');
  st.getRange('P1').setNote('คอลัมน์ pinPlain เป็น PIN ดิบ — แนะนำให้ลบเนื้อหาทิ้งหลังจดบันทึกแล้ว เพื่อความปลอดภัย ระบบใช้แค่ pinHash');

  let cur = ss.getSheetByName(SHEET_CURRENT);
  if (!cur) cur = ss.insertSheet(SHEET_CURRENT);
  cur.clear();
  const curHeader = ['id','currentLevel','status','updatedAt','updatedBy','note'];
  cur.getRange(1,1,1,curHeader.length).setValues([curHeader]).setFontWeight('bold').setBackground('#0ea5e9').setFontColor('#fff');
  const curRows = stData.map(r => [r[0], '', '', '', '', '']);
  cur.getRange(2,1,curRows.length,curHeader.length).setValues(curRows);
  cur.setFrozenRows(1);

  let h = ss.getSheetByName(SHEET_HISTORY);
  if (!h) h = ss.insertSheet(SHEET_HISTORY);
  h.clear();
  const hHeader = ['date','stationId','stationName','level','status','updatedAt','recordedBy','note'];
  h.getRange(1,1,1,hHeader.length).setValues([hHeader]).setFontWeight('bold').setBackground('#0ea5e9').setFontColor('#fff');
  h.setFrozenRows(1);

  let a = ss.getSheetByName(SHEET_AUDIT);
  if (!a) a = ss.insertSheet(SHEET_AUDIT);
  a.clear();
  const aHeader = ['timestamp','date','stationId','stationName','action','level','status','recordedBy','note','clientHash'];
  a.getRange(1,1,1,aHeader.length).setValues([aHeader]).setFontWeight('bold').setBackground('#64748b').setFontColor('#fff');
  a.setFrozenRows(1);

  let rl = ss.getSheetByName(SHEET_RATELIMIT);
  if (!rl) rl = ss.insertSheet(SHEET_RATELIMIT);
  rl.clear();
  const rlHeader = ['clientHash','timestamp','stationId','outcome'];
  rl.getRange(1,1,1,rlHeader.length).setValues([rlHeader]).setFontWeight('bold').setBackground('#64748b').setFontColor('#fff');
  rl.setFrozenRows(1);
  rl.hideSheet();

  // --- Users sheet (role-based access) ---
  let us = ss.getSheetByName(SHEET_USERS);
  if (!us) us = ss.insertSheet(SHEET_USERS);
  us.clear();
  const usHeader = ['email','name','role','allowedStations','active','note'];
  us.getRange(1,1,1,usHeader.length).setValues([usHeader]).setFontWeight('bold').setBackground('#6366f1').setFontColor('#fff');
  // ตัวอย่างข้อมูล (admin = ทุกสถานี, district_admin = บางสถานี, station_officer = สถานีเดียว)
  const ownerEmail = Session.getActiveUser().getEmail() || 'admin@example.com';
  const usSample = [
    [ownerEmail, 'ผู้ดูแลระบบ', 'admin', 'all', true, 'เจ้าของระบบ — สิทธิ์เต็ม'],
    ['district_naklang@example.com', 'หัวหน้าอำเภอนากลาง', 'district_admin', '4,5', false, 'ตัวอย่าง — แก้ email + active=true'],
    ['officer_st1@example.com', 'จนท.สถานี 1', 'station_officer', '1', false, 'ตัวอย่าง — แก้ email + active=true'],
  ];
  us.getRange(2,1,usSample.length,usHeader.length).setValues(usSample);
  us.setFrozenRows(1);
  us.autoResizeColumns(1,usHeader.length);
  us.getRange('C1').setNote('Roles: admin = ทุกสถานี, district_admin = หลายสถานี (ใส่ id คั่นด้วย ,), station_officer = สถานีเดียว, viewer = ดูอย่างเดียว');
  us.getRange('D1').setNote('all = ทุกสถานี, หรือใส่ id เช่น "1,2,3"');

  // --- Rules sheet (custom alert rules) ---
  let ru = ss.getSheetByName(SHEET_RULES);
  if (!ru) ru = ss.insertSheet(SHEET_RULES);
  ru.clear();
  const ruHeader = ['id','name','condition','threshold','duration_days','channel','target','active','lastFired','note'];
  ru.getRange(1,1,1,ruHeader.length).setValues([ruHeader]).setFontWeight('bold').setBackground('#dc2626').setFontColor('#fff');
  const ruSample = [
    [1, 'น้ำขึ้นเร็ว 0.5 ม. ใน 1 วัน', 'rise_per_day', 0.5, 1, 'line', '', true, '', 'แจ้งเตือนเมื่อระดับน้ำเพิ่มขึ้นเร็ว'],
    [2, 'แดง 2 สถานีติดต่อกัน 2 วัน', 'red_count', 2, 2, 'line', '', false, '', 'ตัวอย่าง — เปิดใช้งานหากต้องการ'],
    [3, 'ฝนสะสม 3 วัน > 100 มม.', 'rain_3days', 100, 3, 'telegram', '', false, '', 'ตัวอย่าง — ใช้ Open-Meteo'],
  ];
  ru.getRange(2,1,ruSample.length,ruHeader.length).setValues(ruSample);
  ru.setFrozenRows(1);
  ru.getRange('C1').setNote('Conditions: rise_per_day, red_count, yellow_count, rain_3days, level_above_yellow_days');
  ru.getRange('F1').setNote('Channel: line, telegram, both');

  // --- Dams sheet (เขื่อน — ผู้ใช้แก้เอง หรือ sync จาก API ภายนอก) ---
  let da = ss.getSheetByName(SHEET_DAMS);
  if (!da) da = ss.insertSheet(SHEET_DAMS);
  da.clear();
  const daHeader = ['id','name','province','lat','lng','capacity_mcm','current_mcm','source','updatedAt','note'];
  da.getRange(1,1,1,daHeader.length).setValues([daHeader]).setFontWeight('bold').setBackground('#0891b2').setFontColor('#fff');
  const daSample = [
    ['ubol_ratana','เขื่อนอุบลรัตน์','ขอนแก่น',16.7717,102.6244,2431,1850,'manual','','EGAT — แก้ค่า current ตามรายงานจริง'],
    ['lam_pao','เขื่อนลำปาว','กาฬสินธุ์',16.6700,103.2330,1980,1245,'manual','','RID'],
    ['huai_luang','อ่างฯ ห้วยหลวง','อุดรธานี',17.6300,102.5800,135,90,'manual','','RID'],
  ];
  da.getRange(2,1,daSample.length,daHeader.length).setValues(daSample);
  da.setFrozenRows(1);
  da.getRange('H1').setNote('Source: manual / egat / rid (ระบบจะ sync ตาม source อัตโนมัติถ้าตั้ง trigger)');

  // --- Rules sheet (Custom alert rules) ---
  let rs = ss.getSheetByName(SHEET_RULES);
  if (!rs) rs = ss.insertSheet(SHEET_RULES);
  rs.clear();
  const rsHeader = ['id','name','condition','action','channel','active','lastFired','note'];
  rs.getRange(1,1,1,rsHeader.length).setValues([rsHeader]).setFontWeight('bold').setBackground('#a855f7').setFontColor('#fff');
  const rsSample = [
    [1, 'เตือนเมื่อมีสถานีวิกฤติ', 'red>=1', 'notify', 'line', true, '', 'แจ้งเมื่อมีสถานีใดเป็นธงแดง'],
    [2, 'เตือนเมื่อฝนตกหนัก', 'rain24h>=50', 'notify', 'line,telegram', false, '', 'ตัวอย่าง — เปิดเมื่อต้องการ'],
    [3, 'เตือนเมื่อเฝ้าระวัง 3 สถานี', 'yellow>=3', 'notify', 'line', false, '', 'ตัวอย่าง'],
    [4, 'รายงาน 7:00 + 17:00', 'time=07:00,17:00', 'report', 'line', false, '', 'รายงาน 2 ครั้ง/วัน'],
  ];
  rs.getRange(2,1,rsSample.length,rsHeader.length).setValues(rsSample);
  rs.setFrozenRows(1);
  rs.autoResizeColumns(1,rsHeader.length);
  rs.getRange('C1').setNote(
    'Conditions:\n' +
    '• red>=N : สถานีวิกฤติมากกว่าเท่ากับ N\n' +
    '• yellow>=N : สถานีเฝ้าระวังมากกว่าเท่ากับ N\n' +
    '• rain24h>=N : ฝนสะสม 24 ชม. มากกว่าเท่ากับ N มม.\n' +
    '• rainForecast3d>=N : ฝนพยากรณ์ 3 วัน >= N มม.\n' +
    '• missing>=N : สถานีที่ยังไม่กรอกวันนี้ >= N\n' +
    '• status=red,station=4 : เงื่อนไขซับซ้อน (และ)\n' +
    '• time=HH:MM : รายงานเวลาที่กำหนด'
  );
  rs.getRange('D1').setNote('Actions: notify (แจ้งเตือน), report (สรุปรายงาน)');
  rs.getRange('E1').setNote('Channels: line, telegram, line+telegram');

  SpreadsheetApp.getUi().alert(
    '✅ Setup เรียบร้อย\n\n' +
    'สร้าง 8 ชีต: Stations, Current, History, Audit, RateLimit, Users, Rules, Dams\n\n' +
    '⚠️ สำคัญ:\n' +
    '1. PIN ดิบอยู่ในคอลัมน์ "pinPlain" — จดบันทึกแล้วลบเนื้อหาคอลัมน์นี้ทิ้ง\n' +
    '2. Tokens ใน Script Properties (Project Settings):\n' +
    '   - LINE_TOKEN: แจ้งเตือนทั่วไป\n' +
    '   - LINE_TOKEN_DAILY: รายงานเช้าทุกวัน (ทางเลือก)\n' +
    '   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID: Telegram bot\n' +
    '   - ANTHROPIC_API_KEY: AI Insight สรุปสถานการณ์\n' +
    '3. รัน installDailyReportTrigger() เพื่อตั้งเวลารายงาน\n' +
    '4. รัน installRuleEngineTrigger() เพื่อรัน custom rules ทุก 30 นาที\n' +
    '5. Deploy เป็น Web app แล้วใส่ URL ใน HTML'
  );
}

/* ============================================================
 * UTILS
 * ============================================================ */
function sha256(text){
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function getStationsMap(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_STATIONS);
  const rows = sh.getDataRange().getValues();
  const head = rows.shift();
  const idx = {};
  head.forEach((h,i)=> idx[h]=i);
  const map = {};
  rows.forEach((r,i)=>{
    if (!r[idx.id]) return;
    const o = {row: i+2};
    head.forEach((h,k)=> o[h] = r[k]);
    map[String(o.id)] = o;
  });
  return {map, idx, sh};
}

function todayDateStr(){
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowDate(){ return new Date(); }

/* ============================================================
 * CACHE HELPERS — ลด quota Apps Script
 * ============================================================ */
function cacheGet(key){
  try {
    const c = CacheService.getScriptCache();
    const v = c.get(key);
    return v ? JSON.parse(v) : null;
  } catch(e){ return null; }
}
function cachePut(key, value, ttl){
  try {
    const c = CacheService.getScriptCache();
    const json = JSON.stringify(value);
    if (json.length < 95000) c.put(key, json, ttl || CACHE_TTL_SEC);
  } catch(e){}
}
function cacheBust(){
  try {
    const c = CacheService.getScriptCache();
    c.removeAll(['getAll','compliance','allHistory_30','allHistory_60','allHistory_14','allHistory_7']);
  } catch(e){}
}

/* ============================================================
 * USER / ROLE — Google Sign-in + permissions
 *   Roles: admin (ทุกสถานี), district_admin (หลายสถานี),
 *          station_officer (สถานีเดียว), viewer (ดูอย่างเดียว)
 * ============================================================ */
function getCurrentUser(){
  let email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch(e){}
  if (!email) return {ok:false, email:'', role:'guest', allowedStations:[]};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) return {ok:false, email, role:'guest', allowedStations:[]};
  const rows = sh.getDataRange().getValues();
  const head = rows.shift();
  const idx = {}; head.forEach((h,i)=> idx[h]=i);
  const rec = rows.find(r => String(r[idx.email]||'').toLowerCase() === email.toLowerCase());
  if (!rec) return {ok:false, email, role:'guest', allowedStations:[], name:''};
  if (!rec[idx.active]) return {ok:false, email, role:'inactive', allowedStations:[], name: rec[idx.name]||''};

  const allowedRaw = String(rec[idx.allowedStations] || '').trim();
  const allowedStations = allowedRaw.toLowerCase() === 'all' ? 'all'
    : allowedRaw.split(',').map(s=>s.trim()).filter(Boolean);
  return {
    ok:true, email,
    name: rec[idx.name] || '',
    role: rec[idx.role] || 'viewer',
    allowedStations
  };
}

function canEditStation(user, stationId){
  if (!user || !user.ok) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'viewer') return false;
  if (user.allowedStations === 'all') return true;
  return user.allowedStations.includes(String(stationId));
}

/* ============================================================
 * doGet / doPost
 * ============================================================ */
function doGet(e){
  const action = (e && e.parameter && e.parameter.action) || 'getAll';
  const cb = (e && e.parameter && e.parameter.callback) || '';

  let result;
  try{
    if (action === 'getAll'){
      result = getAllData();
    } else if (action === 'whoami'){
      result = {ok:true, user: getCurrentUser()};
    } else if (action === 'getHistory'){
      result = {ok:true, history: getHistory(e.parameter.id, parseInt(e.parameter.days||'30',10))};
    } else if (action === 'getAllHistory'){
      result = {ok:true, history: getHistory(null, parseInt(e.parameter.days||'30',10))};
    } else if (action === 'submit'){
      result = submitLevel({
        id: e.parameter.id,
        pin: e.parameter.pin,
        level: parseFloat(e.parameter.level),
        note: e.parameter.note || '',
        clientHash: e.parameter.clientHash || ''
      });
    } else if (action === 'compliance'){
      result = {ok:true, compliance: getCompliance()};
    } else if (action === 'forecast'){
      result = {ok:true, forecast: getForecast(e.parameter.id, parseInt(e.parameter.days||'7',10), parseInt(e.parameter.lookback||'14',10))};
    } else if (action === 'exportCSV'){
      result = {ok:true, csv: exportHistoryCSV(parseInt(e.parameter.days||'30',10), e.parameter.river || 'all')};
    } else if (action === 'exportPivot'){
      result = {ok:true, csv: exportPivotCSV(parseInt(e.parameter.days||'30',10))};
    } else if (action === 'statusOnDate'){
      result = getStatusOnDate(e.parameter.date || todayDateStr());
    } else if (action === 'aiInsight'){
      result = generateAIInsight();
    } else if (action === 'uploadPhoto'){
      result = uploadPhoto({
        id: e.parameter.id,
        pin: e.parameter.pin,
        date: e.parameter.date,
        photo: e.parameter.photo
      });
    } else if (action === 'getOnDate'){
      // ดึงสถานะของทุกสถานี ณ วันที่ระบุ
      result = {ok:true, date: e.parameter.date, stations: getStationsOnDate(e.parameter.date)};
    } else if (action === 'getDams'){
      result = {ok:true, dams: getDamsData()};
    } else if (action === 'aiInsight'){
      result = generateAIInsight(e.parameter.lang || 'th');
    } else {
      result = {ok:false, error:'unknown action'};
    }
  }catch(err){
    result = {ok:false, error: String(err)};
  }

  const body = JSON.stringify(result);
  if (cb){
    return ContentService.createTextOutput(cb + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  // form data จะอยู่ใน e.parameter เหมือน GET
  return doGet(e);
}

/* ============================================================
 * GET ALL
 * ============================================================ */
function getAllData(){
  // try cache first
  const cached = cacheGet('getAll');
  if (cached){
    cached._fromCache = true;
    return cached;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stSh = ss.getSheetByName(SHEET_STATIONS);
  const curSh = ss.getSheetByName(SHEET_CURRENT);

  const stRows = stSh.getDataRange().getValues();
  const stHead = stRows.shift();
  const stations = stRows.filter(r=>r[0]).map(r=>{
    const o = {};
    stHead.forEach((h,i)=> o[h] = r[i]);
    delete o.pinHash;
    delete o.pinPlain;
    return o;
  });

  const curRows = curSh.getDataRange().getValues();
  const curHead = curRows.shift();
  const curMap = {};
  curRows.forEach(r=>{
    const o = {};
    curHead.forEach((h,i)=> o[h] = r[i]);
    if (o.id) curMap[String(o.id)] = o;
  });

  const merged = stations.map(s=>{
    const c = curMap[String(s.id)] || {};
    return Object.assign({}, s, {
      currentLevel: (c.currentLevel === '' || c.currentLevel == null) ? null : Number(c.currentLevel),
      status: c.status || '',
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : '',
      updatedBy: c.updatedBy || '',
      note: c.note || ''
    });
  });

  const result = {ok:true, stations: merged, serverTime: new Date().toISOString()};
  cachePut('getAll', result, CACHE_TTL_SEC);
  return result;
}

/* ============================================================
 * RATE LIMIT
 * ============================================================ */
function checkRateLimit(clientHash){
  if (!clientHash) clientHash = 'unknown';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_RATELIMIT);
  if (!sh) return {ok:true};
  const data = sh.getDataRange().getValues();
  const head = data.shift();
  const now = new Date().getTime();
  const FIVE_MIN = 5 * 60 * 1000;
  const THIRTY_MIN = 30 * 60 * 1000;

  let fails = 0;
  const keep = [];
  data.forEach(r=>{
    if (!r[0] || !r[1]) return;
    const t = new Date(r[1]).getTime();
    if (now - t < THIRTY_MIN) keep.push(r);
    if (r[0] === clientHash && r[3] === 'fail' && (now - t) < FIVE_MIN) fails++;
  });

  if (keep.length !== data.length){
    sh.clear();
    sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight('bold').setBackground('#64748b').setFontColor('#fff');
    if (keep.length > 0){
      sh.getRange(2,1,keep.length,head.length).setValues(keep);
    }
  }

  if (fails >= 5){
    return {ok:false, error:'พยายามกรอกผิดมากเกินไป กรุณารอ 5 นาทีแล้วลองใหม่'};
  }
  return {ok:true};
}

function recordRateLimit(clientHash, stationId, outcome){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_RATELIMIT);
  if (!sh) return;
  sh.appendRow([clientHash || 'unknown', new Date(), stationId, outcome]);
}

/* ============================================================
 * SUBMIT — UPSERT
 * ============================================================ */
function submitLevel(payload){
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const id = String(payload.id);
    const pin = String(payload.pin || '');
    const level = payload.level;
    const note = payload.note || '';
    const clientHash = payload.clientHash || '';

    if (!id || isNaN(level)) return {ok:false, error:'ข้อมูลไม่ครบ'};

    const rl = checkRateLimit(clientHash);
    if (!rl.ok) return rl;

    // Submit throttle: 1 บันทึก/สถานี/30 วินาที
    const throttleKey = 'submit_' + id;
    const lastSubmit = cacheGet(throttleKey);
    if (lastSubmit){
      const sinceSec = (Date.now() - Number(lastSubmit)) / 1000;
      if (sinceSec < SUBMIT_THROTTLE_SEC){
        const wait = Math.ceil(SUBMIT_THROTTLE_SEC - sinceSec);
        return {ok:false, error: 'กรอกข้อมูลถี่เกินไป กรุณารอ ' + wait + ' วินาที'};
      }
    }

    const {map} = getStationsMap();
    const station = map[id];
    if (!station) {
      recordRateLimit(clientHash, id, 'fail');
      return {ok:false, error:'ไม่พบสถานี'};
    }

    // Auth: ถ้าผู้ใช้ login Google และมีสิทธิ์จาก Users sheet → ข้าม PIN
    let signedInUser = null;
    let usedAuth = 'pin';
    try {
      const u = getCurrentUser();
      if (u && u.ok && canEditStation(u, id)){
        signedInUser = u;
        usedAuth = 'google';
      }
    } catch(e){}

    if (usedAuth === 'pin'){
      const pinHash = sha256(pin);
      if (String(station.pinHash) !== pinHash){
        recordRateLimit(clientHash, id, 'fail');
        return {ok:false, error:'PIN ไม่ถูกต้อง'};
      }
    }

    if (level < 0 || level > 1000){
      return {ok:false, error:'ระดับน้ำต้องอยู่ระหว่าง 0 - 1000 ม.รทก.'};
    }

    const red = Number(station.red);
    const yel = Number(station.yellow);
    let status = 'green';
    if (level >= red) status = 'red';
    else if (level >= yel) status = 'yellow';

    const now = nowDate();
    const dateStr = todayDateStr();
    const updatedBy = signedInUser
      ? `${signedInUser.email}${signedInUser.name?' ('+signedInUser.name+')':''}`
      : 'PIN-สถานี-' + id;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const curSh = ss.getSheetByName(SHEET_CURRENT);
    const curData = curSh.getDataRange().getValues();
    const curHead = curData[0];
    let prevStatus = '', prevLevel = null, curRow = -1;
    for (let i=1;i<curData.length;i++){
      if (String(curData[i][curHead.indexOf('id')]) === id){
        prevStatus = curData[i][curHead.indexOf('status')] || '';
        const pv = curData[i][curHead.indexOf('currentLevel')];
        prevLevel = (pv === '' || pv == null) ? null : Number(pv);
        curRow = i+1;
        break;
      }
    }

    if (curRow > 0){
      curSh.getRange(curRow, curHead.indexOf('currentLevel')+1).setValue(level);
      curSh.getRange(curRow, curHead.indexOf('status')+1).setValue(status);
      curSh.getRange(curRow, curHead.indexOf('updatedAt')+1).setValue(now);
      curSh.getRange(curRow, curHead.indexOf('updatedBy')+1).setValue(updatedBy);
      curSh.getRange(curRow, curHead.indexOf('note')+1).setValue(note);
    } else {
      curSh.appendRow([id, level, status, now, updatedBy, note]);
    }

    const hSh = ss.getSheetByName(SHEET_HISTORY);
    const hData = hSh.getDataRange().getValues();
    const hHead = hData[0];
    let hRow = -1;
    for (let i=1;i<hData.length;i++){
      const rowDate = hData[i][hHead.indexOf('date')];
      const rowDateStr = rowDate instanceof Date ? Utilities.formatDate(rowDate, TZ, 'yyyy-MM-dd') : String(rowDate);
      if (String(hData[i][hHead.indexOf('stationId')]) === id && rowDateStr === dateStr){
        hRow = i+1; break;
      }
    }
    const action = (hRow > 0) ? 'update' : 'create';
    if (hRow > 0){
      hSh.getRange(hRow, hHead.indexOf('level')+1).setValue(level);
      hSh.getRange(hRow, hHead.indexOf('status')+1).setValue(status);
      hSh.getRange(hRow, hHead.indexOf('updatedAt')+1).setValue(now);
      hSh.getRange(hRow, hHead.indexOf('recordedBy')+1).setValue(updatedBy);
      hSh.getRange(hRow, hHead.indexOf('note')+1).setValue(note);
    } else {
      hSh.appendRow([dateStr, id, station.name, level, status, now, updatedBy, note]);
    }

    const aSh = ss.getSheetByName(SHEET_AUDIT);
    if (aSh){
      aSh.appendRow([now, dateStr, id, station.name, action, level, status, updatedBy, note, clientHash]);
    }

    recordRateLimit(clientHash, id, 'success');

    // Submit throttle record
    cachePut('submit_' + id, Date.now(), SUBMIT_THROTTLE_SEC);
    // Bust cache สำหรับ getAll/compliance/history
    cacheBust();

    if (status !== prevStatus){
      try{ notifyStatusChange(station, prevStatus, status, level, prevLevel); }catch(e){}
    }

    return {
      ok:true, id, level, status,
      previousStatus: prevStatus,
      statusChanged: status !== prevStatus,
      action,
      authMethod: usedAuth,
      savedAt: now.toISOString()
    };
  } finally {
    try{ lock.releaseLock(); }catch(e){}
  }
}

/* ============================================================
 * GET HISTORY
 * ============================================================ */
function getHistory(stationId, days){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hSh = ss.getSheetByName(SHEET_HISTORY);
  const rows = hSh.getDataRange().getValues();
  const head = rows.shift();
  const idx = {};
  head.forEach((h,i)=> idx[h]=i);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return rows
    .filter(r => r[idx.date])
    .filter(r => {
      const d = r[idx.date] instanceof Date ? r[idx.date] : new Date(r[idx.date]);
      return d >= cutoff;
    })
    .filter(r => !stationId || String(r[idx.stationId]) === String(stationId))
    .map(r => ({
      timestamp: r[idx.updatedAt] ? new Date(r[idx.updatedAt]).toISOString() :
                  (r[idx.date] instanceof Date ? r[idx.date].toISOString() : new Date(r[idx.date]).toISOString()),
      date: r[idx.date] instanceof Date ? Utilities.formatDate(r[idx.date], TZ, 'yyyy-MM-dd') : String(r[idx.date]),
      stationId: r[idx.stationId],
      stationName: r[idx.stationName],
      level: Number(r[idx.level]),
      status: r[idx.status],
      recordedBy: r[idx.recordedBy],
      note: r[idx.note] || ''
    }))
    .sort((a,b) => a.date.localeCompare(b.date));
}

/* ============================================================
 * COMPLIANCE
 * ============================================================ */
function getCompliance(){
  const today = todayDateStr();
  const {map} = getStationsMap();
  const stations = Object.values(map);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hSh = ss.getSheetByName(SHEET_HISTORY);
  const rows = hSh.getDataRange().getValues();
  const head = rows.shift();
  const idx = {};
  head.forEach((h,i)=> idx[h]=i);

  const reportedToday = new Set();
  rows.forEach(r => {
    const d = r[idx.date] instanceof Date ? Utilities.formatDate(r[idx.date], TZ, 'yyyy-MM-dd') : String(r[idx.date]);
    if (d === today) reportedToday.add(String(r[idx.stationId]));
  });

  const missing = stations.filter(s => !reportedToday.has(String(s.id)))
    .map(s => ({id:s.id, name:s.name, river:s.river, riverName:s.riverName, amphoe:s.amphoe, lat:s.lat, lng:s.lng}));
  const reported = stations.filter(s => reportedToday.has(String(s.id)))
    .map(s => ({id:s.id, name:s.name, river:s.river, riverName:s.riverName, amphoe:s.amphoe}));

  return {
    today,
    totalStations: stations.length,
    reportedCount: reported.length,
    missingCount: missing.length,
    completionRate: stations.length ? Math.round(reported.length / stations.length * 1000) / 10 : 0,
    missing, reported
  };
}

/* ============================================================
 * FORECAST — Linear regression
 * ============================================================ */
function getForecast(stationId, daysAhead, lookback){
  daysAhead = daysAhead || 7;
  lookback = lookback || 14;
  if (!stationId) return {ok:false, error:'ต้องระบุ stationId'};

  const hist = getHistory(stationId, lookback);
  if (hist.length < 3) return {ok:false, error:'ข้อมูลย้อนหลังไม่เพียงพอ (ต้องมีอย่างน้อย 3 วัน)'};

  const startMs = new Date(hist[0].date).getTime();
  const points = hist.map(h => ({
    x: (new Date(h.date).getTime() - startMs) / 86400000,
    y: h.level
  }));

  const n = points.length;
  const sumX = points.reduce((a,p)=>a+p.x,0);
  const sumY = points.reduce((a,p)=>a+p.y,0);
  const sumXY = points.reduce((a,p)=>a+p.x*p.y,0);
  const sumXX = points.reduce((a,p)=>a+p.x*p.x,0);
  const denom = (n*sumXX - sumX*sumX) || 1;
  const slope = (n*sumXY - sumX*sumY) / denom;
  const intercept = (sumY - slope*sumX) / n;

  const lastX = points[points.length-1].x;
  const today = new Date(); today.setHours(0,0,0,0);

  const forecast = [];
  for (let i = 1; i <= daysAhead; i++){
    const futureDate = new Date(today.getTime() + i*86400000);
    const futureX = lastX + i;
    const predicted = slope * futureX + intercept;
    forecast.push({
      date: Utilities.formatDate(futureDate, TZ, 'yyyy-MM-dd'),
      predictedLevel: Math.round(predicted * 100) / 100,
      daysAhead: i
    });
  }
  return {
    ok:true, slope, intercept,
    history: hist, forecast,
    trend: slope > 0.05 ? 'rising' : slope < -0.05 ? 'falling' : 'stable'
  };
}

/* ============================================================
 * EXPORT CSV
 * ============================================================ */
function exportHistoryCSV(days, river){
  const hist = getHistory(null, days);
  let filtered = hist;
  if (river && river !== 'all'){
    const {map} = getStationsMap();
    const allowed = new Set(Object.values(map).filter(s=>s.river===river).map(s=>String(s.id)));
    filtered = hist.filter(h => allowed.has(String(h.stationId)));
  }
  const headers = ['วันที่','รหัสสถานี','ชื่อสถานี','ระดับน้ำ(ม.รทก.)','สถานะ','บันทึกโดย','หมายเหตุ'];
  const lines = [headers.join(',')];
  filtered.forEach(h=>{
    const row = [h.date, h.stationId, csvEscape(h.stationName), h.level, h.status, csvEscape(h.recordedBy), csvEscape(h.note)];
    lines.push(row.join(','));
  });
  return '\uFEFF' + lines.join('\n');
}
function csvEscape(s){
  if (s == null) return '';
  s = String(s);
  if (s.includes(',') || s.includes('"') || s.includes('\n')){
    return '"' + s.replace(/"/g,'""') + '"';
  }
  return s;
}

/* ============================================================
 * LINE NOTIFY
 * ============================================================ */
function notifyStatusChange(station, prevStatus, newStatus, level, prevLevel){
  const token = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
  const tgToken = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token && !tgToken) return;

  const flagIcon = newStatus === 'red' ? '🚨🔴' : newStatus === 'yellow' ? '⚠️🟡' : '✅🟢';
  const statusName = newStatus === 'red' ? 'วิกฤติ' : newStatus === 'yellow' ? 'เฝ้าระวัง' : 'ปกติ';
  const prevName = prevStatus === 'red' ? 'วิกฤติ' : prevStatus === 'yellow' ? 'เฝ้าระวัง' : prevStatus === 'green' ? 'ปกติ' : 'ไม่ระบุ';

  let msg = '\n' + flagIcon + ' แจ้งเตือนสถานการณ์น้ำ\n';
  msg += 'สถานี: ' + station.name + '\n';
  msg += station.riverName + ' · อ.' + station.amphoe + '\n';
  msg += 'ระดับน้ำ: ' + level + ' ม.รทก. (เกณฑ์ ' + station.red + ')\n';
  if (prevLevel != null) msg += 'เปลี่ยนจาก ' + prevLevel + ' → ' + level + ' ม.\n';
  msg += 'สถานะ: ' + prevName + ' → ' + statusName + '\n';
  msg += 'เวลา: ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');

  if (token){
    try{
      UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
        method: 'post',
        headers: {Authorization: 'Bearer ' + token},
        payload: {message: msg},
        muteHttpExceptions: true
      });
    }catch(e){}
  }
  if (tgToken){
    try{ sendTelegram(msg.replace(/^\n/, '')); }catch(e){}
  }
}

/* ============================================================
 * UPLOAD PHOTO — รับ base64 PNG/JPEG เก็บใน Google Drive
 *   เก็บใน folder "WaterDashboard_Photos" สร้างอัตโนมัติถ้ายังไม่มี
 *   เขียน URL กลับไปในชีต History (คอลัมน์ note ต่อท้าย หรือคอลัมน์ photoUrl)
 * ============================================================ */
function uploadPhoto(payload){
  const id = String(payload.id || '');
  const pin = String(payload.pin || '');
  const date = String(payload.date || todayDateStr());
  const photo = String(payload.photo || '');

  if (!id || !photo) return {ok:false, error:'ข้อมูลไม่ครบ'};

  // verify PIN
  const {map} = getStationsMap();
  const station = map[id];
  if (!station) return {ok:false, error:'ไม่พบสถานี'};
  if (sha256(pin) !== String(station.pinHash)) return {ok:false, error:'PIN ไม่ถูกต้อง'};

  try {
    // strip data URL header
    const m = photo.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return {ok:false, error:'รูปแบบรูปไม่ถูกต้อง'};
    const mime = m[1];
    const ext = mime.split('/')[1] || 'jpg';
    const data = m[2];
    const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, `${id}_${date}.${ext}`);

    // get/create folder
    const folderName = 'WaterDashboard_Photos';
    let folder;
    const it = DriveApp.getFoldersByName(folderName);
    if (it.hasNext()) folder = it.next();
    else folder = DriveApp.createFolder(folderName);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = file.getUrl();

    // append to History row of this station+date
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hSh = ss.getSheetByName(SHEET_HISTORY);
    const hData = hSh.getDataRange().getValues();
    const hHead = hData[0];
    const dateIdx = hHead.indexOf('date');
    const idIdx = hHead.indexOf('stationId');
    const noteIdx = hHead.indexOf('note');
    for (let i=1;i<hData.length;i++){
      const rowDate = hData[i][dateIdx] instanceof Date
        ? Utilities.formatDate(hData[i][dateIdx], TZ, 'yyyy-MM-dd')
        : String(hData[i][dateIdx]);
      if (String(hData[i][idIdx]) === id && rowDate === date){
        const existingNote = hData[i][noteIdx] || '';
        const newNote = existingNote ? existingNote + ' | ' + url : url;
        hSh.getRange(i+1, noteIdx+1).setValue(newNote);
        break;
      }
    }

    return {ok:true, url};
  } catch(err) {
    return {ok:false, error: String(err)};
  }
}
function testCompliance(){ Logger.log(JSON.stringify(getCompliance(), null, 2)); }
function testForecast(){ Logger.log(JSON.stringify(getForecast('1', 7, 14), null, 2)); }
function testExport(){ Logger.log(exportHistoryCSV(30, 'all').substring(0,500)); }

/* ============================================================
 * DAILY REPORT — ส่งสรุปสถานการณ์น้ำเข้า LINE ทุกเช้า
 *   ตั้ง trigger รัน 6:30 น. ทุกวัน → installDailyReportTrigger()
 *   ใช้ Script Property "LINE_TOKEN_DAILY" หรือใช้ "LINE_TOKEN" ถ้าไม่มี
 * ============================================================ */
function buildDailyReport(){
  const today = todayDateStr();
  const data = getAllData();
  const stations = data.stations || [];
  const total = stations.length;
  const red = stations.filter(s=>s.status==='red').length;
  const yel = stations.filter(s=>s.status==='yellow').length;
  const grn = stations.filter(s=>s.status==='green').length;
  const noData = stations.filter(s=>!s.status).length;

  // เปรียบเทียบเมื่อวาน
  const yesterday = Utilities.formatDate(new Date(Date.now()-86400000), TZ, 'yyyy-MM-dd');
  const hist = getHistory(null, 2);
  const yC = {red:0,yellow:0,green:0,total:0};
  hist.filter(h=>h.date===yesterday).forEach(h=>{
    yC.total++;
    if (h.status==='red') yC.red++;
    else if (h.status==='yellow') yC.yellow++;
    else if (h.status==='green') yC.green++;
  });
  const todayAlert = red + yel;
  const yAlert = yC.red + yC.yellow;
  const delta = todayAlert - yAlert;
  const compareTxt = yC.total === 0 ? '(ไม่มีข้อมูลเมื่อวาน)' :
    delta === 0 ? 'เท่าเมื่อวาน' :
    delta > 0 ? `แย่ลงจากเมื่อวาน +${delta}` : `ดีขึ้นจากเมื่อวาน ${delta}`;

  // ดึงฝน 24 ชม. + พยากรณ์ 3 วัน (Open-Meteo)
  let rainPast = 0, rainFuture = 0;
  try {
    const wRes = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=17.2046&longitude=102.4260&daily=precipitation_sum&past_days=1&forecast_days=3&timezone=Asia%2FBangkok', {muteHttpExceptions:true});
    if (wRes.getResponseCode() === 200){
      const w = JSON.parse(wRes.getContentText());
      const sums = w.daily?.precipitation_sum || [];
      // index 0 = เมื่อวาน, 1 = วันนี้, 2-3 = พรุ่งนี้และมะรืน
      rainPast = Math.round((sums[0]||0)*10)/10;
      rainFuture = Math.round(((sums[1]||0)+(sums[2]||0)+(sums[3]||0))*10)/10;
    }
  } catch(e){}

  // สถานีที่ต้องเฝ้าระวัง
  const watchList = stations.filter(s=>s.status==='red' || s.status==='yellow')
    .map(s=>{
      const flag = s.status==='red'?'🔴':'🟡';
      return `${flag} ${s.name} (${s.currentLevel||'?'} ม.รทก.)`;
    }).slice(0, 5);

  // สถานีที่ยังไม่กรอกวันนี้
  const c = getCompliance();
  const missingTxt = c.missingCount > 0
    ? `\n⚠️ ยังไม่กรอกข้อมูลวันนี้: ${c.missingCount}/${total} สถานี`
    : `\n✅ กรอกข้อมูลครบทุกสถานีแล้ว`;

  // ข้อความ
  const dStr = Utilities.formatDate(new Date(), TZ, 'd MMM yyyy');
  let msg = `\n📊 สรุปสถานการณ์น้ำ จ.หนองบัวลำภู\n📅 ${dStr}\n\n`;
  msg += `🟢 ปกติ: ${grn} | 🟡 เฝ้าระวัง: ${yel} | 🔴 วิกฤติ: ${red}\n`;
  if (noData > 0) msg += `⚪ ยังไม่มีข้อมูล: ${noData}\n`;
  msg += `📈 เปรียบเทียบ: ${compareTxt}\n\n`;
  msg += `🌧️ ฝน 24 ชม. ที่ผ่านมา: ${rainPast} มม.\n`;
  msg += `🔮 พยากรณ์ฝน 3 วันถัดไป: ${rainFuture} มม.\n`;
  if (watchList.length){
    msg += `\n🚨 ต้องติดตาม:\n${watchList.join('\n')}\n`;
  }
  msg += missingTxt;

  return msg;
}

function sendDailyReport(){
  const token = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN_DAILY')
             || PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
  if (!token){
    Logger.log('No LINE_TOKEN_DAILY or LINE_TOKEN set');
    return {ok:false, error:'no token'};
  }
  const msg = buildDailyReport();
  try {
    const res = UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
      method:'post',
      headers:{Authorization:'Bearer ' + token},
      payload:{message: msg},
      muteHttpExceptions:true
    });
    Logger.log('Daily report sent: ' + res.getResponseCode());
    return {ok:true, code:res.getResponseCode(), preview:msg.substring(0,200)};
  } catch(e){
    Logger.log('Daily report failed: ' + e);
    return {ok:false, error:String(e)};
  }
}

function installDailyReportTrigger(){
  // ลบ trigger เดิม (ถ้ามี)
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'sendDailyReport'){
      ScriptApp.deleteTrigger(t);
    }
  });
  // ติดตั้งใหม่: ทุกวัน 6:30 น.
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .atHour(6)
    .nearMinute(30)
    .everyDays(1)
    .create();
  SpreadsheetApp.getUi().alert(
    '✅ ติดตั้ง Daily Report Trigger สำเร็จ\n\n' +
    'จะส่งรายงานสรุปเข้า LINE ทุกวันเวลา 6:30 น.\n\n' +
    '⚠️ ต้องตั้ง Script Property "LINE_TOKEN_DAILY" หรือ "LINE_TOKEN" ก่อน'
  );
}

function uninstallDailyReportTrigger(){
  const triggers = ScriptApp.getProjectTriggers();
  let n = 0;
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'sendDailyReport'){
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  SpreadsheetApp.getUi().alert('🗑️ ลบ trigger แล้ว ' + n + ' รายการ');
}

function testDailyReport(){
  Logger.log('=== Daily Report Preview ===');
  Logger.log(buildDailyReport());
}

/* ============================================================
 * TELEGRAM BOT — ทางเลือกแทน LINE (ฟรี ไม่ deprecate)
 *   ตั้ง: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID ใน Script Properties
 *   สมัคร bot: คุย @BotFather ใน Telegram → /newbot
 *   หา chat_id: คุย bot ของตัวเอง 1 ครั้ง → เปิด https://api.telegram.org/bot<TOKEN>/getUpdates
 * ============================================================ */
function sendTelegram(message){
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return {ok:false, error:'no telegram config'};
  try {
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const res = UrlFetchApp.fetch(url, {
      method:'post',
      contentType:'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      muteHttpExceptions:true
    });
    return {ok:res.getResponseCode()===200, code:res.getResponseCode()};
  } catch(e){
    return {ok:false, error:String(e)};
  }
}

function testTelegram(){
  const r = sendTelegram('🤖 <b>ทดสอบการเชื่อมต่อ Telegram Bot</b>\n\nระบบติดตามสถานการณ์น้ำ จ.หนองบัวลำภู\nเวลา: ' + new Date().toLocaleString('th-TH'));
  Logger.log(JSON.stringify(r));
}

/* ============================================================
 * AI INSIGHT — ใช้ Anthropic API (Claude) สรุปสถานการณ์
 *   ตั้ง: ANTHROPIC_API_KEY ใน Script Properties
 *   สมัครฟรี $5 credit ที่: https://console.anthropic.com
 * ============================================================ */
function generateAIInsight(){
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return {ok:false, error:'no API key'};

  // เก็บข้อมูลที่ส่งให้ AI
  const data = getAllData();
  const stations = data.stations || [];
  const c = getCompliance();
  const today = todayDateStr();
  const yesterday = Utilities.formatDate(new Date(Date.now()-86400000), TZ, 'yyyy-MM-dd');
  const hist = getHistory(null, 7);

  // สรุปสถานะปัจจุบัน
  const summary = {
    total: stations.length,
    red: stations.filter(s=>s.status==='red').length,
    yellow: stations.filter(s=>s.status==='yellow').length,
    green: stations.filter(s=>s.status==='green').length,
    redStations: stations.filter(s=>s.status==='red').map(s=>({name:s.name, level:s.currentLevel, threshold:s.red})),
    yellowStations: stations.filter(s=>s.status==='yellow').map(s=>({name:s.name, level:s.currentLevel, threshold:s.yellow})),
    missingToday: c.missingCount,
  };

  // คำนวณการเปลี่ยนแปลงเทียบเมื่อวาน
  const yHist = hist.filter(h=>h.date===yesterday);
  const trend = stations.map(s=>{
    const yRec = yHist.find(h=>String(h.stationId)===String(s.id));
    if (!yRec || s.currentLevel == null) return null;
    return {name: s.name, change: +(s.currentLevel - yRec.level).toFixed(2)};
  }).filter(Boolean).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,5);

  // ดึงฝน
  let rainPast = 0, rainFuture = 0;
  try {
    const wRes = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=17.2046&longitude=102.4260&daily=precipitation_sum&past_days=2&forecast_days=3&timezone=Asia%2FBangkok', {muteHttpExceptions:true});
    if (wRes.getResponseCode() === 200){
      const w = JSON.parse(wRes.getContentText());
      const sums = w.daily?.precipitation_sum || [];
      rainPast = +(sums.slice(0,2).reduce((a,b)=>a+(b||0),0)).toFixed(1);
      rainFuture = +(sums.slice(2).reduce((a,b)=>a+(b||0),0)).toFixed(1);
    }
  } catch(e){}

  const context = `ข้อมูลสถานการณ์น้ำ จ.หนองบัวลำภู ณ ${today}:
- สถานีทั้งหมด: ${summary.total}
- 🔴 วิกฤติ: ${summary.red}, 🟡 เฝ้าระวัง: ${summary.yellow}, 🟢 ปกติ: ${summary.green}
- ยังไม่กรอกวันนี้: ${summary.missingToday}
- สถานีวิกฤติ: ${JSON.stringify(summary.redStations)}
- สถานีเฝ้าระวัง: ${JSON.stringify(summary.yellowStations)}
- การเปลี่ยนแปลงระดับน้ำ vs เมื่อวาน (top 5): ${JSON.stringify(trend)}
- ฝนสะสม 2 วันที่ผ่านมา: ${rainPast} มม.
- ฝนพยากรณ์ 3 วันข้างหน้า: ${rainFuture} มม.

จงสรุปสถานการณ์ในภาษาไทย ในรูปแบบที่ผู้บริหารระดับจังหวัดอ่านได้ง่าย:
1. ภาพรวมสถานการณ์ (1-2 ประโยค)
2. จุดที่ต้องเฝ้าระวัง (ถ้ามี)
3. คำแนะนำ/ข้อเสนอแนะ (1-2 ข้อ)

จำกัดความยาวไม่เกิน 200 คำ ใช้ภาษาทางการแต่อ่านง่าย ไม่ต้องใช้ markdown formatting`;

  try {
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:'post',
      contentType:'application/json',
      headers:{
        'x-api-key': apiKey,
        'anthropic-version':'2023-06-01'
      },
      payload: JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages:[{role:'user', content: context}]
      }),
      muteHttpExceptions:true
    });
    if (res.getResponseCode() !== 200){
      return {ok:false, error: 'API error: '+res.getResponseCode(), body:res.getContentText().substring(0,200)};
    }
    const out = JSON.parse(res.getContentText());
    const text = out.content && out.content[0] && out.content[0].text;
    return {ok:true, insight: text || '', generatedAt: new Date().toISOString()};
  } catch(e){
    return {ok:false, error:String(e)};
  }
}

function testAIInsight(){
  Logger.log(JSON.stringify(generateAIInsight(), null, 2));
}

/* ============================================================
 * COMPARE WITH DATE — ดูสถานะ ณ วันที่เลือกย้อนหลัง
 * ============================================================ */
function getStatusOnDate(targetDate){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stSh = ss.getSheetByName(SHEET_STATIONS);
  const hSh = ss.getSheetByName(SHEET_HISTORY);

  const stRows = stSh.getDataRange().getValues();
  const stHead = stRows.shift();
  const stations = stRows.filter(r=>r[0]).map(r=>{
    const o = {};
    stHead.forEach((h,i)=> o[h] = r[i]);
    delete o.pinHash; delete o.pinPlain;
    return o;
  });

  const hRows = hSh.getDataRange().getValues();
  const hHead = hRows.shift();
  const hIdx = {}; hHead.forEach((h,i)=> hIdx[h]=i);

  // หา record ของแต่ละสถานี ณ วันที่ที่ขอ
  const records = {};
  hRows.forEach(r => {
    const d = r[hIdx.date] instanceof Date ? Utilities.formatDate(r[hIdx.date], TZ, 'yyyy-MM-dd') : String(r[hIdx.date]);
    if (d === targetDate){
      records[String(r[hIdx.stationId])] = {
        level: Number(r[hIdx.level]),
        status: r[hIdx.status],
        recordedBy: r[hIdx.recordedBy],
        note: r[hIdx.note] || ''
      };
    }
  });

  const merged = stations.map(s => {
    const rec = records[String(s.id)];
    return Object.assign({}, s, {
      currentLevel: rec ? rec.level : null,
      status: rec ? rec.status : '',
      updatedAt: '',
      updatedBy: rec ? rec.recordedBy : '',
      note: rec ? rec.note : ''
    });
  });

  return {ok:true, date: targetDate, stations: merged};
}

/* ============================================================
 * CUSTOM RULE ENGINE — Evaluate rules + fire actions
 *   เรียกโดย trigger ทุก 30 นาที
 * ============================================================ */
function evalCondition(cond, context){
  // Parse: red>=2,yellow>=1 (AND) or single: rain24h>=50
  const parts = String(cond || '').split(',').map(s=>s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => evalSingleCondition(part, context));
}

function evalSingleCondition(cond, ctx){
  // time=07:00,17:00 — special handling
  if (cond.startsWith('time=')){
    const times = cond.substring(5).split('|').map(s=>s.trim());
    const now = Utilities.formatDate(new Date(), TZ, 'HH:mm');
    return times.some(t => Math.abs(timeDiffMin(now, t)) < 30);
  }
  const m = cond.match(/^(\w+)\s*(>=|<=|>|<|=)\s*(.+)$/);
  if (!m) return false;
  const key = m[1].trim();
  const op = m[2];
  const valRaw = m[3].trim();
  const lhs = ctx[key];
  if (lhs === undefined || lhs === null) return false;
  const rhs = isNaN(Number(valRaw)) ? valRaw : Number(valRaw);
  switch(op){
    case '>=': return lhs >= rhs;
    case '<=': return lhs <= rhs;
    case '>':  return lhs > rhs;
    case '<':  return lhs < rhs;
    case '=':  return String(lhs) === String(rhs);
  }
  return false;
}

function timeDiffMin(t1, t2){
  const [h1,m1] = t1.split(':').map(Number);
  const [h2,m2] = t2.split(':').map(Number);
  return (h1*60+m1) - (h2*60+m2);
}

function buildRuleContext(){
  const data = getAllData();
  const stations = data.stations || [];
  const c = getCompliance();
  let rain24h = 0, rainForecast3d = 0;
  try {
    const wRes = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=17.2046&longitude=102.4260&daily=precipitation_sum&past_days=1&forecast_days=3&timezone=Asia%2FBangkok', {muteHttpExceptions:true});
    if (wRes.getResponseCode() === 200){
      const w = JSON.parse(wRes.getContentText());
      const sums = w.daily?.precipitation_sum || [];
      rain24h = +(sums[0] || 0).toFixed(1);
      rainForecast3d = +(sums.slice(1,4).reduce((a,b)=>a+(b||0),0)).toFixed(1);
    }
  } catch(e){}

  return {
    red: stations.filter(s=>s.status==='red').length,
    yellow: stations.filter(s=>s.status==='yellow').length,
    green: stations.filter(s=>s.status==='green').length,
    missing: c.missingCount,
    rain24h,
    rainForecast3d,
    total: stations.length,
    _stations: stations
  };
}

function evaluateRules(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_RULES);
  if (!sh) return {ok:false, error:'no Rules sheet'};
  const rows = sh.getDataRange().getValues();
  const head = rows.shift();
  const idx = {}; head.forEach((h,i)=> idx[h]=i);

  const ctx = buildRuleContext();
  const fired = [];
  const now = nowDate();

  for (let i = 0; i < rows.length; i++){
    const r = rows[i];
    if (!r[idx.active]) continue;
    if (!r[idx.condition]) continue;
    const lastFired = r[idx.lastFired];
    // Throttle: ไม่ยิง rule เดิมซ้ำในรอบ 1 ชม. (ยกเว้น time-based)
    if (lastFired && !String(r[idx.condition]).startsWith('time=')){
      const since = (now.getTime() - new Date(lastFired).getTime()) / 1000 / 60;
      if (since < 60) continue;
    }
    if (!evalCondition(r[idx.condition], ctx)) continue;

    // Fire!
    const ruleName = r[idx.name] || ('Rule '+r[idx.id]);
    const action = String(r[idx.action] || 'notify').toLowerCase();
    const channels = String(r[idx.channel] || 'line').split(/[,+]/).map(s=>s.trim()).filter(Boolean);
    let msg;
    if (action === 'report'){
      msg = buildDailyReport();
    } else {
      msg = '\n🔔 แจ้งเตือนตามกฎ: ' + ruleName + '\n' +
        '🟢 ปกติ: ' + ctx.green + ' | 🟡 เฝ้าระวัง: ' + ctx.yellow + ' | 🔴 วิกฤติ: ' + ctx.red + '\n' +
        '🌧️ ฝน 24 ชม.: ' + ctx.rain24h + ' มม. | พยากรณ์ 3 วัน: ' + ctx.rainForecast3d + ' มม.\n' +
        '⏰ ' + Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm');
    }

    let sentChannels = [];
    if (channels.includes('line')){
      const t = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
      if (t){
        try {
          UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
            method:'post',
            headers:{Authorization:'Bearer '+t},
            payload:{message: msg},
            muteHttpExceptions:true
          });
          sentChannels.push('line');
        } catch(e){}
      }
    }
    if (channels.includes('telegram')){
      const tgMsg = msg.replace(/^\n/, '');
      const r = sendTelegram(tgMsg);
      if (r.ok) sentChannels.push('telegram');
    }

    fired.push({rule: ruleName, channels: sentChannels});
    // อัปเดต lastFired
    sh.getRange(i+2, idx.lastFired+1).setValue(now);
  }

  return {ok:true, fired, evaluated: rows.length, context: ctx};
}

function installRuleEngineTrigger(){
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'evaluateRules') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('evaluateRules')
    .timeBased()
    .everyMinutes(30)
    .create();
  SpreadsheetApp.getUi().alert(
    '✅ Rule Engine เริ่มทำงานทุก 30 นาที\n\n' +
    'แก้ rules ในชีต Rules\n' +
    'Throttle: rule เดียวกันยิงซ้ำได้ทุก 1 ชม. (ยกเว้น time-based)'
  );
}

function uninstallRuleEngineTrigger(){
  const triggers = ScriptApp.getProjectTriggers();
  let n = 0;
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'evaluateRules'){
      ScriptApp.deleteTrigger(t); n++;
    }
  });
  SpreadsheetApp.getUi().alert('🗑️ ลบ Rule Engine trigger ' + n + ' รายการ');
}

function testEvaluateRules(){
  Logger.log(JSON.stringify(evaluateRules(), null, 2));
}

/* ============================================================
 * EXPORT PIVOT — ตารางสรุปสำหรับ Looker Studio / Power BI
 * ============================================================ */
function exportPivotCSV(days){
  days = days || 30;
  const hist = getHistory(null, days);
  // Pivot: row = date, col = stationId, value = level
  const dates = [...new Set(hist.map(h=>h.date))].sort();
  const stationIds = [...new Set(hist.map(h=>String(h.stationId)))].sort((a,b)=>Number(a)-Number(b));
  const {map} = getStationsMap();

  const headers = ['date'].concat(stationIds.map(id => (map[id]?.name || 'St'+id)));
  const lines = [headers.join(',')];
  dates.forEach(d=>{
    const row = [d];
    stationIds.forEach(id=>{
      const rec = hist.find(h=> h.date===d && String(h.stationId)===id);
      row.push(rec ? rec.level : '');
    });
    lines.push(row.map(v => csvEscape(String(v))).join(','));
  });
  return '\uFEFF' + lines.join('\n');
}

/* ============================================================
 * GET STATIONS ON DATE — ดูสถานะของทุกสถานี ณ วันที่ระบุ (Phase 4)
 * ============================================================ */
function getStationsOnDate(dateStr){
  if (!dateStr) dateStr = todayDateStr();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stSh = ss.getSheetByName(SHEET_STATIONS);
  const hSh = ss.getSheetByName(SHEET_HISTORY);

  const stRows = stSh.getDataRange().getValues();
  const stHead = stRows.shift();
  const stations = stRows.filter(r=>r[0]).map(r=>{
    const o = {};
    stHead.forEach((h,i)=> o[h] = r[i]);
    delete o.pinHash; delete o.pinPlain;
    return o;
  });

  const hRows = hSh.getDataRange().getValues();
  const hHead = hRows.shift();
  const idx = {}; hHead.forEach((h,i)=> idx[h]=i);
  const onDate = {};
  hRows.forEach(r=>{
    const d = r[idx.date] instanceof Date
      ? Utilities.formatDate(r[idx.date], TZ, 'yyyy-MM-dd')
      : String(r[idx.date]);
    if (d === dateStr){
      onDate[String(r[idx.stationId])] = {
        level: Number(r[idx.level]),
        status: r[idx.status],
        recordedBy: r[idx.recordedBy],
        note: r[idx.note] || ''
      };
    }
  });

  return stations.map(s=>{
    const h = onDate[String(s.id)] || {};
    return Object.assign({}, s, {
      currentLevel: h.level != null ? h.level : null,
      status: h.status || '',
      updatedBy: h.recordedBy || '',
      note: h.note || ''
    });
  });
}

/* ============================================================
 * DAMS — ดึงจาก Sheet (manual) หรือ sync จาก API ภายนอก
 * ============================================================ */
function getDamsData(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_DAMS);
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  const head = rows.shift();
  return rows.filter(r=>r[0]).map(r=>{
    const o = {};
    head.forEach((h,i)=> o[h] = r[i]);
    return o;
  });
}

/* ============================================================
 * SYNC DAMS — ดึงข้อมูลเขื่อนจาก EGAT/RID API (ค่าจริง)
 *   หมายเหตุ: API ของ EGAT/RID public ไม่ได้ stable —
 *   ฟังก์ชันนี้เป็น scaffold ผู้ใช้ตั้ง endpoint จริงตามที่หน่วยงานให้มา
 * ============================================================ */
function syncDamsFromAPI(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_DAMS);
  const rows = sh.getDataRange().getValues();
  const head = rows[0];
  const idx = {}; head.forEach((h,i)=> idx[h]=i);

  let updated = 0;
  for (let i = 1; i < rows.length; i++){
    const damId = rows[i][idx.id];
    const source = rows[i][idx.source];
    if (!damId || !source || source === 'manual') continue;

    try {
      let current = null;
      if (source === 'egat'){
        // Placeholder: EGAT API ของจริงต้องสมัครก่อนที่ thaiwater.net หรือ egat.co.th
        // ตัวอย่าง endpoint: https://water.thaiwater.net/api/v1/dam-storage?dam_id=ubol_ratana
        // ถ้ามี real endpoint ให้แก้ฟังก์ชันนี้
        const res = UrlFetchApp.fetch(
          'https://www.thaiwater.net/api/v1/thaiwater30/dam/dam_daily?dam_id=' + encodeURIComponent(damId),
          {muteHttpExceptions:true, followRedirects:true}
        );
        if (res.getResponseCode() === 200){
          const data = JSON.parse(res.getContentText());
          // ใส่ logic แปลง response ตามจริง
          if (data && data.data && data.data.length){
            const last = data.data[data.data.length-1];
            current = parseFloat(last.storage_volume || last.current_storage || last.storage);
          }
        }
      } else if (source === 'rid'){
        // Placeholder for RID API
        const res = UrlFetchApp.fetch(
          'https://water.rid.go.th/api/dam-status?id=' + encodeURIComponent(damId),
          {muteHttpExceptions:true}
        );
        if (res.getResponseCode() === 200){
          const data = JSON.parse(res.getContentText());
          if (data && data.current_storage) current = parseFloat(data.current_storage);
        }
      }

      if (current != null && !isNaN(current)){
        sh.getRange(i+1, idx.current_mcm+1).setValue(current);
        sh.getRange(i+1, idx.updatedAt+1).setValue(new Date());
        updated++;
      }
    } catch(e){
      Logger.log('syncDam ' + damId + ' failed: ' + e);
    }
  }
  return {ok:true, updated};
}

function installDamsSyncTrigger(){
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'syncDamsFromAPI') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncDamsFromAPI')
    .timeBased()
    .everyHours(6)
    .create();
  SpreadsheetApp.getUi().alert('✅ ติดตั้ง Dams Sync Trigger — sync ทุก 6 ชั่วโมง\n\n⚠️ ต้องแก้ endpoint API จริงในฟังก์ชัน syncDamsFromAPI ก่อนใช้งาน');
}

/* ============================================================
 * TELEGRAM NOTIFY — ทางเลือกเสริม LINE (เผื่อ deprecate)
 *   ตั้ง Script Properties:
 *     TELEGRAM_BOT_TOKEN — ได้จาก @BotFather
 *     TELEGRAM_CHAT_ID — chat id (group หรือ user)
 * ============================================================ */
function sendTelegram(message){
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return {ok:false, error:'no telegram config'};
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = UrlFetchApp.fetch(url, {
      method:'post',
      payload:{
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: 'true'
      },
      muteHttpExceptions:true
    });
    return {ok: res.getResponseCode() === 200, code: res.getResponseCode()};
  } catch(e){
    return {ok:false, error: String(e)};
  }
}

function notifyAll(message, channels){
  channels = channels || ['line'];
  const results = {};
  if (channels.indexOf('line') >= 0){
    const token = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
    if (token){
      try {
        UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
          method:'post',
          headers:{Authorization:'Bearer ' + token},
          payload:{message},
          muteHttpExceptions:true
        });
        results.line = 'sent';
      } catch(e){ results.line = String(e); }
    } else results.line = 'no token';
  }
  if (channels.indexOf('telegram') >= 0){
    results.telegram = sendTelegram(message);
  }
  return results;
}

/* ============================================================
 * RULE ENGINE — ตรวจ custom rules และส่งแจ้งเตือน (Phase 4)
 *   เงื่อนไขที่รองรับ:
 *   - rise_per_day: ระดับน้ำเพิ่มเร็วเกิน threshold ม./วัน
 *   - red_count: จำนวนสถานีแดงเกิน threshold เป็นเวลา duration_days
 *   - yellow_count: จำนวนสถานีเหลืองเกิน threshold เป็นเวลา duration_days
 *   - rain_3days: ฝนสะสม 3 วันเกิน threshold มม. (Open-Meteo)
 *   - level_above_yellow_days: สถานีอยู่เหนือเหลืองนานเกิน duration_days
 * ============================================================ */
function runRuleEngine(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_RULES);
  if (!sh) return {ok:false, error:'no Rules sheet'};
  const rows = sh.getDataRange().getValues();
  const head = rows.shift();
  const idx = {}; head.forEach((h,i)=> idx[h]=i);

  const today = todayDateStr();
  const fired = [];

  rows.forEach((r, rowIdx)=>{
    if (!r[idx.id] || !r[idx.active]) return;
    const ruleId = r[idx.id];
    const name = r[idx.name];
    const cond = r[idx.condition];
    const threshold = Number(r[idx.threshold]);
    const duration = Number(r[idx.duration_days] || 1);
    const channel = String(r[idx.channel] || 'line').toLowerCase();
    const lastFired = r[idx.lastFired]
      ? Utilities.formatDate(new Date(r[idx.lastFired]), TZ, 'yyyy-MM-dd')
      : '';

    // กัน duplicate fire ในวันเดียว
    if (lastFired === today) return;

    let shouldFire = false;
    let detail = '';

    try {
      if (cond === 'rise_per_day'){
        // ตรวจ history: ระดับน้ำเพิ่มขึ้นเกิน threshold ใน 1 วัน (ของสถานีใดก็ตาม)
        const hist = getHistory(null, 2);
        const yesterday = Utilities.formatDate(new Date(Date.now()-86400000), TZ, 'yyyy-MM-dd');
        const todayMap = {}, yMap = {};
        hist.forEach(h=>{
          if (h.date === today) todayMap[h.stationId] = h.level;
          else if (h.date === yesterday) yMap[h.stationId] = h.level;
        });
        Object.keys(todayMap).forEach(sid=>{
          if (yMap[sid] != null){
            const rise = todayMap[sid] - yMap[sid];
            if (rise >= threshold){
              shouldFire = true;
              detail += `\n• สถานี ${sid}: เพิ่มขึ้น ${rise.toFixed(2)} ม.`;
            }
          }
        });
      } else if (cond === 'red_count' || cond === 'yellow_count'){
        const target = cond === 'red_count' ? 'red' : 'yellow';
        // ตรวจ duration_days ย้อนหลังว่ามีจำนวนเป้าหมายเกิน threshold หรือไม่
        const hist = getHistory(null, duration + 1);
        let allDaysOver = true;
        for (let i = 0; i < duration; i++){
          const d = Utilities.formatDate(new Date(Date.now() - i*86400000), TZ, 'yyyy-MM-dd');
          const count = hist.filter(h=>h.date === d && h.status === target).length;
          if (count < threshold){ allDaysOver = false; break; }
        }
        if (allDaysOver){
          shouldFire = true;
          detail = `\nครบ ${duration} วันที่มีสถานี ${target === 'red' ? 'วิกฤติ' : 'เฝ้าระวัง'} ≥ ${threshold} แห่ง`;
        }
      } else if (cond === 'rain_3days'){
        try {
          const res = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=17.2046&longitude=102.4260&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FBangkok', {muteHttpExceptions:true});
          if (res.getResponseCode() === 200){
            const d = JSON.parse(res.getContentText());
            const sum = (d.daily?.precipitation_sum || []).reduce((a,b)=>a+(b||0),0);
            if (sum >= threshold){
              shouldFire = true;
              detail = `\nพยากรณ์ฝนสะสม 3 วัน: ${sum.toFixed(1)} มม. (เกินเกณฑ์ ${threshold} มม.)`;
            }
          }
        } catch(e){ Logger.log('rain_3days check failed: '+e); }
      } else if (cond === 'level_above_yellow_days'){
        const hist = getHistory(null, duration + 1);
        const stationsAbove = {};
        for (let i = 0; i < duration; i++){
          const d = Utilities.formatDate(new Date(Date.now() - i*86400000), TZ, 'yyyy-MM-dd');
          hist.filter(h=>h.date === d && (h.status === 'yellow' || h.status === 'red')).forEach(h=>{
            stationsAbove[h.stationId] = (stationsAbove[h.stationId] || 0) + 1;
          });
        }
        const stuck = Object.entries(stationsAbove).filter(([,c])=> c >= duration);
        if (stuck.length){
          shouldFire = true;
          detail = `\nสถานีที่อยู่เหนือเกณฑ์เฝ้าระวัง ${duration}+ วัน: ${stuck.map(s=>s[0]).join(', ')}`;
        }
      }

      if (shouldFire){
        const msg = `\n🚨 Rule Triggered: ${name}\n${detail}\nเวลา: ${Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm')}`;
        const channels = channel === 'both' ? ['line','telegram'] : [channel];
        notifyAll(msg, channels);
        // อัปเดต lastFired
        sh.getRange(rowIdx+2, idx.lastFired+1).setValue(new Date());
        fired.push({ruleId, name, detail});
      }
    } catch(e){
      Logger.log('Rule ' + ruleId + ' error: ' + e);
    }
  });

  return {ok:true, fired};
}

function installRuleEngineTrigger(){
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'runRuleEngine') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runRuleEngine')
    .timeBased()
    .everyHours(1)
    .create();
  SpreadsheetApp.getUi().alert('✅ ติดตั้ง Rule Engine Trigger — รันทุก 1 ชั่วโมง');
}

function uninstallRuleEngineTrigger(){
  const triggers = ScriptApp.getProjectTriggers();
  let n = 0;
  triggers.forEach(t=>{
    if (t.getHandlerFunction() === 'runRuleEngine'){
      ScriptApp.deleteTrigger(t); n++;
    }
  });
  SpreadsheetApp.getUi().alert('🗑️ ลบ trigger แล้ว ' + n + ' รายการ');
}

function testRuleEngine(){
  Logger.log(JSON.stringify(runRuleEngine(), null, 2));
}

/* ============================================================
 * AI INSIGHT SUMMARY — ใช้ Anthropic Claude / Google Gemini สรุปสถานการณ์
 *   ตั้ง Script Property: ANTHROPIC_API_KEY (หรือ GEMINI_API_KEY)
 *   หมายเหตุ: ใช้ quota — ผู้ใช้ตัดสินใจเอง
 * ============================================================ */
function generateAIInsight(lang){
  lang = lang || 'th';
  const claudeKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!claudeKey && !geminiKey){
    return {ok:false, error:'no AI API key configured'};
  }

  // รวบรวมข้อมูลให้ AI วิเคราะห์
  const data = getAllData();
  const stations = data.stations || [];
  const compliance = getCompliance();
  const hist7 = getHistory(null, 7);

  // สรุปข้อมูลให้ AI (แบบกระชับ)
  const summary = stations.map(s=>{
    const recent = hist7.filter(h=>String(h.stationId)===String(s.id)).slice(-3);
    const trend = recent.length >= 2
      ? (recent[recent.length-1].level - recent[0].level).toFixed(2)
      : '?';
    return `${s.name}(${s.river}): ${s.currentLevel||'?'} ม.รทก. ${s.status||'-'} เกณฑ์แดง=${s.red} แนวโน้ม3วัน=${trend>0?'+':''}${trend}`;
  }).join('\n');

  const promptTH = `คุณเป็นผู้เชี่ยวชาญด้านการบริหารจัดการน้ำในประเทศไทย วิเคราะห์ข้อมูลสถานการณ์น้ำ จ.หนองบัวลำภู ต่อไปนี้:

${summary}

จำนวนสถานีรายงานแล้ววันนี้: ${compliance.reportedCount}/${compliance.totalStations}

กรุณาสรุปสถานการณ์ในย่อหน้าเดียว 3-5 ประโยค ภาษาเป็นทางการ ครอบคลุม:
1. ภาพรวมความเสี่ยงน้ำท่วม/น้ำแล้ง
2. จุดที่ควรเฝ้าระวังเป็นพิเศษ
3. คำแนะนำเชิงปฏิบัติสั้นๆ

ไม่ต้องใส่หัวข้อ — เขียนเป็นย่อหน้าธรรมดา`;

  const promptEN = `As a Thailand water management expert, analyze water situation data for Nong Bua Lam Phu Province:

${summary}

Stations reported today: ${compliance.reportedCount}/${compliance.totalStations}

Please summarize the situation in one paragraph (3-5 sentences) covering:
1. Overall flood/drought risk
2. Areas requiring special attention
3. Brief practical recommendations

No headers — write as plain paragraph in formal tone.`;

  const prompt = lang === 'en' ? promptEN : promptTH;

  // ใช้ Claude ก่อน ถ้าไม่มีค่อยใช้ Gemini
  if (claudeKey){
    try {
      const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method:'post',
        headers:{
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        payload: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          messages: [{role:'user', content: prompt}]
        }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200){
        const json = JSON.parse(res.getContentText());
        const text = json.content?.[0]?.text || '';
        return {ok:true, source:'claude', text, generatedAt: new Date().toISOString()};
      } else {
        Logger.log('Claude error: ' + res.getResponseCode() + ' ' + res.getContentText().substring(0,200));
      }
    } catch(e){ Logger.log('Claude failed: ' + e); }
  }

  if (geminiKey){
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = UrlFetchApp.fetch(url, {
        method:'post',
        contentType:'application/json',
        payload: JSON.stringify({
          contents:[{parts:[{text: prompt}]}]
        }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200){
        const json = JSON.parse(res.getContentText());
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return {ok:true, source:'gemini', text, generatedAt: new Date().toISOString()};
      }
    } catch(e){ Logger.log('Gemini failed: ' + e); }
  }

  return {ok:false, error:'AI generation failed'};
}

/* ============================================================
 * REHASH ALL PINS — รันหลังแก้ pinPlain ในชีต
 *   อ่านจาก pinPlain → คำนวณ pinHash → เขียนกลับ
 *   แล้วลบ pinPlain ทิ้งให้อัตโนมัติ
 * ============================================================ */
function rehashAllPins(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_STATIONS);
  const data = sh.getDataRange().getValues();
  const head = data[0];
  const idxHash = head.indexOf('pinHash');
  const idxPlain = head.indexOf('pinPlain');
  if (idxHash < 0 || idxPlain < 0){
    SpreadsheetApp.getUi().alert('❌ ไม่พบคอลัมน์ pinHash หรือ pinPlain');
    return;
  }
  let updated = 0;
  for (let i = 1; i < data.length; i++){
    const plain = data[i][idxPlain];
    if (plain && String(plain).trim()){
      const hash = sha256(String(plain).trim());
      sh.getRange(i+1, idxHash+1).setValue(hash);
      sh.getRange(i+1, idxPlain+1).setValue('');
      updated++;
    }
  }
  SpreadsheetApp.getUi().alert(
    '✅ Rehash เสร็จเรียบร้อย ' + updated + ' สถานี\n\n' +
    'pinPlain ถูกล้างทิ้งทุกแถวแล้ว — ระบบใช้แต่ pinHash'
  );
}
