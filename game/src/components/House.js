import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const HOUSE_SCALE = 65;

const loader = new GLTFLoader();

/**
 * Loads a house at (x, y), rotated by `turns` quarter turns, sitting on the ground.
 * Resolves with `{ house, rect }`, where `rect` is its footprint for collisions.
 */
export async function loadHouse({ x, y, turns = 0 }) {
  const gltf = await loader.loadAsync('/models/small_house.glb');
  const house = gltf.scene;
  house.scale.setScalar(HOUSE_SCALE);
  house.rotation.x = Math.PI / 2;
  house.rotation.y = turns * (Math.PI / 2);
  house.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  house.position.set(x, y, 0);

  // Sit exactly on the ground (Z = 0).
  house.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(house, true);
  house.position.z -= box.min.z;
  house.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(house, true);

  return {
    house,
    rect: { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y },
  };
}
