import * as THREE from 'three';

// Keeps a frog readable in a busy fight (v0.29.4). In a playtest Tode vanished inside a boss's shield dome in his
// Golden form, and a beehive between him and the camera hid him completely. Two marks, both only in runs:
// - a silhouette: the frog drawn flat in the player's colour wherever something solid stands in front of him (a
//   prop, a boss, a bee). Each frog mesh gets a child with the same geometry and a `GreaterDepth` material. They draw
//   in the opaque pass after the world (renderOrder 1) and before the frog itself and everything else he carries
//   (renderOrder 2), so they only test against the world, never against his own body, cape or crest.
// - a ring on the ground under him: a dark band with the colour on top, drawn after every other transparent effect
//   (aura, particles, shield domes), so it shows through the glow. It stays on the ground while he hops.

const SOLO_COLOR = '#58e6ff'; // stands out on the lawn, the mountain, marble, the rift and lava alike
const SILHOUETTE_OPACITY = 0.5;
const RING = { inner: 15, outer: 18, edge: 2.5, z: 0.8 };
const WORLD_ORDER = 0;
const SILHOUETTE_ORDER = 1;
const OWN_ORDER = 2; // the frog, his outfit and adornments: after the silhouettes
const RING_ORDER = 30; // after every other transparent effect

export class PlayerBeacon {
  static SOLO_COLOR = SOLO_COLOR;

  /** `player` is a Player (Tode or a co-op puppet); `color` the player's colour (solo: a bright cyan). */
  constructor(player, color = SOLO_COLOR) {
    this.player = player;
    this.model = null;
    this.parts = [];
    this.silhouette = new THREE.MeshBasicMaterial({
      color,
      opacity: SILHOUETTE_OPACITY,
      // Blended by hand: `transparent` would move the meshes into the transparent pass, after the frog.
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      fog: false,
    });

    this.ring = new THREE.Group();
    this.ring.position.z = RING.z;
    const band = (inner, outer, material, order) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), material);
      mesh.renderOrder = order;
      this.ring.add(mesh);
    };
    this.ringMaterials = [
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, fog: false }),
    ];
    band(RING.inner - RING.edge, RING.outer + RING.edge, this.ringMaterials[0], RING_ORDER);
    band(RING.inner, RING.outer, this.ringMaterials[1], RING_ORDER + 1);
    this.ring.visible = false;
    player.group.add(this.ring);
    this.shown = false;
  }

  setColor(color) {
    this.silhouette.color.set(color);
    this.ringMaterials[1].color.set(color);
  }

  /** Every frame: on in runs, off on the title screen, in gardens and in cut-scenes. */
  update(shown) {
    const { player } = this;
    if (player.model !== this.model) this.rebuild();
    if (shown !== this.shown) {
      this.shown = shown;
      for (const part of this.parts) part.visible = shown;
    }
    this.ring.visible = shown && player.group.visible;
    if (!shown) return;
    this.ring.scale.setScalar(player.visualScale);
    // What he carries changes (outfit, crest, halo, a new class): draw it all after the silhouettes.
    player.group.traverse(ownOrder);
  }

  rebuild() {
    for (const part of this.parts) part.removeFromParent();
    this.parts = [];
    this.model = this.player.model;
    if (!this.model) return;
    // The frog's own body (Player.frogMeshes), not the outfit: wearables come and go, and an aura is instanced.
    for (const { mesh } of this.player.frogMeshes) {
      const part = new THREE.Mesh(mesh.geometry, this.silhouette);
      part.userData.silhouette = true;
      part.userData.shared = true; // the frog's own mesh frees the geometry
      part.renderOrder = SILHOUETTE_ORDER;
      part.visible = this.shown;
      mesh.add(part);
      this.parts.push(part);
    }
  }

  dispose() {
    for (const part of this.parts) part.removeFromParent();
    this.parts = [];
    this.ring.removeFromParent();
    for (const mesh of this.ring.children) mesh.geometry.dispose();
    for (const material of [this.silhouette, ...this.ringMaterials]) material.dispose();
  }
}

/**
 * Takes the silhouettes (and the form's rim hulls, FormGlow.js) out of a copy of a frog (the Great Tode, Mirror
 * Tode): they belong to the player only.
 */
export function withoutSilhouette(object) {
  const marks = [];
  object.traverse((child) => (child.userData.silhouette || child.userData.formRim) && marks.push(child));
  for (const mark of marks) mark.removeFromParent();
  return object;
}

function ownOrder(object) {
  if (object.isMesh && object.renderOrder === WORLD_ORDER && !object.userData.silhouette) object.renderOrder = OWN_ORDER;
}
