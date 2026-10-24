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
 * Bosses are sculpted in every arena and keep their own look wherever they appear (BOSS_LOOKS): Queen Buzzbelle, the
 * Hornet Shogun in lacquered armour, the Seraph Queen with a halo and six feathered wings, Empress Buzzbelle with a
 * crown of crystal spires (Bee-zebub is a devil of his own, DevilModel.js).
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
  for (const g of pieces) if (!g.attributes.glow) g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(value), 1));
  return pieces;
}

const GLOW = '1.35'; // as bright as the old glow material: just past the bloom threshold

/**
 * The bee's surface draws vertices marked `glow` as unlit light in their vertex colour (hit flashes still add).
 * `rim` adds a soft light around the bee's outline (the garden's bees, the bosses), so it stands out from the ground.
 * `sway` (a uniform, radians) swings the vertices marked `aTail` (the abdomen, merged into the body's mesh since
 * v0.40: one draw call less a bee) about the waist, the way the abdomen's own pivot did.
 */
function glowShader(material, rim = 0, sway = null, rimColor = null) {
  const rimLight = rimColor ? new THREE.Color(rimColor) : new THREE.Color().setRGB(1, 0.9, 0.7, THREE.LinearSRGBColorSpace);
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
${rim ? `totalEmissiveRadiance += vec3(${rimLight.toArray().map((v) => v.toFixed(3)).join(', ')}) * ${rim.toFixed(2)} * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * (1.0 - vGlow);` : ''}`
      );
  };
  material.customProgramCacheKey = () => `bee-glow-${rim}-${rimColor}-tail`;
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

/** A seraph's wing: rows of long white flight feathers with blue tips, cream ones over them and golden coverts. */
function featherWing(style, size, seg) {
  const pieces = [];
  const s = Math.max(6, seg >> 1);
  const feather = (length, width, angle, y, color, tip = null) => {
    const along = (d) => [Math.cos(angle) * d, y, -Math.sin(angle) * d];
    pieces.push(piece(new THREE.SphereGeometry(1, s, 4), color, { position: along(1 + length / 2), rotation: [0, angle, 0], scale: [length / 2, 0.22, width] }));
    if (tip) pieces.push(piece(new THREE.SphereGeometry(1, s, 4), tip, { position: along(1 + length * 0.88), rotation: [0, angle, 0], scale: [length * 0.13, 0.26, width * 0.85] }));
  };
  for (let i = 0; i < 8; i++) feather((17.5 - i * 1.1) * size, 1.25 * size, -0.08 + i * 0.13, 0.08 * i, style.wing, '#5a8cff');
  for (let i = 0; i < 6; i++) feather((10.5 - i * 0.5) * size, 1.35 * size, 0.02 + i * 0.17, 0.75, mix(style.wing, style.trim, 0.6));
  for (let i = 0; i < 6; i++) feather(5.5 * size, 1.4 * size, 0.05 + i * 0.18, 1.2, i % 2 ? '#ffd86a' : '#ffe9a0');
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

/**
 * The bosses are sculpted like the garden's bees (Sculpt.js) in every arena, each with a look of its own that it keeps
 * wherever it turns up (endless mode brings them all to the Underworld): `home` is the style its colours and wings
 * come from, the rest overrides that style. `rim` is the colour of the light around its outline, `seams` lights up
 * the grooves between its abdomen's bands.
 */
const BOSS_LOOKS = {
  queen: { home: 0 },
  shogun: { home: 1, face: '#e8a020', muzzle: '#3a1414', eye: '#140808', glossyEyes: true, noAntennae: true, lacquer: '#2a1414', rim: 0.35, rimColor: '#ff9a50' },
  seraph: { home: 2, shell: '#c27a10', face: '#ffc27a', muzzle: '#ffe6c4', eye: '#1e2a6a', glossyEyes: true, sash: '#2a46b8', trim: '#ffd86a', rim: 0.25, rimColor: '#ffc040', sparkle: true },
  empress: {
    home: 3, shell: '#1c1428', face: '#f2b23a', muzzle: '#ffe08a', band: '#ffd23f', eye: '#2a1040', fuzz: '#3a2a5a',
    seams: '#c070ff', rim: 0.5, rimColor: '#c070ff', sparkle: true, glossyEyes: true, goldFirst: true,
  },
  beezebub: { home: 4 },
};

/** Puts a piece built around the origin (Y along it) into a front leg, like a sceptre: tilted by `lean`, at `at`. */
function holder(at, lean) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...lean)), new THREE.Vector3(1, 1, 1));
  return (geometry, color, transform) => piece(geometry, color, transform).applyMatrix4(m);
}

function buildGeometry(kind, styleId, detail = 1, tintOf = null) {
  const build = BUILDS[kind] ?? BUILDS.drone;
  const look = build.boss ? (BOSS_LOOKS[kind] ?? { home: styleId }) : null;
  // A boss's own colours and wings (see BOSS_LOOKS); everything else looks like its arena.
  const home = look ? look.home : styleId;
  const style = look ? { ...STYLES[home], ...look } : STYLES[styleId];
  const sculpted = style.sculpted || Boolean(look);
  const { bulk } = build;
  const tint = tintOf ?? build.tint;
  // Smoother every arena; bosses are big on screen, so they get more. (Kept modest: a swarm is 50 bees.) `detail`
  // below 1 on the lighter quality steps (Quality.js `beeDetail`).
  const seg = Math.max(6, Math.round((9 + styleId * 2) * (build.boss ? 1.6 : 1) * detail));
  // Sculpted bodies (Sculpt.js): the grid spacing in model units, about the same number of cells whatever the bulk;
  // finer for the big bosses. (0.62 made a drone 13k triangles, the Queen 40k.)
  const cell = ((build.boss ? 0.58 : 0.9) * bulk) / detail;
  // The garden's bees keep their dark shell and wear their kind's colour in the stripes, where it shows.
  const shell = tint && !style.garden && !look ? mix(style.shell, tint, styleId === 2 ? 0.25 : 0.2) : style.shell;
  const armor = tint && !look ? mix(style.armor, tint, 0.35) : style.armor;
  const band = tint && style.garden ? mix(style.band, tint, 0.7) : style.band;
  const headZ = 8.2 * bulk;
  const body = [];
  const glow = [];
  const abdomen = [];
  const abdomenGlow = [];

  // Thorax and head
  if (sculpted) {
    // One soft body: a thorax melting into the head and a little muzzle (the garden's furry, with a fluffy collar).
    const fur = (x, y, z, d) => {
      const near = Math.min(1, Math.max(0, (4.2 * bulk - z) / (2 * bulk))); // the thorax only, not the face
      return d - near * 0.22 * Math.sin(x * 1.7 + y * 0.6) * Math.sin(y * 1.6 + z * 1.1) * Math.sin(z * 1.9 + x * 0.8);
    };
    const own = look ? bossBody(kind, style, bulk, headZ, armor) : { shapes: [] };
    const collar = style.garden || kind === 'empress';
    body.push(
      sculpt(
        [
          { ellipsoid: [0, 10, 0.5], radii: [6.3 * bulk, 5.7 * bulk, 6.6 * bulk], color: shell },
          { ellipsoid: [0, 11, headZ], radii: [5.06 * bulk, 4.37 * bulk, 4.6 * bulk], color: style.face ?? shell, blend: 2.4 * bulk },
          { ellipsoid: [0, 9.2, 11.4 * bulk], radii: [2.7 * bulk, 2.1 * bulk, 1.8 * bulk], color: style.muzzle ?? mix(style.face ?? shell, '#fff2c0', 0.25), blend: 1.6 * bulk },
          // A fluffy collar where the head meets the thorax.
          ...(collar
            ? Array.from({ length: 11 }, (_, i) => {
                const a = (i / 11) * Math.PI * 2;
                const color = kind === 'empress' ? (i % 3 === 0 ? '#ffd23f' : i % 2 ? style.fuzz : '#4a3570') : i % 2 ? style.fuzz : mix(style.fuzz, '#ffffff', 0.3);
                return { ellipsoid: [Math.cos(a) * 4.9 * bulk, 10.2 + Math.sin(a) * 4.5 * bulk, 4.3 * bulk], radii: [1.9 * bulk, 1.9 * bulk, 1.5 * bulk], color, blend: 1.1 * bulk };
              })
            : []),
          ...own.shapes,
        ],
        { cell, carve: style.garden ? fur : own.carve, paint: own.paint }
      )
    );
  } else {
    body.push(piece(new THREE.SphereGeometry(6 * bulk, seg, seg), shell, { position: [0, 10, 0.5], scale: [1.05, 0.95, 1.1] }));
    body.push(piece(new THREE.SphereGeometry(4.6 * bulk, seg, seg), style.face ?? shell, { position: [0, 11, headZ], scale: [1.1, 0.95, 1] }));
  }
  // Compound eyes (glowing) and mandibles
  for (const side of [-1, 1]) {
    (style.garden || style.glossyEyes ? body : glow).push(piece(new THREE.SphereGeometry(2.3 * bulk, seg, seg), style.eye, { position: [side * 3 * bulk, 12, 10.2 * bulk], scale: [0.8, 1.15, 0.85] })); // (the garden's are glossy, not glowing)
    body.push(piece(new THREE.ConeGeometry(0.9 * bulk, 4 * bulk, seg), style.shade, { position: [side * 1.5 * bulk, 8.6, 12.6 * bulk], rotation: [Math.PI / 2 + 0.3, 0, -side * 0.5] }));
    // Antennae (under the Shogun's helmet: none)
    if (!style.noAntennae) body.push(piece(new THREE.CapsuleGeometry(0.3, 5, 2, seg), style.shade, { position: [side * 1.6, 15.5, 9 * bulk + 1], rotation: [0.7, 0, -side * 0.35] }));
    if (!style.noAntennae) (home === 3 ? glow : body).push(piece(new THREE.SphereGeometry(0.7, seg, 6), home === 3 ? style.trim : style.shade, { position: [side * 2.5, 17.6, 9 * bulk + 3] }));
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
    if (!sculpted) abdomen.push(piece(new THREE.SphereGeometry(r, seg, seg), color, { position: [0, 0, z], scale: [1, 0.92, 1.05] }));
    if (home === 2 && i % 2 === 0) abdomen.push(piece(new THREE.TorusGeometry(r * 0.98, 0.35, 6, seg * 2), style.armor, { position: [0, 0, z - r * 0.5] }));
    if ((home === 3 || home === 4) && !style.seams && i % 2) abdomenGlow.push(piece(new THREE.TorusGeometry(r * 0.97, 0.3, 6, seg * 2), style.trim, { position: [0, 0, z] }));
    z -= r * 0.8;
  }
  if (sculpted) {
    // One smooth tapering abdomen, painted in bands with a groove between each (glowing on some bosses).
    const bounds = segments.slice(1).map((seg, i) => (segments[i].z + seg.z) / 2);
    const bandAt = (pz) => bounds.filter((b) => pz < b).length;
    const groove = (pz) => Math.min(...bounds.map((b) => Math.abs(pz - b)));
    const colors = segments.map((seg) => new THREE.Color(seg.color));
    const seam = (pz) => Math.max(0, 1 - groove(pz) / (0.55 * bulk)) ** 2;
    abdomen.push(
      sculpt(
        segments.map((seg) => ({ ellipsoid: [0, 0, seg.z], radii: [seg.r, seg.r * 0.92, seg.r * 1.05], color: seg.color, blend: 2.2 * bulk })),
        {
          cell: cell * 1.3, // (a simple shape: a coarser grid holds it, ~1.5k triangles on a drone instead of 2.6k)
          paint: (x, y, pz, color) => {
            color.copy(colors[bandAt(pz)]);
            if (style.seams && seam(pz) > 0.05) color.set(style.seams);
          },
          carve: (x, y, pz, d) => d + 0.38 * bulk * Math.max(0, 1 - groove(pz) / (0.9 * bulk)) ** 2,
          glow: style.seams ? (x, y, pz) => seam(pz) : null,
        }
      )
    );
  }
  const stingLength = build.sniper ? 8 : 5;
  (build.sniper ? abdomenGlow : abdomen).push(
    piece(new THREE.ConeGeometry(1.3 * bulk, stingLength, seg), build.sniper ? style.trim : style.shade, { position: [0, 0, z - stingLength * 0.45], rotation: [-Math.PI / 2, 0, 0] })
  );
  if (build.sniper) abdomenGlow.push(piece(new THREE.SphereGeometry(2.2 * bulk, seg, seg), style.eye, { position: [0, 0, z + 1] }));

  // Armour and arena regalia (the bosses but the Queen wear their own, see addRegalia)
  if (look && home !== 0) {
    if (style.sparkle) for (const side of [-1, 1]) glow.push(piece(new THREE.IcosahedronGeometry(0.55 * bulk, 0), '#ffffff', { position: [side * 2.4 * bulk, 13.3, 12.1 * bulk] }));
  } else if (styleId === 0) {
    // (The fluffy collar is part of the sculpted body.) A sparkle in each eye and a cross little brow.
    for (const side of [-1, 1]) {
      glow.push(piece(new THREE.IcosahedronGeometry(0.55 * bulk, 0), '#fff8e8', { position: [side * 2.6 * bulk, 13.1, 12 * bulk] }));
      if (!build.boss) body.push(piece(new THREE.BoxGeometry(2.8 * bulk, 0.7, 0.9), style.shade, { position: [side * 3 * bulk, 15.1, 10.9 * bulk], rotation: [-0.3, 0, side * 0.38] }));
    }
  } else if (styleId === 1) {
    // Lacquered plates and a kabuto helmet with a golden crest.
    body.push(piece(new THREE.SphereGeometry(6.7 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2.1), armor, { position: [0, 10.4, 0.5], scale: [1.05, 1, 1.1] }));
    body.push(piece(new THREE.SphereGeometry(5.1 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2), armor, { position: [0, 11.4, headZ], scale: [1.15, 1, 1.05] }));
    body.push(piece(new THREE.TorusGeometry(5.3 * bulk, 0.5, 6, seg * 2), style.trim, { position: [0, 11.4, headZ], rotation: [Math.PI / 2, 0, 0], scale: [1.15, 1.05, 1] }));
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

  if (build.heavy && !build.boss) {
    // Pauldrons and a horn for the heavy hitters.
    for (const side of [-1, 1]) {
      body.push(piece(new THREE.SphereGeometry(3.8 * bulk, seg, seg), armor, { position: [side * 6.8 * bulk, 12, 2], scale: [0.7, 0.9, 1.25] }));
      body.push(piece(new THREE.ConeGeometry(1, 3.5, seg), style.trim, { position: [side * 8.5 * bulk, 14.8, 2], rotation: [0, 0, -side * 0.6] }));
    }
    body.push(piece(new THREE.ConeGeometry(1.2 * bulk, 6 * bulk, seg), style.trim, { position: [0, 15, 11.5 * bulk], rotation: [0.9, 0, 0] }));
  }

  if (build.boss) addRegalia(kind, home, style, bulk, seg, body, glow);

  const wings = build.boss ? style.wings : 'insect';
  return {
    home,
    rim: style.rim ?? 0,
    rimColor: style.rimColor,
    body: merge([...withGlow(body, 0), ...withGlow(glow, 1)]),
    abdomen: merge([...withGlow(abdomen, 0), ...withGlow(abdomenGlow, 1)]),
    wings,
    wing:
      wings === 'feather'
        ? featherWing(style, build.wing, seg)
        : wings === 'bat'
          ? batWing(style, build.wing, Math.max(4, seg >> 1))
          : insectWing({ ...style, wing: style.bugWing ?? style.wing }, build.wing),
    extraWings: build.boss && (home === 0 || home === 2 || home === 4 || kind === 'empress'),
    cape: !build.boss ? null : kind === 'shogun' ? 'banner' : kind === 'queen' || kind === 'empress' || (home === 3 && kind !== 'seraph') ? 'cape' : null,
  };
}

/**
 * The sculpted armour, collars and markings of the bosses past the garden: extra shapes melted into the body, and
 * the carving and painting that go with them.
 */
function bossBody(kind, style, bulk, headZ, armor) {
  if (kind === 'shogun') {
    // A lacquered breastplate (dō) of laced plates, a ridged kabuto bowl with a brim and turned-back wings, a neck
    // guard of three plates and layered shoulder guards.
    const bowl = [0, 15.6, headZ - 2.2];
    const shapes = [
      { ellipsoid: [0, 11.6, -0.4], radii: [8.4, 6.2, 8.1], color: armor, blend: 0.5 },
      { ellipsoid: bowl, radii: [6, 3.1, 5.6], color: style.lacquer, blend: 0.4 },
      { ellipsoid: [0, 14.9, headZ + 2.4], radii: [5.4, 0.5, 2.3], color: style.trim, blend: 0.3 },
      ...[0, 1, 2].map((i) => ({ ellipsoid: [0, 13.4 - i * 1.5, headZ - 3.4 - i * 0.8], radii: [7.2 + i * 0.7, 0.85, 4.4 + i * 0.4], color: i === 2 ? style.trim : armor, blend: 0.25 })),
    ];
    for (const side of [-1, 1]) {
      shapes.push({ ellipsoid: [side * 6, 15, headZ + 0.6], radii: [0.8, 2, 2.2], color: armor, blend: 0.3 });
      for (let i = 0; i < 3; i++) shapes.push({ ellipsoid: [side * (8.7 + i * 0.45), 12.6 - i * 2, 2.4], radii: [1, 1.25, 4.4 - i * 0.2], color: i === 2 ? style.trim : armor, blend: 0.25 });
    }
    const onBowl = (x, y, z) => y > 15.3 && (x / 6.1) ** 2 + ((y - bowl[1]) / 3.3) ** 2 + ((z - bowl[2]) / 5.8) ** 2 < 1.25;
    const ridge = (x, z) => Math.max(0, Math.cos(Math.atan2(x, z - bowl[2]) * 8)) ** 2;
    const onPlate = (x, y, z) => y > 4 && z < headZ - 4.5 && Math.abs(x) < 8.2 && x * x + (y - 11.6) ** 2 + (z + 0.4) ** 2 > 30;
    return {
      shapes,
      // Raised ribs on the bowl, a gold sash round the breastplate.
      carve: (x, y, z, d) => (onBowl(x, y, z) ? d - 0.2 * ridge(x, z) : d),
      paint: (x, y, z, color) => {
        if (onPlate(x, y, z) && Math.abs(y - 8.4) < 0.7) color.set(style.trim);
      },
    };
  }
  if (kind === 'seraph') {
    // A collar of lily petals, and a golden breastplate over a royal-blue robe with a cream seam.
    const shapes = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return {
        capsule: [[Math.cos(a) * 4.2 * bulk, 10.5 + Math.sin(a) * 3.8 * bulk, 5 * bulk], [Math.cos(a) * 7.3 * bulk, 10.5 + Math.sin(a) * 6.6 * bulk, 3.4 * bulk]],
        radius: 1.15 * bulk,
        color: i % 2 ? '#ffffff' : '#fff1b8',
        blend: 0.6,
      };
    });
    const nearPetal = (x, y, z) =>
      shapes.some(({ capsule: [[ax, ay, az], [bx, by, bz]], radius }) => {
        const [dx, dy, dz] = [bx - ax, by - ay, bz - az];
        const h = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz)));
        return Math.hypot(x - ax - dx * h, y - ay - dy * h, z - az - dz * h) < radius + 0.4;
      });
    return {
      shapes,
      paint: (x, y, z, color) => {
        if (z > headZ - 4.2 || nearPetal(x, y, z)) return; // the head and the collar
        if (Math.abs(y - 9.3) < 0.35) color.set(style.trim);
        else if (y < 9.3) color.set(style.sash);
      },
    };
  }
  return { shapes: [] };
}

/** Long lashes over each eye and rosy cheeks (the queens). */
function lashes(body, bulk, color, cheeks) {
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      body.push(piece(new THREE.ConeGeometry(0.28, 2.2, 3), color, { position: [side * (3.6 + k * 0.6) * bulk, 14.6 - k * 0.5, 11.2 * bulk], rotation: [0.3, 0, -side * (0.5 + k * 0.35)] }));
    }
    body.push(piece(new THREE.SphereGeometry(1.2 * bulk, 6, 4), cheeks, { position: [side * 3.4 * bulk, 9.6, 11.9 * bulk], scale: [1, 0.6, 0.4] }));
  }
}

/** Crowns, crests, banners and halos for the bosses. */
function addRegalia(kind, home, style, bulk, seg, body, glow) {
  const headZ = 8.2 * bulk;
  const gold = '#ffc93c';
  if (kind === 'queen') {
    // Queen Buzzbelle: a jewelled crown worn a little back, an ermine ruff, lashes, rosy cheeks and a sceptre.
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
    lashes(body, bulk, '#120c08', '#ff8a9a');
    // The sceptre in a front leg: a golden rod with a glowing honeycomb cell on top.
    const rod = [7.2 * bulk, 9, 9 * bulk];
    const lean = [0.35, 0, -0.25];
    body.push(piece(new THREE.CylinderGeometry(0.45, 0.55, 15, 5), gold, { position: rod, rotation: lean }));
    const top = new THREE.Vector3(0, 7.8, 0).applyEuler(euler.set(...lean)).add(new THREE.Vector3(...rod));
    body.push(piece(new THREE.CylinderGeometry(2, 2, 1.4, 6), gold, { position: top.toArray(), rotation: [Math.PI / 2 + lean[0], 0, lean[2]] }));
    glow.push(piece(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 6), '#ffb020', { position: top.toArray(), rotation: [Math.PI / 2 + lean[0], 0, lean[2]] }));
  } else if (kind === 'shogun') {
    // A huge golden crescent crest (maedate) with a glowing mon, katana mandibles, a katana raised in a front leg and
    // the pole of his banner (sashimono) on his back.
    // (a crescent opening upward: its horns rise over the helmet)
    body.push(piece(new THREE.TorusGeometry(5.2, 0.7, 8, seg * 2, Math.PI), style.trim, { position: [0, 21.5, headZ + 2.2], rotation: [-0.35, 0, Math.PI], scale: [1, 1.35, 0.6] }));
    for (const side of [-1, 1]) body.push(piece(new THREE.ConeGeometry(0.7, 2.6, seg), style.trim, { position: [side * 5.2, 22.6, headZ + 1.8], rotation: [-0.35, 0, 0] }));
    body.push(piece(new THREE.CylinderGeometry(1.9, 1.9, 0.6, 6), style.trim, { position: [0, 16.6, headZ + 3.1], rotation: [Math.PI / 2 - 0.6, 0, 0] }));
    glow.push(piece(new THREE.CylinderGeometry(1.15, 1.15, 0.7, 6), '#ff3a1a', { position: [0, 16.65, headZ + 3.25], rotation: [Math.PI / 2 - 0.6, 0, 0] }));
    for (const side of [-1, 1]) {
      body.push(piece(new THREE.BoxGeometry(0.6, 0.8, 10), '#e8e8f0', { position: [side * 2.2, 8.6, headZ + 8], rotation: [0.25, side * -0.3, 0] }));
      // Dark hornet eyes with a burning pupil under a scowling brow.
      glow.push(piece(new THREE.SphereGeometry(0.75 * bulk, 8, 6), '#ff3a10', { position: [side * 2.75 * bulk, 12.6, 12.2 * bulk], scale: [1.4, 0.6, 0.6], rotation: [0, 0, side * 0.4] }));
      body.push(piece(new THREE.BoxGeometry(3.4 * bulk, 0.9, 1.2), style.lacquer, { position: [side * 2.9 * bulk, 14.1, 11.2 * bulk], rotation: [-0.3, 0, side * 0.42] }));
    }
    // A lacquered half mask (menpō) over the muzzle with a row of gold teeth.
    for (let i = 0; i < 6; i++) body.push(piece(new THREE.BoxGeometry(0.55, 0.7, 0.5), '#ffd86a', { position: [(i - 2.5) * 0.65, 8.3, 11.4 * bulk + 1.75 - Math.abs(i - 2.5) * 0.18] }));
    const hold = holder([7.6 * bulk, 9.5, 9.5 * bulk], [0.55, 0, -0.35]);
    body.push(hold(new THREE.CylinderGeometry(0.55, 0.55, 5, 6), '#1a1012', { position: [0, -1.5, 0] }));
    body.push(hold(new THREE.CylinderGeometry(1.7, 1.7, 0.45, 8), style.trim, { position: [0, 1.2, 0] }));
    for (let i = 0; i < 4; i++) {
      // A gently curved blade in four steps, a glowing edge along it.
      const y = 3.6 + i * 4.1;
      const bend = 0.04 * i * i;
      body.push(hold(new THREE.BoxGeometry(0.35, 4.3, 1.7 - i * 0.15), '#e8eef8', { position: [0, y, -bend], rotation: [0.05 * i, 0, 0] }));
      glow.push(hold(new THREE.BoxGeometry(0.4, 4.3, 0.25), '#ffb070', { position: [0, y, 0.85 - i * 0.075 - bend], rotation: [0.05 * i, 0, 0] }));
    }
    body.push(piece(new THREE.CylinderGeometry(0.35, 0.35, 20, 6), '#2a1810', { position: [-3.5, 23, -6.5] }));
    body.push(piece(new THREE.SphereGeometry(0.8, 8, 6), style.trim, { position: [-3.5, 33.2, -6.5] }));
    body.push(piece(new THREE.CylinderGeometry(0.25, 0.25, 7.4, 5), '#2a1810', { position: [0, 32.2, -6.5], rotation: [0, 0, Math.PI / 2] }));
  } else if (kind === 'seraph') {
    // A great halo behind her head with rays of light, a golden diadem with a star and a staff topped with a star.
    const ring = new THREE.Matrix4().compose(new THREE.Vector3(0, 18.5, headZ - 5.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0)), new THREE.Vector3(1, 1, 1));
    glow.push(piece(new THREE.TorusGeometry(8.5, 0.5, 8, seg * 3), style.trim).applyMatrix4(ring));
    glow.push(piece(new THREE.TorusGeometry(6.6, 0.22, 6, seg * 3), '#ffe08a').applyMatrix4(ring));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const long = i % 2 ? 2.6 : 4.4;
      glow.push(piece(new THREE.ConeGeometry(0.4, long, 4), i % 2 ? '#ffe08a' : style.trim, { position: [Math.cos(a) * (9.2 + long / 2), Math.sin(a) * (9.2 + long / 2), 0], rotation: [0, 0, a - Math.PI / 2] }).applyMatrix4(ring));
    }
    body.push(piece(new THREE.TorusGeometry(3.7 * bulk, 0.4, 6, seg * 2), gold, { position: [0, 15.3, headZ - 0.6], rotation: [Math.PI / 2 - 0.3, 0, 0] }));
    glow.push(piece(new THREE.OctahedronGeometry(1.1, 0), '#7fd8ff', { position: [0, 15.4, headZ + 3.4], scale: [0.8, 1.4, 0.5] }));
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.25 + i * 0.125);
      glow.push(piece(new THREE.ConeGeometry(0.45, i === 2 ? 3.6 : 2.4, 4), '#fff1b8', { position: [Math.cos(a) * 3.7 * bulk, 16.4 + Math.sin(a) * 1.2, headZ + 0.4], rotation: [-0.3, 0, a - Math.PI / 2] }));
    }
    lashes(body, bulk, '#1e2440', '#ffb0c8');
    const hold = holder([7.4 * bulk, 9, 9 * bulk], [0.3, 0, -0.22]);
    body.push(hold(new THREE.CylinderGeometry(0.45, 0.5, 17, 6), gold, { position: [0, 0.5, 0] }));
    body.push(hold(new THREE.TorusGeometry(2.3, 0.3, 6, 18), gold, { position: [0, 10.6, 0] }));
    glow.push(hold(new THREE.OctahedronGeometry(1.7, 0), '#ffffff', { position: [0, 10.6, 0], scale: [0.7, 1.5, 0.7] }));
    glow.push(hold(new THREE.OctahedronGeometry(1.5, 0), '#7fd8ff', { position: [0, 10.6, 0], scale: [1.5, 0.6, 0.6] }));
  } else if (kind === 'empress') {
    // Empress Buzzbelle, the Queen ascended: a tall crown of crystal spires, a lace collar fanned out behind her head
    // with gems on its points, lashes, and a sceptre with an orb in a crescent.
    const crownY = 16.2;
    body.push(piece(new THREE.CylinderGeometry(3.9 * bulk, 3.4 * bulk, 2.2, 12), gold, { position: [0, crownY, headZ - 0.5], rotation: [-0.2, 0, 0] }));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.PI / 2;
      const front = Math.cos(a - Math.PI / 2);
      const tall = 2 + (front + 1) * 1.5;
      glow.push(piece(new THREE.OctahedronGeometry(1, 0), i % 2 ? style.trim : style.eye, { position: [Math.cos(a) * 3.7 * bulk, crownY + 1 + tall, headZ - 0.5 + Math.sin(a) * 3.7 * bulk - tall * 0.2], scale: [0.6, tall, 0.6], rotation: [-0.2, 0, 0] }));
    }
    glow.push(piece(new THREE.OctahedronGeometry(1.3, 0), '#ff4ad0', { position: [0, crownY + 0.2, headZ + 4.2], scale: [1, 1.3, 0.6] }));
    const fan = new THREE.Shape();
    const points = 7;
    for (let i = 0; i <= points * 4; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / (points * 4));
      const r = 10 + 1.4 * Math.abs(Math.sin((i / 4) * Math.PI));
      i ? fan.lineTo(Math.cos(a) * r, Math.sin(a) * r) : fan.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (let i = 12; i >= 0; i--) {
      const a = Math.PI * (0.08 + (0.84 * i) / 12);
      fan.lineTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
    }
    const lace = new THREE.ExtrudeGeometry(fan, { depth: 0.35, bevelEnabled: false });
    const fanAt = new THREE.Matrix4().compose(new THREE.Vector3(0, 9.4, headZ - 4.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)), new THREE.Vector3(1, 1, 1));
    body.push(piece(lace, '#5a3a9a').applyMatrix4(fanAt));
    for (let i = 0; i <= points; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / points);
      glow.push(piece(new THREE.IcosahedronGeometry(0.75, 0), i % 2 ? style.trim : '#ffd23f', { position: [Math.cos(a) * 10.4, Math.sin(a) * 10.4, 0.4] }).applyMatrix4(fanAt));
    }
    lashes(body, bulk, '#120c08', '#d890ff');
    const hold = holder([7.4 * bulk, 9, 9.2 * bulk], [0.32, 0, -0.25]);
    body.push(hold(new THREE.CylinderGeometry(0.5, 0.6, 18, 6), gold, { position: [0, 0.5, 0] }));
    body.push(hold(new THREE.TorusGeometry(2.6, 0.45, 6, 16, Math.PI * 1.3), gold, { position: [0, 11.2, 0], rotation: [0, 0, -Math.PI * 0.65 + Math.PI / 2] }));
    glow.push(hold(new THREE.IcosahedronGeometry(1.9, 1), '#d070ff', { position: [0, 12, 0] }));
  } else if (home === 4) {
    // A crown of hellfire spikes and a second pair of eyes.
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * (0.15 + i * 0.175);
      glow.push(piece(new THREE.ConeGeometry(0.8, 4.5, seg), style.trim, { position: [Math.cos(angle) * 4.2, 16.5 + Math.sin(angle) * 1.5, headZ + 0.5], rotation: [0, 0, Math.PI / 2 - angle] }));
    }
    for (const side of [-1, 1]) glow.push(piece(new THREE.SphereGeometry(1.3, seg, seg), style.eye, { position: [side * 1.7, 13.6, headZ + 4] }));
  }
}

/**
 * A boss's cape (the Queen's and the Empress's: curved round her abdomen, folds growing toward a gold-trimmed hem; the
 * Empress's speckled with stars) or the Shogun's banner (red, gold border, a gold mon), in vertex colours.
 */
function capeGeometry(kind, type) {
  const color = new THREE.Color();
  if (type === 'banner') {
    const g = new THREE.PlaneGeometry(7, 12, 14, 24);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const [x, y] = [p.getX(i), p.getY(i)];
      const r = Math.hypot(x, y - 1.5);
      color.set(Math.abs(x) > 2.9 || Math.abs(y) > 5.4 || (r > 1.5 && r < 2.2) ? '#ffc93c' : r < 0.6 ? '#1a1012' : '#b8322a');
      color.toArray(colors, i * 3);
      p.setZ(i, Math.sin(x * 0.9 + y * 0.3) * 0.25);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.translate(3.5, -6, 0);
    g.computeVertexNormals();
    return g;
  }
  const empress = kind === 'empress';
  const g = new THREE.PlaneGeometry(14, 20, 14, 14);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [x, y] = [p.getX(i), p.getY(i)];
    const t = (10 - y) / 20; // 0 at the shoulders, 1 at the hem
    p.setZ(i, -((x / 7) ** 2) * 2.4 * (0.5 + t) + Math.sin(x * 1.5 + 0.5) * 0.55 * t);
    const trim = Math.abs(x) > 6.2 || y < -8.8;
    const star = empress && !trim && Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 > 0.9;
    color.set(trim ? '#ffc93c' : y > 8.6 && !empress ? '#fffaf0' : star ? '#e8d8ff' : empress ? '#3a1a6a' : '#7a2ab0');
    color.toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const geometryCache = new Map();

/**
 * Builds the bees' geometry ahead of time, a kind per idle moment: sculpting one takes tens of milliseconds, and the
 * first wave spawning several kinds at once would hitch.
 */
const ARENA_BOSSES = ['queen', 'shogun', 'seraph', 'empress']; // (Bee-zebub is a devil of his own, DevilModel.js)

export function prepareBees(styleId, detail = 1, kinds = ['drone', 'zipper', 'brute', 'stinger', ARENA_BOSSES[styleId] ?? 'queen']) {
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
      vertexColors: true, // (capeGeometry paints it)
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
  const materials = shared(parts.home);

  // The body is per bee so hit flashes and status glows only light up this one (and its abdomen sways on its own).
  const sway = { value: 0 };
  const surface = glowShader(upgradeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: style.roughness, metalness: style.metalness }), styleId), parts.rim, sway, parts.rimColor);
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
        if (parts.home === 2) defs.push({ side, y: 16.5, z: 3, scale: 0.7, tilt: -0.3 });
      }
    }
    parts.wingSet = wingSet(parts.wing, defs);
  }
  const flap = flappingWings(parts.wings === 'insect' ? materials.bugWing : materials.wing, slowFlap ? style.flap : Math.max(style.flap, 26), slowFlap); // insect wings buzz
  const wings = new THREE.Mesh(parts.wingSet, flap.material);
  wings.userData.keepGeometry = true;
  inner.add(wings);

  let cape = null;
  const banner = parts.cape === 'banner';
  if (parts.cape) {
    const capeKey = `cape:${kind}:${parts.cape}`;
    if (!geometryCache.has(capeKey)) geometryCache.set(capeKey, capeGeometry(kind, parts.cape));
    cape = sharedMesh(geometryCache.get(capeKey), materials.cape);
    if (banner) cape.position.set(-3.5, 32.2, -6.4); // (hung from the pole on his back)
    else cape.position.set(0, 7, -5);
    cape.rotation.x = banner ? 0 : 0.4;
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
      if (cape && banner) cape.rotation.y = Math.sin(t * 1.7) * 0.22;
      else if (cape) cape.rotation.x = 0.45 + Math.sin(t * 2.3) * 0.12;
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
