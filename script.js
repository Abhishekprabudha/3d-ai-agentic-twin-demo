// Initialize scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);

// Load warehouse texture
const textureLoader = new THREE.TextureLoader();
const warehouseTexture = textureLoader.load('warehouse_texture.png');

// Function to create textured warehouse
function createWarehouse(x, y, z) {
  const geometry = new THREE.BoxGeometry(4, 2, 4); // wider than tall
  const material = new THREE.MeshBasicMaterial({ map: warehouseTexture });
  const warehouse = new THREE.Mesh(geometry, material);
  warehouse.position.set(x, y, z);
  scene.add(warehouse);
  return warehouse;
}

// Create warehouses
const warehouses = [];
warehouses.push(createWarehouse(-10, 0, 0));
warehouses.push(createWarehouse(0, 0, 0));
warehouses.push(createWarehouse(10, 0, 0));

// Truck material/colors
const greenMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// Function to create a truck
function createTruck(x, y, z, isDelayed = false) {
  const geometry = new THREE.SphereGeometry(0.5, 16, 16);
  const material = isDelayed ? redMaterial : greenMaterial;
  const truck = new THREE.Mesh(geometry, material);
  truck.position.set(x, y, z);
  scene.add(truck);
  return truck;
}

// Placeholder trucks (later connected to JSON)
let trucks = [
  createTruck(-10, -3, 0, false),
  createTruck(0, -3, 0, true),
  createTruck(10, -3, 0, false),
];

// Load scenario from JSON
async function loadScenario(file) {
  const response = await fetch(file);
  const data = await response.json();

  // Remove old trucks
  trucks.forEach(truck => scene.remove(truck));
  trucks = [];

  // Add new trucks
  data.trucks.forEach(tr => {
    trucks.push(createTruck(tr.x, tr.y, tr.z, tr.delayed));
  });
}

// Camera position
camera.position.z = 15;

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
