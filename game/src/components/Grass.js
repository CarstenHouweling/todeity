import * as THREE from 'three';

/**
 * The garden's lawn grows a little (v0.40.1): short tufts of grass blades that grow out of the lawn itself. Each
 * blade's root has the colour of the lawn square it stands on and is lit like the lawn (its normal points straight
 * up), so the field melts into the ground and only the lighter tips stand out; the tufts leave gaps, so the lawn's
 * mowing squares still show. v0.40.0 had a dense carpet of wide dark-rooted blades, which looked like spikes laid
 * over the lawn and clashed with the low-poly garden.
 *
 * Instanced meshes, one per square chunk of the lawn (the camera skips the chunks out of view), each a single draw
 * call. Everything that moves happens in the vertex shader: soft gusts roll across the lawn, and blades bow away
 * from the frogs walking through them. The CPU only sets a few uniforms a frame.
 *
 * `createGrass({ half, tufts, room, tile, lawn })`: tufts over the square lawn (`half` its half size); `room(x, y)`
 * says how much grass a spot has room for (0 none, 1 full height: shorter toward the path, the pond, the house),
 * `tile` is the lawn's square size and `lawn` its { light, dark } colours. `field.setLawn(lawn)` follows a new lawn
 * look, `field.clearAround(circles)` hides the blades under trinkets (each { x, y, radius }), `field.setDensity(0..1)`
 * thins it out for weaker devices, `field.update(time, frogs)` moves it.
 */

const BLADE_SEGMENTS = 3;
const PUSHERS = 4; // frogs that bend the grass
const CHUNKS = 5; // the field is cut into CHUNKS × CHUNKS squares
const TUFT = { blades: [3, 6], radius: 2.6 };

function bladeGeometry() {
  // A thin tapering blade, base at z = 0 and tip at z = 1, a little curved; `aH` (0 at the root, 1 at the tip)
  // drives the colour and how far the wind bends it.
  const positions = [];
  const heights = [];
  for (let i = 0; i <= BLADE_SEGMENTS; i++) {
    const h = i / BLADE_SEGMENTS;
    const width = 0.5 * (1 - h);
    const curve = 0.3 * h * h;
    if (i < BLADE_SEGMENTS) {
      positions.push(-width, curve, h, width, curve, h);
      heights.push(h, h);
    } else {
      positions.push(0, curve, h);
      heights.push(h);
    }
  }
  const index = [];
  for (let i = 0; i < BLADE_SEGMENTS - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const last = (BLADE_SEGMENTS - 1) * 2;
  index.push(last, last + 1, last + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aH', new THREE.Float32BufferAttribute(heights, 1));
  // Straight up, like the lawn's own normal: a blade is lit exactly like the ground it grows from.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.flatMap((_, i) => (i % 3 === 2 ? [0, 0, 1] : [])), 3));
  geometry.setIndex(index);
  return geometry;
}

export function createGrass({ half, tufts = 5200, room = () => 1, tile = 30, lawn = { light: '#7cc75a', dark: '#70bb4f' } }) {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const uniforms = {
    uTime: { value: 0 },
    uPush: { value: Array.from({ length: PUSHERS }, () => new THREE.Vector3(1e5, 1e5, 1)) }, // (x, y, reach)
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec3 uPush[${PUSHERS}];
attribute float aH;
varying float vH;`
      )
      .replace(
        '#include <project_vertex>',
        `vH = aH;
vec4 grassWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float bend = aH * aH;
float tall = grassWorld.z - root.z;
// Soft gusts rolling across the lawn, and a little flutter.
float gust = sin(uTime * 1.1 + root.x * 0.018 + root.y * 0.011) * 0.6 + sin(uTime * 0.47 - root.y * 0.008) * 0.4;
float flutter = sin(uTime * 3.9 + root.x * 0.29 + root.y * 0.23) * 0.12;
grassWorld.xy += vec2(0.8, 0.45) * (gust * 0.35 + flutter) * tall * bend;
// Frogs walking through push the blades aside and down.
for (int i = 0; i < ${PUSHERS}; i++) {
  vec2 away = root.xy - uPush[i].xy;
  float d = length(away);
  float push = (1.0 - smoothstep(uPush[i].z * 0.35, uPush[i].z, d)) * bend;
  grassWorld.xy += (away / max(d, 0.001)) * push * tall * 0.9;
  grassWorld.z -= push * tall * 0.55;
}
vec4 mvPosition = viewMatrix * grassWorld;
gl_Position = projectionMatrix * mvPosition;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      // The root is the lawn's colour; toward the tip a little lighter and sunnier.
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 1.2, 0.92) + vec3(0.02, 0.03, 0.0), smoothstep(0.15, 1.0, vH));');
  };
  material.customProgramCacheKey = () => 'grass-tufts';

  // Tufts of a few blades, a little longer in some patches of the lawn than in others.
  const spots = [];
  const patch = (x, y) => 0.75 + 0.25 * Math.sin(x * 0.021 + 1.3) * Math.sin(y * 0.017 + 0.4) + 0.15 * Math.sin(x * 0.07 - y * 0.05);
  for (let t = 0; t < tufts; t++) {
    const cx = (Math.random() * 2 - 1) * (half - 4);
    const cy = (Math.random() * 2 - 1) * (half - 4);
    const space = room(cx, cy);
    if (space < 0.2 || Math.random() > space) continue; // sparser toward the edges, too
    const blades = TUFT.blades[0] + Math.floor(Math.random() * (TUFT.blades[1] - TUFT.blades[0] + 1));
    const tuftHeight = (2.4 + Math.random() * 2.2) * patch(cx, cy) * (0.45 + 0.55 * space);
    for (let b = 0; b < blades; b++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * TUFT.radius;
      // Leaning out of the tuft's middle, the middle ones the tallest.
      spots.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        angle: a + Math.PI / 2 + (Math.random() - 0.5) * 0.8,
        height: tuftHeight * (1.15 - (0.45 * r) / TUFT.radius) * (0.8 + Math.random() * 0.4),
        width: 0.75 + Math.random() * 0.5,
        shade: (Math.random() - 0.5) * 0.06,
      });
    }
  }
  // Random order within the field, so any first part (setDensity) is spread over the lawn.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }

  const field = new THREE.Group();
  field.userData.grass = true;
  const geometry = bladeGeometry();
  const size = (half * 2) / CHUNKS;
  const chunks = Array.from({ length: CHUNKS * CHUNKS }, () => ({ spots: [] }));
  for (const spot of spots) {
    const cx = Math.min(CHUNKS - 1, Math.floor((spot.x + half) / size));
    const cy = Math.min(CHUNKS - 1, Math.floor((spot.y + half) / size));
    chunks[cy * CHUNKS + cx].spots.push(spot);
  }
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const place = (chunk, i, hidden) => {
    const spot = chunk.spots[i];
    q.setFromAxisAngle(up, spot.angle);
    matrix.compose(at.set(spot.x, spot.y, 0), q, hidden ? scale.set(0, 0, 0) : scale.set(spot.width, spot.width, spot.height));
    chunk.mesh.setMatrixAt(i, matrix);
  };
  // The lawn's squares as the lawn texture draws them (Map.js): counted from its top-left corner.
  const light = (spot) => (Math.floor((spot.x + half) / tile) + Math.floor((half - spot.y) / tile)) % 2 === 0;
  const filled = [];
  const paint = (colors) => {
    const lightColor = new THREE.Color(colors.light);
    const darkColor = new THREE.Color(colors.dark);
    for (const chunk of filled) {
      chunk.spots.forEach((spot, i) => chunk.mesh.setColorAt(i, color.copy(light(spot) ? lightColor : darkColor).offsetHSL(0, 0, spot.shade)));
      chunk.mesh.instanceColor.needsUpdate = true;
    }
  };
  for (const chunk of chunks) {
    if (!chunk.spots.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, chunk.spots.length);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.grass = true;
    chunk.mesh = mesh;
    chunk.spots.forEach((spot, i) => place(chunk, i, false));
    // Bounds from the blades at rest, with room for the wind and the frogs bending them.
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 10;
    chunk.hidden = new Set();
    field.add(mesh);
    filled.push(chunk);
  }
  paint(lawn);

  return {
    mesh: field,
    /** The lawn changed its look (Divinity.js): the roots take its colours. */
    setLawn: paint,
    /** Hides the blades under these circles ({ x, y, radius }: the trinkets), shows the rest again. */
    clearAround(circles) {
      for (const chunk of filled) {
        const now = new Set();
        chunk.spots.forEach((spot, i) => {
          if (circles.some((c) => (spot.x - c.x) ** 2 + (spot.y - c.y) ** 2 < c.radius * c.radius)) now.add(i);
        });
        if (!now.size && !chunk.hidden.size) continue;
        for (const i of chunk.hidden) if (!now.has(i)) place(chunk, i, false);
        for (const i of now) if (!chunk.hidden.has(i)) place(chunk, i, true);
        chunk.hidden = now;
        chunk.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    /** 1: every blade, 0: none (the blades are in random order, so any first part is spread over the lawn). */
    setDensity(value) {
      for (const chunk of filled) chunk.mesh.count = Math.round(chunk.spots.length * value); // (visibility stays with the tiers and seasons)
    },
    /** `frogs`: positions (x, y) of the frogs that bend the grass, nearest first. */
    update(time, frogs = []) {
      uniforms.uTime.value = time;
      uniforms.uPush.value.forEach((push, i) => {
        const frog = frogs[i];
        if (frog) push.set(frog.x, frog.y, 14);
        else push.set(1e5, 1e5, 1);
      });
    },
  };
}
