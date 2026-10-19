import * as THREE from 'three';
import { buildTrinket, disposeTrinket } from './TrinketModels.js';
import { TRINKETS } from './Rewards.js';

/**
 * Small 3D pictures of the trinkets for the garden tray, rendered once (the first time the tray opens) by a little
 * WebGL renderer of their own, like the class portraits. Without WebGL to spare the tray shows the emoji instead.
 */
const pictures = new Map();
let tried = false;

const unframed = (part) => {
  for (let p = part; p; p = p.parent) if (p.userData.unframed) return true;
  return false;
};

export function trinketPicture(id) {
  if (!tried) renderAll();
  return pictures.get(id) ?? '';
}

function renderAll() {
  tried = true;
  const size = 112;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return;
  }
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#5a7a4a', 1.8));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.set(60, -80, 120);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 1000);
  camera.up.set(0, 0, 1); // the trinkets are Z-up, like the world
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const extent = new THREE.Vector3();
  for (const { id } of TRINKETS) {
    const model = buildTrinket(id);
    model.rotation.z = -0.5;
    model.userData.animate?.(1.2, false);
    scene.add(model);
    model.updateMatrixWorld(true);
    // The model itself: not its (hidden) night glow, nor parts that fly off (`userData.unframed`, the fireworks).
    box.makeEmpty();
    model.children[0].traverse((part) => {
      if (part.isMesh && part.visible && !unframed(part)) box.expandByObject(part);
    });
    box.getCenter(center);
    box.getSize(extent);
    // Frame it from the front and a little above, so every trinket fills the picture the same way.
    const distance = Math.max(extent.x, extent.y, extent.z) * 2.4 + 10;
    camera.position.set(center.x + distance * 0.15, center.y - distance * 0.85, center.z + distance * 0.45);
    camera.lookAt(center);
    renderer.render(scene, camera);
    pictures.set(id, canvas.toDataURL('image/png'));
    disposeTrinket(model);
  }
  renderer.dispose();
  renderer.forceContextLoss();
}
