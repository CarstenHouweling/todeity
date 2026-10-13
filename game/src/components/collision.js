import * as THREE from 'three';

// Fraction of the summed body radii two characters may come to each other
// before they count as colliding. Lower = characters can get closer.
export const COLLISION_DISTANCE = 0.85;

const vertex = new THREE.Vector3();

/**
 * Radius of the model's footprint on the ground (XY plane), measured from the
 * actual mesh vertices rather than a bounding box, so rounded characters get a
 * tight, round hitbox. Measured relative to `root`'s origin.
 */
export function computeFootprintRadius(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let radius = 0;

  root.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.attributes.position;
    const toLocal = new THREE.Matrix4().multiplyMatrices(toRoot, child.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      child.getVertexPosition(i, vertex);
      vertex.applyMatrix4(toLocal);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.y));
    }
  });

  return radius;
}

export function circlesOverlap(a, radiusA, b, radiusB) {
  const minDistance = (radiusA + radiusB) * COLLISION_DISTANCE;
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < minDistance ** 2;
}

/** Circle (a character) vs. an axis-aligned rectangle (a building footprint). */
export function circleIntersectsRect(point, radius, rect) {
  const closestX = THREE.MathUtils.clamp(point.x, rect.minX, rect.maxX);
  const closestY = THREE.MathUtils.clamp(point.y, rect.minY, rect.maxY);
  return (point.x - closestX) ** 2 + (point.y - closestY) ** 2 < radius ** 2;
}
