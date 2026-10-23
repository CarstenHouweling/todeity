import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { upgradeMaterial } from './Graphics.js';
import { sculpt } from './Sculpt.js';

/**
 * Procedural bees for every arena (Low quality keeps the original glTF bee everywhere). Whatever the arena, they
 * must still read as bees from the high gameplay camera (testers called the old Underworld ones bats): every bee has
 * bold stripes on its abdomen and see-through, veined insect wings. Only the boss queens keep their special wings
 * (the Seraph's feathers, Bee-zebub's demon wings); `bugWing` is a style's colour for the insect wings.
 * Every arena has its own species, built from smooth primitives with more detail each arena:
 *   0 Tode's Garden   – chubby honeybees sculpted from soft shapes (Sculpt.js: one seamless furry body and a
 *                       grooved, striped abdomen), a fluffy collar, glossy eyes with a sparkle, stripes in their kind's
 *                       colour; Queen Buzzbelle has a crown, an ermine ruff, a cape and a honeycomb sceptre
 *   1 Sage Mountain   – armoured ronin hornets with kabuto helmets and amber wings
 *   2 Sky Citadel     – golden seraph bees in royal blue, with halos and feathered wings
 *   3 Tournament      – obsidian void wasps with glowing crystals and orbiting shards
 *   4 The Underworld  – charred demon hornets with horns, spikes, lava veins and bat wings
 * Bosses get their own regalia (a jewelled crown and ruff, a shogun's crest and banner, six seraph wings, a crystal
 * crown, demon horns).
 *
 * Models are built Y-up facing +Z at the size of a drone (like the glTF bee); the Enemy scales and turns them.
 * Geometry is cached per kind and style; materials for the body are per bee (hit flashes), the rest shared.
 */

export const STYLES = {
  0: {
    shell: '#2a1c14', shade: '#1e1410', armor: '#ffc21a', trim: '#ffd23f', band: '#ffc21a', eye: '#1a1210',
    wing: '#eaf8ff', wingOpacity: 0.5, wings: 'insect', flap: 28, roughness: 0.6, metalness: 0,
    fuzz: '#ffe07a', face: '#f0a818', garden: true, sculpted: true, rim: 0.4, goldFirst: true, chubby: 1.12, // (a golden face, so the dark eyes show)
  },
  1: {
    shell: '#1c1414', shade: '#2a1c18', armor: '#b8322a', trim: '#d9b25a', band: '#f0a020', eye: '#ffc23f',
    wing: '#ffcf80', wingOpacity: 0.42, wings: 'insect', flap: 26, roughness: 0.35, metalness: 0.3,
  },
  2: {
    shell: '#d9a23a', shade: '#3a4a8a', armor: '#2f4fb0', trim: '#fff1b8', band: '#1e2440', eye: '#7fd8ff',
    wing: '#ffffff', wingOpacity: 0.95, wings: 'feather', flap: 9, roughness: 0.25, metalness: 0.15,
    bugWing: '#fff6d8', bugWingOpacity: 0.5,
  },
  3: {
    shell: '#16121f', shade: '#241c34', armor: '#3a2a5a', trim: '#7ff9ff', band: '#ffd23f', eye: '#d070ff',
    wing: '#9ff4ff', wingOpacity: 0.38, wings: 'insect', flap: 30, roughness: 0.15, metalness: 0.6,
  },
  4: {
    shell: '#160806', shade: '#2a0c08', armor: '#3a0c06', trim: '#ff6a1a', band: '#ffb020', eye: '#ff2a00',
    wing: '#4a0808', wingOpacity: 0.92, wings: 'bat', flap: 11, roughness: 0.4, metalness: 0.35,
    bugWing: '#ffb070', bugWingOpacity: 0.42,
  },
};

// Body proportions per kind: bulk (thickness), length of the abdomen, wing size.
const BUILDS = {
  drone: { bulk: 1, abdomen: 4, wing: 1 },
  zipper: { bulk: 0.78, abdomen: 3, wing: 1.25, tint: '#ffd23f' },
  brute: { bulk: 1.35, abdomen: 4, wing: 0.9, heavy: true, tint: '#d9483b' },
  stinger: { bulk: 0.95, abdomen: 5, wing: 1, sniper: true, tint: '#b05cff' },
  queen: { bulk: 1.15, abdomen: 5, wing: 1.2, boss: true },
  shogun: { bulk: 1.25, abdomen: 5, wing: 1.2, boss: true, heavy: true },
  seraph: { bulk: 1.1, abdomen: 5, wing: 1.3, boss: true },
  empress: { bulk: 1.2, abdomen: 6, wing: 1.3, boss: true },
  beezebub: { bulk: 1.3, abdomen: 6, wing: 1.4, boss: true, heavy: true },
};

const tmpColor = new THREE.Color();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const matrix = new THREE.Matrix4();

/** A coloured, transformed, non-indexed piece, ready to merge. */
export function piece(geometry, color, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  matrix.compose(new THREE.Vector3(...position), quaternion.setFromEuler(euler.set(...rotation)), new THREE.Vector3(...scale));
  g.applyMatrix4(matrix);
  tmpColor.set(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) tmpColor.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export const merge = (pieces) => (pieces.length ? mergeGeometries(pieces) : null);

/**
 * Marks pieces as lit (0) or glowing (1). The glowing parts (eyes, veins, crystals, halos) used to be meshes of their
 * own with an unlit material: two more draw calls a bee. Now they share the body's and abdomen's meshes, and
 * `glowShader` draws them unlit (v0.28.2).
 */
function withGlow(pieces, value) {
  for (const g of pieces) g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(value), 1));
  return pieces;
}

const GLOW = '1.35'; // as bright as the old glow material: just past the bloom threshold

/**
 * The bee's surface draws vertices marked `glow` as unlit light in their vertex colour (hit flashes still add).
 * `rim` adds a soft warm light around the bee's outline (the garden's bees), so it stands out from the lawn.
 * `sway` (a uniform, radians) swings the vertices marked `aTail` (the abdomen, merged into the body's mesh since
 * v0.40: one draw call less a bee) about the waist, the way the abdomen's own pivot did.
 */
function glowShader(material, rim = 0, sway = null) {
  material.onBeforeCompile = (shader) => {
    if (sway) shader.uniforms.uSway = sway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float glow;\nattribute float aTail;\nvarying float vGlow;\nuniform float uSway;\nconst vec3 TAIL_PIVOT = vec3(${TAIL_PIVOT.join(', ')});`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
float swayAngle = uSway * aTail;
mat3 swayTurn = mat3(1.0, 0.0, 0.0, 0.0, cos(swayAngle), sin(swayAngle), 0.0, -sin(swayAngle), cos(swayAngle));
objectNormal = swayTurn * objectNormal;`
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\ntransformed = TAIL_PIVOT + swayTurn * (transformed - TAIL_PIVOT);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <color_fragment>', `#include <color_fragment>\nvec3 glowLight = vColor.rgb * vGlow * ${GLOW};\ndiffuseColor.rgb *= 1.0 - vGlow;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += glowLight;
${rim ? `totalEmissiveRadiance += vec3(1.0, 0.9, 0.7) * ${rim.toFixed(2)} * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * (1.0 - vGlow);` : ''}`
      );
  };
  material.customProgramCacheKey = () => `bee-glow-${rim}-tail`;
  return material;
}

const TAIL_PIVOT = [0, 10, -1.5]; // where the abdomen hangs from the thorax

const HAT_SIZE = 0.8; // a seasonal hat on the garden's bees, in their model's units

/**
 * Body and abdomen in one geometry, the abdomen's vertices marked `aTail` (see glowShader), and a seasonal hat on the
 * head when there is one (it was a mesh of its own: one draw call more a bee). Cached with the parts, per hat.
 */
function bodyWithTail(parts, kind, hat) {
  parts.whole ??= new Map();
  const key = hat?.id ?? '';
  if (parts.whole.has(key)) return parts.whole.get(key);
  const mark = (g, name, value) => g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(value), 1));
  const body = parts.body.clone();
  const tail = parts.abdomen.clone().translate(...TAIL_PIVOT);
  mark(body, 'aTail', 0);
  mark(tail, 'aTail', 1);
  const pieces = [body, tail];
  if (hat) {
    // The hat is modelled for the world's Z-up (Enemy.js): turned back Y-up and set on top of the head.
    const bulk = BUILDS[kind]?.bulk ?? 1;
    const g = hat.geometry.index ? hat.geometry.toNonIndexed() : hat.geometry.clone();
    g.rotateX(-Math.PI / 2).scale(HAT_SIZE, HAT_SIZE, HAT_SIZE).rotateX(-0.25).translate(0, 11 + 4.4 * bulk, 8.2 * bulk);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    mark(g, 'glow', 0);
    mark(g, 'aTail', 0);
    pieces.push(g);
  }
  const whole = mergeGeometries(pieces);
  pieces.forEach((g) => g.dispose());
  parts.whole.set(key, whole);
  return whole;
}

// The shadow pass skips the glowing parts (they never cast shadows when they were meshes of their own): their
// vertices land outside the shadow camera's view, so nothing of them is drawn.
const glowlessDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
glowlessDepth.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float glow;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nif (glow > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
};
glowlessDepth.customProgramCacheKey = () => 'bee-glowless-depth';
const mix = (a, b, t) => `#${tmpColor.set(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** Leg: upper and lower segment from the thorax down to the ground. */
function leg(pieces, side, z, color, bulk, seg) {
  const x = side * 4.2 * bulk;
  pieces.push(piece(new THREE.CapsuleGeometry(0.75, 5, 3, seg), color, { position: [x + side * 2, 6.6, z], rotation: [0, 0, side * 1.05] }));
  pieces.push(piece(new THREE.CapsuleGeometry(0.6, 6, 3, seg), color, { position: [x + side * 4.4, 3.6, z + 0.6], rotation: [0.15, 0, side * 0.25] }));
}

// --- Wings (built lying in the XZ plane, extending along +X from the pivot) ----------------------

function insectWing(style, size) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(5, 3.6, 12, 4.2, 16, 1.5);
  shape.bezierCurveTo(17.5, 0, 15, -2.5, 9, -2.8);
  shape.bezierCurveTo(5, -3, 2, -1.8, 0, 0);
  const pieces = [];
  const front = new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
  pieces.push(piece(front, style.wing, { scale: [size, 1, size], rotation: [0, 0.18, 0] }));
  const back = new THREE.ShapeGeometry(shape, 10).rotateX(-Math.PI / 2);
  pieces.push(piece(back, mix(style.wing, '#ffffff', 0.2), { position: [0, -0.2, -2.5], scale: [size * 0.7, 1, size * 0.7], rotation: [0, -0.35, 0] }));
  // Veins
  for (const [length, angle] of [[15, 0.2], [11, 0.05], [8, 0.42]]) {
    pieces.push(piece(new THREE.BoxGeometry(length * size, 0.15, 0.25), mix(style.wing, '#000000', 0.45), { position: [length * size * 0.5, 0.05, -angle * length * size * 0.5], rotation: [0, angle, 0] }));
  }
  return merge(pieces);
}

function featherWing(style, size, seg) {
  const pieces = [];
  for (let i = 0; i < 7; i++) {
    const length = (16 - i * 1.2) * size;
    const angle = 0.1 + i * 0.16;
    const color = i % 2 ? style.wing : mix(style.wing, style.armor, 0.25);
    pieces.push(
      piece(new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1)), color, {
        position: [Math.cos(angle) * length * 0.5, 0.2 * i, -Math.sin(angle) * length * 0.5],
        rotation: [0, angle, 0],
        scale: [length * 0.5, 0.35, 1.5 * size],
      })
    );
  }
  // Golden tips
  pieces.push(piece(new THREE.SphereGeometry(1, seg, 6), style.armor, { position: [15 * size * 0.95, 0.3, -1.8 * size], scale: [2.2, 0.4, 1.2] }));
  return merge(pieces);
}

function batWing(style, size, seg) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.8);
  shape.lineTo(17, 3.5);
  shape.quadraticCurveTo(15, 0.5, 14, -3.5);
  shape.quadraticCurveTo(11.5, -1.5, 9.5, -5);
  shape.quadraticCurveTo(7, -2.5, 5, -5.5);
  shape.quadraticCurveTo(3, -2.5, 0, -2.5);
  const pieces = [piece(new THREE.ShapeGeometry(shape, 8).rotateX(-Math.PI / 2), style.wing, { scale: [size, 1, size] })];
  // Finger bones with claws.
  // Shape point (x, y) lies at (x, 0, -y) once the shape is turned flat.
  for (const [x, y] of [[17, 3.5], [14, -3.5], [9.5, -5], [5, -5.5]]) {
    const length = Math.hypot(x, y) * size;
    pieces.push(piece(new THREE.CapsuleGeometry(0.35, length, 2, seg), '#1a0a08', { position: [x * size * 0.5, 0.2, -y * size * 0.5], rotation: [0, Math.atan2(y, x), Math.PI / 2] }));
  }
  pieces.push(piece(new THREE.ConeGeometry(0.7, 3, seg), style.trim, { position: [17 * size + 1, 0.2, -3.5 * size], rotation: [0, 0, -Math.PI / 2] }));
  return merge(pieces);
}

// --- The bee ---------------------------------------------------------------------------------

function buildGeometry(kind, styleId, detail = 1, tintOf = null) {
  const style = STYLES[styleId];
  const build = BUILDS[kind] ?? BUILDS.drone;
  const { bulk } = build;
  const tint = tintOf ?? build.tint;
  // Smoother every arena; bosses are big on screen, so they get more. (Kept modest: a swarm is 50 bees.) `detail`
  // below 1 on the lighter quality steps (Quality.js `beeDetail`).
  const seg = Math.max(6, Math.round((9 + styleId * 2) * (build.boss ? 1.6 : 1) * detail));
  // Sculpted bodies (Sculpt.js): the grid spacing in model units, about the same number of cells whatever the bulk;
  // finer for the big bosses. (0.62 made a drone 13k triangles, the Queen 40k.)
  const cell = ((build.boss ? 0.58 : 0.9) * bulk) / detail;
  // The garden's bees keep their dark shell and wear their kind's colour in the stripes, where it shows.
  const shell = tint && !style.garden ? mix(style.shell, tint, styleId === 2 ? 0.25 : 0.2) : style.shell;
  const armor = tint ? mix(style.armor, tint, 0.35) : style.armor;
  const band = tint && style.garden ? mix(style.band, tint, 0.7) : style.band;
  const body = [];
  const glow = [];
  const abdomen = [];
  const abdomenGlow = [];

  // Thorax and head
  if (style.sculpted) {
    // One soft body: a furry thorax melting into the head and a little muzzle.
    const fur = (x, y, z, d) => {
      const near = Math.min(1, Math.max(0, (4.2 * bulk - z) / (2 * bulk))); // the thorax only, not the face
      return d - near * 0.22 * Math.sin(x * 1.7 + y * 0.6) * Math.sin(y * 1.6 + z * 1.1) * Math.sin(z * 1.9 + x * 0.8);
    };
    body.push(
      sculpt(
        [
          { ellipsoid: [0, 10, 0.5], radii: [6.3 * bulk, 5.7 * bulk, 6.6 * bulk], color: shell },
          { ellipsoid: [0, 11, 8.2 * bulk], radii: [5.06 * bulk, 4.37 * bulk, 4.6 * bulk], color: style.face, blend: 2.4 * bulk },
          { ellipsoid: [0, 9.2, 11.4 * bulk], radii: [2.7 * bulk, 2.1 * bulk, 1.8 * bulk], color: mix(style.face, '#fff2c0', 0.25), blend: 1.6 * bulk },
          // A fluffy collar where the head meets the thorax.
          ...Array.from({ length: 11 }, (_, i) => {
            const a = (i / 11) * Math.PI * 2;
            return { ellipsoid: [Math.cos(a) * 4.9 * bulk, 10.2 + Math.sin(a) * 4.5 * bulk, 4.3 * bulk], radii: [1.9 * bulk, 1.9 * bulk, 1.5 * bulk], color: i % 2 ? style.fuzz : mix(style.fuzz, '#ffffff', 0.3), blend: 1.1 * bulk };
          }),
        ],
        { cell, carve: fur }
      )
    );
  } else {
    body.push(piece(new THREE.SphereGeometry(6 * bulk, seg, seg), shell, { position: [0, 10, 0.5], scale: [1.05, 0.95, 1.1] }));
    body.push(piece(new THREE.SphereGeometry(4.6 * bulk, seg, seg), style.face ?? shell, { position: [0, 11, 8.2 * bulk], scale: [1.1, 0.95, 1] }));
  }
  // Compound eyes (glowing) and mandibles
  for (const side of [-1, 1]) {
    (style.garden ? body : glow).push(piece(new THREE.SphereGeometry(2.3 * bulk, seg, seg), style.eye, { position: [side * 3 * bulk, 12, 10.2 * bulk], scale: [0.8, 1.15, 0.85] })); // (the garden's are glossy, not glowing)
    body.push(piece(new THREE.ConeGeometry(0.9 * bulk, 4 * bulk, seg), style.shade, { position: [side * 1.5 * bulk, 8.6, 12.6 * bulk], rotation: [Math.PI / 2 + 0.3, 0, -side * 0.5] }));
    // Antennae
    body.push(piece(new THREE.CapsuleGeometry(0.3, 5, 2, seg), style.shade, { position: [side * 1.6, 15.5, 9 * bulk + 1], rotation: [0.7, 0, -side * 0.35] }));
    (styleId === 3 ? glow : body).push(piece(new THREE.SphereGeometry(0.7, seg, 6), styleId === 3 ? style.trim : style.shade, { position: [side * 2.5, 17.6, 9 * bulk + 3] }));
    // Legs
    for (const z of [3, 0, -3]) leg(body, side, z * bulk, style.shade, bulk, Math.max(4, seg >> 1));
  }

  // Abdomen: banded segments behind the pivot, ending in a stinger.
  let z = -3;
  const chubby = style.chubby ?? 1;
  const segments = [];
  for (let i = 0; i < build.abdomen; i++) {
    const r = (5.6 - i * (3.4 / build.abdomen)) * bulk * chubby;
    const color = (i + (style.goldFirst ? 1 : 0)) % 2 ? band : shell;
    segments.push({ z, r, color });
    if (!style.sculpted) abdomen.push(piece(new THREE.SphereGeometry(r, seg, seg), color, { position: [0, 0, z], scale: [1, 0.92, 1.05] }));
    if (styleId === 2 && i % 2 === 0) abdomen.push(piece(new THREE.TorusGeometry(r * 0.98, 0.35, 6, seg * 2), style.armor, { position: [0, 0, z - r * 0.5] }));
    if ((styleId === 3 || styleId === 4) && i % 2) abdomenGlow.push(piece(new THREE.TorusGeometry(r * 0.97, 0.3, 6, seg * 2), style.trim, { position: [0, 0, z] }));
    z -= r * 0.8;
  }
  if (style.sculpted) {
    // One smooth tapering abdomen, painted in bands with a groove between each.
    const bounds = segments.slice(1).map((seg, i) => (segments[i].z + seg.z) / 2);
    const bandAt = (pz) => bounds.filter((b) => pz < b).length;
    const groove = (pz) => Math.min(...bounds.map((b) => Math.abs(pz - b)));
    const colors = segments.map((seg) => new THREE.Color(seg.color));
    abdomen.push(
      sculpt(
        segments.map((seg) => ({ ellipsoid: [0, 0, seg.z], radii: [seg.r, seg.r * 0.92, seg.r * 1.05], color: seg.color, blend: 2.2 * bulk })),
        {
          cell: cell * 1.3, // (a simple shape: a coarser grid holds it, ~1.5k triangles on a drone instead of 2.6k)
          paint: (x, y, pz, color) => color.copy(colors[bandAt(pz)]),
          carve: (x, y, pz, d) => d + 0.38 * bulk * Math.max(0, 1 - groove(pz) / (0.9 * bulk)) ** 2,
        }
      )
    );
  }
  const stingLength = build.sniper ? 8 : 5;
  (build.sniper ? abdomenGlow : abdomen).push(
    piece(new THREE.ConeGeometry(1.3 * bulk, stingLength, seg), build.sniper ? style.trim : style.shade, { position: [0, 0, z - stingLength * 0.45], rotation: [-Math.PI / 2, 0, 0] })
  );
  if (build.sniper) abdomenGlow.push(piece(new THREE.SphereGeometry(2.2 * bulk, seg, seg), style.eye, { position: [0, 0, z + 1] }));

  // Armour and arena regalia
  if (styleId === 0) {
    // (The fluffy collar is part of the sculpted body.) A sparkle in each eye and a cross little brow.
    for (const side of [-1, 1]) {
      glow.push(piece(new THREE.IcosahedronGeometry(0.55 * bulk, 0), '#fff8e8', { position: [side * 2.6 * bulk, 13.1, 12 * bulk] }));
      if (!build.boss) body.push(piece(new THREE.BoxGeometry(2.8 * bulk, 0.7, 0.9), style.shade, { position: [side * 3 * bulk, 15.1, 10.9 * bulk], rotation: [-0.3, 0, side * 0.38] }));
    }
  } else if (styleId === 1) {
    // Lacquered plates and a kabuto helmet with a golden crest.
    body.push(piece(new THREE.SphereGeometry(6.7 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2.1), armor, { position: [0, 10.4, 0.5], scale: [1.05, 1, 1.1] }));
    body.push(piece(new THREE.SphereGeometry(5.1 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2), armor, { position: [0, 11.4, 8.2 * bulk], scale: [1.15, 1, 1.05] }));
    body.push(piece(new THREE.TorusGeometry(5.3 * bulk, 0.5, 6, seg * 2), style.trim, { position: [0, 11.4, 8.2 * bulk], rotation: [Math.PI / 2, 0, 0], scale: [1.15, 1.05, 1] }));
    body.push(piece(new THREE.TorusGeometry(3.6, 0.5, 6, seg, Math.PI), style.trim, { position: [0, 16.5, 11 * bulk], rotation: [0, 0, 0] }));
    for (const side of [-1, 1]) {
      body.push(piece(new THREE.SphereGeometry(3.4 * bulk, seg, seg), armor, { position: [side * 6.5 * bulk, 11, 0.5], scale: [0.55, 1.1, 1.2] }));
    }
  } else if (styleId === 2) {
    // Porcelain bands, a golden collar and a halo.
    body.push(piece(new THREE.TorusGeometry(5.2 * bulk, 0.7, 8, seg * 2), style.armor, { position: [0, 10.5, 5], rotation: [0, 0, 0] }));
    glow.push(piece(new THREE.TorusGeometry(4.5 * bulk, 0.45, 8, seg * 3), style.trim, { position: [0, 19.5, 7 * bulk], rotation: [Math.PI / 2, 0, 0] }));
  } else if (styleId === 3) {
    // Crystals growing out of the back.
    for (let i = 0; i < 4; i++) {
      glow.push(piece(new THREE.OctahedronGeometry(1.6 + i * 0.3, 0), i % 2 ? style.trim : style.eye, { position: [(i - 1.5) * 2.2, 16 + (i % 2) * 1.5, -0.5 - i * 0.4], scale: [0.6, 2.2, 0.6], rotation: [-0.3, 0, (i - 1.5) * 0.35] }));
    }
    body.push(piece(new THREE.SphereGeometry(6.5 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2.4), style.armor, { position: [0, 10.3, 0.5], scale: [1.05, 1, 1.1] }));
  } else if (styleId === 4) {
    // Curved horns, spines along the back and smouldering veins.
    for (const side of [-1, 1]) {
      let hx = side * 2.6;
      let hy = 14;
      let angle = side * 0.6;
      let r = 1.3 * bulk;
      for (let i = 0; i < 4; i++) {
        body.push(piece(new THREE.CylinderGeometry(r * 0.75, r, 2.6, seg), '#0e0605', { position: [hx + Math.sin(angle) * 1.3, hy + Math.cos(angle) * 1.3, 9 * bulk], rotation: [0, 0, -angle] }));
        hx += Math.sin(angle) * 2.5;
        hy += Math.cos(angle) * 2.5;
        angle -= side * 0.35;
        r *= 0.78;
      }
      glow.push(piece(new THREE.ConeGeometry(r, 2, seg), style.trim, { position: [hx, hy + 0.8, 9 * bulk], rotation: [0, 0, -angle] }));
    }
    for (let i = 0; i < 4; i++) {
      body.push(piece(new THREE.ConeGeometry(0.9 * bulk, 4 * bulk, seg), '#0e0605', { position: [0, 15.5 + (i === 1 || i === 2 ? 0.6 : 0), 4 - i * 2.6], rotation: [-0.5, 0, 0] }));
    }
    glow.push(piece(new THREE.TorusGeometry(6.1 * bulk, 0.3, 6, seg * 2), style.trim, { position: [0, 10, 0.5], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 1.1, 1] }));
  }

  if (build.heavy) {
    // Pauldrons and a horn for the heavy hitters.
    for (const side of [-1, 1]) {
      body.push(piece(new THREE.SphereGeometry(3.8 * bulk, seg, seg), armor, { position: [side * 6.8 * bulk, 12, 2], scale: [0.7, 0.9, 1.25] }));
      body.push(piece(new THREE.ConeGeometry(1, 3.5, seg), style.trim, { position: [side * 8.5 * bulk, 14.8, 2], rotation: [0, 0, -side * 0.6] }));
    }
    body.push(piece(new THREE.ConeGeometry(1.2 * bulk, 6 * bulk, seg), style.trim, { position: [0, 15, 11.5 * bulk], rotation: [0.9, 0, 0] }));
  }

  if (build.boss) addRegalia(kind, styleId, style, bulk, seg, body, glow);

  const wings = build.boss ? style.wings : 'insect';
  const royal = build.boss && styleId === 0;
  return {
    body: merge([...withGlow(body, 0), ...withGlow(glow, 1)]),
    abdomen: merge([...withGlow(abdomen, 0), ...withGlow(abdomenGlow, 1)]),
    wings,
    wing:
      wings === 'feather'
        ? featherWing(style, build.wing, seg)
        : wings === 'bat'
          ? batWing(style, build.wing, Math.max(4, seg >> 1))
          : insectWing({ ...style, wing: style.bugWing ?? style.wing }, build.wing),
    extraWings: build.boss && (styleId === 0 || styleId === 2 || styleId === 4),
    cape: build.boss && (styleId === 3 || kind === 'shogun' || royal),
  };
}

/** Crowns, crests, banners and halos for the bosses. */
function addRegalia(kind, styleId, style, bulk, seg, body, glow) {
  const headZ = 8.2 * bulk;
  if (styleId === 0 && kind !== 'shogun') {
    // Queen Buzzbelle: a jewelled crown worn a little back, an ermine ruff, lashes, rosy cheeks and a sceptre.
    const gold = '#ffc93c';
    const crownY = 15.4;
    const tilt = [-0.28, 0, 0.08];
    const atCrown = (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).applyEuler(euler.set(...tilt));
      return [p.x, crownY + p.y, headZ - 0.6 + p.z];
    };
    body.push(piece(new THREE.CylinderGeometry(4.4 * bulk, 3.8 * bulk, 2.6, 10), gold, { position: atCrown(0, 0, 0), rotation: tilt }));
    body.push(piece(new THREE.TorusGeometry(4.1 * bulk, 0.45, 4, 10), '#e0a020', { position: atCrown(0, -1.1, 0), rotation: [tilt[0] + Math.PI / 2, 0, tilt[2]] }));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.PI / 2;
      const [x, z] = [Math.cos(a) * 4.1 * bulk, Math.sin(a) * 4.1 * bulk];
      const tall = i === 0 ? 4.6 : 3.2;
      body.push(piece(new THREE.ConeGeometry(1.1, tall, 4), gold, { position: atCrown(x, 1.2 + tall / 2, z), rotation: tilt }));
      glow.push(piece(new THREE.IcosahedronGeometry(i === 0 ? 0.9 : 0.6, 0), i % 2 ? '#ff4a7a' : '#7fd8ff', { position: atCrown(x, 1.4 + tall, z) }));
    }
    glow.push(piece(new THREE.OctahedronGeometry(1.2, 0), '#ff2a5a', { position: atCrown(0, 0.1, 4.5 * bulk), scale: [1, 1.3, 0.6] }));
    // The ruff: two rows of white puffs, with a few black ermine tips.
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 12; i++) {
        const a = ((i + row * 0.5) / 12) * Math.PI * 2;
        const r = (5.6 + row * 0.9) * bulk;
        const color = row === 1 && i % 4 === 1 ? '#2a2420' : row ? '#fffaf0' : '#f2e8d8';
        body.push(piece(new THREE.IcosahedronGeometry((2 - row * 0.3) * bulk, 1), color, { position: [Math.cos(a) * r, 10.2 + Math.sin(a) * r * 0.85, (4.2 - row * 1.1) * bulk], rotation: [a, i, 0] }));
      }
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        body.push(piece(new THREE.ConeGeometry(0.28, 2.2, 3), '#120c08', { position: [side * (3.6 + k * 0.6) * bulk, 14.6 - k * 0.5, 11.2 * bulk], rotation: [0.3, 0, -side * (0.5 + k * 0.35)] }));
      }
      body.push(piece(new THREE.SphereGeometry(1.2 * bulk, 6, 4), '#ff8a9a', { position: [side * 3.4 * bulk, 9.6, 11.9 * bulk], scale: [1, 0.6, 0.4] }));
    }
    // The sceptre in a front leg: a golden rod with a glowing honeycomb cell on top.
    const rod = [7.2 * bulk, 9, 9 * bulk];
    const lean = [0.35, 0, -0.25];
    body.push(piece(new THREE.CylinderGeometry(0.45, 0.55, 15, 5), gold, { position: rod, rotation: lean }));
    const top = new THREE.Vector3(0, 7.8, 0).applyEuler(euler.set(...lean)).add(new THREE.Vector3(...rod));
    body.push(piece(new THREE.CylinderGeometry(2, 2, 1.4, 6), gold, { position: top.toArray(), rotation: [Math.PI / 2 + lean[0], 0, lean[2]] }));
    glow.push(piece(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 6), '#ffb020', { position: top.toArray(), rotation: [Math.PI / 2 + lean[0], 0, lean[2]] }));
  } else if (kind === 'shogun' || styleId === 1) {
    // A huge golden crescent crest and katana mandibles.
    body.push(piece(new THREE.TorusGeometry(6, 0.9, 8, seg * 2, Math.PI), style.trim, { position: [0, 18, headZ + 2], rotation: [0, 0, 0] }));
    for (const side of [-1, 1]) body.push(piece(new THREE.BoxGeometry(0.6, 0.8, 10), '#e8e8f0', { position: [side * 2.2, 8.6, headZ + 8], rotation: [0.25, side * -0.3, 0] }));
  } else if (styleId === 2) {
    // A second, larger halo and a crown of light.
    glow.push(piece(new THREE.TorusGeometry(8, 0.5, 8, seg * 3), style.trim, { position: [0, 24, headZ - 2], rotation: [Math.PI / 2 - 0.4, 0, 0] }));
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      glow.push(piece(new THREE.ConeGeometry(0.7, 4, seg), style.trim, { position: [Math.cos(angle) * 3.4, 17, headZ + Math.sin(angle) * 3.4] }));
    }
  } else if (styleId === 3) {
    // A crown of crystal spires.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      glow.push(piece(new THREE.OctahedronGeometry(1.4, 0), i % 2 ? style.eye : style.trim, { position: [Math.cos(angle) * 3.6, 17.5, headZ + Math.sin(angle) * 3.6], scale: [0.7, 2.6, 0.7] }));
    }
  } else if (styleId === 4) {
    // A crown of hellfire spikes and a second pair of eyes.
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * (0.15 + i * 0.175);
      glow.push(piece(new THREE.ConeGeometry(0.8, 4.5, seg), style.trim, { position: [Math.cos(angle) * 4.2, 16.5 + Math.sin(angle) * 1.5, headZ + 0.5], rotation: [0, 0, Math.PI / 2 - angle] }));
    }
    for (const side of [-1, 1]) glow.push(piece(new THREE.SphereGeometry(1.3, seg, seg), style.eye, { position: [side * 1.7, 13.6, headZ + 4] }));
  }
}

const geometryCache = new Map();

/**
 * Builds the bees' geometry ahead of time, a kind per idle moment: sculpting one takes tens of milliseconds, and the
 * first wave spawning several kinds at once would hitch.
 */
export function prepareBees(styleId, detail = 1, kinds = ['drone', 'zipper', 'brute', 'stinger', 'queen']) {
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 50));
  const next = () => {
    const kind = kinds.shift();
    if (!kind) return;
    const key = `${kind}:${styleId}:${detail}:null`;
    if (!geometryCache.has(key)) geometryCache.set(key, buildGeometry(kind, styleId, detail));
    idle(next);
  };
  idle(next);
}
const sharedMaterials = new Map();

function shared(styleId) {
  if (!sharedMaterials.has(styleId)) {
    const style = STYLES[styleId];
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.35, 1.35, 1.35) }); // just past the bloom threshold
    const wing = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: style.wingOpacity < 0.9,
      opacity: style.wingOpacity,
      side: THREE.DoubleSide,
      depthWrite: style.wingOpacity >= 0.9,
      roughness: 0.3,
      metalness: 0.1,
      emissive: style.wing,
      emissiveIntensity: styleId === 3 ? 0.5 : 0.08,
    });
    const cape = new THREE.MeshStandardMaterial({
      color: styleId === 3 ? '#3a1a6a' : styleId === 0 ? '#7a2ab0' : '#b8322a',
      side: THREE.DoubleSide,
      roughness: 0.7,
      emissive: styleId === 3 ? '#2a0a5a' : '#000000',
    });
    const bugOpacity = style.bugWingOpacity ?? style.wingOpacity;
    const bugWing = style.bugWing
      ? new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: bugOpacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          roughness: 0.25,
          metalness: 0.1,
          emissive: style.bugWing,
          emissiveIntensity: 0.15,
        })
      : wing;
    sharedMaterials.set(styleId, { glow, wing, cape, bugWing });
  }
  return sharedMaterials.get(styleId);
}

/**
 * All of a bee's wings in one mesh (v0.28.2): they were a mesh each, two draw calls a bee (six for some bosses). Each
 * wing's vertices carry its pivot, side and phase, and the shader turns them the way the pivots used to turn, from
 * the bee's own flap clock (`uFlapT`, a uniform of the bee's own wing material).
 */
function wingSet(wing, defs) {
  const geometries = defs.map(({ side, y, z, scale, tilt }) => {
    const g = wing.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(), quaternion.setFromEuler(euler.set(0, side * tilt, 0)), new THREE.Vector3(side * scale, scale, scale)));
    if (side < 0) {
      // Mirrored: turn the triangles back around, so their front faces stay front faces.
      for (const attribute of Object.values(g.attributes)) {
        const { array, itemSize } = attribute;
        for (let tri = 0; tri < array.length; tri += itemSize * 3) {
          for (let k = 0; k < itemSize; k++) [array[tri + itemSize + k], array[tri + 2 * itemSize + k]] = [array[tri + 2 * itemSize + k], array[tri + itemSize + k]];
        }
      }
    }
    const count = g.attributes.position.count;
    const pivot = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pivot.set([side * 3.2, y, z], i * 3);
    g.setAttribute('aPivot', new THREE.BufferAttribute(pivot, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(count).fill(side), 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(count).fill(tilt), 1));
    return g;
  });
  const merged = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  // Bounds that hold every pose: a wing's vertices stay within their reach of its pivot, whichever way it turns.
  const center = new THREE.Vector3(0, 15, 0);
  const position = merged.attributes.position;
  const pivots = merged.attributes.aPivot;
  const at = new THREE.Vector3();
  let radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, at.fromBufferAttribute(pivots, i).distanceTo(center) + at.fromBufferAttribute(position, i).length());
  merged.boundingSphere = new THREE.Sphere(center, radius);
  return merged;
}

/** A bee's own wing material: a copy of the shared one that flaps its wings in the vertex shader. */
function flappingWings(shared, rate, slow) {
  const material = shared.clone();
  const flapT = { value: 0 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uFlapT: flapT, uFlapRate: { value: rate }, uSlow: { value: slow ? 1 : 0 } });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uFlapT;
uniform float uFlapRate;
uniform float uSlow;
attribute vec3 aPivot;
attribute float aSide;
attribute float aPhase;
mat3 wingTurn() {
  float flap = sin(uFlapT * uFlapRate + aPhase * 3.0);
  float rz = aSide * (uSlow > 0.5 ? 0.15 + flap * 0.55 : 0.25 + flap * 0.45);
  float rx = uSlow > 0.5 ? flap * 0.1 : 0.0;
  mat3 turnZ = mat3(cos(rz), sin(rz), 0.0, -sin(rz), cos(rz), 0.0, 0.0, 0.0, 1.0);
  mat3 turnX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
  return turnX * turnZ; // as a pivot's rotation (x, then z) did
}`
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat3 wingTurned = wingTurn();\nobjectNormal = wingTurned * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aPivot + wingTurned * transformed;');
  };
  material.customProgramCacheKey = () => 'bee-wings';
  return { material, flapT };
}

const sharedMesh = (geometry, material) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.shared = true; // geometry and material outlive the bee
  return mesh;
};

/**
 * Builds a bee: `{ root, materials, animate(time, delta, enemy) }`. `root` is Y-up facing +Z like the glTF bee.
 * `tint` recolours its stripes (garden raid adds), `hat` ({ id, geometry }) puts a seasonal hat on its head.
 */
export function buildBee(kind, styleId, detail = 1, tint = null, hat = null) {
  const key = `${kind}:${styleId}:${detail}:${tint}`;
  if (!geometryCache.has(key)) geometryCache.set(key, buildGeometry(kind, styleId, detail, tint));
  const parts = geometryCache.get(key);
  const style = STYLES[styleId];
  const materials = shared(styleId);

  // The body is per bee so hit flashes and status glows only light up this one (and its abdomen sways on its own).
  const sway = { value: 0 };
  const surface = glowShader(upgradeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: style.roughness, metalness: style.metalness }), styleId), style.rim ?? 0, sway);
  surface.color.set('#ffffff');
  if (style.garden) Object.assign(surface, { sheen: 0.6, sheenRoughness: 0.55 }); // a velvety, furry sheen

  const root = new THREE.Group();
  const inner = new THREE.Group(); // bobs while flying
  root.add(inner);
  // Body and abdomen are one mesh; the abdomen sways in the shader (its shadow stays put, which doesn't show).
  const body = new THREE.Mesh(bodyWithTail(parts, kind, hat), surface);
  body.userData.keepGeometry = true;
  body.castShadow = true;
  body.customDepthMaterial = glowlessDepth;
  inner.add(body);

  const slowFlap = parts.wings !== 'insect';
  if (!parts.wingSet) {
    const defs = [];
    for (const side of [-1, 1]) {
      defs.push({ side, y: 15, z: 1, scale: 1, tilt: 0.15 });
      if (parts.extraWings) {
        defs.push({ side, y: 14, z: -2, scale: 0.8, tilt: 0.55 });
        if (styleId === 2) defs.push({ side, y: 16.5, z: 3, scale: 0.7, tilt: -0.3 });
      }
    }
    parts.wingSet = wingSet(parts.wing, defs);
  }
  const flap = flappingWings(parts.wings === 'insect' ? materials.bugWing : materials.wing, slowFlap ? style.flap : Math.max(style.flap, 26), slowFlap); // insect wings buzz
  const wings = new THREE.Mesh(parts.wingSet, flap.material);
  wings.userData.keepGeometry = true;
  inner.add(wings);

  let cape = null;
  if (parts.cape) {
    if (!geometryCache.has('cape')) geometryCache.set('cape', new THREE.PlaneGeometry(14, 20, 4, 6));
    cape = sharedMesh(geometryCache.get('cape'), materials.cape);
    cape.position.set(0, 7, -5);
    cape.rotation.x = 0.4;
    inner.add(cape);
  }
  let orbit = null;
  if (kind === 'empress' || (styleId === 3 && BUILDS[kind]?.boss)) {
    // Shards of reality circling the Empress.
    orbit = new THREE.Group();
    orbit.position.y = 11;
    for (let i = 0; i < 6; i++) {
      const shard = sharedMesh(geometryCache.get('shard') ?? geometryCache.set('shard', new THREE.OctahedronGeometry(1.6, 0)).get('shard'), materials.glow);
      const angle = (i / 6) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * 16, Math.sin(i) * 2, Math.sin(angle) * 16);
      shard.scale.set(0.8, 2, 0.8);
      orbit.add(shard);
    }
    inner.add(orbit);
  }

  return {
    root,
    materials: [surface],
    ownMaterials: [flap.material], // the bee's own, but no hit flash (Enemy.dispose frees them)
    animate(time, delta, enemy) {
      const frozen = enemy.isFrozen;
      const rate = frozen ? 0 : enemy.speedFactor;
      enemy.flapTime = (enemy.flapTime ?? Math.random() * 10) + delta * rate;
      const t = enemy.flapTime;
      inner.position.y = Math.sin(t * 3) * 1.4;
      sway.value = Math.sin(t * 4.2) * 0.1 - (enemy.glow > 0.3 ? 0.35 : 0);
      flap.flapT.value = t; // the wings flap in their shader (flappingWings)
      if (cape) cape.rotation.x = 0.45 + Math.sin(t * 2.3) * 0.12;
      if (orbit) orbit.rotation.y = t * 1.3;
      if (enemy.dying) {
        // Tumble out of the air.
        inner.rotation.z += delta * 9;
        inner.rotation.x += delta * 4;
      }
    },
  };
}

// --- Hives: side objectives that keep spawning bees until they are smashed ---------------------

const NEST_LOOKS = {
  0: { base: '#6b4423', body: '#d9a74a', band: '#a8742a', hole: '#2a1a08', glow: '#ffb020' },
  2: { base: '#f2eee6', body: '#e8c25a', band: '#fff1b8', hole: '#2f4fb0', glow: '#7fd8ff' },
};

/** A big wild hive (garden) or golden hive altar (Sky Citadel); Y-up like the bees. */
export function buildNest(styleId) {
  const key = `nest:${styleId}`;
  const look = NEST_LOOKS[styleId] ?? NEST_LOOKS[0];
  if (!geometryCache.has(key)) {
    const seg = 14 + styleId * 3;
    const body = [];
    const glow = [];
    body.push(piece(new THREE.CylinderGeometry(15, 18, 5, seg), look.base, { position: [0, 2.5, 0] }));
    // A lumpy skep of stacked bands.
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const r = 13.5 * Math.sqrt(1 - t * t * 0.85) + 1;
      body.push(piece(new THREE.SphereGeometry(r, seg, 8), i % 2 ? look.band : look.body, { position: [0, 7 + i * 4.2, 0], scale: [1, 0.42, 1] }));
    }
    body.push(piece(new THREE.SphereGeometry(4, seg, 8), look.body, { position: [0, 31, 0] }));
    // Entrance holes glowing from inside.
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      const y = 10 + (i % 2) * 8;
      glow.push(piece(new THREE.SphereGeometry(2.2, 10, 8), look.glow, { position: [Math.cos(angle) * 12.4, y, Math.sin(angle) * 12.4], scale: [1, 0.7, 1] }));
    }
    if (styleId === 2) {
      glow.push(piece(new THREE.TorusGeometry(10, 0.6, 8, 48), look.glow, { position: [0, 40, 0], rotation: [Math.PI / 2, 0, 0] }));
    } else {
      // Honey dripping down the sides.
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        glow.push(piece(new THREE.CapsuleGeometry(0.9, 6, 3, 8), look.glow, { position: [Math.cos(angle) * 12.8, 15 - i, Math.sin(angle) * 12.8] }));
      }
    }
    geometryCache.set(key, { body: merge(body), glow: merge(glow) });
  }
  const parts = geometryCache.get(key);
  const surface = upgradeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: styleId === 2 ? 0.4 : 0 }), Math.max(1, styleId));
  surface.color.set('#ffffff');
  const root = new THREE.Group();
  const inner = new THREE.Group(); // throbs (the Enemy scales the root)
  root.add(inner);
  const body = new THREE.Mesh(parts.body, surface);
  body.userData.keepGeometry = true;
  body.castShadow = true;
  inner.add(body, sharedMesh(parts.glow, shared(Math.max(1, styleId)).glow));
  return {
    root,
    materials: [surface],
    animate(time, delta, enemy) {
      // Throbs, harder just after it lets out a bee.
      enemy.pulse = Math.max(0, (enemy.pulse ?? 0) - delta * 3);
      const throb = 1 + 0.03 * Math.sin(time * 4) + 0.12 * enemy.pulse;
      inner.scale.set(throb, 1 / throb, throb);
      if (enemy.dying) inner.rotation.y += delta * 6;
    },
  };
}

// --- Shield wards: crystals that keep a boss's shield up until they are smashed -------------------

// Per arena (graphics level): garden honey, mountain crimson, sky white-gold, tournament violet, underworld fire.
const WARD_LOOKS = [
  { stone: '#6b4423', crystal: '#ffc43d' },
  { stone: '#4a4a52', crystal: '#ff4a3a' },
  { stone: '#f2eee6', crystal: '#9fe8ff' },
  { stone: '#2a2040', crystal: '#c070ff' },
  { stone: '#2a1010', crystal: '#ff6a10' },
];

/** A tall glowing crystal on a carved plinth (Y-up like the bees); its colour follows the arena. */
export function buildWard(styleId) {
  const look = WARD_LOOKS[Math.min(styleId, WARD_LOOKS.length - 1)];
  const key = `ward:${styleId}`;
  if (!geometryCache.has(key)) {
    const body = [
      piece(new THREE.CylinderGeometry(13, 16, 6, 8), look.stone, { position: [0, 3, 0] }),
      piece(new THREE.CylinderGeometry(9, 11, 6, 8), look.stone, { position: [0, 9, 0] }),
    ];
    // Three small shards around the big one.
    const glow = [piece(new THREE.OctahedronGeometry(8, 0), look.crystal, { position: [0, 30, 0], scale: [0.8, 2.4, 0.8] })];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      glow.push(piece(new THREE.OctahedronGeometry(3, 0), look.crystal, { position: [Math.cos(angle) * 9, 16, Math.sin(angle) * 9], scale: [0.7, 1.8, 0.7], rotation: [0, 0, 0.3] }));
    }
    geometryCache.set(key, { body: merge(body), glow: merge(glow) });
  }
  const parts = geometryCache.get(key);
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const body = new THREE.Mesh(parts.body, surface);
  body.userData.keepGeometry = true;
  body.castShadow = true;
  const crystal = sharedMesh(parts.glow, shared(Math.max(1, Math.min(styleId, 3))).glow);
  spin.add(crystal);
  root.add(body);
  return {
    root,
    materials: [surface],
    animate(time, delta, enemy) {
      spin.rotation.y += delta * 1.2;
      spin.position.y = Math.sin(time * 2) * 1.5;
      if (enemy.dying) spin.scale.setScalar(Math.max(0.01, spin.scale.x - delta * 2));
    },
  };
}
