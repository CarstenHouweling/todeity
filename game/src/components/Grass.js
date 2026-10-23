import * as THREE from 'three';

/**
 * The garden's lawn as a field of grass blades (v0.40): instanced meshes, one per square chunk of the lawn (so the
 * camera skips the chunks out of view), each a single draw call. Everything that moves happens in the vertex shader: the wind's gusts roll across the lawn, and blades
 * bow away from the frogs walking through them. The CPU only sets a few uniforms a frame.
 *
 * `createGrass({ half, count, clear })`: blades over the square lawn (`half` its half size), skipping spots where
 * `clear(x, y)` is true (the path, the pond, the house). `field.clearAround(circles)` hides the blades under trinkets
 * (each { x, y, radius }), `field.setDensity(0..1)` thins it out for weaker devices, `field.update(time, frogs)` moves it.
 */

const BLADE_SEGMENTS = 4;
const PUSHERS = 4; // frogs that bend the grass
const MOWN = 30; // the lawn's squares (a map tile)
const CHUNKS = 5; // the field is cut into CHUNKS × CHUNKS squares

function bladeGeometry() {
  // A tapering ribbon, base at z = 0 and tip at z = 1, a little curved; `aH` (0 at the root, 1 at the tip) drives the
  // colour and how far the wind bends it.
  const positions = [];
  const heights = [];
  for (let i = 0; i <= BLADE_SEGMENTS; i++) {
    const h = i / BLADE_SEGMENTS;
    const width = 0.5 * (1 - h) ** 0.9;
    const curve = 0.25 * h * h;
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
  // Normals point up (and a little out of the blade), so the whole field is lit like a soft lawn, not like cards.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.flatMap((_, i) => (i % 3 === 2 ? [0, 0.35, 1] : [])), 3));
  geometry.setIndex(index);
  return geometry;
}

export function createGrass({ half, count = 32000, clear = () => false, colors = ['#5aa83c', '#6cbf45', '#4f9a35', '#7ccc52'] }) {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const uniforms = {
    uTime: { value: 0 },
    uPush: { value: Array.from({ length: PUSHERS }, () => new THREE.Vector3(1e5, 1e5, 1)) }, // (x, y, reach)
    uRoot: { value: new THREE.Color('#2f6a22') },
    uTip: { value: new THREE.Color('#d8f08a') },
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
// Gusts rolling across the lawn, and a quicker flutter.
float gust = sin(uTime * 1.3 + root.x * 0.021 + root.y * 0.013) * 0.6 + sin(uTime * 0.53 - root.y * 0.009) * 0.4;
float flutter = sin(uTime * 4.7 + root.x * 0.31 + root.y * 0.27) * 0.18;
float tall = grassWorld.z - root.z;
grassWorld.xy += vec2(0.8, 0.45) * (gust * 0.55 + flutter) * tall * bend;
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
      .replace('#include <common>', '#include <common>\nuniform vec3 uRoot;\nuniform vec3 uTip;\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(uRoot * 1.6, uTip * 1.15, smoothstep(0.0, 1.0, vH));');
  };
  material.customProgramCacheKey = () => 'grass-field';

  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 3; tries++) {
    const x = (Math.random() * 2 - 1) * (half - 3);
    const y = (Math.random() * 2 - 1) * (half - 3);
    if (clear(x, y)) continue;
    spots.push({ x, y, angle: Math.random() * Math.PI * 2, height: 3.5 + Math.random() ** 1.6 * 5.5, width: 1.6 + Math.random() * 1.6 });
  }

  // In square chunks, so the camera skips the ones out of view (in a run it sees about half the lawn): one draw call
  // each, but tens of thousands fewer blades through the vertex shader on a phone.
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
  const palette = colors.map((c) => new THREE.Color(c));
  const place = (chunk, i, hidden) => {
    const spot = chunk.spots[i];
    q.setFromAxisAngle(up, spot.angle);
    matrix.compose(at.set(spot.x, spot.y, 0), q, hidden ? scale.set(0, 0, 0) : scale.set(spot.width, spot.width, spot.height));
    chunk.mesh.setMatrixAt(i, matrix);
  };
  chunks.forEach((chunk, c) => {
    if (!chunk.spots.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, chunk.spots.length);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.grass = true;
    chunk.mesh = mesh;
    chunk.spots.forEach((spot, i) => {
      place(chunk, i, false);
      // The mowing pattern of the old lawn texture lives on in the blades: lighter and darker squares.
      const mown = (Math.floor(spot.x / MOWN) + Math.floor(spot.y / MOWN)) % 2 ? 0.05 : -0.04;
      color.copy(palette[(c + i) % palette.length]).offsetHSL((Math.random() - 0.5) * 0.03, 0, mown + (Math.random() - 0.5) * 0.07);
      mesh.setColorAt(i, color);
    });
    // Bounds from the blades at rest, with room for the wind and the frogs bending them.
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 14;
    chunk.hidden = new Set();
    field.add(mesh);
  });
  const filled = chunks.filter((chunk) => chunk.mesh);

  return {
    mesh: field,
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
        if (frog) push.set(frog.x, frog.y, 16);
        else push.set(1e5, 1e5, 1);
      });
    },
  };
}
