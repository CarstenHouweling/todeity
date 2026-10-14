import * as THREE from 'three';
import { iconTexture } from './Charms.js';
import { additive } from './Ultimates.js';

/**
 * Optional shrines that appear during some waves: risks Tode can choose to take for a reward. Stand on one for a
 * moment to use it. Like the shrines and lunar items of other roguelites, none of them is required.
 */
export const SHRINES = {
  chance: { icon: '🎲', name: 'Shrine of Chance', color: '#ffd36b', hint: 'Offer 1 ♥ for a charm (or nothing…)' },
  bitter: { icon: '⛰️', name: 'Bitter Shrine', color: '#ff5a3d', hint: 'Anger the hive for a bonus Epic brew' },
  cursed: { icon: '🌑', name: 'Cursed Leaves', color: '#b07cff', hint: 'Great power, at a price' },
};

export const SHRINE_RADIUS = 38;
export const SHRINE_HOLD = 0.9; // seconds to stand on a shrine to use it
export const CHANCE_TRIES = 3; // a Shrine of Chance crumbles after this many offerings

/** The shrine's model: a low stone dais Tode stands on, a circle that fills while he does, and its floating icon. */
export function createShrine(scene, type, position) {
  const { color, icon } = SHRINES[type];
  const group = new THREE.Group();
  group.position.copy(position).setZ(0);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(20, 24, 3, 8).rotateX(Math.PI / 2).translate(0, 0, 1.5),
    new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.9, flatShading: true, emissive: color, emissiveIntensity: 0.15 })
  );
  plinth.receiveShadow = true;
  const edge = new THREE.Mesh(new THREE.RingGeometry(SHRINE_RADIUS - 3, SHRINE_RADIUS, 48), additive(color, 0.75));
  edge.position.z = 3.2; // above the dais
  const fill = new THREE.Mesh(new THREE.CircleGeometry(SHRINE_RADIUS - 3, 48), additive(color, 0.3));
  fill.position.z = 3.1;
  fill.scale.setScalar(0.001);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(6, 12, 120, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 60), additive(color, 0.18));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(icon), depthWrite: false, fog: false }));
  sprite.scale.set(26, 26, 1);
  sprite.position.z = 56;
  group.add(plinth, edge, fill, glow, sprite);
  scene.add(group);
  return { type, position: group.position, group, edge, fill, sprite, progress: 0, cooldown: 0, used: false, tries: 0 };
}

export function updateShrine(shrine, delta, time) {
  shrine.sprite.position.z = 56 + Math.sin(time * 2.4) * 3;
  shrine.edge.rotation.z += delta * 0.6;
  shrine.fill.scale.setScalar(Math.max(0.001, shrine.progress));
}

export function disposeShrine(shrine) {
  shrine.group.removeFromParent();
  shrine.group.traverse((child) => {
    if (!child.isSprite) child.geometry?.dispose(); // sprites share one geometry
    child.material?.dispose();
  });
}
