/* ==============================================================
   Agentic Twin — MapLibre + Satellite/Hillshade + OSM Highways
   Trucks: canvas overlay, oriented to motion, spacing, status light
   Commentary + Humanoid TTS
   Falls back to vector tiles if india_motorways.geojson is empty/missing
   ============================================================== */

//// --------------------------- Config ---------------------------

const MAP_INIT = {
  center: [78.9629, 21.5937], // India
  zoom: 4.6,
  minZoom: 3,
  maxZoom: 12,
  pitch: 0,
  bearing: 0
};

// Use our custom style.json (Satellite + Hillshade).
// Make sure you created style.json and pasted your MapTiler key.
const STYLE_URL = "style.json";

// (Optional) CARTO labels (symbols only). Leave empty to skip.
const CARTO_STYLE_JSON_URL = ""; // e.g. "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

// Assets expected in repo root
const TRUCK_IMG = "truck_top.png";
const WH_ICON   = "warehouse_texture.png";

// Warehouse icon sizing
const WAREHOUSE_BASE_PX = 54;    // size at ~zoom 5
const WAREHOUSE_MIN_PX  = 36;
const WAREHOUSE_MAX_PX  = 96;
const warehouseSizeByZoom = (z) =>
  Math.max(WAREHOUSE_MIN_PX, Math.min(WAREHOUSE_MAX_PX, WAREHOUSE_BASE_PX * (0.9 + (z - 5) * 0.28)));

//// --------------------- Commentary + Humanoid TTS ---------------------

const logEl = document.getElementById("commentaryLog");
let t0 = performance.now();
const nowSec = () => ((performance.now() - t0) / 1000).toFixed(1);
function clearLog(){ if (logEl) logEl.textContent = ""; t0 = performance.now(); ttsFlush(true); }
function log(msg, speak=true){ const line=`[t=${nowSec()}s] ${msg}`; if (logEl) logEl.textContent += line+"\n"; console.log(line); if (speak) ttsEnq(msg); }

// TTS
const synth = window.speechSynthesis;
let VOICE=null, q=[], playing=false;
function pickVoice(){
  const prefs=[/en-IN/i,/English.+India/i,/Natural|Neural/i,/Microsoft/i,/Google/i,/en-GB/i,/en-US/i];
  const vs = synth?.getVoices?.() || [];
  for (const p of prefs){ const v = vs.find(v=>p.test(v.name)||p.test(v.lang)); if (v) return v; }
  return vs[0] || null;
}
VOICE = pickVoice(); if (!VOICE && synth) synth.onvoiceschanged = () => { VOICE = pickVoice(); };
const speakNorm = s => String(s).replace(/\bETA\b/gi,"E T A").replace(/\bAI\b/gi,"A I").replace(/WH(\d+)/g,"Warehouse $1").replace(/->|→/g," to ");
function ttsEnq(t){ if(!synth) return; speakNorm(t).split(/(?<=[.!?;])\s+|(?<=,)\s+/).forEach(p=>q.push(p)); if(!playing) playNext(); }
function playNext(){ if(!synth) return; if(!q.length){ playing=false; return; } playing=true; const u=new SpeechSynthesisUtterance(q.shift()); if(VOICE) u.voice=VOICE; u.rate=1.0; u.pitch=1.02; u.onend=playNext; synth.speak(u); }
function ttsFlush(cancel){ q=[]; playing=false; if(cancel&&synth) synth.cancel(); }

//// ----------------------------- Map -----------------------------

const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: MAP_INIT.center,
  zoom: MAP_INIT.zoom,
  pitch: MAP_INIT.pitch,
  bearing: MAP_INIT.bearing,
  hash: false
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");

// Canvas overlay for trucks & labels
const trucksCanvas = document.getElementById("trucksCanvas");
const tctx = trucksCanvas.getContext("2d");
function resizeCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const base = map.getCanvas();
  trucksCanvas.width  = base.clientWidth  * dpr;
  trucksCanvas.height = base.clientHeight * dpr;
  trucksCanvas.style.width  = base.clientWidth  + "px";
  trucksCanvas.style.height = base.clientHeight + "px";
  tctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resizeCanvas);

//// -------------------------- Data & Cities --------------------------

const CITY = {
  WH1:{ name:"WH1 — Delhi",     lat:28.6139, lon:77.2090 },
  WH2:{ name:"WH2 — Mumbai",    lat:19.0760, lon:72.8777 },
  WH3:{ name:"WH3 — Bangalore", lat:12.9716, lon:77.5946 }
};

// Approximate NH44/NH48 “triangle” polylines (lat, lon)
const ROAD_POINTS = {
  "WH1-WH2": [
    [28.6139,77.2090],[26.9124,75.7873],[24.5854,73.7125],
    [23.0225,72.5714],[21.1702,72.8311],[19.0760,72.8777]
  ],
  "WH2-WH3": [
    [19.0760,72.8777],[18.5204,73.8567],[16.7049,74.2433],
    [15.8497,74.4977],[13.3409,77.1010],[12.9716,77.5946]
  ],
  "WH3-WH1": [
    [12.9716,77.5946],[17.3850,78.4867],[21.1458,79.0882],
    [27.1767,78.0081],[28.6139,77.2090]
  ]
};
const keyFor=(a,b)=>`${a}-${b}`;
function getRoadLatLon(a,b){
  const k1=keyFor(a,b), k2=keyFor(b,a);
  if (ROAD_POINTS[k1]) return ROAD_POINTS[k1];
  if (ROAD_POINTS[k2]) return [...ROAD_POINTS[k2]].reverse();
  // fallback straight
  return [[CITY[a].lat, CITY[a].lon],[CITY[b].lat, CITY[b].lon]];
}
function expandRouteIDsToLatLon(ids){
  const out=[];
  for (let i=0;i<ids.length-1;i++){
    const seg = getRoadLatLon(ids[i], ids[i+1]);
    if (i>0) seg.shift();
    out.push(...seg);
  }
  return out;
}

//// ------------------------ Roads (dual source) ------------------------

function getMaptilerKeyFromStyle(map) {
  try {
    const src = map.getStyle().sources['satellite'];
    if (src && src.tiles && src.tiles.length) {
      const u = new URL(src.tiles[0]);
      return u.searchParams.get('key');
    }
  } catch (e) {}
  return null;
}

// Vector tile fallback (OpenMapTiles)
function addVectorRoadLayers() {
  const key = getMaptilerKeyFromStyle(map) || "";
  if (!key) console.warn("MapTiler key not found in style.json. Vector tile roads may fail.");

  if (!map.getSource("omt")) {
    map.addSource("omt", {
      type: "vector",
      url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}`
    });
  }

  if (!map.getLayer("vt-roads-casing")) {
    map.addLayer({
      id: "vt-roads-casing",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ["motorway","trunk","primary"], true, false],
      paint: {
        "line-color": "#2b2f36",
        "line-opacity": 0.92,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4, 0.8, 6, 1.4, 8, 2.6, 10, 4.0, 12, 6.0
        ],
        "line-join": "round",
        "line-cap": "round"
      }
    });
  }
  if (!map.getLayer("vt-roads-centerline")) {
    map.addLayer({
      id: "vt-roads-centerline",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ["motorway","trunk","primary"], true, false],
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.85,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4, 0.2, 6, 0.4, 8, 0.6, 10, 0.9, 12, 1.1
        ],
        "line-dasharray": [2, 2.5]
      }
    });
  }
  log("OSM roads (vector tiles) loaded.", false);
}

// Try local GeoJSON first; if empty/missing, fall back to vector tiles
async function addRoadLayers() {
  if (map.getLayer("roads-casing") || map.getLayer("vt-roads-casing")) return;
  try {
    const resp = await fetch("india_motorways.geojson", { cache: "no-store" });
    if (!resp.ok) throw new Error(`GeoJSON ${resp.status}`);
    const gj = await resp.json();
    const hasFeatures = gj && gj.features && gj.features.length > 0;
    if (!hasFeatures) throw new Error("GeoJSON empty");

    if (!map.getSource("india-roads")) map.addSource("india-roads", { type: "geojson", data: gj });

    map.addLayer({
      id: "roads-casing",
      type: "line",
      source: "india-roads",
      paint: {
        "line-color": "#2b2f36",
        "line-opacity": 0.92,
        "line-width": ["interpolate",["linear"],["zoom"],4,0.8,6,1.4,8,2.6,10,4.0,12,6.0],
        "line-join": "round",
        "line-cap": "round"
      }
    });
    map.addLayer({
      id: "roads-centerline",
      type: "line",
      source: "india-roads",
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.85,
        "line-width": ["interpolate",["linear"],["zoom"],4,0.2,6,0.4,8,0.6,10,0.9,12,1.1],
        "line-dasharray": [2, 2.5]
      }
    });
    log(`OSM roads (GeoJSON) loaded: ${gj.features.length} features.`, false);
  } catch (e) {
    console.warn("GeoJSON roads unavailable -> using vector tiles.", e);
    addVectorRoadLayers();
  }
}

//// ---------------------------- Trucks ----------------------------

const truckImg = new Image();
truckImg.src = TRUCK_IMG;

const whImg = new Image();
whImg.src = WH_ICON;

const trucks = [];
const MIN_GAP_PX = 18;

function defaultPathIDs(o,d){
  if (o===d) return [o];
  const k1=keyFor(o,d), k2=keyFor(d,o);
  if (ROAD_POINTS[k1] || ROAD_POINTS[k2]) return [o,d];
  if (o!=="WH2" && d!=="WH2") return [o,"WH2",d];
  return [o,d];
}

function spawnTruck(tr, reroutes){
  const delayed = (tr.status && String(tr.status).toLowerCase()==="delayed") || (tr.delay_hours||0)>0;
  let pathIds = reroutes.get(tr.id) || defaultPathIDs(tr.origin, tr.destination);
  if (pathIds[0] !== tr.origin) pathIds.unshift(tr.origin);
  if (pathIds[pathIds.length-1] !== tr.destination) pathIds.push(tr.destination);

  const latlon = expandRouteIDsToLatLon(pathIds);
  if (latlon.length < 2) return;

  const startT = Math.random() * 0.22;                   // de-pairing
  const base = delayed ? 2.88 : 4.32;                    // ~20% faster baseline
  const speed = base * (0.92 + Math.random()*0.16);      // variance
  const startDelay = 250 + Math.random()*900;

  trucks.push({
    id: tr.id,
    latlon,
    seg: 0,
    t: startT,
    dir: 1,
    speed,                 // abstract; scaled per frame by pixel distance
    delayed,
    startAt: performance.now() + startDelay
  });
}

function drawTrucks(){
  const canvas = map.getCanvas(); if (!canvas) return;

  // clear
  tctx.clearRect(0,0,trucksCanvas.width,trucksCanvas.height);

  const now = performance.now();

  for (const T of trucks){
    if (now < T.startAt) continue;

    const a = T.latlon[T.seg], b = T.latlon[T.seg + T.dir] || a;
    const aP = map.project({lng:a[1], lat:a[0]});
    const bP = map.project({lng:b[1], lat:b[0]});
    const segLenPx = Math.max(1, Math.hypot(bP.x - aP.x, bP.y - aP.y));

    // px/sec scaled by zoom
    const pxPerSec = T.speed * (0.9 + (map.getZoom()-4) * 0.12);
    const dtSec = 1/60;
    let dT = (pxPerSec * dtSec) / segLenPx;

    // maintain spacing on same segment + direction
    const myProg = T.t * segLenPx;
    let minLead = Infinity;
    for (const O of trucks){
      if (O===T || now < O.startAt) continue;
      if (O.latlon[O.seg]===T.latlon[T.seg] && O.latlon[O.seg+O.dir]===T.latlon[T.seg+T.dir] && O.dir===T.dir) {
        const a2 = map.project({lng:O.latlon[O.seg][1], lat:O.latlon[O.seg][0]});
        const b2 = map.project({lng:O.latlon[O.seg+O.dir][1], lat:O.latlon[O.seg+O.dir][0]});
        const segLen2 = Math.max(1, Math.hypot(b2.x - a2.x, b2.y - a2.y));
        const oProg = O.t * segLen2;
        if (oProg > myProg) minLead = Math.min(minLead, oProg - myProg);
      }
    }
    if (isFinite(minLead) && minLead < MIN_GAP_PX) dT *= Math.max(0.25, (minLead/MIN_GAP_PX) * 0.7);

    T.t += dT;
    if (T.t >= 1){
      T.seg += T.dir; T.t -= 1;
      if (T.seg <= 0){ T.seg = 0; T.dir = 1; }
      else if (T.seg >= T.latlon.length-1){ T.seg = T.latlon.length-1; T.dir = -1; }
    }

    // current position (px)
    const x = aP.x + (bP.x - aP.x) * T.t;
    const y = aP.y + (bP.y - aP.y) * T.t;

    // rotation in screen space
    const theta = Math.atan2(bP.y - aP.y, bP.x - aP.x);

    // draw truck
    const baseW=26, baseH=13;
    const z = map.getZoom();
    const scale = 0.9 + (z-4)*0.10;
    const w = baseW*scale, h = baseH*scale;

    tctx.save();
    tctx.translate(x, y);
    tctx.rotate(theta);
    if (truckImg.complete) {
      tctx.drawImage(truckImg, -w/2, -h/2, w, h);
    } else {
      tctx.fillStyle = T.delayed ? "#ff3b30" : "#00c853";
      tctx.fillRect(-w/2, -h/2, w, h);
    }
    // status light (attached to sprite)
    tctx.fillStyle = T.delayed ? "#ff3b30" : "#00c853";
    tctx.beginPath(); tctx.arc(w*0.32, -h*0.15, 3, 0, Math.PI*2); tctx.fill();
    tctx.restore();
  }

  map.triggerRepaint();
}

function drawWarehouseLabels(){
  tctx.save();
  const z = map.getZoom();
  tctx.font = "bold 12px system-ui, Segoe UI, Roboto, sans-serif";
  tctx.textBaseline = "middle";

  const centroid = map.project({
    lng: (CITY.WH1.lon + CITY.WH2.lon + CITY.WH3.lon) / 3,
    lat: (CITY.WH1.lat + CITY.WH2.lat + CITY.WH3.lat) / 3
  });

  for (const id of Object.keys(CITY)){
    const c = CITY[id];
    const p = map.project({ lng: c.lon, lat: c.lat });

    // BIG icon
    const S = warehouseSizeByZoom(z);
    if (whImg.complete) tctx.drawImage(whImg, p.x - S/2, p.y - S/2, S, S);
    else { tctx.fillStyle="#3c82f6"; tctx.beginPath(); tctx.arc(p.x,p.y,S/2,0,Math.PI*2); tctx.fill(); }

    // label pushed outward from centroid
    const label = c.name;
    const pad = 6, h = 18, w = tctx.measureText(label).width + pad*2;
    const dx = p.x - centroid.x, dy = p.y - centroid.y;
    const rot = (id==="WH3") ? 0.18 : (id==="WH2" ? -0.08 : 0.08);
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const ex = dx*ca - dy*sa, ey = dx*sa + dy*ca;
    const push = S/2 + 12;
    const len = Math.max(1, Math.hypot(ex, ey));
    const px = p.x + (ex/len) * push;
    const py = p.y + (ey/len) * push;

    tctx.fillStyle = "rgba(10,10,11,0.82)";
    tctx.strokeStyle = "rgba(255,255,255,0.25)";
    tctx.fillRect(px - w/2, py - h/2, w, h);
    tctx.strokeRect(px - w/2, py - h/2, w, h);
    tctx.fillStyle = "#e6e6e6";
    tctx.fillText(label, px - w/2 + pad, py);
  }
  tctx.restore();
}

//// ---------------------- Optional CARTO labels ----------------------

async function addCartoLabels(){
  if (!CARTO_STYLE_JSON_URL) { log("CARTO labels skipped.", false); return; }
  try{
    const resp = await fetch(CARTO_STYLE_JSON_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const cartoStyle = await resp.json();
    for (const [sid, src] of Object.entries(cartoStyle.sources||{})){
      if (!map.getSource(sid)) map.addSource(sid, src);
    }
    (cartoStyle.layers||[])
      .filter(l => l.type === "symbol")
      .forEach(l => {
        const layer = JSON.parse(JSON.stringify(l));
        if (!map.getLayer(layer.id)) {
          try { map.addLayer(layer); } catch(e){ /* ignore */ }
        }
      });
    log("CARTO labels added.", false);
  }catch(e){
    console.warn(e); log("CARTO labels failed to load; continuing without.", false);
  }
}

//// ------------------------- Scenario loading -------------------------

window.loadScenario = async function(file, labelFromCaller){
  try{
    clearLog(); log(`Loading scenario: ${file}`);

    // reset trucks
    trucks.length = 0;

    // cache-bust
    const url = `${file}${file.includes('?') ? '&' : '?'}v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${file}`);

    const raw = await res.text();
    let data; try { data = JSON.parse(raw); }
    catch (e) { throw new Error(`JSON parse error: ${e.message}\nPreview: ${raw.slice(0,160)}…`); }

    const reroutes = new Map();
    if (Array.isArray(data.reroutes)) for (const r of data.reroutes) {
      if (Array.isArray(r.path) && r.truckId) reroutes.set(r.truckId, r.path.slice());
    }

    let total=0, delayed=0;
    for (const tr of (data.trucks||[])){
      const isDelayed = (tr.status && String(tr.status).toLowerCase()==="delayed") || (tr.delay_hours||0)>0;
      spawnTruck(tr, reroutes);
      total++; if (isDelayed) delayed++;
    }

    log(`Warehouses rendered: 3`, false);
    log(`Trucks rendered: ${total} (delayed=${delayed})`, false);

    const isAfter=/after/i.test(file);
    const label = labelFromCaller || (isAfter ? "After correction" : "Normal operations");
    if (typeof data?.commentary?.static === 'string') {
      log(`${label}: ${data.commentary.static}`);
    } else {
      log(`${label}: ${(data?.warehouses||[]).length||3} warehouses, ${(data?.trucks||[]).length||0} trucks.`);
    }

    let tl = data?.commentary?.timeline;
    if (tl) tl = Array.isArray(tl) ? tl : (typeof tl === 'object' ? Object.values(tl) : null);
    if (Array.isArray(tl)) {
      for (const step of tl) {
        try {
          const d = Number(step?.delay_ms) || 0;
          if (d > 0) await new Promise(r => setTimeout(r, d));
          if (typeof step?.msg === 'string') log(step.msg, true);
        } catch (e) { log(`Timeline step skipped: ${e.message}`, false); }
      }
    }

    if (Array.isArray(data.reroutes) && data.reroutes.length){
      log(`Reroutes applied: ${data.reroutes.length}`, false);
      for (const r of data.reroutes){
        const reason=r.reason?` (${r.reason})`:''; 
        const path=Array.isArray(r.path)?` via ${r.path.join(' → ')}`:'';
        log(`Truck ${r.truckId} rerouted${reason}${path}`, true);
      }
      log("Network stabilized after corrections.");
    }
  } catch (err) {
    console.error(err); log(`Error: ${err.message}`);
  }
};

//// ------------------------------ Hooks ------------------------------

map.on("load", async () => {
  resizeCanvas();
  await addRoadLayers();     // GeoJSON → fallback to vector tiles
  await addCartoLabels();    // optional
  log("Map & layers ready.", false);
  loadScenario("scenario_before.json","Normal operations");
});
map.on("render", () => {
  drawTrucks();
  drawWarehouseLabels();
});
map.on("resize", resizeCanvas);
