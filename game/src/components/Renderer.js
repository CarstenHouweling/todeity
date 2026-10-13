import * as THREE from 'three';

export function createRenderer() {
  const canvas = document.querySelector('canvas.game');
  if (!canvas) throw new Error('Canvas not found');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  // Retina screens at full resolution plus bloom are heavy; main.js adapts this to the frame rate.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
