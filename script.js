/* ==============================================================
   Agentic Twin — India Logistics (5 warehouses, road glow, TTS)
   ============================================================== */

const MAP_INIT = { center:[78.9629,21.5937], zoom:4.8, minZoom:3, maxZoom:12, pitch:0, bearing:0 };
const STYLE_URL = "style.json";              // your MapLibre+MapTiler style
const CARTO_STYLE_JSON_URL = "";             // optional labels
const TRUCK_IMG = "truck_top.png";           // fallback only
const WH_ICON   = "warehouse_texture.png";   // fallback only

// warehouses: vector icon is sharp at any zoom
const USE_VECTOR_WAREHOUSE = true;
const WAREHOUSE_BASE_PX = 84, WAREHOUSE_MIN_PX = 48, WAREHOUSE_MAX_PX = 132;
const warehouseSizeByZoom = z => Math.max(WAREHOUSE_MIN_PX, Math.min(WAREHOUSE_MAX_PX, WAREHOUSE_BASE_PX*(0.9+(z-5)*0.28)));

// trucks: fast + lane offsets/gaps so they don’t overlap
const SPEED_MULTIPLIER = 8.0;    // 8× baseline (very zippy)
const MIN_GAP_PX = 50;           // headway on same segment
const CROSS_GAP_PX = 34;         // gap at crossings
const LANES_PER_ROUTE = 3;
const LANE_WIDTH_PX   = 6.5;

// narration: voice only (hide panel)
const SHOW_TEXT_LOG = false;
(() => { const p=document.getElementById("commentary"); if (p) p.style.display="none"; })();
const logEl = document.getElementById("commentaryLog");
let t0=performance.now(); const nowSec=()=>((performance.now()-t0)/1000).toFixed(1);
function clearLog(){ if(SHOW_TEXT_LOG&&logEl) logEl.textContent=""; t0=performance.now(); ttsFlush(true); }
function log(msg,speak=true){ if(SHOW_TEXT_LOG&&logEl) logEl.textContent+=`[t=${nowSec()}s] ${msg}\n`; console.log(msg); if(speak) ttsEnq(msg); }

// ---- humanoid TTS
const synth=window.speechSynthesis; let VOICE=null,q=[],playing=false;
function pickVoice(){ const prefs=[/en-IN/i,/English.+India/i,/Natural|Neural/i,/Microsoft/i,/Google/i,/en-GB/i,/en-US/i]; const vs=synth?.getVoices?.()||[]; for(const p of prefs){ const v=vs.find(v=>p.test(v.name)||p.test(v.lang)); if(v) return v; } return vs[0]||null; }
VOICE=pickVoice(); if(!VOICE&&synth) synth.onvoiceschanged=()=>{ VOICE=pickVoice(); };
const speakNorm=s=>String(s).replace(/\bETA\b/gi,"E T A").replace(/\bAI\b/gi,"A I").replace(/WH(\d+)/g,"Warehouse $1").replace(/->|→/g," to ");
function ttsEnq(t){ if(!synth) return; speakNorm(t).split(/(?<=[.!?;])\s+|(?<=,)\s+/).forEach(p=>q.push(p)); if(!playing) playNext(); }
function playNext(){ if(!synth) return; if(!q.length){ playing=false; return; } playing=true; const u=new SpeechSynthesisUtterance(q.shift()); if(VOICE) u.voice=VOICE; u.rate=1.0; u.pitch=1.02; u.onend=playNext; synth.speak(u); }
function ttsFlush(cancel){ q=[]; playing=false; if(cancel&&synth) synth.cancel(); }

// ---- map
const map = new maplibregl.Map({ container:"map", style:STYLE_URL, center:MAP_INIT.center, zoom:MAP_INIT.zoom, pitch:0, bearing:0, hash:false });
map.addControl(new maplibregl.NavigationControl({ visualizePitch:false }),"top-left");
const trucksCanvas=document.getElementById("trucksCanvas"); const tctx=trucksCanvas.getContext("2d");
function resizeCanvas(){ const dpr=window.devicePixelRatio||1, base=map.getCanvas(); trucksCanvas.width=base.clientWidth*dpr; trucksCanvas.height=base.clientHeight*dpr; trucksCanvas.style.width=base.clientWidth+"px"; trucksCanvas.style.height=base.clientHeight+"px"; tctx.setTransform(dpr,0,0,dpr,0,0); }
window.addEventListener("resize",resizeCanvas);

// ---- city anchors (now 5 warehouses)
const CITY = {
  WH1:{ name:"WH1 — Delhi",      lat:28.6139, lon:77.2090 },
  WH2:{ name:"WH2 — Mumbai",     lat:19.0760, lon:72.8777 },
  WH3:{ name:"WH3 — Bangalore",  lat:12.9716, lon:77.5946 },
  WH4:{ name:"WH4 — Hyderabad",  lat:17.3850, lon:78.4867 },
  WH5:{ name:"WH5 — Kolkata",    lat:22.5726, lon:88.3639 }
};

// ---- densified motorway-like polylines for corridors (lat,lon)
const RP = {
  "WH1-WH2":[[28.6139,77.2090],[28.0210,76.3480],[26.9124,75.7873],[25.5893,75.4843],[24.5854,73.7125],[23.0225,72.5714],[21.1702,72.8311],[19.8704,72.8847],[19.0760,72.8777]],
  "WH2-WH3":[[19.0760,72.8777],[18.5204,73.8567],[16.7049,74.2433],[15.8497,74.4977],[13.3409,77.1010],[12.9716,77.5946]],
  "WH3-WH1":[[12.9716,77.5946],[17.3850,78.4867],[21.1458,79.0882],[27.1767,78.0081],[28.6139,77.2090]],   // via HYD/Nagpur/Agra-ish
  // HYDERABAD links
  "WH4-WH1":[[17.3850,78.4867],[21.1458,79.0882],[27.1767,78.0081],[28.6139,77.2090]],
  "WH4-WH2":[[17.3850,78.4867],[18.5204,73.8567],[19.0760,72.8777]],
  "WH4-WH3":[[17.3850,78.4867],[16.0000,77.8000],[14.8000,77.3000],[13.3409,77.1010],[12.9716,77.5946]],
  "WH4-WH5":[[17.3850,78.4867],[18.0,82.0],[19.2,84.8],[21.0,86.0],[22.5726,88.3639]],
  // KOLKATA links
  "WH5-WH1":[[22.5726,88.3639],[23.6,86.1],[24.28,83.0],[25.44,81.84],[26.45,80.35],[27.1767,78.0081],[28.6139,77.2090]],
  "WH5-WH2":[[22.5726,88.3639],[23.5,86.0],[22.5,84.0],[21.5,81.5],[21.1458,79.0882],[20.3,76.5],[19.3,74.5],[19.0760,72.8777]],
  "WH5-WH3":[[22.5726,88.3639],[21.15,85.8],[19.5,85.8],[17.9,82.7],[16.5,80.3],[13.3409,77.1010],[12.9716,77.5946]]
};
const keyFor=(a,b)=>`${a}-${b}`;
function getRoadLatLon(a,b){ const k1=keyFor(a,b), k2=keyFor(b,a); if(RP[k1]) return RP[k1]; if(RP[k2]) return [...RP[k2]].reverse(); return [[CITY[a].lat,CITY[a].lon],[CITY[b].lat,CITY[b].lon]]; }
function expandIDsToLatLon(ids){ const out=[]; for(let i=0;i<ids.length-1;i++){ const seg=getRoadLatLon(ids[i],ids[i+1]); if(i>0) seg.shift(); out.push(...seg); } return out; }
function allRoutesGeoJSON(){ const toLonLat=pts=>pts.map(p=>[p[1],p[0]]); return { type:"FeatureCollection", features:Object.keys(RP).map(k=>({ type:"Feature", properties:{id:k}, geometry:{ type:"LineString", coordinates:toLonLat(RP[k])}}))}; }

// ---- road layers (OSM vector glow + our corridors brighter)
function mtKey(){ try{ const src=map.getStyle().sources['satellite']; if(src?.tiles?.length){ const u=new URL(src.tiles[0]); return u.searchParams.get('key'); } }catch(e){} return ""; }
function addVTroads(){
  const key=mtKey();
  if(!map.getSource("omt")) map.addSource("omt",{ type:"vector", url:`https://api.maptiler.com/tiles/v3/tiles.json?key=${key}` });
  const f=["match",["get","class"],["motorway","trunk","primary"],true,false];
  if(!map.getLayer("vt-roads-glow")) map.addLayer({ id:"vt-roads-glow", type:"line", source:"omt", "source-layer":"transportation", filter:f, paint:{ "line-color":"#59e0ff","line-opacity":0.62,"line-blur":1.4,"line-width":["interpolate",["linear"],["zoom"],4,3.6,6,5.2,8,8.2,10,12.6,12,16.0],"line-join":"round","line-cap":"round" }});
  if(!map.getLayer("vt-roads-casing")) map.addLayer({ id:"vt-roads-casing", type:"line", source:"omt", "source-layer":"transportation", filter:f, paint:{ "line-color":"#0d1116","line-opacity":0.98,"line-width":["interpolate",["linear"],["zoom"],4,1.8,6,2.8,8,4.8,10,7.2,12,9.6],"line-join":"round","line-cap":"round" }});
  if(!map.getLayer("vt-roads-core"))   map.addLayer({ id:"vt-roads-core",   type:"line", source:"omt", "source-layer":"transportation", filter:f, paint:{ "line-color":"#ffffff","line-opacity":0.98,"line-width":["interpolate",["linear"],["zoom"],4,0.9,6,1.3,8,1.8,10,2.4,12,2.8] }});
  // brighter glow under our corridors
  const src="routes-glow"; if(!map.getSource(src)) map.addSource(src,{ type:"geojson", data:allRoutesGeoJSON() });
  if(!map.getLayer("routes-glow-layer")) map.addLayer({ id:"routes-glow-layer", type:"line", source:src, paint:{ "line-color":"#97f0ff","line-opacity":0.78,"line-blur":1.6,"line-width":["interpolate",["linear"],["zoom"],4,4.8,6,6.6,8,9.8,10,14.5,12,19.0],"line-join":"round","line-cap":"round" }});
  if(!map.getLayer("routes-core-layer")) map.addLayer({ id:"routes-core-layer", type:"line", source:src, paint:{ "line-color":"#ffffff","line-opacity":0.98,"line-width":["interpolate",["linear"],["zoom"],4,1.1,6,1.7,8,2.3,10,3.2,12,3.8] }});
}

// ---- trucks
const truckImg=new Image(); truckImg.src=TRUCK_IMG;
const whImg   =new Image(); whImg.src   =WH_ICON;
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
  const startDelay=900+Math.random()*1600;
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

function drawTrucks(){
  tctx.clearRect(0,0,trucksCanvas.width,trucksCanvas.height);
  const now=performance.now();
  for(const T of trucks){
    if(now<T.startAt) continue;
    const a=T.latlon[T.seg], b=T.latlon[T.seg+T.dir]||a;
    const aP=map.project({lng:a[1],lat:a[0]}), bP=map.project({lng:b[1],lat:b[0]});
    const segLenPx=Math.max(1,Math.hypot(bP.x-aP.x,bP.y-aP.y));
    let pxPerSec=SPEED_MULTIPLIER*T.speed*(0.9+(map.getZoom()-4)*0.12);
    const dT=(pxPerSec*(1/60))/segLenPx;
    // spacing along same segment
    const myProg=T.t*segLenPx; let minLead=Infinity;
    for(const O of trucks){
      if(O===T||now<O.startAt) continue;
      if(O.latlon[O.seg]===T.latlon[T.seg] && O.latlon[O.seg+O.dir]===T.latlon[T.seg+T.dir] && O.dir===T.dir){
        const a2=map.project({lng:O.latlon[O.seg][1],lat:O.latlon[O.seg][0]}), b2=map.project({lng:O.latlon[O.seg+O.dir][1],lat:O.latlon[O.seg+O.dir][0]});
        const seg2=Math.max(1,Math.hypot(b2.x-a2.x,b2.y-a2.y)); const oProg=O.t*seg2; if(oProg>myProg) minLead=Math.min(minLead,oProg-myProg);
      }
    }
    let step=dT; if(isFinite(minLead)&&minLead<MIN_GAP_PX) step*=Math.max(0.2,(minLead/MIN_GAP_PX)*0.6);
    // crossing gap
    const {x:cx,y:cy}=truckScreenPos(T); let nearest=Infinity;
    for(const O of trucks){ if(O===T||now<O.startAt) continue; const p=truckScreenPos(O); const d=Math.hypot(p.x-cx,p.y-cy); if(d<nearest) nearest=d; }
    if(isFinite(nearest)&&nearest<CROSS_GAP_PX) step*=Math.max(0.25,(nearest/CROSS_GAP_PX)*0.6);
    // integrate
    T.t+=step; if(T.t>=1){ T.seg+=T.dir; T.t-=1; if(T.seg<=0){T.seg=0;T.dir=1;} else if(T.seg>=T.latlon.length-1){T.seg=T.latlon.length-1;T.dir=-1;} }
    // draw
    const theta=Math.atan2(bP.y-aP.y,bP.x-aP.x); const x=aP.x+(bP.x-aP.x)*T.t, y=aP.y+(bP.y-aP.y)*T.t;
    const nx=-(bP.y-aP.y), ny=(bP.x-aP.x); const nLen=Math.max(1,Math.hypot(nx,ny));
    const laneZero=T.laneIndex-(LANES_PER_ROUTE-1)/2; const off=laneZero*LANE_WIDTH_PX;
    const xOff=x+(nx/nLen)*off, yOff=y+(ny/nLen)*off;
    const z=map.getZoom(), scale=1.0+(z-4)*0.12, w=28*scale, h=14*scale;
    tctx.save(); tctx.translate(xOff,yOff); tctx.rotate(theta); drawVectorTruck(tctx,w,h,T.delayed); tctx.restore();
  }
  map.triggerRepaint();
}

// ---- WOW warehouse (yellow/green like your reference)
function drawWarehouseIcon(ctx,x,y,S){
  const snap=v=>Math.round(v)+0.5; ctx.save(); ctx.translate(Math.round(x)+0.5,Math.round(y)+0.5);
  const r=S/2, depth=Math.max(10,S*0.20), bw=S*0.78, bh=S*0.54, padR=12;

  // shadow
  ctx.fillStyle="rgba(0,0,0,0.26)"; ctx.beginPath(); ctx.ellipse(0,r*0.56,r*0.92,r*0.38,0,0,Math.PI*2); ctx.fill();

  // tarmac pad
  const padGr=ctx.createLinearGradient(0,-r,0,r); padGr.addColorStop(0,"#131920"); padGr.addColorStop(1,"#0b0f15");
  ctx.fillStyle=padGr; ctx.strokeStyle="rgba(80,220,255,0.45)"; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.roundRect(snap(-r),snap(-r),S,S,padR); ctx.fill(); ctx.stroke();

  // front body (yellow) with green stripe + dark plinth
  const bodyTop="#f2c500", bodyBot="#e3b600";
  const faceX=snap(-bw/2), faceY=snap(-bh/2);
  const grd=ctx.createLinearGradient(0,faceY,0,faceY+bh); grd.addColorStop(0,bodyTop); grd.addColorStop(1,bodyBot);
  ctx.fillStyle=grd; ctx.strokeStyle="#5e5d57"; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.roundRect(faceX,faceY,bw,bh,6); ctx.fill(); ctx.stroke();

  // green band (like reference)
  const bandH=bh*0.22; const bandY=faceY+bh*0.40; ctx.fillStyle="#147a4b";
  ctx.fillRect(faceX+2, bandY, bw-4, bandH);

  // plinth (dark base)
  ctx.fillStyle="#26303a"; ctx.fillRect(faceX+2, faceY+bh-8, bw-4, 8);

  // top face (light gray)
  ctx.fillStyle="#f5f8fb"; ctx.strokeStyle="#9099a5";
  ctx.beginPath();
  ctx.moveTo(faceX, faceY);
  ctx.lineTo(faceX+bw, faceY);
  ctx.lineTo(faceX+bw-depth, faceY-depth);
  ctx.lineTo(faceX+depth,  faceY-depth);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // roof ribs perspective
  ctx.strokeStyle="#b6c0cb"; ctx.lineWidth=1;
  for(let i=1;i<=6;i++){ const t=i/7, x1=faceX+depth*(1-t), x2=faceX+bw-depth*t, yy=faceY-depth*t; ctx.beginPath(); ctx.moveTo(snap(x1),snap(yy)); ctx.lineTo(snap(x2),snap(yy)); ctx.stroke(); }

  // skylights
  const skW=bw*0.16, skH=depth*0.66, skY=faceY-depth+skH/2+1;
  const skyl=(cx)=>{ ctx.fillStyle="#eaf2ff"; ctx.strokeStyle="rgba(0,0,0,0.25)"; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(snap(cx-skW/2),snap(skY-skH/2),skW,skH,3); ctx.fill(); ctx.stroke(); };
  skyl(-bw*0.24); skyl(+bw*0.24);

  // roof HVAC mini boxes
  const unitW=skW*0.72, unitH=skH*0.80, uY=skY-skH*1.10;
  const hv=(cx)=>{ ctx.fillStyle="#d2d7dd"; ctx.strokeStyle="#808891"; ctx.beginPath(); ctx.roundRect(snap(cx-unitW/2),snap(uY-unitH/2),unitW,unitH,4); ctx.fill(); ctx.stroke();
                   ctx.strokeStyle="#7c848d"; for(let k=1;k<=3;k++){ const yy=uY-unitH/2+6+k*(unitH/3.2); ctx.beginPath(); ctx.moveTo(snap(cx-unitW/2+6),snap(yy)); ctx.lineTo(snap(cx+unitW/2-6),snap(yy)); ctx.stroke(); }};
  hv(-bw*0.08); hv(+bw*0.08);

  // dock frame + shutter
  const shW=bw*0.48, shH=bh*0.38, shY=faceY+bh*0.12; ctx.fillStyle="#6f7780";
  ctx.beginPath(); ctx.roundRect(snap(-shW/2),snap(shY),shW,shH,4); ctx.fill();
  ctx.strokeStyle="#525a63"; ctx.lineWidth=1;
  for(let i=1;i<6;i++){ const yy=shY+(i/6)*shH; ctx.beginPath(); ctx.moveTo(snap(-shW/2+6),snap(yy)); ctx.lineTo(snap(shW/2-6),snap(yy)); ctx.stroke(); }
  ctx.fillStyle="#3f464f"; ctx.fillRect(snap(-shW/2+5),snap(shY+shH*0.60),shW-10,shH*0.38);

  // ramp chevrons
  const rampH=shH*0.26, ry=shY+shH+8; for(let i=-shW/2+8;i<shW/2-8;i+=16){ ctx.fillStyle=(Math.floor(i/16)%2===0)?"#ffd44a":"#1e2329";
    ctx.beginPath(); ctx.moveTo(snap(i),snap(ry)); ctx.lineTo(snap(i+16),snap(ry)); ctx.lineTo(snap(i),snap(ry+rampH)); ctx.closePath(); ctx.fill(); }
  // bollards
  ctx.fillStyle="#ffc93c"; const by1=shY+shH-6, by2=by1+rampH*0.9; [-1,1].forEach(s=>{ const bx=s*(shW/2+12); ctx.fillRect(snap(bx-2),snap(by1),4,by2-by1); ctx.fillStyle="#33383f"; ctx.fillRect(snap(bx-1),snap(by1+6),2,by2-by1-12); ctx.fillStyle="#ffc93c"; });

  ctx.restore();
}

function drawWarehouseLabels(){
  tctx.save(); const z=map.getZoom(); tctx.font="bold 12px system-ui, Segoe UI, Roboto, sans-serif"; tctx.textBaseline="middle";
  const centroid=map.project({ lng:(CITY.WH1.lon+CITY.WH2.lon+CITY.WH3.lon+CITY.WH4.lon+CITY.WH5.lon)/5, lat:(CITY.WH1.lat+CITY.WH2.lat+CITY.WH3.lat+CITY.WH4.lat+CITY.WH5.lat)/5 });
  for(const id of Object.keys(CITY)){
    const c=CITY[id]; const p=map.project({lng:c.lon,lat:c.lat}); const S=warehouseSizeByZoom(z);
    if(USE_VECTOR_WAREHOUSE) drawWarehouseIcon(tctx,p.x,p.y,S); else if(whImg.complete) tctx.drawImage(whImg,p.x-S/2,p.y-S/2,S,S); else drawWarehouseIcon(tctx,p.x,p.y,S);
    const label=c.name, pad=6, h=18, w=tctx.measureText(label).width+pad*2;
    const dx=p.x-centroid.x, dy=p.y-centroid.y, rot=(id==="WH3")?0.18:(id==="WH2"?-0.06:(id==="WH5"?0.12:0.08));
    const ca=Math.cos(rot), sa=Math.sin(rot), ex=dx*ca - dy*sa, ey=dx*sa + dy*ca, push=S/2+14, len=Math.max(1,Math.hypot(ex,ey));
    const px=p.x+(ex/len)*push, py=p.y+(ey/len)*push;
    tctx.fillStyle="rgba(10,10,11,0.82)"; tctx.strokeStyle="rgba(255,255,255,0.25)"; tctx.fillRect(px-w/2,py-h/2,w,h); tctx.strokeRect(px-w/2,py-h/2,w,h);
    tctx.fillStyle="#e6e6e6"; tctx.fillText(label,px-w/2+pad,py);
  }
  tctx.restore();
}

// ---- optional CARTO labels
async function addCartoLabels(){ if(!CARTO_STYLE_JSON_URL) return; try{ const r=await fetch(CARTO_STYLE_JSON_URL); if(!r.ok) throw 0; const s=await r.json(); for(const [sid,src] of Object.entries(s.sources||{})){ if(!map.getSource(sid)) map.addSource(sid,src); }
  (s.layers||[]).filter(l=>l.type==="symbol").forEach(l=>{ const L=JSON.parse(JSON.stringify(l)); if(!map.getLayer(L.id)) try{ map.addLayer(L);}catch(e){} }); }catch(e){ console.warn("CARTO labels failed"); } }

// ---- scenario loader
window.loadScenario = async function(file,humanLabel){
  try{
    clearLog(); trucks.length=0;
    const url = `${file}${file.includes('?')?'&':'?'}v=${Date.now()}`;
    const res = await fetch(url); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text(); const data = JSON.parse(txt);

    const reroutes=new Map(); if(Array.isArray(data.reroutes)) for(const r of data.reroutes){ if(r.truckId && Array.isArray(r.path)) reroutes.set(r.truckId,r.path.slice()); }
    for(const tr of (data.trucks||[])) spawnTruck(tr,reroutes);

    const say = humanLabel || (/after/i.test(file) ? "After Correction" : "Before Disruption");
    ttsEnq(say);

    let tl=data?.commentary?.timeline; if(tl) tl=Array.isArray(tl)?tl:(typeof tl==="object"?Object.values(tl):null);
    if(Array.isArray(tl)){ for(const step of tl){ try{ const d=Number(step?.delay_ms)||0; if(d>0) await new Promise(r=>setTimeout(r,d)); if(typeof step?.msg==="string") ttsEnq(step.msg); }catch{} } }
  }catch(e){ console.error(e); ttsEnq("There was an error loading the scenario."); }
};

// ---- init
map.on("load", async ()=>{ resizeCanvas(); addVTroads(); await addCartoLabels(); loadScenario("scenario_before.json","Before Disruption"); });
map.on("render", ()=>{ drawTrucks(); drawWarehouseLabels(); });
map.on("resize", resizeCanvas);
