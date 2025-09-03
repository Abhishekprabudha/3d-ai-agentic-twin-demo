/* ==============================================================
   Agentic Twin — Satellite + Hillshade + OSM Highways
   Upgrades in this build:
   1) Sharp vector warehouse icon (wow look)
   2) Trucks 4× baseline speed (double again from last 2×)
   3) No written commentary (voice only) – panel hidden
   4) Roads glow clearly + extra glow on the triangle routes
   5) Crisp vector truck drawing (top view) with status LED
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

// Use your custom style.json (Satellite + Hillshade with MapTiler key)
const STYLE_URL = "style.json";

// (Optional) CARTO labels (symbols only). Leave empty to skip.
const CARTO_STYLE_JSON_URL = "";

// Assets (kept for fallback only)
const TRUCK_IMG = "truck_top.png";
const WH_ICON   = "warehouse_texture.png";

// Warehouses: draw vector by default (sharper than PNG)
const USE_VECTOR_WAREHOUSE = true;
const WAREHOUSE_BASE_PX = 72;  // bigger “wow”
const WAREHOUSE_MIN_PX  = 44;
const WAREHOUSE_MAX_PX  = 120;
const warehouseSizeByZoom = (z) =>
  Math.max(WAREHOUSE_MIN_PX, Math.min(WAREHOUSE_MAX_PX, WAREHOUSE_BASE_PX * (0.9 + (z - 5) * 0.28)));

// Trucks: speed & spacing
const SPEED_MULTIPLIER = 4.0;   // 4× baseline (previously 2×)
const MIN_GAP_PX       = 44;    // headway along same segment
const CROSS_GAP_PX     = 30;    // gap when crossing other trucks

// Commentary: voice only; hide panel
const SHOW_TEXT_LOG = false;

// Hide the commentary panel immediately
(() => {
  const panel = document.getElementById("commentary");
  if (panel) panel.style.display = "none";
})();

//// --------------------- Commentary + Humanoid TTS ---------------------

const logEl = document.getElementById("commentaryLog"); // will be hidden
let t0 = performance.now();
const nowSec = () => ((performance.now() - t0) / 1000).toFixed(1);
function clearLog(){ if (SHOW_TEXT_LOG && logEl) logEl.textContent = ""; t0 = performance.now(); ttsFlush(true); }
function log(msg, speak=true){
  const line=`[t=${nowSec()}s] ${msg}`;
  if (SHOW_TEXT_LOG && logEl) logEl.textContent += line+"\n";
  console.log(line);
  if (speak) ttsEnq(msg);
}

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

// Canvas overlay
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

// Triangle polylines (lat, lon) roughly along NH44 / NH48
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
function triangleRoutesGeoJSON(){
  const toLonLat = pts => pts.map(p => [p[1], p[0]]);
  return {
    type:"FeatureCollection",
    features: Object.keys(ROAD_POINTS).map(k => ({
      type:"Feature",
      properties:{ id:k },
      geometry:{ type:"LineString", coordinates: toLonLat(ROAD_POINTS[k]) }
    }))
  };
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

// Vector tile fallback with strong glow
function addVectorRoadLayers() {
  const key = getMaptilerKeyFromStyle(map) || "";
  if (!key) console.warn("MapTiler key not found in style.json.");

  if (!map.getSource("omt")) {
    map.addSource("omt", { type: "vector", url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}` });
  }

  const roadFilter = ["match", ["get", "class"], ["motorway","trunk","primary"], true, false];

  if (!map.getLayer("vt-roads-glow")) {
    map.addLayer({
      id: "vt-roads-glow",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: roadFilter,
      paint: {
        "line-color": "#4fd1ff",
        "line-opacity": 0.55,
        "line-blur": 1.0,
        "line-width": ["interpolate",["linear"],["zoom"],4,3.2,6,4.6,8,7.4,10,11.0,12,14.0],
        "line-join": "round",
        "line-cap": "round"
      }
    });
  }

  if (!map.getLayer("vt-roads-casing")) {
    map.addLayer({
      id: "vt-roads-casing",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: roadFilter,
      paint: {
        "line-color": "#0e1116",
        "line-opacity": 0.95,
        "line-width": ["interpolate",["linear"],["zoom"],4,1.6,6,2.6,8,4.4,10,6.8,12,9.2],
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
      filter: roadFilter,
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.95,
        "line-width": ["interpolate",["linear"],["zoom"],4,0.7,6,1.1,8,1.5,10,2.0,12,2.4],
        "line-dasharray": [3, 2.1]
      }
    });
  }

  // Extra glow overlay exactly on our triangle routes
  addTriangleGlowLayers();
  log("OSM roads (vector tiles) + triangle glow loaded.", false);
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

    // Glow base
    map.addLayer({
      id: "roads-glow",
      type: "line",
      source: "india-roads",
      paint: {
        "line-color": "#4fd1ff",
        "line-opacity": 0.55,
        "line-blur": 1.0,
        "line-width": ["interpolate",["linear"],["zoom"],4,3.2,6,4.6,8,7.4,10,11.0,12,14.0],
        "line-join": "round",
        "line-cap": "round"
      }
    });

    // Asphalt casing
    map.addLayer({
      id: "roads-casing",
      type: "line",
      source: "india-roads",
      paint: {
        "line-color": "#0e1116",
        "line-opacity": 0.95,
        "line-width": ["interpolate",["linear"],["zoom"],4,1.6,6,2.6,8,4.4,10,6.8,12,9.2],
        "line-join": "round",
        "line-cap": "round"
      }
    });

    // Centerline
    map.addLayer({
      id: "roads-centerline",
      type: "line",
      source: "india-roads",
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.95,
        "line-width": ["interpolate",["linear"],["zoom"],4,0.7,6,1.1,8,1.5,10,2.0,12,2.4],
        "line-dasharray": [3, 2.1]
      }
    });

    // Extra glow overlay on triangle
    addTriangleGlowLayers();

    log(`OSM roads (GeoJSON) + triangle glow loaded: ${gj.features.length} features.`, false);
  } catch (e) {
    console.warn("GeoJSON roads unavailable -> using vector tiles.", e);
    addVectorRoadLayers();
  }
}

// Add “full glow” exactly on our WH1↔WH2↔WH3 triangle routes
function addTriangleGlowLayers(){
  const srcId = "triangle-routes";
  if (!map.getSource(srcId)) {
    map.addSource(srcId, { type:"geojson", data: triangleRoutesGeoJSON() });
  }
  if (!map.getLayer("triangle-glow")) {
    map.addLayer({
      id: "triangle-glow",
      type: "line",
      source: srcId,
      paint: {
        "line-color": "#7de3ff",
        "line-opacity": 0.66,
        "line-blur": 1.2,
        "line-width": ["interpolate",["linear"],["zoom"],4,4.2,6,6.0,8,9.0,10,13.5,12,18.0],
        "line-join": "round",
        "line-cap": "round"
      }
    });
  }
  if (!map.getLayer("triangle-core")) {
    map.addLayer({
      id: "triangle-core",
      type: "line",
      source: srcId,
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.95,
        "line-width": ["interpolate",["linear"],["zoom"],4,1.0,6,1.6,8,2.2,10,3.0,12,3.6]
      }
    });
  }
}

//// ---------------------------- Trucks ----------------------------

const truckImg = new Image(); truckImg.src = TRUCK_IMG;
const whImg    = new Image(); whImg.src    = WH_ICON;

const trucks = [];

// Default path if no reroute provided
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

  const startT = Math.random() * 0.5;                 // strong de-pairing
  const base = delayed ? 2.88 : 4.32;
  const speed = base * (0.92 + Math.random()*0.16);
  const startDelay = 900 + Math.random()*1500;         // stagger departures

  trucks.push({
    id: tr.id, latlon,
    seg: 0, t: startT, dir: 1,
    speed, delayed,
    startAt: performance.now() + startDelay
  });
}

// Helpers
function truckScreenPos(T){
  const a = T.latlon[T.seg], b = T.latlon[T.seg + T.dir] || a;
  const aP = map.project({lng:a[1], lat:a[0]});
  const bP = map.project({lng:b[1], lat:b[0]});
  const x = aP.x + (bP.x - aP.x) * T.t;
  const y = aP.y + (bP.y - aP.y) * T.t;
  return {x,y,aP,bP};
}

// Vector truck sprite (crisp top view)
function drawVectorTruck(ctx, w, h, delayed){
  const r = Math.min(w,h)/2;
  // body shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, r*0.38, r*0.95, r*0.42, 0, 0, Math.PI*2); ctx.fill();

  // trailer
  const trW = w*0.78, trH = h*0.72;
  const trailGrad = ctx.createLinearGradient(-trW/2,0,trW/2,0);
  trailGrad.addColorStop(0,"#e9edf2"); trailGrad.addColorStop(1,"#cdd6de");
  ctx.fillStyle = trailGrad; ctx.strokeStyle = "#6f7a86"; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.roundRect(-trW/2, -trH/2, trW, trH, 3); ctx.fill(); ctx.stroke();

  // cab
  const cabW = w*0.34, cabH = h*0.72;
  const cabGrad = ctx.createLinearGradient(-cabW/2,0,cabW/2,0);
  cabGrad.addColorStop(0,"#b3bcc6"); cabGrad.addColorStop(1,"#9aa5b2");
  ctx.fillStyle = cabGrad; ctx.strokeStyle = "#5f6771";
  ctx.beginPath(); ctx.roundRect(-w/2, -cabH/2, cabW, cabH, 3); ctx.fill(); ctx.stroke();

  // windshield
  ctx.fillStyle = "#26303a";
  ctx.fillRect(-w/2 + 2, -cabH*0.44, cabW-4, cabH*0.32);

  // wheels
  ctx.fillStyle = "#1b1f24"; ctx.strokeStyle = "#444a52"; ctx.lineWidth=1;
  const wy = trH*0.5 - 2;
  [ -1, 1 ].forEach(side=>{
    ctx.beginPath(); ctx.roundRect(-trW*0.35, side*wy - 2.5, trW*0.28, 5, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect( trW*0.06, side*wy - 2.5, trW*0.28, 5, 2); ctx.fill(); ctx.stroke();
  });

  // status LED
  ctx.fillStyle = delayed ? "#ff3b30" : "#00c853";
  ctx.beginPath(); ctx.arc(trW*0.32, -trH*0.28, 3.2, 0, Math.PI*2); ctx.fill();
}

function drawTrucks(){
  tctx.clearRect(0,0,trucksCanvas.width,trucksCanvas.height);
  const now = performance.now();

  for (const T of trucks){
    if (now < T.startAt) continue;

    const a = T.latlon[T.seg], b = T.latlon[T.seg + T.dir] || a;
    const aP = map.project({lng:a[1], lat:a[0]});
    const bP = map.project({lng:b[1], lat:b[0]});
    const segLenPx = Math.max(1, Math.hypot(bP.x - aP.x, bP.y - aP.y));

    // speed (px/sec) with 4× multiplier
    let pxPerSec = SPEED_MULTIPLIER * T.speed * (0.9 + (map.getZoom()-4) * 0.12);
    const dtSec = 1/60;
    let dT = (pxPerSec * dtSec) / segLenPx;

    // spacing on same segment/direction
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
    if (isFinite(minLead) && minLead < MIN_GAP_PX) dT *= Math.max(0.2, (minLead/MIN_GAP_PX) * 0.6);

    // cross-traffic avoidance (screen-space)
    const {x:cx,y:cy} = truckScreenPos(T);
    let nearest = Infinity;
    for (const O of trucks){
      if (O===T || now < O.startAt) continue;
      const p = truckScreenPos(O);
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < nearest) nearest = d;
    }
    if (isFinite(nearest) && nearest < CROSS_GAP_PX) dT *= Math.max(0.25, (nearest / CROSS_GAP_PX) * 0.6);

    // integrate
    T.t += dT;
    if (T.t >= 1){
      T.seg += T.dir; T.t -= 1;
      if (T.seg <= 0){ T.seg = 0; T.dir = 1; }
      else if (T.seg >= T.latlon.length-1){ T.seg = T.latlon.length-1; T.dir = -1; }
    }

    // position & angle
    const theta = Math.atan2(bP.y - aP.y, bP.x - aP.x);
    const x = aP.x + (bP.x - aP.x) * T.t;
    const y = aP.y + (bP.y - aP.y) * T.t;

    // sprite size scales with zoom
    const baseW=28, baseH=14;
    const z = map.getZoom();
    const scale = 1.0 + (z-4)*0.12;
    const w = baseW*scale, h = baseH*scale;

    tctx.save();
    tctx.translate(x, y);
    tctx.rotate(theta);

    // draw crisp vector truck; fallback to PNG if available
    if (true) { // always use vector for sharpness
      drawVectorTruck(tctx, w, h, T.delayed);
    } else if (truckImg.complete) {
      tctx.drawImage(truckImg, -w/2, -h/2, w, h);
    } else {
      tctx.fillStyle = T.delayed ? "#ff3b30" : "#00c853";
      tctx.fillRect(-w/2, -h/2, w, h);
    }

    tctx.restore();
  }

  map.triggerRepaint();
}

//// -------------------- Warehouse drawing (sharp vector) --------------

function drawWarehouseIcon(ctx, x, y, S){
  // pixel-snap for razor-sharp strokes
  const snap = (v) => Math.round(v) + 0.5;

  ctx.save();
  ctx.translate(Math.round(x)+0.5, Math.round(y)+0.5);

  const r = S / 2;

  // soft ground shadow for depth
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, r*0.62, r*0.88, r*0.36, 0, 0, Math.PI*2);
  ctx.fill();

  // concrete pad
  const padGrad = ctx.createLinearGradient(0, -r, 0, r);
  padGrad.addColorStop(0, "#1a1f27");
  padGrad.addColorStop(1, "#0d1016");
  ctx.fillStyle = padGrad;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(snap(-r), snap(-r), S, S, 10); ctx.fill(); ctx.stroke();

  // building body
  const bw = S*0.70, bh = S*0.50;
  const bodyGrad = ctx.createLinearGradient(0, -bh/2, 0, bh/2);
  bodyGrad.addColorStop(0, "#dbe2ea");
  bodyGrad.addColorStop(1, "#b7c0ca");
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = "#77808b";
  ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.roundRect(snap(-bw/2), snap(-bh/2), bw, bh, 6); ctx.fill(); ctx.stroke();

  // roof ribs
  ctx.strokeStyle = "#aab3bd";
  ctx.lineWidth = 1;
  const ribs = 6;
  for (let i=0;i<=ribs;i++){
    const t = i/ribs;
    const yy = -bh/2 + 6 + t*(bh-12);
    ctx.beginPath();
    ctx.moveTo(snap(-bw/2 + 6), snap(yy));
    ctx.lineTo(snap(bw/2 - 6), snap(yy));
    ctx.stroke();
  }

  // skylights
  const skylW = bw*0.14, skylH = bh*0.16;
  const skylGrad = ctx.createLinearGradient(-skylW/2,0,skylW/2,0);
  skylGrad.addColorStop(0, "#eaf2ff");
  skylGrad.addColorStop(1, "#c9d7ef");
  ctx.fillStyle = skylGrad;
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  const skylY = -bh*0.14;
  const gap  = bw*0.22;
  for (let i=-1;i<=1;i+=2){
    ctx.beginPath();
    ctx.roundRect(snap(i*gap - skylW/2), snap(skylY - skylH/2), skylW, skylH, 3);
    ctx.fill(); ctx.stroke();
  }

  // loading bay / shutter
  const shW = bw*0.44, shH = bh*0.36, shY = bh*0.06;
  const frameGrad = ctx.createLinearGradient(0, shY, 0, shY+shH);
  frameGrad.addColorStop(0, "#8f98a3"); frameGrad.addColorStop(1, "#6f7780");
  ctx.fillStyle = frameGrad;
  ctx.beginPath(); ctx.roundRect(snap(-shW/2), snap(shY), shW, shH, 4); ctx.fill();

  // shutter slats
  ctx.strokeStyle = "#525a63";
  ctx.lineWidth = 1;
  const slats = 6;
  for (let i=1;i<slats;i++){
    const yy = shY + (i/slats)*shH;
    ctx.beginPath();
    ctx.moveTo(snap(-shW/2 + 6), snap(yy));
    ctx.lineTo(snap(shW/2 - 6), snap(yy));
    ctx.stroke();
  }

  // inner shutter shade
  ctx.fillStyle = "#3f464f";
  ctx.fillRect(snap(-shW/2 + 4), snap(shY + shH*0.55), shW-8, shH*0.45);

  // subtle edge highlight
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(snap(-bw/2), snap(-bh/2), bw, bh, 6); ctx.stroke();

  ctx.restore();
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

    const S = warehouseSizeByZoom(z);
    if (USE_VECTOR_WAREHOUSE) drawWarehouseIcon(tctx, p.x, p.y, S);
    else if (whImg.complete)  tctx.drawImage(whImg, p.x - S/2, p.y - S/2, S, S);
    else                      drawWarehouseIcon(tctx, p.x, p.y, S);

    // label pushed outward
    const label = c.name;
    const pad = 6, h = 18, w = tctx.measureText(label).width + pad*2;
    const dx = p.x - centroid.x, dy = p.y - centroid.y;
    const rot = (id==="WH3") ? 0.18 : (id==="WH2" ? -0.08 : 0.08);
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const ex = dx*ca - dy*sa, ey = dx*sa + dy*ca;
    const push = S/2 + 14;
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
    (cartoStyle.layers||[]).filter(l => l.type === "symbol").forEach(l => {
      const layer = JSON.parse(JSON.stringify(l));
      if (!map.getLayer(layer.id)) { try { map.addLayer(layer); } catch(e){} }
    });
    log("CARTO labels added.", false);
  }catch(e){ console.warn(e); log("CARTO labels failed; continuing.", false); }
}

//// ------------------------- Scenario loading -------------------------

window.loadScenario = async function(file,labelFromCaller){
  try{
    clearLog(); log(`Loading scenario: ${file}`, false); // voice off for this one

    trucks.length = 0;

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

    // Speak only the high-level line if provided
    const isAfter=/after/i.test(file);
    const label = labelFromCaller || (isAfter ? "After correction" : "Normal operations");
    if (typeof data?.commentary?.static === 'string') {
      ttsEnq(`${label}: ${data.commentary.static}`);
    }
    let tl = data?.commentary?.timeline;
    if (tl) tl = Array.isArray(tl) ? tl : (typeof tl === 'object' ? Object.values(tl) : null);
    if (Array.isArray(tl)) {
      for (const step of tl) {
        try {
          const d = Number(step?.delay_ms) || 0;
          if (d > 0) await new Promise(r => setTimeout(r, d));
          if (typeof step?.msg === 'string') ttsEnq(step.msg);
        } catch {}
      }
    }
  } catch (err) {
    console.error(err); log(`Error: ${err.message}`, false);
  }
};

//// ------------------------------ Hooks ------------------------------

map.on("load", async () => {
  resizeCanvas();
  await addRoadLayers();     // GeoJSON → vector tiles; + triangle glow
  await addCartoLabels();    // optional
  loadScenario("scenario_before.json","Normal operations");
});
map.on("render", () => {
  drawTrucks();
  drawWarehouseLabels();
});
map.on("resize", resizeCanvas);
