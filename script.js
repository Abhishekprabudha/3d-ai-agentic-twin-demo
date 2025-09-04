/* =========================================================================
   Agentic Twin — Disrupt → Correct → Normal (Click-Driven v3)
   Fixes:
   1) Disruption-2 (Delhi → Hyderabad) correction goes via Mumbai (green).
   2) Detour (green) always on top; overlap on Mumbai–Hyderabad solved.
   3) Dashboard uses REAL JSON values (before/after); title set in HTML.
   4) Narration plays TWICE (both Disrupt and Correct flows).
   ======================================================================= */

/* -------------------- tiny debug pill -------------------- */
let __DBG=null;
function debug(msg){
  if(!__DBG){
    __DBG=document.createElement("div");
    __DBG.style.cssText="position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(0,0,0,.55);color:#eaf1f7;font:12px system-ui;padding:6px 8px;border-radius:6px;pointer-events:none";
    document.body.appendChild(__DBG);
  }
  __DBG.textContent=msg||"";
}
window.addEventListener("error",(e)=>debug(`Error: ${e.message||e}`));

/* -------------------- config -------------------- */
const STYLE_URL="style.json";
const MAP_INIT={center:[78.9629,21.5937],zoom:5.5,minZoom:3,maxZoom:12};
const WAREHOUSE_ICON_SRC="warehouse_iso.png";

/* -------------------- anchors -------------------- */
const CITY={
  WH1:{name:"WH1 — Delhi",     lat:28.6139, lon:77.2090},
  WH2:{name:"WH2 — Mumbai",    lat:19.0760, lon:72.8777},
  WH3:{name:"WH3 — Bangalore", lat:12.9716, lon:77.5946},
  WH4:{name:"WH4 — Hyderabad", lat:17.3850, lon:78.4867},
  WH5:{name:"WH5 — Kolkata",   lat:22.5726, lon:88.3639},
};

/* -------------------- route polylines (lat,lon) -------------------- */
const RP={
  "WH1-WH2":[[28.6139,77.2090],[27.0,76.8],[25.6,75.2],[24.1,73.5],[23.0,72.6],[21.17,72.83],[19.9,72.9],[19.076,72.8777]],
  "WH2-WH3":[[19.0760,72.8777],[18.52,73.8567],[16.9,74.5],[15.9,74.5],[13.8,76.4],[12.9716,77.5946]],
  "WH3-WH1":[[12.9716,77.5946],[16.0,78.1],[17.3850,78.4867],[21.0,79.1],[26.9,78.0],[28.6139,77.2090]],
  "WH4-WH1":[[17.3850,78.4867],[21.1458,79.0882],[27.1767,78.0081],[28.6139,77.2090]],
  "WH4-WH2":[[17.3850,78.4867],[18.0,76.5],[18.52,73.8567],[19.0760,72.8777]],
  "WH4-WH3":[[17.3850,78.4867],[16.0,77.8],[14.8,77.3],[13.34,77.10],[12.9716,77.5946]],
  "WH4-WH5":[[17.3850,78.4867],[18.0,82.0],[19.2,84.8],[21.0,86.0],[22.5726,88.3639]],
  "WH5-WH1":[[22.5726,88.3639],[23.6,86.1],[24.3,83.0],[25.4,81.8],[26.45,80.35],[27.1767,78.0081],[28.6139,77.2090]],
  "WH5-WH2":[[22.5726,88.3639],[23.5,86.0],[22.5,84.0],[21.5,81.5],[21.1,79.0],[20.3,76.5],[19.3,74.5],[19.0760,72.8777]],
  "WH5-WH3":[[22.5726,88.3639],[21.15,85.8],[19.5,85.8],[17.9,82.7],[16.5,80.3],[13.3409,77.1010],[12.9716,77.5946]],
};
const keyFor=(a,b)=>`${a}-${b}`;
const toLonLat=ll=>ll.map(p=>[p[1],p[0]]);
function getRoadLatLon(a,b){
  const k1=keyFor(a,b), k2=keyFor(b,a);
  if(RP[k1]) return RP[k1];
  if(RP[k2]) return [...RP[k2]].reverse();
  return [[CITY[a].lat,CITY[a].lon],[CITY[b].lat,CITY[b].lon]];
}
function expandIDsToLatLon(ids){
  const out=[];
  for(let i=0;i<ids.length-1;i++){
    const seg=getRoadLatLon(ids[i],ids[i+1]);
    if(i>0) seg.shift();
    out.push(...seg);
  }
  return out;
}
function networkGeoJSON(){
  return {type:"FeatureCollection",features:Object.keys(RP).map(k=>({
    type:"Feature",properties:{id:k},geometry:{type:"LineString",coordinates:toLonLat(RP[k])}
  }))};
}

/* -------------------- scenario storage -------------------- */
let SCN_BEFORE=null, SCN_AFTER=null;

/* -------------------- default scenario (fallback) -------------------- */
const DEFAULT_BEFORE={
  warehouses:Object.keys(CITY).map(id=>({id,location:CITY[id].name.split("—")[1].trim(),inventory:500})),
  trucks:[
    {id:"T1", origin:"WH1", destination:"WH2", status:"On-Time", delay_hours:0},
    {id:"T2", origin:"WH2", destination:"WH3", status:"On-Time", delay_hours:0},
    {id:"T3", origin:"WH3", destination:"WH1", status:"On-Time", delay_hours:0},
  ]
};

/* -------------------- 5 clean disruption steps w/ logical reroutes ---------- */
/* NOTE: Step D2 is explicitly Delhi→Hyderabad disrupted; fix goes VIA Mumbai (your ask #1). */
const STEPS=[
  { // D1: Delhi–Mumbai reroute via Hyderabad
    id:"D1",
    route:["WH1","WH2"],
    reroute:[["WH1","WH4"],["WH4","WH2"]],
    cause:[
      "Disruption one.",
      "Delhi to Mumbai corridor is closed near Rajasthan.",
      "All trucks on this corridor are safely paused.",
      "Please click the Correct button to apply the AI fix."
    ],
    fix:[
      "AI has corrected the disruption.",
      "Traffic is rerouted via Hyderabad: Delhi to Hyderabad, then Hyderabad to Mumbai.",
      "Green links show the new safe detour. Flows are resuming."
    ]
  },
  { // D2: Delhi–Hyderabad reroute via Mumbai  ✅ fix for your point (1)
    id:"D2",
    route:["WH1","WH4"],                      // Delhi → Hyderabad disrupted
    reroute:[["WH1","WH2"],["WH2","WH4"]],    // Delhi → Mumbai → Hyderabad (green on correction)
    cause:[
      "Disruption two.",
      "Delhi to Hyderabad is impacted by a long work zone.",
      "All trucks on this corridor are paused in place.",
      "Click Correct to rebalance via Mumbai."
    ],
    fix:[
      "AI has corrected the disruption.",
      "We are diverting Delhi to Mumbai, and then Mumbai to Hyderabad.",
      "Green segments confirm the balanced detour is active."
    ]
  },
  { // D3: Kolkata–Mumbai reroute via Hyderabad
    id:"D3",
    route:["WH5","WH2"],
    reroute:[["WH5","WH4"],["WH4","WH2"]],
    cause:[
      "Disruption three.",
      "Kolkata to Mumbai is constrained by flood-prone sections.",
      "All trucks on this link are held.",
      "Click Correct to divert through Hyderabad."
    ],
    fix:[
      "AI has corrected the disruption.",
      "We route Kolkata to Hyderabad and onward to Mumbai.",
      "Green links indicate the detour now in effect."
    ]
  },
  { // D4: Mumbai–Bangalore reroute via Hyderabad
    id:"D4",
    route:["WH2","WH3"],
    reroute:[["WH2","WH4"],["WH4","WH3"]],
    cause:[
      "Disruption four.",
      "Mumbai to Bangalore faces a crash-related closure.",
      "All trucks on this corridor are paused.",
      "Click Correct to go via Hyderabad."
    ],
    fix:[
      "AI has corrected the disruption.",
      "Detour is Mumbai to Hyderabad, then Hyderabad to Bangalore.",
      "Green links show the new route. Queues are clearing."
    ]
  },
  { // D5: Kolkata–Bangalore reroute via Hyderabad
    id:"D5",
    route:["WH5","WH3"],
    reroute:[["WH5","WH4"],["WH4","WH3"]],
    cause:[
      "Final disruption.",
      "Kolkata to Bangalore is blocked due to a landslide risk.",
      "All trucks on this corridor are paused.",
      "Click Correct to proceed with the safe detour."
    ],
    fix:[
      "AI has corrected the disruption.",
      "We divert Kolkata to Hyderabad and then Hyderabad to Bangalore.",
      "Green links confirm stable flow on the detour."
    ]
  }
];

/* -------------------- Map setup -------------------- */
const map=new maplibregl.Map({
  container:"map", style:STYLE_URL,
  center:MAP_INIT.center, zoom:MAP_INIT.zoom,
  minZoom:MAP_INIT.minZoom, maxZoom:MAP_INIT.maxZoom,
  attributionControl:true
});
map.addControl(new maplibregl.NavigationControl({visualizePitch:false}),"top-left");

/* -------------------- overlay canvas for trucks & labels -------------------- */
let overlay=null, ctx=null;
function ensureCanvas(){
  overlay=document.getElementById("trucksCanvas");
  if(!overlay){
    overlay=document.createElement("canvas");
    overlay.id="trucksCanvas";
    overlay.style.cssText="position:absolute;inset:0;pointer-events:none;z-index:2;";
    map.getContainer().appendChild(overlay);
  }
  ctx=overlay.getContext("2d");
  resizeCanvas();
}
function resizeCanvas(){
  if(!overlay) return;
  const base=map.getCanvas(), dpr=window.devicePixelRatio||1;
  overlay.width=base.clientWidth*dpr; overlay.height=base.clientHeight*dpr;
  overlay.style.width=base.clientWidth+"px"; overlay.style.height=base.clientHeight+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize",resizeCanvas);

/* -------------------- base network + highlight layers -------------------- */
function ensureRoadLayers(){
  const net=networkGeoJSON();
  if(!map.getSource("routes")) map.addSource("routes",{type:"geojson",data:net});
  else map.getSource("routes").setData(net);

  if(!map.getLayer("routes-halo")){
    map.addLayer({id:"routes-halo",type:"line",source:"routes",
      paint:{"line-color":"#9fb4ff","line-opacity":0.22,"line-width":7.5},
      layout:{"line-cap":"round","line-join":"round"}});
  }
  if(!map.getLayer("routes-base")){
    map.addLayer({id:"routes-base",type:"line",source:"routes",
      paint:{"line-color":"#ffffff","line-opacity":0.9,"line-width":3.0},
      layout:{"line-cap":"round","line-join":"round"}});
  }

  if(!map.getSource("alert")) map.addSource("alert",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("alert-red")){
    map.addLayer({id:"alert-red",type:"line",source:"alert",
      paint:{"line-color":"#ff6b6b","line-opacity":0.98,"line-width":4.6},
      layout:{"line-cap":"round","line-join":"round"}});
  }

  if(!map.getSource("fix")) map.addSource("fix",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("fix-green")){
    map.addLayer({id:"fix-green",type:"line",source:"fix",
      paint:{"line-color":"#00d08a","line-opacity":0.98,"line-width":5.8},
      layout:{"line-cap":"round","line-join":"round"}});
  }

  /* Ensure green detour is on TOP of everything relevant (your ask #2). */
  try { map.moveLayer("fix-green"); } catch(e) {}
}

/* helpers for sources */
function featureForRoute(ids){
  return {type:"Feature",properties:{id:ids.join("-")},
    geometry:{type:"LineString",coordinates:toLonLat(expandIDsToLatLon(ids))}};
}
function setSourceFeatures(srcId,features){
  const src=map.getSource(srcId); if(!src) return;
  src.setData({type:"FeatureCollection",features:features||[]});
}

/* -------------------- warehouse icons + labels -------------------- */
const WH_IMG=new Image(); let WH_READY=false;
WH_IMG.onload=()=>{WH_READY=true;}; WH_IMG.onerror=()=>{WH_READY=false; debug("warehouse_iso.png missing at root");};
WH_IMG.src=`${WAREHOUSE_ICON_SRC}?v=${Date.now()}`;

const WH_BASE=26, WH_MIN=16, WH_MAX=34;
const sizeByZoom=z=>Math.max(WH_MIN,Math.min(WH_MAX, WH_BASE*(0.9+(z-5)*0.18)));
function drawWarehouses(){
  if(!ctx) return; const z=map.getZoom();
  ctx.font="bold 11px system-ui, Segoe UI, Roboto, sans-serif";
  for(const id of Object.keys(CITY)){
    const c=CITY[id], p=map.project({lng:c.lon,lat:c.lat}), S=sizeByZoom(z);
    if(WH_READY) ctx.drawImage(WH_IMG, p.x-S/2, p.y-S/2, S, S);
    const label=c.name, pad=6, h=16, w=ctx.measureText(label).width+pad*2, py=p.y+S/2+12;
    ctx.fillStyle="rgba(10,10,12,.78)"; ctx.fillRect(p.x-w/2,py-h/2,w,h);
    ctx.fillStyle="#e8eef2"; ctx.textBaseline="middle"; ctx.fillText(label,p.x-w/2+pad,py);
  }
}

/* -------------------- trucks -------------------- */
const trucks=[]; const truckNumberById=new Map();
const SPEED_MULTIPLIER=8.6, MIN_GAP_PX=50, CROSS_GAP_PX=34, LANES_PER_ROUTE=3, LANE_WIDTH_PX=6.5, MIN_STEP=0.010;

function defaultPathIDs(o,d){
  const k1=keyFor(o,d), k2=keyFor(d,o);
  if(RP[k1]||RP[k2]) return [o,d];
  return (o!=="WH4"&&d!=="WH4") ? [o,"WH4",d] : [o,d];
}
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); }
function segProject(pt){ return map.project({lng:pt[1],lat:pt[0]}); }

function spawnTruck(tr, idx){
  const delayed=(tr.status||"").toLowerCase()==="delayed" || (tr.delay_hours||0)>0;
  const ids=defaultPathIDs(tr.origin,tr.destination);
  const latlon=expandIDsToLatLon(ids); if(latlon.length<2) return;

  const startT=Math.random()*0.55;
  const base=delayed?2.88:4.00;
  const speed=base*(0.92+Math.random()*0.16);
  const startDelay=300+Math.random()*800;
  const laneIndex=((hashStr(tr.id)%LANES_PER_ROUTE)+LANES_PER_ROUTE)%LANES_PER_ROUTE;

  trucks.push({
    id:tr.id, origin:tr.origin, dest:tr.destination,
    latlon, seg:0, t:startT, dir:1, speed,
    delayed, laneIndex,
    startAt:performance.now()+startDelay,
    paused:false, savedPath:null
  });
  truckNumberById.set(tr.id, idx+1);
}
function drawVectorTruck(g,w,h,delayed,number){
  const trW=w*0.78,trH=h*0.72;
  g.fillStyle="rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(0,trH*0.35,trW*0.9,trH*0.42,0,0,Math.PI*2); g.fill();
  const grad=g.createLinearGradient(-trW/2,0,trW/2,0); grad.addColorStop(0,"#eef2f6"); grad.addColorStop(1,"#cfd7df");
  g.fillStyle=grad; g.strokeStyle="#6f7a86"; g.lineWidth=1.2; g.beginPath(); g.roundRect(-trW/2,-trH/2,trW,trH,3); g.fill(); g.stroke();
  const cw=w*0.34,ch=h*0.72,cg=g.createLinearGradient(-cw/2,0,cw/2,0); cg.addColorStop(0,"#b3bcc6"); cg.addColorStop(1,"#9aa5b2");
  g.fillStyle=cg; g.strokeStyle="#5f6771"; g.beginPath(); g.roundRect(-w/2,-ch/2,cw,ch,3); g.fill(); g.stroke();
  g.fillStyle="#26303a"; g.fillRect(-w/2+2,-ch*0.44,cw-4,ch*0.32);
  const R=7; g.fillStyle="#fff"; g.strokeStyle="#20262e"; g.lineWidth=1.2;
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

    const a=T.latlon[T.seg], b=T.latlon[T.seg+T.dir]||a;
    const aP=segProject(a), bP=segProject(b);
    const segLenPx=Math.max(1,Math.hypot(bP.x-aP.x,bP.y-aP.y));

    if(!T.paused){
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
      for(const O of trucks){ if(O===T||now<O.startAt) continue;
        const aO=segProject(O.latlon[O.seg]), bO=segProject(O.latlon[O.seg+O.dir]);
        const xO=aO.x+(bO.x-aO.x)*O.t, yO=aO.y+(bO.y-aO.y)*O.t;
        nearest=Math.min(nearest,Math.hypot(xO-x1,yO-y1));
      }
      if(isFinite(nearest)&&nearest<CROSS_GAP_PX) step*=Math.max(0.30,(nearest/CROSS_GAP_PX)*0.6);
      step=Math.max(step,MIN_STEP);

      T.t+=step;
      if(T.t>=1){ T.seg+=T.dir; T.t-=1; if(T.seg<=0){T.seg=0;T.dir=1;} else if(T.seg>=T.latlon.length-1){T.seg=T.latlon.length-1;T.dir=-1;} }
    }

    const theta=Math.atan2(bP.y-aP.y,bP.x-aP.x);
    const nx=-(bP.y-aP.y), ny=(bP.x-aP.x), nL=Math.max(1,Math.hypot(nx,ny));
    const laneZero=T.laneIndex-(LANES_PER_ROUTE-1)/2, off=laneZero*LANE_WIDTH_PX;
    const x=aP.x+(bP.x-aP.x)*T.t+(nx/nL)*off, y=aP.y+(bP.y-aP.y)*T.t+(ny/nL)*off;

    const z=map.getZoom(), scale=1.0+(z-4)*0.12, w=28*scale, h=14*scale;
    const num=truckNumberById.get(T.id)||0;
    ctx.save(); ctx.translate(x,y); ctx.rotate(theta); drawVectorTruck(ctx,w,h,T.delayed,num); ctx.restore();
  }
  drawWarehouses();
}

/* -------------------- narration (play twice) -------------------- */
const synth=window.speechSynthesis; let VOICE=null;
function pickVoice(){
  const vs=synth?.getVoices?.()||[];
  const prefs=[/en-IN/i,/English.+India/i,/Neural|Natural/i,/Microsoft|Google/i,/en-GB/i,/en-US/i];
  for(const p of prefs){ const v=vs.find(v=>p.test(v.name)||p.test(v.lang)); if(v) return v; }
  return vs[0]||null;
}
VOICE=pickVoice(); if(!VOICE&&synth) synth.onvoiceschanged=()=>{VOICE=pickVoice();};
let ttsTimers=[]; function clearTTS(){ ttsTimers.forEach(clearTimeout); ttsTimers=[]; try{synth?.cancel?.();}catch(e){} }
function speakOnce(text,rate=0.9){ if(!synth||!text) return; const u=new SpeechSynthesisUtterance(String(text)); if(VOICE) u.voice=VOICE; u.rate=rate; u.pitch=1.0; u.volume=1; synth.speak(u); }
function measureQueueDuration(lines,rate=0.9,gap=950){ let t=0; lines.forEach(line=>{ const d=Math.max(1700,48*line.length); t+=d+gap; }); return t; }
function speakQueue(lines,gap=950,rate=0.9){ clearTTS(); let t=0; lines.forEach(line=>{ const d=Math.max(1700,48*line.length); ttsTimers.push(setTimeout(()=>speakOnce(line,rate),t)); t+=d+gap; }); }
function speakQueueTwice(lines,gap=950,rate=0.9){
  clearTTS();
  const dur=measureQueueDuration(lines,rate,gap);
  speakQueue(lines,gap,rate);
  ttsTimers.push(setTimeout(()=>speakQueue(lines,gap,rate), dur+600)); // replay once after slight gap
}

/* -------------------- scenario + REAL stats -------------------- */
async function fetchOrDefault(file, fallback){
  try{ const r=await fetch(`${file}?v=${Date.now()}`,{cache:"no-store"}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  catch(e){ debug(`Using default scenario (${e.message})`); return fallback; }
}

const baseStats={};     // BEFORE snapshot (Σ) — from scenario_before.json
let beforeStats=null;   // computed from BEFORE JSON (Σ)
let afterStats=null;    // computed from AFTER JSON  (Σ)

function computeStatsFromScenario(scn){
  const inC={}, outC={};
  (scn.trucks||[]).forEach(t=>{ outC[t.origin]=(outC[t.origin]||0)+1; inC[t.destination]=(inC[t.destination]||0)+1; });
  const stats={};
  (scn.warehouses||[]).forEach(w=>{
    stats[w.id]={ inv:w.inventory??0, in:inC[w.id]||0, out:outC[w.id]||0 };
  });
  return stats;
}

function renderStatsTable(pred){
  const tbody=document.querySelector("#statsTable tbody"); if(!tbody) return; tbody.innerHTML="";
  for(const id of Object.keys(CITY)){
    const s=pred[id]||{inv:"-",in:0,out:0};
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${CITY[id].name}</td><td>${s.inv}</td><td class="pos">+${s.in}</td><td class="neg">-${s.out}</td>`;
    tbody.appendChild(tr);
  }
}

function copyStats(src){ const out={}; for(const k of Object.keys(src)) out[k]={...src[k]}; return out; }

/* Projection during Disrupt: use BEFORE JSON delayed trucks (real) */
function deltaFromDelayedTrucks(scnBefore){
  const dByWh={}; Object.keys(CITY).forEach(id=>dByWh[id]=0);
  for(const t of (scnBefore.trucks||[])){
    const isDelayed=(t.status||"").toLowerCase()==="delayed" || (t.delay_hours||0)>0;
    if(isDelayed) dByWh[t.origin]-=1; // one departure paused at origin
  }
  return dByWh; // counts (not units). We'll reflect counts in in/out; inv stays Σ from BEFORE unless you want live inv ticks.
}

/* Apply Δ counts to a stats snapshot for visualization */
function applyDeltaToStats(base, deltaCounts, invShiftPerTruck=10){
  const out=copyStats(base);
  for(const wh of Object.keys(deltaCounts)){
    const d=deltaCounts[wh];
    if(d<0){ // paused departures: less out, more inventory retained
      out[wh].out=Math.max(0,(out[wh].out||0)+d);           // reduce out count
      out[wh].inv=(out[wh].inv||0)+(-d)*invShiftPerTruck;   // keep units at origin
    } else if(d>0){
      out[wh].out=(out[wh].out||0)+d;
      out[wh].inv=Math.max(0,(out[wh].inv||0)-d*invShiftPerTruck);
    }
  }
  return out;
}

/* -------------------- pause / reroute control -------------------- */
function odMatch(ids,o,d){ const a=ids[0], b=ids[ids.length-1]; return (a===o&&b===d)||(a===d&&b===o); }
function setTruckPath(T,latlon,toMid=false){ if(!latlon||latlon.length<2) return; T.latlon=latlon; T.seg=0; T.dir=1; T.t=toMid?0.5:0.0; }

function pauseAllOnRoute(step){
  const ids=step.route; const latlon=expandIDsToLatLon(ids);
  let paused=0;
  for(const T of trucks){
    const baseIDs=defaultPathIDs(T.origin,T.dest);
    if(odMatch(baseIDs, ids[0], ids[1])){
      if(!T.savedPath) T.savedPath={ latlon:[...T.latlon], seg:T.seg, t:T.t, dir:T.dir };
      setTruckPath(T, latlon, true);
      T.paused=true; paused++;
    }
  }
  return paused;
}
function unpauseAll(resetToSaved){
  for(const T of trucks){
    if(T.paused){
      if(resetToSaved && T.savedPath) setTruckPath(T, T.savedPath.latlon, false);
      T.paused=false; T.savedPath=null;
    }
  }
}
function reroutePaused(step){
  const full=step.reroute?.length ? expandIDsToLatLon(step.reroute.flat()) : null;
  if(!full) return 0;
  let released=0;
  for(const T of trucks){
    if(!T.paused) continue;
    setTruckPath(T, full, false);
    T.paused=false; T.savedPath=null; released++;
  }
  return released;
}

/* -------------------- state machine: normal | disrupt | fixed -------------- */
let mode="normal"; let currentStepIdx=-1;

function featureFor(ids){ return {type:"Feature",properties:{id:ids.join("-")},geometry:{type:"LineString",coordinates:toLonLat(expandIDsToLatLon(ids))}}; }
function setAlert(ids){ setSourceFeatures("alert",[featureFor(ids)]); }
function clearAlert(){ setSourceFeatures("alert",[]); }
function setFix(pairs){ setSourceFeatures("fix",(pairs||[]).map(pair=>featureFor(pair))); }
function clearFix(){ setSourceFeatures("fix",[]); }

function startDisrupt(){
  if(mode==="disrupt"){ speakQueueTwice(["A disruption is already active. Please click the Correct button to proceed."],900,0.92); return; }

  // advance to next step
  currentStepIdx = (currentStepIdx + 1) % STEPS.length;
  const step=STEPS[currentStepIdx];

  clearFix(); setAlert(step.route);
  const pausedCount=pauseAllOnRoute(step);

  /* Predictive stats for disruption — REAL projection from BEFORE JSON delays */
  const deltaCounts=deltaFromDelayedTrucks(SCN_BEFORE||{trucks:[]});
  const pred=applyDeltaToStats(beforeStats, deltaCounts, 10);
  renderStatsTable(pred);

  // zoom to corridor for clarity
  fitToRoute(step.route);

  // narration (twice)
  speakQueueTwice([
    ...step.cause,
    "Once you are ready, please click the Correct button."
  ], 950, 0.9);

  mode="disrupt";
}

function applyCorrect(){
  if(mode!=="disrupt"){ speakQueueTwice(["No active disruption. Click Disrupt first."],800,0.95); return; }
  const step=STEPS[currentStepIdx];

  clearAlert();
  setFix(step.reroute);            // draw detour (green) — always on top
  const released=reroutePaused(step);

  /* On correction, show AFTER snapshot EXACTLY as per JSON (your ask #3) */
  renderStatsTable(afterStats);

  // zoom to reroute path
  fitToRoute(step.reroute.flat());

  // narration (twice)
  speakQueueTwice(step.fix, 950, 0.92);
  mode="fixed";
}

function backToNormal(){
  clearTTS();
  clearAlert(); clearFix();
  unpauseAll(true); // restore original paths
  renderStatsTable(beforeStats);   // show BEFORE JSON numbers
  speakQueueTwice(["Returning to normal operations. All corridors white and flowing."], 900, 0.95);
  mode="normal";
}

/* -------------------- camera helpers -------------------- */
function fitToRoute(idsOrPairs){
  const pts = Array.isArray(idsOrPairs[0])
    ? expandIDsToLatLon(idsOrPairs.flat())
    : expandIDsToLatLon(idsOrPairs);
  const b=new maplibregl.LngLatBounds();
  pts.forEach(p=>b.extend([p[1],p[0]]));
  map.fitBounds(b,{padding:{top:60,left:60,right:320,bottom:60},duration:700,maxZoom:6.9});
}

/* -------------------- boot -------------------- */
const mapReady=new Promise(res=>map.on("load",res));
(async function start(){
  await mapReady;
  ensureCanvas(); ensureRoadLayers();

  // rename & add buttons
  const ui=document.getElementById("ui")||document.body;
  const btnBefore=document.getElementById("btnBefore");
  const btnAfter=document.getElementById("btnAfter");
  if(btnBefore) btnBefore.textContent="Disrupt";
  if(btnAfter)  btnAfter.textContent="Correct";

  let btnNormal=document.getElementById("btnNormal");
  if(!btnNormal){
    btnNormal=document.createElement("button");
    btnNormal.id="btnNormal"; btnNormal.textContent="Normal";
    btnNormal.style.marginLeft="8px";
    ui.appendChild(btnNormal);
  }

  // wire events
  if(btnBefore) btnBefore.onclick=()=>startDisrupt();
  if(btnAfter)  btnAfter.onclick =()=>applyCorrect();
  btnNormal.onclick=()=>backToNormal();

  // load REAL scenarios
  SCN_BEFORE = await fetchOrDefault("scenario_before.json", DEFAULT_BEFORE);
  SCN_AFTER  = await fetchOrDefault("scenario_after.json",  DEFAULT_BEFORE); // fallback ok

  // compute REAL stats snapshots
  beforeStats = computeStatsFromScenario(SCN_BEFORE);
  afterStats  = computeStatsFromScenario(SCN_AFTER);
  Object.assign(baseStats, beforeStats); // keep for legacy uses

  // spawn trucks from BEFORE scenario
  trucks.length=0; truckNumberById.clear();
  (SCN_BEFORE.trucks||[]).forEach((t,i)=>spawnTruck(t,i));

  // initial camera
  const b=new maplibregl.LngLatBounds(); Object.values(CITY).forEach(c=>b.extend([c.lon,c.lat]));
  map.fitBounds(b,{padding:{top:60,left:60,right:320,bottom:60},duration:800,maxZoom:6.8});

  // start clean — show BEFORE stats (REAL JSON)
  renderStatsTable(beforeStats);
  backToNormal(); // also speaks "Returning to normal..." twice
})();

function tick(){ const now=performance.now(); const dt=Math.min(0.05,(now-__lastTS)/1000); __lastTS=now; __dt=dt; drawFrame(); requestAnimationFrame(tick); }
requestAnimationFrame(tick);
