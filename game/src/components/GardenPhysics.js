import * as THREE from 'three';
import { buildTrinket, disposeTrinket } from './TrinketModels.js';

/**
 * What frogs can stand on in a garden. A **height field** samples an object's shape once by casting rays straight
 * down onto it on a grid; after that, `at(x, y)` is a quick lookup of how high its top is there (0 = nothing).
 * The house is sampled where it stands; trinkets once per kind, around their own origin, and looked up turned and
 * moved to where they stand.
 */
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, 0, -1);
const from = new THREE.Vector3();

export function heightField(object, { cell = 4, margin = 0 } = {}) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const minX = box.min.x - margin;
  const minY = box.min.y - margin;
  const cols = Math.max(1, Math.ceil((box.max.x + margin - minX) / cell));
  const rows = Math.max(1, Math.ceil((box.max.y + margin - minY) / cell));
  const heights = new Float32Array(cols * rows);
  const meshes = [];
  object.traverse((child) => child.isMesh && child.visible && meshes.push(child));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      from.set(minX + (c + 0.5) * cell, minY + (r + 0.5) * cell, box.max.z + 50);
      ray.set(from, DOWN);
      const hit = ray.intersectObjects(meshes, false)[0];
      heights[r * cols + c] = hit ? Math.max(0, hit.point.z) : 0;
    }
  }
  return {
    top: box.max.z,
    at(x, y) {
      const c = Math.floor((x - minX) / cell);
      const r = Math.floor((y - minY) / cell);
      return c < 0 || r < 0 || c >= cols || r >= rows ? 0 : heights[r * cols + c];
    },
  };
}

const trinketFields = new Map();

/** A trinket kind's height field, around its own origin (made the first time it's needed). */
export function trinketField(id) {
  if (!trinketFields.has(id)) {
    const model = buildTrinket(id);
    if (model.userData.glow) model.userData.glow.visible = false;
    trinketFields.set(id, heightField(model, { cell: 2 }));
    disposeTrinket(model);
  }
  return trinketFields.get(id);
}

/** How high a placed trinket ({ id, x, y, r }) reaches at a point of the lawn. */
export function trinketHeightAt(item, x, y) {
  const dx = x - item.x;
  const dy = y - item.y;
  const cos = Math.cos(-item.r);
  const sin = Math.sin(-item.r);
  return trinketField(item.id).at(dx * cos - dy * sin, dx * sin + dy * cos);
}
