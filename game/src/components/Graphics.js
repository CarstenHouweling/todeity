import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Graphics levels: the garden keeps the original low-poly look, and every new arena raises the bar.
 * Characters get smooth shading and glossy materials, the renderer gets filmic tone mapping and
 * reflections of a soft studio environment.
 */
export const GFX_LEVELS = [
  // 0 Classic: flat shading, no tone mapping (the course's look)
  { toneMapping: THREE.NoToneMapping, exposure: 1, environment: 0, smooth: false },
  // 1 Sage Mountain: smooth shading, a touch of gloss
  { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.0, environment: 0.25, smooth: true, clearcoat: 0.4, sheen: 0 },
  // 2 Sky Citadel: wet, glossy frog skin and shiny bees
  { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.0, environment: 0.4, smooth: true, clearcoat: 0.7, sheen: 0.3 },
  // 3 Tournament of the Gods: iridescent highlights
  { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.05, environment: 0.5, smooth: true, clearcoat: 0.9, sheen: 0.5, iridescence: 0.35 },
  // 4 The Underworld: dark and molten, lit by lava
  { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.1, environment: 0.35, smooth: true, clearcoat: 1, sheen: 0.6, iridescence: 0.5 },
];

let environmentMap = null;

/**
 * Tone mapping for a graphics level, and the reflection map for characters. Only characters reflect it
 * (see upgradeMaterial): as `scene.environment` it would light every big floor past the bloom threshold.
 */
export function applyRenderer(level, { renderer, exposure = null }) {
  const look = GFX_LEVELS[level];
  renderer.toneMapping = look.toneMapping;
  renderer.toneMappingExposure = exposure ?? look.exposure;
  if (look.environment && !environmentMap) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    environmentMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
}

const smoothed = new WeakMap();

/**
 * Smooth normals that ignore UV seams: vertices at the same spot share one averaged normal.
 * Turns the faceted models round without changing their shape. Cached per source geometry.
 */
export function smoothGeometry(geometry) {
  if (smoothed.has(geometry)) return smoothed.get(geometry);
  const result = geometry.clone();
  const position = result.attributes.position;
  if (!result.attributes.normal) result.computeVertexNormals();
  const index = result.index;
  const sums = new Map();
  const key = (i) => `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const triangles = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triangles; t++) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    normal.subVectors(c, b).cross(a.sub(b)); // area-weighted
    for (const id of ids) {
      const k = key(id);
      const sum = sums.get(k) ?? sums.set(k, new THREE.Vector3()).get(k);
      sum.add(normal);
    }
  }
  const normals = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const sum = sums.get(key(i));
    normal.copy(sum).normalize().toArray(normals, i * 3);
  }
  result.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  smoothed.set(geometry, result);
  return result;
}

/** A glossier copy of a character material for a graphics level (keeps its current colours). */
export function upgradeMaterial(original, level) {
  const look = GFX_LEVELS[level];
  const material = new THREE.MeshPhysicalMaterial({
    map: original.map,
    color: original.color,
    emissive: original.emissive,
    emissiveIntensity: original.emissiveIntensity ?? 1,
    roughness: original.roughness,
    metalness: original.metalness,
    vertexColors: original.vertexColors,
    transparent: original.transparent,
    opacity: original.opacity,
    clearcoat: look.clearcoat ?? 0,
    clearcoatRoughness: 0.25,
    sheen: look.sheen ?? 0,
    sheenColor: new THREE.Color('#fff2c0'),
    sheenRoughness: 0.5,
    iridescence: look.iridescence ?? 0,
    iridescenceIOR: 1.4,
    envMap: environmentMap,
    envMapIntensity: look.environment,
  });
  material.userData = { ...original.userData };
  return material;
}
