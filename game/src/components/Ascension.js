import * as THREE from 'three';

/**
 * Tode's transformations, like a martial-arts hero powering up: from a plain frog to an all-powerful god.
 * Power comes from brews (duo and legendary brews count double), skills and the ultimate.
 */
export const TIERS = [
  { name: 'Tode', power: 0 },
  { name: 'Awakened Tode', power: 3, banner: 'TODE AWAKENS', sub: 'A white wind swirls around him…' },
  { name: 'Golden Tode', power: 10, banner: 'GOLDEN TODE', sub: 'His power erupts in golden flame!' },
  { name: 'Radiant Tode', power: 20, banner: 'RADIANT TODE', sub: 'Lightning crackles, the stars answer his call.' },
  { name: 'Tode, God of Tea', power: 36, banner: 'GOD OF TEA', sub: 'A vortex of divine fire. Reality bends.' },
  { name: 'Omnitode', power: 54, banner: 'OMNITODE', sub: 'The stars themselves pour into him.' },
];

/**
 * The look of every stage (each one unique, and each one grander than the last):
 * - Awakened: a white flame and spiralling wind.
 * - Golden: a towering golden flame with spiky tongues, a golden crest and a storm of embers.
 * - Radiant: the golden flame crackling with lightning, golden spirals, sparks streaming into him and rocks rising.
 * - God of Tea: a calm crimson flame inside a swirling vortex of fire, a halo, runes and a sparkle storm.
 * - Omnitode: a silver-violet flame, silver spirals, a galaxy under his feet and stars flying into him nonstop.
 *
 * `aura`: [outer, inner] flame colours and opacities; `swirls`: spiral ribbons; `inflow`: stars per second flying
 * into him; `arc`: lightning; `orbit`: sparkles circling him; `debris`: rocks rising around him.
 */
const STAGES = [
  null,
  {
    aura: { colors: ['#bfe8ff', '#ffffff'], opacity: [0.5, 0.25], height: 52, width: 21, speed: 1 },
    swirls: { count: 2, colors: ['#ffffff', '#cfefff'], radius: 24, height: 58, turns: 1.6, speed: 1.4, width: 1.3, opacity: 0.6 },
    inflow: { rate: 4, colors: ['#ffffff', '#cfefff'] },
  },
  {
    aura: { colors: ['#ffb000', '#fff3a0'], opacity: [0.75, 0.35], height: 78, width: 26, speed: 1.6, spiky: 1 },
    crest: { color: '#ffd23f', glow: '#ffb000', size: 1 },
    inflow: { rate: 8, colors: ['#ffe680', '#ffffff'] },
    groundGlow: '#ffb000',
  },
  {
    aura: { colors: ['#ffc21a', '#e8f6ff'], opacity: [0.75, 0.3], height: 88, width: 28, speed: 2, spiky: 1.3 },
    crest: { color: '#ffe680', glow: '#ffc000', size: 1.3 },
    swirls: { count: 3, colors: ['#ffe680', '#ffffff', '#9fd8ff'], radius: 30, height: 80, turns: 2, speed: 2.2, width: 1.5, opacity: 0.5 },
    inflow: { rate: 30, colors: ['#ffe680', '#ffffff', '#9fd8ff'] },
    arc: { color: '#bfe8ff', every: 0.035, reach: 46 },
    debris: 10,
    groundGlow: '#ffc000',
  },
  {
    aura: { colors: ['#ff1a3c', '#ffb36b'], opacity: [0.6, 0.25], height: 92, width: 27, speed: 1.2, spiky: 0.8 },
    crest: { color: '#ff4a6a', glow: '#ff1a4a', size: 1.35 },
    // The vortex of divine fire.
    swirls: { count: 4, colors: ['#ff5a1a', '#ffb020', '#ff2a3a', '#ffe08a'], radius: 38, height: 96, turns: 2.4, speed: 2.8, width: 2.4, opacity: 0.55, fire: true },
    inflow: { rate: 40, colors: ['#ffd6e0', '#ffffff', '#ffd36b'] },
    arc: { color: '#ffd6e0', every: 0.08, reach: 36 },
    orbit: 48,
    halo: '#ffd36b',
    runes: ['#ffd36b', '#c8b0ff'],
    groundGlow: '#ff3b5c',
  },
  {
    aura: { colors: ['#7a8cff', '#b8a8ff'], opacity: [0.6, 0.18], height: 104, width: 30, speed: 2.4, spiky: 1.1 },
    crest: { color: '#e8f0ff', glow: '#9fb8ff', size: 1.45 },
    swirls: { count: 6, colors: ['#b8a0ff', '#7fe0ff', '#d8c0ff', '#8fa8ff'], radius: 42, height: 110, turns: 2.8, speed: 3.4, width: 1.6, opacity: 0.45 },
    inflow: { rate: 70, colors: ['#ffffff', '#c8d8ff', '#e0c8ff', '#9ff4ff'] },
    arc: { color: '#e0e8ff', every: 0.05, reach: 44 },
    orbit: 64,
    halo: '#e0e8ff',
    runes: ['#c8b0ff', '#9ff4ff'],
    galaxy: true,
    groundGlow: '#9fb8ff',
  },
];

/** Aura and cut-scene colour per stage. */
export const STAGE_COLORS = ['#ffffff', '#cfefff', '#ffc93c', '#ffe680', '#ff4a6a', '#c8d8ff'];

// Per tier: model scale, how gold he turns, glow, metal look, post-processing.
const LOOKS = [
  { scale: 1, gold: 0, glow: 0, metal: 0, bloom: 0.35, warp: 0, aberration: 0 },
  { scale: 1.05, gold: 0.1, glow: 0.12, metal: 0, bloom: 0.45, warp: 0, aberration: 0 },
  { scale: 1.12, gold: 0.25, glow: 0.24, metal: 0.15, bloom: 0.6, warp: 0, aberration: 0 },
  { scale: 1.2, gold: 0.5, glow: 0.3, metal: 0.55, bloom: 0.75, warp: 0.12, aberration: 0.15 },
  { scale: 1.3, gold: 0.7, glow: 0.35, metal: 0.4, bloom: 0.6, warp: 0.55, aberration: 0.45 },
  { scale: 1.38, gold: 0.6, glow: 0.18, metal: 0.6, bloom: 0.5, warp: 0.6, aberration: 0.5 },
];

const GOLD = new THREE.Color('#ffc93c');
const DIVINE = new THREE.Color('#ffc4b4'); // the god form's rose-gold glow
const CELESTIAL = new THREE.Color('#d8e4ff'); // the infinite form's silver glow
const bodyGlow = (tier) => (tier === 5 ? CELESTIAL : tier === 4 ? DIVINE : GOLD);
const FLAMES = [
  ['#ffe680', '#ffc93c', '#ffffff'],
  ['#ffffff', '#cfefff', '#9fd8ff'],
  ['#ffe066', '#ffb020', '#ff8a1f', '#ffffff'],
  ['#fff2a8', '#ffd040', '#ffffff', '#9fd8ff'],
  ['#ff3b5c', '#ff8a2a', '#ffd36b', '#ffffff'],
  ['#c8d8ff', '#c8b0ff', '#9ff4ff', '#8fa8ff'],
];
const PARTICLES_PER_SECOND = [6, 24, 110, 130, 150, 140];

/** A four-pointed glint for the sparkles and stars. */
let starTexture = null;
function star() {
  starTexture ??= (() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    for (const [w, h] of [[3, c], [c, 3]]) {
      ctx.beginPath();
      ctx.ellipse(c, c, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  })();
  return starTexture;
}

// The gameplay camera always looks along this direction, so the star quads face it once and for all.
const FACING = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, -1, 1).normalize());

const additive = (color, opacity) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });

// --- The flame aura: a tall shell of fire, bright at the silhouette, licking upward ---------------------
const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;
const auraVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }`;
const auraFragment = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float time;
  uniform float height;
  uniform float speed;
  uniform float spiky;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  ${NOISE}
  void main() {
    // pow() of a slightly negative base is NaN on some GPUs, and bloom smears NaN pixels into flickering
    // black boxes, so keep the base in [0, 1] (and avoid normalizing a zero-length normal).
    vec3 normal = length(vNormal) > 0.0001 ? normalize(vNormal) : normalize(vView);
    float facing = clamp(abs(dot(normal, normalize(vView))), 0.0, 1.0);
    float rim = pow(1.0 - facing, 1.3);
    float h = clamp(vLocal.z / height, 0.0, 1.0);
    float angle = atan(vLocal.y, vLocal.x);
    // Flame tongues: noise streaming upward, torn into spikes near the top.
    vec2 uv = vec2(angle * 2.2, h * 3.0 - time * speed);
    float n = noise(uv * vec2(1.0, 1.6)) * 0.65 + noise(uv * vec2(2.3, 3.1) + 7.0) * 0.35;
    float tongues = smoothstep(h * (0.55 + 0.4 * spiky) - 0.05, h * (0.55 + 0.4 * spiky) + 0.25, n);
    float body = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.75, 1.0, h));
    // Mostly at the silhouette, see-through in the middle so Tode stays visible; colours stay under the bloom
    // threshold (stacked additive layers would wash the screen out).
    float alpha = (rim * 0.9 + 0.06) * tongues * body * opacity;
    gl_FragColor = vec4(color * (0.55 + rim * 0.35), clamp(alpha, 0.0, 1.0));
  }`;

/** A tall flame shell around Tode, wide at the base and tapering up, modelled Z-up. */
function auraShell(color, opacity, { height, width, speed, spiky = 0 }) {
  const points = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    points.push(new THREE.Vector2(Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t * 0.75) * width + 2, t * height));
  }
  const geometry = new THREE.LatheGeometry(points, 32);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: opacity },
      time: { value: 0 },
      height: { value: height },
      speed: { value: speed },
      spiky: { value: spiky },
    },
    vertexShader: auraVertex,
    fragmentShader: auraFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

// --- Swirls: ribbons of energy (or fire) spiralling up around him -------------------------------------
const swirlFragment = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float time;
  uniform float fire;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    // Streaks racing up the spiral; fire ribbons flicker and tear.
    float streak = fract(vUv.x * 4.0 - time);
    float glow = smoothstep(0.0, 0.25, streak) * (1.0 - smoothstep(0.35, 1.0, streak));
    float torn = mix(1.0, smoothstep(0.25, 0.7, noise(vec2(vUv.x * 30.0 - time * 6.0, vUv.y * 4.0))), fire);
    float ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
    float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float alpha = (0.2 + glow) * torn * ends * (0.4 + 0.6 * edge) * opacity;
    vec3 hot = mix(color, vec3(1.0, 0.95, 0.8), glow * 0.4 * fire);
    gl_FragColor = vec4(hot * (0.55 + 0.35 * glow), clamp(alpha, 0.0, 1.0));
  }`;
const swirlVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

class Helix extends THREE.Curve {
  constructor(radius, height, turns, phase) {
    super();
    Object.assign(this, { radius, height, turns, phase });
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = this.phase + t * this.turns * Math.PI * 2;
    const r = this.radius * (1 - 0.45 * t) * (0.8 + 0.2 * Math.sin(t * Math.PI));
    return target.set(Math.cos(angle) * r, Math.sin(angle) * r, 2 + t * this.height);
  }
}

function swirlRibbons({ count, colors, radius, height, turns, speed, width, opacity, fire = false }) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const geometry = new THREE.TubeGeometry(new Helix(radius * (0.85 + 0.3 * (i % 2)), height * (0.8 + 0.25 * ((i * 7) % 3) / 2), turns, (i / count) * Math.PI * 2), 96, width, 6, false);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors[i % colors.length]) },
        opacity: { value: opacity },
        time: { value: Math.random() },
        fire: { value: fire ? 1 : 0 },
      },
      vertexShader: swirlVertex,
      fragmentShader: swirlFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.userData.speed = speed * (0.85 + 0.3 * Math.random());
    group.add(ribbon);
  }
  return group;
}

/** Spiky crest on Tode's head, like flame-shaped hair. Local -Y is where he looks. */
function crest({ color, glow, size }) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.8, flatShading: true });
  const spikes = [
    [0, 0, 9, -0.35],
    [-4, 1, 7, -0.6],
    [4, 1, 7, -0.6],
    [-2.5, 3, 8, -0.8],
    [2.5, 3, 8, -0.8],
    [0, 4, 10, -1.0],
    [-5, 4, 6, -1.1],
    [5, 4, 6, -1.1],
  ];
  // Higher stages grow more and longer spikes.
  if (size > 1.1) spikes.push([-7, 6, 7, -1.3], [7, 6, 7, -1.3], [-3.5, 6, 9, -1.25], [3.5, 6, 9, -1.25], [0, 7, 12, -1.4]);
  if (size > 1.4) spikes.push([-9, 8, 6, -1.5], [9, 8, 6, -1.5], [0, 9, 13, -1.6]);
  for (const [x, y, baseLength, tilt] of spikes) {
    const length = baseLength * size;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.8 * Math.sqrt(size), length, 5), material);
    spike.geometry.translate(0, length / 2, 0);
    spike.position.set(x, y, 0);
    spike.rotation.set(Math.PI / 2 + tilt, 0, x * -0.06);
    group.add(spike);
  }
  return group;
}

function runeTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  for (const r of [240, 200, 120]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(angle) * 220, c + Math.sin(angle) * 220);
    ctx.rotate(angle + Math.PI / 2);
    // Little tea-leaf glyphs.
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2);
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.restore();
  }
  // A star between the inner circles.
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const point = [c + Math.cos(angle) * 200, c + Math.sin(angle) * 200];
    i ? ctx.lineTo(...point) : ctx.moveTo(...point);
  }
  for (let i = 0; i <= 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const point = [c + Math.cos(angle) * 120, c + Math.sin(angle) * 120];
    i ? ctx.lineTo(...point) : ctx.moveTo(...point);
  }
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A spiral galaxy for the infinite form to stand on. */
function galaxyTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const core = ctx.createRadialGradient(c, c, 0, c, c, c);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(0.15, 'rgba(200,180,255,0.5)');
  core.addColorStop(0.6, 'rgba(80,60,180,0.12)');
  core.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  // Stars along four spiral arms.
  for (let i = 0; i < 2600; i++) {
    const arm = i % 4;
    const t = Math.random();
    const angle = arm * (Math.PI / 2) + t * 5 + (Math.random() - 0.5) * 0.5;
    const r = t * c * 0.95;
    const x = c + Math.cos(angle) * r;
    const y = c + Math.sin(angle) * r;
    ctx.fillStyle = `rgba(${200 + Math.random() * 55}, ${190 + Math.random() * 65}, 255, ${(1 - t) * 0.9})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const INFLOW_MAX = 160; // stars flying into Tode at once

export class Ascension {
  constructor(player, particles, effects) {
    this.player = player;
    this.particles = particles;
    this.effects = effects;
    this.tier = 0;
    this.time = 0;
    this.emitBudget = 0;
    this.arcTimer = 0;
    this.parts = new THREE.Group();
    this.parts.visible = false;

    // Stars streaming into Tode from all around: always there (the cut-scene uses them too), idle until needed.
    this.inflow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: star(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      INFLOW_MAX
    );
    this.inflow.frustumCulled = false;
    this.inflow.count = 0;
    this.inflow.setColorAt(0, new THREE.Color());
    this.inflowStars = [];
    this.inflowBudget = 0;
    player.group.add(this.inflow);
  }

  tierFor(power) {
    let tier = 0;
    TIERS.forEach((t, i) => power >= t.power && (tier = i));
    return tier;
  }

  get look() {
    return LOOKS[this.tier];
  }

  /** Builds the visuals for `tier` (instantly; the transformation cut-scene lives in main.js). */
  setTier(tier) {
    this.tier = tier;
    this.clearParts();
    const { player } = this;
    const look = LOOKS[tier];
    player.setVisualScale(look.scale);

    for (const { material, base } of player.frogMaterials) {
      material.color.copy(base.color).lerp(bodyGlow(tier), look.gold);
      material.emissive.copy(bodyGlow(tier)).multiplyScalar(look.glow);
      if ('metalness' in material) {
        material.metalness = THREE.MathUtils.lerp(base.metalness, 0.9, look.metal);
        material.roughness = THREE.MathUtils.lerp(base.roughness, 0.25, look.metal);
      }
    }
    if (tier === 0) return;

    const stage = STAGES[tier];
    this.parts = new THREE.Group();
    player.adornments.add(this.parts);

    // The flame aura: an outer shell and a brighter inner one flickering against each other.
    const { aura } = stage;
    this.shells = [
      auraShell(aura.colors[0], aura.opacity[0], aura),
      auraShell(aura.colors[1], aura.opacity[1], { ...aura, height: aura.height * 0.72, width: aura.width * 0.7, speed: aura.speed * 1.3 }),
    ];
    this.parts.add(...this.shells);

    if (stage.swirls) {
      this.swirls = swirlRibbons(stage.swirls);
      this.parts.add(this.swirls);
    }
    if (stage.crest) {
      this.crest = crest(stage.crest);
      this.crest.position.set(0, 1, 11.5);
      this.parts.add(this.crest);
    }
    if (stage.orbit) {
      // Twinkling star glints swirling around him (one instanced mesh, facing the camera).
      this.sparkles = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: star(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.2, 1.1, 1.15) }),
        stage.orbit
      );
      this.sparkles.frustumCulled = false;
      this.sparkleData = Array.from({ length: stage.orbit }, () => ({
        angle: Math.random() * Math.PI * 2,
        radius: 16 + Math.random() * 40,
        height: Math.random() * 70,
        speed: 0.8 + Math.random() * 1.8,
        rise: 8 + Math.random() * 20,
        size: 3 + Math.random() * 6,
        phase: Math.random() * 10,
      }));
      player.group.add(this.sparkles);
    }
    if (stage.debris) {
      // Rocks torn from the ground float up around him (Radiant).
      this.debris = new THREE.Group();
      for (let i = 0; i < stage.debris; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + Math.random() * 2.5, 0), new THREE.MeshStandardMaterial({ color: '#8a7a6a', flatShading: true, roughness: 0.9 }));
        rock.userData = { angle: Math.random() * Math.PI * 2, radius: 26 + Math.random() * 26, phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.4 };
        this.debris.add(rock);
      }
      player.group.add(this.debris);
    }
    if (stage.groundGlow) {
      // A pool of light under him that breathes with the aura.
      this.groundGlow = new THREE.Mesh(new THREE.CircleGeometry(stage.aura.width * 1.5, 48), additive(stage.groundGlow, 0.15));
      this.groundGlow.position.z = 0.7;
      player.group.add(this.groundGlow);
    }
    if (stage.halo) {
      // A thin halo (a thick bright one blooms into a glare that hides Tode).
      this.halo = new THREE.Mesh(new THREE.TorusGeometry(9, 0.45, 8, 48), additive(stage.halo, 0.5));
      this.halo.position.set(0, 2, 25);
      this.halo.rotation.x = 0.25;
      this.parts.add(this.halo);
      if (tier === 5) {
        const second = new THREE.Mesh(new THREE.TorusGeometry(13, 0.3, 8, 64), additive('#c8b0ff', 0.45));
        second.position.set(0, 2, 27);
        second.rotation.x = -0.35;
        this.halo.add(second);
        second.position.set(0, 0, 2);
      }
    }
    if (stage.runes || stage.galaxy) {
      // The rune circle (and the galaxy) stay on the ground: they don't hop with Tode.
      this.runes = new THREE.Group();
      if (stage.runes) {
        const texture = runeTexture();
        const outer = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), additive(stage.runes[0], 0.55));
        outer.material.map = texture;
        const inner = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), additive(stage.runes[1], 0.45));
        inner.material.map = texture;
        this.runes.add(outer, inner);
      }
      if (stage.galaxy) {
        this.galaxy = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), additive('#c8c0ff', 0.4));
        this.galaxy.material.map = galaxyTexture();
        this.galaxy.position.z = -0.1;
        this.runes.add(this.galaxy);
      }
      this.runes.position.z = 0.9;
      player.group.add(this.runes);
    }
  }

  clearParts() {
    const dispose = (root) => {
      if (!root) return;
      root.removeFromParent();
      root.traverse((child) => {
        child.geometry?.dispose();
        child.material?.map?.dispose();
        child.material?.dispose();
      });
    };
    dispose(this.parts);
    dispose(this.runes);
    dispose(this.debris);
    dispose(this.groundGlow);
    if (this.sparkles) {
      this.sparkles.removeFromParent();
      this.sparkles.geometry.dispose();
      this.sparkles.material.dispose();
    }
    this.parts = this.runes = this.halo = this.crest = this.shells = this.sparkles = this.swirls = this.debris = this.groundGlow = this.galaxy = null;
  }

  /** Post-processing settings for the current tier. */
  postfxTargets() {
    const { bloom, warp, aberration } = this.look;
    return { bloom, warp, aberration };
  }

  /**
   * The transformation cut-scene's charge (`k` 0–1 toward `tier`): stars and sparks pour into Tode from all
   * around, faster and faster.
   */
  charge(delta, tier, k) {
    const colors = STAGES[tier]?.inflow?.colors ?? ['#ffffff'];
    this.pullStars(delta, 60 + k * 260 + tier * 40, colors, 1.4 + tier * 0.15);
  }

  /** Spawns `rate` stars per second, flying in from `reach` × their normal distance. */
  pullStars(delta, rate, colors, reach = 1) {
    this.inflowBudget += rate * delta;
    while (this.inflowBudget >= 1) {
      this.inflowBudget--;
      if (this.inflowStars.length >= INFLOW_MAX) continue;
      // From anywhere on a big upper half-sphere around him.
      const angle = Math.random() * Math.PI * 2;
      const lift = Math.random() * 1.2;
      const distance = (70 + Math.random() * 90) * reach;
      this.inflowStars.push({
        from: new THREE.Vector3(Math.cos(angle) * Math.cos(lift) * distance, Math.sin(angle) * Math.cos(lift) * distance, 18 + Math.sin(lift) * distance * 0.6),
        age: 0,
        life: 0.5 + Math.random() * 0.6,
        size: 3 + Math.random() * 5,
        color: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]),
        spin: (Math.random() - 0.5) * 2,
      });
    }
  }

  updateInflow(delta) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.inflowStars = this.inflowStars.filter((s) => (s.age += delta) < s.life);
    this.inflowStars.forEach((s, i) => {
      // Accelerating inward along a curl, so the stream swirls as it pours in.
      const t = s.age / s.life;
      const pull = 1 - 0.75 * t * t; // they end at his silhouette, not on top of him
      const curl = s.spin * t * 2.2;
      const cos = Math.cos(curl);
      const sin = Math.sin(curl);
      position.set((s.from.x * cos - s.from.y * sin) * pull, (s.from.x * sin + s.from.y * cos) * pull, 16 + (s.from.z - 16) * pull);
      scale.setScalar(s.size * (0.6 + 0.6 * t) * (t > 0.6 ? (1 - t) / 0.4 : 1));
      matrix.compose(position, FACING, scale);
      this.inflow.setMatrixAt(i, matrix);
      this.inflow.setColorAt(i, s.color);
    });
    this.inflow.count = this.inflowStars.length;
    this.inflow.instanceMatrix.needsUpdate = true;
    if (this.inflow.instanceColor) this.inflow.instanceColor.needsUpdate = true;
  }

  update(delta) {
    this.time += delta;
    const { tier, player, time } = this;
    this.updateInflow(delta);
    if (tier === 0 || !player.group.visible) return;
    const stage = STAGES[tier];

    // Pulsing inner light.
    const glow = this.look.glow * (1 + 0.25 * Math.sin(time * 6));
    for (const { material } of player.frogMaterials) material.emissive.copy(bodyGlow(tier)).multiplyScalar(glow);

    this.shells?.forEach((shell, i) => {
      shell.material.uniforms.time.value = time * (i ? 1.3 : 1);
      const flicker = 1 + 0.06 * Math.sin(time * (17 + i * 6)) + 0.04 * Math.sin(time * 31 + i);
      shell.scale.set(flicker, flicker, 1 + 0.1 * Math.sin(time * (11 + i * 4)));
      shell.rotation.z = time * (i ? -1.2 : 0.8);
    });
    this.swirls?.children.forEach((ribbon, i) => {
      ribbon.material.uniforms.time.value = time * ribbon.userData.speed * 0.6;
      ribbon.rotation.z = time * ribbon.userData.speed * (i % 2 ? 1 : 1.15);
    });
    if (this.crest) this.crest.scale.setScalar(1 + 0.05 * Math.sin(time * 9));
    if (this.halo) this.halo.rotation.z = time * 0.8;
    if (this.groundGlow) this.groundGlow.material.opacity = 0.12 + 0.06 * Math.sin(time * 5);
    if (this.runes) {
      this.runes.children.forEach((child, i) => {
        child.rotation.z = time * (child === this.galaxy ? 0.25 : i ? -0.7 : 0.4);
      });
    }
    this.debris?.children.forEach((rock) => {
      const { angle, radius, phase, speed } = rock.userData;
      const a = angle + time * speed;
      rock.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 4 + ((time * 14 + phase * 10) % 50));
      rock.rotation.set(time * 2 + phase, time * 3, 0);
    });

    // Stars pouring into him.
    if (stage.inflow) this.pullStars(delta, stage.inflow.rate, stage.inflow.colors);

    // Rising flames and sparks.
    this.emitBudget += PARTICLES_PER_SECOND[tier] * delta;
    const count = Math.floor(this.emitBudget);
    this.emitBudget -= count;
    if (count > 0) {
      this.particles.burst(player.position, {
        count,
        colors: FLAMES[tier],
        speed: tier >= 2 ? 30 : 12,
        up: tier >= 2 ? 130 : 60,
        gravity: -80,
        size: tier >= 2 ? 1.7 : 1.1,
        height: 4,
        ring: stage.aura.width * 0.6,
        life: 0.7,
        glow: true,
      });
    }

    // Crackling lightning around him: jagged arcs hugging his body and leaping into the aura.
    const { arc } = stage;
    if (arc) {
      this.arcTimer -= delta;
      if (this.arcTimer <= 0) {
        this.arcTimer = arc.every * (0.6 + Math.random() * 0.8);
        const angle = Math.random() * Math.PI * 2;
        const from = player.position.clone().add(new THREE.Vector3(Math.cos(angle) * 9, Math.sin(angle) * 9, 3 + Math.random() * 30));
        const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * arc.reach, (Math.random() - 0.5) * arc.reach, (Math.random() - 0.2) * arc.reach * 0.7));
        this.effects.bolt(from, to, { color: arc.color, width: 1.2, life: 0.1, jitter: 6 });
      }
    }

    // Sparkles spiralling up around him, twinkling.
    if (this.sparkles) {
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      this.sparkleData.forEach((sparkle, i) => {
        const angle = sparkle.angle + time * sparkle.speed;
        const height = (sparkle.height + time * sparkle.rise) % 80;
        const twinkle = Math.max(0, Math.sin(time * 6 + sparkle.phase)) ** 3;
        position.set(Math.cos(angle) * sparkle.radius, Math.sin(angle) * sparkle.radius, height + 2);
        scale.setScalar(sparkle.size * (0.25 + twinkle) * (1 - height / 100));
        matrix.compose(position, FACING, scale);
        this.sparkles.setMatrixAt(i, matrix);
      });
      this.sparkles.instanceMatrix.needsUpdate = true;
    }
  }
}
