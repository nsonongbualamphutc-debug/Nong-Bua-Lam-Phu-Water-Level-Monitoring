/**
 * map-layers.js — Map Layers Loader (สเตป B3)
 * โหลดชั้นข้อมูล: ขอบเขตอำเภอ, โรงพยาบาล, ที่ว่าการอำเภอ, ศูนย์อพยพ, อ่างเก็บน้ำ, ถนนหลัก
 * ใช้ OSM Overpass API + fallback hardcoded data
 *
 * Usage:
 *   const layers = new MapLayers(map);
 *   layers.toggle('amphoe', true);
 *   layers.toggle('hospital', true);
 */

(function(){
  "use strict";

  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];

  // Bbox ของจังหวัดหนองบัวลำภู
  const BBOX = "16.95,101.95,17.65,102.75";

  // ====== Hardcoded fallback ที่ ว่าการอำเภอ + โรงพยาบาล + อ่างเก็บน้ำหลัก ======
  const FALLBACK = {
    amphoe_centers: [
      { name: "ที่ว่าการอำเภอเมืองหนองบัวลำภู", lat: 17.2046, lon: 102.4366, type: "amphoe_office" },
      { name: "ที่ว่าการอำเภอนาวัง",            lat: 17.3580, lon: 102.0480, type: "amphoe_office" },
      { name: "ที่ว่าการอำเภอนากลาง",           lat: 17.2615, lon: 102.1730, type: "amphoe_office" },
      { name: "ที่ว่าการอำเภอศรีบุญเรือง",      lat: 17.0464, lon: 102.3380, type: "amphoe_office" },
      { name: "ที่ว่าการอำเภอสุวรรณคูหา",       lat: 17.4850, lon: 102.2200, type: "amphoe_office" },
      { name: "ที่ว่าการอำเภอโนนสัง",           lat: 17.0530, lon: 102.6600, type: "amphoe_office" },
    ],
    hospitals: [
      { name: "โรงพยาบาลหนองบัวลำภู",         lat: 17.2065, lon: 102.4380, type: "hospital", level: "general" },
      { name: "โรงพยาบาลนากลาง",              lat: 17.2640, lon: 102.1750, type: "hospital", level: "community" },
      { name: "โรงพยาบาลศรีบุญเรือง",          lat: 17.0470, lon: 102.3400, type: "hospital", level: "community" },
      { name: "โรงพยาบาลสุวรรณคูหา",           lat: 17.4860, lon: 102.2210, type: "hospital", level: "community" },
      { name: "โรงพยาบาลโนนสัง",              lat: 17.0540, lon: 102.6620, type: "hospital", level: "community" },
      { name: "โรงพยาบาลนาวัง",                lat: 17.3590, lon: 102.0490, type: "hospital", level: "community" },
    ],
    reservoirs: [
      { name: "อ่างเก็บน้ำห้วยน้ำบอง",  lat: 17.380, lon: 102.165, capacity: 11.77, current: 6.66 },
      { name: "อ่างเก็บน้ำห้วยทราย",   lat: 17.255, lon: 102.310, capacity: 0.62,  current: 0.40 },
      { name: "อ่างเก็บน้ำห้วยเหล่ายาง", lat: 17.170, lon: 102.480, capacity: 1.62,  current: 1.06 },
      { name: "อ่างเก็บน้ำห้วยลำควาย",  lat: 17.150, lon: 102.250, capacity: 25.83, current: 23.0 },
      { name: "อ่างเก็บน้ำห้วยลาดกั่ว",  lat: 17.330, lon: 102.080, capacity: 0.47,  current: 0.26 },
      { name: "อ่างเก็บน้ำห้วยพังโต",   lat: 17.300, lon: 102.060, capacity: 1.09,  current: 0.56 },
    ],
    shelters: [
      // ศูนย์อพยพ - ใช้ที่ว่าการอำเภอ + วัดใหญ่ + โรงเรียน
      { name: "ศูนย์อพยพชั่วคราว ที่ว่าการ อ.เมือง", lat: 17.2050, lon: 102.4370, type: "shelter" },
      { name: "ศูนย์อพยพชั่วคราว ที่ว่าการ อ.โนนสัง", lat: 17.0535, lon: 102.6605, type: "shelter" },
      { name: "ศูนย์อพยพชั่วคราว ที่ว่าการ อ.ศรีบุญเรือง", lat: 17.0468, lon: 102.3385, type: "shelter" },
    ],
    // ขอบเขตจังหวัดแบบประมาณ - polygon คร่าวๆ ของหนองบัวลำภู (ไม่ละเอียดเหมือน shapefile จริง)
    // โครงสร้างนี้ทดแทนได้ด้วยข้อมูลจาก HDX/mapcruzin ภายหลัง
    province_boundary: {
      type: "Feature",
      properties: { name: "หนองบัวลำภู" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [101.97, 17.62],[102.05, 17.65],[102.18, 17.62],[102.30, 17.55],
          [102.40, 17.45],[102.55, 17.40],[102.68, 17.30],[102.72, 17.15],
          [102.70, 17.00],[102.60, 16.95],[102.45, 16.97],[102.32, 17.00],
          [102.20, 17.05],[102.05, 17.10],[101.95, 17.25],[101.93, 17.42],
          [101.97, 17.62]
        ]]
      }
    },
    amphoe_boundaries: {
      type: "FeatureCollection",
      features: [
        // ขอบอำเภอแบบหยาบมาก - แทนที่ด้วย shapefile ที่อัปโหลด GeoJSON ภายหลังได้
        {
          type: "Feature",
          properties: { name: "เมืองหนองบัวลำภู" },
          geometry: { type: "Polygon", coordinates: [[
            [102.30, 17.30],[102.45, 17.32],[102.55, 17.25],[102.55, 17.10],
            [102.42, 17.05],[102.30, 17.10],[102.25, 17.20],[102.30, 17.30]
          ]]}
        },
        {
          type: "Feature",
          properties: { name: "นาวัง" },
          geometry: { type: "Polygon", coordinates: [[
            [101.97, 17.62],[102.10, 17.55],[102.15, 17.40],[102.05, 17.30],
            [101.95, 17.35],[101.93, 17.50],[101.97, 17.62]
          ]]}
        },
        {
          type: "Feature",
          properties: { name: "นากลาง" },
          geometry: { type: "Polygon", coordinates: [[
            [102.10, 17.55],[102.25, 17.50],[102.30, 17.30],[102.20, 17.22],
            [102.10, 17.30],[102.05, 17.45],[102.10, 17.55]
          ]]}
        },
        {
          type: "Feature",
          properties: { name: "ศรีบุญเรือง" },
          geometry: { type: "Polygon", coordinates: [[
            [102.25, 17.10],[102.40, 17.10],[102.45, 17.00],[102.32, 16.95],
            [102.20, 17.00],[102.22, 17.10],[102.25, 17.10]
          ]]}
        },
        {
          type: "Feature",
          properties: { name: "สุวรรณคูหา" },
          geometry: { type: "Polygon", coordinates: [[
            [102.05, 17.62],[102.20, 17.62],[102.30, 17.55],[102.25, 17.45],
            [102.15, 17.40],[102.10, 17.55],[102.05, 17.62]
          ]]}
        },
        {
          type: "Feature",
          properties: { name: "โนนสัง" },
          geometry: { type: "Polygon", coordinates: [[
            [102.55, 17.15],[102.70, 17.15],[102.72, 17.00],[102.60, 16.95],
            [102.50, 17.00],[102.50, 17.10],[102.55, 17.15]
          ]]}
        },
      ]
    }
  };

  // Cache key สำหรับ POI (โหลดครั้งเดียว เก็บ 30 วัน)
  const CACHE_KEY = "nbp_map_pois_v1";
  const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

  // ====== SVG icons (สำหรับ POI markers) ======
  const ICONS = {
    amphoe_office: { color: "#7c3aed", svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
    hospital: { color: "#ef4444", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>' },
    shelter: { color: "#f59e0b", svg: '<path d="M3 12l2-2m0 0l7-7 7 7m-9 2v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6m-12 0l9-9 9 9"/>' },
    reservoir: { color: "#06b6d4", svg: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1C7 13 7 11 9.5 11c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1C7 19 7 17 9.5 17c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>' },
  };

  // ====== Class ======
  function MapLayers(map){
    this.map = map;
    this.layers = {
      province: null,
      amphoe: null,
      amphoeLabels: null,
      hospital: null,
      amphoe_office: null,
      shelter: null,
      reservoir: null,
    };
    this.visible = {
      province: false,
      amphoe: false,
      hospital: false,
      amphoe_office: false,
      shelter: false,
      reservoir: false,
    };
    this.poisLoaded = false;
    this.osmPois = null;
  }

  // โหลด POIs จาก Overpass (best-effort) -> fallback
  MapLayers.prototype.loadPOIs = async function(){
    if(this.poisLoaded) return this.osmPois;

    // ลอง cache ก่อน
    try{
      const cached = localStorage.getItem(CACHE_KEY);
      if(cached){
        const { data, ts } = JSON.parse(cached);
        if(Date.now() - ts < CACHE_TTL){
          this.osmPois = data;
          this.poisLoaded = true;
          return data;
        }
      }
    } catch(e){}

    // Overpass query: hospital + townhall + dam
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="hospital"](${BBOX});
        node["amenity"="townhall"](${BBOX});
        node["amenity"="clinic"](${BBOX});
        way["water"="reservoir"](${BBOX});
        node["waterway"="dam"](${BBOX});
      );
      out center;
    `;

    for(const url of OVERPASS_MIRRORS){
      try{
        const res = await fetch(url, {
          method: "POST",
          headers: {"Content-Type": "application/x-www-form-urlencoded"},
          body: "data=" + encodeURIComponent(query)
        });
        if(!res.ok) continue;
        const data = await res.json();
        if(data && data.elements){
          this.osmPois = data;
          try{
            localStorage.setItem(CACHE_KEY, JSON.stringify({data, ts: Date.now()}));
          } catch(e){}
          this.poisLoaded = true;
          return data;
        }
      } catch(err){
        // ลอง mirror ถัดไป
      }
    }

    // ถ้าทุก mirror ล้มเหลว ใช้ fallback
    this.osmPois = null;
    this.poisLoaded = true;
    return null;
  };

  // ====== Render functions ======

  MapLayers.prototype.renderProvinceBoundary = function(){
    if(this.layers.province) return this.layers.province;
    const layer = L.geoJSON(FALLBACK.province_boundary, {
      style: {
        color: "#0c4a6e",
        weight: 3,
        opacity: 0.85,
        fillColor: "#0284c7",
        fillOpacity: 0.04,
        dashArray: "8,4",
      }
    });
    layer.bindTooltip("จังหวัดหนองบัวลำภู", {sticky: true, className: "ml-tooltip"});
    this.layers.province = layer;
    return layer;
  };

  MapLayers.prototype.renderAmphoeBoundaries = function(){
    if(this.layers.amphoe) return this.layers.amphoe;

    const colors = {
      "เมืองหนองบัวลำภู": "#fbbf24",
      "นาวัง": "#34d399",
      "นากลาง": "#60a5fa",
      "ศรีบุญเรือง": "#f87171",
      "สุวรรณคูหา": "#a78bfa",
      "โนนสัง": "#fb923c",
    };
    const layer = L.geoJSON(FALLBACK.amphoe_boundaries, {
      style: function(feature){
        return {
          color: colors[feature.properties.name] || "#64748b",
          weight: 2,
          opacity: 0.9,
          fillColor: colors[feature.properties.name] || "#64748b",
          fillOpacity: 0.12,
        };
      },
      onEachFeature: function(feature, lyr){
        lyr.bindTooltip("อ." + feature.properties.name,
          {sticky: true, className: "ml-tooltip", direction: "top"});
        lyr.on("mouseover", function(){
          this.setStyle({fillOpacity: 0.28, weight: 3});
        });
        lyr.on("mouseout", function(){
          this.setStyle({fillOpacity: 0.12, weight: 2});
        });
      }
    });
    this.layers.amphoe = layer;

    // ป้ายชื่ออำเภอกลางๆ
    const labelLayer = L.layerGroup();
    FALLBACK.amphoe_boundaries.features.forEach(f => {
      const coords = f.geometry.coordinates[0];
      let cx = 0, cy = 0;
      coords.forEach(c => { cx += c[0]; cy += c[1]; });
      cx /= coords.length; cy /= coords.length;
      const label = L.marker([cy, cx], {
        icon: L.divIcon({
          className: "ml-amphoe-label",
          html: `<span>อ.${f.properties.name}</span>`,
          iconSize: null,
        }),
        interactive: false
      });
      labelLayer.addLayer(label);
    });
    this.layers.amphoeLabels = labelLayer;
    return layer;
  };

  function makePoiIcon(type){
    const cfg = ICONS[type] || ICONS.shelter;
    return L.divIcon({
      className: "ml-poi-marker",
      html: `<div class="ml-poi-pin" style="background:${cfg.color};">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${cfg.svg}</svg>
      </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  MapLayers.prototype.renderPOI = function(type, items, popupBuilder){
    if(this.layers[type]) return this.layers[type];
    const layer = L.layerGroup();
    items.forEach(p => {
      const marker = L.marker([p.lat, p.lon], { icon: makePoiIcon(type) });
      marker.bindTooltip(p.name, {direction: "top", offset: [0, -10], className: "ml-tooltip"});
      if(popupBuilder){
        marker.bindPopup(popupBuilder(p), {className: "ml-popup"});
      } else {
        marker.bindPopup(`<div class="ml-pop"><div class="ml-pop-title">${p.name}</div></div>`);
      }
      layer.addLayer(marker);
    });
    this.layers[type] = layer;
    return layer;
  };

  MapLayers.prototype.renderHospitals = async function(){
    await this.loadPOIs();
    let items = FALLBACK.hospitals;
    if(this.osmPois && this.osmPois.elements){
      const fromOsm = this.osmPois.elements
        .filter(e => e.tags && (e.tags.amenity === "hospital" || e.tags.amenity === "clinic"))
        .map(e => ({
          name: (e.tags["name:th"] || e.tags.name || "(ไม่มีชื่อ)"),
          lat: e.lat,
          lon: e.lon,
          level: e.tags.amenity === "hospital" ? "general" : "clinic",
        }));
      if(fromOsm.length > 0) items = fromOsm.concat(FALLBACK.hospitals);
    }
    return this.renderPOI("hospital", items, p =>
      `<div class="ml-pop">
        <div class="ml-pop-title">🏥 ${p.name}</div>
        <div class="ml-pop-type">${p.level === "general" ? "โรงพยาบาลทั่วไป" : "โรงพยาบาลชุมชน/คลินิก"}</div>
        <a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank">เปิดใน Google Maps</a>
      </div>`
    );
  };

  MapLayers.prototype.renderAmphoeOffices = async function(){
    return this.renderPOI("amphoe_office", FALLBACK.amphoe_centers, p =>
      `<div class="ml-pop">
        <div class="ml-pop-title">🏛️ ${p.name}</div>
        <div class="ml-pop-type">ที่ว่าการอำเภอ</div>
        <a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank">เปิดใน Google Maps</a>
      </div>`
    );
  };

  MapLayers.prototype.renderShelters = function(){
    return this.renderPOI("shelter", FALLBACK.shelters, p =>
      `<div class="ml-pop">
        <div class="ml-pop-title">⛺ ${p.name}</div>
        <div class="ml-pop-type">ศูนย์อพยพชั่วคราว</div>
        <div class="ml-pop-note">ใช้กรณีน้ำท่วม/เหตุฉุกเฉิน</div>
        <a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank">เปิดใน Google Maps</a>
      </div>`
    );
  };

  MapLayers.prototype.renderReservoirs = function(){
    return this.renderPOI("reservoir", FALLBACK.reservoirs, p => {
      const pct = Math.round((p.current / p.capacity) * 100);
      let cls = "low", lbl = "น้ำน้อย";
      if(pct >= 80){ cls = "full"; lbl = "เกือบเต็ม"; }
      else if(pct >= 50){ cls = "ok"; lbl = "ปกติ"; }
      else if(pct >= 30){ cls = "watch"; lbl = "เฝ้าระวัง"; }
      return `<div class="ml-pop">
        <div class="ml-pop-title">🌊 ${p.name}</div>
        <div class="ml-pop-stat ${cls}">
          <div class="ml-pop-pct">${pct}%</div>
          <div class="ml-pop-lbl">${lbl}</div>
        </div>
        <div class="ml-pop-detail">${p.current.toFixed(2)} / ${p.capacity.toFixed(2)} ล้าน ลบ.ม.</div>
      </div>`;
    });
  };

  // ====== Toggle ======
  MapLayers.prototype.toggle = async function(type, on){
    on = !!on;
    let layer = this.layers[type];

    // Lazy create
    if(on && !layer){
      if(type === "province") this.renderProvinceBoundary();
      else if(type === "amphoe") this.renderAmphoeBoundaries();
      else if(type === "hospital") await this.renderHospitals();
      else if(type === "amphoe_office") await this.renderAmphoeOffices();
      else if(type === "shelter") this.renderShelters();
      else if(type === "reservoir") this.renderReservoirs();
      layer = this.layers[type];
    }

    if(!layer) return;

    if(on && !this.visible[type]){
      layer.addTo(this.map);
      // Province ต้องอยู่ล่างสุด
      if(type === "province" && layer.bringToBack) layer.bringToBack();
      // Amphoe label ต้องโผล่ด้วย
      if(type === "amphoe" && this.layers.amphoeLabels){
        this.layers.amphoeLabels.addTo(this.map);
      }
      this.visible[type] = true;
    } else if(!on && this.visible[type]){
      this.map.removeLayer(layer);
      if(type === "amphoe" && this.layers.amphoeLabels){
        this.map.removeLayer(this.layers.amphoeLabels);
      }
      this.visible[type] = false;
    }
  };

  // ====== Inject CSS ======
  function injectCSS(){
    if(document.getElementById("ml-css")) return;
    const css = document.createElement("style");
    css.id = "ml-css";
    css.textContent = `
      .ml-poi-marker{background:transparent!important;border:none!important;}
      .ml-poi-pin{
        width:30px;height:30px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 8px rgba(0,0,0,.35), 0 0 0 2px #fff inset;
        transition:transform .15s;
      }
      .ml-poi-pin svg{transform:rotate(45deg);width:16px;height:16px;}
      .ml-poi-marker:hover .ml-poi-pin{transform:rotate(-45deg) scale(1.15);}
      .ml-amphoe-label{background:transparent!important;border:none!important;pointer-events:none;}
      .ml-amphoe-label span{
        display:inline-block;font-family:'Sarabun',sans-serif;
        font-size:13px;font-weight:700;color:#0c4a6e;
        background:rgba(255,255,255,.85);
        padding:2px 8px;border-radius:6px;
        border:1px solid rgba(12,74,110,.15);
        transform:translate(-50%,-50%);white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,.08);
      }
      .ml-tooltip{
        background:#fff!important;border:1px solid #e2e8f0!important;
        color:#0f172a!important;font-family:'Sarabun',sans-serif!important;
        font-size:12px!important;font-weight:600!important;
        padding:4px 9px!important;border-radius:6px!important;
        box-shadow:0 2px 8px rgba(0,0,0,.12)!important;
      }
      .ml-tooltip::before{display:none!important;}
      .ml-popup .leaflet-popup-content-wrapper{border-radius:10px;}
      .ml-pop{font-family:'Sarabun',sans-serif;min-width:200px;}
      .ml-pop-title{font-size:14px;font-weight:700;color:#0c4a6e;margin-bottom:4px;}
      .ml-pop-type{font-size:11px;color:#64748b;margin-bottom:8px;}
      .ml-pop-note{font-size:11px;color:#92400e;background:#fef3c7;padding:4px 8px;border-radius:5px;margin:6px 0;}
      .ml-pop-stat{
        display:flex;align-items:baseline;gap:8px;
        padding:6px 0;border-top:1px dashed #e2e8f0;
      }
      .ml-pop-stat.full{color:#0891b2;}
      .ml-pop-stat.ok{color:#16a34a;}
      .ml-pop-stat.watch{color:#f59e0b;}
      .ml-pop-stat.low{color:#dc2626;}
      .ml-pop-pct{font-size:20px;font-weight:700;}
      .ml-pop-lbl{font-size:12px;font-weight:600;}
      .ml-pop-detail{font-size:11px;color:#64748b;margin-top:2px;}
      .ml-pop-link{
        display:inline-block;margin-top:8px;
        font-size:11px;color:#0284c7;text-decoration:none;
        padding:4px 10px;background:#f0f9ff;border-radius:5px;
        border:1px solid #bae6fd;
      }
      .ml-pop-link:hover{background:#e0f2fe;}
    `;
    document.head.appendChild(css);
  }

  injectCSS();
  window.MapLayers = MapLayers;
})();
