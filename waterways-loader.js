/**
 * waterways-loader.js (v3 - enhanced)
 * ระบบโหลดเส้นทางน้ำจริงของจังหวัดหนองบัวลำภูจาก OpenStreetMap
 *
 * v3 features:
 * - ลำน้ำพะเนียง/ลำน้ำโมง เน้นให้เด่นกว่าสายอื่น (สีเข้ม + เส้นหนา)
 * - แสดงชื่อทุกลำน้ำ/ลำห้วยที่มีชื่อ (ตามระดับ zoom)
 * - คลิกที่เส้นน้ำใดๆ → popup แสดงรายละเอียด + ลิงก์ Google Maps
 * - Tooltip แสดงชื่อตอน hover
 */

(function () {
  "use strict";

  const CACHE_KEY = "nbp_waterways_v3";
  const CACHE_TTL_DAYS = 30;
  const BBOX = [16.95, 101.85, 17.85, 102.55];

  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["waterway"~"river|stream|canal|drain"](${BBOX.join(",")});
  way["natural"="water"](${BBOX.join(",")});
  way["water"~"lake|reservoir|pond"](${BBOX.join(",")});
);
out geom;
`;

  // ลำน้ำหลักของหนองบัวลำภู (เน้นให้เด่นเป็นพิเศษ)
  const HIGHLIGHTED_RIVERS = [
    "ลำน้ำพะเนียง", "ลำพะเนียง", "พะเนียง",
    "ลำน้ำโมง", "ลำโมง", "โมง",
    "ลำพอง", "ลำห้วยทราย",
  ];

  function isHighlighted(name) {
    if (!name) return false;
    return HIGHLIGHTED_RIVERS.some(h => name.indexOf(h) !== -1);
  }

  // ===== STYLES =====
  const STYLES = {
    river_highlight: { color: "#075985", weight: 5, opacity: 0.95 },
    river: { color: "#0284c7", weight: 3.5, opacity: 0.85 },
    canal: { color: "#0ea5e9", weight: 2.5, opacity: 0.8 },
    stream: { color: "#38bdf8", weight: 1.8, opacity: 0.7 },
    drain: { color: "#7dd3fc", weight: 1.2, opacity: 0.55 },
    waterbody_highlight: { color: "#075985", weight: 1.5, opacity: 0.9, fillColor: "#7dd3fc", fillOpacity: 0.55 },
    waterbody: { color: "#0284c7", weight: 1, opacity: 0.85, fillColor: "#bae6fd", fillOpacity: 0.45 },
    other: { color: "#7dd3fc", weight: 1, opacity: 0.5 },
  };

  const TYPE_LABELS = {
    river: "แม่น้ำ", canal: "คลอง", stream: "ลำธาร",
    drain: "ทางระบายน้ำ", waterbody: "แหล่งน้ำ", other: "เส้นน้ำ"
  };

  // ===== ฟังก์ชันหลัก =====
  window.loadNBPWaterways = async function (map, options) {
    options = options || {};
    const onProgress = options.onProgress || (() => {});

    let geojson = loadFromCache();
    let source = "cache";
    if (geojson) {
      onProgress("ใช้ข้อมูลเส้นทางน้ำจาก cache (" + geojson.features.length + " เส้น)");
      const result = renderToMap(map, geojson, options);
      result.source = "cache";
      return result;
    }

    onProgress("กำลังโหลดเส้นทางน้ำจาก OpenStreetMap...");
    try {
      geojson = await fetchFromOverpass(onProgress);
      saveToCache(geojson);
      onProgress(`โหลดเส้นทางน้ำสำเร็จ (${geojson.features.length} เส้น)`);
      const result = renderToMap(map, geojson, options);
      result.source = "overpass";
      return result;
    } catch (err) {
      console.warn("ไม่สามารถโหลดจาก Overpass ได้:", err);
      onProgress("ใช้ข้อมูลเส้นทางน้ำสำรอง (Overpass API ไม่ตอบสนอง)");
      geojson = getFallbackGeoJSON();
      const result = renderToMap(map, geojson, options);
      result.source = "fallback";
      result.error = err.message;
      return result;
    }
  };

  function loadFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const ageDays = (Date.now() - (obj.savedAt || 0)) / (1000 * 60 * 60 * 24);
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
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), geojson: geojson }));
    } catch (e) {
      console.warn("Cache save failed:", e);
    }
  }

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

  function overpassToGeoJSON(overpass) {
    const features = [];
    for (const el of overpass.elements || []) {
      if (el.type !== "way" || !el.geometry) continue;
      const coords = el.geometry.map(p => [p.lon, p.lat]);
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

      features.push({
        type: "Feature",
        geometry: isClosed
          ? { type: "Polygon", coordinates: [coords] }
          : { type: "LineString", coordinates: coords },
        properties: {
          id: el.id,
          type: type,
          name: tags["name:th"] || tags.name || "",
          name_en: tags["name:en"] || "",
          waterway: waterway,
        },
      });
    }
    return { type: "FeatureCollection", features: features };
  }

  // ===== Render =====
  function renderToMap(map, geojson, options) {
    const minZoomForStreams = options.minZoomForStreams || 11;
    const minZoomForLabels = options.minZoomForLabels || 12;
    const minZoomForSmallLabels = options.minZoomForSmallLabels || 14;

    const groups = {
      drains: L.featureGroup(),
      streams: L.featureGroup(),
      waterbodies: L.featureGroup(),
      canals: L.featureGroup(),
      rivers: L.featureGroup(),
      labels: L.featureGroup(),
    };

    const labelMarkers = [];

    L.geoJSON(geojson, {
      style: function (feature) {
        const t = feature.properties.type;
        const name = feature.properties.name;
        if (t === "river" && isHighlighted(name)) return STYLES.river_highlight;
        if (t === "waterbody" && isHighlighted(name)) return STYLES.waterbody_highlight;
        return STYLES[t] || STYLES.other;
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        const t = p.type;
        const name = p.name || "(ไม่มีชื่อ)";
        const highlighted = isHighlighted(p.name);
        const typeLabel = TYPE_LABELS[t] || "เส้นน้ำ";

        // Tooltip (hover)
        if (p.name) {
          layer.bindTooltip(p.name, {
            sticky: true,
            direction: "top",
            className: "waterway-tooltip" + (highlighted ? " highlight" : ""),
          });
        }

        // Popup (click)
        const center = getFeatureCenter(feature);
        const gmapsUrl = center
          ? `https://www.google.com/maps/search/?api=1&query=${center[1]},${center[0]}`
          : "#";

        const popupContent = `
          <div class="waterway-popup">
            <div class="wp-title">${highlighted ? '⭐ ' : ''}${name}</div>
            <div class="wp-type">${typeLabel}${p.name_en ? ' · ' + p.name_en : ''}</div>
            ${highlighted ? '<div class="wp-badge">ลำน้ำหลัก</div>' : ''}
            <div class="wp-actions">
              <a href="${gmapsUrl}" target="_blank" rel="noopener">📍 เปิดใน Google Maps</a>
            </div>
          </div>
        `;
        layer.bindPopup(popupContent, { className: "waterway-popup-wrap", maxWidth: 260 });

        // จัดเข้า group
        if (t === "river") groups.rivers.addLayer(layer);
        else if (t === "canal") groups.canals.addLayer(layer);
        else if (t === "waterbody") groups.waterbodies.addLayer(layer);
        else if (t === "drain") groups.drains.addLayer(layer);
        else groups.streams.addLayer(layer);

        // Label บนแผนที่
        if (p.name && center) {
          let importance = 1;
          if (highlighted) importance = 5;
          else if (t === "river") importance = 4;
          else if (t === "canal") importance = 3;
          else if (t === "waterbody") importance = 3;
          else if (t === "stream") importance = 2;
          else importance = 1;

          let labelSize = "sm";
          if (importance >= 5) labelSize = "xl";
          else if (importance >= 4) labelSize = "lg";
          else if (importance >= 3) labelSize = "md";

          const marker = L.marker([center[1], center[0]], {
            icon: L.divIcon({
              className: `river-label ${labelSize}${highlighted ? ' highlight' : ''}`,
              html: `<span>${p.name}</span>`,
              iconSize: null,
            }),
            interactive: false,
            zIndexOffset: importance * 100,
          });

          marker._importance = importance;
          labelMarkers.push(marker);
        }
      },
    });

    groups.drains.addTo(map);
    groups.streams.addTo(map);
    groups.waterbodies.addTo(map);
    groups.canals.addTo(map);
    groups.rivers.addTo(map);
    groups.labels.addTo(map);

    function updateVisibility() {
      const z = map.getZoom();

      if (z < minZoomForStreams) {
        if (map.hasLayer(groups.streams)) map.removeLayer(groups.streams);
        if (map.hasLayer(groups.drains)) map.removeLayer(groups.drains);
      } else {
        if (!map.hasLayer(groups.streams)) groups.streams.addTo(map);
        if (!map.hasLayer(groups.drains)) groups.drains.addTo(map);
      }

      labelMarkers.forEach(m => {
        const imp = m._importance;
        let shouldShow = false;
        if (imp >= 5) shouldShow = z >= 9;
        else if (imp >= 4) shouldShow = z >= 10;
        else if (imp >= 3) shouldShow = z >= 11;
        else if (imp >= 2) shouldShow = z >= minZoomForLabels;
        else shouldShow = z >= minZoomForSmallLabels;

        if (shouldShow && !groups.labels.hasLayer(m)) {
          groups.labels.addLayer(m);
        } else if (!shouldShow && groups.labels.hasLayer(m)) {
          groups.labels.removeLayer(m);
        }
      });
    }

    map.on("zoomend", updateVisibility);
    updateVisibility();

    return {
      groups: groups,
      featureCount: geojson.features.length,
      labelCount: labelMarkers.length,
      remove: function () { Object.values(groups).forEach(g => map.removeLayer(g)); },
    };
  }

  function getFeatureCenter(feature) {
    const g = feature.geometry;
    if (g.type === "LineString") {
      const coords = g.coordinates;
      if (coords.length === 0) return null;
      const mid = coords[Math.floor(coords.length / 2)];
      return [mid[0], mid[1]];
    } else if (g.type === "Polygon") {
      const ring = g.coordinates[0];
      let sx = 0, sy = 0;
      for (const c of ring) { sx += c[0]; sy += c[1]; }
      return [sx / ring.length, sy / ring.length];
    }
    return null;
  }

  function getFallbackGeoJSON() {
    // เส้นทางน้ำหลัก + สาขา + อ่างเก็บน้ำของจังหวัดหนองบัวลำภู
    // (ใช้เมื่อ Overpass API ใช้ไม่ได้)
    return {
      type: "FeatureCollection",
      features: [
        // ===== ลำน้ำพะเนียง (สายหลักทอดเหนือ-ใต้) =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [101.99304, 17.42065], [101.998, 17.405], [102.015, 17.385],
              [102.035, 17.365], [102.055, 17.355], [102.071, 17.343],
              [102.085, 17.330], [102.095, 17.318], [102.107, 17.310],
              [102.130, 17.290], [102.155, 17.285], [102.180, 17.282],
              [102.205, 17.270], [102.227, 17.267], [102.255, 17.245],
              [102.280, 17.230], [102.310, 17.220], [102.340, 17.215],
              [102.370, 17.220], [102.400, 17.218], [102.428, 17.207],
              [102.450, 17.198], [102.470, 17.180], [102.485, 17.155],
              [102.495, 17.130], [102.500, 17.105], [102.498, 17.080],
              [102.490, 17.055], [102.475, 17.030],
            ],
          },
          properties: { type: "river", name: "ลำน้ำพะเนียง", name_en: "Phaniang River" },
        },
        // ===== ลำน้ำโมง (อ.สุวรรณคูหา) =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.020, 17.620], [102.040, 17.595], [102.060, 17.575],
              [102.080, 17.555], [102.100, 17.535], [102.115, 17.515],
              [102.130, 17.495], [102.150, 17.480], [102.170, 17.465],
              [102.195, 17.450], [102.215, 17.440], [102.235, 17.435],
              [102.255, 17.425], [102.280, 17.415], [102.305, 17.408],
            ],
          },
          properties: { type: "river", name: "ลำน้ำโมง", name_en: "Mong River" },
        },
        // ===== ลำห้วยทราย (สาขาพะเนียง) =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.180, 17.140], [102.195, 17.165], [102.215, 17.190],
              [102.245, 17.215], [102.275, 17.235], [102.310, 17.245],
            ],
          },
          properties: { type: "stream", name: "ลำห้วยทราย", name_en: "Huai Sai" },
        },
        // ===== ลำห้วยลุง =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.080, 17.180], [102.110, 17.200], [102.140, 17.220],
              [102.175, 17.240], [102.210, 17.255],
            ],
          },
          properties: { type: "stream", name: "ลำห้วยลุง", name_en: "Huai Lung" },
        },
        // ===== ลำห้วยทราย-น้อย =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.350, 17.100], [102.375, 17.130], [102.400, 17.160],
              [102.425, 17.185], [102.445, 17.200],
            ],
          },
          properties: { type: "stream", name: "ลำห้วยทรายน้อย", name_en: "Huai Sai Noi" },
        },
        // ===== ลำห้วยกุดดู่ =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.560, 17.050], [102.535, 17.080], [102.510, 17.110],
              [102.495, 17.130],
            ],
          },
          properties: { type: "stream", name: "ลำห้วยกุดดู่", name_en: "Huai Kut Du" },
        },
        // ===== ลำห้วยน้ำเพ็ง =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.230, 17.380], [102.245, 17.355], [102.255, 17.330],
              [102.260, 17.305], [102.255, 17.280],
            ],
          },
          properties: { type: "stream", name: "ลำห้วยน้ำเพ็ง", name_en: "Huai Nam Pheng" },
        },
        // ===== หนองบัว (อ่างกลางเมือง) =====
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [102.428, 17.207], [102.438, 17.207], [102.445, 17.203],
              [102.448, 17.198], [102.444, 17.193], [102.435, 17.190],
              [102.425, 17.193], [102.422, 17.198], [102.425, 17.203],
              [102.428, 17.207],
            ]],
          },
          properties: { type: "waterbody", name: "หนองบัว", name_en: "Nong Bua" },
        },
        // ===== อ่างเก็บน้ำห้วยน้ำบอง =====
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [102.155, 17.380], [102.175, 17.385], [102.185, 17.378],
              [102.183, 17.368], [102.170, 17.365], [102.155, 17.370],
              [102.150, 17.378], [102.155, 17.380],
            ]],
          },
          properties: { type: "waterbody", name: "อ่างเก็บน้ำห้วยน้ำบอง", name_en: "Huai Nam Bong Reservoir" },
        },
        // ===== อ่างเก็บน้ำห้วยทราย =====
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [102.300, 17.260], [102.315, 17.265], [102.322, 17.258],
              [102.318, 17.250], [102.305, 17.248], [102.295, 17.252],
              [102.298, 17.260], [102.300, 17.260],
            ]],
          },
          properties: { type: "waterbody", name: "อ่างเก็บน้ำห้วยทราย", name_en: "Huai Sai Reservoir" },
        },
        // ===== ลำห้วยเสือเต้น =====
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [102.050, 17.450], [102.075, 17.440], [102.100, 17.425],
              [102.130, 17.415], [102.155, 17.400],
            ],
          },
          properties: { type: "stream", name: "ลำห้วยเสือเต้น", name_en: "Huai Suea Ten" },
        },
      ],
    };
  }
})();

(function injectCSS() {
  if (document.getElementById("waterways-css")) return;
  const style = document.createElement("style");
  style.id = "waterways-css";
  style.textContent = `
    .waterway-tooltip {
      background: rgba(255,255,255,0.97) !important;
      border: 1px solid #0284c7 !important;
      color: #0c4a6e !important;
      font-family: 'Sarabun', sans-serif !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 4px 10px !important;
      border-radius: 6px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    }
    .waterway-tooltip.highlight {
      background: #0c4a6e !important;
      color: white !important;
      border-color: #075985 !important;
      font-size: 13px !important;
    }
    .waterway-tooltip::before { display: none !important; }

    .waterway-popup-wrap .leaflet-popup-content-wrapper {
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .waterway-popup-wrap .leaflet-popup-content { margin: 0; }
    .waterway-popup {
      font-family: 'Sarabun', sans-serif;
      padding: 12px 14px;
      min-width: 180px;
    }
    .waterway-popup .wp-title {
      font-weight: 700;
      font-size: 15px;
      color: #0c4a6e;
      margin-bottom: 4px;
    }
    .waterway-popup .wp-type {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .waterway-popup .wp-badge {
      display: inline-block;
      background: linear-gradient(135deg, #0284c7, #0ea5e9);
      color: white;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 12px;
      margin-bottom: 8px;
    }
    .waterway-popup .wp-actions {
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 8px;
    }
    .waterway-popup .wp-actions a {
      font-size: 12px;
      color: #0284c7;
      text-decoration: none;
      font-weight: 500;
    }
    .waterway-popup .wp-actions a:hover { text-decoration: underline; }

    .river-label {
      background: transparent !important;
      border: none !important;
      pointer-events: none;
      white-space: nowrap;
    }
    .river-label span {
      display: inline-block;
      font-family: 'Sarabun', sans-serif;
      font-weight: 700;
      color: #0c4a6e;
      text-shadow:
        -1.5px -1.5px 0 rgba(255,255,255,0.95),
        1.5px -1.5px 0 rgba(255,255,255,0.95),
        -1.5px 1.5px 0 rgba(255,255,255,0.95),
        1.5px 1.5px 0 rgba(255,255,255,0.95),
        0 0 6px rgba(255,255,255,0.95);
      transform: translate(-50%, -50%);
      letter-spacing: 0.3px;
    }
    .river-label.sm span { font-size: 10px; opacity: 0.85; }
    .river-label.md span { font-size: 11px; }
    .river-label.lg span { font-size: 12px; }
    .river-label.xl span {
      font-size: 14px;
      color: #075985;
      letter-spacing: 0.5px;
    }
    .river-label.highlight span {
      color: #075985;
      text-shadow:
        -2px -2px 0 #fff, 2px -2px 0 #fff,
        -2px 2px 0 #fff, 2px 2px 0 #fff,
        0 0 8px #fff, 0 0 8px #fff;
    }
  `;
  document.head.appendChild(style);
})();
