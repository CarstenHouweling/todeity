import * as THREE from 'three';
import { viewHeight, viewWidth } from './Viewport.js';

export function createRenderer() {
  const canvas = document.querySelector('canvas.game');
  if (!canvas) throw new Error('Canvas not found');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    // The picture is drawn through post-processing with its own multisampling (PostFX.js), so the canvas needs none;
    // only the Low graphics' direct rendering goes without, which is the point of Low.
    antialias: false,
  });
  // Retina screens at full resolution plus bloom are heavy; main.js adapts this to the frame rate.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(viewWidth(), viewHeight(), false); // CSS keeps the canvas on the screen (style.css)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
