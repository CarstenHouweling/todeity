import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fadeUp, glow } from './GardenFx.js';

/**
 * The shows finished sets put on (`SETS` in Rewards.js): every set has its own, around the middle of its parts.
 * `buildSetShow(set, { particles, camera })` returns `{ group, update(t, delta, night) }`; TitleGarden puts the group
 * at the set's middle (z = 0, the world is Z-up) and everything the show draws hangs under it. Shows are made of a
 * few instanced meshes and point clouds each (all 13 sets together add 43 draw calls), and some spray the title
 * scene's `particles` (world positions: the garden's root sits at the origin).
 * Keep additive layers thin: the lawn is bright and the bloom picks up anything near white.
 */

const TAU = Math.PI * 2;
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const fade = (p, into = 0.1, out = 0.15) => Math.min(1, p / into, (1 - p) / out);

// --- Shared geometry (never disposed) -----------------------------------------------------------------------------
const shared = (geometry) => ((geometry.userData.shared = true), geometry);
const LEAF = shared(new THREE.CircleGeometry(1, 6)); // scaled long and thin per instance
const RING = shared(new THREE.RingGeometry(0.9, 1, 64));
const DOME = shared(new THREE.SphereGeometry(1, 28, 10, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2)); // open side down
const BUBBLE = shared(new THREE.SphereGeometry(1, 18, 12));
const LANTERN = shared(new THREE.CylinderGeometry(1, 0.72, 1.5, 6).rotateX(Math.PI / 2)); // wide at the top
const BODY = shared(new THREE.IcosahedronGeometry(1, 0));
const BIRD_WING = shared(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.9, 0, 0), new THREE.Vector3(-0.9, 0, 0), new THREE.Vector3(-0.7, 3.4, 0)]));
BIRD_WING.computeVertexNormals();
/** A songbird's body along +x: a plump body, a round head and a fanned tail. */
function birdBody() {
  const part = (geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  };
  const tail = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.6, 0, 0.1), new THREE.Vector3(-1.9, -0.55, 0.15), new THREE.Vector3(-1.9, 0.55, 0.15)]);
  tail.computeVertexNormals();
  return mergeGeometries([part(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.55, 0.55)), part(new THREE.IcosahedronGeometry(0.42, 0).translate(0.95, 0, 0.3)), tail]);
}
const BIRD_BODY = shared(birdBody());
const BUTTERFLY_WING = shared(new THREE.CircleGeometry(1.2, 10).translate(-0.2, 1.15, 0));

// --- Textures (made once) ------------------------------------------------------------------------------------------
const canvasTexture = (draw) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};
let skyMap = null;
/** A round patch of night sky that fades out at the edge (the constellation hangs in it, so it shows by day). */
const skyPatch = () =>
  (skyMap ??= canvasTexture((g) => {
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(18, 26, 70, 0.85)');
    gradient.addColorStop(0.6, 'rgba(28, 36, 96, 0.6)');
    gradient.addColorStop(1, 'rgba(40, 50, 120, 0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
  }));
let sparkleMap = null;
/** A four-pointed star with a soft middle. */
const sparkle = () =>
  (sparkleMap ??= canvasTexture((g) => {
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 14);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 4 : 30;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
  }));

// --- Helpers ------------------------------------------------------------------------------------------------------
const matrix = new THREE.Matrix4();
const turn = new THREE.Matrix4();
const body = new THREE.Matrix4(); // a bird's or butterfly's own frame, which its wings turn in
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const world = new THREE.Vector3();

const additive = (color, opacity, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...extra });

function instanced(geometry, material, count, colors) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  return mesh;
}

/** Sets instance `i` (`order` is the Euler order; scale never quite 0, or lit instances lose their normals). */
function put(mesh, i, x, y, z, rx, ry, rz, sx, sy = sx, sz = sx, order = 'XYZ') {
  quaternion.setFromEuler(euler.set(rx, ry, rz, order));
  const s = (v) => Math.max(0.001, v);
  matrix.compose(position.set(x, y, z), quaternion, scale.set(s(sx), s(sy), s(sz)));
  mesh.setMatrixAt(i, matrix);
  return matrix;
}

// Points are sized as if the camera's field of view were 90°; the game's is 30° (Camera.js), so this makes `size`
// world units.
const POINT_SCALE = 1 / Math.tan(THREE.MathUtils.degToRad(15));

/** Many soft dots in one draw call (`size` in world units): `put(i, x, y, z, color, alpha)` each frame, then `done()`. */
class Dots {
  constructor(count, size, { additive: glowing = true, map = glow() } = {}) {
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({
      size: size * POINT_SCALE, map, vertexColors: true, transparent: true, depthWrite: false, blending: glowing ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.color = new THREE.Color();
  }

  put(i, x, y, z, color, alpha = 1) {
    const { positions: p, colors: c } = this;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    this.color.set(color);
    c[i * 4] = this.color.r;
    c[i * 4 + 1] = this.color.g;
    c[i * 4 + 2] = this.color.b;
    c[i * 4 + 3] = Math.max(0, alpha);
  }

  done() {
    const { position: p, color: c } = this.points.geometry.attributes;
    p.needsUpdate = c.needsUpdate = true;
  }
}

/** A soap bubble: clear in the middle, a rainbow sheen at the rim and a highlight (instanced, additive). */
function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = 1.0 - abs(dot(vNormal, vView));
        vec3 sheen = 0.5 + 0.5 * cos(6.2831 * (edge * 1.4 + uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
        float spot = pow(max(dot(vNormal, normalize(vec3(-0.4, 0.55, 0.75))), 0.0), 36.0);
        gl_FragColor = vec4(mix(vec3(1.0), sheen, 0.75) * pow(edge, 2.4) * 0.85 + spot * 0.7 + 0.03, 1.0);
      }`,
  });
}

// --- The shows: (group, ctx) => update(t, delta, night) ----------------------------------------------------------
const SHOWS = {
  // Tea Party: a double spiral of steam rises over the tea, with tea leaves twirling up in it.
  teaparty(g) {
    const steam = new Dots(40, 18, { additive: false });
    const leaves = instanced(LEAF, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 10, ['#6fbf3a', '#8fd65a', '#4e9a2a']);
    g.add(steam.points, leaves);
    return (t) => {
      for (let i = 0; i < 40; i++) {
        const p = (t * 0.11 + i / 40) % 1;
        const a = (i % 2) * Math.PI + p * TAU * 1.4 + t * 0.5;
        const r = 8 + p * 36;
        steam.put(i, Math.cos(a) * r, Math.sin(a) * r, 18 + p * 130, '#ffffff', Math.sin(p * Math.PI) * 0.4);
      }
      steam.done();
      for (let i = 0; i < 10; i++) {
        const p = (t * 0.08 + i / 10) % 1;
        const a = i * 2.4 + p * TAU * 2 + t * 0.5;
        const r = 12 + p * 34;
        put(leaves, i, Math.cos(a) * r, Math.sin(a) * r, 14 + p * 120, t * 3 + i, t * 2.2 + i, a, 3.4 * fade(p), 1.5 * fade(p), 1);
      }
      leaves.instanceMatrix.needsUpdate = true;
    };
  },

  // Hall of Victory: a golden laurel wreath hovers over the trophies, turned to whoever looks, shedding sparkles.
  victory(g, { camera }) {
    const R = 26;
    const per = 9; // leaf pairs on each branch
    const gold = new THREE.MeshStandardMaterial({ color: '#ffc93c', emissive: '#a86a00', emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.3, flatShading: true, side: THREE.DoubleSide });
    const wreath = new THREE.Group();
    wreath.up.set(0, 0, 1);
    const leaves = instanced(LEAF, gold, per * 4);
    let k = 0;
    // Two branches from the bottom up either side, open at the top; each leaf pair leans out of the stem.
    for (const side of [1, -1]) {
      const from = -Math.PI / 2 + side * 0.22;
      const sweep = side * (Math.PI - 0.75);
      const stem = new THREE.Mesh(new THREE.TorusGeometry(R, 0.8, 4, 28, Math.abs(sweep)), gold);
      stem.rotation.z = side > 0 ? from : from + sweep;
      wreath.add(stem);
      for (let j = 0; j < per; j++) {
        const a = from + sweep * ((j + 0.5) / per);
        const grows = a + side * (Math.PI / 2);
        const size = 1 - (j / per) * 0.45;
        for (const lean of [-0.6, 0.6]) {
          const angle = grows + lean;
          const length = 6.5 * size;
          put(leaves, k++, Math.cos(a) * R + Math.cos(angle) * length * 0.8, Math.sin(a) * R + Math.sin(angle) * length * 0.8, 0, 0, 0, angle, length, 2.4 * size, 1);
        }
      }
    }
    wreath.add(leaves);
    const sparkles = new Dots(30, 4.5);
    g.add(wreath, sparkles.points);
    const eye = new THREE.Vector3();
    return (t, delta, night) => {
      wreath.position.z = 90 + Math.sin(t * 1.2) * 5;
      camera.getWorldPosition(eye);
      wreath.lookAt(eye);
      wreath.rotateZ(Math.sin(t * 0.8) * 0.08);
      wreath.scale.setScalar(1 + 0.03 * Math.sin(t * 2));
      gold.emissiveIntensity = (night ? 1.1 : 0.6) + 0.25 * Math.sin(t * 2.4);
      for (let i = 0; i < 30; i++) {
        const p = (t * 0.22 + i / 30) % 1;
        const a = i * 2.39996 + t * 0.35;
        const r = R - p * 12;
        sparkles.put(i, Math.cos(a) * r, Math.sin(a) * r, wreath.position.z - p * 80, i % 3 ? '#ffd36b' : '#fff6d0', fade(p, 0.05, 0.4) * (0.6 + 0.4 * Math.sin(t * 9 + i * 3)));
      }
      sparkles.done();
    };
  },

  // Fairy Glade: five fairies flit around trailing sparkles, and a fairy ring of lights pulses on the lawn.
  glade(g, { particles }) {
    const colors = ['#fff27a', '#e0a8ff', '#d4ff8a', '#8ff5dc', '#ffb8f0'];
    const fairies = new Dots(5, 16);
    const cores = new Dots(5, 4);
    const ring = new Dots(28, 7);
    g.add(ring.points, fairies.points, cores.points);
    let trail = 0;
    return (t, delta, night) => {
      const trailNow = (trail -= delta) <= 0;
      if (trailNow) trail = 0.07;
      for (let i = 0; i < 5; i++) {
        const x = Math.cos(t * (0.55 + i * 0.12) + i * 1.7) * 62 + Math.sin(t * 2.1 + i) * 8;
        const y = Math.sin(t * (0.7 + i * 0.09) + i * 2.3) * 56 + Math.cos(t * 1.7 + i * 2) * 8;
        const z = 24 + Math.sin(t * 1.5 + i) * 12 + Math.sin(t * 6.1 + i * 3) * 2;
        fairies.put(i, x, y, z, colors[i], night ? 0.9 : 0.75);
        cores.put(i, x, y, z, '#ffffff', 1);
        if (trailNow) particles?.burst(world.set(g.position.x + x, g.position.y + y, z), { count: 1, colors: [colors[i], '#ffffff'], speed: 5, up: -8, gravity: 4, size: 0.9, height: 0, glow: true, life: 0.8 });
      }
      fairies.done();
      cores.done();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU;
        const wave = Math.max(0, Math.sin(t * 1.8 - a)) ** 6;
        ring.put(i, Math.cos(a) * 74, Math.sin(a) * 74, 2, i % 2 ? '#c58aff' : '#8ff5dc', (night ? 0.35 : 0.2) + wave * 0.6);
      }
      ring.done();
    };
  },

  // Pond Friends: a little rainbow arches over them (turned to whoever looks), and rings ripple out on the lawn.
  pond(g, { camera }) {
    const geometry = new THREE.RingGeometry(54, 72, 64, 6, 0, Math.PI);
    const bands = ['#9b6bff', '#5aa8ff', '#5be08a', '#ffe14d', '#ff9a3c', '#ff4d4d'].map((c) => new THREE.Color(c));
    const colors = [];
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      v.fromBufferAttribute(geometry.attributes.position, i);
      const k = THREE.MathUtils.clamp((v.length() - 54) / 18, 0, 1) * (bands.length - 1);
      c.copy(bands[Math.floor(k)]).lerp(bands[Math.min(bands.length - 1, Math.floor(k) + 1)], k % 1);
      // Additive: darker is clearer, so the feet fade into the lawn.
      c.multiplyScalar(Math.min(1, (v.y / v.length()) * 2.2));
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const bow = new THREE.Mesh(geometry, additive('#ffffff', 0.3, { vertexColors: true }));
    bow.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(bow);
    const ripples = Array.from({ length: 5 }, () => {
      const mesh = new THREE.Mesh(RING, additive('#bfefff', 0));
      g.add(mesh);
      return { mesh, age: 9 };
    });
    g.add(holder);
    let next = 0;
    const eye = new THREE.Vector3();
    return (t, delta, night) => {
      camera.getWorldPosition(eye);
      holder.rotation.z = Math.atan2(eye.y - g.position.y, eye.x - g.position.x) + Math.PI / 2;
      bow.material.opacity = (night ? 0.12 : 0.26) + 0.05 * Math.sin(t * 1.3);
      if ((next -= delta) <= 0) {
        next = 0.7;
        const free = ripples.find((r) => r.age > 2.2);
        if (free) {
          const a = Math.random() * TAU;
          const r = 10 + Math.random() * 50;
          free.mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.9);
          free.age = 0;
        }
      }
      for (const ripple of ripples) {
        const k = Math.min(1, (ripple.age += delta) / 2.2);
        ripple.mesh.scale.setScalar(2 + 26 * (1 - (1 - k) ** 2));
        ripple.mesh.material.opacity = (1 - k) * (night ? 0.7 : 0.45);
      }
    };
  },

  // Zen Corner: blossom petals whirl around it in a slow vortex, falling and fluttering.
  zen(g) {
    const count = 56;
    const petals = instanced(LEAF, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), count, ['#ff9ec7', '#ffd1e3', '#ffb6d5', '#ffffff']);
    g.add(petals);
    return (t) => {
      for (let i = 0; i < count; i++) {
        const p = (t * 0.06 + hash(i)) % 1;
        const a = i * 2.39996 + t * (0.3 + hash(i + 50) * 0.25) + p * 2;
        const r = (30 + hash(i + 9) * 60) * (0.75 + 0.25 * (1 - p));
        put(petals, i, Math.cos(a) * r, Math.sin(a) * r, 6 + (1 - p) * 120, Math.sin(t * 3 + i) * 1.3, Math.cos(t * 2.3 + i) * 1.3, a, 3.6 * fade(p), 2.3 * fade(p), 1);
      }
      petals.instanceMatrix.needsUpdate = true;
    };
  },

  // Garden Guardians: three green wisps keep watch, and now and then a ward of light swells over the set.
  guardians(g, { particles }) {
    const wisps = new Dots(3, 18);
    const cores = new Dots(3, 5);
    const dome = new THREE.Mesh(DOME, additive('#7ed957', 0, { side: THREE.FrontSide }));
    const ground = new THREE.Mesh(RING, additive('#b6ff8a', 0));
    ground.position.z = 1;
    g.add(dome, ground, wisps.points, cores.points);
    let ward = 0;
    let trail = 0;
    return (t, delta, night) => {
      const trailNow = (trail -= delta) <= 0;
      if (trailNow) trail = 0.1;
      for (let i = 0; i < 3; i++) {
        const a = t * 0.8 + (i / 3) * TAU;
        const x = Math.cos(a) * 58;
        const y = Math.sin(a) * 58;
        const z = 28 + Math.sin(t * 2 + i * 2) * 7;
        wisps.put(i, x, y, z, '#8dff6a', night ? 0.85 : 0.7);
        cores.put(i, x, y, z, '#ffffff', 1);
        if (trailNow) particles?.burst(world.set(g.position.x + x, g.position.y + y, z), { count: 1, colors: ['#7ed957', '#c8f77a'], speed: 4, up: -10, gravity: 8, size: 1, height: 0, glow: true, life: 0.7 });
      }
      wisps.done();
      cores.done();
      const k = Math.min(1, ((ward += delta) % 5) / 1.8);
      const r = 20 + 80 * (1 - (1 - k) ** 3);
      dome.scale.set(r, r, r * 0.6);
      dome.material.opacity = 0.13 * (1 - k) ** 1.5;
      ground.scale.setScalar(r);
      ground.material.opacity = 0.5 * (1 - k);
    };
  },

  // Hall of Glory: a pillar of golden light rises from it into the sky, motes drifting up inside.
  glory(g) {
    const height = 420;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, height, 24, 1, true), additive('#fff2a0', 0.16, { map: fadeUp() }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, height, 12, 1, true), additive('#fff6d0', 0.12, { map: fadeUp() }));
    for (const column of [outer, inner]) {
      column.rotation.x = Math.PI / 2;
      column.position.z = height / 2;
    }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(42, 32), additive('#ffe680', 0.3, { map: glow() }));
    pool.position.z = 1;
    const motes = new Dots(26, 5);
    g.add(pool, outer, inner, motes.points);
    return (t, delta, night) => {
      const pulse = 1 + 0.25 * Math.sin(t * 1.6);
      outer.material.opacity = (night ? 0.18 : 0.12) * pulse;
      inner.material.opacity = (night ? 0.18 : 0.1) * pulse;
      pool.material.opacity = (night ? 0.4 : 0.26) * pulse;
      outer.rotation.y = t * 0.4;
      for (let i = 0; i < 26; i++) {
        const p = (t * 0.16 + hash(i)) % 1;
        const a = i * 2.39996 + t * 0.8;
        const r = 3 + hash(i + 7) * 9;
        motes.put(i, Math.cos(a) * r, Math.sin(a) * r, p * 320, i % 2 ? '#fff2a0' : '#ffffff', fade(p, 0.1, 0.5) * 0.8);
      }
      motes.done();
    };
  },

  // Playground: soap bubbles drift up from all over it, wobbling, and pop.
  playground(g, { particles }) {
    const count = 14;
    const material = bubbleMaterial();
    const bubbles = instanced(BUBBLE, material, count);
    g.add(bubbles);
    const spawn = (b, delay) => {
      const a = Math.random() * TAU;
      const r = Math.random() * 70;
      Object.assign(b, { x: Math.cos(a) * r, y: Math.sin(a) * r, z: 8, size: 3 + Math.random() * 4, rise: 14 + Math.random() * 14, life: 4 + Math.random() * 4, age: -delay, phase: Math.random() * TAU });
    };
    const list = Array.from({ length: count }, (_, i) => {
      const b = {};
      spawn(b, 0);
      b.age = (i / count) * b.life; // already on their way
      b.z += b.rise * b.age;
      return b;
    });
    return (t, delta) => {
      material.uniforms.uTime.value = t;
      for (const [i, b] of list.entries()) {
        b.age += delta;
        if (b.age >= b.life) {
          particles?.burst(world.set(g.position.x + b.x, g.position.y + b.y, b.z), { count: 8, colors: ['#ffffff', '#bfefff', '#ffd1f0'], speed: 45, up: 20, gravity: 0, size: 0.8, height: 0, glow: true, life: 0.3 });
          spawn(b, Math.random() * 1.5);
        }
        const live = b.age > 0;
        if (live) {
          b.z += b.rise * delta;
          b.x += Math.sin(t * 1.3 + b.phase) * 8 * delta;
          b.y += Math.cos(t * 1.1 + b.phase) * 8 * delta;
        }
        const grow = live ? Math.min(1, b.age / 0.4) : 0;
        const wobble = Math.sin(t * 7 + b.phase) * 0.07;
        put(bubbles, i, b.x, b.y, b.z, 0, 0, 0, b.size * grow * (1 + wobble), b.size * grow * (1 + wobble), b.size * grow * (1 - wobble));
      }
      bubbles.instanceMatrix.needsUpdate = true;
    };
  },

  // Champion's Corner: fireworks go up every few seconds and burst into balls of stars.
  champions(g, { particles }) {
    const palettes = [['#ffd23f', '#ffffff'], ['#ff5a7a', '#ffd1e3'], ['#5fb8ff', '#ffffff'], ['#7ed957', '#fff27a'], ['#c58aff', '#ffffff']];
    const heads = new Dots(3, 8);
    const flashes = new Dots(3, 70);
    g.add(heads.points, flashes.points);
    const rockets = Array.from({ length: 3 }, () => ({ fuse: 0, flash: 0 }));
    let next = 1;
    return (t, delta) => {
      if ((next -= delta) <= 0) {
        next = 2.2 + Math.random() * 2.6;
        const r = rockets.find((rocket) => rocket.fuse <= 0 && rocket.flash <= 0);
        if (r) {
          const a = Math.random() * TAU;
          Object.assign(r, { x: Math.cos(a) * 20, y: Math.sin(a) * 20, z: 12, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, vz: 190 + Math.random() * 40, fuse: 0.75 + Math.random() * 0.2, colors: palettes[Math.floor(Math.random() * palettes.length)] });
        }
      }
      for (const [i, r] of rockets.entries()) {
        if (r.fuse > 0) {
          r.vz -= 120 * delta;
          r.x += r.vx * delta;
          r.y += r.vy * delta;
          r.z += r.vz * delta;
          world.set(g.position.x + r.x, g.position.y + r.y, r.z);
          particles?.burst(world, { count: 1, colors: ['#ffe9b0', '#ffb84a'], speed: 8, up: -30, gravity: 30, size: 1.2, height: 0, glow: true, life: 0.4 });
          if ((r.fuse -= delta) <= 0) {
            for (const up of [140, -90]) particles?.burst(world, { count: 34, colors: r.colors, speed: 150, up, gravity: 70, size: 2.8, height: 0, glow: true, life: 1.4 });
            r.flash = 0.4;
          }
        } else r.flash = Math.max(0, r.flash - delta);
        heads.put(i, r.x ?? 0, r.y ?? 0, r.z ?? 0, '#fff2c0', r.fuse > 0 ? 1 : 0);
        flashes.put(i, r.x ?? 0, r.y ?? 0, r.z ?? 0, r.colors?.[0] ?? '#ffffff', (r.flash / 0.4) ** 2 * 0.7);
      }
      heads.done();
      flashes.done();
    };
  },

  // Temple Grounds: paper sky lanterns float up from the temple one after another, over a low morning mist.
  temple(g) {
    const count = 7;
    const paper = new THREE.MeshStandardMaterial({ color: '#ffb36b', emissive: '#ff7a1a', emissiveIntensity: 1.2, roughness: 0.8, flatShading: true });
    const lanterns = instanced(LANTERN, paper, count);
    const halos = new Dots(count, 26);
    const mist = new Dots(16, 46, { additive: false });
    g.add(mist.points, lanterns, halos.points);
    return (t, delta, night) => {
      paper.emissiveIntensity = night ? 2.2 : 1.1;
      for (let i = 0; i < count; i++) {
        const cycle = t * 0.045 + i / count;
        const p = cycle % 1;
        const seed = Math.floor(cycle) * 7 + i * 13;
        const a = hash(seed) * TAU;
        const r = 10 + hash(seed + 1) * 50;
        const x = Math.cos(a) * r + Math.sin(t * 0.5 + i) * 10 + p * 30;
        const y = Math.sin(a) * r + Math.cos(t * 0.4 + i) * 10 + p * 20;
        const z = 14 + p * 250;
        const s = 4.6 * fade(p, 0.08, 0.2);
        put(lanterns, i, x, y, z, Math.sin(t * 1.3 + i) * 0.12, Math.cos(t * 1.1 + i) * 0.12, t * 0.3 + i, s, s, s);
        halos.put(i, x, y, z, '#ffb040', (night ? 0.55 : 0.3) * fade(p, 0.08, 0.2));
      }
      lanterns.instanceMatrix.needsUpdate = true;
      halos.done();
      for (let i = 0; i < 16; i++) {
        const a = hash(i) * TAU + t * 0.04 * (i % 2 ? 1 : -1);
        const r = 25 + hash(i + 3) * 75;
        mist.put(i, Math.cos(a) * r, Math.sin(a) * r, 5, '#ffffff', (night ? 0.12 : 0.2) * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 2)));
      }
      mist.done();
    };
  },

  // Stargazing: a constellation (a teapot) twinkles above the set, facing whoever looks, and stars shoot past.
  stargazing(g, { particles, camera }) {
    const STARS = [[-14, -10], [10, -10], [13, 6], [-12, 7], [0, 15], [27, 15], [-25, 1], [-22, -12], [1, 22]];
    const LINES = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 2], [2, 5], [3, 6], [6, 7], [7, 0], [4, 8]];
    const spread = 2.1;
    const sky = new THREE.Group();
    sky.up.set(0, 0, 1);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(78, 40), new THREE.MeshBasicMaterial({ map: skyPatch(), transparent: true, depthWrite: false, fog: false }));
    patch.position.set(4, 6, -2);
    const faint = new Dots(26, 2.4);
    const stars = new Dots(STARS.length, 11, { additive: false, map: sparkle() });
    const halos = new Dots(STARS.length, 20);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(LINES.flatMap(([a, b]) => [a, b].map((s) => new THREE.Vector3(STARS[s][0] * spread, STARS[s][1] * spread, 0))));
    const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.45, depthWrite: false }));
    const shooter = new Dots(1, 9);
    sky.add(patch, faint.points, lines, halos.points, stars.points, shooter.points);
    g.add(sky);
    const eye = new THREE.Vector3();
    let next = 2;
    let shot = null;
    return (t, delta, night) => {
      sky.position.z = 100 + Math.sin(t * 0.8) * 5;
      camera.getWorldPosition(eye);
      sky.lookAt(eye);
      sky.rotateZ(Math.sin(t * 0.25) * 0.12);
      const bright = 1;
      for (const [i, [x, y]] of STARS.entries()) {
        const twinkle = 0.65 + 0.35 * Math.sin(t * (2 + hash(i) * 3) + i * 1.7);
        stars.put(i, x * spread, y * spread, 0, i % 3 ? '#fff6d0' : '#cfe0ff', bright * twinkle);
        halos.put(i, x * spread, y * spread, 0, '#9fb8ff', bright * twinkle * 0.3);
      }
      stars.done();
      halos.done();
      for (let i = 0; i < 26; i++) {
        const a = hash(i) * TAU;
        const r = Math.sqrt(hash(i + 30)) * 66;
        faint.put(i, Math.cos(a) * r, Math.sin(a) * r, -1, '#ffffff', 0.35 + 0.35 * Math.sin(t * (1 + hash(i + 60) * 2) + i));
      }
      faint.done();
      patch.material.opacity = night ? 0.45 : 1;
      lines.material.opacity = 0.4 + 0.1 * Math.sin(t * 1.4);
      if (!shot && (next -= delta) <= 0) shot = { age: 0, from: new THREE.Vector3(-60, 40 + Math.random() * 20, 1), to: new THREE.Vector3(55, -15 - Math.random() * 25, 1) };
      if (shot) {
        const k = Math.min(1, (shot.age += delta) / 0.7);
        position.lerpVectors(shot.from, shot.to, k);
        shooter.put(0, position.x, position.y, position.z, '#ffffff', 1 - k * k);
        particles?.burst(sky.localToWorld(world.copy(position)), { count: 2, colors: ['#fff2a0', '#cfe0ff'], speed: 4, up: 0, gravity: 0, size: 1.6, height: 0, glow: true, life: 0.45 });
        if (k >= 1) {
          shot = null;
          next = 4 + Math.random() * 5;
        }
      } else shooter.put(0, 0, 0, 0, '#ffffff', 0);
      shooter.done();
    };
  },

  // Birdsong Corner: little songbirds circle overhead, flapping and gliding, now and then losing a feather.
  birdsong(g, { particles }) {
    const colors = ['#5b8fd6', '#ff6b4a', '#ffd23f', '#ffffff', '#7ed957', '#ff9ec7'];
    const count = colors.length;
    const material = () => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const bodies = instanced(BIRD_BODY, material(), count, colors);
    const left = instanced(BIRD_WING, material(), count, colors);
    const right = instanced(BIRD_WING, material(), count, colors);
    g.add(bodies, left, right);
    const birds = colors.map((_, i) => ({ radius: 45 + hash(i) * 45, height: 48 + hash(i + 3) * 36, speed: (0.45 + hash(i + 5) * 0.35) * (i % 3 ? 1 : -1), phase: hash(i + 8) * TAU }));
    let feather = 3;
    return (t, delta) => {
      for (const [i, b] of birds.entries()) {
        const a = t * b.speed + b.phase;
        const x = Math.cos(a) * b.radius;
        const y = Math.sin(a) * b.radius;
        const z = b.height + Math.sin(t * 0.7 + i) * 8;
        const heading = a + Math.sign(b.speed) * Math.PI / 2;
        const bank = -Math.sign(b.speed) * 0.35;
        const flapping = Math.sin(t * 0.8 + i * 2) > -0.2;
        const flap = flapping ? Math.sin(t * 15 + i) * 0.8 : 0.12;
        put(bodies, i, x, y, z, bank, 0, heading, 3.4, 3.4, 3.4, 'ZYX');
        body.copy(put(left, i, x, y, z, bank, 0, heading, 2.6, 2.6, 2.6, 'ZYX'));
        left.setMatrixAt(i, matrix.multiplyMatrices(body, turn.makeRotationX(flap)));
        right.setMatrixAt(i, matrix.multiplyMatrices(body, turn.makeRotationX(Math.PI - flap)));
        if (i === 0 && particles && (feather -= delta) <= 0) {
          feather = 2 + Math.random() * 3;
          particles.burst(world.set(g.position.x + x, g.position.y + y, z), { count: 1, colors: [colors[Math.floor(Math.random() * count)], '#ffffff'], speed: 6, up: -6, gravity: 14, size: 2, height: 0, life: 2.6 });
        }
      }
      for (const mesh of [bodies, left, right]) mesh.instanceMatrix.needsUpdate = true;
    };
  },

  // Harvest Fields: butterflies flutter over the field and golden pollen drifts in the air.
  harvest(g) {
    const colors = ['#ff9a3c', '#ffd23f', '#ffffff', '#c58aff', '#5fb8ff', '#ff9ec7', '#ffd23f'];
    const count = colors.length;
    const wing = () => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: '#222222' });
    const left = instanced(BUTTERFLY_WING, wing(), count, colors);
    const right = instanced(BUTTERFLY_WING, wing(), count, colors);
    const bodies = instanced(BODY, new THREE.MeshLambertMaterial({ color: '#3a2a1a' }), count);
    const pollen = new Dots(32, 3.5);
    g.add(left, right, bodies, pollen.points);
    const where = (i, t) => [
      Math.cos(t * (0.25 + hash(i) * 0.15) + i * 2) * 60 + Math.sin(t * 1.3 + i) * 10,
      Math.sin(t * (0.22 + hash(i + 4) * 0.15) + i * 3) * 60 + Math.cos(t * 1.1 + i * 2) * 10,
    ];
    return (t, delta, night) => {
      for (let i = 0; i < count; i++) {
        const [x, y] = where(i, t);
        const [nx, ny] = where(i, t + 0.05);
        const z = 14 + Math.sin(t * 0.9 + i) * 8 + Math.abs(Math.sin(t * 3.1 + i)) * 6;
        const heading = Math.atan2(ny - y, nx - x);
        const flap = 0.15 + 1.2 * Math.abs(Math.sin(t * 13 + i * 1.7));
        put(bodies, i, x, y, z, 0, 0, heading, 2.8, 0.6, 0.6, 'ZYX');
        body.copy(put(left, i, x, y, z, 0, 0, heading, 3.2, 3.2, 3.2, 'ZYX'));
        left.setMatrixAt(i, matrix.multiplyMatrices(body, turn.makeRotationX(flap)));
        right.setMatrixAt(i, matrix.multiplyMatrices(body, turn.makeRotationX(Math.PI - flap)));
      }
      for (const mesh of [left, right, bodies]) mesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 32; i++) {
        const a = hash(i) * TAU + t * 0.08 * (i % 2 ? 1 : -1);
        const r = 20 + hash(i + 2) * 75;
        pollen.put(i, Math.cos(a) * r, Math.sin(a) * r, 8 + ((hash(i + 6) * 60 + t * 4) % 60), '#ffd36b', (night ? 0.6 : 0.45) * (0.5 + 0.5 * Math.sin(t * 2 + i)));
      }
      pollen.done();
    };
  },
};

/** The show for a finished set: `{ group, update(t, delta, night) }` (a set without one gets an empty group). */
export function buildSetShow(set, ctx) {
  const group = new THREE.Group();
  const update = SHOWS[set.id]?.(group, { ...ctx, group }) ?? (() => {});
  return { group, update };
}

/** Frees a show's own geometry and materials (shared geometry and textures stay). */
export function disposeSetShow(show) {
  show.group.removeFromParent();
  show.group.traverse((child) => {
    if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose();
    child.material?.dispose();
    child.dispose?.();
  });
}
