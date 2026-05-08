/**
 * map-layers.js v4 — Real Reservoir Data (14 แห่ง) จาก Nb.xls
 * โครงการชลประทานหนองบัวลำภู — สำนักงานชลประทานที่ 5
 *
 * Layers:
 *   1. province_overlay   — พื้นที่จังหวัดสีอ่อน
 *   2. amphoe_choropleth  — ขอบเขต 6 อำเภอ + choropleth
 *   3. reservoir14        — อ่างเก็บน้ำ 14 แห่ง (พิกัดจริง)
 *   4. pump_station       — สถานีสูบน้ำ/ปตร. จาก OSM
 */

(function () {
  "use strict";

  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
  ];
  const BBOX = "16.85,101.95,17.70,102.75";

  /* =================================================================
   *  ข้อมูลอ่างเก็บน้ำ 14 แห่ง (จาก Nb.xls)
   *  current = ปริมาณน้ำปัจจุบัน — เชื่อม API เพื่ออัปเดตค่าจริง
   * ================================================================= */
  const RESERVOIRS_14 = [
    { no:1,  name:"ห้วยยางเงาะ",       fullname:"อ่างเก็บน้ำห้วยยางเงาะ",
      village:"ถ้ำกลองเพล",  tambon:"โนนทัน",      amphoe:"เมืองหนองบัวลำภู",
      lat:17.22588,  lon:102.518152, type:"เล็ก พระราชดำริ",  capacity:0.400, current:0.280, benefit_area:700,   irrig_area:0,    year:2525 },
    { no:2,  name:"ห้วยซับม่วง",        fullname:"อ่างเก็บน้ำห้วยซับม่วง",
      village:"หนองกุงแก้ว", tambon:"หนองกุงแก้ว", amphoe:"ศรีบุญเรือง",
      lat:17.14711,  lon:102.090722, type:"เล็ก เงินกู้ KEW", capacity:0.750, current:0.520, benefit_area:0,     irrig_area:1056, year:2532 },
    { no:3,  name:"ห้วยเหล่ายาง",       fullname:"อ่างเก็บน้ำห้วยเหล่ายาง",
      village:"ภูพานทอง",    tambon:"หนองบัว",      amphoe:"เมืองหนองบัวลำภู",
      lat:17.2376,   lon:102.4625,   type:"กลาง พระราชดำริ",  capacity:2.469, current:1.650, benefit_area:2000,  irrig_area:0,    year:2534 },
    { no:4,  name:"ห้วยน้ำบอง",         fullname:"อ่างเก็บน้ำบอง (ห้วยน้ำบอง)",
      village:"ตาดไฮ",       tambon:"โคกม่วง",      amphoe:"โนนสัง",
      lat:16.907122, lon:102.417037, type:"กลาง พระราชดำริ",  capacity:20.800,current:14.200,benefit_area:15949, irrig_area:0,    year:2560 },
    { no:5,  name:"ห้วยสนามชัย",        fullname:"อ่างเก็บน้ำห้วยสนามชัย",
      village:"สนามชัย",     tambon:"กุดแห่",        amphoe:"นากลาง",
      lat:17.4341,   lon:102.13761,  type:"เล็ก พระราชดำริ",  capacity:0.330, current:0.210, benefit_area:1000,  irrig_area:0,    year:2527 },
    { no:6,  name:"ผาวัง",              fullname:"อ่างเก็บน้ำผาวัง",
      village:"โคกนาเหล่า",  tambon:"นาเหล่า",      amphoe:"นาวัง",
      lat:17.3087,   lon:102.0433,   type:"เล็ก เงินกู้ KEW", capacity:2.122, current:1.350, benefit_area:0,     irrig_area:2350, year:2531 },
    { no:7,  name:"ห้วยลาดกั่ว",        fullname:"อ่างเก็บน้ำห้วยลาดกั่ว",
      village:"นาแก",         tambon:"นาแก",          amphoe:"นาวัง",
      lat:17.4061,   lon:102.07699,  type:"เล็ก เงินกู้ KEW", capacity:0.842, current:0.560, benefit_area:0,     irrig_area:1050, year:2531 },
    { no:8,  name:"ห้วยโซ่",            fullname:"อ่างเก็บน้ำห้วยโซ่",
      village:"โคกนกพัฒนา",  tambon:"บุญทัน",        amphoe:"สุวรรณคูหา",
      lat:17.6032,   lon:102.11548,  type:"เล็ก พระราชดำริ",  capacity:1.430, current:1.430, benefit_area:800,   irrig_area:700,  year:2534 },
    { no:9,  name:"ห้วยไร่ 1",          fullname:"อ่างเก็บน้ำห้วยไร่ 1",
      village:"โนนธาตุพัฒนา",tambon:"ดงสวรรค์",     amphoe:"นากลาง",
      lat:17.4827,   lon:102.17845,  type:"คจก.",             capacity:0.200, current:0.140, benefit_area:0,     irrig_area:400,  year:2535 },
    { no:10, name:"ห้วยไร่ 2",          fullname:"อ่างเก็บน้ำห้วยไร่ 2",
      village:"สระแก้ว",      tambon:"ดงสวรรค์",     amphoe:"นากลาง",
      lat:17.4631,   lon:102.21227,  type:"คจก.",             capacity:0.695, current:0.480, benefit_area:0,     irrig_area:700,  year:2535 },
    { no:11, name:"ห้วยลำใย",           fullname:"อ่างเก็บน้ำห้วยลำใย",
      village:"เกษมมณี",     tambon:"ดงสวรรค์",     amphoe:"นากลาง",
      lat:17.4455,   lon:102.2266,   type:"คจก.",             capacity:0.450, current:0.300, benefit_area:0,     irrig_area:500,  year:2535 },
    { no:12, name:"ห้วยโป่งซาง",        fullname:"อ่างเก็บน้ำห้วยโป่งซาง",
      village:"ป่าแดงงาม",   tambon:"กุดแห่",        amphoe:"นากลาง",
      lat:17.3944,   lon:102.17153,  type:"เล็ก พระราชดำริ",  capacity:0.300, current:0.210, benefit_area:200,   irrig_area:0,    year:2536 },
    { no:13, name:"ห้วยบ้านคลองเจริญ", fullname:"อ่างเก็บน้ำห้วยบ้านคลองเจริญ",
      village:"คลองเจริญ",   tambon:"บุญทัน",        amphoe:"สุวรรณคูหา",
      lat:17.5988,   lon:102.14758,  type:"เล็ก พระราชดำริ",  capacity:0.623, current:0.623, benefit_area:0,     irrig_area:700,  year:2536 },
    { no:14, name:"ผาจ้ำน้ำ",           fullname:"อ่างเก็บน้ำผาจ้ำน้ำ",
      village:"ภูเขาวง",     tambon:"เทพคีรี",      amphoe:"นาวัง",
      lat:17.2638,   lon:102.11873,  type:"เล็ก พระราชดำริ",  capacity:0.085, current:0.062, benefit_area:0,     irrig_area:400,  year:2555 },
  ];

  /* ปตร./สถานีสูบน้ำ fallback (จากแผนที่ชลประทาน) */
  const PUMP_FALLBACK = [
    { name:"ปตร.หนองหว้าใหญ่",           type:"ประตูระบายน้ำ", lat:17.17981,  lon:102.38617 },
    { name:"ปตร.ลำพะเนียงหลวงปู่หลอด",   type:"ประตูระบายน้ำ", lat:17.11487,  lon:102.45435 },
    { name:"ปตร.ลำพะเนียงบ้านหัวนา",     type:"ประตูระบายน้ำ", lat:17.00067,  lon:102.42400 },
    { name:"สถานีวัดน้ำ E68A",            type:"สถานีวัดน้ำ",   lat:17.10500,  lon:102.46000 },
  ];

  const CACHE_KEY_PUMP = "nbp_pump_v3";
  const CACHE_TTL      = 30 * 24 * 60 * 60 * 1000;

  let boundaryData = null;
  async function loadBoundaries() {
    if (boundaryData) return boundaryData;
    if (window.NBP_AMPHOE_BOUNDARIES && window.NBP_PROVINCE_BOUNDARY) {
      boundaryData = { amphoe_boundaries: window.NBP_AMPHOE_BOUNDARIES, province_boundary: window.NBP_PROVINCE_BOUNDARY };
      return boundaryData;
    }
    try {
      const res = await fetch("nbp_boundaries.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      boundaryData = await res.json();
      return boundaryData;
    } catch (e) { console.warn("[map-layers] boundary load failed:", e); return null; }
  }

  /* ------------------------------------------------------------------ */
  function MapLayers(map) {
    this.map = map;
    this.layers  = { province_overlay:null, amphoe_choropleth:null, amphoeLabels:null, reservoir14:null, reservoirLabels:null, pump_station:null, pumpLabels:null };
    this.visible = { province_overlay:false, amphoe_choropleth:false, reservoir14:false, pump_station:false };
    this.choroplethDim  = "rain";
    this.choroplethData = {};
  }

  function chColor(v, dim) {
    if (v == null || isNaN(v)) return "#f1f5f9";
    if (dim === "rain")      return v<0.1?"#f8fafc":v<=10?"#dbeafe":v<=35?"#93c5fd":v<=90?"#3b82f6":"#1e40af";
    if (dim === "reservoir") return v<30?"#fee2e2":v<50?"#fef3c7":v<80?"#bfdbfe":"#06b6d4";
    if (dim === "risk")      return v<25?"#dcfce7":v<50?"#fef3c7":v<75?"#fed7aa":"#fecaca";
    return "#f1f5f9";
  }

  /* 1. Province overlay */
  MapLayers.prototype.renderProvinceOverlay = async function () {
    if (this.layers.province_overlay) return;
    const data = await loadBoundaries();
    if (!data?.province_boundary) return;
    const lyr = L.geoJSON(data.province_boundary, {
      style:{ color:"#0c4a6e",weight:2.5,opacity:.9,fillColor:"#bae6fd",fillOpacity:.18,dashArray:"10,5" },
      interactive:false,
    });
    const lbl = L.marker([17.27,102.30],{ icon:L.divIcon({className:"ml-province-label",html:"<span>🏞️ จังหวัดหนองบัวลำภู</span>",iconSize:null}),interactive:false });
    this.layers.province_overlay = L.layerGroup([lyr,lbl]);
  };

  /* 2. Amphoe choropleth */
  MapLayers.prototype.renderChoropleth = async function () {
    if (this.layers.amphoe_choropleth) return;
    const data = await loadBoundaries();
    if (!data?.amphoe_boundaries) return;
    const self = this;
    const lyr = L.geoJSON(data.amphoe_boundaries, {
      style: f => ({ color:"#0c4a6e",weight:2,opacity:.85,fillColor:chColor(self.choroplethData[f.properties.code],self.choroplethDim),fillOpacity:.55 }),
      onEachFeature(f, l) {
        const name = f.properties.name, code = f.properties.code;
        l.bindTooltip("อ."+name,{sticky:true,className:"ml-tooltip",direction:"top"});
        l.bindPopup(()=>{
          const v = self.choroplethData[code];
          const dimName = {rain:"ปริมาณฝน 24 ชม.",reservoir:"% เก็บน้ำเฉลี่ย",risk:"ความเสี่ยงน้ำท่วม"}[self.choroplethDim];
          const vStr = self.choroplethDim==="rain" ? (v||0).toFixed(1)+" มม." : (v||0).toFixed(0)+"%";
          return `<div class="ml-pop"><div class="ml-pop-title">อ.${name}</div><div class="ml-pop-stat"><div class="ml-pop-pct">${vStr}</div></div><div class="ml-pop-detail">${dimName}</div></div>`;
        });
        l.on("mouseover",function(){this.setStyle({fillOpacity:.78,weight:3});});
        l.on("mouseout", function(){this.setStyle({fillOpacity:.55,weight:2});});
      },
    });
    this.layers.amphoe_choropleth = lyr;
    const lblG = L.layerGroup();
    data.amphoe_boundaries.features.forEach(f => {
      let cy,cx;
      if (f.properties.centroid){ cy=f.properties.centroid[0]; cx=f.properties.centroid[1]; }
      else { const c=f.geometry.coordinates[0]; cx=c.reduce((a,p)=>a+p[0],0)/c.length; cy=c.reduce((a,p)=>a+p[1],0)/c.length; }
      lblG.addLayer(L.marker([cy,cx],{icon:L.divIcon({className:"ml-amphoe-label",html:`<span>อ.${f.properties.name}</span>`,iconSize:null}),interactive:false}));
    });
    this.layers.amphoeLabels = lblG;
  };

  MapLayers.prototype.setChoroplethDimension = function (dim, data) {
    this.choroplethDim = dim;
    if (data) this.choroplethData = data;
    if (this.layers.amphoe_choropleth && this.visible.amphoe_choropleth) {
      const self = this;
      this.layers.amphoe_choropleth.setStyle(f=>({fillColor:chColor(self.choroplethData[f.properties.code],self.choroplethDim),fillOpacity:.55,color:"#0c4a6e",weight:2,opacity:.85}));
    }
  };

  /* 3. Reservoirs 14 */
  function resStatus(pct) {
    if (pct >= 90) return { color:"#0891b2", label:"เกือบเต็ม/เต็ม" };
    if (pct >= 60) return { color:"#16a34a", label:"ปกติ" };
    if (pct >= 30) return { color:"#f59e0b", label:"เฝ้าระวัง" };
    return             { color:"#dc2626", label:"น้ำน้อย" };
  }

  function makeResIcon(pct) {
    const st = resStatus(pct);
    return L.divIcon({
      className:"ml-reservoir-marker",
      html:`<div class="ml-res-wrap">
        <div class="ml-res-pin" style="background:${st.color};">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>
        </div>
        <div class="ml-res-pct" style="background:${st.color};">${Math.round(pct)}%</div>
      </div>`,
      iconSize:[44,56], iconAnchor:[22,50],
    });
  }

  MapLayers.prototype.renderReservoirs14 = function () {
    if (this.layers.reservoir14) return;
    const lyr = L.layerGroup(), lblG = L.layerGroup();
    RESERVOIRS_14.forEach(r => {
      const pct = (r.current / r.capacity) * 100;
      const st  = resStatus(pct);
      const area = r.benefit_area > 0 ? `พื้นที่รับประโยชน์: ${r.benefit_area.toLocaleString()} ไร่` :
                   r.irrig_area > 0   ? `พื้นที่ชลประทาน: ${r.irrig_area.toLocaleString()} ไร่`   : "";
      const m = L.marker([r.lat,r.lon],{icon:makeResIcon(pct),zIndexOffset:200});
      m.bindTooltip(r.name,{direction:"top",offset:[0,-52],className:"ml-tooltip"});
      m.bindPopup(`<div class="ml-pop">
        <div class="ml-pop-title">💧 ${r.fullname}</div>
        <div class="ml-pop-type">บ.${r.village} ต.${r.tambon} · อ.${r.amphoe}</div>
        <div class="ml-pop-type" style="color:#94a3b8;font-size:10px;">${r.type} · สร้างเสร็จ พ.ศ.${r.year}</div>
        <div class="ml-pop-stat" style="color:${st.color};">
          <div class="ml-pop-pct">${pct.toFixed(0)}%</div>
          <div class="ml-pop-lbl">${st.label}</div>
        </div>
        <div class="ml-pop-detail">
          ปริมาณน้ำ: ${r.current.toFixed(3)} / ${r.capacity.toFixed(3)} ล้าน ลบ.ม.
          ${area ? "<br>" + area : ""}
        </div>
        <a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}" target="_blank">📍 Google Maps</a>
      </div>`);
      lyr.addLayer(m);
      lblG.addLayer(L.marker([r.lat,r.lon],{icon:L.divIcon({className:"ml-poi-label ml-poi-label-reservoir",html:`<span>💧 ${r.name}</span>`,iconSize:null}),interactive:false,zIndexOffset:100}));
    });
    this.layers.reservoir14      = lyr;
    this.layers.reservoirLabels  = lblG;
    lyr._totalCount = RESERVOIRS_14.length;
  };

  /* 4. Pump stations */
  function makePumpIcon() {
    return L.divIcon({
      className:"ml-pump-marker",
      html:`<div class="ml-pump-wrap"><div class="ml-pump-pin">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="9" width="13" height="10" rx="1"/>
          <path d="M16 12h3l2 -2v6l-2 -2h-3"/><circle cx="9.5" cy="14" r="2.5"/>
        </svg></div></div>`,
      iconSize:[34,42], iconAnchor:[17,38],
    });
  }

  MapLayers.prototype.loadPumpStations = async function () {
    try { const c=localStorage.getItem(CACHE_KEY_PUMP); if(c){const {data,ts}=JSON.parse(c);if(Date.now()-ts<CACHE_TTL)return data;} } catch(e){}
    const q=`[out:json][timeout:25];(
      node["man_made"="pumping_station"](${BBOX});
      node["waterway"="sluice_gate"](${BBOX});
      node["waterway"="dam"](${BBOX});
      node["waterway"="weir"](${BBOX});
      node["waterway"="floodgate"](${BBOX});
    );out center;`;
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(q)});
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.elements) { try{localStorage.setItem(CACHE_KEY_PUMP,JSON.stringify({data,ts:Date.now()}));}catch(e){} return data; }
      } catch(e) {}
    }
    return null;
  };

  MapLayers.prototype.renderPumpStations = async function () {
    if (this.layers.pump_station) return;
    const lyr = L.layerGroup(), lblG = L.layerGroup();
    const data = await this.loadPumpStations();
    let stations = PUMP_FALLBACK;
    if (data?.elements?.length) {
      const osm = data.elements.filter(e=>e.lat&&e.lon).map(e=>{
        const t=e.tags||{};
        let type="สถานีสูบน้ำ";
        if(t.waterway==="sluice_gate"||t.waterway==="floodgate") type="ประตูระบายน้ำ";
        else if(t.waterway==="dam")  type="เขื่อน/ฝาย";
        else if(t.waterway==="weir") type="ฝาย";
        return {name:t["name:th"]||t.name||"(ไม่มีชื่อ)",type,operator:t.operator||"",lat:e.lat,lon:e.lon};
      });
      if (osm.length > 0) stations = osm;
    }
    stations.forEach(s=>{
      const m=L.marker([s.lat,s.lon],{icon:makePumpIcon(),zIndexOffset:150});
      m.bindTooltip(s.name,{direction:"top",offset:[0,-40],className:"ml-tooltip"});
      m.bindPopup(`<div class="ml-pop"><div class="ml-pop-title">⚙️ ${s.name}</div><div class="ml-pop-type">${s.type}${s.operator?" · "+s.operator:""}</div><a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}" target="_blank">📍 Google Maps</a></div>`);
      lyr.addLayer(m);
      lblG.addLayer(L.marker([s.lat,s.lon],{icon:L.divIcon({className:"ml-poi-label ml-poi-label-pump",html:`<span>⚙️ ${s.name}</span>`,iconSize:null}),interactive:false,zIndexOffset:50}));
    });
    this.layers.pump_station = lyr;
    this.layers.pumpLabels   = lblG;
    lyr._totalCount = stations.length;
  };

  /* Toggle */
  MapLayers.prototype.toggle = async function (type, on) {
    on = !!on;
    if (type === "reservoir12") type = "reservoir14"; // backward compat

    if (on && !this.layers[type]) {
      if      (type==="province_overlay")   await this.renderProvinceOverlay();
      else if (type==="amphoe_choropleth")  await this.renderChoropleth();
      else if (type==="reservoir14")        this.renderReservoirs14();
      else if (type==="pump_station")       await this.renderPumpStations();
    }
    const lyr = this.layers[type];
    if (!lyr) return;

    if (on && !this.visible[type]) {
      lyr.addTo(this.map);
      if (type==="province_overlay" && lyr.bringToBack) lyr.bringToBack();
      if (type==="amphoe_choropleth") { if(lyr.bringToBack)lyr.bringToBack(); if(this.layers.amphoeLabels)this.layers.amphoeLabels.addTo(this.map); }
      if (type==="reservoir14"  && this.layers.reservoirLabels) this.layers.reservoirLabels.addTo(this.map);
      if (type==="pump_station" && this.layers.pumpLabels)      this.layers.pumpLabels.addTo(this.map);
      this.visible[type] = true;
    } else if (!on && this.visible[type]) {
      this.map.removeLayer(lyr);
      if (type==="amphoe_choropleth" && this.layers.amphoeLabels)    this.map.removeLayer(this.layers.amphoeLabels);
      if (type==="reservoir14"       && this.layers.reservoirLabels) this.map.removeLayer(this.layers.reservoirLabels);
      if (type==="pump_station"      && this.layers.pumpLabels)      this.map.removeLayer(this.layers.pumpLabels);
      this.visible[type] = false;
    }
  };

  /* CSS */
  (function injectCSS() {
    if (document.getElementById("ml-css-v4")) return;
    const s = document.createElement("style"); s.id = "ml-css-v4";
    s.textContent = `
      .ml-province-label{background:transparent!important;border:none!important;pointer-events:none;}
      .ml-province-label span{display:inline-block;font-family:'Sarabun',sans-serif;font-size:18px;font-weight:800;color:#0c4a6e;background:rgba(255,255,255,.6);padding:6px 18px;border-radius:30px;border:2px solid rgba(12,74,110,.25);transform:translate(-50%,-50%);white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,.8);letter-spacing:1px;opacity:.7;}
      .ml-amphoe-label{background:transparent!important;border:none!important;pointer-events:none;}
      .ml-amphoe-label span{display:inline-block;font-family:'Sarabun',sans-serif;font-size:13px;font-weight:700;color:#0c4a6e;background:rgba(255,255,255,.92);padding:3px 10px;border-radius:6px;border:1px solid rgba(12,74,110,.2);transform:translate(-50%,-50%);white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.1);}
      .ml-reservoir-marker{background:transparent!important;border:none!important;}
      .ml-res-wrap{display:flex;flex-direction:column;align-items:center;}
      .ml-res-pin{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.35),0 0 0 3px #fff;transition:transform .15s;}
      .ml-res-pin svg{width:20px;height:20px;}
      .ml-reservoir-marker:hover .ml-res-pin{transform:scale(1.18);}
      .ml-res-pct{margin-top:-4px;color:#fff;font-family:'Sarabun',sans-serif;font-size:10px;font-weight:700;padding:1px 8px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.25),0 0 0 1.5px #fff;line-height:1.4;}
      .ml-pump-marker{background:transparent!important;border:none!important;}
      .ml-pump-wrap{display:flex;flex-direction:column;align-items:center;}
      .ml-pump-pin{width:34px;height:34px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.3),0 0 0 2.5px #fff;transition:transform .15s;transform:rotate(-8deg);}
      .ml-pump-pin svg{width:20px;height:20px;transform:rotate(8deg);}
      .ml-pump-marker:hover .ml-pump-pin{transform:rotate(0) scale(1.15);}
      .ml-poi-label{background:transparent!important;border:none!important;pointer-events:none;}
      .ml-poi-label span{display:inline-block;font-family:'Sarabun',sans-serif;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;transform:translate(-50%,4px);box-shadow:0 1px 3px rgba(0,0,0,.18);}
      .ml-poi-label-reservoir span{background:rgba(255,255,255,.95);color:#075985;border:1px solid #7dd3fc;}
      .ml-poi-label-pump span{background:rgba(255,255,255,.95);color:#5b21b6;border:1px solid #c4b5fd;}
      .ml-tooltip{background:#fff!important;border:1px solid #e2e8f0!important;color:#0f172a!important;font-family:'Sarabun',sans-serif!important;font-size:12px!important;font-weight:600!important;padding:4px 9px!important;border-radius:6px!important;box-shadow:0 2px 8px rgba(0,0,0,.12)!important;}
      .ml-tooltip::before{display:none!important;}
      .ml-pop{font-family:'Sarabun',sans-serif;min-width:210px;}
      .ml-pop-title{font-size:14px;font-weight:700;color:#0c4a6e;margin-bottom:4px;}
      .ml-pop-type{font-size:11px;color:#64748b;margin-bottom:2px;}
      .ml-pop-stat{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-top:1px dashed #e2e8f0;margin-top:6px;}
      .ml-pop-pct{font-size:22px;font-weight:700;}
      .ml-pop-lbl{font-size:12px;font-weight:600;}
      .ml-pop-detail{font-size:11px;color:#64748b;margin-top:2px;line-height:1.5;}
      .ml-pop-link{display:inline-block;margin-top:8px;font-size:11px;color:#0284c7;text-decoration:none;padding:4px 10px;background:#f0f9ff;border-radius:5px;border:1px solid #bae6fd;}
      .ml-pop-link:hover{background:#e0f2fe;}
      [data-theme="dark"] .ml-amphoe-label span,[data-theme="dark"] .ml-province-label span{background:rgba(30,41,59,.95);color:#bae6fd;border-color:#475569;}
      [data-theme="dark"] .ml-poi-label-reservoir span,[data-theme="dark"] .ml-poi-label-pump span{background:rgba(30,41,59,.95);color:#e2e8f0;border-color:#475569;}
    `;
    document.head.appendChild(s);
  })();

  window.MapLayers        = MapLayers;
  window.RESERVOIRS_14_DATA = RESERVOIRS_14;
  window.RESERVOIRS_12_DATA = RESERVOIRS_14; // backward compat alias
})();
