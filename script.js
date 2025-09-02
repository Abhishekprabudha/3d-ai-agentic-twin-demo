// ============ Scene setup ============
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);
camera.position.z = 30;  // pull back to see everything

// ============ Warehouse positions ============
const WH_POS = {
  WH1: new THREE.Vector3(-10, 0, 0),
  WH2: new THREE.Vector3(0,   0, 0),
  WH3: new THREE.Vector3(10,  0, 0),
};

// ============ Warehouses (persistent) ============
const textureLoader = new THREE.TextureLoader();
// If your file is .jpg, change the filename below accordingly.
const warehouseTexture = textureLoader.load('warehouse_texture.png', () => {
  buildWarehouses();
  buildRoads();
  // Load the initial view
  loadScenario('scenario_before.json');
});

function createWarehouseMesh(pos) {
  const geom = new THREE.BoxGeometry(6, 3, 6);   // wider/taller for visibility
  const mat  = new THREE.MeshBasicMaterial({ map: warehouseTexture, transparent: true });
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(pos);
  return m;
}

function buildWarehouses() {
  Object.values(WH_POS).forEach(v => scene.add(createWarehouseMesh(v)));
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
const matRed   = new THREE.MeshBasicMaterial({ color: 0xff0000 });

function drawTruckAt(pos, delayed) {
  const geom = new THREE.SphereGeometry(0.5, 16, 16);
  const m = new THREE.Mesh(geom, delayed ? matRed : matGreen);
  m.position.copy(pos);
  trucksGroup.add(m);
}

// Load scenario JSON with fields: origin, destination, status, delay_hours
async function loadScenario(file) {
  try {
    const res = await fetch(file);
    const data = await res.json();

    // clear ONLY trucks (keep warehouses/roads/lights)
    while (trucksGroup.children.length) trucksGroup.remove(trucksGroup.children[0]);

    // count how many trucks start at each origin so we can offset vertically
    const perOriginCount = { WH1: 0, WH2: 0, WH3: 0 };

    (data.trucks || []).forEach(tr => {
      const originId = tr.origin;
      const originPos = WH_POS[originId];
      if (!originPos) return; // skip if origin not mapped

      const idx = (perOriginCount[originId] || 0);
      perOriginCount[originId] = idx + 1;

      // base below the warehouse, stack each additional truck lower so they don't overlap
      const base = originPos.clone().add(new THREE.Vector3(0, -3, 0));
      const offset = new THREE.Vector3(0, -idx * 1.2, 0);
      const p = base.add(offset);

      const delayed = (tr.status && String(tr.status).toLowerCase() === 'delayed') ||
                      (tr.delay_hours || 0) > 0;

      drawTruckAt(p, delayed);
    });
  } catch (err) {
    console.error('Failed to load scenario:', err);
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
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
