// ===========================
// 3D AI Agentic Twin — Script
// Top-down India map + triangular road network (Delhi–Mumbai–Bangalore)
// Real truck models + orientation + wheel spin
// Continuous ping-pong motion with curved turns (Bezier smoothing)
// Collision control: convoy spacing on same segment + junction holding
// Commentary (text) + humanoid TTS (FIFO)
// ===========================

// ============ Scene + Camera (Top-Down Ortho) ============
const scene = new THREE.Scene();

// We'll size the map dynamically after the texture loads.
// Create an orthographic camera looking straight down.
let orthoCam;
let mapPlane; // plane mesh with india_map.png
let MAP_W = 120; // default world width; will be adjusted to image aspect
let MAP_H = 140; // default world height; will be adjusted to image aspect

function setupCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = MAP_H / 2;
  const halfW = halfH * aspect; // keep whole map visible, adjust later if needed
  orthoCam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
  orthoCam.position.set(0, 200, 0); // straight above
  orthoCam.up.set(0, 0, -1);        // z goes down on the screen
  orthoCam.lookAt(0, 0, 0);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Subtle ambient
const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);

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

// Optional helpers for JSON narration
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

// ============ Humanoid TTS with FIFO ============
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

// ============ India Map (texture) ============
const textureLoader = new THREE.TextureLoader();
const LABELS = new THREE.Group();
scene.add(LABELS);

function makeTextSprite(text, opacity = 0.82) {
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
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  const scale = 0.08;
  spr.scale.set(w * scale, h * scale, 1);
  spr.renderOrder = 999;
  return spr;
}

// India lat/lon bounds (approx)
//   lat: 8..37 N, lon: 68..97 E
const BOUNDS = { latMin: 8, latMax: 37, lonMin: 68, lonMax: 97 };

// Simple equirectangular projection into map-plane coordinates
function projectLatLon(lat, lon) {
  const u = (lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin);
  const v = 1 - (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin); // v downwards
  const x = (u - 0.5) * MAP_W;
  const z = (v - 0.5) * MAP_H;
  return new THREE.Vector3(x, 0, z);
}

// City “warehouses” (real coordinates)
const CITY = {
  WH1: { name: "WH1 — Delhi",     lat: 28.6139, lon: 77.2090 },
  WH2: { name: "WH2 — Mumbai",    lat: 19.0760, lon: 72.8777 },
  WH3: { name: "WH3 — Bangalore", lat: 12.9716, lon: 77.5946 }
};

let WH_POS = {}; // populated after map sizing

function buildWarehouses() {
  Object.keys(CITY).forEach(k => {
    const pos = projectLatLon(CITY[k].lat, CITY[k].lon);
    WH_POS[k] = pos;
    const mesh = createWarehouseMesh(pos);
    scene.add(mesh);
  });
}

function buildLabels() {
  LABELS.clear();
  const offsetY = 3.5;
  // centroid of triangle
  const centroid = new THREE.Vector3(
    (WH_POS.WH1.x + WH_POS.WH2.x + WH_POS.WH3.x) / 3,
    0,
    (WH_POS.WH1.z + WH_POS.WH2.z + WH_POS.WH3.z) / 3
  );

  function placeLabel(text, basePos, pushOut = 7.0, angleOffset = 0) {
    const fromCenter = new THREE.Vector3().subVectors(basePos, centroid).setY(0);
    if (fromCenter.lengthSq() < 1e-6) fromCenter.set(1, 0, 0);
    const dir = fromCenter.clone().normalize();
    if (angleOffset !== 0) {
      const c = Math.cos(angleOffset), s = Math.sin(angleOffset);
      const x = dir.x, z = dir.z;
      dir.x = x * c - z * s;
      dir.z = x * s + z * c;
    }
    dir.multiplyScalar(pushOut);
    const pos = new THREE.Vector3().copy(basePos).add(dir);
    const spr = makeTextSprite(text, 0.8);
    spr.position.set(pos.x, offsetY, pos.z);
    LABELS.add(spr);
  }

  placeLabel(CITY.WH1.name, WH_POS.WH1, 7.0,  0.10);
  placeLabel(CITY.WH2.name, WH_POS.WH2, 7.0, -0.10);
  placeLabel(CITY.WH3.name, WH_POS.WH3, 8.2,  0.20); // push WH3 more so it never covers the node
}

function createWarehouseMesh(pos) {
  // flat “depot” disc
  const geo = new THREE.CylinderGeometry(2.5, 2.5, 0.6, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0x3c82f6 });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  m.position.y = 0.3; // slight lift
  return m;
}

function buildRoads() {
  // draw triangle edges on the map (top view lines)
  drawRoad(WH_POS.WH1, WH_POS.WH2);
  drawRoad(WH_POS.WH2, WH_POS.WH3);
  drawRoad(WH_POS.WH3, WH_POS.WH1);
}
function drawRoad(a, b) {
  const material = new THREE.LineBasicMaterial({ color: 0x505050, linewidth: 2 });
  const points = [ a.clone(), b.clone() ].map(p => p.clone().add(new THREE.Vector3(0, 0.01, 0))); // slight lift
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geom, material);
  line.renderOrder = 1;
  scene.add(line);
}

// ============ Map texture load ============
textureLoader.load("india_map.png", (tex) => {
  // scale plane to image aspect
  const img = tex.image;
  const aspect = img.width / img.height;
  MAP_W = 140 * aspect;
  MAP_H = 140;

  const planeGeo = new THREE.PlaneGeometry(MAP_W, MAP_H);
  const planeMat = new THREE.MeshBasicMaterial({ map: tex });
  mapPlane = new THREE.Mesh(planeGeo, planeMat);
  mapPlane.rotation.x = -Math.PI / 2; // lay flat
  mapPlane.position.y = 0;            // y=0 plane
  scene.add(mapPlane);

  // camera after map sizes known
  setupCamera();

  // After camera set, we can project cities and build network
  buildWarehouses();
  buildRoads();
  buildLabels();

  log("Map and road network initialized.");
  loadScenario("scenario_before.json", "Normal operations");
});

// ============ Road Graph + Movement ============
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

// adjacency (all edges of triangle)
const ADJ = {
  WH1: ["WH2", "WH3"],
  WH2: ["WH1", "WH3"],
  WH3: ["WH1", "WH2"]
};

function defaultPathIDs(origin, destination) {
  if (origin === destination) return [origin];
  if (ADJ[origin] && ADJ[origin].includes(destination)) {
    return [origin, destination];
  }
  // fallback route via WH2 if both connect to it
  if (origin !== "WH2" && destination !== "WH2") {
    return [origin, "WH2", destination];
  }
  return [origin, destination];
}

function idsToPoints(ids) {
  return ids.map(id => WH_POS[id]).filter(Boolean).map(p => new THREE.Vector3(p.x, 0.5, p.z));
}

// --- Bezier smoothing for rounded turns ---
function smoothPath(basePts, radiusLimit = 2.2, samplesPerCorner = 8) {
  if (!basePts || basePts.length < 2) return basePts || [];
  const out = [];
  out.push(basePts[0].clone());

  for (let i = 1; i < basePts.length - 1; i++) {
    const p0 = basePts[i - 1];
    const p1 = basePts[i];
    const p2 = basePts[i + 1];

    const vIn  = new THREE.Vector3().subVectors(p1, p0);
    const vOut = new THREE.Vector3().subVectors(p2, p1);

    const lenIn  = vIn.length();
    const lenOut = vOut.length();
    if (lenIn < 1e-6 || lenOut < 1e-6) {
      out.push(p1.clone());
      continue;
    }
    vIn.normalize(); vOut.normalize();
    const cut = Math.min(radiusLimit, 0.4 * Math.min(lenIn, lenOut));
    const pIn  = new THREE.Vector3().copy(p1).addScaledVector(vIn,  -cut);
    const pOut = new THREE.Vector3().copy(p1).addScaledVector(vOut,  cut);

    const prev = out[out.length - 1];
    if (!prev.equals(pIn)) out.push(pIn);

    for (let s = 1; s < samplesPerCorner; s++) {
      const t = s / samplesPerCorner;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const q = new THREE.Vector3(
        a * pIn.x + b * p1.x + c * pOut.x,
        0.5,
        a * pIn.z + b * p1.z + c * pOut.z
      );
      out.push(q);
    }
    out.push(pOut);
  }

  out.push(basePts[basePts.length - 1].clone());
  return out;
}

// ============ Truck model ============
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
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.4, z);
    group.add(w);
    wheels.push(w);
  }
  addWheel(-2.2,  0.7); addWheel(-2.2, -0.7);
  addWheel(-0.6,  0.7); addWheel(-0.6, -0.7);
  addWheel( 1.0,  0.7); addWheel( 1.0, -0.7);

  group.userData.wheels = wheels;
  group.userData.wheelRadius = 0.28;
  return group;
}

// ============ Movement State ============
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

let movingTrucks = []; // [{id, mesh, wheels[], path:[Vector3], segIdx, segT, direction, speed, wheelRadius, lastPos, pausedUntil}]
const tmpDir = new THREE.Vector3();

// Convoy spacing & junction holding
const MIN_GAP = 2.2;         // min spacing along same segment/direction (world units)
const JUNCTION_RADIUS = 2.8; // hold radius around nodes to prevent overlap

function spawnMovingTruck(truck, rerouteMap) {
  const delayed = (truck.status && String(truck.status).toLowerCase() === 'delayed') ||
                  (truck.delay_hours || 0) > 0;

  let pathIDs;
  if (rerouteMap.has(truck.id)) pathIDs = rerouteMap.get(truck.id);
  else pathIDs = defaultPathIDs(truck.origin, truck.destination);

  if (pathIDs[0] !== truck.origin) pathIDs.unshift(truck.origin);
  if (pathIDs[pathIDs.length - 1] !== truck.destination) pathIDs.push(truck.destination);

  const poly = idsToPoints(pathIDs);
  const smoothPts = smoothPath(poly, 2.2, 8);
  if (smoothPts.length < 2) return;

  const mesh = createTruckMesh(delayed);
  mesh.position.copy(smoothPts[0]);
  trucksGroup.add(mesh);

  const SPEED = delayed ? 2.0 : 3.2;

  movingTrucks.push({
    id: truck.id,
    mesh,
    wheels: mesh.userData.wheels || [],
    path: smoothPts,
    segIdx: 0,
    segT: 0,
    direction: 1,  // ping-pong
    speed: SPEED,
    wheelRadius: mesh.userData.wheelRadius || 0.28,
    lastPos: smoothPts[0].clone(),
    pausedUntil: 0 // ms timestamp if temporarily held at junction
  });
}

// Helper: get scalar progress (distance along current segment)
function segmentProgress(t) {
  const a = t.path[t.segIdx];
  const b = t.path[t.segIdx + t.direction];
  if (!a || !b) return 0;
  const segLen = a.distanceTo(b);
  return t.segT * segLen;
}

// Simple junction detector: is pos near any node?
function nearJunction(pos) {
  for (const key in WH_POS) {
    if (pos.distanceTo(WH_POS[key]) < JUNCTION_RADIUS) return true;
  }
  return false;
}

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

    // Explicit reroutes
    const rerouteMap = new Map();
    if (Array.isArray(data.reroutes)) {
      for (const r of data.reroutes) {
        if (Array.isArray(r.path) && r.truckId) {
          rerouteMap.set(r.truckId, r.path.slice());
        }
      }
    }

    // Spawn
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

function updateMovingTrucks(dt) {
  const now = performance.now();

  // ---- 1) Junction holding: pause trucks if another is in the junction ----
  for (const t of movingTrucks) {
    if (t.pausedUntil && now < t.pausedUntil) continue; // still paused

    // If truck is very near a junction and another truck is also near, impose a short pause
    const pos = t.mesh.position;
    if (nearJunction(pos)) {
      const someoneElse = movingTrucks.find(o => o !== t && o.mesh.position.distanceTo(pos) < JUNCTION_RADIUS * 0.9);
      if (someoneElse) {
        t.pausedUntil = now + 400; // 0.4s pause to avoid overlap at nodes
      }
    }
  }

  // ---- 2) Advance + convoy spacing on same segment/direction ----
  for (const t of movingTrucks) {
    if (t.pausedUntil && now < t.pausedUntil) continue; // paused at junction

    const pts = t.path;
    if (!pts || pts.length < 2) continue;

    // Determine segment endpoints by direction
    let a = pts[t.segIdx];
    let b = pts[t.segIdx + t.direction];

    // If next index would go out of bounds, flip direction (ping-pong)
    if (!b) {
      t.direction *= -1;
      b = pts[t.segIdx + t.direction];
      if (!b) continue;
    }

    const segLen = Math.max(0.0001, a.distanceTo(b));
    let dT = (t.speed * dt) / segLen;

    // --- Convoy spacing: find the nearest truck ahead on same segment/direction
    const ahead = movingTrucks
      .filter(o =>
        o !== t &&
        o.path === t.path &&                  // (same array) unlikely; so compare geometry instead
        o.segIdx === t.segIdx &&
        o.direction === t.direction
      );

    // If same-array check won't match (different arrays), we approximate same segment by geometry:
    const aheadGeom = movingTrucks.filter(o => {
      if (o === t) return false;
      const oa = o.path[o.segIdx], ob = o.path[o.segIdx + o.direction];
      if (!oa || !ob) return false;
      // same segment if both endpoints are very close
      return (oa.distanceTo(a) < 0.01 && ob.distanceTo(b) < 0.01 && o.direction === t.direction);
    });

    const candidates = ahead.concat(aheadGeom);

    if (candidates.length) {
      const myProg = segmentProgress(t);
      let minGap = Infinity;
      for (const o of candidates) {
        const oProg = segmentProgress(o);
        if (oProg > myProg) {
          const gap = oProg - myProg;
          if (gap < minGap) minGap = gap;
        }
      }
      if (minGap < MIN_GAP) {
        // reduce advancement to maintain spacing
        dT *= Math.max(0.2, minGap / MIN_GAP * 0.6);
      }
    }

    t.segT += dT;

    if (t.segT >= 1) {
      t.segIdx += t.direction;
      t.segT -= 1;

      if (t.segIdx <= 0) {
        t.segIdx = 0;
        t.direction = 1;
      } else if (t.segIdx >= pts.length - 1) {
        t.segIdx = pts.length - 1;
        t.direction = -1;
      }
      a = pts[t.segIdx];
      b = pts[t.segIdx + t.direction] || a;
    }

    const pos = new THREE.Vector3().lerpVectors(a, b, t.segT);
    t.mesh.position.copy(pos);

    // Orient along tangent (always face direction of motion) — precise on curves
    tmpDir.subVectors(b, a).normalize();
    const target = new THREE.Vector3().addVectors(pos, tmpDir);
    t.mesh.lookAt(target);

    // Wheel spin proportional to distance
    const deltaDist = pos.distanceTo(t.lastPos);
    if (t.wheels && t.wheels.length && t.wheelRadius > 0) {
      const angle = deltaDist / t.wheelRadius; // radians
      for (const w of t.wheels) w.rotation.x -= angle;
    }
    t.lastPos.copy(pos);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  updateMovingTrucks(dt);
  renderer.render(scene, orthoCam);
}
animate();

// Handle window resize (preserve ortho framing)
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (orthoCam) {
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = MAP_H / 2;
    const halfW = halfH * aspect;
    orthoCam.left = -halfW;
    orthoCam.right = halfW;
    orthoCam.top = halfH;
    orthoCam.bottom = -halfH;
    orthoCam.updateProjectionMatrix();
  }
});
