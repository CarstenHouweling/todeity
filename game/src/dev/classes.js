// Dev-only look test for the frog classes (open /classes.html while `npm run dev` runs). Five procedural frogs
// side by side on a lawn, cycling through their moves; buttons pick a move or a camera.
import * as THREE from 'three';
import { buildFrog, FROG_CLASSES } from '../components/FrogModels.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a8dcf5');
scene.fog = new THREE.Fog('#a8dcf5', 380, 900);
scene.add(new THREE.HemisphereLight('#d8efff', '#4f7a32', 1.5));
const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
sun.position.set(-80, 160, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 160, bottom: -160, near: 1, far: 600 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// A lawn with a mown-stripe pattern and a stone dais per frog.
const lawnCanvas = document.createElement('canvas');
lawnCanvas.width = lawnCanvas.height = 256;
const lawn = lawnCanvas.getContext('2d');
for (let i = 0; i < 8; i++) {
  lawn.fillStyle = i % 2 ? '#5aa83c' : '#63b343';
  lawn.fillRect(i * 32, 0, 32, 256);
}
const lawnTexture = new THREE.CanvasTexture(lawnCanvas);
lawnTexture.wrapS = lawnTexture.wrapT = THREE.RepeatWrapping;
lawnTexture.repeat.set(12, 12);
lawnTexture.colorSpace = THREE.SRGBColorSpace;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ map: lawnTexture, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const ids = Object.keys(FROG_CLASSES).filter((id) => !FROG_CLASSES[id].hidden); // (the Summoner's giant isn't a class)
const SPACING = 52;
const frogs = ids.map((id, i) => {
  const frog = buildFrog(id);
  const x = (i - (ids.length - 1) / 2) * SPACING;
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(19, 21, 2, 8), new THREE.MeshStandardMaterial({ color: '#b8b2a4', flatShading: true, roughness: 0.9 }));
  dais.position.set(x, 1, 0);
  dais.receiveShadow = true;
  scene.add(dais);
  frog.root.position.set(x, 2, 0);
  scene.add(frog.root);
  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b><span class="full">${frog.look.name}</span><span class="short">${frog.look.short}</span></b><small>${frog.look.title}</small><em>${frog.look.text}</em>`;
  document.body.append(label);
  return { frog, x, label, queue: [], waitLeft: i * 0.35 };
});

// Steam from the Alchemist's kettle.
const puffs = [];
const puffGeometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
const puffMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
let puffTimer = 0;
const kettleTop = new THREE.Vector3();

// --- Moves and cameras --------------------------------------------------------------------------
const MOVES = [
  ['cycle', '▶ Cycle'],
  ['idle', 'Idle'],
  ['hop', 'Hop'],
  ['attack', 'Spit'],
  ['dash', 'Dash'],
  ['victory', 'Victory'],
  ['signature', 'Signature'],
];
const CYCLE = ['idle', 'hop', 'hop', 'attack', 'idle', 'dash', 'signature', 'idle', 'victory'];
const CAMERAS = {
  front: { position: [0, 38, 150], target: [0, 14, 0], label: '📷 Front' },
  three: { position: [-120, 60, 120], target: [0, 10, 0], label: '📷 3/4' },
  game: { position: [150, 150, 150], target: [0, 0, 0], label: '📷 In-game view' },
  close: { position: [-42, 26, 52], target: [0, 12, 0], label: '🔍 Close-up' },
  side: { position: [-78, 16, 0], target: [0, 14, 6], label: '📷 Side' },
  wide: { position: [-80, 55, 120], target: [0, 26, -18], label: '🔭 Wide' },
};
let mode = 'cycle';
let cameraName = 'front';
let closeIndex = 0;
let turntable = false;

const bar = document.querySelector('.bar');
function drawBar() {
  bar.innerHTML = [
    ...MOVES.map(([id, label]) => `<button data-move="${id}" class="${mode === id ? 'on' : ''}">${label}</button>`),
    '<span class="gap"></span>',
    ...Object.entries(CAMERAS).map(([id, c]) => `<button data-camera="${id}" class="${cameraName === id ? 'on' : ''}">${c.label}</button>`),
    `<button data-turn class="${turntable ? 'on' : ''}">⟳ Turn</button>`,
  ].join('');
}
bar.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.move) {
    mode = button.dataset.move;
    for (const entry of frogs) {
      entry.queue = [];
      entry.waitLeft = 0;
      entry.frog.play(mode === 'cycle' ? 'idle' : mode);
    }
  }
  if (button.dataset.camera) {
    if (['close', 'side', 'wide'].includes(button.dataset.camera) && cameraName === button.dataset.camera) closeIndex = (closeIndex + 1) % frogs.length;
    cameraName = button.dataset.camera;
  }
  if ('turn' in button.dataset) turntable = !turntable;
  drawBar();
});
drawBar();

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 1, 3000);
const lookAt = new THREE.Vector3();
function placeCamera() {
  const view = CAMERAS[cameraName];
  const single = ['close', 'side', 'wide'].includes(cameraName);
  const focusX = single ? frogs[closeIndex].x : 0;
  // Step back until the whole row (or the one frog of a close-up) fits across the screen.
  const halfWidth = cameraName === 'wide' ? 60 : single ? 26 : ((frogs.length - 1) / 2) * SPACING + 34;
  const distance = Math.hypot(view.position[0] - view.target[0], view.position[1] - view.target[1], view.position[2] - view.target[2]);
  const halfAngle = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const fit = Math.max(1, halfWidth / (distance * Math.tan(halfAngle)));
  camera.position.set(view.position[0] * fit + focusX, view.position[1] * fit, view.position[2] * fit);
  lookAt.set(view.target[0] + focusX, view.target[1], view.target[2]);
  camera.lookAt(lookAt);
  // Seen from the side, the rest of the row would stand in the way.
  frogs.forEach((entry, i) => (entry.frog.root.visible = cameraName !== 'side' || i === closeIndex));
  // The haze starts behind the frogs, however far back the camera stands.
  scene.fog.near = distance * fit * 1.3;
  scene.fog.far = distance * fit * 4;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Loop ---------------------------------------------------------------------------------------
const clock = new THREE.Clock();
const screen = new THREE.Vector3();

function step(delta) {
  for (const entry of frogs) {
    const { frog } = entry;
    if (mode === 'cycle') {
      entry.waitLeft -= delta;
      if (entry.waitLeft <= 0) {
        if (!entry.queue.length) entry.queue = [...CYCLE];
        const next = entry.queue.shift();
        frog.play(next);
        entry.waitLeft = next === 'idle' ? 1.4 + Math.random() : frog.moveLength;
      }
    }
    frog.update(delta);
    frog.root.rotation.y = turntable ? frog.root.rotation.y + delta * 0.6 : 0;
  }
  // Kettle steam.
  puffTimer -= delta;
  const alchemist = frogs.find((entry) => entry.frog.look === FROG_CLASSES.alchemist)?.frog;
  if (alchemist?.kettleTop && puffTimer <= 0) {
    puffTimer = 0.25;
    alchemist.kettleTop.localToWorld(kettleTop.set(0, 7, 0));
    const puff = new THREE.Mesh(puffGeometry, puffMaterial.clone());
    puff.position.copy(kettleTop);
    scene.add(puff);
    puffs.push({ puff, age: 0 });
  }
  for (const entry of [...puffs]) {
    entry.age += delta;
    entry.puff.position.y += delta * 8;
    entry.puff.position.x += Math.sin(entry.age * 3) * delta * 2;
    entry.puff.scale.setScalar(1 + entry.age * 1.2);
    entry.puff.material.opacity = 0.7 * (1 - entry.age / 1.6);
    if (entry.age >= 1.6) {
      entry.puff.removeFromParent();
      entry.puff.material.dispose();
      puffs.splice(puffs.indexOf(entry), 1);
    }
  }
}

function render() {
  placeCamera();
  renderer.render(scene, camera);
  // When the frogs stand close together on screen, the labels shrink to short names.
  const first = screen.set(frogs[0].x, -6, 0).project(camera).x;
  const gap = ((screen.set(frogs[1].x, -6, 0).project(camera).x - first) / 2) * window.innerWidth;
  document.body.classList.toggle('compact', gap < 190);
  for (const { frog, x, label } of frogs) {
    screen.set(x, -6, 0).project(camera);
    const visible = screen.z < 1 && Math.abs(screen.x) < 1.1 && !['close', 'side', 'wide'].includes(cameraName);
    label.style.display = visible ? '' : 'none';
    label.style.left = `${((screen.x + 1) / 2) * window.innerWidth}px`;
    label.style.top = `${((1 - screen.y) / 2) * window.innerHeight}px`;
    void frog;
  }
}

renderer.setAnimationLoop(() => {
  step(Math.min(clock.getDelta(), 0.1));
  render();
});

// For screenshots from the console: preview.step(seconds) advances time without the animation loop.
window.preview = {
  frogs,
  step: (seconds, dt = 1 / 60) => {
    for (let t = 0; t < seconds; t += dt) step(dt);
    render();
  },
  pose: (move, at) => {
    for (const { frog } of frogs) {
      frog.play(move);
      frog.update(at * frog.moveLength);
    }
    render();
  },
  setCamera: (name, index = 0) => {
    cameraName = name;
    closeIndex = index;
    drawBar();
    render();
  },
  setMode: (name) => {
    mode = name;
    drawBar();
  },
  /**
   * A contact sheet of frozen moments, shown over the page (click it to close): cells are
   * { label, move, at (0–1 through the move), camera, index (which frog) }.
   */
  sheet: (cells, columns = 2) => {
    const source = renderer.domElement;
    const { width, height } = source;
    const cw = 420;
    const ch = Math.round(((420 * height) / width) * 0.6);
    const out = document.createElement('canvas');
    out.width = cw * columns;
    out.height = ch * Math.ceil(cells.length / columns);
    const context = out.getContext('2d');
    const before = { mode, cameraName, closeIndex };
    mode = 'idle';
    cells.forEach(({ label, move, at = 0.5, camera: view = 'close', index = 0 }, i) => {
      for (const { frog } of frogs) {
        frog.play('idle');
        frog.update(0.01);
      }
      const { frog } = frogs[index];
      if (move) {
        frog.play(move);
        frog.update(at * frog.moveLength);
      }
      cameraName = view;
      closeIndex = index;
      render();
      const x = (i % columns) * cw;
      const y = Math.floor(i / columns) * ch;
      context.drawImage(source, 0, height * 0.15, width, height * 0.6, x, y, cw, ch);
      context.fillStyle = '#fff';
      context.font = 'bold 18px system-ui';
      context.fillText(label ?? '', x + 10, y + 24);
    });
    ({ mode, cameraName, closeIndex } = before);
    drawBar();
    document.getElementById('sheet')?.remove();
    const image = new Image();
    image.id = 'sheet';
    image.src = out.toDataURL();
    image.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#222;z-index:50;cursor:pointer';
    image.onclick = () => image.remove();
    document.body.append(image);
  },
};
