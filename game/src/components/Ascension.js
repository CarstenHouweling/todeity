import * as THREE from 'three';

/**
 * Tode's transformations. Power comes from brews (duo and legendary brews count double)
 * and the ultimate; every tier makes him visibly more powerful.
 */
export const TIERS = [
  { name: 'Tode', power: 0 },
  { name: 'Awakened Tode', power: 3, banner: 'TODE AWAKENS', sub: 'A golden glow stirs within…' },
  { name: 'Golden Tode', power: 7, banner: 'GOLDEN TODE', sub: 'His power erupts in golden flame!' },
  { name: 'Radiant Tode', power: 12, banner: 'RADIANT TODE', sub: 'Lightning answers his call.' },
  { name: 'Tode, God of Tea', power: 18, banner: 'GOD OF TEA', sub: 'Reality bends around the kettle.' },
];

// Per tier: model scale, how gold he turns, glow, metal look, post-processing.
const LOOKS = [
  { scale: 1, gold: 0, glow: 0, metal: 0, bloom: 0.35, warp: 0, aberration: 0 },
  { scale: 1.05, gold: 0.1, glow: 0.12, metal: 0, bloom: 0.45, warp: 0, aberration: 0 },
  { scale: 1.12, gold: 0.22, glow: 0.22, metal: 0.15, bloom: 0.6, warp: 0, aberration: 0 },
  { scale: 1.2, gold: 0.5, glow: 0.3, metal: 0.55, bloom: 0.75, warp: 0.12, aberration: 0.15 },
  { scale: 1.3, gold: 0.7, glow: 0.35, metal: 0.4, bloom: 0.75, warp: 0.55, aberration: 0.45 },
];

const GOLD = new THREE.Color('#ffc93c');
const DIVINE = new THREE.Color('#fff4d6');
const FLAMES = [
  ['#ffe680', '#ffc93c', '#ffffff'],
  ['#ffe680', '#ffc93c', '#ffffff'],
  ['#ffe066', '#ffb020', '#ff8a1f', '#ffffff'],
  ['#fff2a8', '#ffd040', '#ffffff', '#9fd8ff'],
  ['#ffffff', '#fff4d6', '#ffd6f5', '#c8b0ff', '#ffe680'],
];
const PARTICLES_PER_SECOND = [6, 10, 70, 100, 140];

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

// Flame aura: bright at the silhouette, see-through in the middle, with flickering tongues.
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
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.6);
    float h = clamp(vLocal.z / height, 0.0, 1.0);
    float angle = atan(vLocal.y, vLocal.x);
    float tongues = 0.6 + 0.4 * sin(angle * 5.0 + time * 9.0 - h * 8.0) * sin(angle * 3.0 - time * 6.0);
    float alpha = rim * tongues * opacity * (1.0 - h * 0.7) * smoothstep(0.0, 0.08, h);
    gl_FragColor = vec4(color * (1.0 + rim), alpha);
  }`;

/** A teardrop flame shell around Tode, modelled Z-up. */
function auraShell(color, opacity, height) {
  const points = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    points.push(new THREE.Vector2(Math.sin(t * Math.PI) ** 0.7 * (1 - t * 0.6) * 17, t * height));
  }
  const geometry = new THREE.LatheGeometry(points, 24);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: opacity },
      time: { value: 0 },
      height: { value: height },
    },
    vertexShader: auraVertex,
    fragmentShader: auraFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

/** Spiky golden crest on Tode's head. Local -Y is where he looks. */
function crest() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.6, flatShading: true });
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
  for (const [x, y, length, tilt] of spikes) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.8, length, 5), material);
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
      material.color.copy(base.color).lerp(tier === 4 ? DIVINE : GOLD, look.gold);
      material.emissive.copy(tier === 4 ? DIVINE : GOLD).multiplyScalar(look.glow);
      if ('metalness' in material) {
        material.metalness = THREE.MathUtils.lerp(base.metalness, 0.9, look.metal);
        material.roughness = THREE.MathUtils.lerp(base.roughness, 0.25, look.metal);
      }
    }
    if (tier === 0) return;

    const adornments = player.adornments;
    this.parts = new THREE.Group();
    adornments.add(this.parts);

    // Flame aura: two shells flickering against each other.
    const auraColor = tier === 4 ? '#fff0d0' : '#ffc93c';
    this.shells = [auraShell(auraColor, 0.45 + tier * 0.12, 28 + tier * 5), auraShell('#ffffff', 0.2 + tier * 0.05, 22 + tier * 3)];
    this.parts.add(...this.shells);

    if (tier >= 2) {
      this.crest = crest();
      this.crest.position.set(0, 1, 11.5);
      this.parts.add(this.crest);
      if (tier === 4) this.crest.children[0].material.emissive.set('#ffffff');
    }

    if (tier >= 3) {
      // Shards of reality orbit him.
      this.shards = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const shard = new THREE.Mesh(
          new THREE.OctahedronGeometry(2.2, 0),
          new THREE.MeshStandardMaterial({ color: '#ffe9a0', emissive: i % 2 ? '#ffb000' : '#7fd4ff', emissiveIntensity: 0.9, flatShading: true })
        );
        shard.userData.phase = (i / 6) * Math.PI * 2;
        this.shards.add(shard);
      }
      this.parts.add(this.shards);
    }

    if (tier === 4) {
      this.halo = new THREE.Mesh(new THREE.TorusGeometry(9, 0.9, 8, 40), additive('#fff3c4', 0.95));
      this.halo.position.set(0, 2, 25);
      this.halo.rotation.x = 0.25;
      this.parts.add(this.halo);

      // The rune circle stays on the ground (it does not hop with Tode).
      const texture = runeTexture();
      this.runes = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), additive('#ffd36b', 0.55));
      outer.material.map = texture;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), additive('#c8b0ff', 0.45));
      inner.material.map = texture;
      this.runes.add(outer, inner);
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
    this.parts = this.runes = this.halo = this.crest = this.shards = this.shells = null;
  }

  /** Post-processing settings for the current tier. */
  postfxTargets() {
    const { bloom, warp, aberration } = this.look;
    return { bloom, warp, aberration };
  }

  update(delta) {
    this.time += delta;
    const { tier, player, time } = this;
    if (tier === 0 || !player.group.visible) return;

    // Pulsing inner light.
    const glow = this.look.glow * (1 + 0.25 * Math.sin(time * 6));
    for (const { material } of player.frogMaterials) material.emissive.copy(tier === 4 ? DIVINE : GOLD).multiplyScalar(glow);

    this.shells?.forEach((shell, i) => {
      shell.material.uniforms.time.value = time * (i ? 1.3 : 1);
      const flicker = 1 + 0.08 * Math.sin(time * (17 + i * 6)) + 0.05 * Math.sin(time * 31 + i);
      shell.scale.set(flicker, flicker, 1 + 0.12 * Math.sin(time * (11 + i * 4)));
      shell.rotation.z = time * (i ? -2 : 1.5);
    });
    if (this.crest) this.crest.scale.setScalar(1 + 0.05 * Math.sin(time * 9));
    if (this.halo) this.halo.rotation.z = time * 0.8;
    if (this.runes) {
      this.runes.children[0].rotation.z = time * 0.4;
      this.runes.children[1].rotation.z = -time * 0.7;
      this.runes.children[0].material.opacity = 0.45 + 0.15 * Math.sin(time * 3);
    }
    this.shards?.children.forEach((shard) => {
      const angle = time * 1.6 + shard.userData.phase;
      shard.position.set(Math.cos(angle) * 26, Math.sin(angle) * 26, 12 + 5 * Math.sin(time * 2.3 + shard.userData.phase));
      shard.rotation.set(time * 2, time * 3, 0);
    });

    // Rising flames and sparkles.
    this.emitBudget += PARTICLES_PER_SECOND[tier] * delta;
    const count = Math.floor(this.emitBudget);
    this.emitBudget -= count;
    if (count > 0) {
      const height = tier >= 2 ? 6 : 10;
      this.particles.burst(player.position, {
        count,
        colors: FLAMES[tier],
        speed: tier >= 2 ? 25 : 10,
        up: tier >= 2 ? 90 : 40,
        gravity: -60,
        size: tier >= 2 ? 1.6 : 1,
        height,
        ring: tier >= 2 ? 10 : 6,
        life: 0.6,
        glow: true,
      });
    }

    // Crackling lightning around a Radiant or divine Tode.
    if (tier >= 3) {
      this.arcTimer -= delta;
      if (this.arcTimer <= 0) {
        this.arcTimer = tier === 4 ? 0.07 : 0.14;
        const angle = Math.random() * Math.PI * 2;
        const from = player.position.clone().add(new THREE.Vector3(Math.cos(angle) * 10, Math.sin(angle) * 10, 4 + Math.random() * 16));
        const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16));
        this.effects.bolt(from, to, { color: tier === 4 ? '#e0c8ff' : '#ffe680', width: 1.2, life: 0.12, jitter: 4 });
      }
    }
  }
}
