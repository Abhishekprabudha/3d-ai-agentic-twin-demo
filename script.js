// --- Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);
camera.position.z = 30;

// --- Warehouses (persistent) ---
const textureLoader = new THREE.TextureLoader();
const warehouseTexture = textureLoader.load('warehouse_texture.png', () => {
  // after texture loads, build warehouses
  buildWarehouses();
  // initial draw
  loadScenario('scenario_before.json');
});

const WH_POS = {
  WH1: new THREE.Vector3(-10, 0, 0),
  WH2: new THREE.Vector3(0,   0, 0),
  WH3: new THREE.Vector3(10,  0, 0),
};

function createWarehouseMesh(pos) {
  const geom = new THREE.BoxGeometry(4, 2, 4);
  const mat  = new THREE.MeshBasicMaterial({ map: warehouseTexture, transparent: true });
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(pos);
  return m;
}

function buildWarehouses() {
  Object.values(WH_POS).forEach(v => scene.add(createWarehouseMesh(v)));
}

// Optional: simple “roads” between warehouses
function createRoad(a, b) {
  const material = new THREE.LineBasicMaterial({ color: 0x555555 });
  const points = [a.clone().add(new THREE.Vector3(0, -0.8, 0)), b.clone().add(new THREE.Vector3(0, -0.8, 0))];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.Line(geom, material));
}
createRoad(WH_POS.WH1, WH_POS.WH2);
createRoad(WH_POS.WH2, WH_POS.WH3);

// --- Trucks (replace-only) ---
const trucksGroup = new THREE.Group();
scene.add(trucksGroup);

const matGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const matRed   = new THREE.MeshBasicMaterial({ color: 0xff0000 });

function drawTruckAt(pos, delayed) {
  const geom = new THREE.SphereGeometry(0.5, 16, 16);
  const m = new THREE.Mesh(geom, delayed ? matRed : matGreen);
  m.position.copy(pos);
  trucksGroup.add(m);
}

// --- Scenario loader ---
// Supports your JSON schema: { trucks: [{id, origin, destination, status, delay_hours}] }
async function loadScenario(file) {
  try {
    const res = await fetch(file);
    const data = await res.json();

    // clear ONLY trucks
    while (trucksGroup.children.length) trucksGroup.remove(trucksGroup.children[0]);

    // place trucks slightly below their origin warehouse
    data.trucks.forEach(tr => {
      const originPos = WH_POS[tr.origin] || new THREE.Vector3(0,0,0);
      const p = originPos.clone().add(new THREE.Vector3(0, -3, 0));
      const delayed = (tr.status && String(tr.status).toLowerCase() === 'delayed') || (tr.delay_hours || 0) > 0;
      drawTruckAt(p, delayed);
    });
  } catch (e) {
    console.error('Failed to load scenario:', e);
  }
}

// expose for buttons in index.html
window.loadScenario = loadScenario;

// --- Animate loop ---
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// --- Handle resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
