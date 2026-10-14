import * as THREE from 'three';
import {
  insideArena,
  instanced,
  model,
  outsideArena,
  part,
  pick,
  pineTree,
  range,
  reseed,
  rock,
  roundTree,
  scatterPoints,
  setDetail,
  single,
  surface,
} from './Environment.js';
import { MAP_HALF_SIZE } from './Map.js';
import { viewHeight } from './Viewport.js';

/**
 * The playing fields of a run. Tode starts in his garden; every 5 waves he travels somewhere grander, and after
 * the Empress the ground gives way and he falls into the Underworld. Each arena is built at a higher graphics
 * level (smoother, shinier, more alive) — see Graphics.js and `setDetail` in Environment.js.
 *
 * Arenas keep the garden's rules: a square field of MAP_HALF_SIZE with bees entering at the corners.
 * `build()` returns { group, obstacles, update(time, delta) }; built lazily and cached until the world resizes.
 */
export const ARENAS = [
  {
    id: 'garden',
    name: "Tode's Garden",
    subtitle: 'Where it all began',
    from: 1,
    gfx: 0,
    bullet: '#c070ff',
  },
  {
    id: 'mountain',
    name: 'Sage Mountain',
    subtitle: 'Where the old toads train',
    from: 6,
    gfx: 1,
    bullet: '#ffb020',
    // Lights stay low enough that lit surfaces don't cross the bloom threshold; `exposure` brightens after bloom.
    palette: { sky: '#a9d8c9', sun: '#fff1d6', sunIntensity: 1.9, hemiSky: '#d9fff0', hemiGround: '#3d6b3a', hemi: 0.95, ambient: 0.35 },
    exposure: 1.2,
    postfx: { bloom: 0.05 },
    weathers: ['clear', 'rain', 'gale', 'storm'],
    build: buildMountain,
  },
  {
    id: 'sky',
    name: 'Sky Citadel',
    subtitle: 'A temple above the clouds',
    from: 11,
    gfx: 2,
    bullet: '#5fc8ff',
    palette: { sky: '#bfe4ff', sun: '#fffaf0', sunIntensity: 0.95, hemiSky: '#eaf6ff', hemiGround: '#b0a28a', hemi: 0.45, ambient: 0.15 },
    exposure: 1.7,
    postfx: { bloom: 0.12 },
    weathers: ['clear', 'gale', 'storm'],
    build: buildSkyCitadel,
  },
  {
    id: 'cosmos',
    name: 'Tournament of the Gods',
    subtitle: 'Reality bends around the ring',
    from: 16,
    gfx: 3,
    bullet: '#ff4af0',
    palette: { sky: '#1d0f3a', sun: '#e8e4ff', sunIntensity: 1.1, hemiSky: '#9a7cff', hemiGround: '#2a1a40', hemi: 0.5, ambient: 0.2 },
    exposure: 1.6,
    postfx: { bloom: 0.25, warp: 0.12, aberration: 0.15 },
    weathers: ['clear', 'storm'],
    noRain: true,
    build: buildCosmos,
  },
  {
    id: 'hell',
    name: 'The Underworld',
    subtitle: 'Lair of Bee-zebub',
    from: 21,
    gfx: 4,
    bullet: '#ff5a10',
    palette: { sky: '#3a0a05', sun: '#ff9a5a', sunIntensity: 1.5, hemiSky: '#ff7a4a', hemiGround: '#5a1505', hemi: 0.85, ambient: 0.32 },
    exposure: 1.4,
    postfx: { bloom: 0.3, warp: 0.06, aberration: 0.1 },
    weathers: ['clear'],
    noRain: true,
    build: buildUnderworld,
  },
];

export function arenaForWave(wave) {
  let arena = ARENAS[0];
  for (const candidate of ARENAS) if (wave >= candidate.from) arena = candidate;
  return arena;
}

const WORLD_SIZE = 6000;

// --- Shared pieces -------------------------------------------------------------------

function canvasTexture(size, draw, repeat = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }
  return texture;
}

function speckle(ctx, size, count, colors, maxDot) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = pick(colors);
    const dot = 1 + range(0, maxDot);
    ctx.fillRect(range(0, size), range(0, size), dot, dot);
  }
}

/** The field itself: a plane with a painted texture. (Big bright floors must stay under the bloom threshold.) */
function ground(texture, { roughness = 0.85, metalness = 0, emissiveMap = null, emissive = '#000000', margin = 0 } = {}) {
  const size = MAP_HALF_SIZE * 2 + margin * 2;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: texture, roughness, metalness, emissiveMap, emissive, emissiveIntensity: emissiveMap ? 1 : 0 })
  );
  mesh.receiveShadow = true;
  return mesh;
}

// --- Living floors: an additive glow layer over a field (the late arenas are seen mostly as floor) -------------
const FLOOR_NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }`;

/**
 * A plane over the field whose shader `body` sets `vec3 glow` from `p` (field coordinates), `time` and `halfSize`
 * (half the field's size). It is additive, so it only adds light; colours stay under the bloom threshold.
 */
function floorOverlay(body, margin = 0) {
  const size = MAP_HALF_SIZE * 2 + margin * 2;
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, halfSize: { value: size / 2 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float halfSize;
      varying vec2 vUv;
      ${FLOOR_NOISE}
      void main() {
        vec2 p = (vUv - 0.5) * halfSize * 2.0;
        vec3 glow = vec3(0.0);
        ${body}
        gl_FragColor = vec4(min(glow, vec3(0.9)), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.position.z = 0.35;
  mesh.renderOrder = 1;
  return mesh;
}

/** The thick slab under a floating field. */
function slab(color, depth, margin) {
  const half = MAP_HALF_SIZE + margin;
  const geometry = model([part(new THREE.CylinderGeometry(half * Math.SQRT2, half * Math.SQRT2 * 0.72, depth, 4, 1), color, { position: [0, -depth / 2 - 0.4, 0], rotation: [0, Math.PI / 4, 0] })]);
  const mesh = new THREE.Mesh(geometry, surface());
  mesh.receiveShadow = true;
  return mesh;
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip.xyww; // always at the far plane
  }`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 bottom;
  uniform vec3 nebulaA;
  uniform vec3 nebulaB;
  uniform float nebula;
  uniform float stars;
  uniform float time;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  varying vec3 vDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }
  void main() {
    vec3 d = normalize(vDirection);
    float h = d.z;
    vec3 color = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.55, h)) : mix(horizon, bottom, smoothstep(0.0, -0.35, h));

    // Nebula clouds drifting slowly.
    if (nebula > 0.0) {
      float n = fbm(d * 2.6 + vec3(time * 0.01, 0.0, time * 0.006));
      float m = fbm(d * 5.0 - vec3(0.0, time * 0.008, 0.0));
      vec3 cloud = mix(nebulaA, nebulaB, smoothstep(0.3, 0.75, m));
      color += cloud * smoothstep(0.42, 0.85, n) * nebula;
    }
    // Stars: one per cell at most, round and twinkling.
    if (stars > 0.0) {
      vec3 p = d * 260.0;
      vec3 cell = floor(p);
      float s = hash(cell);
      float r = length(fract(p) - 0.5);
      float twinkle = 0.6 + 0.4 * sin(time * (1.5 + s * 4.0) + s * 40.0);
      color += vec3(1.0, 0.95, 0.9) * step(1.0 - stars, s) * smoothstep(0.22, 0.0, r) * twinkle;
    }
    // A soft glow around the sun.
    float sun = max(0.0, dot(d, sunDirection));
    color += sunColor * (pow(sun, 64.0) * 0.8 + pow(sun, 6.0) * 0.15);
    gl_FragColor = vec4(color, 1.0);
  }`;

function skyDome({ top, horizon, bottom, nebulaA = '#000000', nebulaB = '#000000', nebula = 0, stars = 0, sunColor = '#000000', sunDirection = [-0.6, 0.7, 0.35] }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) },
      nebulaA: { value: new THREE.Color(nebulaA) },
      nebulaB: { value: new THREE.Color(nebulaB) },
      nebula: { value: nebula },
      stars: { value: stars },
      time: { value: 0 },
      sunColor: { value: new THREE.Color(sunColor) },
      sunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), material);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}

const SWIRL_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform vec3 inner;
  uniform vec3 outer;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float swirl = 0.5 + 0.5 * sin(a * 5.0 + r * 14.0 - time * 5.0);
    vec3 color = mix(inner, outer, r) * (0.7 + 0.8 * swirl);
    gl_FragColor = vec4(color, smoothstep(1.0, 0.6, r) * 0.85);
  }`;

const UV_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** A swirling portal disc (rifts, hellgates). */
function portalDisc(radius, inner, outer) {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, inner: { value: new THREE.Color(inner) }, outer: { value: new THREE.Color(outer) } },
    vertexShader: UV_VERTEX,
    fragmentShader: SWIRL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.CircleGeometry(radius, 48), material);
}

const LAVA_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform vec3 fade;
  uniform float fadeFrom;
  uniform float fadeTo;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.1 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec2 p = vWorld.xy * 0.012;
    float flow = fbm(p + vec2(time * 0.05, time * 0.03));
    float crust = fbm(p * 2.0 - vec2(time * 0.02, -time * 0.04) + flow * 2.0);
    vec3 color = mix(vec3(0.35, 0.02, 0.0), vec3(1.0, 0.32, 0.02), smoothstep(0.35, 0.7, crust));
    color += vec3(1.0, 0.8, 0.3) * pow(smoothstep(0.55, 0.85, crust), 3.0) * 1.5;
    color *= 0.75 + 0.25 * sin(time * 1.3 + flow * 6.0);
    float distance = length(vWorld.xy - cameraPosition.xy);
    color = mix(color, fade, smoothstep(fadeFrom, fadeTo, distance));
    gl_FragColor = vec4(color, 1.0);
  }`;

const WORLD_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

function lavaMaterial(fade = '#2a0603', fadeFrom = 900, fadeTo = 2600) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, fade: { value: new THREE.Color(fade) }, fadeFrom: { value: fadeFrom }, fadeTo: { value: fadeTo } },
    vertexShader: WORLD_VERTEX,
    fragmentShader: LAVA_FRAGMENT,
  });
}

const MOTE_VERTEX = /* glsl */ `
  uniform float size;
  uniform float scale;
  uniform float maxSize;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vColor = color;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    float distance = -view.z;
    gl_PointSize = min(size * scale / distance, maxSize);
    // Fade out near the camera: up close, points turn into big blobs that haze the screen.
    vFade = smoothstep(140.0, 280.0, distance);
    gl_Position = projectionMatrix * view;
  }`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform float opacity;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = smoothstep(1.0, 0.0, r);
    gl_FragColor = vec4(vColor, alpha * alpha * opacity * vFade);
  }`;

/**
 * Drifting particles as glowing points: `emitters` [{x, y, z}] with a `spread`; each particle rises (or falls)
 * through `height` over its life and starts over. Without emitters they fill the whole area.
 */
function motes({ count, colors, size = 3, area = MAP_HALF_SIZE + 200, height = 120, speed = 20, sway = 10, emitters = null, spread = 6, additive = true, opacity = 0.9 }) {
  const positions = new Float32Array(count * 3);
  const colorArray = new Float32Array(count * 3);
  const color = new THREE.Color();
  const seeds = Array.from({ length: count }, (_, i) => {
    color.set(pick(colors)).toArray(colorArray, i * 3);
    const emitter = emitters ? emitters[i % emitters.length] : null;
    return {
      emitter,
      x: emitter ? range(-spread, spread) : range(-area, area),
      y: emitter ? range(-spread, spread) : range(-area, area),
      phase: range(0, 1),
      rate: range(0.6, 1.4),
      wobble: range(0, Math.PI * 2),
    };
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        size: { value: size },
        scale: { value: viewHeight() * Math.min(window.devicePixelRatio || 1, 1.5) * 0.5 },
        maxSize: { value: size > 20 ? 220 : 28 },
        opacity: { value: opacity },
      },
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
  );
  points.frustumCulled = false;
  const travel = height / Math.max(1, Math.abs(speed));
  return {
    points,
    update(time) {
      seeds.forEach((seed, i) => {
        const t = (time / travel * seed.rate + seed.phase) % 1;
        const base = seed.emitter ?? { x: 0, y: 0, z: 0 };
        const rise = speed >= 0 ? t * height : (1 - t) * height;
        positions[i * 3] = base.x + seed.x * (seed.emitter ? 1 + t : 1) + Math.sin(time * 0.7 + seed.wobble) * sway;
        positions[i * 3 + 1] = base.y + seed.y * (seed.emitter ? 1 + t : 1) + Math.cos(time * 0.6 + seed.wobble) * sway;
        positions[i * 3 + 2] = (base.z ?? 0) + rise;
      });
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

/** Builds the four sides of a boundary: `post(x, y)` and `rail(x, y, length, alongX)` return parts. */
function boundary({ post, rail, spacing = 45, gap = 80, offset = 6 }) {
  const parts = [];
  const edge = MAP_HALF_SIZE + offset;
  const from = -MAP_HALF_SIZE + gap;
  const to = MAP_HALF_SIZE - gap;
  const count = Math.max(1, Math.round((to - from) / spacing));
  const step = (to - from) / count;
  for (const side of [0, 1, 2, 3]) {
    const alongX = side % 2 === 0;
    const fixed = side < 2 ? edge : -edge;
    for (let i = 0; i <= count; i++) {
      const t = from + i * step;
      const [x, y] = alongX ? [t, fixed] : [fixed, t];
      parts.push(...post(x, y, alongX));
      if (i < count && rail) {
        const [rx, ry] = alongX ? [t + step / 2, fixed] : [fixed, t + step / 2];
        parts.push(...rail(rx, ry, step, alongX));
      }
    }
  }
  return parts;
}

/** Rotation (about Z) that turns a statue at (x, y) to face the middle of the field. */
const faceCenter = (x, y) => Math.atan2(x, -y);

/** Corner positions for the spawners (bees come in at the corners). */
const corners = (inset = 38) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * (MAP_HALF_SIZE + inset), y: sy * (MAP_HALF_SIZE + inset), rotation: Math.atan2(-sx, sy) })));

/**
 * Every arena is bigger than the one before. Layouts are designed for the garden's size; `spread` stretches
 * positions to the current size (set at the start of each build), `far` pushes landmarks out beyond the edge.
 */
let spread = 1;
const GARDEN_HALF = 375;
const at = (x, y) => [x * spread, y * spread];
const xy = (x, y) => ({ x: x * spread, y: y * spread });
const far = (x, y) => {
  const push = 1 + (spread - 1) * 0.7;
  return [x * push, y * push];
};

function startBuild(seed, level) {
  reseed(seed);
  setDetail(level);
  spread = MAP_HALF_SIZE / GARDEN_HALF;
}

/** Fills a bigger arena with more of its props: `choices` [[geometry, radius, minScale, maxScale, look]]. */
function fillProps(group, obstacles, choices, perGarden) {
  const count = Math.round(perGarden * (spread * spread - 1));
  if (count <= 0) return;
  const avoid = [
    ...obstacles.map((o) => ({ ...o, radius: o.radius + 50 })),
    { x: 0, y: 0, radius: 130 },
    ...corners(0).map((c) => ({ ...c, radius: 160 })),
  ];
  for (const { x, y } of scatterPoints(count, { inside: insideArena(60), spacing: 110, avoid })) {
    const [geometry, radius, min, max, look] = pick(choices);
    // These are laid out at full size already: no spreading.
    const mesh = single(geometry, { x, y, scale: range(min, max), rotation: range(0, Math.PI * 2), look });
    group.add(mesh);
    obstacles.push({ x, y, radius: radius * mesh.scale.x });
  }
}

/** Adds a prop (positions in garden-sized layout coordinates). Nothing blocks movement any more; obstacles
 * are kept for spacing decoration and objectives. */
function solid(group, obstacles, geometry, { x, y, radius, scale = 1, rotation = range(0, Math.PI * 2), look }) {
  [x, y] = at(x, y);
  const mesh = single(geometry, { x, y, scale, rotation, look });
  group.add(mesh);
  obstacles.push({ x, y, radius: radius * scale });
  return mesh;
}

const glowMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

// --- Props (modelled Y-up; `model()` turns them Z-up) ---------------------------------------

/** A sitting stone toad with a sash: the guardians of Sage Mountain. */
function toadStatue(stone = ['#8e9188', '#848a80'], accent = '#c23b22', eye = '#3a3a34') {
  const [main, shade] = stone;
  return model([
    part(new THREE.CylinderGeometry(22, 25, 7, 10), shade, { position: [0, 3.5, 0], jitter: 0.6 }),
    part(new THREE.SphereGeometry(16, 10, 8), main, { position: [0, 19, 2], scale: [1.15, 0.85, 1.05] }),
    part(new THREE.SphereGeometry(11.5, 10, 8), main, { position: [0, 30, -7], scale: [1.25, 0.72, 1] }),
    part(new THREE.SphereGeometry(4.2, 8, 6), main, { position: [-7, 36, -9] }),
    part(new THREE.SphereGeometry(4.2, 8, 6), main, { position: [7, 36, -9] }),
    part(new THREE.SphereGeometry(1.8, 6, 4), eye, { position: [-7.5, 37, -12.5] }),
    part(new THREE.SphereGeometry(1.8, 6, 4), eye, { position: [7.5, 37, -12.5] }),
    part(new THREE.CylinderGeometry(2.6, 3.2, 13, 6), shade, { position: [-9, 12, -11] }),
    part(new THREE.CylinderGeometry(2.6, 3.2, 13, 6), shade, { position: [9, 12, -11] }),
    part(new THREE.SphereGeometry(7, 8, 6), shade, { position: [-14, 10, 6], scale: [1, 0.6, 1.4] }),
    part(new THREE.SphereGeometry(7, 8, 6), shade, { position: [14, 10, 6], scale: [1, 0.6, 1.4] }),
    part(new THREE.TorusGeometry(15.5, 1.7, 6, 18), accent, { position: [0, 24, 1], rotation: [Math.PI / 2, 0, 0], scale: [1.15, 1, 1] }),
  ]);
}

function giantMushroom(cap = '#d6463a', spots = '#fff4e0') {
  const parts = [
    part(new THREE.CylinderGeometry(3.5, 5.5, 30, 8), '#efe6d2', { position: [0, 15, 0], jitter: 0.5 }),
    part(new THREE.SphereGeometry(18, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, { position: [0, 27, 0], scale: [1, 0.75, 1] }),
    part(new THREE.CylinderGeometry(17.5, 17.5, 1.5, 12), '#e9dcc0', { position: [0, 27, 0] }),
  ];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + range(0, 0.4);
    const tilt = range(0.35, 0.95);
    parts.push(
      part(new THREE.SphereGeometry(range(1.6, 2.6), 6, 4), spots, {
        position: [Math.cos(angle) * Math.sin(tilt) * 18, 27 + Math.cos(tilt) * 13.2, Math.sin(angle) * Math.sin(tilt) * 18],
      })
    );
  }
  return model(parts);
}

function rockSpire(height, colors = ['#7d7a72', '#6f6c66', '#8a877e']) {
  const parts = [];
  let y = 0;
  let radius = height * 0.16;
  for (let i = 0; i < 4; i++) {
    const h = height * (0.38 - i * 0.06);
    parts.push(part(new THREE.CylinderGeometry(radius * 0.72, radius, h, 7), pick(colors), { position: [range(-2, 2), y + h / 2, range(-2, 2)], jitter: radius * 0.12 }));
    y += h * 0.92;
    radius *= 0.72;
  }
  parts.push(part(new THREE.ConeGeometry(radius, height * 0.12, 7), pick(colors), { position: [0, y + height * 0.06, 0] }));
  // Moss on the ledges.
  parts.push(part(new THREE.CylinderGeometry(height * 0.17, height * 0.18, 2, 9), '#5c9a4c', { position: [0, 1, 0] }));
  return model(parts);
}

function column(height, { broken = false, marble = '#f2eee6', gold = '#e8c25a' } = {}) {
  const parts = [
    part(new THREE.BoxGeometry(22, 5, 22), marble, { position: [0, 2.5, 0] }),
    part(new THREE.CylinderGeometry(8.5, 8.5, 3, 16), gold, { position: [0, 6.5, 0] }),
    part(new THREE.CylinderGeometry(7, 8, height, 16), marble, { position: [0, 8 + height / 2, 0] }),
  ];
  // Fluting: thin vertical ribs.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    parts.push(part(new THREE.BoxGeometry(1.4, height, 1.4), '#e4ded2', { position: [Math.cos(angle) * 7.4, 8 + height / 2, Math.sin(angle) * 7.4] }));
  }
  if (!broken) {
    parts.push(part(new THREE.CylinderGeometry(10, 7.5, 4, 16), gold, { position: [0, 10 + height, 0] }));
    parts.push(part(new THREE.BoxGeometry(22, 4, 22), marble, { position: [0, 14 + height, 0] }));
  }
  return model(parts);
}

/** A crystal obelisk: dark stone with glowing rune lines (two geometries: stone and glow). */
function obelisk(height, glowColor) {
  const stone = model([
    part(new THREE.BoxGeometry(26, 6, 26), '#4a4558', { position: [0, 3, 0] }),
    part(new THREE.CylinderGeometry(5, 9, height, 4), '#3a3548', { position: [0, 6 + height / 2, 0], rotation: [0, Math.PI / 4, 0] }),
    part(new THREE.ConeGeometry(5, 10, 4), '#3a3548', { position: [0, 11 + height, 0], rotation: [0, Math.PI / 4, 0] }),
  ]);
  const runes = [];
  for (let side = 0; side < 4; side++) {
    const angle = (side / 4) * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      const y = 14 + i * (height / 6);
      const r = 8.6 - (y / height) * 3.8 + 0.4;
      runes.push(part(new THREE.BoxGeometry(i % 2 ? 4 : 2, 3.5, 0.6), glowColor, { position: [Math.sin(angle) * r, y, Math.cos(angle) * r], rotation: [0, angle, 0] }));
    }
  }
  runes.push(part(new THREE.OctahedronGeometry(4, 0), glowColor, { position: [0, height + 24, 0] }));
  return { stone, runes: model(runes) };
}

function skull(bone = '#d8cdb4', dark = '#1a0d0a') {
  return model([
    part(new THREE.SphereGeometry(16, 12, 10), bone, { position: [0, 16, 0], scale: [1, 0.95, 1.1] }),
    part(new THREE.BoxGeometry(18, 9, 14), bone, { position: [0, 5, -9], jitter: 0.5 }),
    part(new THREE.SphereGeometry(4.5, 8, 6), dark, { position: [-6, 17, -13] }),
    part(new THREE.SphereGeometry(4.5, 8, 6), dark, { position: [6, 17, -13] }),
    part(new THREE.ConeGeometry(2.4, 4, 3), dark, { position: [0, 10.5, -15.2], rotation: [Math.PI, 0, 0] }),
    // Horns
    part(new THREE.ConeGeometry(3.5, 18, 8), '#2a1a14', { position: [-12, 30, 0], rotation: [0, 0, 0.6] }),
    part(new THREE.ConeGeometry(3.5, 18, 8), '#2a1a14', { position: [12, 30, 0], rotation: [0, 0, -0.6] }),
  ]);
}

function obsidianSpire(height) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const h = height * (1 - i * 0.25);
    const angle = (i / 3) * Math.PI * 2;
    parts.push(
      part(new THREE.ConeGeometry(height * 0.13, h, 5), pick(['#1b1418', '#241a20', '#160f14']), {
        position: [Math.cos(angle) * height * 0.08 * i, h / 2, Math.sin(angle) * height * 0.08 * i],
        rotation: [range(-0.15, 0.15), 0, range(-0.15, 0.15)],
        jitter: 0.8,
      })
    );
  }
  return model(parts);
}

/** A stone fire bowl; the flames are particles added by the arena. */
function brazier(stone = '#3a2a24', metal = '#5a4030') {
  return model([
    part(new THREE.CylinderGeometry(5, 7, 4, 10), stone, { position: [0, 2, 0] }),
    part(new THREE.CylinderGeometry(2.5, 3.5, 16, 8), metal, { position: [0, 12, 0] }),
    part(new THREE.SphereGeometry(9, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal, { position: [0, 25, 0] }),
    part(new THREE.CylinderGeometry(7.5, 7.5, 1.5, 12), '#ff8a2a', { position: [0, 24.5, 0] }),
  ]);
}

function giantTodeStatue(stone, accent) {
  // The guardian statue, much bigger, standing on a mountain of rock.
  return toadStatue(stone, accent);
}

/** A floating chunk of land, smoother than the garden's. */
function floatingIsland(size, top = '#7ed957', earth = '#8a7a6a') {
  return model([
    part(new THREE.ConeGeometry(size, size * 1.6, 9), earth, { position: [0, -size * 0.8, 0], rotation: [Math.PI, 0, 0], jitter: size * 0.06 }),
    part(new THREE.CylinderGeometry(size, size * 0.95, size * 0.25, 12), top, { position: [0, 0, 0] }),
  ]);
}

// --- Sage Mountain ---------------------------------------------------------------------

function buildMountain() {
  startBuild(6101, 1);
  const group = new THREE.Group();
  const obstacles = [];
  const updates = [];
  const half = MAP_HALF_SIZE;

  // Deep moss with darker patches, stone-flag paths in a cross and a round plaza in the middle.
  const texture = canvasTexture(2048, (ctx, size) => {
    ctx.fillStyle = '#4f8f45';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const x = range(0, size);
      const y = range(0, size);
      const r = range(40, 160);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = pick(['rgba(40,90,40,0.5)', 'rgba(110,160,70,0.35)', 'rgba(70,120,60,0.45)']);
      gradient.addColorStop(0, tone);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, size, 40000, ['rgba(30,70,30,0.35)', 'rgba(170,220,120,0.2)', 'rgba(90,140,60,0.3)'], 4);
    const flag = (x, y, w, h, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = pick(['#a3a093', '#99968a', '#aeab9d']);
      ctx.strokeStyle = 'rgba(30,40,25,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    const c = size / 2;
    // Paths from the plaza toward the four sides.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let d = 230; d < size / 2 - 40; d += 52) {
        const wiggle = Math.sin(d * 0.012) * 26;
        for (const side of [-1, 1]) {
          const along = d + range(-6, 6);
          const across = side * 30 + wiggle + range(-5, 5);
          flag(c + dx * along - dy * across, c + dy * along + dx * across, range(46, 58), range(38, 48), range(-0.2, 0.2) + (dx ? 0 : Math.PI / 2));
        }
      }
    }
    // The plaza: rings of flags.
    for (const [radius, count] of [[60, 8], [120, 16], [180, 24]]) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + range(-0.04, 0.04);
        flag(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius, 2 * Math.PI * radius / count - 6, 52, angle + Math.PI / 2);
      }
    }
    speckle(ctx, size, 5000, ['rgba(80,140,60,0.5)'], 5); // moss creeping over the stones
    const edge = ctx.createRadialGradient(c, c, size * 0.4, c, c, size * 0.72);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(20,50,30,0.45)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
  });
  group.add(ground(texture, { roughness: 0.9 }));

  const meadowTexture = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#4c7f47';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 3000, ['rgba(30,60,30,0.3)', 'rgba(150,200,120,0.15)', 'rgba(120,110,90,0.25)'], 3);
  }, WORLD_SIZE / 120);
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), new THREE.MeshStandardMaterial({ map: meadowTexture, roughness: 1 }));
  meadow.position.z = -0.5;
  meadow.receiveShadow = true;
  group.add(meadow);

  group.add(skyDome({ top: '#5aa6c4', horizon: '#d6f0e4', bottom: '#cfe8d8', sunColor: '#fff4d6' }));

  // A low mossy stone wall with lantern posts.
  const wall = model(
    boundary({
      spacing: 60,
      post: (x, y) => [
        part(new THREE.BoxGeometry(10, 22, 10), '#8c8a7e', { position: [x, 11, -y] }),
        part(new THREE.BoxGeometry(13, 4, 13), '#6f6d63', { position: [x, 24, -y] }),
        part(new THREE.SphereGeometry(3, 8, 6), '#ffd27a', { position: [x, 28.5, -y] }),
      ],
      rail: (x, y, length, alongX) => [
        part(new THREE.BoxGeometry(alongX ? length : 7, 12, alongX ? 7 : length), '#99978a', { position: [x, 6, -y], jitter: 0.5 }),
        part(new THREE.BoxGeometry(alongX ? length : 8, 2, alongX ? 8 : length), '#5f9a4e', { position: [x, 12.5, -y] }),
      ],
    })
  );
  const wallMesh = new THREE.Mesh(wall, surface());
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // Corners: stone toad heads whose mouths are the bees' gates.
  const gateGeometry = toadStatue(['#7d8076', '#6f746a'], '#b8322a');
  for (const corner of corners(44)) group.add(single(gateGeometry, { ...corner, rotation: faceCenter(corner.x, corner.y), scale: 1.5 }));

  // Obstacles.
  const statue = toadStatue();
  const mushroomRed = giantMushroom('#d6463a');
  const mushroomTeal = giantMushroom('#2fa3a0', '#e8fff4');
  const boulder = rock(12, ['#8f8c82', '#7f7c73', '#9a978c']);
  const pine = pineTree(['#2f6e55', '#3a7e60', '#2a6450'], '#6a4a33');
  solid(group, obstacles, statue, { x: 190, y: -40, radius: 24, rotation: Math.PI * 0.75 });
  solid(group, obstacles, statue, { x: -80, y: 230, radius: 24, rotation: Math.PI * 1.1 });
  solid(group, obstacles, mushroomRed, { x: 130, y: 210, radius: 13, scale: 1.2 });
  solid(group, obstacles, mushroomTeal, { x: -250, y: 30, radius: 13, scale: 1.1 });
  solid(group, obstacles, mushroomRed, { x: 40, y: -260, radius: 13, scale: 0.9 });
  solid(group, obstacles, boulder, { x: 250, y: -230, radius: 12, scale: 1.3 });
  solid(group, obstacles, boulder, { x: -60, y: -150, radius: 12, scale: 1.1 });
  solid(group, obstacles, boulder, { x: 290, y: 110, radius: 12, scale: 1 });
  solid(group, obstacles, pine, { x: -280, y: 250, radius: 13, scale: 1.1 });
  solid(group, obstacles, pine, { x: 240, y: 300, radius: 13, scale: 0.95 });
  fillProps(group, obstacles, [[statue, 24, 0.9, 1.1], [mushroomRed, 13, 0.8, 1.3], [mushroomTeal, 13, 0.8, 1.3], [boulder, 12, 0.9, 1.4], [pine, 13, 0.9, 1.2]], 10);

  // The sacred oil spring.
  const spring = { ...xy(-170, -170), radius: 56 };
  const bank = new THREE.Mesh(new THREE.CircleGeometry(spring.radius + 12, 48), new THREE.MeshStandardMaterial({ color: '#8c8a7e', roughness: 0.8 }));
  bank.position.set(spring.x, spring.y, 0.3);
  bank.receiveShadow = true;
  const oil = new THREE.Mesh(
    new THREE.CircleGeometry(spring.radius, 48),
    new THREE.MeshStandardMaterial({ color: '#d8901f', emissive: '#7a3d00', emissiveIntensity: 0.5, roughness: 0.08, metalness: 0.3 })
  );
  oil.position.set(spring.x, spring.y, 0.7);
  group.add(bank, oil);
  const ringStones = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    ringStones.push({ x: spring.x + Math.cos(angle) * (spring.radius + 8), y: spring.y + Math.sin(angle) * (spring.radius + 8), scale: range(0.35, 0.55) });
  }
  group.add(instanced(rock(10, ['#8f8c82', '#9a978c']), ringStones));
  obstacles.push({ x: spring.x, y: spring.y, radius: spring.radius - 4, zone: 'water' });
  const steam = motes({ count: 40, colors: ['#fff6e0', '#ffe2a8'], size: 10, height: 70, speed: 18, sway: 6, emitters: [{ x: spring.x, y: spring.y, z: 2 }], spread: 40, opacity: 0.25, additive: false });
  group.add(steam.points);
  updates.push((time) => {
    steam.update(time);
    oil.material.emissiveIntensity = 0.45 + 0.15 * Math.sin(time * 1.4);
  });

  // The mountain beyond: rock spires, pines and a giant toad statue watching from a peak.
  const keepClear = corners(38).map((c) => ({ ...c, radius: 80 }));
  const spireSpots = scatterPoints(70, { inside: outsideArena(90, 1100), spacing: 110, avoid: keepClear });
  [[160, 0.8], [240, 1], [320, 1.2]].forEach(([height], i) => {
    const spots = spireSpots.filter((_, j) => j % 3 === i).map((s) => ({ ...s, scale: range(0.7, 1.3) }));
    if (spots.length) group.add(instanced(rockSpire(height), spots));
  });
  const forest = scatterPoints(160, { inside: outsideArena(25, 700), spacing: 34, avoid: keepClear });
  group.add(instanced(pine, forest.map((s) => ({ ...s, scale: range(0.8, 1.5) }))));
  const wildMushrooms = scatterPoints(30, { inside: outsideArena(20, 400), spacing: 60, avoid: keepClear });
  group.add(instanced(giantMushroom(pick(['#d6463a', '#2fa3a0', '#c85bd6'])), wildMushrooms.map((s) => ({ ...s, scale: range(0.6, 1.4) }))));

  // (The camera looks toward -x, +y, so landmarks go that way.)
  const [px, py] = far(-760, 620);
  const peak = single(rockSpire(300), { x: px, y: py, scale: 1 });
  const guardian = single(giantTodeStatue(['#8e9188', '#7d8278'], '#c23b22'), { x: px, y: py, z: 300, scale: 4, rotation: faceCenter(px, py) });
  const [qx, qy] = far(-560, 900);
  const peak2 = single(rockSpire(420), { x: qx, y: qy, scale: 1.1 });
  group.add(peak, guardian, peak2);

  // Grass, ferns and pebbles on the field (no collisions).
  const blocked = [...obstacles.map((o) => ({ ...o, radius: o.radius + 14 })), { x: 0, y: 0, radius: 110 }];
  const tuft = model(
    Array.from({ length: 6 }, () => {
      const height = range(6, 12);
      return part(new THREE.ConeGeometry(range(0.8, 1.3), height, 3), pick(['#4f9d3a', '#5fb046', '#3f8a30', '#6cbf4a']), {
        position: [range(-2.5, 2.5), height / 2, range(-2.5, 2.5)],
        rotation: [range(-0.35, 0.35), 0, range(-0.35, 0.35)],
      });
    })
  );
  const fern = model(
    Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2;
      return part(new THREE.ConeGeometry(2.2, 14, 4), pick(['#3f8a40', '#4c9a48']), {
        position: [Math.cos(angle) * 5, 4, Math.sin(angle) * 5],
        rotation: [Math.sin(angle) * 1.1, 0, -Math.cos(angle) * 1.1],
        scale: [1, 1, 0.35],
      });
    })
  );
  group.add(instanced(tuft, scatterPoints(260, { inside: insideArena(12), spacing: 16, avoid: blocked }), { shadows: false }));
  group.add(instanced(fern, scatterPoints(40, { inside: insideArena(20), spacing: 40, avoid: blocked }).map((p) => ({ ...p, scale: range(0.8, 1.4) }))));
  group.add(instanced(rock(10, ['#8f8c82', '#9a978c']), scatterPoints(30, { inside: insideArena(20), spacing: 40, avoid: blocked }).map((p) => ({ ...p, scale: range(0.2, 0.4) }))));

  // Golden motes and slow mist.
  const sparkles = motes({ count: 140, colors: ['#ffe9a0', '#fff6d0', '#c8ffb0'], size: 3, height: 90, speed: 10, sway: 18 });
  const mist = motes({ count: 24, colors: ['#ffffff'], size: 120, height: 30, speed: 2, sway: 40, area: half + 300, opacity: 0.06, additive: false });
  group.add(sparkles.points, mist.points);
  updates.push((time) => {
    sparkles.update(time);
    mist.update(time);
  });

  setDetail(0);
  return { group, obstacles, update: (time, delta) => updates.forEach((fn) => fn(time, delta)) };
}

// --- Sky Citadel -----------------------------------------------------------------------

function buildSkyCitadel() {
  startBuild(6202, 2);
  const group = new THREE.Group();
  const obstacles = [];
  const updates = [];

  // Polished marble with a golden mandala in the middle.
  const texture = canvasTexture(2048, (ctx, size) => {
    const tiles = 12;
    const tile = size / tiles;
    for (let row = 0; row < tiles; row++) {
      for (let col = 0; col < tiles; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#d6cfc2' : '#cbc2b1';
        ctx.fillRect(col * tile, row * tile, tile, tile);
      }
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(150, 140, 120, ${range(0.08, 0.25)})`;
      ctx.lineWidth = range(1, 3);
      ctx.beginPath();
      let x = range(0, size);
      let y = range(0, size);
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += range(-120, 120);
        y += range(-120, 120);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200, 160, 60, 0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tile, 0);
      ctx.lineTo(i * tile, size);
      ctx.moveTo(0, i * tile);
      ctx.lineTo(size, i * tile);
      ctx.stroke();
    }
    // Mandala: rings of lapis and gold with petals.
    const c = size / 2;
    for (const [radius, color, width] of [[330, '#2f5fb8', 26], [300, '#e8c25a', 8], [210, '#e8c25a', 6], [120, '#2f5fb8', 18]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232, 194, 90, 0.85)';
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      ctx.save();
      ctx.translate(c + Math.cos(angle) * 255, c + Math.sin(angle) * 255);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  const floor = ground(texture, { roughness: 0.45, metalness: 0.05, margin: 40 });
  group.add(floor);
  const base = slab('#9d8f7c', 180, 40);
  group.add(base);

  // A sea of clouds far below, and cloud banks around the island.
  const cloudTexture = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#eef4ff';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const x = range(0, size);
      const y = range(0, size);
      const r = range(20, 90);
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
          gradient.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
  }, WORLD_SIZE / 600);
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), new THREE.MeshLambertMaterial({ map: cloudTexture }));
  clouds.position.z = -260;
  group.add(clouds);
  const puffs = [];
  for (let i = 0; i < 70; i++) {
    const angle = range(0, Math.PI * 2);
    const distance = MAP_HALF_SIZE * 1.3 + range(0, 900);
    puffs.push({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, z: range(-200, -60), scale: range(40, 110) });
  }
  const puffGeometry = new THREE.IcosahedronGeometry(1, 3);
  const puffMesh = new THREE.InstancedMesh(puffGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), puffs.length);
  const matrix = new THREE.Matrix4();
  puffs.forEach((p, i) => {
    matrix.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(p.scale * 1.6, p.scale, p.scale * 0.55));
    puffMesh.setMatrixAt(i, matrix);
  });
  group.add(puffMesh);

  group.add(skyDome({ top: '#2f7fd6', horizon: '#d2ecff', bottom: '#f4f8ff', sunColor: '#fff7e0', sunDirection: [-0.5, 0.6, 0.45] }));

  // Balustrade with golden caps.
  const rail = model(
    boundary({
      spacing: 22,
      offset: 10,
      post: (x, y) => [
        part(new THREE.CylinderGeometry(2.2, 2.8, 16, 10), '#f4f0e8', { position: [x, 8, -y] }),
        part(new THREE.SphereGeometry(2.6, 10, 8), '#e8c25a', { position: [x, 19, -y] }),
      ],
      rail: (x, y, length, alongX) => [part(new THREE.BoxGeometry(alongX ? length : 5, 3, alongX ? 5 : length), '#f4f0e8', { position: [x, 16, -y] })],
    })
  );
  const railMesh = new THREE.Mesh(rail, surface());
  railMesh.castShadow = railMesh.receiveShadow = true;
  group.add(railMesh);

  // Corners: golden hive shrines with halos.
  const shrine = model([
    part(new THREE.CylinderGeometry(22, 26, 10, 16), '#f4f0e8', { position: [0, 5, 0] }),
    part(new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => new THREE.Vector2(Math.max(0.01, 15 * Math.sqrt(1 - (i / 11) ** 1.8)), (i / 11) * 28)), 16), '#e8c25a', { position: [0, 10, 0] }),
  ]);
  const halos = [];
  for (const corner of corners(50)) {
    group.add(single(shrine, { ...corner, scale: 1.2 }));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(20, 1.2, 8, 48), new THREE.MeshBasicMaterial({ color: '#fff0b0', toneMapped: false }));
    halo.position.set(corner.x, corner.y, 58);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    halos.push(halo);
  }

  // Obstacles: columns (some broken), winged statues and a fountain.
  const tall = column(64);
  const broken = column(28, { broken: true });
  const statue = toadStatue(['#f2eee6', '#e2dccf'], '#e8c25a', '#2f5fb8');
  const spots = [
    [tall, 200, -60, 1],
    [tall, -200, 60, 1],
    [broken, 60, 250, 1],
    [tall, -60, -250, 1],
    [broken, 270, 220, 1],
    [broken, -270, -220, 1],
  ];
  for (const [geometry, x, y, scale] of spots) solid(group, obstacles, geometry, { x, y, radius: 12, scale, rotation: 0 });
  solid(group, obstacles, statue, { x: 240, y: -250, radius: 24, rotation: Math.PI * 0.75 });
  solid(group, obstacles, statue, { x: -250, y: 240, radius: 24, rotation: -Math.PI * 0.25 });
  fillProps(group, obstacles, [[tall, 12, 1, 1], [broken, 12, 1, 1], [statue, 24, 0.9, 1.1]], 8);

  const fountain = { ...xy(160, 120), radius: 46 };
  const basin = model([
    part(new THREE.CylinderGeometry(50, 52, 10, 32, 1, true), '#f4f0e8', { position: [0, 5, 0] }),
    part(new THREE.TorusGeometry(51, 3, 8, 48), '#e8c25a', { position: [0, 10, 0], rotation: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(5, 7, 28, 12), '#f4f0e8', { position: [0, 14, 0] }),
    part(new THREE.CylinderGeometry(16, 4, 6, 20), '#f4f0e8', { position: [0, 30, 0] }),
    part(new THREE.CylinderGeometry(3, 4, 12, 10), '#e8c25a', { position: [0, 38, 0] }),
  ]);
  group.add(single(basin, { x: fountain.x, y: fountain.y, rotation: 0 }));
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(49, 48),
    new THREE.MeshPhysicalMaterial({ color: '#7fd0ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85, clearcoat: 1 })
  );
  water.position.set(fountain.x, fountain.y, 7);
  group.add(water);
  obstacles.push({ ...fountain, zone: 'water' });
  const jets = motes({ count: 70, colors: ['#e8f8ff', '#bfe9ff'], size: 4, height: 40, speed: -40, sway: 2, emitters: [{ x: fountain.x, y: fountain.y, z: 8 }], spread: 12, opacity: 0.35 });
  group.add(jets.points);

  // Floating islands, giant golden rings and pillars of light.
  const islands = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + range(0, 0.4);
    const distance = MAP_HALF_SIZE + 220 + range(0, 600);
    const size = range(25, 60);
    const island = new THREE.Group();
    island.add(single(floatingIsland(size), { x: 0, y: 0 }));
    island.add(single(roundTree(['#ffb7d5', '#ff9ec7', '#ffd1e3'], '#d9c7a8'), { x: 0, y: 0, z: size * 0.12, scale: size / 40 }));
    island.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, range(40, 220));
    island.userData = { phase: range(0, Math.PI * 2), baseZ: island.position.z };
    group.add(island);
    islands.push(island);
  }
  const rings = [0, 1, 2].map((i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(260 + i * 120, 6, 12, 120),
      new THREE.MeshStandardMaterial({ color: '#ffd36b', emissive: '#a06a00', emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.2 })
    );
    ring.position.set(...far(-760, 760), 60);
    ring.rotation.set(0.9 + i * 0.35, 0.3 * i, 0);
    group.add(ring);
    return ring;
  });
  const sparkles = motes({ count: 160, colors: ['#ffffff', '#fff3c4', '#cfe8ff'], size: 3, height: 140, speed: 12, sway: 20 });
  group.add(sparkles.points);

  updates.push((time) => {
    jets.update(time);
    sparkles.update(time);
    for (const island of islands) {
      island.position.z = island.userData.baseZ + Math.sin(time * 0.5 + island.userData.phase) * 12;
      island.rotation.z = Math.sin(time * 0.15 + island.userData.phase) * 0.25;
    }
    rings.forEach((ring, i) => (ring.rotation.z = time * (0.05 + i * 0.03)));
    halos.forEach((halo, i) => (halo.position.z = 58 + Math.sin(time * 1.5 + i) * 4));
  });

  setDetail(0);
  return { group, obstacles, update: (time, delta) => updates.forEach((fn) => fn(time, delta)) };
}

// --- Tournament of the Gods ---------------------------------------------------------------

function buildCosmos() {
  startBuild(6303, 3);
  const group = new THREE.Group();
  const obstacles = [];
  const updates = [];

  // The tournament ring: big stone tiles with a fiery emblem.
  const texture = canvasTexture(2048, (ctx, size) => {
    const tiles = 10;
    const tile = size / tiles;
    for (let row = 0; row < tiles; row++) {
      for (let col = 0; col < tiles; col++) {
        // Dark polished obsidian: the celestial glow layer (below) shines through it.
        const shade = 46 + Math.floor(range(-8, 8));
        ctx.fillStyle = `rgb(${shade + 6}, ${shade}, ${shade + 22})`;
        ctx.fillRect(col * tile + 3, row * tile + 3, tile - 6, tile - 6);
      }
    }
    speckle(ctx, size, 20000, ['rgba(90,80,70,0.15)', 'rgba(255,255,255,0.12)'], 3);
    // Cracks from the fighting.
    ctx.strokeStyle = 'rgba(40, 30, 30, 0.5)';
    for (let i = 0; i < 26; i++) {
      ctx.lineWidth = range(1, 3);
      ctx.beginPath();
      let x = range(0, size);
      let y = range(0, size);
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += range(-90, 90);
        y += range(-90, 90);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // The emblem: a tea leaf in a circle.
    const c = size / 2;
    ctx.strokeStyle = '#e8641c';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(c, c, 260, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232, 100, 28, 0.9)';
    ctx.beginPath();
    ctx.ellipse(c, c, 170, 80, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 230, 190, 0.9)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(c - 120, c + 120);
    ctx.lineTo(c + 120, c - 120);
    ctx.stroke();
  });
  group.add(ground(texture, { roughness: 0.35, metalness: 0.3, margin: 30 }));
  group.add(slab('#3a3448', 120, 30));
  // The ring is alive: a nebula drifts under the stone, the seams pulse with light rippling out from the middle,
  // stars twinkle in the tiles and a ring of runes turns around the field.
  const celestial = floorOverlay(`
    float tile = halfSize * 2.0 / 10.0;
    vec2 g = abs(fract(p / tile) - 0.5);
    float seam = smoothstep(0.47, 0.5, max(g.x, g.y));
    float r = length(p);
    float ripple = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(time * 2.2 - r * 0.025), 3.0);
    glow += seam * ripple * vec3(0.32, 0.2, 0.7);
    float n = fbm(p * 0.006 + vec2(time * 0.03, -time * 0.02));
    glow += smoothstep(0.45, 0.85, n) * mix(vec3(0.35, 0.1, 0.6), vec3(0.05, 0.45, 0.6), fbm(p * 0.004 - time * 0.01)) * 0.55;
    vec2 cell = floor(p / 10.0);
    float h = hash(cell);
    float twinkle = 0.5 + 0.5 * sin(time * (2.0 + h * 4.0) + h * 60.0);
    glow += step(0.972, h) * twinkle * smoothstep(0.32, 0.0, length(fract(p / 10.0) - 0.5)) * vec3(0.85, 0.85, 1.0);
    float ringR = halfSize * 0.86;
    float ring = exp(-pow((r - ringR) / 5.0, 2.0)) * step(0.35, fract(atan(p.y, p.x) * 48.0 / 6.2832 + time * 0.15));
    glow += ring * vec3(0.9, 0.45, 0.2) * 0.8;`, 30);
  group.add(celestial);
  updates.push((time) => (celestial.material.uniforms.time.value = time));
  // Steps around the ring.
  const steps = model([
    ...[0, 1, 2].map((i) =>
      part(new THREE.CylinderGeometry((MAP_HALF_SIZE + 30 + i * 22) * Math.SQRT2, (MAP_HALF_SIZE + 30 + i * 22) * Math.SQRT2, 6, 4, 1), i % 2 ? '#a9a2ae' : '#c0b9c2', {
        position: [0, -4 - i * 8, 0],
        rotation: [0, Math.PI / 4, 0],
      })
    ),
  ]);
  group.add(single(steps, { x: 0, y: 0, rotation: 0, prop: false }));

  group.add(
    skyDome({
      top: '#05030f',
      horizon: '#2a1050',
      bottom: '#0a0618',
      nebulaA: '#7a2cff',
      nebulaB: '#18c0ff',
      nebula: 0.75,
      stars: 0.07,
      sunColor: '#c8b8ff',
    })
  );

  // A giant ringed planet and a pale moon.
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(420, 64, 32),
    new THREE.MeshStandardMaterial({ color: '#7a4fd8', emissive: '#2a1060', emissiveIntensity: 0.6, roughness: 0.7 })
  );
  planet.position.set(-2100, 1700, 900);
  const planetRing = new THREE.Mesh(
    new THREE.RingGeometry(520, 760, 96),
    new THREE.MeshBasicMaterial({ color: '#c8a8ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  planetRing.position.copy(planet.position);
  planetRing.rotation.set(1.1, 0.3, 0);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(110, 48, 24), new THREE.MeshStandardMaterial({ color: '#dcd6ee', emissive: '#4a4466', emissiveIntensity: 0.5 }));
  moon.position.set(-900, 2300, 1100);
  group.add(planet, planetRing, moon);

  // Corners: rifts in reality, where the bees pour through.
  const rifts = [];
  for (const corner of corners(46)) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(30, 3, 12, 64),
      new THREE.MeshStandardMaterial({ color: '#2a1a40', emissive: '#a04aff', emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 })
    );
    const disc = portalDisc(28, '#ffffff', '#7a2cff');
    const rift = new THREE.Group();
    rift.add(rim, disc);
    rift.position.set(corner.x, corner.y, 36);
    rift.rotation.set(Math.PI / 2, 0, corner.rotation, 'ZXY');
    group.add(rift);
    rifts.push({ rift, disc });
  }

  // Obelisks with glowing runes, levitating boulders, and the energy well.
  const runeGlow = glowMaterial();
  const tallObelisk = obelisk(70, '#7ff9ff');
  for (const [x, y] of [[210, -110], [-210, 110], [110, 250], [-110, -250]]) {
    solid(group, obstacles, tallObelisk.stone, { x, y, radius: 14, rotation: 0 });
    group.add(single(tallObelisk.runes, { ...xy(x, y), rotation: 0, look: runeGlow }));
  }
  fillProps(group, obstacles, [[tallObelisk.stone, 14, 0.8, 1.1]], 4);
  const boulderGeometry = rock(14, ['#5a5266', '#4a4458', '#6a6278']);
  const floaters = [];
  for (const [x, y] of [[260, 180], [-260, -170], [-40, 280]].map(([a, b]) => at(a, b))) {
    obstacles.push({ x, y, radius: 16 });
    const boulder = single(boulderGeometry, { x, y, z: 14, scale: 1.3 });
    boulder.userData.phase = range(0, Math.PI * 2);
    group.add(boulder);
    floaters.push(boulder);
  }
  const well = { ...xy(-180, -40), radius: 44 };
  const wellRim = model([part(new THREE.TorusGeometry(46, 6, 12, 64), '#4a4458', { rotation: [Math.PI / 2, 0, 0], position: [0, 3, 0] })]);
  group.add(single(wellRim, { x: well.x, y: well.y, rotation: 0, prop: false }));
  const wellDisc = portalDisc(44, '#ffffff', '#18c0ff');
  wellDisc.position.set(well.x, well.y, 1.5);
  group.add(wellDisc);
  obstacles.push({ ...well, zone: 'rift' });
  const beam = motes({ count: 70, colors: ['#9ff4ff', '#c8a8ff', '#6fd8ff'], size: 5, height: 160, speed: 60, sway: 4, emitters: [{ x: well.x, y: well.y, z: 2 }], spread: 30, opacity: 0.35 });
  group.add(beam.points);

  // Two colossal Tode gods watch the tournament from the void.
  const godStone = ['#d9d2e6', '#bfb6d2'];
  const god = toadStatue(godStone, '#ff8a2a', '#7ff9ff');
  const [lx, ly] = far(-1000, 420);
  const [rx, ry] = far(-420, 1000);
  const leftGod = single(god, { x: lx, y: ly, z: -260, scale: 11, rotation: faceCenter(lx, ly) });
  const rightGod = single(god, { x: rx, y: ry, z: -260, scale: 11, rotation: faceCenter(rx, ry) });
  group.add(leftGod, rightGod);

  // Asteroids drifting past.
  const asteroids = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#6a6278', roughness: 0.9, flatShading: true }), 60);
  const asteroidData = Array.from({ length: 60 }, () => ({
    radius: range(MAP_HALF_SIZE + 300, 1800),
    angle: range(0, Math.PI * 2),
    z: range(-300, 400),
    size: range(8, 40),
    speed: range(0.01, 0.04),
  }));
  group.add(asteroids);
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  const stardust = motes({ count: 380, colors: ['#c8a8ff', '#9ff4ff', '#ffffff'], size: 3, height: 200, speed: 15, sway: 30 });
  group.add(stardust.points);

  updates.push((time) => {
    beam.update(time);
    stardust.update(time);
    wellDisc.material.uniforms.time.value = time;
    for (const { disc } of rifts) disc.material.uniforms.time.value = time;
    rifts.forEach(({ rift }, i) => (rift.children[0].rotation.z = time * (1 + i * 0.2)));
    for (const boulder of floaters) {
      boulder.position.z = 14 + Math.sin(time * 1.2 + boulder.userData.phase) * 6;
      boulder.rotation.z = time * 0.3 + boulder.userData.phase;
    }
    asteroidData.forEach((a, i) => {
      const angle = a.angle + time * a.speed;
      quaternion.setFromEuler(euler.set(time * a.speed * 5, time * a.speed * 3, angle));
      matrix.compose(position.set(Math.cos(angle) * a.radius, Math.sin(angle) * a.radius, a.z), quaternion, scale.setScalar(a.size));
      asteroids.setMatrixAt(i, matrix);
    });
    asteroids.instanceMatrix.needsUpdate = true;
    planet.rotation.z = time * 0.02;
  });

  setDetail(0);
  return { group, obstacles, update: (time, delta) => updates.forEach((fn) => fn(time, delta)) };
}

// --- The Underworld -------------------------------------------------------------------

function buildUnderworld() {
  startBuild(6404, 4);
  const group = new THREE.Group();
  const obstacles = [];
  const updates = [];

  // Basalt slabs with glowing, branching cracks; the cracks are painted again as an emissive map.
  const cracks = [];
  const crack = (x, y, angle, steps, width) => {
    const path = [[x, y]];
    for (let i = 0; i < steps; i++) {
      angle += range(-0.45, 0.45);
      const step = range(14, 28);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      path.push([x, y]);
      if (range(0, 1) < 0.16 && width > 1.5) crack(x, y, angle + range(0.6, 1.2) * (range(0, 1) < 0.5 ? -1 : 1), Math.floor(steps * 0.5), width * 0.6);
    }
    cracks.push({ path, width });
  };
  for (let i = 0; i < 26; i++) crack(range(0, 2048), range(0, 2048), range(0, Math.PI * 2), Math.floor(range(6, 16)), range(2.5, 5));
  const drawCracks = (ctx, scale, glow) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [color, extra, blur] of glow) {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * scale;
      for (const { path, width } of cracks) {
        ctx.lineWidth = (width + extra) * scale;
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale)));
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  };
  const texture = canvasTexture(2048, (ctx, size) => {
    const tiles = 14;
    const tile = size / tiles;
    ctx.fillStyle = '#120c0c';
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < tiles; row++) {
      for (let col = 0; col < tiles; col++) {
        const shade = 56 + Math.floor(range(-10, 10));
        ctx.fillStyle = `rgb(${shade + 8}, ${shade}, ${shade - 2})`;
        ctx.fillRect(col * tile + 3, row * tile + 3, tile - 6, tile - 6);
      }
    }
    speckle(ctx, size, 24000, ['rgba(0,0,0,0.3)', 'rgba(140,70,50,0.12)', 'rgba(90,80,80,0.2)'], 3);
    drawCracks(ctx, 1, [['#3a0a02', 7, 0], ['#c2380a', 1.5, 12], ['#ffd27a', -0.8, 4]]);
  });
  const glowMap = canvasTexture(1024, (ctx, size) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    drawCracks(ctx, 0.5, [['#ff6a20', 2, 14], ['#ffffff', -0.5, 3]]);
  });
  const floor = ground(texture, { roughness: 0.55, metalness: 0.15, emissiveMap: glowMap, emissive: '#ff5a14', margin: 30 });
  group.add(floor);
  group.add(slab('#241a1a', 140, 30));
  // Magma moves under the floor, a summoning sigil burns in the middle, and sparks flicker across the stone.
  const inferno = floorOverlay(`
    float n = fbm(p * 0.006 + vec2(time * 0.04, time * 0.015));
    float m = fbm(p * 0.013 - vec2(time * 0.06, 0.0));
    glow += smoothstep(0.55, 0.8, n) * (0.5 + 0.5 * m) * vec3(0.55, 0.12, 0.02);
    float r = length(p);
    float a = atan(p.y, p.x);
    float R = halfSize * 0.42;
    float circles = exp(-pow((r - R) / 3.0, 2.0)) + exp(-pow((r - R * 0.78) / 2.2, 2.0)) * 0.8;
    // Six spokes of a star between the circles, turning slowly.
    float spokes = 0.0;
    for (int i = 0; i < 6; i++) {
      float ang = float(i) * 1.0472 + time * 0.05;
      vec2 d = vec2(cos(ang), sin(ang));
      vec2 e = vec2(cos(ang + 2.0944), sin(ang + 2.0944));
      vec2 pa = p - d * R * 0.78;
      vec2 ba = (e - d) * R * 0.78;
      float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      spokes += exp(-pow(length(pa - ba * t) / 2.0, 2.0));
    }
    float runes = exp(-pow((r - R * 1.1) / 4.0, 2.0)) * step(0.55, fract(a * 36.0 / 6.2832 - time * 0.1));
    float pulse = 0.55 + 0.45 * sin(time * 1.8);
    glow += (circles + spokes * 0.7 + runes) * pulse * vec3(0.85, 0.12, 0.04);
    vec2 cell = floor(p / 8.0);
    float h = hash(cell + floor(time * 0.5));
    glow += step(0.992, h) * smoothstep(0.35, 0.0, length(fract(p / 8.0) - 0.5)) * vec3(0.9, 0.5, 0.1);`, 30);
  group.add(inferno);

  // A sea of lava.
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), lavaMaterial());
  lava.position.z = -60;
  group.add(lava);
  group.add(skyDome({ top: '#0a0000', horizon: '#6a1606', bottom: '#ff4a10', nebulaA: '#ff2a00', nebulaB: '#401010', nebula: 0.35, sunColor: '#ff6a2a' }));

  // Obsidian spikes around the edge.
  const spikes = model(
    boundary({
      spacing: 26,
      offset: 12,
      post: (x, y) => {
        const h = range(18, 34);
        return [part(new THREE.ConeGeometry(4, h, 6), pick(['#1b1418', '#241a20']), { position: [x, h / 2, -y], rotation: [range(-0.2, 0.2), 0, range(-0.2, 0.2)] })];
      },
    })
  );
  const spikeMesh = new THREE.Mesh(spikes, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.4 }));
  spikeMesh.castShadow = true;
  group.add(spikeMesh);

  // Corners: hellgates of horn and fire.
  const gates = [];
  const horn = model([
    part(new THREE.ConeGeometry(7, 70, 10), '#1b1418', { position: [-26, 30, 0], rotation: [0, 0, 0.35] }),
    part(new THREE.ConeGeometry(7, 70, 10), '#1b1418', { position: [26, 30, 0], rotation: [0, 0, -0.35] }),
    part(new THREE.BoxGeometry(70, 8, 16), '#2a1a14', { position: [0, 4, 0] }),
  ]);
  for (const corner of corners(46)) {
    group.add(single(horn, { ...corner, rotation: corner.rotation }));
    const disc = portalDisc(26, '#ffe08a', '#ff2a00');
    disc.position.set(corner.x, corner.y, 34);
    disc.rotation.set(Math.PI / 2, 0, corner.rotation, 'ZXY');
    group.add(disc);
    gates.push(disc);
  }

  // Obstacles: spires, horned skulls, braziers and a lava pool.
  const spire = obsidianSpire(70);
  const spireLook = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.5 });
  for (const [x, y] of [[220, -90], [-230, 110], [90, 260], [-60, -270]]) {
    solid(group, obstacles, spire, { x, y, radius: 14, look: spireLook });
  }
  const skullGeometry = skull();
  solid(group, obstacles, skullGeometry, { x: 260, y: 210, radius: 18, rotation: Math.PI * 0.8 });
  solid(group, obstacles, skullGeometry, { x: -250, y: -230, radius: 18, rotation: -Math.PI * 0.2 });
  fillProps(group, obstacles, [[spire, 14, 0.8, 1.3, spireLook], [skullGeometry, 18, 0.9, 1.1]], 8);
  const bowl = brazier();
  const fires = [];
  for (const [x, y] of [[120, -230], [-120, 230], [270, 40], [-280, -40]]) {
    solid(group, obstacles, bowl, { x, y, radius: 9, rotation: 0 });
    fires.push({ ...xy(x, y), z: 26 });
  }
  const flames = motes({ count: 120, colors: ['#ff6a00', '#ffb020', '#ff8a2a'], size: 7, height: 34, speed: 40, sway: 2, emitters: fires, spread: 4, opacity: 0.45 });
  group.add(flames.points);

  const pool = { ...xy(150, 140), radius: 50 };
  const poolRim = model([part(new THREE.TorusGeometry(52, 7, 10, 64), '#2a1d1d', { rotation: [Math.PI / 2, 0, 0], position: [0, 2, 0], jitter: 1.5 })]);
  group.add(single(poolRim, { x: pool.x, y: pool.y, rotation: 0, prop: false }));
  const poolLava = new THREE.Mesh(new THREE.CircleGeometry(50, 48), lavaMaterial('#ff4a10', 5000, 6000));
  poolLava.position.set(pool.x, pool.y, 0.8);
  group.add(poolLava);
  obstacles.push({ ...pool, zone: 'lava' });
  const bubbles = motes({ count: 40, colors: ['#ffb020', '#ff6a00'], size: 6, height: 26, speed: 20, sway: 3, emitters: [{ x: pool.x, y: pool.y, z: 1 }], spread: 34, opacity: 0.5 });
  group.add(bubbles.points);

  // Rubble and obsidian shards on the floor (no collisions).
  const blocked = [...obstacles.map((o) => ({ ...o, radius: o.radius + 14 })), { x: 0, y: 0, radius: 110 }];
  group.add(instanced(rock(8, ['#3a2a28', '#2e2220', '#48342e']), scatterPoints(70, { inside: insideArena(14), spacing: 30, avoid: blocked }).map((p) => ({ ...p, scale: range(0.25, 0.6) }))));
  const shard = model([part(new THREE.ConeGeometry(2.5, 12, 5), '#1b1418', { position: [0, 5, 0], rotation: [0.3, 0, 0.2] }), part(new THREE.ConeGeometry(1.8, 8, 5), '#241a20', { position: [3, 3.5, 1], rotation: [-0.2, 0, -0.5] })]);
  group.add(instanced(shard, scatterPoints(40, { inside: insideArena(14), spacing: 40, avoid: blocked }).map((p) => ({ ...p, scale: range(0.8, 1.6) })), { surface: spireLook }));

  // Volcanoes, and a giant ribcage sunk in the lava.
  const volcanoGeometry = model([
    part(new THREE.ConeGeometry(260, 420, 16, 4, true), '#2a1d1d', { position: [0, 210, 0], jitter: 14 }),
    part(new THREE.CylinderGeometry(52, 52, 6, 24), '#ff6a14', { position: [0, 396, 0] }),
  ]);
  const volcanoes = [[-1100, 700, 1], [-650, 1150, 0.85], [-1350, 150, 0.75]].map(([fx, fy, s]) => {
    const [x, y] = far(fx, fy);
    const volcano = single(volcanoGeometry, { x, y, z: -60, scale: s, rotation: 0 });
    group.add(volcano);
    return { x, y, z: -60 + 400 * s };
  });
  const plumes = motes({ count: 120, colors: ['#ff6a00', '#c84010', '#5a2010'], size: 40, height: 500, speed: 60, sway: 40, emitters: volcanoes, spread: 30, opacity: 0.4 });
  group.add(plumes.points);
  const rib = model(
    Array.from({ length: 7 }, (_, i) =>
      part(new THREE.TorusGeometry(140 - i * 8, 9, 8, 24, Math.PI), '#d8cdb4', { position: [0, 0, i * 60 - 180], rotation: [0, 0, 0] })
    ).concat([part(new THREE.CylinderGeometry(12, 12, 400, 10), '#cfc3a8', { position: [0, 140, 0], rotation: [Math.PI / 2, 0, 0] })])
  );
  group.add(single(rib, { ...xy(-640, 640), z: -70, scale: 1.2, rotation: 0.7 }));

  const embers = motes({ count: 420, colors: ['#ff6a00', '#ffb020', '#ff3b1f'], size: 3.5, height: 220, speed: 30, sway: 25 });
  const ash = motes({ count: 140, colors: ['#5a4a48', '#3a302e'], size: 4, height: 220, speed: -14, sway: 30, additive: false, opacity: 0.7 });
  group.add(embers.points, ash.points);

  updates.push((time) => {
    lava.material.uniforms.time.value = time;
    poolLava.material.uniforms.time.value = time;
    inferno.material.uniforms.time.value = time;
    for (const gate of gates) gate.material.uniforms.time.value = time;
    floor.material.emissiveIntensity = 0.75 + 0.35 * Math.sin(time * 1.6) + 0.15 * Math.sin(time * 4.3);
    flames.update(time);
    bubbles.update(time);
    plumes.update(time);
    embers.update(time);
    ash.update(time);
  });

  setDetail(0);
  return { group, obstacles, update: (time, delta) => updates.forEach((fn) => fn(time, delta)) };
}
