/* ============================================================
   Agentic Twin — Focused Load + Continuous Motion + Sharp WH
   ============================================================ */

/* ---------- Map config ---------- */
const STYLE_URL = "style.json";                    // MapLibre style
const MAP_INIT   = { center:[78.9629,21.5937], zoom:5.0, minZoom:3, maxZoom:12 };
const SHOW_TEXT_LOG = false;                       // hide text commentary (voice only)

/* ---------- DOM ---------- */
const logEl = document.getElementById("commentaryLog");
const tooltip = document.getElementById("tooltip");
const tipTitle = document.getElementById("tipTitle");
const tipInv   = document.getElementById("tipInv");
const tipIn    = document.getElementById("tipIn");
const tipOut   = document.getElementById("tipOut");

const tl = {
  wrap: document.getElementById("timeline"),
  play: document.getElementById("tlPlay"),
  speedBtn: document.getElementById("tlSpeed"),
  barWrap: document.getElementById("barWrap"),
  barProg: document.getElementById("barProg"),
  markers: [],
  items: [],
  totalMs: 0,
  t0: 0,
  playing: false,
  speed: 1,
  spokenIdx: -1,
  progressMs: 0
};

/* ---------- Warehouse coordinates ---------- */
const CITY = {
  WH1:{ name:"WH1 — Delhi",      lat:28.6139, lon:77.2090 },
  WH2:{ name:"WH2 — Mumbai",     lat:19.0760, lon:72.8777 },
  WH3:{ name:"WH3 — Bangalore",  lat:12.9716, lon:77.5946 },
  WH4:{ name:"WH4 — Hyderabad",  lat:17.3850, lon:78.4867 },
  WH5:{ name:"WH5 — Kolkata",    lat:22.5726, lon:88.3639 }
};

/* ---------- “Highway-ish” densified corridors (lat,lon) ---------- */
const RP = {
  "WH1-WH2":[[28.6139,77.2090],[27.0,76.8],[25.6,75.2],[24.1,73.5],[23.0,72.6],[21.17,72.83],[19.9,72.9],[19.076,72.8777]],
  "WH2-WH3":[[19.0760,72.8777],[18.52,73.8567],[16.9,74.5],[15.9,74.5],[13.8,76.4],[12.9716,77.5946]],
  "WH3-WH1":[[12.9716,77.5946],[16.0,78.1],[17.3850,78.4867],[21.0,79.1],[26.9,78.0],[28.6139,77.2090]],
  "WH4-WH1":[[17.3850,78.4867],[21.1458,79.0882],[27.1767,78.0081],[28.6139,77.2090]],
  "WH4-WH2":[[17.3850,78.4867],[18.0,76.5],[18.52,73.8567],[19.0760,72.8777]],
  "WH4-WH3":[[17.3850,78.4867],[16.0,77.8],[14.8,77.3],[13.34,77.10],[12.9716,77.5946]],
  "WH4-WH5":[[17.3850,78.4867],[18.0,82.0],[19.2,84.8],[21.0,86.0],[22.5726,88.3639]],
  "WH5-WH1":[[22.5726,88.3639],[23.6,86.1],[24.3,83.0],[25.4,81.8],[26.45,80.35],[27.1767,78.0081],[28.6139,77.2090]],
  "WH5-WH2":[[22.5726,88.3639],[23.5,86.0],[22.5,84.0],[21.5,81.5],[21.1,79.0],[20.3,76.5],[19.3,74.5],[19.0760,72.8777]],
  "WH5-WH3":[[22.5726,88.3639],[21.15,85.8],[19.5,85.8],[17.9,82.7],[16.5,80.3],[13.3409,77.1010],[12.9716,77.5946]]
};
const keyFor=(a,b)=>`${a}-${b}`;
function getRoadLatLon(a,b){ const k1=keyFor(a,b),k2=keyFor(b,a); if(RP[k1]) return RP[k1]; if(RP[k2]) return [...RP[k2]].reverse(); return [[CITY[a].lat,CITY[a].lon],[CITY[b].lat,CITY[b].lon]]; }
function expandIDsToLatLon(ids){ const out=[]; for(let i=0;i<ids.length-1;i++){ const seg=getRoadLatLon(ids[i],ids[i+1]); if(i>0) seg.shift(); out.push(...seg); } return out; }
function allRoutesGeoJSON(){ const toLonLat=pts=>pts.map(p=>[p[1],p[0]]); return { type:"FeatureCollection", features:Object.keys(RP).map(k=>({ type:"Feature", properties:{id:k}, geometry:{ type:"LineString", coordinates:toLonLat(RP[k])}}))}; }

/* ---------- Map + canvas ---------- */
const map = new maplibregl.Map({ container:"map", style:STYLE_URL, center:MAP_INIT.center, zoom:MAP_INIT.zoom, minZoom:MAP_INIT.minZoom, maxZoom:MAP_INIT.maxZoom, attributionControl:true });
map.addControl(new maplibregl.NavigationControl({visualizePitch:false}), "top-left");

const trucksCanvas=document.getElementById("trucksCanvas");
const tctx=trucksCanvas.getContext("2d");
function resizeCanvas(){ const base=map.getCanvas(); const dpr=window.devicePixelRatio||1; trucksCanvas.width=base.clientWidth*dpr; trucksCanvas.height=base.clientHeight*dpr; trucksCanvas.style.width=base.clientWidth+"px"; trucksCanvas.style.height=base.clientHeight+"px"; tctx.setTransform(dpr,0,0,dpr,0,0); }
window.addEventListener("resize", resizeCanvas);

/* ---------- Humanoid TTS (narration only) ---------- */
const synth = window.speechSynthesis; let VOICE=null, q=[], playing=false;
function pickVoice(){ const prefs=[/en-IN/i,/English.+India/i,/Natural|Neural/i,/Microsoft|Google/i,/en-GB/i,/en-US/i]; const vs=synth?.getVoices?.()||[]; for(const p of prefs){ const v=vs.find(v=>p.test(v.name)||p.test(v.lang)); if(v) return v; } return vs[0]||null; }
VOICE=pickVoice(); if(!VOICE&&synth) synth.onvoiceschanged=()=>{ VOICE=pickVoice(); };
const speakNorm=s=>String(s).replace(/\bETA\b/gi,"E T A").replace(/WH(\d+)/g,"Warehouse $1").replace(/->|→/g," to ");
function ttsEnq(t){ if(!synth) return; speakNorm(t).split(/(?<=[.!?;])\s+|(?<=,)\s+/).forEach(p=>q.push(p)); if(!playing) playNext(); }
function playNext(){ if(!synth) return; if(!q.length){ playing=false; return; } playing=true; const u=new SpeechSynthesisUtterance(q.shift()); if(VOICE) u.voice=VOICE; u.rate=1.0; u.pitch=1.02; u.onend=playNext; synth.speak(u); }
function ttsFlush(cancel){ q=[]; playing=false; if(cancel&&synth) synth.cancel(); }

/* ---------- Optional text logger (kept off) ---------- */
let t0=performance.now(); const nowSec=()=>((performance.now()-t0)/1000).toFixed(1);
function clearLog(){ if(SHOW_TEXT_LOG&&logEl) logEl.textContent=""; t0=performance.now(); ttsFlush(true); }
function log(msg,speak=true){ if(SHOW_TEXT_LOG&&logEl) logEl.textContent+=`[t=${nowSec()}s] ${msg}\n`; if(speak) ttsEnq(msg); }

/* ---------- OSM roads + our corridors (glow + motion) ---------- */
function mtKey(){ try{ const src=map.getStyle().sources['satellite']; if(src?.tiles?.length){ const u=new URL(src.tiles[0]); return u.searchParams.get('key'); } }catch(e){} return ""; }

function addVTroads(){
  try{
    const key=mtKey();
    if(key && !map.getSource("omt")) map.addSource("omt",{ type:"vector", url:`https://api.maptiler.com/tiles/v3/tiles.json?key=${key}` });

    const filter = ["match",["get","class"],["motorway","trunk","primary"],true,false];

    if(key && !map.getLayer("vt-roads-glow")) map.addLayer({
      id:"vt-roads-glow", type:"line", source:"omt", "source-layer":"transportation", filter, paint:{
        "line-color":"#59e0ff","line-opacity":0.55,"line-blur":1.4,
        "line-width":["interpolate",["linear"],["zoom"],4,3.6,6,5.2,8,8.2,10,12.6,12,16.0],"line-join":"round","line-cap":"round"
      }
    });
    if(key && !map.getLayer("vt-roads-core")) map.addLayer({
      id:"vt-roads-core", type:"line", source:"omt", "source-layer":"transportation", filter, paint:{
        "line-color":"#ffffff","line-opacity":0.9,
        "line-width":["interpolate",["linear"],["zoom"],4,0.9,6,1.5,8,2.2,10,3.0,12,3.6]
      }
    });
  }catch(e){ console.warn("VT roads skipped:", e); }

  // Our corridor source (always)
  if(!map.getSource("routes")) map.addSource("routes",{ type:"geojson", data:allRoutesGeoJSON() });
  if(!map.getLayer("routes-glow")) map.addLayer({
    id:"routes-glow", type:"line", source:"routes", paint:{
      "line-color":"#97f0ff","line-opacity":0.8,"line-blur":1.6,
      "line-width":["interpolate",["linear"],["zoom"],4,4.8,6,6.6,8,9.8,10,14.5,12,19.0]
    }
  });
  if(!map.getLayer("routes-core")) map.addLayer({
    id:"routes-core", type:"line", source:"routes", paint:{
      "line-color":"#ffffff","line-opacity":0.95,
      "line-width":["interpolate",["linear"],["zoom"],4,1.1,6,1.7,8,2.3,10,3.2,12,3.8]
    }
  });
  if(!map.getLayer("routes-motion")) map.addLayer({
    id:"routes-motion", type:"line", source:"routes",
    paint:{ "line-color":"#00ffd0", "line-width":["interpolate",["linear"],["zoom"],4,1.2,6,1.4,8,1.8,10,2.2,12,2.6], "line-opacity":0.9, "line-dasharray":[0.5, 2.5] }
  });

  let phase=0; (function dashTick(){ phase=(phase+0.12)%3.0; try{ map.setPaintProperty("routes-motion","line-dasharray",[0.5+phase,2.5]); }catch(e){} requestAnimationFrame(dashTick); })();
}

/* ---------- Warehouse icon (SVG) ---------- */
const WAREHOUSE_ICON_SRC = "assets/warehouse.svg"; // optional file you can provide
const EMBEDDED_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
  <defs>
    <linearGradient id='g1' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#0f1720'/><stop offset='1' stop-color='#0a0f15'/>
    </linearGradient>
    <linearGradient id='g2' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#ffd44a'/><stop offset='1' stop-color='#e8b90e'/>
    </linearGradient>
  </defs>
  <rect x='6' y='6' width='84' height='84' rx='18' fill='url(#g1)' stroke='#66e2ff' stroke-opacity='.5'/>
  <rect x='18' y='30' width='60' height='34' rx='6' fill='url(#g2)' stroke='#41464d'/>
  <rect x='18' y='58' width='60' height='10' fill='#213a2b'/>
  <rect x='30' y='42' width='36' height='18' rx='3' fill='#6f7780'/>
  <rect x='30' y='56' width='36' height='7' rx='2' fill='#3f464f'/>
  <rect x='40' y='22' width='16' height='8' rx='2' fill='#cfd7df' stroke='#7b848f'/>
  <rect x='28' y='22' width='16' height='8' rx='2' fill='#e3e9f1' stroke='#7b848f'/>
  <rect x='52' y='22' width='16' height='8' rx='2' fill='#e3e9f1' stroke='#7b848f'/>
</svg>`.trim();

let WH_IMG = new Image(); let WH_READY = false;
function loadWarehouseIcon(){
  WH_IMG.onload = ()=>{ WH_READY = true; };
  WH_IMG.onerror = ()=>{
    WH_IMG = new Image();
    WH_IMG.onload = ()=>{ WH_READY = true; };
    WH_IMG.src = "data:image/svg+xml;utf8," + encodeURIComponent(EMBEDDED_SVG);
  };
  WH_IMG.src = WAREHOUSE_ICON_SRC;
}
loadWarehouseIcon();

const WAREHOUSE_BASE_PX=96, WAREHOUSE_MIN_PX=56, WAREHOUSE_MAX_PX=150;
const warehouseSizeByZoom = z => Math.max(WAREHOUSE_MIN_PX, Math.min(WAREHOUSE_MAX_PX, WAREHOUSE_BASE_PX*(0.9+(z-5)*0.28)));

const WAREHOUSE_STATE = new Map();   // id -> {inventory, in, inDelayed, out}
let scenarioTrucks = [];             // last loaded trucks (raw JSON)

/* ---------- Ring around warehouse ---------- */
function drawStatusRing(ctx, x, y, S, pct){
  const r = S*0.66;
  const th = Math.max(4, S*0.08);
  const ang = Math.max(0, Math.min(1, pct)) * Math.PI*2;
  const color = pct>=0.8 ? "#27e38a" : (pct>=0.55 ? "#ffd54a" : "#ff5252");

  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = th;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineCap = "round";
  ctx.lineWidth = th;
  ctx.beginPath(); ctx.arc(x,y,r, -Math.PI/2, -Math.PI/2 + ang); ctx.stroke();
  ctx.restore();
}

/* ---------- Trucks (continuous motion) ---------- */
const SPEED_MULTIPLIER = 9.5;   // feel free to tweak
const MIN_GAP_PX = 50;
const CROSS_GAP_PX = 34;
const LANES_PER_ROUTE = 3;
const LANE_WIDTH_PX   = 6.5;
const MIN_STEP = 0.010;         // stronger minimum to prevent stall

const trucks=[];
function defaultPathIDs(o,d){ if(o===d) return [o]; const k1=keyFor(o,d),k2=keyFor(d,o); if(RP[k1]||RP[k2]) return [o,d]; return (o!=="WH4" && d!=="WH4") ? [o,"WH4",d] : [o,d]; }
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); }

function spawnTruck(tr, reroutes){
  const delayed=(tr.status&&String(tr.status).toLowerCase()==="delayed")||(tr.delay_hours||0)>0;
  let ids=reroutes.get(tr.id)||defaultPathIDs(tr.origin,tr.destination);
  if(ids[0]!==tr.origin) ids.unshift(tr.origin);
  if(ids[ids.length-1]!==tr.destination) ids.push(tr.destination);
  const latlon=expandIDsToLatLon(ids);
  if(latlon.length<2) return;
  const startT=Math.random()*0.55;
  const base = delayed?2.88:4.32;
  const speed=base*(0.92+Math.random()*0.16);
  const startDelay=400+Math.random()*900;
  const laneIndex=((hashStr(tr.id)%LANES_PER_ROUTE)+LANES_PER_ROUTE)%LANES_PER_ROUTE;
  trucks.push({ id:tr.id, latlon, seg:0, t:startT, dir:1, speed, delayed, laneIndex, startAt:performance.now()+startDelay });
}

function truckScreenPos(T){ const a=T.latlon[T.seg], b=T.latlon[T.seg+T.dir]||a; const aP=map.project({lng:a[1],lat:a[0]}), bP=map.project({lng:b[1],lat:b[0]}); const x=aP.x+(bP.x-aP.x)*T.t, y=aP.y+(bP.y-aP.y)*T.t; return {x,y,aP,bP}; }

function drawVectorTruck(ctx,w,h,delayed){
  const r=Math.min(w,h)/2;
  ctx.fillStyle="rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(0,r*0.38,r*0.95,r*0.42,0,0,Math.PI*2); ctx.fill();
  const trW=w*0.78,trH=h*0.72; const trailGrad=ctx.createLinearGradient(-trW/2,0,trW/2,0);
  trailGrad.addColorStop(0,"#eef2f6"); trailGrad.addColorStop(1,"#cfd7df");
  ctx.fillStyle=trailGrad; ctx.strokeStyle="#6f7a86"; ctx.lineWidth=1.25; ctx.beginPath(); ctx.roundRect(-trW/2,-trH/2,trW,trH,3); ctx.fill(); ctx.stroke();
  const cabW=w*0.34,cabH=h*0.72; const cabGrad=ctx.createLinearGradient(-cabW/2,0,cabW/2,0);
  cabGrad.addColorStop(0,"#b3bcc6"); cabGrad.addColorStop(1,"#9aa5b2");
  ctx.fillStyle=cabGrad; ctx.strokeStyle="#5f6771"; ctx.beginPath(); ctx.roundRect(-w/2,-cabH/2,cabW,cabH,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#26303a"; ctx.fillRect(-w/2+2,-cabH*0.44,cabW-4,cabH*0.32);
  ctx.fillStyle="#1b1f24"; ctx.strokeStyle="#444a52"; ctx.lineWidth=1; const wy=trH*0.5-2;
  [-1,1].forEach(side=>{ ctx.beginPath(); ctx.roundRect(-trW*0.35, side*wy-2.5, trW*0.28,5,2); ctx.fill(); ctx.stroke();
                          ctx.beginPath(); ctx.roundRect( trW*0.06, side*wy-2.5, trW*0.28,5,2); ctx.fill(); ctx.stroke(); });
  ctx.fillStyle=delayed?"#ff3b30":"#00c853"; ctx.beginPath(); ctx.arc(trW*0.32,-trH*0.28,3.2,0,Math.PI*2); ctx.fill();
}

function drawWarehousesAndRings(){
  const z=map.getZoom();
  for(const id of Object.keys(CITY)){
    const c=CITY[id];
    const p=map.project({lng:c.lon,lat:c.lat});
    const S=warehouseSizeByZoom(z);

    if(WH_READY){
      tctx.drawImage(WH_IMG, Math.round(p.x-S/2), Math.round(p.y-S/2), S, S);
    } else {
      tctx.fillStyle="#1de0ff";
      tctx.beginPath(); tctx.arc(p.x, p.y, Math.max(8, S*0.2), 0, Math.PI*2); tctx.fill();
    }

    const st = WAREHOUSE_STATE.get(id);
    const target = 500; const pct = st ? Math.max(0, Math.min(1, st.inventory/target)) : 0.8;
    drawStatusRing(tctx, p.x, p.y, S*0.65, pct);

    const label=c.name, pad=6, h=18, w=tctx.measureText(label).width+pad*2;
    const px=p.x, py=p.y + (S/2) + 16;
    tctx.fillStyle="rgba(10,10,11,0.82)"; tctx.strokeStyle="rgba(255,255,255,0.22)";
    tctx.fillRect(px-w/2,py-h/2,w,h); tctx.strokeRect(px-w/2,py-h/2,w,h);
    tctx.fillStyle="#e6e6e6"; tctx.textBaseline="middle"; tctx.font="bold 12px system-ui, Segoe UI, Roboto, sans-serif";
    tctx.fillText(label,px-w/2+pad,py);
  }
}

function drawTrucks(){
  tctx.clearRect(0,0,trucksCanvas.width,trucksCanvas.height);
  const now=performance.now();

  for(const T of trucks){
    if(now<T.startAt) continue;

    const a=T.latlon[T.seg], b=T.latlon[T.seg+T.dir]||a;
    const aP=map.project({lng:a[1],lat:a[0]}), bP=map.project({lng:b[1],lat:b[0]});
    const segLenPx=Math.max(1,Math.hypot(bP.x-aP.x,bP.y-aP.y));

    let pxPerSec = SPEED_MULTIPLIER*T.speed*(0.9+(map.getZoom()-4)*0.12);
    let step = (pxPerSec * __dt) / segLenPx; // time-delta based

    // Headway throttle (same segment)
    const myProg=T.t*segLenPx; let minLead=Infinity;
    for(const O of trucks){
      if(O===T||now<O.startAt) continue;
      if(O.latlon[O.seg]===T.latlon[T.seg] && O.latlon[O.seg+O.dir]===T.latlon[T.seg+T.dir] && O.dir===T.dir){
        const a2=map.project({lng:O.latlon[O.seg][1],lat:O.latlon[O.seg][0]});
        const b2=map.project({lng:O.latlon[O.seg+O.dir][1],lat:O.latlon[O.seg+O.dir][0]});
        const seg2=Math.max(1,Math.hypot(b2.x-a2.x,b2.y-a2.y)); const oProg=O.t*seg2;
        if(oProg>myProg) minLead=Math.min(minLead,oProg-myProg);
      }
    }
    if(isFinite(minLead)&&minLead<MIN_GAP_PX) step*=Math.max(0.25,(minLead/MIN_GAP_PX)*0.7);

    // Crossing gap
    const {x:cx,y:cy}=truckScreenPos(T); let nearest=Infinity;
    for(const O of trucks){ if(O===T||now<O.startAt) continue; const p=truckScreenPos(O); const d=Math.hypot(p.x-cx,p.y-cy); if(d<nearest) nearest=d; }
    if(isFinite(nearest)&&nearest<CROSS_GAP_PX) step*=Math.max(0.30,(nearest/CROSS_GAP_PX)*0.6);

    // Never freeze
    step = Math.max(step, MIN_STEP);

    // Integrate position
    T.t+=step;
    if(T.t>=1){ T.seg+=T.dir; T.t-=1;
      if(T.seg<=0){T.seg=0;T.dir=1;} else if(T.seg>=T.latlon.length-1){T.seg=T.latlon.length-1;T.dir=-1;}
    }

    // Draw oriented truck
    const theta=Math.atan2(bP.y-aP.y,bP.x-aP.x);
    const x=aP.x+(bP.x-aP.x)*T.t, y=aP.y+(bP.y-aP.y)*T.t;
    const nx=-(bP.y-aP.y), ny=(bP.x-aP.x); const nLen=Math.max(1,Math.hypot(nx,ny));
    const laneZero=T.laneIndex-(LANES_PER_ROUTE-1)/2; const off=laneZero*LANE_WIDTH_PX;
    const xOff=x+(nx/nLen)*off, yOff=y+(ny/nLen)*off;
    const z=map.getZoom(), scale=1.0+(z-4)*0.12, w=28*scale, h=14*scale;
    tctx.save(); tctx.translate(xOff,yOff); tctx.rotate(theta); drawVectorTruck(tctx,w,h,T.delayed); tctx.restore();
  }

  drawWarehousesAndRings();
}

/* ---------- Tooltip hit-testing ---------- */
function screenPos(id){
  const c=CITY[id]; const p=map.project({lng:c.lon,lat:c.lat}); const S=warehouseSizeByZoom(map.getZoom());
  return { x:p.x, y:p.y, r:S*0.60, id };
}
map.on("mousemove", (e)=>{
  const {point} = e;
  let hit=null;
  for(const id of Object.keys(CITY)){
    const sp=screenPos(id);
    const d=Math.hypot(point.x-sp.x, point.y-sp.y);
    if(d<=sp.r){ hit=sp; break; }
  }
  if(!hit){ tooltip.style.display="none"; return; }
  const st = WAREHOUSE_STATE.get(hit.id)||{inventory:"–", in:0, inDelayed:0, out:0};
  tipTitle.textContent = CITY[hit.id].name;
  tipInv.textContent = st.inventory;
  tipIn.textContent  = `${st.in} (${st.inDelayed})`;
  tipOut.textContent = `${st.out}`;
  tooltip.style.left = `${point.x}px`;
  tooltip.style.top  = `${point.y}px`;
  tooltip.style.display = "block";
});

/* ---------- Timeline ---------- */
function buildTimeline(items){
  tl.items = (Array.isArray(items) ? items.slice() : []);
  tl.totalMs = tl.items.reduce((acc,it)=>acc + (Number(it.delay_ms)||0), 0);
  tl.t0 = 0; tl.playing=false; tl.speed=1; tl.spokenIdx=-1; tl.progressMs=0;
  if(tl.speedBtn) tl.speedBtn.textContent = "1×";
  if(tl.play) tl.play.textContent = "▶︎ Play";
  if(tl.barProg) tl.barProg.style.width = "0%";
  tl.markers.forEach(m=>m.remove()); tl.markers.length=0;

  if(!tl.barWrap) return;
  let t=0;
  tl.items.forEach((it)=>{
    const ms = Number(it.delay_ms)||0; t+=ms;
    const x = Math.max(0, Math.min(100, (t / Math.max(1, tl.totalMs))*100));
    const m = document.createElement("div"); m.className="marker"; m.style.left = `calc(${x}% - 4px)`;
    m.title = (it.msg||"").replace(/\.\s*$/,"");
    tl.barWrap.appendChild(m); tl.markers.push(m);
  });
}
function tlNow(){ return (performance.now() - tl.t0) * tl.speed; }
function tlPlay(){ if(tl.playing) return; tl.playing=true; tl.t0 = performance.now() - (tl.progressMs||0)/tl.speed; requestAnimationFrame(tlTick); if(tl.play) tl.play.textContent="⏸ Pause"; }
function tlPause(){ tl.playing=false; tl.progressMs = tlNow(); if(tl.play) tl.play.textContent="▶︎ Play"; }
function tlReset(){ tl.progressMs = 0; tl.spokenIdx=-1; if(tl.barProg) tl.barProg.style.width="0%"; }
function tlTick(){
  if(!tl.playing) return;
  const ms = Math.min(tlNow(), tl.totalMs || 0);
  tl.progressMs = ms;
  if(tl.barProg) tl.barProg.style.width = `${(ms/Math.max(1,tl.totalMs))*100}%`;

  let acc=0;
  for(let i=0;i<tl.items.length;i++){
    acc += Number(tl.items[i].delay_ms)||0;
    if(ms >= acc && i>tl.spokenIdx){
      tl.spokenIdx=i;
      const m = String(tl.items[i].msg||"").trim();
      if(m) ttsEnq(m);
    }
  }
  if(ms >= tl.totalMs){ tlPause(); } else { requestAnimationFrame(tlTick); }
}
if(tl.play) tl.play.addEventListener("click", ()=> tl.playing ? tlPause() : tlPlay());
if(tl.speedBtn) tl.speedBtn.addEventListener("click", ()=>{
  tl.speed = tl.speed===1 ? 1.5 : (tl.speed===1.5 ? 2 : 1);
  tl.speedBtn.textContent = `${tl.speed}×`;
  if(tl.playing){ tl.t0 = performance.now() - tl.progressMs/tl.speed; }
});
if(tl.barWrap) tl.barWrap.addEventListener("click", (ev)=>{
  if(!tl.totalMs) return;
  const rect = tl.barWrap.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (ev.clientX-rect.left)/rect.width));
  tl.progressMs = p*tl.totalMs;
  if(tl.barProg) tl.barProg.style.width = `${p*100}%`;
  tl.spokenIdx = -1;
  if(!tl.playing) tlPlay();
});

/* ---------- Scenario loader ---------- */
window.loadScenario = async function(file, humanLabel){
  try{
    clearLog(); trucks.length=0; scenarioTrucks = [];

    const url = `${file}${file.includes('?')?'&':'?'}v=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} while fetching ${file}`);
    const text = await res.text();
    const data = JSON.parse(text);

    WAREHOUSE_STATE.clear();
    for(const w of (data.warehouses||[])){
      WAREHOUSE_STATE.set(w.id, { inventory:Number(w.inventory)||0, in:0, inDelayed:0, out:0 });
    }
    scenarioTrucks = (data.trucks||[]).slice();

    for(const tr of scenarioTrucks){
      const o = WAREHOUSE_STATE.get(tr.origin); if(o) o.out++;
      const d = WAREHOUSE_STATE.get(tr.destination); if(d){ d.in++; if(String(tr.status).toLowerCase()==="delayed" || (tr.delay_hours||0)>0) d.inDelayed++; }
    }

    const reroutes=new Map();
    if(Array.isArray(data.reroutes)){
      for(const r of data.reroutes){ if(r.truckId && Array.isArray(r.path)) reroutes.set(r.truckId, r.path.slice()); }
    }

    for(const tr of scenarioTrucks) spawnTruck(tr, reroutes);

    let tlItems = data?.commentary?.timeline;
    tlItems = Array.isArray(tlItems) ? tlItems : (typeof tlItems==="object" ? Object.values(tlItems) : []);
    buildTimeline(tlItems);
    tlReset();
    ttsEnq(humanLabel || (/after/i.test(file) ? "After Correction" : "Before Disruption"));

    fitToWarehouses();   // keep the map focused whenever a scenario loads
  }catch(err){
    console.error(err);
    ttsEnq(`Scenario load error: ${err.message}`);
  }
};

/* ---------- Fit map to all warehouses (focus on open) ---------- */
function fitToWarehouses(){
  const bounds = new maplibregl.LngLatBounds();
  Object.values(CITY).forEach(c => bounds.extend([c.lon, c.lat]));
  map.fitBounds(bounds, { padding: { top: 60, left: 60, right: 60, bottom: 160 }, duration: 900, maxZoom: 6.8 });
}

/* ---------- Boot ---------- */
map.on("load", ()=>{ 
  resizeCanvas();
  addVTroads();
  loadScenario("scenario_before.json","Before Disruption");
  fitToWarehouses();
});

// Hide the old commentary panel if present
(() => { const p=document.getElementById("commentary"); if(p) p.style.display="none"; })();

/* ---------- Independent animation loop (never stalls) ---------- */
let __lastTS = performance.now();
let __dt = 1 / 60; // seconds between frames (smoothed)
function animLoop() {
  const now = performance.now();
  __dt = Math.min(0.05, (now - __lastTS) / 1000); // clamp to 50ms max
  __lastTS = now;

  drawTrucks();
  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);
