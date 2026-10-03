/** Lazy WebGL enhancement. The accessible 2D board and controls always remain available. */
import { currentGame, currentGameState, currentPlayers } from '../state.js';
let dispose = () => {};
let generation = 0;
export function syncArena3D(root) {
  dispose();
  const ticket = ++generation;
  const host = root.querySelector('[data-arena-3d]');
  if (!host) return;
  const game = currentGame();
  const snapshot = currentGameState();
  const players = currentPlayers();
  import('three').then((THREE) => {
    if (ticket !== generation || !host.isConnected || !snapshot || !game) return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { host.textContent = '3D is unavailable on this device. Play using the full 2D board below.'; return; }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080d20');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(10, 13, 14);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xb0ddff, 0x222044, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(4, 10, 3); scene.add(light);
    const geometries = [];
    const materials = [];
    function box(x, y, z, w, h, d, color) {
      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 });
      geometries.push(geometry); materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    }
    const colors = [0x38bdf8, 0xc084fc, 0xfb7185];
    if (game.engine === 'maze') {
      const w = snapshot.width, h = snapshot.height;
      box(0, -0.35, 0, w + 0.5, 0.4, h + 0.5, 0x182b48);
      snapshot.walls.forEach((cell) => box(cell % w - (w - 1) / 2, 0.4, Math.floor(cell / w) - (h - 1) / 2, 0.94, 1.2, 0.94, 0x5366b4));
      const goal = snapshot.goal;
      box(goal.x - (w - 1) / 2, 0.12, goal.y - (h - 1) / 2, 0.9, 0.3, 0.9, 0xfbbf24);
      players.forEach((p, i) => { const pos = snapshot.positions[p.uid]; box(pos.x - (w - 1) / 2, 0.45 + i * 0.14, pos.y - (h - 1) / 2, 0.5, 0.7, 0.5, colors[i]); });
    } else {
      camera.position.set(10, 10, 12); camera.lookAt(0, 0, 0);
      players.forEach((p, i) => {
        const z = (i - (players.length - 1) / 2) * 2;
        box(0, -0.25, z, 12, 0.3, 1.5, 0x182b48);
        for (let x = -5; x <= 5; x++) box(x, -0.07, z, 0.06, 0.04, 1.4, 0x526680);
        const x = -5 + Math.min(1, snapshot.scores[p.uid] / snapshot.target) * 10;
        box(x, 0.25, z, 0.95, 0.35, 0.65, colors[i]);
        box(x - 0.12, 0.53, z, 0.4, 0.25, 0.45, 0xddeeff);
        box(5.5, 0, z, 0.15, 0.12, 1.5, 0xfbbf24);
      });
    }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute('aria-label', `${game.title}: live 3D view. Use the controls below to play.`);
    renderer.domElement.setAttribute('role', 'img');
    host.replaceChildren(renderer.domElement);
    function resize() {
      const width = host.clientWidth || 640;
      renderer.setSize(width, Math.min(400, width * 0.62));
      camera.aspect = width / Math.min(400, width * 0.62);
      camera.updateProjectionMatrix(); renderer.render(scene, camera);
    }
    const observer = new window.ResizeObserver(resize); observer.observe(host); resize();
    dispose = () => {
      observer.disconnect(); geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); dispose = () => {};
    };
  }).catch(() => { if (host.isConnected) host.textContent = '3D could not load. The 2D controls below still work.'; });
}
