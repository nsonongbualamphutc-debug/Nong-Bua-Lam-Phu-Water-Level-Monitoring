/**
 * map-layers.js v2 — Map Layers Loader
 * 3 Layers ที่ใช้จริง:
 *   1. amphoe_choropleth — ขอบเขต 6 อำเภอ + ระบายสีตามข้อมูล (rain/reservoir/risk)
 *   2. reservoir12 — อ่างเก็บน้ำ 12 แห่ง พร้อม % เก็บน้ำ
 *   3. pump_station — สถานีสูบน้ำ ดึงจาก OSM Overpass อัตโนมัติ
 */

(function(){
  "use strict";

  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];

  const BBOX = "16.95,101.95,17.65,102.75";

  const AMPHOE_BOUNDARIES = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "เมืองหนองบัวลำภู", code: "เมือง" },
        geometry: { type: "Polygon", coordinates: [[
          [102.30, 17.30],[102.45, 17.32],[102.55, 17.25],[102.55, 17.10],
          [102.42, 17.05],[102.30, 17.10],[102.25, 17.20],[102.30, 17.30]
        ]]} },
      { type: "Feature", properties: { name: "นาวัง", code: "นาวัง" },
        geometry: { type: "Polygon", coordinates: [[
          [101.97, 17.62],[102.10, 17.55],[102.15, 17.40],[102.05, 17.30],
          [101.95, 17.35],[101.93, 17.50],[101.97, 17.62]
        ]]} },
      { type: "Feature", properties: { name: "นากลาง", code: "นากลาง" },
        geometry: { type: "Polygon", coordinates: [[
          [102.10, 17.55],[102.25, 17.50],[102.30, 17.30],[102.20, 17.22],
          [102.10, 17.30],[102.05, 17.45],[102.10, 17.55]
        ]]} },
      { type: "Feature", properties: { name: "ศรีบุญเรือง", code: "ศรีบุญเรือง" },
        geometry: { type: "Polygon", coordinates: [[
          [102.25, 17.10],[102.40, 17.10],[102.45, 17.00],[102.32, 16.95],
          [102.20, 17.00],[102.22, 17.10],[102.25, 17.10]
        ]]} },
      { type: "Feature", properties: { name: "สุวรรณคูหา", code: "สุวรรณคูหา" },
        geometry: { type: "Polygon", coordinates: [[
          [102.05, 17.62],[102.20, 17.62],[102.30, 17.55],[102.25, 17.45],
          [102.15, 17.40],[102.10, 17.55],[102.05, 17.62]
        ]]} },
      { type: "Feature", properties: { name: "โนนสัง", code: "โนนสัง" },
        geometry: { type: "Polygon", coordinates: [[
          [102.55, 17.15],[102.70, 17.15],[102.72, 17.00],[102.60, 16.95],
          [102.50, 17.00],[102.50, 17.10],[102.55, 17.15]
        ]]} },
    ]
  };

  const RESERVOIRS_12 = [
    { name: "ห้วยไร่",       amphoe: "สุวรรณคูหา",  capacity: 1.43,  current: 1.43,  lat: 17.510, lon: 102.150 },
    { name: "บ้านคลองเจริญ", amphoe: "สุวรรณคูหา",  capacity: 0.62,  current: 0.62,  lat: 17.495, lon: 102.180 },
    { name: "ห้วยโป่งซาง 1", amphoe: "สุวรรณคูหา",  capacity: 0.14,  current: 0.10,  lat: 17.485, lon: 102.220 },
    { name: "ห้วยโป่งซาง 2", amphoe: "สุวรรณคูหา",  capacity: 0.45,  current: 0.29,  lat: 17.475, lon: 102.235 },
    { name: "ห้วยลาดกั่ว",    amphoe: "นาวัง",        capacity: 0.47,  current: 0.26,  lat: 17.330, lon: 102.080 },
    { name: "ห้วยพังโต",     amphoe: "นาวัง",        capacity: 1.09,  current: 0.56,  lat: 17.300, lon: 102.060 },
    { name: "ห้วยซับบัว",    amphoe: "ศรีบุญเรือง",  capacity: 0.63,  current: 0.53,  lat: 17.040, lon: 102.330 },
    { name: "ห้วยลำใย",      amphoe: "นากลาง",       capacity: 0.22,  current: 0.11,  lat: 17.270, lon: 102.155 },
    { name: "บ้านสมอบุญ",    amphoe: "นากลาง",       capacity: 0.24,  current: 0.17,  lat: 17.265, lon: 102.180 },
    { name: "ห้วยโป่งซาง",    amphoe: "นากลาง",       capacity: 0.21,  current: 0.15,  lat: 17.255, lon: 102.200 },
    { name: "ห้วยเหล่ายาง",   amphoe: "เมืองหนองบัวลำภู", capacity: 1.62, current: 1.06, lat: 17.180, lon: 102.450 },
    { name: "ห้วยน้ำบอง",    amphoe: "โนนสัง",       capacity: 11.77, current: 6.66,  lat: 17.080, lon: 102.620 },
  ];

  const CACHE_KEY_PUMP = "nbp_pump_stations_v1";
  const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

  const ICON_PUMP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>';
  const ICON_RESERVOIR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1C7 13 7 11 9.5 11c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1C7 19 7 17 9.5 17c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>';

  function MapLayers(map){
    this.map = map;
    this.layers = {
      amphoe_choropleth: null,
      amphoeLabels: null,
      reservoir12: null,
      pump_station: null,
    };
    this.visible = {
      amphoe_choropleth: false,
      reservoir12: false,
      pump_station: false,
    };
    this.choroplethDim = "rain";
    this.choroplethData = {};
  }

  function getChoroplethColor(value, dim){
    if(dim === "rain"){
      if(value === null || value === undefined || isNaN(value)) return "#f1f5f9";
      if(value < 0.1)  return "#f8fafc";
      if(value <= 10)  return "#dbeafe";
      if(value <= 35)  return "#93c5fd";
      if(value <= 90)  return "#3b82f6";
      return "#1e40af";
    }
    if(dim === "reservoir"){
      if(value === null || value === undefined || isNaN(value)) return "#f1f5f9";
      if(value < 30) return "#fee2e2";
      if(value < 50) return "#fef3c7";
      if(value < 80) return "#bfdbfe";
      return "#06b6d4";
    }
    if(dim === "risk"){
      if(value === null || value === undefined || isNaN(value)) return "#f1f5f9";
      if(value < 25) return "#dcfce7";
      if(value < 50) return "#fef3c7";
      if(value < 75) return "#fed7aa";
      return "#fecaca";
    }
    return "#f1f5f9";
  }

  MapLayers.prototype.renderChoropleth = function(){
    if(this.layers.amphoe_choropleth) return this.layers.amphoe_choropleth;
    const self = this;
    const layer = L.geoJSON(AMPHOE_BOUNDARIES, {
      style: function(feature){
        const code = feature.properties.code;
        const value = self.choroplethData[code];
        return {
          color: "#0c4a6e",
          weight: 2,
          opacity: 0.85,
          fillColor: getChoroplethColor(value, self.choroplethDim),
          fillOpacity: 0.65,
        };
      },
      onEachFeature: function(feature, lyr){
        const code = feature.properties.code;
        const name = feature.properties.name;
        const buildPopup = () => {
          const value = self.choroplethData[code];
          let valueStr = "ไม่มีข้อมูล", unit = "";
          if(self.choroplethDim === "rain"){
            valueStr = (value || 0).toFixed(1); unit = "มม.";
          } else if(self.choroplethDim === "reservoir"){
            valueStr = (value || 0).toFixed(0) + "%";
          } else if(self.choroplethDim === "risk"){
            valueStr = (value || 0).toFixed(0) + "%";
          }
          const dimName = {rain: "ฝน 24 ชม.", reservoir: "% เก็บน้ำเฉลี่ย", risk: "ความเสี่ยงน้ำท่วม"}[self.choroplethDim];
          return `<div class="ml-pop">
              <div class="ml-pop-title">อ.${name}</div>
              <div class="ml-pop-stat">
                <div class="ml-pop-pct">${valueStr}</div>
                <div class="ml-pop-lbl">${unit}</div>
              </div>
              <div class="ml-pop-detail">${dimName}</div>
            </div>`;
        };
        lyr.bindTooltip("อ." + name, {sticky: true, className: "ml-tooltip", direction: "top"});
        lyr.bindPopup(buildPopup);
        lyr.on("mouseover", function(){ this.setStyle({fillOpacity: 0.85, weight: 3}); });
        lyr.on("mouseout", function(){ this.setStyle({fillOpacity: 0.65, weight: 2}); });
      }
    });
    this.layers.amphoe_choropleth = layer;

    const labelLayer = L.layerGroup();
    AMPHOE_BOUNDARIES.features.forEach(f => {
      const coords = f.geometry.coordinates[0];
      let cx = 0, cy = 0;
      coords.forEach(c => { cx += c[0]; cy += c[1]; });
      cx /= coords.length; cy /= coords.length;
      labelLayer.addLayer(L.marker([cy, cx], {
        icon: L.divIcon({
          className: "ml-amphoe-label",
          html: `<span>อ.${f.properties.name}</span>`,
          iconSize: null,
        }),
        interactive: false
      }));
    });
    this.layers.amphoeLabels = labelLayer;
    return layer;
  };

  MapLayers.prototype.setChoroplethDimension = function(dim, data){
    this.choroplethDim = dim;
    if(data) this.choroplethData = data;
    if(this.layers.amphoe_choropleth && this.visible.amphoe_choropleth){
      const self = this;
      this.layers.amphoe_choropleth.setStyle(function(feature){
        const value = self.choroplethData[feature.properties.code];
        return {
          fillColor: getChoroplethColor(value, self.choroplethDim),
          fillOpacity: 0.65,
          color: "#0c4a6e", weight: 2, opacity: 0.85,
        };
      });
    }
    return this;
  };

  MapLayers.prototype.renderReservoirs12 = function(){
    if(this.layers.reservoir12) return this.layers.reservoir12;
    const layer = L.layerGroup();
    RESERVOIRS_12.forEach(r => {
      const pct = (r.current / r.capacity) * 100;
      let color = "#dc2626", lbl = "น้ำน้อย";
      if(pct >= 80){ color = "#06b6d4"; lbl = "เกือบเต็ม"; }
      else if(pct >= 50){ color = "#16a34a"; lbl = "ปกติ"; }
      else if(pct >= 30){ color = "#f59e0b"; lbl = "เฝ้าระวัง"; }
      const icon = L.divIcon({
        className: "ml-poi-marker",
        html: `<div class="ml-poi-pin" style="background:${color};">
          <span class="ml-pct-badge">${Math.round(pct)}%</span>
          ${ICON_RESERVOIR_SVG}
        </div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });
      const m = L.marker([r.lat, r.lon], { icon });
      m.bindTooltip(r.name, {direction: "top", offset: [0, -30], className: "ml-tooltip"});
      m.bindPopup(
        `<div class="ml-pop">
          <div class="ml-pop-title">🌊 ${r.name}</div>
          <div class="ml-pop-type">อ.${r.amphoe}</div>
          <div class="ml-pop-stat" style="color:${color};">
            <div class="ml-pop-pct">${pct.toFixed(0)}%</div>
            <div class="ml-pop-lbl">${lbl}</div>
          </div>
          <div class="ml-pop-detail">${r.current.toFixed(2)} / ${r.capacity.toFixed(2)} ล้าน ลบ.ม.</div>
          <a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}" target="_blank">เปิดใน Google Maps</a>
        </div>`
      );
      layer.addLayer(m);
    });
    this.layers.reservoir12 = layer;
    return layer;
  };

  MapLayers.prototype.loadPumpStations = async function(){
    try{
      const cached = localStorage.getItem(CACHE_KEY_PUMP);
      if(cached){
        const { data, ts } = JSON.parse(cached);
        if(Date.now() - ts < CACHE_TTL) return data;
      }
    } catch(e){}

    const query = `
      [out:json][timeout:25];
      (
        node["man_made"="pumping_station"](${BBOX});
        way["man_made"="pumping_station"](${BBOX});
        node["pump"="powered"](${BBOX});
        node["waterway"="pumping_station"](${BBOX});
        node["waterway"="sluice_gate"](${BBOX});
        node["waterway"="dam"](${BBOX});
        node["waterway"="weir"](${BBOX});
        node["waterway"="floodgate"](${BBOX});
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
          try{ localStorage.setItem(CACHE_KEY_PUMP, JSON.stringify({data, ts: Date.now()})); } catch(e){}
          return data;
        }
      } catch(err){}
    }
    return null;
  };

  MapLayers.prototype.renderPumpStations = async function(){
    if(this.layers.pump_station) return this.layers.pump_station;

    const layer = L.layerGroup();
    const data = await this.loadPumpStations();

    let stations = [];
    if(data && data.elements){
      stations = data.elements.filter(e => e.lat && e.lon).map(e => {
        const tags = e.tags || {};
        let typeLabel = "สถานีสูบน้ำ";
        if(tags.waterway === "sluice_gate" || tags.waterway === "floodgate") typeLabel = "ประตูระบายน้ำ";
        else if(tags.waterway === "dam") typeLabel = "เขื่อน/ฝาย";
        else if(tags.waterway === "weir") typeLabel = "ฝาย";
        return {
          name: tags["name:th"] || tags.name || "(ไม่มีชื่อ)",
          type: typeLabel,
          operator: tags.operator || "",
          lat: e.lat, lon: e.lon,
        };
      });
    }

    if(stations.length === 0){
      stations = [
        { name: "ปตร.หนองหว้าใหญ่", type: "ประตูระบายน้ำ", lat: 17.22, lon: 102.30 },
        { name: "ปตร.ปู่หลอด", type: "ประตูระบายน้ำ", lat: 17.20, lon: 102.42 },
        { name: "ปตร.หัวนา", type: "ประตูระบายน้ำ", lat: 17.15, lon: 102.48 },
      ];
    }

    stations.forEach(s => {
      const icon = L.divIcon({
        className: "ml-poi-marker",
        html: `<div class="ml-poi-pin" style="background:#8b5cf6;">${ICON_PUMP_SVG}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const m = L.marker([s.lat, s.lon], { icon });
      m.bindTooltip(s.name, {direction: "top", offset: [0, -22], className: "ml-tooltip"});
      m.bindPopup(
        `<div class="ml-pop">
          <div class="ml-pop-title">⚙️ ${s.name}</div>
          <div class="ml-pop-type">${s.type}${s.operator ? " · " + s.operator : ""}</div>
          <a class="ml-pop-link" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}" target="_blank">เปิดใน Google Maps</a>
        </div>`
      );
      layer.addLayer(m);
    });

    this.layers.pump_station = layer;
    layer._totalCount = stations.length;
    return layer;
  };

  MapLayers.prototype.toggle = async function(type, on){
    on = !!on;
    let layer = this.layers[type];

    if(on && !layer){
      if(type === "amphoe_choropleth") this.renderChoropleth();
      else if(type === "reservoir12") this.renderReservoirs12();
      else if(type === "pump_station") await this.renderPumpStations();
      layer = this.layers[type];
    }
    if(!layer) return;

    if(on && !this.visible[type]){
      layer.addTo(this.map);
      if(type === "amphoe_choropleth"){
        layer.bringToBack();
        if(this.layers.amphoeLabels) this.layers.amphoeLabels.addTo(this.map);
      }
      this.visible[type] = true;
    } else if(!on && this.visible[type]){
      this.map.removeLayer(layer);
      if(type === "amphoe_choropleth" && this.layers.amphoeLabels){
        this.map.removeLayer(this.layers.amphoeLabels);
      }
      this.visible[type] = false;
    }
  };

  function injectCSS(){
    if(document.getElementById("ml-css-v2")) return;
    const css = document.createElement("style");
    css.id = "ml-css-v2";
    css.textContent = `
      .ml-poi-marker{background:transparent!important;border:none!important;}
      .ml-poi-pin{
        width:30px;height:30px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 8px rgba(0,0,0,.35), 0 0 0 2px #fff inset;
        transition:transform .15s;
        position:relative;
      }
      .ml-poi-pin svg{transform:rotate(45deg);width:16px;height:16px;}
      .ml-poi-marker:hover .ml-poi-pin{transform:rotate(-45deg) scale(1.18);z-index:1000;}
      .ml-pct-badge{
        position:absolute;
        top:-8px;right:-12px;
        background:#fff;color:#0f172a;
        font-family:'Sarabun',sans-serif;
        font-size:10px;font-weight:700;
        padding:2px 5px;border-radius:8px;
        transform:rotate(45deg);
        box-shadow:0 2px 5px rgba(0,0,0,.25);
        white-space:nowrap;
        border:1px solid #e2e8f0;
      }
      .ml-amphoe-label{background:transparent!important;border:none!important;pointer-events:none;}
      .ml-amphoe-label span{
        display:inline-block;font-family:'Sarabun',sans-serif;
        font-size:13px;font-weight:700;color:#0c4a6e;
        background:rgba(255,255,255,.9);
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
      .ml-pop{font-family:'Sarabun',sans-serif;min-width:200px;}
      .ml-pop-title{font-size:14px;font-weight:700;color:#0c4a6e;margin-bottom:4px;}
      .ml-pop-type{font-size:11px;color:#64748b;margin-bottom:8px;}
      .ml-pop-stat{
        display:flex;align-items:baseline;gap:8px;
        padding:6px 0;border-top:1px dashed #e2e8f0;
      }
      .ml-pop-pct{font-size:22px;font-weight:700;}
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
  window.RESERVOIRS_12_DATA = RESERVOIRS_12;
})();
