/**
 * waterways-loader.js
 * ระบบโหลดเส้นทางน้ำจริงของจังหวัดหนองบัวลำภูจาก OpenStreetMap
 *
 * - ครั้งแรก: ดึงข้อมูลจาก Overpass API (ใช้เวลา 3-10 วินาที)
 * - ครั้งต่อไป: โหลดจาก localStorage (ทันที)
 * - ถ้า API ล่ม: ใช้ fallback GeoJSON ที่ฝังในไฟล์
 *
 * วิธีใช้:
 *   loadNBPWaterways(map).then(layer => {
 *     console.log('เพิ่มเส้นทางน้ำเรียบร้อย');
 *   });
 */

(function () {
  "use strict";

  // ===== CONFIG =====
  const CACHE_KEY = "nbp_waterways_v2";
  const CACHE_TTL_DAYS = 30;
  const BBOX = [16.95, 101.85, 17.85, 102.55]; // S, W, N, E

  // Mirror servers ของ Overpass API (ลองตามลำดับ)
  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  // Overpass QL query — ดึงเส้นทางน้ำในเขตจังหวัด
  const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["waterway"~"river|stream|canal|drain"](${BBOX.join(",")});
  way["natural"="water"](${BBOX.join(",")});
  way["water"~"lake|reservoir|pond"](${BBOX.join(",")});
);
out geom;
`;

  // ===== STYLES สำหรับเส้นทางน้ำแต่ละประเภท =====
  const WATERWAY_STYLES = {
    river: { color: "#0284c7", weight: 4, opacity: 0.85 },
    canal: { color: "#0ea5e9", weight: 3, opacity: 0.75 },
    stream: { color: "#38bdf8", weight: 1.8, opacity: 0.6 },
    drain: { color: "#7dd3fc", weight: 1.2, opacity: 0.5 },
    waterbody: { color: "#0284c7", weight: 1, opacity: 0.85, fillColor: "#7dd3fc", fillOpacity: 0.45 },
    other: { color: "#7dd3fc", weight: 1, opacity: 0.5 },
  };

  // ===== ฟังก์ชันหลัก =====
  window.loadNBPWaterways = async function (map, options) {
    options = options || {};
    const onProgress = options.onProgress || (() => {});

    let geojson = loadFromCache();
    if (geojson) {
      onProgress("ใช้ข้อมูลเส้นทางน้ำจาก cache");
      return renderToMap(map, geojson, options);
    }

    // ลองดึงจาก Overpass
    onProgress("กำลังโหลดเส้นทางน้ำจาก OpenStreetMap...");
    try {
      geojson = await fetchFromOverpass(onProgress);
      saveToCache(geojson);
      onProgress(`โหลดเส้นทางน้ำสำเร็จ (${geojson.features.length} เส้น)`);
      return renderToMap(map, geojson, options);
    } catch (err) {
      console.warn("ไม่สามารถโหลดจาก Overpass ได้, ใช้ fallback:", err);
      onProgress("ใช้ข้อมูลเส้นทางน้ำสำรอง");
      geojson = getFallbackGeoJSON();
      return renderToMap(map, geojson, options);
    }
  };

  // ===== โหลดจาก localStorage =====
  function loadFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const ageMs = Date.now() - (obj.savedAt || 0);
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > CACHE_TTL_DAYS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return obj.geojson;
    } catch (e) {
      return null;
    }
  }

  function saveToCache(geojson) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), geojson: geojson })
      );
    } catch (e) {
      console.warn("Cache save failed:", e);
    }
  }

  // ===== Fetch จาก Overpass API (ลอง mirror หลายตัว) =====
  async function fetchFromOverpass(onProgress) {
    let lastErr;
    for (const url of OVERPASS_MIRRORS) {
      try {
        onProgress("ลองเชื่อมต่อ " + new URL(url).hostname);
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(OVERPASS_QUERY),
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const json = await response.json();
        return overpassToGeoJSON(json);
      } catch (err) {
        lastErr = err;
        continue;
      }
    }
    throw lastErr || new Error("All mirrors failed");
  }

  // ===== แปลง Overpass JSON เป็น GeoJSON =====
  function overpassToGeoJSON(overpass) {
    const features = [];
    for (const el of overpass.elements || []) {
      if (el.type !== "way" || !el.geometry) continue;
      const coords = el.geometry.map((p) => [p.lon, p.lat]);
      if (coords.length < 2) continue;

      const tags = el.tags || {};
      const waterway = tags.waterway || "";
      const natural = tags.natural || "";
      const water = tags.water || "";

      let type = "other";
      if (waterway === "river") type = "river";
      else if (waterway === "canal") type = "canal";
      else if (waterway === "stream") type = "stream";
      else if (waterway === "drain" || waterway === "ditch") type = "drain";
      else if (natural === "water" || ["lake", "reservoir", "pond"].includes(water))
        type = "waterbody";

      const isClosed = coords.length > 3 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      const geometry = isClosed
        ? { type: "Polygon", coordinates: [coords] }
        : { type: "LineString", coordinates: coords };

      features.push({
        type: "Feature",
        geometry: geometry,
        properties: {
          id: el.id,
          type: type,
          name: tags["name:th"] || tags.name || "",
          name_en: tags["name:en"] || "",
        },
      });
    }
    return { type: "FeatureCollection", features: features };
  }

  // ===== Render ลงแผนที่ Leaflet =====
  function renderToMap(map, geojson, options) {
    const showLabels = options.showLabels !== false;
    const minZoomForStreams = options.minZoomForStreams || 12;

    // แยกเป็น layer ตามประเภท เพื่อจัดการ z-order
    const layers = {
      streams: L.featureGroup(),
      drains: L.featureGroup(),
      waterbodies: L.featureGroup(),
      canals: L.featureGroup(),
      rivers: L.featureGroup(),
    };

    let riverNamesShown = new Set();

    L.geoJSON(geojson, {
      style: function (feature) {
        const t = feature.properties.type;
        return WATERWAY_STYLES[t] || WATERWAY_STYLES.other;
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        const t = p.type;

        // Tooltip ชื่อแม่น้ำ
        if (p.name) {
          layer.bindTooltip(p.name, {
            sticky: true,
            direction: "top",
            className: "waterway-tooltip",
          });
        }

        // จัดเข้า group ตามประเภท
        if (t === "river") layers.rivers.addLayer(layer);
        else if (t === "canal") layers.canals.addLayer(layer);
        else if (t === "waterbody") layers.waterbodies.addLayer(layer);
        else if (t === "drain") layers.drains.addLayer(layer);
        else layers.streams.addLayer(layer);

        // วาดชื่อแม่น้ำหลักลงบนแผนที่ (เฉพาะ river ที่มีชื่อ)
        if (showLabels && t === "river" && p.name && !riverNamesShown.has(p.name)) {
          riverNamesShown.add(p.name);
          try {
            const center = layer.getBounds().getCenter();
            L.marker(center, {
              icon: L.divIcon({
                className: "river-label",
                html: `<span>${p.name}</span>`,
                iconSize: null,
              }),
              interactive: false,
            }).addTo(layers.rivers);
          } catch (e) {}
        }
      },
    });

    // เพิ่มลงแผนที่ตามลำดับ z-order (ล่างก่อน บนทีหลัง)
    layers.drains.addTo(map);
    layers.streams.addTo(map);
    layers.waterbodies.addTo(map);
    layers.canals.addTo(map);
    layers.rivers.addTo(map);

    // ซ่อน streams/drains เมื่อ zoom ต่ำ
    function updateVisibility() {
      const z = map.getZoom();
      if (z < minZoomForStreams) {
        if (map.hasLayer(layers.streams)) map.removeLayer(layers.streams);
        if (map.hasLayer(layers.drains)) map.removeLayer(layers.drains);
      } else {
        if (!map.hasLayer(layers.streams)) layers.streams.addTo(map);
        if (!map.hasLayer(layers.drains)) layers.drains.addTo(map);
      }
    }
    map.on("zoomend", updateVisibility);
    updateVisibility();

    return {
      layers: layers,
      featureCount: geojson.features.length,
      remove: function () {
        Object.values(layers).forEach((l) => map.removeLayer(l));
      },
    };
  }

  // ===== FALLBACK GEOJSON (เส้นทางน้ำหลักที่แกะพิกัดมา) =====
  function getFallbackGeoJSON() {
    return {
      type: "FeatureCollection",
      features: [
        // ลำน้ำพะเนียง (สายหลัก) — ตัดจากเหนือลงใต้ผ่านอำเภอนาวัง นากลาง เมือง
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.140, 17.420], [102.155, 17.395], [102.168, 17.370],
              [102.180, 17.345], [102.195, 17.320], [102.210, 17.295],
              [102.225, 17.270], [102.240, 17.240], [102.255, 17.215],
              [102.270, 17.185], [102.285, 17.160], [102.298, 17.135],
              [102.310, 17.110], [102.320, 17.085], [102.330, 17.060],
              [102.340, 17.035],
            ],
          },
          properties: { type: "river", name: "ลำน้ำพะเนียง", name_en: "Phaniang River" },
        },
        // ลำน้ำโมง (สายหลัก) — ในอำเภอสุวรรณคูหา
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.040, 17.580], [102.060, 17.560], [102.080, 17.535],
              [102.100, 17.510], [102.120, 17.485], [102.140, 17.460],
              [102.160, 17.435], [102.180, 17.410],
            ],
          },
          properties: { type: "river", name: "ลำน้ำโมง", name_en: "Mong River" },
        },
        // หนองบัว (อ่างเก็บน้ำใจกลางเมือง)
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [102.428, 17.205], [102.438, 17.205], [102.442, 17.200],
              [102.440, 17.195], [102.432, 17.193], [102.425, 17.198],
              [102.428, 17.205],
            ]],
          },
          properties: { type: "waterbody", name: "หนองบัว", name_en: "Nong Bua" },
        },
      ],
    };
  }
})();

// ===== CSS สำหรับ tooltip และ label =====
(function injectCSS() {
  if (document.getElementById("waterways-css")) return;
  const style = document.createElement("style");
  style.id = "waterways-css";
  style.textContent = `
    .waterway-tooltip {
      background: rgba(255,255,255,0.95) !important;
      border: 1px solid #0284c7 !important;
      color: #0c4a6e !important;
      font-family: 'Sarabun', sans-serif !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 4px 10px !important;
      border-radius: 6px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    }
    .waterway-tooltip::before { display: none !important; }
    .river-label {
      background: transparent !important;
      border: none !important;
      pointer-events: none;
    }
    .river-label span {
      display: inline-block;
      font-family: 'Sarabun', sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #0c4a6e;
      text-shadow:
        -1px -1px 0 #fff, 1px -1px 0 #fff,
        -1px 1px 0 #fff, 1px 1px 0 #fff,
        0 0 4px #fff;
      white-space: nowrap;
      transform: translate(-50%, -50%);
      letter-spacing: 0.5px;
    }
  `;
  document.head.appendChild(style);
})();
