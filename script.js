// ===========================
// 3D AI Agentic Twin — Script
// Triangle layout + labeled warehouses + roads + oriented truck movement
// Continuous narrated commentary (text + human-like TTS w/ FIFO queue)
// Real truck models with wheel spin
// ===========================

// ============ Scene setup ============
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);
camera.position.set(0, 20, 35);
camera.lookAt(0, 0, 0);

// Ground/grid
const grid = new THREE.GridHelper(80, 20, 0x303030, 0x1a1a1a);
grid.position.y = -0.01;
scene.add(grid);

// ============ Commentary engine ============
const logEl = document.getElementById("commentaryLog");
let t0 = performance.now();

function nowSec() { return ((performance.now() - t0) / 1000).toFixed(1); }
function clearLog() {
  if (logEl) logEl.textContent = "";
  t0 = performance.now();
  // On scenario change, stop any ongoing speech and flush the queue
  ttsFlushQueue(true);
}
function log(msg, speak = true) {
  const line = `[t=${nowSec()}s] ${msg}`;
  if (logEl) logEl.textContent += line + "\n";
  console.log(line);
  if (speak) ttsEnqueue(msg);
}

// Optional helpers to use JSON-provided narration
function writeStaticSummary(data, label) {
  if (data?.commentary?.static) {
    log(`${label}: ${data.commentary.static}`);
  } else {
    const wh = (data?.warehouses || []).length || 3;
    const tr = (data?.trucks || []).length || 0;
    log(`${label}: ${wh} warehouses, ${tr} trucks.`);
  }
}
async function replayTimeline(data) {
  if (!data?.commentary?.timeline) return;
  for (const step of data.commentary.timeline) {
    const delayMs = Math.max(0, step.delay_ms || 0);
    await new Promise((r) => setTimeout(r, delayMs));
    if (typeof step.msg === "string") log(step.msg, true);
  }
}

// ============ Human-like TTS with FIFO queue ============
const synth = window.speechSynthesis;
const ttsSupported = typeof synth !== "undefined";
let VOICE = null;
let ttsQueue = [];        // array of strings (speech chunks)
let ttsPlaying = false;   // worker state

const VOICE_PREFERENCES = [
  /en-IN/i, /English.+India/i, /Natural/i, /Neural/i,
  /Microsoft.+Online/i, /Microsoft.+(Aria|Jenny|Guy|Davis|Ana)/i,
  /Google.+(en-US|en-GB)/i, /en-GB/i, /en-US/i
];

function pickBestVoice() {
  if (!ttsSupported) return null;
  const voices = synth.getVoices();
  if (!voices || !voices.length) return null;
  for (const pref of VOICE_PREFERENCES) {
    const v = voices.find((vv) => pref.test(vv.name) || pref.test(vv.lang));
    if (v) return v;
  }
  return voices[0];
}
if (ttsSupported) {
  VOICE = pickBestVoice();
  if (!VOICE) synth.onvoiceschanged = () => { VOICE = pickBestVoice(); };
}
function normalizeForSpeech(text) {
  return String(text)
    .replace(/\bETA\b/gi, "E T A")
    .replace(/\bAI\b/gi, "A I")
    .replace(/WH(\d+)/g, "Warehouse $1")
    .replace(/(\d+)%/g, "$1 percent")
    .replace(/(\d+)h/gi, "$1 hours")
    .replace(/->|→/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
}
function chunkForSpeech(text) {
  return normalizeForSpeech(text)
    .split(/(?<=[.!?;])\s+|(?<=,)\s+/)
    .filter(Boolean);
}
function humanizeRate(base = 1.0) {
  return Math.max(0.85, Math.min(1.15, base + (Math.random() - 0.5) * 0.08));
}
function humanizePitch(base = 1.0) {
  return Math.max(0.9, Math.min(1.2, base + (Math.random() - 0.5) * 0.06));
}
function ttsEnqueue(text) {
  if (!ttsSupported) return;
  const parts = chunkForSpeech(text);
  for (const p of parts) ttsQueue.push(p);
  if (!ttsPlaying) ttsPlayNext();
}
function ttsPlayNext() {
  if (!ttsSupported) return;
  if (!ttsQueue.length) { ttsPlaying = false; return; }
  ttsPlaying = true;
  const part = ttsQueue.shift();
  const u = new SpeechSynthesisUtterance(part);
  if (VOICE) u.voice = VOICE;
  u.rate = humanizeRate(0.98);
  u.pitch = humanizePitch(1.02);
  u.volume = 1.0;
  u.onend = () => { ttsPlayNext(); };
  synth.speak(u);
}
function ttsFlushQueue(cancelSpeech = false) {
  ttsQueue = [];
  ttsPlaying = false;
  if (cancelSpeech && ttsSupported) synth.cancel();
}

// ============ Warehouse positions (TRIANGLE LAYOUT) ============
// Equilateral-ish triangle for clear roads & turns
const WH_POS = {
  WH1: new THREE.Vector3(-14, 0, -8),  // left
  WH2: new THREE.Vector3( 14, 0, -8),  // right
  WH3: new THREE.Vector3(  0, 0,  12)  // top
};

// ============ Warehouses, Labels, Roads ============
const textureLoader = new THREE.TextureLoader();
const LABELS = new THREE.Group();
scene.add(LABELS);

// Text sprite label (kept off roads, always on top)
function makeTextSprite(text, opacity = 0.85) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 28;
  const pad = 18;
  ctx.font = `bold ${fontSize}px system-ui, Segoe UI, Roboto, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width + pad * 2);
  const h = Math.ceil(fontSize + pad * 2);
  canvas.width = w;
  canvas.height = h;

  ctx.font = `bold ${fontSize}px system-ui, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = `rgba(10,10,11,${opacity})`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = "#e6e6e6";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false
  });
  const spr = new THREE.Sprite(mat);
  const scale = 0.08;
  spr.scale.set(w * scale, h * scale, 1);
  spr.renderOrder = 999;
  return spr;
}

const warehouseTexture = textureLoader.load("warehouse_texture.png", () => {
  buildWarehouses();
  buildRoads();
  buildLabels();
  log("Warehouses, roads, and labels initialized.");
  loadScenario("scenario_before.json", "Normal operations");
});

function createWarehouseMesh(pos) {
  const geom = new THREE.BoxGeometry(6, 3, 6);
  const mat  = new THREE.MeshBasicMaterial({ map: warehouseTexture, transparent: true });
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(pos);
  return m;
}
function buildWarehouses() {
  Object.values(WH_POS).forEach(v => scene.add(createWarehouseMesh(v)));
}
function buildLabels() {
  LABELS.clear();
  const offsetY = 4.2;

  // triangle centroid
  const centroid = new THREE.Vector3(
    (WH_POS.WH1.x + WH_POS.WH2.x + WH_POS.WH3.x) / 3,
    0,
    (WH_POS.WH1.z + WH_POS.WH2.z + WH_POS.WH3.z) / 3
  );

  function placeLabel(text, basePos, pushOut = 4.5) {
    const dir = new THREE.Vector3().subVectors(basePos, centroid).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize().multiplyScalar(pushOut);
    const pos = new THREE.Vector3().copy(basePos).add(dir);
    const spr = makeTextSprite(text, 0.82);
    spr.position.set(pos.x, basePos.y + offsetY, pos.z);
    return spr;
  }

  LABELS.add(placeLabel("WH1 — Delhi",     WH_POS.WH1));
  LABELS.add(placeLabel("WH2 — Mumbai",    WH_POS.WH2));
  LABELS.add(placeLabel("WH3 — Bangalore", WH_POS.WH3, 5.5)); // push WH3 a touch more
}

function buildRoads() {
  // triangle edges: WH1–WH2, WH2–WH3, WH3–WH1
  createRoad(WH_POS.WH1, WH_POS.WH2);
  createRoad(WH_POS.WH2, WH_POS.WH3);
  createRoad(WH_POS.WH3, WH_POS.WH1);
}
function createRoad(a, b) {
  const material = new THREE.LineBasicMaterial({ color: 0x606060 });
  const points = [
    a.clone().add(new THREE.Vector3(0, -0.5, 0)),
    b.clone().add(new THREE.Vector3(0, -0.5, 0))
  ];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geom, material);
  scene.add(line);
}

// =====================================================
// Truck movement (on roads) + orientation + wheel spin
// - Full triangle graph (all edges available)
// - Explicit reroutes honored via JSON path
// =====================================================
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

// State per moving truck
let movingTrucks = []; // [{id, mesh, wheels[], path:[Vector3], segIdx, segT, speed, wheelRadius, lastPos}]

const matGreen = new THREE.MeshLambertMaterial({ color: 0x00b050 });
const matRed   = new THREE.MeshLambertMaterial({ color: 0xff4444 });

// Undirected adjacency for triangle (all edges)
const ADJ = {
  WH1: ["WH2","WH3"],
  WH2: ["WH1","WH3"],
  WH3: ["WH1","WH2"]
};

function defaultPathIDs(origin, destination) {
  if (origin === destination) return [origin];
  if (ADJ[origin] && ADJ[origin].includes(destination)) {
    return [origin, destination];
  }
  // fallback via WH2 if needed
  if (origin !== "WH2" && destination !== "WH2") {
    return [origin, "WH2", destination];
  }
  return [origin, destination];
}

function idsToPoints(ids) {
  const pts = [];
  for (let i = 0; i < ids.length; i++) {
    const pos = WH_POS[ids[i]];
    if (!pos) continue;
    pts.push(new THREE.Vector3(pos.x, 0, pos.z));
  }
  return pts;
}

// Real truck model (cab + cargo + 6 wheels)
function createTruckMesh(delayed) {
  const group = new THREE.Group();

  const bodyColor = delayed ? 0xff4444 : 0x00b050;
  const cabColor  = delayed ? 0xcc3333 : 0x008a3a;
  const wheelColor = 0x222222;

  const bodyGeo = new THREE.BoxGeometry(2.6, 1.4, 1.4);
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.9, 0);
  group.add(body);

  const cabGeo = new THREE.BoxGeometry(1.0, 1.1, 1.2);
  const cabMat = new THREE.MeshLambertMaterial({ color: cabColor });
  const cab = new THREE.Mesh(cabGeo, cabMat);
  cab.position.set(-1.8, 0.85, 0);
  group.add(cab);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.4, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: wheelColor, metalness: 0.2, roughness: 0.6 });
  const wheels = [];
  function addWheel(x, z) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; // spin around X axis as truck moves forward
    w.position.set(x, 0.4, z);
    group.add(w);
    wheels.push(w);
  }
  // front axle
  addWheel(-2.2,  0.7);
  addWheel(-2.2, -0.7);
  // middle axle
  addWheel(-0.6,  0.7);
  addWheel(-0.6, -0.7);
  // rear axle
  addWheel( 1.0,  0.7);
  addWheel( 1.0, -0.7);

  group.userData.wheels = wheels;
  group.userData.wheelRadius = 0.28;

  return group;
}

function spawnMovingTruck(truck, rerouteMap) {
  const delayed = (truck.status && String(truck.status).toLowerCase() === 'delayed') ||
                  (truck.delay_hours || 0) > 0;

  let pathIDs = null;
  if (rerouteMap.has(truck.id)) {
    pathIDs = rerouteMap.get(truck.id);
  } else {
    pathIDs = defaultPathIDs(truck.origin, truck.destination);
  }

  // ensure path starts/ends correctly
  if (pathIDs[0] !== truck.origin) pathIDs.unshift(truck.origin);
  const last = pathIDs[pathIDs.length - 1];
  if (last !== truck.destination) pathIDs.push(truck.destination);

  const pathPts = idsToPoints(pathIDs);
  if (pathPts.length < 1) return;

  const mesh = createTruckMesh(delayed);
  mesh.position.copy(pathPts[0]);
  trucksGroup.add(mesh);

  const SPEED = delayed ? 2.0 : 3.2; // units/sec; delayed slightly slower

  movingTrucks.push({
    id: truck.id,
    mesh,
    wheels: mesh.userData.wheels || [],
    path: pathPts,
    segIdx: 0,
    segT: 0,
    speed: SPEED,
    wheelRadius: mesh.userData.wheelRadius || 0.28,
    lastPos: pathPts[0].clone()
  });
}

function lengthOfSeg(a, b) { return a.distanceTo(b); }

// ============ Scenario loader ============
async function loadScenario(file, labelFromCaller) {
  try {
    clearLog();
    log(`Loading scenario: ${file}`);

    const res = await fetch(file);
    const data = await res.json();

    // Clear trucks
    while (trucksGroup.children.length) trucksGroup.remove(trucksGroup.children[0]);
    movingTrucks = [];

    // Explicit reroutes: truckId -> ["WH1","WH3","WH2"]
    const rerouteMap = new Map();
    if (Array.isArray(data.reroutes)) {
      for (const r of data.reroutes) {
        if (Array.isArray(r.path) && r.truckId) {
          rerouteMap.set(r.truckId, r.path.slice());
        }
      }
    }

    // Spawn movers
    let total = 0, delayedCount = 0;
    (data.trucks || []).forEach(tr => {
      const delayed = (tr.status && String(tr.status).toLowerCase() === 'delayed') ||
                      (tr.delay_hours || 0) > 0;
      spawnMovingTruck(tr, rerouteMap);
      total++; if (delayed) delayedCount++;
    });

    // Narration
    log(`Warehouses rendered: 3`);
    log(`Trucks rendered: ${total} (delayed=${delayedCount})`);
    const isAfter = /after/i.test(file);
    const label = labelFromCaller || (isAfter ? 'After correction' : 'Normal operations');
    writeStaticSummary(data, label);
    await replayTimeline(data);

    if (Array.isArray(data.reroutes) && data.reroutes.length) {
      log(`Reroutes applied: ${data.reroutes.length}`);
      for (const r of data.reroutes) {
        const reason = r.reason ? ` (${r.reason})` : '';
        const path = Array.isArray(r.path) ? ` via ${r.path.join(' → ')}` : '';
        log(`Truck ${r.truckId} rerouted${reason}${path}`);
      }
      log('Network stabilized after corrections.');
    }

  } catch (err) {
    console.error('Failed to load scenario:', err);
    log('Error: Failed to load scenario JSON. Check console for details.');
  }
}
window.loadScenario = loadScenario;

// ============ Animate/render loop ============
const clock = new THREE.Clock();
const tmpDir = new THREE.Vector3();

function updateMovingTrucks(dt) {
  for (const t of movingTrucks) {
    const pts = t.path;
    if (!pts || pts.length < 2) continue;

    let a = pts[t.segIdx];
    let b = pts[t.segIdx + 1];

    const segLen = Math.max(0.0001, a.distanceTo(b));
    const distThisFrame = t.speed * dt;
    let dT = distThisFrame / segLen;
    t.segT += dT;

    if (t.segT >= 1) {
      t.segIdx++;
      if (t.segIdx >= pts.length - 1) {
        // Arrived at final waypoint
        t.mesh.position.copy(pts[pts.length - 1]);
        continue;
      } else {
        t.segT = t.segT - 1; // carry over extra progress
        a = pts[t.segIdx];
        b = pts[t.segIdx + 1];
      }
    }

    const pos = new THREE.Vector3().lerpVectors(a, b, t.segT);
    t.mesh.position.copy(pos);

    // Face movement direction (shows turning at junctions)
    tmpDir.subVectors(b, a).normalize();
    const target = new THREE.Vector3().addVectors(pos, tmpDir);
    t.mesh.lookAt(target);

    // Wheel spin based on distance travelled this frame
    const deltaDist = pos.distanceTo(t.lastPos);
    if (t.wheels && t.wheels.length && t.wheelRadius > 0) {
      const angle = deltaDist / t.wheelRadius; // radians
      for (const w of t.wheels) {
        // wheels rotate around their axle (X axis after z-rotation applied)
        w.rotation.x -= angle; // negative to match forward motion
      }
    }
    t.lastPos.copy(pos);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  updateMovingTrucks(dt);
  renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
