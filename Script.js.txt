let scene, camera, renderer;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  camera.position.z = 10;

  loadScenario("scenario_before.json");
}

function loadScenario(file) {
  fetch(file)
    .then(response => response.json())
    .then(data => {
      scene.clear();

      // Warehouses = blue cubes
      data.warehouses.forEach((wh, i) => {
        const geometry = new THREE.BoxGeometry(1,1,1);
        const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.x = i * 3 - 3; // spread them
        cube.position.y = 0;
        scene.add(cube);
      });

      // Trucks = red spheres
      data.trucks.forEach((tr, i) => {
        const geometry = new THREE.SphereGeometry(0.3, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: tr.status === "Delayed" ? 0xff0000 : 0x00ff00 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.x = (i % 3) * 3 - 3;
        sphere.position.y = -2 - Math.floor(i/3);
        scene.add(sphere);
      });
    });
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
