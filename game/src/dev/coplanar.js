// Dev-only z-fighting finder. In the browser console:
//   game.coplanar()                    // the whole scene: faces of different colours lying in one plane
//   game.coplanar(game.garden.root)    // only the garden's trinkets
//   game.coplanar('birdbath')          // one trinket, freshly built (its animation run once, at t = 3.3)
// Two faces facing the same way in (almost) the same plane flicker through each other ("z-fighting"). Faces of the
// same colour and material can't be told apart, so they are left out, and so are faces that look down onto z = 0
// (the bottoms of things standing on the lawn). Instanced meshes are skipped; points and lines aren't faces.
import * as THREE from 'three';
import { buildTrinket } from '../components/TrinketModels.js';

const visible = (o) => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

function triangles(root) {
  root.updateMatrixWorld(true);
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !visible(o)) return;
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    const { position, color } = o.geometry.attributes;
    if (!material || !position || material.colorWrite === false) return;
    const index = o.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
      const v = ids.map((k) => new THREE.Vector3().fromBufferAttribute(position, k).applyMatrix4(o.matrixWorld));
      const normal = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
      if (normal.length() < 2e-3) continue;
      normal.normalize();
      let hex = material.color?.getHexString() ?? '?';
      if (color && material.vertexColors) hex = new THREE.Color().fromBufferAttribute(color, ids[0]).getHexString();
      list.push({ v, normal, d: normal.dot(v[0]), mesh: o, material, hex: `${hex}|${material.emissive?.getHexString()}` });
    }
  });
  return list;
}

// Overlap of two triangles in their shared plane (Sutherland–Hodgman clipping).
const area = (poly) => poly.reduce((sum, p, i) => sum + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0) / 2;
function clip(poly, a, b) {
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) out.push([p[0] + (sp / (sp - sq)) * (q[0] - p[0]), p[1] + (sp / (sp - sq)) * (q[1] - p[1])]);
  });
  return out;
}
function overlap(a, b) {
  const u = new THREE.Vector3(Math.abs(a.normal.x) < 0.9 ? 1 : 0, Math.abs(a.normal.x) < 0.9 ? 0 : 1, 0).cross(a.normal).normalize();
  const w = a.normal.clone().cross(u);
  const flat = (t) => {
    const pts = t.v.map((p) => [p.dot(u), p.dot(w)]);
    return area(pts) < 0 ? pts.reverse() : pts;
  };
  let poly = flat(a);
  const other = flat(b);
  for (let i = 0; i < 3 && poly.length; i++) poly = clip(poly, other[i], other[(i + 1) % 3]);
  return poly.length >= 3 ? Math.abs(area(poly)) : 0;
}

const label = (o) => {
  for (let p = o; p; p = p.parent) if (p.userData?.trinket) return p.userData.trinket;
  return o.name || o.parent?.name || o.geometry.type;
};

/** Pairs of differently coloured faces sharing a plane (within `tolerance` units), biggest overlap first. */
export function findCoplanar(target, { tolerance = 0.06, minArea = 0.3 } = {}) {
  let root = target;
  if (typeof target === 'string') {
    root = buildTrinket(target);
    root.userData.animate?.(3.3, false);
  }
  const tris = triangles(root);
  const key = (n, d) => `${Math.round(n.x * 50)},${Math.round(n.y * 50)},${Math.round(n.z * 50)}|${d}`;
  const buckets = new Map();
  tris.forEach((t, i) => {
    const k = key(t.normal, Math.round(t.d * 2));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  });
  const pairs = new Map();
  tris.forEach((a, i) => {
    for (const flip of a.material.side === THREE.DoubleSide ? [1, -1] : [1]) {
      const normal = a.normal.clone().multiplyScalar(flip);
      for (const dd of [-1, 0, 1]) {
        for (const j of buckets.get(key(normal, Math.round(a.d * flip * 2) + dd)) ?? []) {
          if (j <= i && flip === 1) continue;
          const b = tris[j];
          if (a.normal.dot(b.normal) * flip < 0.9995 || Math.abs(a.d * flip - b.d) > tolerance) continue;
          if (a.hex === b.hex && a.material.type === b.material.type) continue; // can't be told apart
          if (a.normal.z < -0.99 && b.normal.z < -0.99 && Math.abs(a.v[0].z) < 0.2) continue; // bottoms on the lawn
          if (a.material.transparent && b.material.transparent && !a.material.depthWrite && !b.material.depthWrite) continue;
          const shared = overlap(a, b);
          if (shared < 0.02) continue;
          const name = `${label(a.mesh)} #${a.hex.split('|')[0]} / ${label(b.mesh)} #${b.hex.split('|')[0]}`;
          const pair = pairs.get(name) ?? { pair: name, area: 0, at: a.v[0].toArray().map((x) => Math.round(x * 10) / 10) };
          pair.area += shared;
          pairs.set(name, pair);
        }
      }
    }
  });
  return [...pairs.values()]
    .filter((p) => p.area >= minArea)
    .map((p) => ({ ...p, area: Math.round(p.area * 10) / 10 }))
    .sort((a, b) => b.area - a.area);
}
