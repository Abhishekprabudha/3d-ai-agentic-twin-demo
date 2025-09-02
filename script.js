// ===========================
// 3D AI Agentic Twin — Script
// Triangle layout + labeled warehouses + roads + oriented truck movement
// Continuous narrated commentary (text + human-like TTS w/ FIFO queue)
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

// Simple text sprite label
function makeTextSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 28;
  const pad = 16;
  ctx.font = `bold ${fontSize}px system-ui, Segoe UI, Roboto, sans-serif`;
  const w = ctx.measureText(text).width + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `bold ${fontSize}px system-ui, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "rgba(10,10,11,0.8)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = "#e6e6e6";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const spr = new THREE.Sprite(mat);
  const scale = 0.08; // tune size
  spr.scale.set(w * scale, h * scale, 1);
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
  const offsetY = 3.8;
  const labels = [
    ["WH1 — Delhi", WH_POS.WH1],
    ["WH2 — Mumbai", WH_POS.WH2],
    ["WH3 — Bangalore", WH_POS.WH3]
  ];
  for (const [text, pos] of labels) {
    const spr = makeTextSprite(text);
    spr.position.set(pos.x, pos.y + offsetY, pos.z);
    LABELS.add(spr);
  }
}
function buildRoads() {
  // draw triangle edges: WH1–WH2, WH2–WH3, WH3–WH1
  createRoad(WH_POS.WH1, WH_POS.WH2);
  createRoad(WH_POS.WH2, WH_POS.WH3);
  createRoad(WH_POS.WH3, WH_POS.WH1);
}
function createRoad(a, b) {
  const material = new THREE.LineBasicMaterial({ color: 0x606060, linewidth: 2 });
  const points = [ a.clone().add(new THREE.Vector3(0, -0.5, 0)),
                   b.clone().add(new THREE.Vector3(0, -0.5, 0)) ];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geom, material);
  scene.add(line);
}

// =====================================================
// Truck movement (on roads) + orientation (direction change visible)
// - Road graph: full triangle edges
// - If WH1<->WH3 and you want via WH2, provide explicit reroute path
// =====================================================
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

// State per moving truck
let movingTrucks = []; // [{id, mesh, path:[Vector3], segIdx, segT, speed}]

const matGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const matRed   = new THREE.MeshBasicMaterial({ color: 0xff4444 });

// Undirected adjacency for triangle (all edges)
const ADJ = {
  WH1: ["WH2","WH3"],
  WH2: ["WH1","WH3"],
  WH3: ["WH1","WH2"]
};

function defaultPathIDs(origin, destination) {
  if (origin === destination) return [origin];
  // direct edge exists → straight route
  if (ADJ[origin] && ADJ[origin].includes(destination)) {
    return [origin, destination];
  }
  // fallback: go via WH2 if possible
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

function createTruckMesh(delayed) {
  // Cone as a tiny arrow pointing +Z by default; we’ll rotate per-segment
  const cone = new THREE.ConeGeometry(0.6, 1.6, 16);
  const mat  = delayed ? matRed : matGreen;
  const mesh = new THREE.Mesh(cone, mat);
  // rotate so the cone points forward along +Z
  mesh.rotation.x = Math.PI; // flip cone to point forward (depends on geometry orientation)
  return mesh;
}

function spawnMovingTruck(truck, rerouteMap) {
  const delayed = (truck.status && String(truck.status).toLowerCase() === 'delayed') ||
                  (truck.delay_hours || 0) > 0;

  // Determine path IDs
  let pathIDs = null;
  if (rerouteMap.has(truck.id)) {
    pathIDs = rerouteMap.get(truck.id);
  } else {
    pathIDs = defaultPathIDs(truck.origin, truck.destination);
  }
  // Ensure path begins at the origin warehouse
  if (pathIDs[0] !== truck.origin) {
    pathIDs.unshift(truck.origin);
  }
  // Ensure path ends at destination warehouse
  const last = pathIDs[pathIDs.length - 1];
  if (last !== truck.destination) {
    pathIDs.push(truck.destination);
  }

  const pathPts = idsToPoints(pathIDs);
  if (pathPts.length < 1) return;

  const mesh = createTruckMesh(delayed);
  mesh.position.copy(pathPts[0]);
  trucksGroup.add(mesh);

  const SPEED = delayed ? 2.0 : 3.0; // units/sec

  movingTrucks.push({
    id: truck.id,
    mesh,
    path: pathPts,
    segIdx: 0,
    segT: 0,
    speed: SPEED
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

    // Build explicit reroute map: truckId -> ["WH1","WH3","WH2"] etc.
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

    // Face the movement direction (visible direction change on turns)
    tmpDir.subVectors(b, a).normalize();
    const target = new THREE.Vector3().addVectors(pos, tmpDir);
    t.mesh.lookAt(target);
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
