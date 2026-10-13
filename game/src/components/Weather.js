import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Map.js';

/**
 * Time of day moves on as the waves go by; weather rolls in from time to time and
 * changes the rules a little, like the room modifiers of a roguelite.
 */
const PALETTES = {
  morning: { sky: '#a8dcf5', sun: '#fff3dc', sunIntensity: 2.2, hemiSky: '#d8efff', hemiGround: '#4f7a32', hemi: 1.4, ambient: 0.6 },
  noon: { sky: '#8fd0f7', sun: '#ffffff', sunIntensity: 2.5, hemiSky: '#e0f4ff', hemiGround: '#4f7a32', hemi: 1.45, ambient: 0.6 },
  golden: { sky: '#f6c48c', sun: '#ffc27a', sunIntensity: 2.3, hemiSky: '#ffe0b8', hemiGround: '#5a6a2a', hemi: 1.2, ambient: 0.55 },
  sunset: { sky: '#e9806a', sun: '#ff8a5c', sunIntensity: 1.8, hemiSky: '#ffb6a0', hemiGround: '#3f3550', hemi: 1.0, ambient: 0.5 },
  night: { sky: '#141c38', sun: '#9fb4ff', sunIntensity: 0.9, hemiSky: '#4a5a9a', hemiGround: '#16241a', hemi: 0.8, ambient: 0.32 },
  cosmic: { sky: '#f3dcef', sun: '#ffe7c4', sunIntensity: 1.5, hemiSky: '#f0dcff', hemiGround: '#9a7ac8', hemi: 0.95, ambient: 0.38 },
};

export const WEATHERS = {
  clear: { name: 'Clear skies', icon: '☀️', text: '', dim: 1 },
  rain: { name: 'Tea Rain', icon: '🌧️', text: 'Tea splash radius +25%', dim: 0.62, splashRadius: 1.25 },
  storm: { name: 'Thunderstorm', icon: '⛈️', text: 'Lightning strikes the garden: dodge the red rings!', dim: 0.42 },
  gale: { name: 'Gale', icon: '🍃', text: 'Bees are blown about · spit flies 30% further', dim: 0.92, spitRange: 1.3, wind: 45 },
};

export function timeOfDay(wave) {
  if (wave <= 3) return 'morning';
  if (wave <= 6) return 'noon';
  if (wave <= 9) return 'golden';
  if (wave <= 13) return 'sunset';
  return 'night';
}

/** Weather for a wave: calm at first, a storm for bosses, otherwise sometimes rain or wind. */
export function rollWeather(wave, isBoss) {
  if (isBoss) return 'storm';
  if (wave <= 2) return 'clear';
  const roll = Math.random();
  if (roll < 0.22) return 'rain';
  if (roll < 0.4) return 'gale';
  if (roll < 0.5 && wave >= 6) return 'storm';
  return 'clear';
}

const RAIN_DROPS = 1400;
const RAIN_AREA = 700;
const LEAVES = 170;
const FIREFLIES = 140;

export class Weather {
  /** `onStrike` is called when the thunderstorm wants to drop a lightning bolt. */
  constructor({ scene, sun, hemisphere, ambient, onStrike, onThunder }) {
    Object.assign(this, { scene, sun, hemisphere, ambient, onStrike, onThunder });
    this.time = 'morning';
    this.kind = 'clear';
    this.cosmic = false;
    this.darkLeft = 0;
    this.strikeTimer = 3;
    this.thunderFlash = 0;
    this.windAngle = Math.random() * Math.PI * 2;

    this.current = this.resolve();
    this.color = { sky: new THREE.Color(), sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color() };
    this.apply(this.current, 1);

    this.rain = this.createRain();
    this.leaves = this.createLeaves();
    this.fireflies = this.createFireflies();
  }

  get info() {
    return WEATHERS[this.kind];
  }

  get wind() {
    const strength = this.info.wind ?? 0;
    return new THREE.Vector3(Math.cos(this.windAngle) * strength, Math.sin(this.windAngle) * strength, 0);
  }

  set(time, kind) {
    this.time = time;
    if (kind !== this.kind) this.windAngle = Math.random() * Math.PI * 2;
    this.kind = kind;
  }

  setCosmic(cosmic) {
    this.cosmic = cosmic;
  }

  /** Blackens the sky for a while (the Thunder Tea Storm ultimate). */
  darken(seconds) {
    this.darkLeft = Math.max(this.darkLeft, seconds);
  }

  resolve() {
    const palette = PALETTES[this.cosmic ? 'cosmic' : this.time];
    const dim = this.info.dim * (this.darkLeft > 0 ? 0.35 : 1);
    return { ...palette, dim };
  }

  apply(target, amount) {
    const c = this.color;
    const lerp = (key, value) => c[key].lerp(new THREE.Color(value), amount);
    lerp('sky', target.sky);
    lerp('sun', target.sun);
    lerp('hemiSky', target.hemiSky);
    lerp('hemiGround', target.hemiGround);
    const mix = (from, to) => from + (to - from) * amount;
    this.levels ??= { sun: target.sunIntensity, hemi: target.hemi, ambient: target.ambient, dim: target.dim };
    this.levels.sun = mix(this.levels.sun, target.sunIntensity);
    this.levels.hemi = mix(this.levels.hemi, target.hemi);
    this.levels.ambient = mix(this.levels.ambient, target.ambient);
    this.levels.dim = mix(this.levels.dim, target.dim);

    const dim = this.levels.dim;
    const flash = this.thunderFlash;
    const sky = c.sky.clone().multiplyScalar(0.55 + 0.45 * dim);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.sun.color.copy(c.sun);
    this.sun.intensity = this.levels.sun * dim + flash * 3;
    this.hemisphere.color.copy(c.hemiSky);
    this.hemisphere.groundColor.copy(c.hemiGround);
    this.hemisphere.intensity = this.levels.hemi * (0.4 + 0.6 * dim) + flash * 2;
    this.ambient.intensity = this.levels.ambient * (0.5 + 0.5 * dim);
  }

  createRain() {
    const positions = new Float32Array(RAIN_DROPS * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: '#d5e6ff', transparent: true, opacity: 0, depthWrite: false, fog: false })
    );
    lines.frustumCulled = false;
    this.scene.add(lines);
    const drops = Array.from({ length: RAIN_DROPS }, () => ({
      x: (Math.random() - 0.5) * RAIN_AREA * 2,
      y: (Math.random() - 0.5) * RAIN_AREA * 2,
      z: Math.random() * 400,
      speed: 650 + Math.random() * 350,
    }));
    return { lines, drops, positions };
  }

  createLeaves() {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(6, 3.4),
      new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
      LEAVES
    );
    mesh.frustumCulled = false;
    const colors = ['#e8a23a', '#d9682b', '#9cc24a', '#f2c94c'].map((c) => new THREE.Color(c));
    const leaves = Array.from({ length: LEAVES }, (_, i) => {
      mesh.setColorAt(i, colors[i % colors.length]);
      return {
        x: (Math.random() - 0.5) * 1000,
        y: (Math.random() - 0.5) * 1000,
        z: 5 + Math.random() * 90,
        spin: Math.random() * 10,
        speed: 0.7 + Math.random() * 0.6,
      };
    });
    mesh.count = 0;
    this.scene.add(mesh);
    return { mesh, leaves, matrix: new THREE.Matrix4(), rotation: new THREE.Euler(), quaternion: new THREE.Quaternion() };
  }

  createFireflies() {
    const positions = new Float32Array(FIREFLIES * 3);
    const colors = new Float32Array(FIREFLIES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 4,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    points.frustumCulled = false;
    this.scene.add(points);
    const flies = Array.from({ length: FIREFLIES }, () => ({
      x: (Math.random() - 0.5) * (MAP_HALF_SIZE * 2 + 400),
      y: (Math.random() - 0.5) * (MAP_HALF_SIZE * 2 + 400),
      z: 6 + Math.random() * 50,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.5,
    }));
    return { points, flies, positions, colors };
  }

  update(delta, center, elapsed) {
    this.darkLeft = Math.max(0, this.darkLeft - delta);
    this.thunderFlash *= Math.exp(-8 * delta);
    this.apply(this.resolve(), 1 - Math.exp(-1.2 * delta));

    // Thunderstorm: flashes, thunder, and dangerous strikes.
    if (this.kind === 'storm') {
      this.strikeTimer -= delta;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = 2.2 + Math.random() * 2.5;
        this.thunderFlash = 1;
        this.onThunder?.();
        this.onStrike?.();
      }
    }

    this.updateRain(delta, center);
    this.updateLeaves(delta, center, elapsed);
    this.updateFireflies(elapsed);
  }

  updateRain(delta, center) {
    const { lines, drops, positions } = this.rain;
    const raining = this.kind === 'rain' || this.kind === 'storm';
    const material = lines.material;
    material.opacity += ((raining ? 0.5 : 0) - material.opacity) * (1 - Math.exp(-2 * delta));
    lines.visible = material.opacity > 0.01;
    if (!lines.visible) return;
    const slant = this.kind === 'storm' ? 0.35 : 0.15;
    drops.forEach((drop, i) => {
      drop.z -= drop.speed * delta;
      if (drop.z < 0) {
        drop.z += 400;
        drop.x = (Math.random() - 0.5) * RAIN_AREA * 2;
        drop.y = (Math.random() - 0.5) * RAIN_AREA * 2;
      }
      const x = center.x + drop.x;
      const y = center.y + drop.y;
      positions.set([x, y, drop.z, x + 14 * slant, y - 14 * slant, drop.z + 14], i * 6);
    });
    lines.geometry.attributes.position.needsUpdate = true;
  }

  updateLeaves(delta, center, elapsed) {
    const { mesh, leaves, matrix, rotation, quaternion } = this.leaves;
    const blowing = this.kind === 'gale';
    mesh.count = blowing ? LEAVES : 0;
    if (!blowing) return;
    const wind = this.wind.multiplyScalar(6);
    const half = 500;
    leaves.forEach((leaf, i) => {
      leaf.x += wind.x * leaf.speed * delta;
      leaf.y += wind.y * leaf.speed * delta;
      // Wrap around a square that follows Tode.
      let dx = leaf.x - center.x;
      let dy = leaf.y - center.y;
      if (dx > half) leaf.x -= half * 2;
      if (dx < -half) leaf.x += half * 2;
      if (dy > half) leaf.y -= half * 2;
      if (dy < -half) leaf.y += half * 2;
      const z = leaf.z + Math.sin(elapsed * 2 + leaf.spin) * 8;
      quaternion.setFromEuler(rotation.set(elapsed * 3 + leaf.spin, elapsed * 2 + leaf.spin, leaf.spin));
      matrix.compose(new THREE.Vector3(leaf.x, leaf.y, z), quaternion, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  updateFireflies(elapsed) {
    const { points, flies, positions, colors } = this.fireflies;
    const dark = this.cosmic || this.time === 'night' || this.time === 'sunset' || this.darkLeft > 0;
    const material = points.material;
    material.opacity += ((dark ? 1 : 0) - material.opacity) * 0.03;
    points.visible = material.opacity > 0.01;
    if (!points.visible) return;
    const tint = this.cosmic ? [0.85, 0.7, 1] : [0.95, 1, 0.55];
    flies.forEach((fly, i) => {
      const t = elapsed * fly.speed + fly.phase;
      positions.set([fly.x + Math.sin(t) * 30, fly.y + Math.cos(t * 0.8) * 30, fly.z + Math.sin(t * 2.1) * 6], i * 3);
      const blink = Math.max(0, Math.sin(elapsed * 2.5 + fly.phase * 3)) ** 2;
      colors.set(tint.map((c) => c * blink), i * 3);
    });
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
  }
}
