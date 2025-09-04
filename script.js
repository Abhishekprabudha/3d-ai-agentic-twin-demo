/* =========================================================================
   Agentic Twin — Staged Disruptions
   - White base corridors
   - One-at-a-time red disruption (Before)
   - Same corridor flips green on After, then auto-advance
   - Warehouse stats card (inventory, inflow/outflow)
   - Truck numbers rendered on each vehicle
   - No timeline / no commentary panel
   ======================================================================= */

/* -------------------- small debug pill (optional) -------------------- */
let __DBG = null;
function debugSet(msg) {
  if (!__DBG) {
    __DBG = document.createElement("div");
    __DBG.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(0,0,0,0.55);color:#eaf1f7;font:12px/1.35 system-ui,Segoe UI,Roboto,sans-serif;padding:6px 8px;border-radius:6px;pointer-events:none";
    document.body.appendChild(__DBG);
  }
  __DBG.textContent = msg || "";
}
window.addEventListener("error", (e) => debugSet(`Error: ${e.message || e}`));

/* -------------------- config -------------------- */
const STYLE_URL = "style.json"; // your MapLibre/MapTiler style
const MAP_INIT = { center: [78.9629, 21.5937], zoom: 5.5, minZoom: 3, maxZoom: 12 };
const WAREHOUSE_ICON_SRC = "warehouse_iso.png"; // transparent PNG (root with index.html)

/* -------------------- anchors -------------------- */
const CITY = {
  WH1: { name: "WH1 — Delhi",     lat: 28.6139, lon: 77.2090 },
  WH2: { name: "WH2 — Mumbai",    lat: 19.0760, lon: 72.8777 },
  WH3: { name: "WH3 — Bangalore", lat: 12.9716, lon: 77.5946 },
  WH4: { name: "WH4 — Hyderabad", lat: 17.3850, lon: 78.4867 },
  WH5: { name: "WH5 — Kolkata",   lat: 22.5726, lon: 88.3639 },
};

/* -------------------- corridors (lat,lon arrays) -------------------- */
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
const keyFor=(a,b)=>`${a}-${b}`;
const toLonLat = (latlon)=> latlon.map(p=>[p[1],p[0]]);
function getRoadLatLon(a,b){
  const k1=keyFor(a,b), k2=keyFor(b,a);
  if (RP[k1]) return RP[k1];
  if (RP[k2]) return [...RP[k2]].reverse();
  return [[CITY[a].lat,CITY[a].lon],[CITY[b].lat,CITY[b].lon]];
}
function expandIDsToLatLon(ids){
  const out=[]; for(let i=0;i<ids.length-1;i++){ const seg=getRoadLatLon(ids[i],ids[i+1]); if(i>0) seg.shift(); out.push(...seg); }
  return out;
}
function networkGeoJSON(){
  return { type:"FeatureCollection", features:Object.keys(RP).map(k=>({
    type:"Feature", properties:{id:k}, geometry:{ type:"LineString", coordinates: toLonLat(RP[k]) }
  }))};
}

/* -------------------- simple scenario (fallback) -------------------- */
const DEFAULT_BEFORE = {
  warehouses: Object.keys(CITY).map(id=>({id,location:CITY[id].name.split("—")[1].trim(),inventory:500})),
  trucks: [
    {id:"T1", origin:"WH1", destination:"WH2", status:"On-Time", delay_hours:0},
    {id:"T2", origin:"WH2", destination:"WH3", status:"On-Time", delay_hours:0},
    {id:"T3", origin:"WH3", destination:"WH1", status:"On-Time", delay_hours:0},
    {id:"T4", origin:"WH4", destination:"WH1", status:"Delayed", delay_hours:5},
    {id:"T5", origin:"WH4", destination:"WH2", status:"On-Time", delay_hours:0},
    {id:"T6", origin:"WH4", destination:"WH3", status:"On-Time", delay_hours:0},
    {id:"T7", origin:"WH4", destination:"WH5", status:"On-Time", delay_hours:0},
    {id:"T8", origin:"WH5", destination:"WH1", status:"On-Time", delay_hours:0},
    {id:"T9", origin:"WH5", destination:"WH2", status:"On-Time", delay_hours:0},
    {id:"T10",origin:"WH5", destination:"WH3", status:"On-Time", delay_hours:0},
  ]
};

/* -------------------- staged disruptions list -------------------- */
const STEPS = [
  { id:"D1", route:["WH1","WH2"], ask:"Disruption detected on Delhi–Mumbai corridor. Press After Correction to apply the fix, or I’ll proceed shortly." },
  { id:"D2", route:["WH4","WH1"], ask:"Disruption detected on Hyderabad–Delhi corridor." },
  { id:"D3", route:["WH5","WH2"], ask:"Disruption detected on Kolkata–Mumbai corridor." },
  { id:"D4", route:["WH2","WH3"], ask:"Disruption detected on Mumbai–Bangalore corridor." },
  { id:"D5", route:["WH5","WH3"], ask:"Disruption detected on Kolkata–Bangalore corridor." },
];

/* -------------------- MapLibre map -------------------- */
const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: MAP_INIT.center,
  zoom: MAP_INIT.zoom,
  minZoom: MAP_INIT.minZoom,
  maxZoom: MAP_INIT.maxZoom,
  attributionControl: true
});
map.addControl(new maplibregl.NavigationControl({visualizePitch:false}), "top-left");

/* -------------------- overlay canvas for trucks/labels -------------------- */
let overlay=null, ctx=null;
function ensureCanvas(){
  overlay = document.getElementById("trucksCanvas");
  if(!overlay){
    overlay = document.createElement("canvas");
    overlay.id="trucksCanvas";
    overlay.style.cssText="position:absolute;inset:0;pointer-events:none;z-index:2;";
    map.getContainer().appendChild(overlay);
  }
  ctx = overlay.getContext("2d");
  resizeCanvas();
}
function resizeCanvas(){
  if(!overlay) return;
  const base = map.getCanvas();
  const dpr = window.devicePixelRatio||1;
  overlay.width  = base.clientWidth  * dpr;
  overlay.height = base.clientHeight * dpr;
  overlay.style.width  = base.clientWidth  + "px";
  overlay.style.height = base.clientHeight + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resizeCanvas);

/* -------------------- base white routes + highlight layers -------------------- */
function ensureRoadLayers(){
  const net = networkGeoJSON();

  if(!map.getSource("routes")) map.addSource("routes",{type:"geojson",data:net});
  else map.getSource("routes").setData(net);

  if(!map.getLayer("routes-base")){
    // halo to improve legibility
    map.addLayer({
      id:"routes-halo", type:"line", source:"routes",
      paint:{ "line-color":"#9fb4ff", "line-opacity":0.22, "line-width":7.5 },
      layout:{ "line-cap":"round", "line-join":"round" }
    });
    // white base
    map.addLayer({
      id:"routes-base", type:"line", source:"routes",
      paint:{ "line-color":"#ffffff", "line-opacity":0.9, "line-width":3.0 },
      layout:{ "line-cap":"round", "line-join":"round" }
    });
  }

  // red highlight (current disruption)
  if(!map.getSource("alert")) map.addSource("alert",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("alert-red")){
    map.addLayer({
      id:"alert-red", type:"line", source:"alert",
      paint:{ "line-color":"#ff6b6b", "line-opacity":0.95, "line-width":4.2 },
      layout:{ "line-cap":"round", "line-join":"round" }
    });
  }

  // green fix layer
  if(!map.getSource("fix")) map.addSource("fix",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("fix-green")){
    map.addLayer({
      id:"fix-green", type:"line", source:"fix",
      paint:{ "line-color":"#00d08a", "line-opacity":0.95, "line-width":4.6 },
      layout:{ "line-cap":"round", "line-join":"round" }
    });
  }
}
function featureForRoute(ids){
  return { type:"Feature",
    properties:{ id: ids.join("-") },
    geometry:{ type:"LineString", coordinates: toLonLat(expandIDsToLatLon(ids)) }
  };
}
function setSourceFC(srcId, features){
  const fc = {type:"FeatureCollection", features: features||[]};
  const src = map.getSource(srcId); if(src) src.setData(fc);
}

/* -------------------- warehouses (icon + label) -------------------- */
const WH_IMG = new Image(); let WH_READY=false;
WH_IMG.onload=()=>{ WH_READY=true; };
WH_IMG.onerror=()=>{ WH_READY=false; debugSet("warehouse_iso.png missing at root"); };
WH_IMG.src = `${WAREHOUSE_ICON_SRC}?v=${Date.now()}`;

const WH_BASE=30, WH_MIN=18, WH_MAX=42;
const sizeByZoom = z => Math.max(WH_MIN, Math.min(WH_MAX, WH_BASE*(0.9 + (z-5)*0.18)));
function drawWarehouses(){
  if(!ctx) return; const z=map.getZoom();
  ctx.font="bold 11px system-ui, Segoe UI, Roboto, sans-serif";
  for(const id of Object.keys(CITY)){
    const c=CITY[id], p=map.project({lng:c.lon, lat:c.lat}), S=sizeByZoom(z);
    if(WH_READY) ctx.drawImage(WH_IMG, p.x-S/2, p.y-S/2, S, S);
    const label=c.name, pad=6, h=16, w=ctx.measureText(label).width+pad*2, py=p.y+S/2+12;
    ctx.fillStyle="rgba(10,10,12,0.78)"; ctx.fillRect(p.x-w/2, py-h/2, w, h);
    ctx.fillStyle="#e8eef2"; ctx.textBaseline="middle"; ctx.fillText(label, p.x-w/2+pad, py);
  }
}

/* -------------------- trucks -------------------- */
const trucks=[]; const truckNumberById=new Map();
const SPEED_MULTIPLIER=9.2, MIN_GAP_PX=50, CROSS_GAP_PX=34, LANES_PER_ROUTE=3, LANE_WIDTH_PX=6.5, MIN_STEP=0.010;

function defaultPathIDs(o,d){
  const k1=keyFor(o,d), k2=keyFor(d,o);
  if(RP[k1]||RP[k2]) return [o,d];
  return (o!=="WH4"&&d!=="WH4") ? [o,"WH4",d] : [o,d];
}
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return Math.abs(h); }
function segProject(pt){ return map.project({lng:pt[1], lat:pt[0]}); }

function spawnTruck(tr, idx){
  const delayed=(tr.status||"").toLowerCase()==="delayed" || (tr.delay_hours||0)>0;
  const ids = defaultPathIDs(tr.origin,tr.destination);
  const latlon=expandIDsToLatLon(ids); if(latlon.length<2) return;

  const startT=Math.random()*0.55;
  const base=delayed?2.88:4.32;
  const speed=base*(0.92+Math.random()*0.16);
  const startDelay=300+Math.random()*800;
  const laneIndex=((hashStr(tr.id)%LANES_PER_ROUTE)+LANES_PER_ROUTE)%LANES_PER_ROUTE;

  trucks.push({ id:tr.id, latlon, seg:0, t:startT, dir:1, speed, delayed, laneIndex, startAt:performance.now()+startDelay });
  truckNumberById.set(tr.id, idx+1);
}
function drawVectorTruck(g,w,h,delayed,number){
  const trW=w*0.78,trH=h*0.72;
  g.fillStyle="rgba(0,0,0,0.25)"; g.beginPath(); g.ellipse(0,trH*0.35,trW*0.9,trH*0.42,0,0,Math.PI*2); g.fill();
  const grad=g.createLinearGradient(-trW/2,0,trW/2,0); grad.addColorStop(0,"#eef2f6"); grad.addColorStop(1,"#cfd7df");
  g.fillStyle=grad; g.strokeStyle="#6f7a86"; g.lineWidth=1.2; g.beginPath(); g.roundRect(-trW/2,-trH/2,trW,trH,3); g.fill(); g.stroke();
  const cw=w*0.34,ch=h*0.72,cg=g.createLinearGradient(-cw/2,0,cw/2,0); cg.addColorStop(0,"#b3bcc6"); cg.addColorStop(1,"#9aa5b2");
  g.fillStyle=cg; g.strokeStyle="#5f6771"; g.beginPath(); g.roundRect(-w/2,-ch/2,cw,ch,3); g.fill(); g.stroke();
  g.fillStyle="#26303a"; g.fillRect(-w/2+2,-ch*0.44,cw-4,ch*0.32);

  // small number badge
  const R=7; g.fillStyle="#ffffff"; g.strokeStyle="#20262e"; g.lineWidth=1.2;
  g.beginPath(); g.arc(trW*0.18,-trH*0.2,R,0,Math.PI*2); g.fill(); g.stroke();
  g.fillStyle="#111"; g.font="bold 9px system-ui"; g.textAlign="center"; g.textBaseline="middle";
  g.fillText(String(number), trW*0.18, -trH*0.2);

  g.fillStyle=delayed?"#ff3b30":"#00c853"; g.beginPath(); g.arc(trW*0.32,-trH*0.28,3.2,0,Math.PI*2); g.fill();
}

/* animation */
let __lastTS=performance.now(), __dt=1/60;
function drawFrame(){
  if(!ctx) return;
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const now=performance.now();

  for(const T of trucks){
    if(now<T.startAt) continue;
    const a=T.latlon[T.seg], b=T.latlon[T.seg+T.dir] || a;
    const aP=segProject(a), bP=segProject(b);
    const segLenPx=Math.max(1,Math.hypot(bP.x-aP.x,bP.y-aP.y));
    let pxPerSec=SPEED_MULTIPLIER*T.speed*(0.9+(map.getZoom()-4)*0.12);
    let step=(pxPerSec*__dt)/segLenPx;

    const myProg=T.t*segLenPx; let minLead=Infinity;
    for(const O of trucks){
      if(O===T||now<O.startAt) continue;
      if(O.latlon[O.seg]===T.latlon[T.seg] && O.latlon[O.seg+O.dir]===T.latlon[T.seg+T.dir] && O.dir===T.dir){
        const a2=segProject(O.latlon[O.seg]), b2=segProject(O.latlon[O.seg+O.dir]);
        const seg2=Math.max(1,Math.hypot(b2.x-a2.x,b2.y-a2.y));
        const oProg=O.t*seg2; if(oProg>myProg) minLead=Math.min(minLead,oProg-myProg);
      }
    }
    if(isFinite(minLead)&&minLead<MIN_GAP_PX) step*=Math.max(0.25,(minLead/MIN_GAP_PX)*0.7);

    const x1=aP.x+(bP.x-aP.x)*T.t, y1=aP.y+(bP.y-aP.y)*T.t; let nearest=Infinity;
    for(const O of trucks){
      if(O===T||now<O.startAt) continue;
      const aO=segProject(O.latlon[O.seg]), bO=segProject(O.latlon[O.seg+O.dir]);
      const xO=aO.x+(bO.x-aO.x)*O.t, yO=aO.y+(bO.y-aO.y)*O.t;
      nearest=Math.min(nearest, Math.hypot(xO-x1,yO-y1));
    }
    if(isFinite(nearest)&&nearest<CROSS_GAP_PX) step*=Math.max(0.30,(nearest/CROSS_GAP_PX)*0.6);

    step=Math.max(step,MIN_STEP);
    T.t+=step;
    if(T.t>=1){ T.seg+=T.dir; T.t-=1; if(T.seg<=0){T.seg=0;T.dir=1;} else if(T.seg>=T.latlon.length-1){T.seg=T.latlon.length-1;T.dir=-1;} }

    const theta=Math.atan2(bP.y-aP.y,bP.x-aP.x);
    const nx=-(bP.y-aP.y), ny=(bP.x-aP.x), nL=Math.max(1,Math.hypot(nx,ny));
    const laneZero=T.laneIndex-(LANES_PER_ROUTE-1)/2, off=laneZero*LANE_WIDTH_PX;
    const x=x1+(nx/nL)*off, y=y1+(ny/nL)*off;

    const z=map.getZoom(), scale=1.0+(z-4)*0.12, w=28*scale, h=14*scale;
    const num=truckNumberById.get(T.id)||0;
    ctx.save(); ctx.translate(x,y); ctx.rotate(theta); drawVectorTruck(ctx,w,h,T.delayed,num); ctx.restore();
  }

  drawWarehouses();
}

/* -------------------- narration (concise) -------------------- */
const synth = window.speechSynthesis;
let VOICE = null;
function pickVoice(){
  const vs=synth?.getVoices?.()||[];
  const prefs=[/en-IN/i,/English.+India/i,/Neural|Natural/i,/Microsoft|Google/i,/en-GB/i,/en-US/i];
  for(const p of prefs){ const v=vs.find(v=>p.test(v.name)||p.test(v.lang)); if(v) return v; }
  return vs[0]||null;
}
VOICE = pickVoice();
if(!VOICE && synth) synth.onvoiceschanged = ()=>{ VOICE = pickVoice(); };

let ttsTimers=[];
function clearTTS(){ ttsTimers.forEach(clearTimeout); ttsTimers=[]; try{synth?.cancel?.();}catch(e){} }
function speakOnce(text){ if(!synth||!text) return; const u=new SpeechSynthesisUtterance(String(text)); if(VOICE) u.voice=VOICE; u.rate=1.02; u.pitch=1.02; u.volume=1; synth.speak(u); }
function speakQueue(lines,gap=300){
  clearTTS(); let t=0;
  lines.forEach(line=>{
    const dur=Math.max(1100,38*line.length);
    ttsTimers.push(setTimeout(()=>speakOnce(line),t));
    t+=dur+gap;
  });
}

/* -------------------- scenario + stats -------------------- */
async function fetchOrDefault(file, fallback){
  try{
    const url=`${file}${file.includes("?")?"&":"?"}v=${Date.now()}`;
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }catch(err){ debugSet(`Using default: ${err.message}`); return fallback; }
}

function updateStats(data){
  const tbody=document.querySelector("#statsTable tbody");
  tbody.innerHTML="";
  const inCount={}, outCount={};
  (data.trucks||[]).forEach(t=>{
    outCount[t.origin]=(outCount[t.origin]||0)+1;
    inCount[t.destination]=(inCount[t.destination]||0)+1;
  });
  (data.warehouses||[]).forEach(w=>{
    const tr=document.createElement("tr");
    const inV=inCount[w.id]||0, outV=outCount[w.id]||0;
    tr.innerHTML=`<td>${CITY[w.id]?.name||w.id}</td>
                  <td>${w.inventory ?? "-"}</td>
                  <td class="pos">+${inV}</td>
                  <td class="neg">-${outV}</td>`;
    tbody.appendChild(tr);
  });
}

/* -------------------- disruption stepper -------------------- */
let stepIndex=0, advanceTimer=null;

function fcFor(ids){ return {type:"FeatureCollection",features:[featureForRoute(ids)]}; }
function clearTimer(){ if(advanceTimer) { clearTimeout(advanceTimer); advanceTimer=null; } }

function showBeforeStep(){
  clearTimer(); clearTTS();
  const step = STEPS[stepIndex]; if(!step){ finishShow(); return; }
  // red the current route, clear green
  setSourceFC("alert",[featureForRoute(step.route)]);
  setSourceFC("fix",[]);
  speakQueue([step.ask]);
  // auto-advance in 6s to next disruption (without green if user doesn't click)
  advanceTimer=setTimeout(()=>{ whiteOutCurrentThenNext(); }, 6000);
}
function whiteOutCurrentThenNext(){
  // Clear red and move to next step
  setSourceFC("alert",[]);
  stepIndex++;
  if(stepIndex>=STEPS.length){ finishShow(); return; }
  showBeforeStep();
}
function applyAfterForCurrent(){
  clearTimer(); clearTTS();
  const step = STEPS[stepIndex]; if(!step){ finishShow(); return; }
  // flip to green
  setSourceFC("alert",[]);
  setSourceFC("fix",[featureForRoute(step.route)]);
  speakQueue(["Fix applied. Corridor clear and reroute successful."]);
  // after 3s, clear green and move to next red step
  advanceTimer=setTimeout(()=>{
    setSourceFC("fix",[]);
    stepIndex++;
    if(stepIndex>=STEPS.length){ finishShow(); return; }
    showBeforeStep();
  }, 3000);
}
function finishShow(){
  clearTimer(); clearTTS();
  setSourceFC("alert",[]); setSourceFC("fix",[]);
  speakQueue(["All disruptions processed. Network stable."]);
}

/* -------------------- boot -------------------- */
const mapReady = new Promise(res => map.on("load", res));
(async function start(){
  await mapReady;
  ensureCanvas(); ensureRoadLayers();

  const data = await fetchOrDefault("scenario_before.json", DEFAULT_BEFORE);
  updateStats(data);

  // place trucks
  trucks.length=0; truckNumberById.clear();
  (data.trucks||[]).forEach((t,i)=> spawnTruck(t,i));

  // camera
  const b=new maplibregl.LngLatBounds(); Object.values(CITY).forEach(c=>b.extend([c.lon,c.lat]));
  map.fitBounds(b,{padding:{top:60,left:60,right:320,bottom:60},duration:800,maxZoom:6.8});

  // kick off stepper
  stepIndex=0; showBeforeStep();
})();

function tick(){
  const now=performance.now(); const dt=Math.min(0.05,(now-__lastTS)/1000); __lastTS=now; __dt=dt;
  drawFrame(); requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* -------------------- UI -------------------- */
document.getElementById("btnBefore").addEventListener("click", ()=> showBeforeStep());
document.getElementById("btnAfter").addEventListener("click",  ()=> applyAfterForCurrent());
