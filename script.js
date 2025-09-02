// ===========================
// 3D AI Agentic Twin — Script
// Start-to-finish narrated commentary + trucks moving on roads
// ===========================

// ============ Scene setup ============
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);
camera.position.z = 30;

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

// ============ Warehouse positions ============
const WH_POS = {
  WH1: new THREE.Vector3(-10, 0, 0),
  WH2: new THREE.Vector3(0,   0, 0),
  WH3: new THREE.Vector3(10,  0, 0)
};

// ============ Warehouses (persistent) ============
const textureLoader = new THREE.TextureLoader();
const warehouseTexture = textureLoader.load("warehouse_texture.png", () => {
  buildWarehouses();
  buildRoads();
  log("Warehouses and roads initialized");
  // Kick off initial scenario
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

// ============ Roads (visual lines) ============
function buildRoads() {
  createRoad(WH_POS.WH1, WH_POS.WH2);
  createRoad(WH_POS.WH2, WH_POS.WH3);
}
function createRoad(a, b) {
  const material = new THREE.LineBasicMaterial({ color: 0x555555 });
  const points = [
    a.clone().add(new THREE.Vector3(0, -0.9, 0)),
    b.clone().add(new THREE.Vector3(0, -0.9, 0))
  ];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.Line(geom, material));
}

// =====================================================
// Truck movement on actual roads (NEW)
// - Uses road graph: WH1<->WH2, WH2<->WH3
// - WH1<->WH3 routes via WH2 unless explicit path is provided
// =====================================================
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

// State per moving truck
let movingTrucks = []; // [{mesh, path: [Vector3,...], segIdx, segT, speedUnitsPerSec}]

const matGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const matRed   = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// simple road graph (undirected)
const ADJ = {
  WH1: ["WH2"],
  WH2: ["WH1","WH3"],
  WH3: ["WH2"]
};

// build a path as node ids (e.g., ["WH1","WH2","WH3"])
function defaultPathIDs(origin, destination) {
  if (origin === destination) return [origin];
  // if directly adjacent
  if (ADJ[origin] && ADJ[origin].includes(destination)) {
    return [origin, destination];
  }
  // otherwise go via WH2 (single hub) if both sides connect
  if (origin !== "WH2" && destination !== "WH2") {
    return [origin, "WH2", destination];
  }
  // fallback: try direct anyway
  return [origin, destination];
}

function idsToPoints(ids) {
  const pts = [];
  for (let i = 0; i < ids.length; i++) {
    const pos = WH_POS[ids[i]];
    if (!pos) continue;
    // road is slightly lower for the line; we keep trucks on ground y=0
    pts.push(new THREE.Vector3(pos.x, 0, pos.z));
  }
  return pts;
}

function createTruckMesh(delayed) {
  const geom = new THREE.SphereGeometry(0.5, 16, 16);
  const mesh = new THREE.Mesh(geom, delayed ? matRed : matGreen);
  return mesh;
}

// Build movement state for one truck
function spawnMovingTruck(truck, rerouteMap) {
  const delayed = (truck.status && String(truck.status).toLowerCase() === 'delayed') ||
                  (truck.delay_hours || 0) > 0;

  // If there's an explicit reroute path for this truck, use it (e.g., ["WH3","WH1","WH2"])
  let pathIDs = null;
  if (rerouteMap.has(truck.id)) {
    pathIDs = rerouteMap.get(truck.id);
  } else {
    pathIDs = defaultPathIDs(truck.origin, truck.destination);
  }
  const pathPts = idsToPoints(pathIDs);
  if (pathPts.length < 1) return; // nothing to do

  const mesh = createTruckMesh(delayed);
  mesh.position.copy(pathPts[0]);
  trucksGroup.add(mesh);

  // base speed; delayed trucks slower
  const SPEED = delayed ? 2.0 : 3.0; // world units per second

  movingTrucks.push({
    id: truck.id,
    mesh,
    path: pathPts, // waypoints
    segIdx: 0,     // current segment start index
    segT: 0,       // 0..1 along current segment
    speed: SPEED
  });
}

function lengthOfSeg(a, b) { return a.distanceTo(b); }

// ============ Scenario loader (sequenced narration + movement) ============
async function loadScenario(file, labelFromCaller) {
  try {
    clearLog();
    log(`Loading scenario: ${file}`);

    const res = await fetch(file);
    const data = await res.json();

    // clear ONLY trucks (keep warehouses/roads/lights)
    while (trucksGroup.children.length) trucksGroup.remove(trucksGroup.children[0]);
    movingTrucks = [];

    // Build a quick map of explicit reroutes from JSON (by truckId)
    const rerouteMap = new Map();
    if (Array.isArray(data.reroutes)) {
      for (const r of data.reroutes) {
        if (Array.isArray(r.path) && r.path.length >= 1 && r.truckId) {
          rerouteMap.set(r.truckId, r.path);
        }
      }
    }

    // Spawn moving trucks with paths
    let total = 0, delayedCount = 0;
    (data.trucks || []).forEach(tr => {
      const delayed = (tr.status && String(tr.status).toLowerCase() === 'delayed') ||
                      (tr.delay_hours || 0) > 0;
      spawnMovingTruck(tr, rerouteMap);
      total++;
      if (delayed) delayedCount++;
    });

    // Core narration in order
    log(`Warehouses rendered: 3`);
    log(`Trucks rendered: ${total} (delayed=${delayedCount})`);

    const isAfter = /after/i.test(file);
    const label = labelFromCaller || (isAfter ? 'After correction' : 'Normal operations');
    writeStaticSummary(data, label);

    // Timeline (plays with its own delays, still enqueued in FIFO)
    await replayTimeline(data);

    // Reroutes narration, if any
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

function updateMovingTrucks(dt) {
  for (const t of movingTrucks) {
    const pts = t.path;
    if (!pts || pts.length < 2) continue;

    // current segment endpoints
    const a = pts[t.segIdx];
    const b = pts[t.segIdx + 1];
    const segLen = Math.max(0.0001, lengthOfSeg(a, b));

    // advance along the segment based on speed and dt
    const distThisFrame = t.speed * dt;
    const dT = distThisFrame / segLen;
    t.segT += dT;

    if (t.segT >= 1) {
      // move to next segment
      t.segIdx++;
      if (t.segIdx >= pts.length - 1) {
        // reached destination: pin to last point
        t.mesh.position.copy(pts[pts.length - 1]);
        continue; // stop advancing
      } else {
        // carry over leftover portion if overshoot (optional; here we reset)
        t.segT = t.segT - 1;
      }
    }

    // interpolate along current segment
    const pos = new THREE.Vector3().lerpVectors(a, b, t.segT);
    t.mesh.position.copy(pos);
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
