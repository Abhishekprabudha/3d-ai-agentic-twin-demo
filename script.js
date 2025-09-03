// ==========================================================
// Agentic Twin — Roads + Real Truck + Robust JSON Loader
// * Realistic highway look (tube road + dashed center line)
// * Hand-curated NH48 / NH44 polylines between WH1, WH2, WH3
// * Truck sprite (top-down image), yaw faces travel vector
// * Warehouse texture restored
// * Continuous ping-pong, convoy spacing, ~20% faster
// * Commentary + Humanoid TTS
// * Resilient loadScenario(): cache-bust + detailed errors
// ==========================================================

const TRUCK_IMAGE_PATH = "truck_top.png";          // top-down transparent PNG/SVG
const MAP_IMAGE_PATH   = "india_map.png?v=10";     // bump query if GH Pages caches
const WH_TEXTURE_PATH  = "warehouse_texture.png";  // your warehouse texture

// ---------- Scene & renderer ----------
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------- Camera (top-down orthographic) ----------
let orthoCam;
let MAP_W = 140, MAP_H = 140;
function setupCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = MAP_H / 2, halfW = halfH * aspect;
  if (!orthoCam) {
    orthoCam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 3000);
    orthoCam.position.set(0, 400, 0);
    orthoCam.up.set(0, 0, -1); // map-like orientation
    orthoCam.lookAt(0, 0, 0);
  } else {
    orthoCam.left = -halfW; orthoCam.right = halfW; orthoCam.top = halfH; orthoCam.bottom = -halfH;
    orthoCam.updateProjectionMatrix();
  }
}
scene.add(new THREE.AmbientLight(0xffffff, 1));

// ---------- Commentary + Humanoid TTS ----------
const logEl = document.getElementById("commentaryLog");
let t0 = performance.now();
const nowSec = () => ((performance.now() - t0) / 1000).toFixed(1);
function clearLog(){ if (logEl) logEl.textContent = ""; t0 = performance.now(); ttsFlush(true); }
function log(msg, speak=true){ const line=`[t=${nowSec()}s] ${msg}`; if (logEl) logEl.textContent += line+"\n"; console.log(line); if (speak) ttsEnq(msg); }

// Simple humanoid TTS (browser SpeechSynthesis)
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

// ---------- Map/projection ----------
let mapPlane;
const BOUNDS = { latMin: 8, latMax: 37, lonMin: 68, lonMax: 97 }; // India approx
const projectLatLon = (lat, lon) => {
  const u=(lon-BOUNDS.lonMin)/(BOUNDS.lonMax-BOUNDS.lonMin);
  const v=1-(lat-BOUNDS.latMin)/(BOUNDS.latMax-BOUNDS.latMin);
  return new THREE.Vector3((u-0.5)*MAP_W, 0, (v-0.5)*MAP_H);
};

// ---------- Warehouses + labels ----------
const CITY = {
  WH1:{ name:"WH1 — Delhi",     lat:28.6139, lon:77.2090 },
  WH2:{ name:"WH2 — Mumbai",    lat:19.0760, lon:72.8777 },
  WH3:{ name:"WH3 — Bangalore", lat:12.9716, lon:77.5946 }
};
let WH_POS = {};
const warehousesGroup = new THREE.Group();
const labelsGroup = new THREE.Group();
scene.add(warehousesGroup, labelsGroup);

let whTexture=null;
new THREE.TextureLoader().load(WH_TEXTURE_PATH, tex => { whTexture = tex; });

function createWarehouse(pos){
  const geo = new THREE.CylinderGeometry(3.0,3.0,0.9,32);
  const mat = whTexture
    ? new THREE.MeshBasicMaterial({ map: whTexture, transparent: true })
    : new THREE.MeshBasicMaterial({ color: 0x3c82f6 });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos); m.position.y = 0.45;
  return m;
}
function makeLabel(text, pos, push=8, angle=0.1){
  const c=document.createElement("canvas"), ctx=c.getContext("2d");
  const fs=28,p=16; ctx.font=`bold ${fs}px system-ui, Segoe UI, Roboto, sans-serif`;
  const w=Math.ceil(ctx.measureText(text).width+p*2), h=Math.ceil(fs+p*2); c.width=w; c.height=h;
  ctx.font=`bold ${fs}px system-ui, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle="rgba(10,10,11,0.82)"; ctx.fillRect(0,0,w,h); ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.strokeRect(0,0,w,h);
  ctx.fillStyle="#e6e6e6"; ctx.textBaseline="middle"; ctx.fillText(text,p,h/2);
  const tex=new THREE.CanvasTexture(c);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false }));
  const centroid = new THREE.Vector3((WH_POS.WH1.x+WH_POS.WH2.x+WH_POS.WH3.x)/3,0,(WH_POS.WH1.z+WH_POS.WH2.z+WH_POS.WH3.z)/3);
  const dir = new THREE.Vector3().subVectors(pos,centroid).normalize();
  const ca=Math.cos(angle), sa=Math.sin(angle), x=dir.x, z=dir.z; dir.x=x*ca - z*sa; dir.z=x*sa + z*ca;
  const p3 = pos.clone().add(dir.multiplyScalar(push));
  spr.scale.set(w*0.08, h*0.08, 1); spr.position.set(p3.x, 3.8, p3.z); spr.renderOrder = 999;
  return spr;
}
function buildWarehouses(){
  warehousesGroup.clear(); labelsGroup.clear(); WH_POS={};
  for (const id of Object.keys(CITY)){
    const p = projectLatLon(CITY[id].lat, CITY[id].lon);
    WH_POS[id]=p;
    warehousesGroup.add(createWarehouse(p));
  }
  labelsGroup.add(makeLabel(CITY.WH1.name, WH_POS.WH1, 7.0,  0.08));
  labelsGroup.add(makeLabel(CITY.WH2.name, WH_POS.WH2, 7.0, -0.08));
  labelsGroup.add(makeLabel(CITY.WH3.name, WH_POS.WH3, 8.6,  0.18));
}

// ---------- Roads (asphalt tube + dashed center) ----------
const roadsGroup = new THREE.Group();
const roadCenterGroup = new THREE.Group();
scene.add(roadsGroup, roadCenterGroup);

// hand-curated highway polyline samples
const ROAD_POINTS = {
  "WH1-WH2": [ // Delhi → Mumbai (NH48 via Jaipur–Udaipur–Ahmedabad–Surat)
    [28.6139,77.2090],[26.9124,75.7873],[24.5854,73.7125],
    [23.0225,72.5714],[21.1702,72.8311],[19.0760,72.8777]
  ],
  "WH2-WH3": [ // Mumbai → Bengaluru (NH48 via Pune–Kolhapur–Belagavi–Hubballi–Tumakuru)
    [19.0760,72.8777],[18.5204,73.8567],[17.6805,74.0183],
    [16.7049,74.2433],[15.8497,74.4977],[15.3647,75.1240],
    [13.3409,77.1010],[12.9716,77.5946]
  ],
  "WH3-WH1": [ // Bengaluru → Delhi (NH44 via Hyderabad–Nagpur–Jhansi–Agra)
    [12.9716,77.5946],[17.3850,78.4867],[21.1458,79.0882],
    [25.4484,78.5685],[27.1767,78.0081],[28.6139,77.2090]
  ]
};
const keyFor=(a,b)=>`${a}-${b}`;
function getRoadLatLon(a,b){
  const k1=keyFor(a,b), k2=keyFor(b,a);
  if (ROAD_POINTS[k1]) return ROAD_POINTS[k1];
  if (ROAD_POINTS[k2]) return [...ROAD_POINTS[k2]].reverse();
  return [[CITY[a].lat, CITY[a].lon],[CITY[b].lat, CITY[b].lon]];
}
function latlonToWorldPoints(latlon, y=1.6){ return latlon.map(([lat,lon]) => { const v=projectLatLon(lat,lon); v.y = y; return v; }); }
function buildRoads(){
  roadsGroup.clear(); roadCenterGroup.clear();
  const pairs=[["WH1","WH2"],["WH2","WH3"],["WH3","WH1"]];
  for (const [a,b] of pairs){
    const pts = latlonToWorldPoints(getRoadLatLon(a,b));
    // Asphalt tube
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube  = new THREE.TubeGeometry(curve, Math.max(80, pts.length*20), 0.6, 12, false);
    const asphalt = new THREE.MeshBasicMaterial({ color: 0x2b2f36, opacity: 0.92, transparent: true });
    const mesh = new THREE.Mesh(tube, asphalt);
    mesh.renderOrder = 1;
    roadsGroup.add(mesh);
    // Center dashed line (thin)
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const dashed = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2.0, gapSize: 1.5, opacity: 0.85, transparent: true });
    const line = new THREE.Line(lineGeom, dashed);
    line.computeLineDistances();
    line.renderOrder = 2;
    roadCenterGroup.add(line);
  }
}

// ---------- Trucks (sprite plane that faces travel direction) ----------
let TRUCK_TEXTURE = null;
new THREE.TextureLoader().load(TRUCK_IMAGE_PATH, tex => {
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  TRUCK_TEXTURE = tex;
});

function createTruck(delayed=false){
  // plane lying flat on the map; we control yaw (rotation.y)
  const w=6.5, h=3.25; // tweak to taste
  let mat;
  if (TRUCK_TEXTURE) {
    mat = new THREE.MeshBasicMaterial({ map: TRUCK_TEXTURE, transparent: true });
  } else {
    // fallback color block if image not loaded yet
    mat = new THREE.MeshBasicMaterial({ color: delayed?0xff3b30:0x00c853 });
  }
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI/2; // lay flat
  m.position.y = 2.0;

  // tiny always-on-top dot for visibility
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ color: delayed?0xff3b30:0x00c853, depthTest:false }));
  dot.scale.set(1.2,1.2,1); dot.position.set(0,2.2,0); dot.renderOrder=2000; m.add(dot);

  return m;
}

// ---------- Path / movement helpers ----------
function expandRouteIDsToLatLon(ids){
  const out=[];
  for (let i=0;i<ids.length-1;i++){
    const seg = getRoadLatLon(ids[i], ids[i+1]);
    if (i>0) seg.shift();
    out.push(...seg);
  }
  return out;
}
function worldPathFromIDs(ids){
  return latlonToWorldPoints(expandRouteIDsToLatLon(ids), 2.0);
}
const ADJ = { WH1:["WH2","WH3"], WH2:["WH1","WH3"], WH3:["WH1","WH2"] };
function defaultPathIDs(o,d){
  if (o===d) return [o];
  const k1=keyFor(o,d), k2=keyFor(d,o);
  if (ROAD_POINTS[k1] || ROAD_POINTS[k2]) return [o,d];
  if (o!=="WH2" && d!=="WH2") return [o,"WH2",d];
  return [o,d];
}

// ---------- Movement state ----------
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);
let movingTrucks = [];
const MIN_GAP = 2.6; // spacing along same segment

function spawnTruckFrom(tr, reroutes){
  const isDelayed = (tr.status && String(tr.status).toLowerCase()==="delayed") || (tr.delay_hours||0)>0;

  let ids = reroutes.get(tr.id) || defaultPathIDs(tr.origin, tr.destination);
  if (ids[0] !== tr.origin) ids.unshift(tr.origin);
  if (ids[ids.length-1] !== tr.destination) ids.push(tr.destination);

  const pts = worldPathFromIDs(ids);
  if (pts.length<2) return;

  const mesh = createTruck(isDelayed);
  mesh.position.copy(pts[0]);
  trucksGroup.add(mesh);

  // ~20% faster than our earlier baseline
  const speed = isDelayed ? 2.88 : 4.32; // world units / second
  const startAt = performance.now() + (300 + Math.random()*900); // staggered start

  movingTrucks.push({
    id: tr.id, mesh,
    path: pts, segIdx: 0, segT: 0, dir: 1,
    speed, lastPos: pts[0].clone(), startAt
  });
}
function segProg(t){ const a=t.path[t.segIdx], b=t.path[t.segIdx + t.dir]; if(!a||!b) return 0; return t.segT * a.distanceTo(b); }

function updateTrucks(dt){
  const now = performance.now();
  for (const t of movingTrucks){
    if (now < t.startAt) continue;
    const pts=t.path; if(!pts||pts.length<2) continue;

    let a=pts[t.segIdx], b=pts[t.segIdx + t.dir];
    if (!b){ t.dir*=-1; b=pts[t.segIdx + t.dir]; if(!b) continue; }

    // distance-normalized progress
    const segLen=Math.max(1e-4, a.distanceTo(b));
    let dT=(t.speed*dt)/segLen;

    // spacing on same segment
    let minGap=Infinity, myP=segProg(t);
    for (const o of movingTrucks){
      if (o===t || now < o.startAt) continue;
      const oa=o.path[o.segIdx], ob=o.path[o.segIdx + o.dir];
      if (!oa||!ob) continue;
      if (oa.distanceTo(a)<0.01 && ob.distanceTo(b)<0.01 && o.dir===t.dir) {
        const oP = segProg(o);
        if (oP>myP) minGap = Math.min(minGap, oP - myP);
      }
    }
    if (isFinite(minGap) && minGap < MIN_GAP) dT *= Math.max(0.25, (minGap/MIN_GAP)*0.7);

    t.segT += dT;
    if (t.segT>=1){
      t.segIdx += t.dir; t.segT -= 1;
      if (t.segIdx<=0){ t.segIdx=0; t.dir=1; }
      else if (t.segIdx>=pts.length-1){ t.segIdx=pts.length-1; t.dir=-1; }
      a=pts[t.segIdx]; b=pts[t.segIdx + t.dir] || a;
    }

    const pos = new THREE.Vector3().lerpVectors(a,b,t.segT);
    t.mesh.position.copy(pos);

    // Face direction of travel (yaw only)
    const dx = (b.x - a.x), dz = (b.z - a.z);
    const yaw = Math.atan2(dx, dz); // Y is up
    t.mesh.rotation.y = yaw;

    t.lastPos.copy(pos);
  }
}

// ---------- Robust scenario loader ----------
async function loadScenario(file, labelFromCaller){
  try{
    clearLog(); log(`Loading scenario: ${file}`);

    // reset trucks
    while (trucksGroup.children.length) trucksGroup.remove(trucksGroup.children[0]);
    movingTrucks = [];

    // cache-bust to avoid stale GH Pages
    const url = `${file}${file.includes('?') ? '&' : '?'}v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${file}`);

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { throw new Error(`JSON parse error: ${e.message}\nPreview: ${raw.slice(0,160)}…`); }

    // reroutes
    const rerouteMap = new Map();
    if (Array.isArray(data.reroutes)) {
      for (const r of data.reroutes) {
        if (Array.isArray(r.path) && r.truckId) rerouteMap.set(r.truckId, r.path.slice());
      }
    }

    // trucks
    let total=0, delayedCount=0;
    for (const tr of (data.trucks||[])) {
      const delayed = (tr.status && String(tr.status).toLowerCase()==='delayed') || (tr.delay_hours||0)>0;
      spawnTruckFrom(tr, rerouteMap);
      total++; if (delayed) delayedCount++;
    }

    log(`Warehouses rendered: 3`);
    log(`Trucks rendered: ${total} (delayed=${delayedCount})`);

    // static summary
    const isAfter=/after/i.test(file);
    const label = labelFromCaller || (isAfter ? "After correction" : "Normal operations");
    if (typeof data?.commentary?.static === 'string') {
      log(`${label}: ${data.commentary.static}`);
    } else {
      log(`${label}: ${(data?.warehouses||[]).length||3} warehouses, ${(data?.trucks||[]).length||0} trucks.`);
    }

    // robust timeline replay (accept array or object map)
    let tl = data?.commentary?.timeline;
    if (tl) {
      if (Array.isArray(tl)) {
        // ok
      } else if (typeof tl === 'object') {
        tl = Object.values(tl);
      } else {
        tl = null; // unsupported
      }
    }
    if (Array.isArray(tl)) {
      for (const step of tl) {
        try {
          const d = Number(step?.delay_ms) || 0;
          if (d > 0) await new Promise(r => setTimeout(r, d));
          if (typeof step?.msg === 'string') log(step.msg, true);
        } catch (e) {
          log(`Timeline step skipped: ${e.message}`, false);
        }
      }
    }

    if (Array.isArray(data.reroutes) && data.reroutes.length){
      log(`Reroutes applied: ${data.reroutes.length}`);
      for (const r of data.reroutes){
        const reason=r.reason?` (${r.reason})`:''; 
        const path=Array.isArray(r.path)?` via ${r.path.join(' → ')}`:'';
        log(`Truck ${r.truckId} rerouted${reason}${path}`);
      }
      log("Network stabilized after corrections.");
    }

  } catch (err) {
    console.error(err);
    log(`Error: ${err.message}`);
  }
}
window.loadScenario = loadScenario;

// ---------- Map bootstrap (placeholder → swap to india_map.png) ----------
setupCamera();
(function buildPlaceholder(){
  const g=new THREE.PlaneGeometry(MAP_W, MAP_H);
  const m=new THREE.MeshBasicMaterial({ color: 0x0f1115 });
  mapPlane=new THREE.Mesh(g, m); mapPlane.rotation.x = -Math.PI/2;
  scene.add(mapPlane);
})();
buildWarehouses(); buildRoads(); 
// Labels after warehouses (needs WH_POS)
function buildLabels(){ /* kept above — just call again here */ }
buildLabels();
log("Bootstrapped scene. Loading india_map.png…");
loadScenario("scenario_before.json","Normal operations");

const mapImg=new Image();
mapImg.onload=()=>{
  try{
    const tex=new THREE.Texture(mapImg); tex.needsUpdate=true;
    const aspect=mapImg.width/mapImg.height; MAP_W=140*aspect; MAP_H=140;
    const newGeo=new THREE.PlaneGeometry(MAP_W, MAP_H);
    mapPlane.geometry.dispose(); mapPlane.geometry=newGeo;
    if (mapPlane.material.map) mapPlane.material.map.dispose();
    mapPlane.material.dispose();
    mapPlane.material = new THREE.MeshBasicMaterial({ map: tex });
    setupCamera(); buildWarehouses(); buildRoads(); buildLabels();
    log(`Map loaded ${mapImg.width}×${mapImg.height}. Rebuilt network.`);
    loadScenario("scenario_before.json","Normal operations");
  }catch(e){ console.error(e); log("Map texture apply failed; keeping placeholder."); }
};
mapImg.onerror=(e)=>{ console.error("Map load failed", e); log("Could not load india_map.png — using placeholder."); };
mapImg.src = MAP_IMAGE_PATH;

// ---------- Animate ----------
const clock = new THREE.Clock();
function animate(){ requestAnimationFrame(animate); updateTrucks(clock.getDelta()); renderer.render(scene, orthoCam); }
animate();

// ---------- Resize ----------
window.addEventListener('resize', ()=>{ renderer.setSize(window.innerWidth, window.innerHeight); setupCamera(); });
