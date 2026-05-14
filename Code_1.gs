/**
 * ============================================================
 *  ระบบแดชบอร์ดสถานการณ์น้ำจังหวัดหนองบัวลำภู
 *  Google Apps Script Backend — v3 (+ PIN auth)
 * ============================================================
 *  PIN: ตั้งค่า APP_PIN ใน Script Properties
 * ============================================================ */

// ===== CONFIG =====
const SHEET_STATIONS  = "Stations";
const SHEET_WATER     = "WaterLevel";
const SHEET_RAIN      = "Rainfall";
const SHEET_RESERVOIR = "Reservoir";
const SHEET_SETTINGS  = "Settings";

// ===== PIN =====
const PIN_PROPERTY_KEY = "APP_PIN";
const PIN_REQUIRED = true;       // false = ปิด PIN ระหว่าง dev

const RESERVOIR_HEADERS = [
  "reservoir_id","reservoir_name","amphoe","capacity",
  "current_volume","date","reporter","updated_at"
];

// ===== ENTRY POINTS =====

function doGet(e) {
  const params   = (e && e.parameter) ? e.parameter : {};
  const action   = (params.action   || "summary").toLowerCase();
  const callback = params.callback;
  let data;

  const WRITE_ACTIONS = ["savewater","saverain","savereservoir","savedailyreport"];

  try {
    // === WRITE ACTIONS via GET (เลี่ยง CORS preflight/302 redirect ที่ทำให้ POST ล้มเหลว) ===
    if (WRITE_ACTIONS.indexOf(action) !== -1) {
      if (PIN_REQUIRED) {
        const expectedPin = getAppPin();
        if (!expectedPin) {
          return respond({ ok:false, error:"ยังไม่ได้ตั้งค่า APP_PIN ใน Script Properties", code:"PIN_NOT_CONFIGURED" }, callback);
        }
        const pin = String(params.pin || "").trim();
        if (pin !== expectedPin) {
          return respond({ ok:false, error:"PIN ไม่ถูกต้อง", code:"INVALID_PIN" }, callback);
        }
      }
      // payload = query params ทั้งหมด ยกเว้น callback / action / pin
      const payload = {};
      Object.keys(params).forEach(function(k){
        if (k === 'callback') return;
        payload[k] = params[k];
      });
      switch (action) {
        case "savewater":       data = saveWaterLevel(payload); break;
        case "saverain":        data = saveRainfall(payload); break;
        case "savereservoir":   data = saveReservoir(payload); break;
        case "savedailyreport": data = saveDailyReport(payload); break;
      }
      return respond(data, callback);
    }

    // === READ ACTIONS (เดิม) ===
    switch (action) {
      case "summary":     data = getSummary(); break;
      case "paneang":     data = getRiverDashboard("paneang"); break;
      case "mong":        data = getRiverDashboard("mong"); break;
      case "stations":    data = getStations(params.river); break;
      case "water":       data = getWaterLevels(params.station_id, parseInt(params.days||"7")); break;
      case "rain":        data = getRainfall(parseInt(params.days||"7")); break;
      case "reservoir":   data = getReservoirs(); break;
      case "history":     data = getHistory(parseInt(params.limit||"20")); break;
      case "dailyreport": data = getDailyReport(params.date); break;
      case "ping":        data = { ok:true, time:new Date().toISOString() }; break;
      default:            data = { error:"unknown action: "+action };
    }
  } catch(err) { data = { ok:false, error:err.toString() }; }
  return respond(data, callback);
}

function doPost(e) {
  let payload = {};
  try {
    if (e && e.postData && e.postData.contents) payload = JSON.parse(e.postData.contents);
    else if (e && e.parameter) payload = e.parameter;
  } catch(err) { return respond({ ok:false, error:"Invalid JSON: "+err.toString() }); }

  const WRITE_ACTIONS = ["savewater","saverain","savereservoir","savedailyreport"];
  const action = (payload.action || "").toLowerCase();

  // PIN CHECK สำหรับ action เขียนข้อมูล
  if (PIN_REQUIRED && WRITE_ACTIONS.indexOf(action) !== -1) {
    const expectedPin = getAppPin();
    if (!expectedPin) {
      return respond({ ok:false, error:"ยังไม่ได้ตั้งค่า APP_PIN ใน Script Properties", code:"PIN_NOT_CONFIGURED" });
    }
    const pin = String(payload.pin || "").trim();
    if (pin !== expectedPin) {
      return respond({ ok:false, error:"PIN ไม่ถูกต้อง", code:"INVALID_PIN" });
    }
  }

  let result;
  try {
    switch (action) {
      case "savewater":       result = saveWaterLevel(payload); break;
      case "saverain":        result = saveRainfall(payload); break;
      case "savereservoir":   result = saveReservoir(payload); break;
      case "savedailyreport": result = saveDailyReport(payload); break;
      case "summary":         result = getSummary(); break;
      case "reservoir":       result = getReservoirs(); break;
      default:                result = { ok:false, error:"unknown action: "+action };
    }
  } catch(err) { result = { ok:false, error:err.toString() }; }
  return respond(result);
}

// ===== READ =====

function getStations(river) {
  const rows = sheetToObjects(ss().getSheetByName(SHEET_STATIONS));
  if (river) return rows.filter(r => String(r.river||"").indexOf(river)!==-1);
  return rows;
}

function getSummary() {
  const stations = getStations(), latest = getLatestWaterByStation();
  let normal=0,warn=0,crit=0;
  const merged = stations.map(st => {
    const w=latest[st.station_id]||{}, level=parseFloat(w.level);
    let status="ปกติ";
    if(!isNaN(level)){
      if(parseFloat(st.bank_level)&&level>=parseFloat(st.bank_level)) status="วิกฤติ";
      else if(parseFloat(st.warn_level)&&level>=parseFloat(st.warn_level)) status="เฝ้าระวัง";
    }
    if(status==="วิกฤติ") crit++; else if(status==="เฝ้าระวัง") warn++; else normal++;
    return Object.assign({},st,{current_level:isNaN(level)?null:level,flow:w.flow||null,status,last_update:w.date?(w.date+" "+(w.time||"")):null});
  });
  const rain=getRainfall(1);
  let avgRain=0;
  if(rain.length>0) avgRain=rain.reduce((a,r)=>a+(parseFloat(r.rain_24hr)||0),0)/rain.length;
  return {total:stations.length,normal,warn,crit,avg_rain_24hr:avgRain,stations:merged,updated:new Date().toISOString()};
}

function getRiverDashboard(riverKey) {
  const key = String(riverKey || "").toLowerCase();
  const stations = getStations().filter(st => {
    const id = String(st.station_id || "").toUpperCase();
    const river = String(st.river || "").toLowerCase();
    if (key === "paneang") return id.indexOf("PN") === 0 || river.indexOf("paneang") !== -1 || river.indexOf("พะเนียง") !== -1;
    if (key === "mong") return id.indexOf("MG") === 0 || river.indexOf("mong") !== -1 || river.indexOf("โมง") !== -1;
    return true;
  });
  const latest = getLatestWaterByStation();
  let normal = 0, warn = 0, crit = 0;
  const merged = stations.map(st => {
    const w = latest[st.station_id] || {};
    const level = parseFloat(w.level);
    const bank = parseFloat(st.bank_level);
    const warnLevel = parseFloat(st.warn_level);
    let status = "ปกติ";
    if (!isNaN(level)) {
      if (!isNaN(bank) && level >= bank) status = "วิกฤติ";
      else if (!isNaN(warnLevel) && level >= warnLevel) status = "เฝ้าระวัง";
    }
    if (status === "วิกฤติ") crit++;
    else if (status === "เฝ้าระวัง") warn++;
    else normal++;
    return Object.assign({}, st, {
      id: st.station_id,
      current: isNaN(level) ? null : level,
      current_level: isNaN(level) ? null : level,
      flow: w.flow || null,
      status: status,
      last_update: w.date ? (w.date + " " + (w.time || "")) : null
    });
  });
  return {
    river: key,
    total: stations.length,
    normal: normal,
    warn: warn,
    crit: crit,
    stations: merged,
    updated: new Date().toISOString()
  };
}

function getWaterLevels(stationId,days) {
  const rows=sheetToObjects(ss().getSheetByName(SHEET_WATER));
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-(days||7));
  return rows.filter(r=>{if(stationId&&r.station_id!==stationId)return false;const d=parseDate(r.date);return d&&d>=cutoff;}).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
}

function getLatestWaterByStation() {
  const rows=sheetToObjects(ss().getSheetByName(SHEET_WATER)), latest={};
  rows.forEach(r=>{const sid=r.station_id;if(!sid)return;const d=parseDate(r.date);if(!latest[sid]||parseDate(latest[sid].date)<d)latest[sid]=r;});
  return latest;
}

function getRainfall(days) {
  const rows=sheetToObjects(ss().getSheetByName(SHEET_RAIN));
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-(days||7));
  return rows.filter(r=>{const d=parseDate(r.date);return d&&d>=cutoff;}).sort((a,b)=>parseDate(b.date)-parseDate(a.date));
}

function getReservoirs() {
  const sheet=getOrCreateReservoirSheet(), rows=sheetToObjects(sheet), latest={};
  rows.forEach(r=>{const id=r.reservoir_id;if(!id)return;const d=parseDate(r.date);if(!latest[id]||parseDate(latest[id].date)<d)latest[id]=r;});
  return Object.values(latest);
}

function getHistory(limit) {
  const water=sheetToObjects(ss().getSheetByName(SHEET_WATER)).map(r=>Object.assign({type:"water"},r));
  const rain=sheetToObjects(ss().getSheetByName(SHEET_RAIN)).map(r=>Object.assign({type:"rain"},r));
  return water.concat(rain).sort((a,b)=>(parseDate(b.date)||new Date(0))-(parseDate(a.date)||new Date(0))).slice(0,limit||20);
}

function getDailyReport(targetDate) {
  const sheet=ss().getSheetByName("DailyReport");
  if(!sheet) return null;
  const rows=sheetToObjects(sheet);
  if(!rows.length) return null;
  if(targetDate) return rows.find(r=>String(r.date).slice(0,10)===targetDate)||null;
  rows.sort((a,b)=>parseDate(b.date)-parseDate(a.date));
  return rows[0];
}

// ===== WRITE =====

function saveWaterLevel(p) {
  const sheet=ss().getSheetByName(SHEET_WATER), headers=getHeaders(sheet);
  sheet.appendRow(headers.map(h=>p[h]||""));
  return {ok:true,message:"บันทึกข้อมูลระดับน้ำเรียบร้อย",station_id:p.station_id};
}

function saveRainfall(p) {
  const sheet=ss().getSheetByName(SHEET_RAIN), headers=getHeaders(sheet);
  sheet.appendRow(headers.map(h=>p[h]||""));
  return {ok:true,message:"บันทึกข้อมูลฝนเรียบร้อย"};
}

function saveReservoir(p) {
  const sheet=getOrCreateReservoirSheet(), payload=normalizeReservoirPayload(p);
  if(!payload.reservoir_id&&!payload.reservoir_name) return {ok:false,error:"missing reservoir_id or reservoir_name"};
  const data=sheet.getDataRange().getValues(), headers=data[0];
  const idIdx=headers.indexOf("reservoir_id"), nmIdx=headerIndex(headers,["reservoir_name","name"]);
  const curIdx=headerIndex(headers,["current_volume","current"]), dateIdx=headers.indexOf("date"), updIdx=headers.indexOf("updated_at");
  const dateStr=String(payload.date||"").slice(0,10);

  for(let i=1;i<data.length;i++){
    const sameId  = idIdx>=0&&payload.reservoir_id  &&String(data[i][idIdx]).trim()===String(payload.reservoir_id).trim();
    const sameName= nmIdx>=0&&payload.reservoir_name&&String(data[i][nmIdx]).trim()===String(payload.reservoir_name).trim();
    const sameDate= dateIdx>=0&&String(data[i][dateIdx]).slice(0,10)===dateStr;
    if((sameId||sameName)&&sameDate){
      if(curIdx>=0) sheet.getRange(i+1,curIdx+1).setValue(payload.current_volume);
      if(updIdx>=0) sheet.getRange(i+1,updIdx+1).setValue(new Date());
      headers.forEach((h,col)=>{if(["current_volume","current","updated_at","date"].indexOf(h)!==-1)return;if(payload[h]!==undefined&&payload[h]!==null&&payload[h]!=="")sheet.getRange(i+1,col+1).setValue(payload[h]);});
      return {ok:true,message:"อัปเดต "+(payload.reservoir_name||payload.reservoir_id)+" วันที่ "+dateStr};
    }
  }
  const row=headers.map(h=>{if(h==="updated_at")return new Date();return payload[h]!==undefined?payload[h]:"";});
  sheet.appendRow(row);
  return {ok:true,message:"บันทึก "+(payload.reservoir_name||payload.reservoir_id)+" วันที่ "+dateStr};
}

function saveDailyReport(p) {
  const ss_obj=ss(); let sheet=ss_obj.getSheetByName("DailyReport");
  if(!sheet){
    sheet=ss_obj.insertSheet("DailyReport");
    sheet.appendRow(["date","reporter","dam_level","dam_use","dam_pct","dam_in","dam_out","dam_total","tmd_temp","tmd_cloud","tmd_rain_yest","tmd_pressure","tmd_humidity","tmd_wind","tmd_temp_min","tmd_visibility","tmd_rain_year","aqi_pm25","aqi_value","aqi_days_over","disaster_status","disaster_amphoe","disaster_note","saved_at"]);
  }
  const headers=getHeaders(sheet), dateStr=String(p.date||"").slice(0,10), dateIdx=headers.indexOf("date"), data=sheet.getDataRange().getValues();
  for(let i=1;i<data.length;i++){
    if(String(data[i][dateIdx]).slice(0,10)===dateStr){
      const row=headers.map(h=>h==="saved_at"?new Date():(p[h]||data[i][headers.indexOf(h)]));
      sheet.getRange(i+1,1,1,headers.length).setValues([row]);
      return {ok:true,message:"อัปเดตรายงานวันที่ "+dateStr};
    }
  }
  sheet.appendRow(headers.map(h=>h==="saved_at"?new Date():(p[h]||"")));
  return {ok:true,message:"บันทึกรายงานวันที่ "+dateStr};
}

// ===== SETUP =====
function runSetup() {
  const ss_obj=ss();
  function ensure(name,hdr){let sh=ss_obj.getSheetByName(name);if(!sh){sh=ss_obj.insertSheet(name);}if(sh.getLastRow()===0)sh.appendRow(hdr);return sh;}
  ensure(SHEET_STATIONS,["station_id","name","river","village","amphoe","lat","lon","bank_level","warn_level","crit_level","active"]);
  ensure(SHEET_WATER,   ["station_id","date","time","level","flow","recorder","remark"]);
  ensure(SHEET_RAIN,    ["station_id","amphoe","date","rain_24hr","rain_7day","rain_month","recorder","remark"]);
  ensure(SHEET_RESERVOIR,RESERVOIR_HEADERS);
  ensure(SHEET_SETTINGS,["key","value"]);
  const stSh=ss_obj.getSheetByName(SHEET_STATIONS);
  if(stSh.getLastRow()<=1){
    [["PN01","วังปลาป้อม","ลำน้ำพะเนียง","บ้านโคกเจริญ","นาวัง",17.42065,101.99304,290.0,289.5,290.0,true],
     ["PN02","โคกกระทอ","ลำน้ำพะเนียง","บ้านโคกกระทอ","นาวัง",17.34314,102.07167,266.0,265.5,266.0,true],
     ["PN03","วังสามหาบ","ลำน้ำพะเนียง","บ้านวังสามหาบ","นาวัง",17.30990,102.10789,258.0,257.5,258.0,true],
     ["PN04","บ้านหนองด่าน","ลำน้ำพะเนียง","บ้านหนองด่าน","นากลาง",17.27936,102.16552,249.0,248.5,249.0,true],
     ["PN05","บ้านฝั่งแดง","ลำน้ำพะเนียง","บ้านฝั่งแดง","นากลาง",17.26730,102.22728,237.0,236.5,237.0,true],
     ["PN06","ปตร.หนองหว้าใหญ่","ลำน้ำพะเนียง","บ้านหนองหว้าใหญ่","เมืองหนองบัวลำภู",17.17981,102.38617,216.0,215.5,216.0,true],
     ["PN07","วังหมื่น","ลำน้ำพะเนียง","บ้านวังหมื่น","เมืองหนองบัวลำภู",17.18317,102.43244,210.0,209.5,210.0,true],
     ["PN08","ปตร.ปู่หลอด","ลำน้ำพะเนียง","บ้านโนนคูณ","เมืองหนองบัวลำภู",17.11487,102.45435,203.0,202.5,203.0,true],
     ["PN09","บ้านข้องโป้","ลำน้ำพะเนียง","บ้านข้องโป้","เมืองหนองบัวลำภู",17.08217,102.45068,201.0,200.5,201.0,true],
     ["PN10","ปตร.หัวนา","ลำน้ำพะเนียง","บ้านดอนหัน","เมืองหนองบัวลำภู",17.00067,102.42400,191.0,190.5,191.0,true],
     ["MG01","คลองบุญทัน","ลำน้ำโมง","บ้านบุญทัน","สุวรรณคูหา",17.54512,102.16832,231.0,230.5,231.0,true],
     ["MG02","บ้านโคก","ลำน้ำโมง","บ้านโคก","สุวรรณคูหา",17.54952,102.20425,218.0,217.5,218.0,true],
    ].forEach(r=>stSh.appendRow(r));
  }
  const resSh=ss_obj.getSheetByName(SHEET_RESERVOIR);
  if(resSh.getLastRow()<=1){
    const today=Utilities.formatDate(new Date(),"Asia/Bangkok","yyyy-MM-dd");
    [["R01","ห้วยยางเงาะ","เมืองหนองบัวลำภู",0.400,0.240],["R02","ห้วยซับม่วง","ศรีบุญเรือง",0.750,0.450],
     ["R03","ห้วยเหล่ายาง","เมืองหนองบัวลำภู",2.469,1.481],["R04","อ่างน้ำบอง","โนนสัง",20.800,9.984],
     ["R05","ห้วยสนามชัย","นากลาง",0.330,0.198],["R06","ผาวัง","นาวัง",2.122,1.273],
     ["R07","ห้วยลาดกั่ว","นาวัง",0.842,0.505],["R08","ห้วยโซ่","สุวรรณคูหา",1.430,0.858],
     ["R09","ห้วยไร่ 1","นากลาง",0.200,0.120],["R10","ห้วยไร่ 2","นากลาง",0.695,0.417],
     ["R11","ห้วยลำใย","นากลาง",0.450,0.270],["R12","ห้วยโป่งซาง","นากลาง",0.300,0.180],
     ["R13","ห้วยบ้านคลองเจริญ","สุวรรณคูหา",0.623,0.374],["R14","ผาจ้ำน้ำ","นาวัง",0.085,0.051],
    ].forEach(d=>resSh.appendRow([d[0],d[1],d[2],d[3],d[4],today,"ระบบ",new Date()]));
  }
  Logger.log("Setup complete ✅");
}

// ===== HELPERS =====
function getOrCreateReservoirSheet(){const ss_obj=ss();let sh=ss_obj.getSheetByName(SHEET_RESERVOIR);if(!sh){sh=ss_obj.insertSheet(SHEET_RESERVOIR);sh.appendRow(RESERVOIR_HEADERS);}if(sh.getLastRow()===0||sh.getLastColumn()===0)sh.appendRow(RESERVOIR_HEADERS);return sh;}
function normalizeReservoirPayload(p){return{reservoir_id:p.reservoir_id||p.id||"",reservoir_name:p.reservoir_name||p.name||"",amphoe:p.amphoe||"",capacity:toNum(p.capacity),current_volume:toNum(p.current_volume!==undefined?p.current_volume:p.current),date:p.date||Utilities.formatDate(new Date(),"Asia/Bangkok","yyyy-MM-dd"),reporter:p.reporter||"",updated_at:new Date()};}
function toNum(v){if(v===""||v===null||v===undefined)return "";const n=parseFloat(v);return isNaN(n)?"":n;}
function headerIndex(headers,names){for(let i=0;i<names.length;i++){const idx=headers.indexOf(names[i]);if(idx>=0)return idx;}return -1;}
function ss(){return SpreadsheetApp.getActiveSpreadsheet();}
function getHeaders(sheet){return sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];}
function sheetToObjects(sheet){if(!sheet)return[];const data=sheet.getDataRange().getValues();if(data.length<2)return[];const headers=data[0];return data.slice(1).map(row=>{const obj={};headers.forEach((h,i)=>{let v=row[i];if(v instanceof Date)v=Utilities.formatDate(v,"Asia/Bangkok","yyyy-MM-dd");obj[h]=v;});return obj;}).filter(o=>Object.values(o).some(v=>v!==""&&v!==null&&v!==undefined));}
function parseDate(v){if(!v)return null;if(v instanceof Date)return v;const d=new Date(v);return isNaN(d.getTime())?null:d;}
function respond(data,callback){const json=JSON.stringify(data);if(callback)return ContentService.createTextOutput(callback+"("+json+");").setMimeType(ContentService.MimeType.JAVASCRIPT);return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);}
function getAppPin(){return String(PropertiesService.getScriptProperties().getProperty(PIN_PROPERTY_KEY)||"").trim();}
function installDefaultPinForSetup(){PropertiesService.getScriptProperties().setProperty(PIN_PROPERTY_KEY,"123456");Logger.log("ตั้งค่า APP_PIN เริ่มต้นแล้ว ควรเปลี่ยนก่อนใช้งานจริง");}

// ===== TEST =====
function testPin(){Logger.log(getAppPin()?"✅ ตั้งค่า APP_PIN แล้ว":"❌ ยังไม่ได้ตั้งค่า APP_PIN");}
function testGetSummary(){Logger.log(JSON.stringify(getSummary(),null,2));}
function testGetReservoirs(){Logger.log(JSON.stringify(getReservoirs(),null,2));}
