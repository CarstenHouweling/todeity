import * as THREE from 'three';
import { viewHeight, viewWidth } from './Viewport.js';

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    30,
    viewWidth() / viewHeight(),
    1,
    9000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(300, -300, 300);
  camera.lookAt(0, 0, 0);
  return camera;
}
