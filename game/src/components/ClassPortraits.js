import * as THREE from 'three';
import { buildFrog } from './FrogModels.js';
import { CLASSES } from './Classes.js';

/**
 * Portraits of the class frogs for the menus: each one rendered once into a small image (a data URL). A little
 * WebGL renderer of its own does it and is thrown away afterwards.
 */
const portraits = new Map();

export function classPortrait(id) {
  if (!portraits.size) renderAll();
  return portraits.get(id) ?? '';
}

function renderAll() {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return; // no WebGL to spare: the menus show the class icons instead
  }
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#5a7a4a', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
  sun.position.set(-40, 80, 60);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  camera.position.set(-36, 30, 66);
  camera.lookAt(0, 15, 0);
  for (const { id } of CLASSES) {
    const rig = buildFrog(id);
    rig.update(0.01);
    scene.add(rig.root);
    renderer.render(scene, camera);
    portraits.set(id, canvas.toDataURL('image/png'));
    scene.remove(rig.root);
    rig.root.traverse((child) => child.isMesh && child.geometry.dispose());
  }
  renderer.dispose();
  renderer.forceContextLoss();
}
