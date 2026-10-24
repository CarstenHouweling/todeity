import * as THREE from 'three';
import { merge, piece } from './BeeModels.js';
import { upgradeMaterial } from './Graphics.js';
import { sculpt } from './Sculpt.js';

/**
 * Bee-zebub, the final boss: a winged devil. Crimson and muscular, with great curling bone horns, glowing eyes and a
 * fanged grin, goat legs on cloven hooves, bat wings with glowing veins, a whip of a tail with a spade at its end and
 * a hellfire trident. The bee in him: black-and-gold banded belt and bracers, and stripes on his tail.
 *
 * Built Y-up facing +Z at about the size of a drone (like `buildBee`); the Enemy scales and turns him. He is built
 * whatever the graphics level (it is one model, so Low only gets fewer segments and plain materials). The parts that
 * move are separate meshes on pivots: he hovers, flaps, swishes his tail, raises the trident when he winds up an
 * attack, leans into charges, slumps when staggered and tumbles when he falls.
 */

const COLORS = {
  skin: '#b3181c',
  shade: '#6e0a0e',
  dark: '#1c0606',
  fur: '#2a0d0a',
  hoof: '#120606',
  hornBase: '#2a1210',
  hornTip: '#f0e2bf',
  bone: '#e6d6b0',
  gold: '#e0a526',
  black: '#140a08',
  iron: '#34303a',
  membrane: '#4a0608',
  membraneEdge: '#1e0204',
  fire: '#ff7a1a',
  eye: '#ffd23f',
  ember: '#ff4a10',
};

const tmp = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** A tapered cylinder from `a` to `b` (radius `r0` at a, `r1` at b), with round joints if `joints`. */
function limb(pieces, a, b, r0, r1, color, seg, joints = true) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const length = start.distanceTo(end);
  const geometry = new THREE.CylinderGeometry(r1, r0, length, seg, 1, true).translate(0, length / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, end.clone().sub(start).normalize()));
  geometry.translate(start.x, start.y, start.z);
  pieces.push(piece(geometry, color));
  if (joints) {
    pieces.push(piece(new THREE.SphereGeometry(r0, seg, Math.max(4, seg >> 1)), color, { position: a }));
    pieces.push(piece(new THREE.SphereGeometry(r1, seg, Math.max(4, seg >> 1)), color, { position: b }));
  }
}

/** A curling horn: a tube along `points` that tapers from `r0` to `r1`, dark at the root and bone at the tip. */
function horn(points, r0, r1, seg) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const rings = 18;
  const geometry = new THREE.TubeGeometry(curve, rings, r0, seg, false);
  const position = geometry.attributes.position;
  const along = new Float32Array(position.count);
  const center = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    curve.getPointAt(t, center);
    const k = THREE.MathUtils.lerp(1, r1 / r0, t ** 0.8);
    for (let j = 0; j <= seg; j++) {
      const index = i * (seg + 1) + j;
      vertex.fromBufferAttribute(position, index).sub(center).multiplyScalar(k).add(center);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
      along[index] = t;
    }
  }
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
  geometry.computeVertexNormals();
  const g = piece(geometry, COLORS.hornBase);
  // Ridged: darker rings near the root, fading to bone.
  const colors = g.attributes.color;
  const base = new THREE.Color(COLORS.hornBase);
  const tip = new THREE.Color(COLORS.hornTip);
  for (let i = 0; i < colors.count; i++) {
    const t = g.attributes.along.getX(i);
    const ridge = t < 0.75 && Math.sin(t * 60) > 0.6 ? 0.82 : 1;
    tmp.copy(base).lerp(tip, Math.min(1, t * 1.25)).multiplyScalar(ridge);
    colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  g.deleteAttribute('along');
  return g;
}

/** A flat shape extruded and placed like a piece. */
function slab(shape, depth, color, transform) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 1, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return piece(geometry, color, transform);
}

/** The devil's tail tip: a spade, pointing along +Y in its own plane. */
function spadeShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.7);
  shape.quadraticCurveTo(1.1, -0.4, 2.2, 1.1);
  shape.quadraticCurveTo(1.6, 2.6, 0, 4.6);
  shape.quadraticCurveTo(-1.6, 2.6, -2.2, 1.1);
  shape.quadraticCurveTo(-1.1, -0.4, 0, 0.7);
  return shape;
}

/**
 * A bat wing reaching out along +X from its root (side = 1; the left one is built mirrored): an arm bone to the wrist,
 * four fingers fanning out, and a scalloped membrane between them. Returns `{ bones, membrane, veins }`.
 */
function batWing(side, seg) {
  const wrist = [9.5, 6.5, -2.2];
  const tips = [
    [13, 14.5, -3.4],
    [20, 9, -4.2],
    [21, 1.5, -3.8],
    [15, -4.5, -3],
  ];
  const lower = [3, -5.5, -1.6]; // where the membrane meets the back
  const mirror = ([x, y, z]) => [x * side, y, z];
  const bones = [];
  const veins = [];
  limb(bones, [0, 0, 0], mirror(wrist), 0.5, 0.38, COLORS.dark, seg);
  for (const [i, tipPoint] of tips.entries()) {
    limb(bones, mirror(wrist), mirror(tipPoint), 0.42, 0.14, COLORS.dark, Math.max(4, seg >> 1), false);
    // A glowing vein down the middle of each finger.
    const mid = tipPoint.map((v, k) => wrist[k] + (v - wrist[k]) * 0.55);
    limb(veins, mirror(wrist), mirror(mid), 0.16, 0.05, COLORS.ember, 4, false);
    if (i === 0) bones.push(piece(new THREE.ConeGeometry(0.5, 2.4, 6), COLORS.bone, { position: mirror([wrist[0], wrist[1] + 1.2, wrist[2]]), rotation: [0, 0, -side * 0.3] }));
  }

  // Membrane: a fan from the wrist over the outline root → finger tips (scalloped in between) → back.
  const outline = [mirror(tips[0])];
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1];
    const b = tips[i];
    const between = a.map((v, k) => (v + b[k]) / 2);
    // Pulled toward the wrist: the scallop.
    outline.push(mirror(between.map((v, k) => v + (wrist[k] - v) * 0.3)), mirror(b));
  }
  outline.push(mirror(tips[3].map((v, k) => (v + lower[k]) / 2 + (wrist[k] - (v + lower[k]) / 2) * 0.25)), mirror(lower), [0, 0, 0]);
  const w = mirror(wrist);
  const positions = [];
  const colors = [];
  const near = new THREE.Color(COLORS.membrane);
  const edge = new THREE.Color(COLORS.membraneEdge);
  const push = (p, t) => {
    positions.push(...p);
    tmp.copy(near).lerp(edge, t);
    colors.push(tmp.r, tmp.g, tmp.b);
  };
  for (let i = 0; i < outline.length - 1; i++) {
    push(w, 0);
    push(outline[i], 1);
    push(outline[i + 1], 1);
  }
  // From the root to the top finger as well, so the leading edge is closed.
  push(w, 0);
  push([0, 0, 0], 0.3);
  push(mirror(tips[0]), 1);
  const membrane = new THREE.BufferGeometry();
  membrane.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  membrane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  membrane.computeVertexNormals();
  return { bones: merge(bones), membrane, veins: merge(veins) };
}

/** Gives every piece a `glow` attribute (0 unless it has one: the sculpted cracks), so they merge into one mesh. */
function mergeLit(pieces) {
  for (const g of pieces) if (!g.attributes.glow) g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return merge(pieces);
}

/** Distance from (x, y) to the nearest of `segments` ([[x0, y0, x1, y1], …]). */
function nearestSegment(segments, x, y) {
  let best = Infinity;
  for (const [x0, y0, x1, y1] of segments) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const h = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - x0 - dx * h, y - y0 - dy * h));
  }
  return best;
}

// Cracks of hellfire across his chest (from the burning heart) and down his back, as lines seen from the front/back.
const CHEST_CRACKS = [
  [0, 16.4, -1.2, 17.6], [-1.2, 17.6, -2.9, 18.1], [-1.2, 17.6, -1.6, 18.9], [0, 16.4, 1.1, 17.5], [1.1, 17.5, 2.8, 17.9],
  [1.1, 17.5, 1.7, 18.8], [0, 16.4, -0.7, 15.1], [-0.7, 15.1, -2.2, 14.3], [0, 16.4, 0.8, 15], [0.8, 15, 2.1, 14.1],
  [0, 16.4, 0.1, 14.6], [0.1, 14.6, -0.2, 12.6],
];
const BACK_CRACKS = [
  [0, 19, 0.3, 17], [0.3, 17, -0.3, 15], [-0.3, 15, 0.2, 13], [0.3, 17, 2.4, 16.2], [-0.3, 15, -2.3, 14.4], [0, 18.6, -2.6, 18.4], [0.2, 13, 1.8, 12.3],
];

/** The ripple of shaggy goat fur (thighs and the loincloth). */
const shag = (x, y, z) => 0.16 * Math.sin(x * 3.1 + y * 1.3) * Math.sin(y * 2.7 + z * 1.9) * Math.sin(z * 3.3 + x * 1.1);

function buildGeometry(seg, cell) {
  const half = Math.max(5, seg >> 1);
  const ember = new THREE.Color(COLORS.ember);
  const core = new THREE.Color(COLORS.eye);
  const char = new THREE.Color(COLORS.black);

  // The torso: one sculpted body (hips in a fur loincloth, a V of obliques and abs, a broad ribcage with pecs and
  // lats, huge shoulders, traps and a thick neck) with glowing cracks.
  const torso = [];
  const torsoGlow = [];
  const crackAt = (x, y, z) => (z > 0.6 ? nearestSegment(CHEST_CRACKS, x, y) : z < -0.6 ? nearestSegment(BACK_CRACKS, x, y) : Infinity);
  const shapes = [
    { ellipsoid: [0, 10.7, 0], radii: [3.7, 2.4, 2.9], color: COLORS.fur },
    { capsule: [[0, 11.8, 0.2], [0, 14.6, 0.4]], radius: 2.6, color: COLORS.skin, blend: 1.2 },
    { ellipsoid: [0, 16.6, 0.1], radii: [4.6, 3.3, 3.1], color: COLORS.skin, blend: 1.6 },
    { ellipsoid: [0, 18.6, -0.4], radii: [3.6, 1.6, 2.4], color: COLORS.skin, blend: 1.2 },
    { capsule: [[0, 18.8, 0], [0, 20.6, 0.4]], radius: 1.7, color: COLORS.skin, blend: 0.9 },
  ];
  for (const side of [-1, 1]) {
    shapes.push(
      { ellipsoid: [side * 2.5, 15.8, -0.9], radii: [2.3, 3.3, 2.1], color: COLORS.skin, blend: 1.2 },
      { ellipsoid: [side * 1.95, 17.25, 1.95], radii: [2.25, 1.55, 1.25], color: COLORS.skin, blend: 0.5 },
      { ellipsoid: [side * 5.2, 18, 0], radii: [2.3, 2.5, 2.3], color: COLORS.skin, blend: 1 },
      { capsule: [[side * 0.8, 19.7, -0.6], [side * 4, 18.9, -0.4]], radius: 1.3, color: COLORS.skin, blend: 1.2 }
    );
    for (let row = 0; row < 3; row++) shapes.push({ ellipsoid: [side * 0.95, 12.5 + row * 1.2, 2.3 + row * 0.12], radii: [0.85, 0.62, 0.55], color: COLORS.skin, blend: 0.35 });
  }
  torso.push(
    sculpt(shapes, {
      cell,
      carve: (x, y, z, d) => (y < 12.4 ? d - shag(x, y, z) : d),
      paint: (x, y, z, color) => {
        if (y >= 12.4) color.lerp(tmp.set(COLORS.shade), Math.min(1, Math.max(0, (13.6 - y) / 3)) * 0.5 + Math.max(0, -z - 1) * 0.12); // darker toward the belt and the back
        const crack = crackAt(x, y, z);
        if (crack < 0.55) color.lerp(char, (1 - crack / 0.55) * 0.75); // charred round the cracks
        if (crack < 0.17) color.copy(ember).lerp(core, Math.max(0, 1 - crack / 0.09));
      },
      glow: (x, y, z) => Math.min(1, Math.max(0, 1.5 - crackAt(x, y, z) / 0.12)),
    })
  );
  // The bee's banded belt with a gold buckle and a burning gem.
  for (const [i, color] of [COLORS.gold, COLORS.black, COLORS.gold].entries()) {
    torso.push(piece(new THREE.TorusGeometry(3.3 - i * 0.08, 0.42, 6, seg * 2), color, { position: [0, 11.6 + i * 0.75, 0.2], rotation: [Math.PI / 2, 0, 0], scale: [1.08, 0.86, 1] }));
  }
  torso.push(piece(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 6), COLORS.gold, { position: [0, 12.35, 3.05], rotation: [Math.PI / 2, 0, 0] }));
  torsoGlow.push(piece(new THREE.OctahedronGeometry(0.6, 0), COLORS.fire, { position: [0, 12.35, 3.4], scale: [1, 1.3, 0.6] }));
  for (const side of [-1, 1]) {
    // Spiked iron pauldrons with a gold rim.
    torso.push(piece(new THREE.SphereGeometry(2.8, seg, half, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.iron, { position: [side * 5.4, 18.8, 0], scale: [1, 0.75, 1.05] }));
    torso.push(piece(new THREE.TorusGeometry(2.75, 0.25, 5, seg), COLORS.gold, { position: [side * 5.4, 18.8, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1.05, 1] }));
    for (let i = 0; i < 3; i++) {
      torso.push(piece(new THREE.ConeGeometry(0.6, 3, half), COLORS.bone, { position: [side * (4.6 + i * 0.9), 20.9 - i * 0.3, -0.6 + i * 0.6], rotation: [0, 0, -side * (0.25 + i * 0.3)] }));
    }
  }
  // Spikes down the spine (the camera looks down on his back a lot).
  for (let i = 0; i < 5; i++) {
    torso.push(piece(new THREE.ConeGeometry(0.6 - i * 0.06, 2.4 - i * 0.2, half), COLORS.bone, { position: [0, 19.2 - i * 1.7, -3.1 + i * 0.25], rotation: [-1.15, 0, 0] }));
  }
  torsoGlow.push(piece(new THREE.SphereGeometry(0.8, half, 4), COLORS.eye, { position: [0, 16.4, 3.05], scale: [1, 1.25, 0.5] })); // the burning heart

  // Head (around its own pivot at the neck): a sculpted skull with a heavy scowling brow, cheekbones, a square jaw,
  // pointed ears, burning eyes deep in their sockets and a grin that glows from inside.
  const head = [];
  const headGlow = [];
  const sockets = [-1, 1].map((side) => [side * 0.95, 2.6, 2.7]);
  const mouth = { center: [0, 1.05, 2.75], half: [1.05, 0.17, 1] };
  const boxDistance = ({ center, half: h }, x, y, z) => {
    const qx = Math.abs(x - center[0]) - h[0];
    const qy = Math.abs(y - center[1]) - h[1];
    const qz = Math.abs(z - center[2]) - h[2];
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  };
  const headShapes = [
    { ellipsoid: [0, 2.5, 0.2], radii: [2.3, 2.5, 2.5], color: COLORS.skin },
    { ellipsoid: [0, 1, 1.4], radii: [1.95, 1.25, 1.8], color: COLORS.skin, blend: 1 },
    { ellipsoid: [0, 0.3, 2.45], radii: [0.85, 0.65, 0.65], color: COLORS.skin, blend: 0.6 },
    { capsule: [[0, 2.65, 2.6], [0, 1.95, 3.25]], radius: 0.38, color: COLORS.skin, blend: 0.4 },
    { capsule: [[0, 0.05, 2.6], [0, -0.95, 3.05]], radius: 0.3, color: COLORS.black, blend: 0.15 },
  ];
  for (const side of [-1, 1]) {
    headShapes.push(
      { capsule: [[side * 1.9, 3.45, 2], [side * 0.15, 2.95, 2.7]], radius: 0.5, color: COLORS.shade, blend: 0.5 },
      { ellipsoid: [side * 1.45, 1.75, 1.95], radii: [0.85, 0.5, 0.75], color: COLORS.skin, blend: 0.6 },
      { capsule: [[side * 2, 2.5, 0.2], [side * 3.4, 3.4, -0.4]], radius: 0.45, color: COLORS.skin, blend: 0.5 },
      { capsule: [[side * 3.4, 3.4, -0.4], [side * 4.1, 4.1, -0.7]], radius: 0.2, color: COLORS.skin, blend: 0.4 }
    );
  }
  head.push(
    sculpt(headShapes, {
      cell: cell * 0.7,
      carve: (x, y, z, d) => {
        let carved = Math.max(d, -boxDistance(mouth, x, y, z));
        for (const [cx, cy, cz] of sockets) carved = Math.max(carved, 0.5 - Math.hypot(x - cx, (y - cy) * 1.4, z - cz));
        return carved;
      },
      paint: (x, y, z, color) => {
        if (boxDistance(mouth, x, y, z) < 0.15) color.set(COLORS.fire);
      },
      glow: (x, y, z) => (boxDistance(mouth, x, y, z) < 0.15 ? 1 : 0),
    })
  );
  for (const side of [-1, 1]) {
    headGlow.push(piece(new THREE.SphereGeometry(0.45, half, 4), COLORS.eye, { position: [side * 0.95, 2.6, 2.55], scale: [1.4, 0.65, 0.6], rotation: [0, 0, side * 0.3] }));
    // Fangs over the glowing grin, and great ram horns (with fire at their tips).
    head.push(piece(new THREE.ConeGeometry(0.2, 0.95, 5), COLORS.bone, { position: [side * 0.55, 0.85, 3.5], rotation: [Math.PI + 0.1, 0, 0] }));
    head.push(piece(new THREE.ConeGeometry(0.14, 0.6, 5), COLORS.bone, { position: [side * 0.25, 1.15, 3.6], rotation: [0.1, 0, 0] }));
    head.push(horn([[side * 1.3, 3.8, 0.4], [side * 3.2, 4.8, -0.1], [side * 5, 5.6, -0.7], [side * 6.4, 7.8, -0.3], [side * 6.2, 10.4, 0.8], [side * 5, 11.8, 2.2], [side * 4.2, 11.2, 3.2]], 1.2, 0.1, Math.max(6, half)));
    headGlow.push(piece(new THREE.ConeGeometry(0.4, 1.8, 6), COLORS.fire, { position: [side * 4.1, 11.9, 3.4], rotation: [0.3, 0, side * 0.2] }));
    // The bee in him: two antennae curling forward from his brow, embers at their tips.
    limb(head, [side * 0.45, 4.3, 1.6], [side * 0.9, 6, 2.6], 0.17, 0.13, COLORS.black, 5, false);
    limb(head, [side * 0.9, 6, 2.6], [side * 1.6, 6.8, 4], 0.13, 0.09, COLORS.black, 5, false);
    headGlow.push(piece(new THREE.SphereGeometry(0.32, 6, 4), COLORS.ember, { position: [side * 1.6, 6.8, 4] }));
  }
  // His true form's crown of hellfire (hidden until then).
  const crown = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    crown.push(piece(new THREE.ConeGeometry(0.55, 2.6 + (i % 2) * 1.4, half), i % 2 ? COLORS.eye : COLORS.fire, { position: [Math.cos(angle) * 2, 6 + (i % 2) * 0.6, 0.5 + Math.sin(angle) * 2] }));
  }

  // Arms: upper arm on the shoulder pivot, forearm on the elbow pivot, sculpted muscle. Banded bracers, clawed hands.
  const upperArm = {};
  const forearm = {};
  for (const side of [-1, 1]) {
    upperArm[side] = mergeLit([
      sculpt(
        [
          { ellipsoid: [0, -0.1, 0], radii: [1.9, 1.7, 1.8], color: COLORS.skin },
          { capsule: [[0, 0, 0], [side * 0.6, -4.6, 0.2]], radius: 1.25, color: COLORS.skin, blend: 0.9 },
          { ellipsoid: [side * 0.25, -2.2, 0.8], radii: [1.15, 1.65, 1.05], color: COLORS.skin, blend: 0.8 },
          { ellipsoid: [side * 0.45, -1.8, -0.7], radii: [1, 1.55, 0.95], color: COLORS.skin, blend: 0.8 },
        ],
        { cell: cell * 0.8 }
      ),
    ]);
    const lower = [
      sculpt(
        [
          { capsule: [[0, 0.2, 0], [0, -4, 0.6]], radius: 1, color: COLORS.skin },
          { ellipsoid: [0, -1.1, 0.2], radii: [1.3, 1.6, 1.2], color: COLORS.skin, blend: 0.8 },
          { ellipsoid: [0, -4.7, 0.85], radii: [1.05, 1.15, 0.8], color: COLORS.skin, blend: 0.5 },
        ],
        { cell: cell * 0.8 }
      ),
    ];
    for (const [i, color] of [COLORS.gold, COLORS.black, COLORS.gold, COLORS.black].entries()) {
      lower.push(piece(new THREE.CylinderGeometry(1.32, 1.32, 0.55, seg), color, { position: [0, -1.9 - i * 0.55, 0.3 + i * 0.08], rotation: [0.15, 0, 0] }));
    }
    for (let i = 0; i < 4; i++) {
      lower.push(piece(new THREE.ConeGeometry(0.22, 1.3, 5), COLORS.black, { position: [(i - 1.5) * 0.55, -5.6, 1.4], rotation: [0.9, 0, (i - 1.5) * 0.15] }));
    }
    forearm[side] = mergeLit(lower);
  }

  // Goat legs: shaggy thighs, backward-bent hocks with a tuft of fur, cloven hooves.
  const legs = {};
  for (const side of [-1, 1]) {
    const knee = [side * 0.3, -3.6, 1.7];
    const hock = [side * 0.25, -6.6, -1.1];
    const fetlock = [side * 0.25, -8.9, -0.3];
    const leg = [
      sculpt(
        [
          { ellipsoid: [side * 0.2, -1.6, 0.8], radii: [2.1, 3, 2.3], color: COLORS.fur },
          { capsule: [knee, hock], radius: 0.85, color: COLORS.shade, blend: 0.9 },
          { ellipsoid: [side * 0.28, -4.6, 0.5], radii: [1.1, 1.5, 1.2], color: COLORS.shade, blend: 0.8 },
          { capsule: [hock, fetlock], radius: 0.58, color: COLORS.shade, blend: 0.5 },
          { ellipsoid: [hock[0], hock[1] + 0.2, hock[2] - 0.2], radii: [0.95, 0.85, 0.95], color: COLORS.fur, blend: 0.5 },
        ],
        { cell: cell * 0.8, carve: (x, y, z, d) => (y > -3.4 || Math.hypot(y - hock[1], z - hock[2]) < 1.2 ? d - shag(x, y, z) * 1.3 : d) }
      ),
    ];
    for (const toe of [-1, 1]) {
      leg.push(piece(new THREE.CylinderGeometry(0.45, 0.62, 1.2, half), COLORS.hoof, { position: [fetlock[0] + toe * 0.33, fetlock[1] - 0.8, fetlock[2] + 0.35], rotation: [0.25, 0, 0] }));
    }
    legs[side] = mergeLit(leg);
  }

  // Tail: tapering segments with the bee's stripes, and the spade.
  const tailSegments = [];
  for (let i = 0; i < TAIL.length; i++) {
    const r0 = 0.85 - i * 0.09;
    const r1 = 0.85 - (i + 1) * 0.09;
    const segment = [];
    limb(segment, [0, 0, 0], [0, 0, -TAIL_LENGTH], r0, r1, i % 2 ? COLORS.black : COLORS.skin, half);
    tailSegments.push(mergeLit(segment));
  }
  const spade = [slab(spadeShape(), 0.45, COLORS.black, { rotation: [-Math.PI / 2, 0, 0], position: [0, 0, -0.2] })];

  // The trident, held in the right hand: an iron shaft, a golden crossguard, three barbed prongs with burning tips.
  const trident = [];
  const tridentGlow = [];
  limb(trident, [0, -7, 0], [0, 17, 0], 0.5, 0.5, COLORS.iron, half, false);
  trident.push(piece(new THREE.SphereGeometry(0.9, half, 4), COLORS.gold, { position: [0, -7.2, 0] }));
  trident.push(piece(new THREE.BoxGeometry(7, 0.9, 0.9), COLORS.gold, { position: [0, 17.2, 0] }));
  for (const x of [-3.1, 0, 3.1]) {
    const length = x ? 5 : 6.4;
    limb(trident, [x, 17.4, 0], [x * 1.05, 17.4 + length, 0], 0.48, 0.4, COLORS.iron, half, false);
    tridentGlow.push(piece(new THREE.ConeGeometry(0.8, 2.8, half), COLORS.fire, { position: [x * 1.05, 17.4 + length + 1.3, 0] }));
    // A barb on each prong.
    trident.push(piece(new THREE.ConeGeometry(0.4, 1.5, 4), COLORS.iron, { position: [x * 1.05 + (x <= 0 ? -0.45 : 0.45), 17.4 + length - 1, 0], rotation: [0, 0, x <= 0 ? 2.6 : -2.6] }));
  }

  const wings = { 1: batWing(1, half), [-1]: batWing(-1, half) };
  for (const side of [-1, 1]) wings[side].bones = mergeLit([wings[side].bones]);
  return {
    torso: mergeLit(torso),
    torsoGlow: merge(torsoGlow),
    head: mergeLit(head),
    headGlow: merge(headGlow),
    crown: merge(crown),
    upperArm,
    forearm,
    legs,
    tailSegments,
    spade: mergeLit(spade),
    trident: mergeLit(trident),
    tridentGlow: merge(tridentGlow),
    wings,
    fireball: new THREE.IcosahedronGeometry(1.5, 1),
  };
}

// The tail's resting curl: each segment's bend (down from the hips, then up and back) and its length.
const TAIL = [-0.75, 0.2, 0.35, 0.35, 0.3, 0.25, 0.15];
const TAIL_LENGTH = 2.6;

const geometryCache = new Map();
let glowMaterial = null;
let fireMaterial = null;

const mesh = (geometry, material, shadow = false) => {
  const m = new THREE.Mesh(geometry, material);
  m.userData.shared = true; // cached geometry; the per-boss materials are disposed through `materials`
  m.castShadow = shadow;
  return m;
};

/** Eases `value` toward `target` at `rate` per second. */
const ease = (value, target, rate, delta) => value + (target - value) * (1 - Math.exp(-rate * delta));

/**
 * The devil's skin draws vertices marked `glow` (the cracks, the grin) as burning light that throbs with `pulse`, and
 * a red rim of hellfire round his outline so he stands out from the Underworld's dark floor.
 */
function emberShader(material, pulse) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPulse = pulse;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uPulse;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 emberLight = vColor.rgb * vGlow * (1.1 + 0.45 * uPulse);\ndiffuseColor.rgb *= 1.0 - vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += emberLight;
totalEmissiveRadiance += vec3(1.0, 0.18, 0.02) * 0.45 * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * (1.0 - vGlow);`
      );
  };
  material.customProgramCacheKey = () => 'devil-ember';
  return material;
}

/** Geometry detail per graphics level: segments of the primitives, and the sculpting grid (smaller: finer). */
const detailFor = (level) => (level >= 3 ? { seg: 14, cell: 0.24 } : level > 0 ? { seg: 12, cell: 0.3 } : { seg: 9, cell: 0.42 });

const partsFor = (level) => {
  const { seg, cell } = detailFor(level);
  if (!geometryCache.has(seg)) geometryCache.set(seg, buildGeometry(seg, cell));
  return geometryCache.get(seg);
};

/** Sculpts him ahead of time (in an idle moment), so his entrance doesn't hitch. */
export function prepareDevil(level) {
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 50)))(() => partsFor(level));
}

/** Builds the devil: `{ root, materials, animate(time, delta, enemy) }`, like `buildBee`. */
export function buildDevil(level) {
  const parts = partsFor(level);
  glowMaterial ??= new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.35, 1.35, 1.35) });
  fireMaterial ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.42, 0.08) });

  let surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  if (level > 0) {
    surface = upgradeMaterial(surface, level);
    surface.iridescence = 0; // a devil, not a beetle
    surface.sheenColor.set('#ff6040');
  }
  const pulse = { value: 0 };
  emberShader(surface, pulse);
  // Goat fur is matte (the skin's clearcoat made his thighs look wet).
  const fur = emberShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), pulse);
  const membrane = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.94 });

  const root = new THREE.Group();
  const inner = new THREE.Group(); // hovers, leans and tumbles
  root.add(inner);
  inner.add(mesh(parts.torso, surface, true), mesh(parts.torsoGlow, glowMaterial));

  const head = new THREE.Group();
  head.position.set(0, 19.8, 0.3);
  head.add(mesh(parts.head, surface, true), mesh(parts.headGlow, glowMaterial));
  const crown = mesh(parts.crown, glowMaterial);
  crown.visible = false;
  head.add(crown);
  inner.add(head);

  const arms = {};
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 5.6, 18, 0);
    shoulder.add(mesh(parts.upperArm[side], surface, true));
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.6, -4.6, 0.2);
    elbow.add(mesh(parts.forearm[side], surface));
    shoulder.add(elbow);
    inner.add(shoulder);
    arms[side] = { shoulder, elbow };
  }
  // The trident in his right hand (+X), the fireball over his left palm.
  const trident = new THREE.Group();
  trident.position.set(0, -4.6, 1.1);
  trident.add(mesh(parts.trident, surface, true), mesh(parts.tridentGlow, glowMaterial));
  arms[1].elbow.add(trident);
  const fireball = mesh(parts.fireball, fireMaterial);
  fireball.position.set(0, -4.4, 3.4);
  arms[-1].elbow.add(fireball);

  const legs = {};
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 2.2, 10.4, 0);
    hip.add(mesh(parts.legs[side], fur));
    inner.add(hip);
    legs[side] = hip;
  }

  const tail = [];
  let parent = inner;
  let joint = [0, 10.2, -2.4];
  for (const [i, geometry] of parts.tailSegments.entries()) {
    const segment = new THREE.Group();
    segment.position.set(...joint);
    segment.add(mesh(geometry, surface));
    parent.add(segment);
    tail.push(segment);
    parent = segment;
    joint = [0, 0, -TAIL_LENGTH];
    if (i === parts.tailSegments.length - 1) {
      const spade = mesh(parts.spade, surface);
      spade.position.set(0, 0, -TAIL_LENGTH);
      segment.add(spade);
    }
  }

  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.8, 17.6, -2.7);
    const { bones, membrane: skin, veins } = parts.wings[side];
    pivot.add(mesh(bones, surface), mesh(skin, membrane), mesh(veins, glowMaterial));
    inner.add(pivot);
    wings.push({ pivot, side });
  }

  const pose = { raise: 0, lean: 0, slump: 0 };
  return {
    root,
    materials: [surface, fur, membrane],
    height: 27, // hooves to brow while hovering (the horns and the trident reach higher)
    animate(time, delta, enemy) {
      const rate = enemy.isFrozen ? 0 : enemy.speedFactor * (enemy.enraged ? 1.5 : 1);
      enemy.flapTime = (enemy.flapTime ?? Math.random() * 10) + delta * rate;
      const t = enemy.flapTime;
      // Poses ease in and out: the trident goes up while he winds up an attack, he leans into a charge, a stagger
      // slumps him.
      pose.raise = ease(pose.raise, enemy.glow > 0.3 && !enemy.dying ? 1 : 0, 7, delta);
      pose.lean = ease(pose.lean, enemy.ai?.mode === 'charge' ? 1 : 0, 6, delta);
      pose.slump = ease(pose.slump, enemy.ai?.staggerLeft > 0 ? 1 : 0, 5, delta);
      const { raise, lean, slump } = pose;
      // The cracks in his skin throb like a heartbeat, harder while he winds up and in his true form.
      pulse.value = Math.max(0, Math.sin(t * 3.2)) ** 3 + raise * 0.6;
      // The true form (see riseAgain in main.js): a crown of hellfire, bigger wings, a bigger fireball.
      const blazing = Boolean(enemy.ai?.trueForm);
      crown.visible = blazing;
      if (blazing) {
        crown.rotation.y = t * 1.5;
        crown.scale.set(1, 1 + Math.sin(t * 11) * 0.12, 1);
      }

      inner.position.y = 1.6 + Math.sin(t * 2.2) * 1.3 - slump * 1.4;
      inner.rotation.x = lean * 0.5 + slump * 0.3 - raise * 0.12;
      head.rotation.x = slump * 0.5 - raise * 0.35 + Math.sin(t * 1.1) * 0.05;
      head.rotation.y = Math.sin(t * 0.7) * 0.18;

      // Right arm: trident held up at his side, raised high to strike. Left arm: the fireball held forward.
      const right = arms[1];
      right.shoulder.rotation.x = THREE.MathUtils.lerp(-0.35 + Math.sin(t * 2.2) * 0.06, -2.5, raise) + slump * 0.4;
      right.shoulder.rotation.z = 0.18 + raise * 0.1;
      right.elbow.rotation.x = THREE.MathUtils.lerp(-0.85, -0.25, raise);
      // The trident stands upright at his side and points forward over his head when raised.
      trident.rotation.x = THREE.MathUtils.lerp(0.1, 1, raise) - right.shoulder.rotation.x - right.elbow.rotation.x;
      const left = arms[-1];
      left.shoulder.rotation.x = THREE.MathUtils.lerp(-0.45 + Math.sin(t * 2.2 + 1) * 0.06, -1.35, raise) + slump * 0.5;
      left.shoulder.rotation.z = -0.22;
      left.elbow.rotation.x = THREE.MathUtils.lerp(-1.25, -0.5, raise) + slump * 0.6;
      fireball.scale.setScalar((1 + Math.sin(t * 9) * 0.12 + raise * 0.7) * (1 - slump * 0.6) * (blazing ? 1.3 : 1));
      fireball.rotation.y += delta * 3;

      // Goat legs dangle and kick while he hovers; they trail behind in a charge.
      for (const side of [-1, 1]) legs[side].rotation.x = 0.15 + Math.sin(t * 2.2 + side) * 0.12 + lean * 0.6;

      // The tail swishes from the root to the spade.
      tail.forEach((segment, i) => {
        segment.rotation.x = TAIL[i] + Math.sin(t * 1.8 - i * 0.5) * 0.08 - (i === 0 ? slump * 0.3 : 0);
        segment.rotation.y = Math.sin(t * 2.4 - i * 0.6) * (0.22 + lean * 0.1);
      });

      // Slow, heavy wingbeats; swept back in a charge, drooping when staggered.
      const flap = Math.sin(t * 4.5);
      for (const { pivot, side } of wings) {
        pivot.scale.setScalar(blazing ? 1.4 : 1.15);
        pivot.rotation.z = side * (0.2 + flap * 0.42 - slump * 0.5);
        pivot.rotation.y = side * (0.35 + lean * 0.55 + flap * 0.12);
      }

      if (enemy.dying) {
        // He falls out of the air, wings folding.
        inner.rotation.z += delta * 2.4;
        inner.rotation.x += delta * 1.2;
        for (const { pivot, side } of wings) pivot.rotation.z = side * -0.7;
      }
    },
  };
}
