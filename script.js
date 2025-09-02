// ===========================
// 3D AI Agentic Twin — Phase 1C (movement restored)
// Map bootstrap + warehouses/labels + straight-line triangle routes
// Continuous ping-pong movement, staggered start, convoy spacing, narration
// Trucks always visible (MeshBasic + on-top marker)
// ===========================

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// -------- Camera (top-down ortho) --------
let orthoCam;
let MAP_W = 140, MAP_H = 140;
function setupCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = MAP_H / 2, halfW = halfH * aspect;
  if (!orthoCam) {
    orthoCam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 2000);
    orthoCam.position.set(0, 300, 0);
    orthoCam.up.set(0, 0, -1);
    orthoCam.lookAt(0, 0, 0);
  } else {
    orthoCam.left = -halfW; orthoCam.right = halfW; orthoCam.top = halfH; orthoCam.bottom = -halfH;
    orthoCam.updateProjectionMatrix();
  }
}

scene.add(new THREE.AmbientLight(0xffffff, 1));

// -------- Commentary + TTS --------
const logEl = document.getElementById("commentaryLog");
let t0 = performance.now();
function nowSec(){ return ((performance.now()-t0)/1000).toFixed(1); }
function clearLog(){ if (logEl) logEl.textContent=""; t0=performance.now(); ttsFlushQueue(true); }
function log(msg, speak=true){ const line=`[t=${nowSec()}s] ${msg}`; if (logEl) logEl.textContent+=line+"\n"; console.log(line); if(speak) ttsEnqueue(msg); }
function writeStaticSummary(data,label){ if(data?.commentary?.static) log(`${label}: ${data.commentary.static}`); else log(`${label}: ${(data?.warehouses||[]).length||3} warehouses, ${(data?.trucks||[]).length||0} trucks.`); }
async function replayTimeline(data){ if(!data?.commentary?.timeline) return; for(const step of data.commentary.timeline){ const d=Math.max(0, step.delay_ms||0); await new Promise(r=>setTimeout(r,d)); if(typeof step.msg==="string") log(step.msg,true); } }

// Humanoid TTS (FIFO; compact)
const synth = window.speechSynthesis; const ttsSupported = typeof synth!=="undefined";
let VOICE=null, ttsQueue=[], ttsPlaying=false;
const VOICE_PREFERENCES=[/en-IN/i,/English.+India/i,/Natural/i,/Neural/i,/Microsoft.+Online/i,/Microsoft.+(Aria|Jenny|Guy|Davis|Ana)/i,/Google.+(en-US|en-GB)/i,/en-GB/i,/en-US/i];
function pickBestVoice(){ if(!ttsSupported) return null; const v=synth.getVoices(); if(!v?.length) return null; for(const p of VOICE_PREFERENCES){ const m=v.find(x=>p.test(x.name)||p.test(x.lang)); if(m) return m; } return v[0]; }
if(ttsSupported){ VOICE=pickBestVoice(); if(!VOICE) synth.onvoiceschanged=()=>{ VOICE=pickBestVoice(); }; }
function normalizeForSpeech(t){ return String(t).replace(/\bETA\b/gi,"E T A").replace(/\bAI\b/gi,"A I").replace(/WH(\d+)/g,"Warehouse $1").replace(/(\d+)%/g,"$1 percent").replace(/->|→/g," to ").replace(/\s+/g," ").trim(); }
function chunkForSpeech(t){ return normalizeForSpeech(t).split(/(?<=[.!?;])\s+|(?<=,)\s+/).filter(Boolean); }
function humanizeRate(b=1){ return Math.max(0.85, Math.min(1.15, b+(Math.random()-0.5)*0.08)); }
function humanizePitch(b=1){ return Math.max(0.9, Math.min(1.2, b+(Math.random()-0.5)*0.06)); }
function ttsEnqueue(t){ if(!ttsSupported) return; chunkForSpeech(t).forEach(p=>ttsQueue.push(p)); if(!ttsPlaying) ttsPlayNext(); }
function ttsPlayNext(){ if(!ttsSupported) return; if(!ttsQueue.length){ ttsPlaying=false; return; } ttsPlaying=true; const part=ttsQueue.shift(); const u=new SpeechSynthesisUtterance(part); if(VOICE) u.voice=VOICE; u.rate=humanizeRate(0.98); u.pitch=humanizePitch(1.02); u.volume=1.0; u.onend=()=>ttsPlayNext(); synth.speak(u); }
function ttsFlushQueue(cancel=false){ ttsQueue=[]; ttsPlaying=false; if(cancel&&ttsSupported) synth.cancel(); }

// -------- Map + projection --------
const MAP_IMAGE_PATH = "india_map.png?v=7"; // bump if cached
let mapPlane;
const BOUNDS = { latMin: 8, latMax: 37, lonMin: 68, lonMax: 97 };
function projectLatLon(lat, lon){
  const u = (lon-BOUNDS.lonMin)/(BOUNDS.lonMax-BOUNDS.lonMin);
  const v = 1 - (lat-BOUNDS.latMin)/(BOUNDS.latMax-BOUNDS.latMin);
  return new THREE.Vector3((u-0.5)*MAP_W, 0, (v-0.5)*MAP_H);
}

// Cities
const CITY = {
  WH1:{ name:"WH1 — Delhi",     lat:28.6139, lon:77.2090 },
  WH2:{ name:"WH2 — Mumbai",    lat:19.0760, lon:72.8777 },
  WH3:{ name:"WH3 — Bangalore", lat:12.9716, lon:77.5946 }
};

// Groups
const warehousesGroup=new THREE.Group();
const roadsGroup=new THREE.Group();
const LABELS=new THREE.Group();
const trucksGroup=new THREE.Group();
scene.add(warehousesGroup, roadsGroup, LABELS, trucksGroup);

// Positions
let WH_POS = {};

// Labels
function makeTextSprite(text, opacity=0.82){
  const c=document.createElement("canvas"), ctx=c.getContext("2d");
  const fs=28, pad=18; ctx.font=`bold ${fs}px system-ui, Segoe UI, Roboto, sans-serif`;
  const w=Math.ceil(ctx.measureText(text).width+pad*2), h=Math.ceil(fs+pad*2); c.width=w; c.height=h;
  ctx.font=`bold ${fs}px system-ui, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle=`rgba(10,10,11,${opacity})`; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.strokeRect(0,0,w,h);
  ctx.fillStyle="#e6e6e6"; ctx.textBaseline="middle"; ctx.fillText(text,pad,h/2);
  const tex=new THREE.CanvasTexture(c);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false }));
  const s=0.08; spr.scale.set(w*s,h*s,1); spr.renderOrder=999; return spr;
}
function buildLabels(){
  LABELS.clear();
  const offsetY=3.6;
  const centroid=new THREE.Vector3((WH_POS.WH1.x+WH_POS.WH2.x+WH_POS.WH3.x)/3,0,(WH_POS.WH1.z+WH_POS.WH2.z+WH_POS.WH3.z)/3);
  function place(text, base, pushOut=7.0, ang=0){
    const fromC=new THREE.Vector3().subVectors(base,centroid).setY(0); if(fromC.lengthSq()<1e-6) fromC.set(1,0,0);
    const dir=fromC.clone().normalize(); if(ang!==0){ const c=Math.cos(ang), s=Math.sin(ang); const x=dir.x,z=dir.z; dir.x=x*c-z*s; dir.z=x*s+z*c; }
    const p=base.clone().add(dir.multiplyScalar(pushOut));
    const spr=makeTextSprite(text,0.82); spr.position.set(p.x,offsetY,p.z); LABELS.add(spr);
  }
  place(CITY.WH1.name, WH_POS.WH1, 7.0,  0.10);
  place(CITY.WH2.name, WH_POS.WH2, 7.0, -0.10);
  place(CITY.WH3.name, WH_POS.WH3, 8.4,  0.20);
}

// Warehouses & Roads
function createWarehouseMesh(pos){
  const geo=new THREE.CylinderGeometry(2.8,2.8,0.7,28);
  const mat=new THREE.MeshBasicMaterial({ color:0x3c82f6 });
  const m=new THREE.Mesh(geo,mat); m.position.copy(pos); m.position.y=0.35; return m;
}
function buildWarehouses(){
  warehousesGroup.clear(); WH_POS={};
  for(const id of Object.keys(CITY)){ const p=projectLatLon(CITY[id].lat,CITY[id].lon); WH_POS[id]=p; warehousesGroup.add(createWarehouseMesh(p)); }
}
function drawRoad(a,b){
  const mat=new THREE.LineBasicMaterial({ color:0x444444 });
  const pts=[a.clone().add(new THREE.Vector3(0,0.02,0)), b.clone().add(new THREE.Vector3(0,0.02,0))];
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); line.renderOrder=1; roadsGroup.add(line);
}
function buildRoads(){ roadsGroup.clear(); drawRoad(WH_POS.WH1,WH_POS.WH2); drawRoad(WH_POS.WH2,WH_POS.WH3); drawRoad(WH_POS.WH3,WH_POS.WH1); }

// ---- Map bootstrap: placeholder first, swap real texture when ready ----
setupCamera();
(function placeholder(){
  const geo=new THREE.PlaneGeometry(MAP_W, MAP_H);
  const mat=new THREE.MeshBasicMaterial({ color:0x0f1115 });
  mapPlane=new THREE.Mesh(geo, mat); mapPlane.rotation.x=-Math.PI/2; scene.add(mapPlane);
})();
buildWarehouses(); buildRoads(); buildLabels();
log("Bootstrapped scene with placeholder map. Loading india_map.png…");
loadScenario("scenario_before.json","Normal operations");

const mapImg=new Image();
mapImg.onload=()=>{
  try{
    const tex=new THREE.Texture(mapImg); tex.needsUpdate=true;
    const aspect=mapImg.width/mapImg.height; MAP_W=140*aspect; MAP_H=140;
    const newGeo=new THREE.PlaneGeometry(MAP_W, MAP_H);
    mapPlane.geometry.dispose(); mapPlane.geometry=newGeo;
    if(mapPlane.material.map) mapPlane.material.map.dispose();
    mapPlane.material.dispose(); mapPlane.material=new THREE.MeshBasicMaterial({ map:tex });
    setupCamera(); buildWarehouses(); buildRoads(); buildLabels();
    log(`Map loaded: ${mapImg.width}×${mapImg.height} (aspect ${aspect.toFixed(3)}). Rebuilt network.`);
    loadScenario("scenario_before.json","Normal operations");
  }catch(e){ console.error("Map apply error:",e); log("Map loaded but failed to apply. Keeping placeholder."); }
};
mapImg.onerror=(e)=>{ console.error("Map load failed",e); log("Could not load india_map.png — using placeholder."); };
mapImg.src = MAP_IMAGE_PATH;

// -------- Movement along straight segments (ping-pong) --------
const ADJ = { WH1:["WH2","WH3"], WH2:["WH1","WH3"], WH3:["WH1","WH2"] };
function defaultPathIDs(o,d){ if(o===d) return [o]; if(ADJ[o]?.includes(d)) return [o,d]; if(o!=="WH2"&&d!=="WH2") return [o,"WH2",d]; return [o,d]; }
function idsToPoints(ids){ return ids.map(id=>WH_POS[id]).filter(Boolean).map(p=>new THREE.Vector3(p.x, 2.0, p.z)); } // y=2 above map

// ---- Trucks (always visible materials + on-top marker) ----
function createTruckMesh(delayed){
  const group=new THREE.Group();
  const bodyCol= delayed?0xff3b30:0x00c853;
  const cabCol = delayed?0xcc2e28:0x009943;

  const body=new THREE.Mesh(new THREE.BoxGeometry(3.2,1.6,1.6), new THREE.MeshBasicMaterial({ color:bodyCol }));
  body.position.set(0,1.1,0); group.add(body);
  const cab =new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.3), new THREE.MeshBasicMaterial({ color:cabCol }));
  cab.position.set(-2.2,0.95,0); group.add(cab);

  const wheelGeo=new THREE.CylinderGeometry(0.34,0.34,0.46,14);
  const wheelMat=new THREE.MeshBasicMaterial({ color:0x111111 });
  const wheels=[];
  function addWheel(x,z){ const w=new THREE.Mesh(wheelGeo,wheelMat); w.rotation.z=Math.PI/2; w.position.set(x,0.55,z); group.add(w); wheels.push(w); }
  addWheel(-2.8, 0.85); addWheel(-2.8,-0.85);
  addWheel(-1.0, 0.85); addWheel(-1.0,-0.85);
  addWheel( 0.8, 0.85); addWheel( 0.8,-0.85);

  const addEdges=(mesh)=>{ const e=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color:0x000000 })); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); group.add(e); };
  addEdges(body); addEdges(cab);

  // Always-on-top marker
  const markerCanvas=document.createElement("canvas"); markerCanvas.width=64; markerCanvas.height=64;
  const mctx=markerCanvas.getContext("2d");
  mctx.fillStyle= delayed? "#ff3b30":"#00c853"; mctx.beginPath(); mctx.arc(32,32,12,0,Math.PI*2); mctx.fill();
  mctx.lineWidth=3; mctx.strokeStyle="#111"; mctx.stroke();
  const markerTex=new THREE.CanvasTexture(markerCanvas);
  const marker=new THREE.Sprite(new THREE.SpriteMaterial({ map:markerTex, transparent:true, depthTest:false }));
  marker.scale.set(2.2,2.2,1); marker.position.set(0,2.6,0); marker.renderOrder=1000;
  group.add(marker);

  group.userData.wheels=wheels; group.userData.wheelRadius=0.34;
  group.scale.set(1.05,1.05,1.05);
  return group;
}

// Movement state
let movingTrucks=[];
const tmpDir=new THREE.Vector3();
const MIN_GAP=2.4; // spacing on same segment

function spawnMovingTruck(truck, rerouteMap){
  const delayed=(truck.status && String(truck.status).toLowerCase()==='delayed') || (truck.delay_hours||0)>0;
  let pathIDs= rerouteMap.get(truck.id) || defaultPathIDs(truck.origin, truck.destination);
  if(pathIDs[0]!==truck.origin) pathIDs.unshift(truck.origin);
  if(pathIDs[pathIDs.length-1]!==truck.destination) pathIDs.push(truck.destination);

  const pts=idsToPoints(pathIDs);
  if(pts.length<2) return;

  const mesh=createTruckMesh(delayed);
  mesh.position.copy(pts[0]);
  trucksGroup.add(mesh);

  // --- NEW: staggered departure (prevents everyone blocking at the node) ---
  const jitter = 300 + Math.random()*900; // 0.3–1.2s
  movingTrucks.push({
    id:truck.id, mesh, wheels:mesh.userData.wheels||[],
    path:pts, segIdx:0, segT:0, direction:1,
    speed: delayed?2.4:3.6, wheelRadius:mesh.userData.wheelRadius||0.34,
    lastPos:pts[0].clone(),
    startAt: performance.now() + jitter // wait a bit before starting
  });
}

function segmentProgress(t){ const a=t.path[t.segIdx], b=t.path[t.segIdx+t.direction]; if(!a||!b) return 0; return t.segT * a.distanceTo(b); }

// Scenario loader
async function loadScenario(file, labelFromCaller){
  try{
    clearLog(); log(`Loading scenario: ${file}`);
    while(trucksGroup.children.length) trucksGroup.remove(trucksGroup.children[0]); movingTrucks=[];

    const res=await fetch(file); const data=await res.json();

    const rerouteMap=new Map();
    if(Array.isArray(data.reroutes)) for(const r of data.reroutes){ if(Array.isArray(r.path)&&r.truckId) rerouteMap.set(r.truckId, r.path.slice()); }

    let total=0, delayedCount=0;
    (data.trucks||[]).forEach(tr=>{ const delayed=(tr.status&&String(tr.status).toLowerCase()==='delayed')||(tr.delay_hours||0)>0; spawnMovingTruck(tr, rerouteMap); total++; if(delayed) delayedCount++; });

    log(`Warehouses rendered: 3`);
    log(`Trucks rendered: ${total} (delayed=${delayedCount})`);
    const isAfter=/after/i.test(file); writeStaticSummary(data, labelFromCaller || (isAfter?"After correction":"Normal operations"));
    await replayTimeline(data);

    if(Array.isArray(data.reroutes) && data.reroutes.length){
      log(`Reroutes applied: ${data.reroutes.length}`);
      for(const r of data.reroutes){ const reason=r.reason?` (${r.reason})`:''; const path=Array.isArray(r.path)?` via ${r.path.join(' → ')}`:''; log(`Truck ${r.truckId} rerouted${reason}${path}`); }
      log("Network stabilized after corrections.");
    }
  }catch(err){ console.error("Failed to load scenario:",err); log("Error: Failed to load scenario JSON. Check console."); }
}
window.loadScenario = loadScenario;

// Animation
const clock=new THREE.Clock();
function updateMovingTrucks(dt){
  const now=performance.now();

  for(const t of movingTrucks){
    // NEW: staggered start — wait until startAt
    if (now < t.startAt) continue;

    const pts=t.path; if(!pts||pts.length<2) continue;

    let a=pts[t.segIdx], b=pts[t.segIdx + t.direction];
    if(!b){ t.direction*=-1; b=pts[t.segIdx + t.direction]; if(!b) continue; }

    const segLen=Math.max(0.0001, a.distanceTo(b));
    let dT=(t.speed*dt)/segLen;

    // Convoy spacing (same segment & direction)
    const candidates=movingTrucks.filter(o=>{
      if(o===t) return false;
      if (now < o.startAt) return false; // ignore not-yet-started
      const oa=o.path[o.segIdx], ob=o.path[o.segIdx + o.direction];
      if(!oa||!ob) return false;
      return (oa.distanceTo(a)<0.01 && ob.distanceTo(b)<0.01 && o.direction===t.direction);
    });
    if(candidates.length){
      const myProg=segmentProgress(t); let minGap=Infinity;
      for(const o of candidates){ const oProg=segmentProgress(o); if(oProg>myProg) minGap=Math.min(minGap, oProg-myProg); }
      if (isFinite(minGap) && minGap < MIN_GAP) dT *= Math.max(0.25, (minGap/MIN_GAP)*0.7);
    }

    t.segT += dT;
    if(t.segT >= 1){
      t.segIdx += t.direction; t.segT -= 1;
      if(t.segIdx <= 0){ t.segIdx=0; t.direction=1; }
      else if(t.segIdx >= pts.length-1){ t.segIdx=pts.length-1; t.direction=-1; }
      a=pts[t.segIdx]; b=pts[t.segIdx + t.direction] || a;
    }

    const newPos=new THREE.Vector3().lerpVectors(a,b,t.segT);
    t.mesh.position.copy(newPos);

    // Face direction
    const dir=new THREE.Vector3().subVectors(b,a).normalize();
    const target=new THREE.Vector3().addVectors(newPos, dir);
    t.mesh.lookAt(target);

    // Wheel spin
    const deltaDist=newPos.distanceTo(t.lastPos);
    if(t.wheels?.length && t.wheelRadius>0){
      const ang=deltaDist / t.wheelRadius;
      for(const w of t.wheels) w.rotation.x -= ang;
    }
    t.lastPos.copy(newPos);
  }
}

function animate(){ requestAnimationFrame(animate); const dt=clock.getDelta(); updateMovingTrucks(dt); renderer.render(scene, orthoCam); }
animate();

window.addEventListener('resize', ()=>{ renderer.setSize(window.innerWidth, window.innerHeight); setupCamera(); });
