/* =========================================================================
   Agentic Twin • Corridors always on + continuous narration (queue)
   - Warehouse icon: root /warehouse_iso.png (small, no ring)
   - Corridors: base red, reroutes green (both semi-transparent)
   - Trucks: continuous motion (independent render loop)
   - Robust layer creation so lines never disappear
   ======================================================================= */

/* ---------- Map config ---------- */
const STYLE_URL = "style.json";
const MAP_INIT = {
  center: [78.9629, 21.5937],
  zoom: 5.4,
  minZoom: 3,
  maxZoom: 12,
};

const WAREHOUSE_ICON_SRC = "warehouse_iso.png"; // root-level image

/* ---------- Warehouse coordinates ---------- */
const CITY = {
  WH1: { name: "WH1 — Delhi",     lat: 28.6139, lon: 77.2090 },
  WH2: { name: "WH2 — Mumbai",    lat: 19.0760, lon: 72.8777 },
  WH3: { name: "WH3 — Bangalore", lat: 12.9716, lon: 77.5946 },
  WH4: { name: "WH4 — Hyderabad", lat: 17.3850, lon: 78.4867 },
  WH5: { name: "WH5 — Kolkata",   lat: 22.5726, lon: 88.3639 },
};

/* ---------- Densified corridor polylines (lat,lon) ---------- */
const RP = {
  "WH1-WH2": [[28.6139,77.2090],[27.0,76.8],[25.6,75.2],[24.1,73.5],[23.0,72.6],[21.17,72.83],[19.9,72.9],[19.076,72.8777]],
  "WH2-WH3": [[19.0760,72.8777],[18.52,73.8567],[16.9,74.5],[15.9,74.5],[13.8,76.4],[12.9716,77.5946]],
  "WH3-WH1": [[12.9716,77.5946],[16.0,78.1],[17.3850,78.4867],[21.0,79.1],[26.9,78.0],[28.6139,77.2090]],
  "WH4-WH1": [[17.3850,78.4867],[21.1458,79.0882],[27.1767,78.0081],[28.6139,77.2090]],
  "WH4-WH2": [[17.3850,78.4867],[18.0,76.5],[18.52,73.8567],[19.0760,72.8777]],
  "WH4-WH3": [[17.3850,78.4867],[16.0,77.8],[14.8,77.3],[13.34,77.10],[12.9716,77.5946]],
  "WH4-WH5": [[17.3850,78.4867],[18.0,82.0],[19.2,84.8],[21.0,86.0],[22.5726,88.3639]],
  "WH5-WH1": [[22.5726,88.3639],[23.6,86.1],[24.3,83.0],[25.4,81.8],[26.45,80.35],[27.1767,78.0081],[28.6139,77.2090]],
  "WH5-WH2": [[22.5726,88.3639],[23.5,86.0],[22.5,84.0],[21.5,81.5],[21.1,79.0],[20.3,76.5],[19.3,74.5],[19.0760,72.8777]],
  "WH5-WH3": [[22.5726,88.3639],[21.15,85.8],[19.5,85.8],[17.9,82.7],[16.5,80.3],[13.3409,77.1010],[12.9716,77.5946]],
};
const keyFor = (a,b) => `${a}-${b}`;
function getRoadLatLon(a,b){
  const k1 = keyFor(a,b), k2 = keyFor(b,a);
  if (RP[k1]) return RP[k1];
  if (RP[k2]) return [...RP[k2]].reverse();
  return [[CITY[a].lat, CITY[a].lon], [CITY[b].lat, CITY[b].lon]];
}
function expandIDsToLatLon(ids){
  const out=[];
  for(let i=0;i<ids.length-1;i++){
    const seg=getRoadLatLon(ids[i], ids[i+1]);
    if(i>0) seg.shift();
    out.push(...seg);
  }
  return out;
}
const toLonLat = pts => pts.map(p => [p[1], p[0]]);
function networkGeoJSON(){
  return {
    type:"FeatureCollection",
    features: Object.keys(RP).map(k => ({
      type:"Feature",
      properties:{ id:k },
      geometry:{ type:"LineString", coordinates: toLonLat(RP[k]) }
    }))
  };
}

/* ---------- Map + overlay canvas ---------- */
const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: MAP_INIT.center,
  zoom: MAP_INIT.zoom,
  minZoom: MAP_INIT.minZoom,
  maxZoom: MAP_INIT.maxZoom,
  attributionControl: true
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch:false }), "top-left");

const trucksCanvas = document.getElementById("trucksCanvas");
const tctx = trucksCanvas.getContext("2d");

function resizeCanvas(){
  const base = map.getCanvas();
  const dpr = window.devicePixelRatio || 1;
  trucksCanvas.width  = base.clientWidth  * dpr;
  trucksCanvas.height = base.clientHeight * dpr;
  trucksCanvas.style.width  = base.clientWidth  + "px";
  trucksCanvas.style.height = base.clientHeight + "px";
  tctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resizeCanvas);

/* ---------- Text-to-speech: queued narration ---------- */
const synth = window.speechSynthesis;
let VOICE = null;
function pickVoice(){
  const vs = synth?.getVoices?.() || [];
  const prefs = [/en-IN/i,/English.+India/i,/Natural|Neural/i,/Microsoft|Google/i,/en-GB/i,/en-US/i];
  for(const p of prefs){ const v = vs.find(v => p.test(v.name)||p.test(v.lang)); if(v) return v; }
  return vs[0] || null;
}
VOICE = pickVoice();
if (!VOICE && synth) synth.onvoiceschanged = ()=>{ VOICE = pickVoice(); };

function speakOnce(text){
  if(!synth || !text) return;
  const u = new SpeechSynthesisUtterance(String(text));
  if(VOICE) u.voice = VOICE;
  u.rate = 1.02; u.pitch = 1.02; u.volume = 1;
  synth.speak(u);
}

let ttsTimers = [];
function clearTTS(){
  ttsTimers.forEach(clearTimeout); ttsTimers = [];
  try{ synth && synth.cancel && synth.cancel(); }catch(e){}
}
function speakQueue(lines, gapMs=350){
  clearTTS();
  let t=0;
  lines.forEach(line=>{
    const dur = Math.max(1400, 44*line.length); // rough duration model
    ttsTimers.push(setTimeout(()=>speakOnce(line), t));
    t += dur + gapMs;
  });
}

/* ---------- Roads: robust creation so they never vanish ---------- */
function ensureRoadLayers(rerouteFeatureCollection){
  // Base network (red)
  if(!map.getSource("routes")){
    map.addSource("routes",{ type:"geojson", data: networkGeoJSON() });
  } else {
    map.getSource("routes").setData(networkGeoJSON());
  }
  if(!map.getLayer("routes-red")){
    map.addLayer({
      id:"routes-red", type:"line", source:"routes",
      paint:{
        "line-color":"#ff4d4d",
        "line-opacity":0.38,
        "line-width":["interpolate",["linear"],["zoom"],4,2.4,6,3.2,8,4.4,10,5.2,12,6.4],
        "line-join":"round","line-cap":"round"
      }
    });
  }

  // Reroutes (green + dash highlight)
  if(!map.getSource("reroutes")){
    map.addSource("reroutes",{ type:"geojson", data: rerouteFeatureCollection });
  } else {
    map.getSource("reroutes").setData(rerouteFeatureCollection);
  }
  if(!map.getLayer("reroutes-green")){
    map.addLayer({
      id:"reroutes-green", type:"line", source:"reroutes",
      paint:{
        "line-color":"#00dc8c",
        "line-opacity":0.55,
        "line-width":["interpolate",["linear"],["zoom"],4,2.6,6,3.6,8,4.8,10,5.8,12,7.0]
      }
    });
  }
  if(!map.getLayer("reroutes-dash")){
    map.addLayer({
      id:"reroutes-dash", type:"line", source:"reroutes",
      paint:{
        "line-color":"#00ffd0",
        "line-opacity":0.85,
        "line-width":["interpolate",["linear"],["zoom"],4,1.1,6,1.5,8,2.1,10,2.6,12,3.0],
        "line-dasharray":[0.4, 2.2]
      }
    });
    // animate dash
    let phase = 0;
    (function tick(){
      phase = (phase + 0.12) % 3.0;
      try{ map.setPaintProperty("reroutes-dash","line-dasharray",[0.4+phase, 2.2]); }catch(e){}
      requestAnimationFrame(tick);
    })();
  }
}

/* ---------- Warehouse icon (small, no ring) ---------- */
const WH_IMG = new Image();
let WH_READY = false;
WH_IMG.onload = ()=>{ WH_READY = true; };
WH_IMG.onerror = ()=>{ WH_READY = false; };
WH_IMG.src = `${WAREHOUSE_ICON_SRC}?v=${Date.now()}`; // cache-bust once

const WH_BASE = 42, WH_MIN = 28, WH_MAX = 64;
const sizeByZoom = z => Math.max(WH_MIN, Math.min(WH_MAX, WH_BASE*(0.9 + (z-5)*0.22)));

function drawWarehouseIcons(){
  const z = map.getZoom();
  tctx.font = "bold 11px system-ui, Segoe UI, Roboto, sans-serif";
  for(const id of Object.keys(CITY)){
    const c = CITY[id];
    const p = map.project({lng:c.lon, lat:c.lat});
    const S = sizeByZoom(z);
    if(WH_READY) tctx.drawImage(WH_IMG, p.x - S/2, p.y - S/2, S, S);

    const label = c.name;
    const pad=6, h=16, w=tctx.measureText(label).width + pad*2;
    const py = p.y + (S/2) + 12;
    tctx.fillStyle = "rgba(10,10,12,0.78)";
    tctx.fillRect(p.x - w/2, py - h/2, w, h);
    tctx.fillStyle = "#e8eef2";
    tctx.textBaseline = "middle";
    tctx.fillText(label, p.x - w/2 + pad, py);
  }
}

/* ---------- Trucks (continuous) ---------- */
const SPEED_MULTIPLIER = 9.5;
const MIN_GAP_PX = 50;
const CROSS_GAP_PX = 34;
const LANES_PER_ROUTE = 3;
const LANE_WIDTH_PX   = 6.5;
const MIN_STEP = 0.010;

const trucks = [];
function defaultPathIDs(o,d){
  if(o===d) return [o];
  const k1=keyFor(o,d), k2=keyFor(d,o);
  if(RP[k1]||RP[k2]) return [o,d];
  return (o!=="WH4" && d!=="WH4") ? [o,"WH4",d] : [o,d];
}
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); }
function spawnTruck(tr, reroutes){
  const delayed = (tr.status && String(tr.status).toLowerCase()==="delayed") || (tr.delay_hours||0)>0;
  let ids = reroutes.get(tr.id) || defaultPathIDs(tr.origin, tr.destination);
  if(ids[0]!==tr.origin) ids.unshift(tr.origin);
  if(ids[ids.length-1]!==tr.destination) ids.push(tr.destination);

  const latlon = expandIDsToLatLon(ids);
  if(latlon.length<2) return;

  const startT = Math.random()*0.55;
  const base = delayed ? 2.88 : 4.32;
  const speed = base*(0.92+Math.random()*0.16);
  const startDelay = 400 + Math.random()*900;
  const laneIndex = ((hashStr(tr.id)%LANES_PER_ROUTE)+LANES_PER_ROUTE)%LANES_PER_ROUTE;

  trucks.push({ id:tr.id, latlon, seg:0, t:startT, dir:1, speed, delayed, laneIndex, startAt:performance.now()+startDelay });
}

function segProject(pt){ return map.project({lng:pt[1], lat:pt[0]}); }
function drawVectorTruck(ctx,w,h,delayed){
  const trW=w*0.78, trH=h*0.72;
  ctx.fillStyle="rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(0,trH*0.35,trW*0.9,trH*0.42,0,0,Math.PI*2); ctx.fill();
  const grad = ctx.createLinearGradient(-trW/2,0,trW/2,0);
  grad.addColorStop(0,"#eef2f6"); grad.addColorStop(1,"#cfd7df");
  ctx.fillStyle=grad; ctx.strokeStyle="#6f7a86"; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.roundRect(-trW/2,-trH/2,trW,trH,3); ctx.fill(); ctx.stroke();
  const cabW=w*0.34,cabH=h*0.72; const cg=ctx.createLinearGradient(-cabW/2,0,cabW/2,0);
  cg.addColorStop(0,"#b3bcc6"); cg.addColorStop(1,"#9aa5b2");
  ctx.fillStyle=cg; ctx.strokeStyle="#5f6771";
  ctx.beginPath(); ctx.roundRect(-w/2,-cabH/2,cabW,cabH,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#26303a"; ctx.fillRect(-w/2+2,-cabH*0.44,cabW-4,cabH*0.32);
  ctx.fillStyle = delayed ? "#ff3b30" : "#00c853";
  ctx.beginPath(); ctx.arc(trW*0.32,-trH*0.28,3.2,0,Math.PI*2); ctx.fill();
}
function drawTrucks(){
  tctx.clearRect(0,0,trucksCanvas.width,trucksCanvas.height);
  const now = performance.now();
  for(const T of trucks){
    if(now<T.startAt) continue;
    const a=T.latlon[T.seg], b=T.latlon[T.seg+T.dir]||a;
    const aP=segProject(a), bP=segProject(b);
    const segLenPx = Math.max(1, Math.hypot(bP.x-aP.x, bP.y-aP.y));

    let pxPerSec = SPEED_MULTIPLIER*T.speed*(0.9+(map.getZoom()-4)*0.12);
    let step = (pxPerSec * __dt) / segLenPx;

    const myProg=T.t*segLenPx; let minLead=Infinity;
    for(const O of trucks){
      if(O===T||now<O.startAt) continue;
      if(O.latlon[O.seg]===T.latlon[T.seg] && O.latlon[O.seg+O.dir]===T.latlon[T.seg+T.dir] && O.dir===T.dir){
        const a2=segProject(O.latlon[O.seg]); const b2=segProject(O.latlon[O.seg+O.dir]);
        const seg2=Math.max(1,Math.hypot(b2.x-a2.x,b2.y-a2.y));
        const oProg=O.t*seg2;
        if(oProg>myProg) minLead=Math.min(minLead,oProg-myProg);
      }
    }
    if(isFinite(minLead)&&minLead<MIN_GAP_PX) step*=Math.max(0.25,(minLead/MIN_GAP_PX)*0.7);

    const x1=aP.x + (bP.x-aP.x)*T.t, y1=aP.y + (bP.y-aP.y)*T.t;
    let nearest=Infinity;
    for(const O of trucks){
      if(O===T||now<O.startAt) continue;
      const aO=segProject(O.latlon[O.seg]); const bO=segProject(O.latlon[O.seg+O.dir]);
      const xO=aO.x + (bO.x-aO.x)*O.t, yO=aO.y + (bO.y-aO.y)*O.t;
      const d=Math.hypot(xO-x1,yO-y1);
      if(d<nearest) nearest=d;
    }
    if(isFinite(nearest)&&nearest<CROSS_GAP_PX) step*=Math.max(0.30,(nearest/CROSS_GAP_PX)*0.6);

    step = Math.max(step, MIN_STEP);
    T.t += step;
    if(T.t>=1){
      T.seg += T.dir; T.t -= 1;
      if(T.seg<=0){ T.seg=0; T.dir=1; }
      else if(T.seg>=T.latlon.length-1){ T.seg=T.latlon.length-1; T.dir=-1; }
    }

    // draw oriented & lane offset
    const theta = Math.atan2(bP.y-aP.y, bP.x-aP.x);
    const nx = -(bP.y-aP.y), ny = (bP.x-aP.x); const nL = Math.max(1, Math.hypot(nx,ny));
    const laneZero = T.laneIndex - (LANES_PER_ROUTE-1)/2;
    const off = laneZero * LANE_WIDTH_PX;
    const x = x1 + (nx/nL)*off, y = y1 + (ny/nL)*off;
    const z = map.getZoom(), scale = 1.0+(z-4)*0.12, w = 28*scale, h = 14*scale;

    tctx.save(); tctx.translate(x,y); tctx.rotate(theta);
    drawVectorTruck(tctx,w,h,T.delayed);
    tctx.restore();
  }
  drawWarehouseIcons();
}

/* ---------- Scenario loader with narration ---------- */
function fitToWarehouses(){
  const b = new maplibregl.LngLatBounds();
  Object.values(CITY).forEach(c => b.extend([c.lon,c.lat]));
  map.fitBounds(b, { padding:{top:60,left:60,right:60,bottom:60}, duration:800, maxZoom:6.8 });
}
function narrationFor(data, mode){
  const trucks = data.trucks || [];
  const delayed = trucks.filter(t => (t.status||"").toLowerCase()==="delayed" || (t.delay_hours||0)>0).length;
  const whs = (data.warehouses||[]).map(w => w.id).join(", ");
  const lines = [];
  if(mode==="before"){
    lines.push("Before disruption. Baseline flows across the India network.");
  } else {
    lines.push("After correction. Green corridors show active reroutes.");
  }
  lines.push(`${trucks.length} trucks in motion, ${delayed} delayed.`);
  if(whs) lines.push(`Warehouses included: ${whs}.`);
  if(mode==="after" && Array.isArray(data.reroutes) && data.reroutes.length){
    lines.push(`Reroutes applied: ${data.reroutes.length}.`);
  }
  lines.push("Monitoring inventory risk and ETA recovery while the network clears.");
  return lines;
}

window.loadScenario = async function(file, label){
  try{
    trucks.length = 0;
    clearTTS();

    const url = `${file}${file.includes('?')?'&':'?'}v=${Date.now()}`;
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} while fetching ${file}`);
    const data = await res.json();

    // Build reroute features
    const reroutes = new Map();
    const rerouteFeatures = [];
    if(Array.isArray(data.reroutes)){
      for(const r of data.reroutes){
        if(r.truckId && Array.isArray(r.path) && r.path.length>=2){
          reroutes.set(r.truckId, r.path.slice());
          const coords = toLonLat(expandIDsToLatLon(r.path));
          rerouteFeatures.push({ type:"Feature", properties:{truckId:r.truckId}, geometry:{ type:"LineString", coordinates:coords }});
        }
      }
    }
    // Ensure roads & overlays exist and are updated
    const rerouteFC = { type:"FeatureCollection", features: rerouteFeatures };
    ensureRoadLayers(rerouteFC);

    // Spawn trucks
    for(const tr of (data.trucks||[])) spawnTruck(tr, reroutes);

    // Fit & narrate a full sequence
    fitToWarehouses();
    const mode = /after/i.test(file) || /after/i.test(label||"") ? "after" : "before";
    speakQueue(narrationFor(data, mode), 350);
  }catch(err){
    console.error(err);
    speakQueue([`Scenario load error: ${err.message}`]);
  }
};

/* ---------- Map boot ---------- */
map.on("load", ()=>{
  resizeCanvas();
  // First draw of roads (empty reroutes) so layers exist
  ensureRoadLayers({type:"FeatureCollection",features:[]});
  // Initial scenario
  loadScenario("scenario_before.json","Before Disruption");
  fitToWarehouses();
});

// If the style ever reloads (sprite / source refresh), re-ensure layers
map.on("styledata", ()=>{
  try{
    ensureRoadLayers(map.getSource("reroutes")?.serialize?.().data || {type:"FeatureCollection",features:[]});
  }catch(e){ /* no-op */ }
});

// Hide any old commentary/timeline UI if still present
(() => {
  const ids = ["commentary","timeline"]; ids.forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display="none";
  });
})();

/* ---------- Continuous render loop ---------- */
let __lastTS = performance.now();
let __dt = 1/60;
function loop(){
  const now = performance.now();
  __dt = Math.min(0.05, (now - __lastTS) / 1000);
  __lastTS = now;
  drawTrucks();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
