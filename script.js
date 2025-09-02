// ===========================
// 3D AI Agentic Twin — Script
// With narrated commentary (text + improved human-like TTS)
// ===========================

// ============ Scene setup ============
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);
camera.position.z = 30; // pull back to see everything

// ============ Commentary engine ============
const logEl = document.getElementById("commentaryLog");
let t0 = performance.now();

function nowSec() {
  return ((performance.now() - t0) / 1000).toFixed(1);
}
function clearLog() {
  if (logEl) logEl.textContent = "";
  t0 = performance.now();
  // stop any ongoing speech so the new scenario starts fresh
  if (ttsSupported) synth.cancel();
}
function log(msg, speak = true) {
  const line = `[t=${nowSec()}s] ${msg}`;
  if (logEl) logEl.textContent += line + "\n";
  console.log(line);
  if (speak) speakLine(msg);
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

// ============ Improved TTS (human-like) ============
const synth = window.speechSynthesis;
const ttsSupported = typeof synth !== "undefined";
let VOICE = null;

// Prefer higher-quality or locale-appropriate voices if available
const VOICE_PREFERENCES = [
  /en-IN/i, // prioritize Indian English if present
  /English.+India/i,
  /Natural/i,
  /Neural/i,
  /Microsoft.+Online/i,
  /Microsoft.+(Aria|Jenny|Guy|Davis|Ana)/i,
  /Google.+(en-US|en-GB)/i,
  /en-GB/i,
  /en-US/i
];

function pickBestVoice() {
  if (!ttsSupported) return null;
  const voices = synth.getVoices();
  if (!voices || !voices.length) return null;
  for (const pref of VOICE_PREFERENCES) {
    const v = voices.find((vv) => pref.test(vv.name) || pref.test(vv.lang));
    if (v) return v;
  }
  return voices[0]; // fallback
}

// voices may load asynchronously
if (ttsSupported) {
  VOICE = pickBestVoice();
  if (!VOICE) {
    synth.onvoiceschanged = () => {
      VOICE = pickBestVoice();
    };
  }
}

// Clean up text for nicer prosody
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

// Split into clauses so the engine can “breathe”
function chunkForSpeech(text) {
  return normalizeForSpeech(text)
    .split(/(?<=[.!?;])\s+|(?<=,)\s+/)
    .filter(Boolean);
}

// Subtle randomness for less robotic delivery
function humanizeRate(base = 1.0) {
  return Math.max(0.85, Math.min(1.15, base + (Math.random() - 0.5) * 0.08));
}
function humanizePitch(base = 1.0) {
  return Math.max(0.9, Math.min(1.2, base + (Math.random() - 0.5) * 0.06));
}

// Speak one log line (cancel backlog, then speak chunks)
function speakLine(text) {
  if (!ttsSupported) return;
  const parts = chunkForSpeech(text);
  synth.cancel(); // keep it snappy
  for (const part of parts) {
    const u = new SpeechSynthesisUtterance(part);
    if (VOICE) u.voice = VOICE;
    u.rate = humanizeRate(0.98);
    u.pitch = humanizePitch(1.02);
    u.volume = 1.0;
    synth.speak(u);
  }
}

// ============ Warehouse positions ============
const WH_POS = {
  WH1: new THREE.Vector3(-10, 0, 0),
  WH2: new THREE.Vector3(0, 0, 0),
  WH3: new THREE.Vector3(10, 0, 0)
};

// ============ Warehouses (persistent) ============
const textureLoader = new THREE.TextureLoader();
// If your file is .jpg, change the filename below accordingly.
const warehouseTexture = textureLoader.load("warehouse_texture.png", () => {
  buildWarehouses();
  buildRoads();
  log("Warehouses and roads initialized");
  // Load the initial view (this first user interaction typically enables audio)
  loadScenario("scenario_before.json", "Normal operations");
});

function createWarehouseMesh(pos) {
  const geom = new THREE.BoxGeometry(6, 3, 6); // wider/taller for visibility
  const mat = new THREE.MeshBasicMaterial({
    map: warehouseTexture,
    transparent: true
  });
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(pos);
  return m;
}

function buildWarehouses() {
  Object.values(WH_POS).forEach((v) => scene.add(createWarehouseMesh(v)));
}

// Simple straight “roads” between neighboring warehouses
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

// ============ Trucks (updated per scenario only) ============
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

const matGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const matRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });

function drawTruckAt(pos, delayed) {
  const geom = new THREE.SphereGeometry(0.5, 16, 16);
  const m = new THREE.Mesh(geom, delayed ? matRed : matGreen);
  m.position.copy(pos);
  trucksGroup.add(m);
}

// ============ Scenario loader with narration ============
async function loadScenario(file, labelFromCaller) {
  try {
    clearLog();
    log(`Loading scenario: ${file}`);

    const res = await fetch(file);
    const data = await res.json();

    // clear ONLY trucks (keep warehouses/roads/lights)
    while (trucksGroup.children.length)
      trucksGroup.remove(trucksGroup.children[0]);

    // count how many trucks start at each origin so we can offset vertically
    const perOriginCount = { WH1: 0, WH2: 0, WH3: 0 };

    let total = 0,
      delayedCount = 0;
    (data.trucks || []).forEach((tr) => {
      const originId = tr.origin;
      const originPos = WH_POS[originId];
      if (!originPos) return; // skip if origin not mapped

      const idx = perOriginCount[originId] || 0;
      perOriginCount[originId] = idx + 1;

      // base below the warehouse, stack each additional truck lower so they don't overlap
      const base = originPos.clone().add(new THREE.Vector3(0, -3, 0));
      const offset = new THREE.Vector3(0, -idx * 1.2, 0);
      const p = base.add(offset);

      const delayed =
        (tr.status && String(tr.status).toLowerCase() === "delayed") ||
        (tr.delay_hours || 0) > 0;

      drawTruckAt(p, delayed);
      total++;
      if (delayed) delayedCount++;
    });

    log(`Warehouses rendered: 3`);
    log(`Trucks rendered: ${total} (delayed=${delayedCount})`);

    // Label for narration (fallback to filename-based)
    const isAfter = /after/i.test(file);
    const label = labelFromCaller || (isAfter ? "After correction" : "Normal operations");
    writeStaticSummary(data, label);

    // Optional: dynamic timeline narration from JSON
    replayTimeline(data).catch(() => {});

    // Optional: narrate reroutes if provided in "after" JSON
    if (Array.isArray(data.reroutes) && data.reroutes.length) {
      log(`Reroutes applied: ${data.reroutes.length}`);
      for (const r of data.reroutes) {
        const reason = r.reason ? ` (${r.reason})` : "";
        const path = Array.isArray(r.path) ? ` via ${r.path.join(" → ")}` : "";
        log(`Truck ${r.truckId} rerouted${reason}${path}`);
      }
      log("Network stabilized after corrections.");
    }
  } catch (err) {
    console.error("Failed to load scenario:", err);
    log("Error: Failed to load scenario JSON. Check console for details.");
  }
}
// make available for the buttons in index.html
window.loadScenario = loadScenario;

// ============ Animate/render loop ============
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
