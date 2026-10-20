import * as THREE from 'three';
import { isWearMaterial } from './WearableModels.js';

/**
 * The form on Tode himself (v0.35, part of Ascension): what makes the whole frog, outfit included, look transformed
 * without touching his head (a worn hat hides the form's crest, see shownOutfit).
 * - **Rim**: an outline of energy in the form's colour around his silhouette. Every mesh of the frog, his class gear
 *   and his wearables gets two back-face hulls (a thin bright one, a wider faint one), pushed out along the normals;
 *   they test against depth, so only the part sticking out past his body shows. Bands of light run up it.
 * - **Outfit**: worn items take on the form (tinted like the frog's own body, a little less, and glowing).
 * - **Flakes**: glowing voxel cubes peeling off his body and drifting up (world space, so they trail behind him).
 *   The transformation's charge peels many, its burst blasts a shell of them off (`peel`).
 * - **Overdrive**: a crimson flame flaring over whatever form he's in (even plain Tode) while an ultimate fires and
 *   during a beam clash: the aura, the rim and the flakes turn red, the body glows red.
 */

// Per tier: rim colour, inner/outer hull thickness (world units; the frog is ~30 tall: thinner didn't show at the
// gameplay camera), opacity; flakes per second and their colours.
const LOOKS = [
  { rim: '#ffffff', inner: 0, outer: 0, opacity: 0, flakes: 0, colors: ['#ffffff'] },
  { rim: '#d6f2ff', inner: 0.8, outer: 2.2, opacity: 0.6, flakes: 5, colors: ['#ffffff', '#cfefff', '#9fd8ff'] },
  { rim: '#ffcf3a', inner: 1.1, outer: 3, opacity: 0.85, flakes: 12, colors: ['#ffe066', '#ffc93c', '#ffb020'] },
  { rim: '#ffe680', inner: 1.2, outer: 3.3, opacity: 0.9, flakes: 18, colors: ['#fff2a8', '#ffd040', '#9fd8ff'] },
  { rim: '#ff4a6a', inner: 1.3, outer: 3.6, opacity: 0.9, flakes: 22, colors: ['#ff3b5c', '#ff8a2a', '#ffd36b'] },
  { rim: '#cfdcff', inner: 1.5, outer: 4.2, opacity: 1, flakes: 28, colors: ['#e0e8ff', '#c8b0ff', '#9ff4ff', '#8fa8ff'] },
];
const OVERDRIVE = { rim: '#ff2a2a', colors: ['#ff2a2a', '#ff5a3a', '#ff9a6a'], flakes: 30, glow: new THREE.Color('#ff2020') };
const FLAKES_MAX = 420;
const WHITE = new THREE.Color('#ffffff');

const rimVertex = /* glsl */ `
  uniform float thickness;
  varying vec3 vWorld;
  void main() {
    // Pushed out by a fixed amount in the world, whatever the part's own scale.
    float scale = max(length(modelMatrix[0].xyz), 0.0001);
    vec4 world = modelMatrix * vec4(position + normal * (thickness / scale), 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;
const rimFragment = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float time;
  varying vec3 vWorld;
  void main() {
    // Bands of energy running up the outline.
    float flow = 0.6 + 0.4 * sin(vWorld.z * 0.45 - time * 8.0 + sin(vWorld.x * 0.21 + vWorld.y * 0.17 + time * 1.3) * 2.5);
    gl_FragColor = vec4(color, clamp(opacity * flow, 0.0, 1.0));
  }`;

const rimMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, opacity: { value: 0 }, time: { value: 0 }, thickness: { value: 1 } },
    vertexShader: rimVertex,
    fragmentShader: rimFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

/** Takes the rim hulls out of a copy of a frog (with `withoutSilhouette`): they belong to the player's form. */
export const isFormRim = (object) => Boolean(object.userData.formRim);

export class FormGlow {
  constructor(player, particles) {
    this.player = player;
    this.particles = particles;
    this.tier = 0;
    this.intensity = 1;
    this.lite = false; // only the thin rim (graphics quality "lite" and below: the hulls are a draw call each)
    this.inner = rimMaterial();
    this.outer = rimMaterial();
    this.inner.visible = this.outer.visible = false;
    this.meshes = []; // the frog's opaque meshes (flakes peel off them)
    this.key = '';
    this.wear = new Map(); // shared wearable material → this frog's own copy
    this.overLeft = 0; // seconds of overdrive left
    this.over = 0; // its envelope, 0–1
    this.surge = 0; // the transformation's charge, 0–1 (set every frame by `charge`)
    this.surgeTier = 0;
    this.flakeBudget = 0;
    this.color = new THREE.Color();

    this.flakes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      FLAKES_MAX
    );
    this.flakes.frustumCulled = false;
    this.flakes.count = 0;
    this.flakes.setColorAt(0, new THREE.Color());
    this.flakeData = [];
  }

  setTier(tier, intensity = 1) {
    this.tier = tier;
    this.intensity = intensity;
  }

  /** A crimson flare over the form for at least `seconds` (call it every frame to hold it). */
  overdrive(seconds) {
    if (this.overLeft <= 0 && this.over < 0.2) this.flare = true;
    this.overLeft = Math.max(this.overLeft, seconds);
  }

  /** The transformation cut-scene's charge toward `tier` (k 0–1): the rim swells and flakes pour off. */
  charge(k, tier) {
    this.surge = k;
    this.surgeTier = tier;
  }

  /** A shell of flakes blasting off him (the moment of transformation). */
  peel(count, { tier = this.tier, speed = 220 } = {}) {
    const colors = LOOKS[tier]?.colors ?? LOOKS[1].colors;
    for (let i = 0; i < count; i++) this.spawnFlake(colors, speed * (0.5 + Math.random() * 0.7), 1 + Math.random() * 0.8);
  }

  /** Which meshes carry hulls: re-collected when the frog or his outfit changes. */
  collect() {
    const { player } = this;
    const key = `${player.model?.uuid}|${player.outfitKey ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    for (const mesh of this.meshes) mesh.userData.formHulls?.forEach((hull) => hull.removeFromParent());
    this.meshes = [];
    player.model?.traverse((child) => {
      if (!child.isMesh || child.isInstancedMesh || child.userData.silhouette || child.userData.formRim) return;
      if (child.material?.transparent) return;
      this.meshes.push(child);
    });
    for (const mesh of this.meshes) {
      const hulls = [this.inner, this.outer].map((material) => {
        const hull = new THREE.Mesh(mesh.geometry, material);
        hull.userData.formRim = true;
        hull.userData.shared = true; // (the geometry is the mesh's own)
        mesh.add(hull);
        return hull;
      });
      mesh.userData.formHulls = hulls;
      // Worn items get their own copy of the shared wardrobe material, to glow with the form.
      if (isWearMaterial(mesh.material)) {
        if (!this.wear.has(mesh.material)) this.wear.set(mesh.material, mesh.material.clone());
        mesh.material = this.wear.get(mesh.material);
      }
    }
  }

  spawnFlake(colors, speed, life) {
    if (!this.meshes.length || this.flakeData.length >= FLAKES_MAX) return;
    const mesh = this.meshes[Math.floor(Math.random() * this.meshes.length)];
    if (!mesh.visible || !mesh.parent?.visible) return;
    const position = mesh.geometry.attributes.position;
    const from = new THREE.Vector3().fromBufferAttribute(position, Math.floor(Math.random() * position.count)).applyMatrix4(mesh.matrixWorld);
    const center = this.player.group.position;
    const out = new THREE.Vector3(from.x - center.x, from.y - center.y, 0);
    if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, Math.random() - 0.5, 0);
    out.normalize().multiplyScalar(speed * 0.35);
    const scale = this.player.visualScale ?? 1;
    this.flakeData.push({
      position: from,
      velocity: out.setZ(speed * (0.5 + Math.random() * 0.5)),
      age: 0,
      life,
      size: (1.4 + Math.random() * 2) * scale,
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
      color: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]),
    });
  }

  updateFlakes(delta) {
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const faded = new THREE.Color();
    this.flakeData = this.flakeData.filter((f) => (f.age += delta) < f.life);
    this.flakeData.forEach((f, i) => {
      const t = f.age / f.life;
      f.velocity.multiplyScalar(Math.exp(-2.2 * delta));
      f.velocity.z += 30 * delta; // energy rises
      f.position.addScaledVector(f.velocity, delta);
      euler.set(f.spin.x * f.age, f.spin.y * f.age, f.spin.z * f.age);
      scale.setScalar(f.size * (1 - t * 0.6));
      matrix.compose(f.position, rotation.setFromEuler(euler), scale);
      this.flakes.setMatrixAt(i, matrix);
      // Additive: fading the colour fades the flake. (Kept under the bloom threshold, like the aura's sparks.)
      this.flakes.setColorAt(i, faded.copy(f.color).multiplyScalar(0.85 * (1 - t) ** 1.5 * Math.min(1, t * 8)));
    });
    this.flakes.count = this.flakeData.length;
    this.flakes.instanceMatrix.needsUpdate = true;
    if (this.flakes.instanceColor) this.flakes.instanceColor.needsUpdate = true;
  }

  /** Every frame. `bodyGlow`/`gold`/`glow`: the frog's own tint this frame (Ascension's look), for his outfit. */
  update(delta, time, { bodyGlow, gold, glow }) {
    const { player } = this;
    // The flakes live in the world, next to the frog.
    const world = player.group.parent;
    if (world && this.flakes.parent !== world) world.add(this.flakes);
    this.overLeft -= delta;
    this.over = THREE.MathUtils.clamp(this.over + (this.overLeft > 0 ? delta / 0.15 : -delta / 0.6), 0, 1);
    const surge = this.surge;
    this.surge = Math.max(0, this.surge - delta * 4); // (held up by `charge` every frame)
    const look = LOOKS[this.tier];
    const shown = player.group.visible && (this.tier > 0 || this.over > 0 || surge > 0);

    if (shown) this.collect();
    // The rim: the form's colour, swelling toward the next form while it charges, red in overdrive.
    const target = surge > 0 ? LOOKS[this.surgeTier] : look;
    const base = this.tier > 0 ? look : target;
    this.color.set(base.rim).lerp(new THREE.Color(target.rim), surge).lerp(new THREE.Color(OVERDRIVE.rim), this.over);
    const pulse = 1 + 0.12 * Math.sin(time * 7);
    const strength = Math.max(base.opacity, target.opacity * surge, 0.95 * this.over) * this.intensity * pulse;
    const swell = 1 + surge * 0.8 + this.over * 0.4;
    for (const [material, thickness, opacity] of [
      [this.inner, Math.max(base.inner, LOOKS[3].inner * this.over), 0.9],
      [this.outer, Math.max(base.outer, LOOKS[5].outer * this.over), 0.4],
    ]) {
      material.visible = shown && strength > 0.01 && !(this.lite && material === this.outer);
      material.uniforms.color.value.copy(this.color);
      material.uniforms.opacity.value = strength * opacity;
      material.uniforms.thickness.value = thickness * swell * (player.visualScale ?? 1);
      material.uniforms.time.value = time * (1 + this.over);
    }

    // The outfit takes on the form, a little less than his body does; red in overdrive.
    for (const [shared, own] of this.wear) {
      own.color.copy(shared.color).lerp(bodyGlow, gold * 0.45);
      own.emissive.copy(bodyGlow).multiplyScalar(this.tier > 0 ? glow * 0.9 : 0).lerp(OVERDRIVE.glow, this.over * 0.35);
    }
    // His body glows red in overdrive (Ascension sets the form's own glow first; plain Tode has none).
    if (this.over > 0 || this.tinted) {
      for (const { material, base: own } of player.frogMaterials) {
        if (this.tier === 0) material.emissive.copy(own.emissive ?? new THREE.Color(0));
        material.emissive.lerp(OVERDRIVE.glow, this.over * 0.22); // (more turned him pale pink)
      }
      this.tinted = this.over > 0;
    }

    // Flakes peel off him: a few in his form, many while charging, a red stream in overdrive.
    if (this.flare) {
      this.flare = false;
      this.peel(40 * this.intensity, { speed: 160 });
      for (let i = 0; i < 30 * this.intensity; i++) this.spawnFlake(OVERDRIVE.colors, 180 * (0.5 + Math.random() * 0.7), 0.9);
    }
    if (shown) {
      this.flakeBudget += (look.flakes + target.flakes * surge * 6 + OVERDRIVE.flakes * this.over) * delta * this.intensity * (this.particles?.density ?? 1);
      while (this.flakeBudget >= 1) {
        this.flakeBudget--;
        const red = Math.random() < this.over;
        const colors = red ? OVERDRIVE.colors : surge > 0 && Math.random() < surge ? target.colors : look.colors;
        this.spawnFlake(colors, 35 + surge * 60 + this.over * 50, 0.7 + Math.random() * 0.7);
      }
    } else this.flakeBudget = 0;
    this.updateFlakes(delta);
  }

  dispose() {
    for (const mesh of this.meshes) mesh.userData.formHulls?.forEach((hull) => hull.removeFromParent());
    this.meshes = [];
    this.flakes.removeFromParent();
    this.flakes.geometry.dispose();
    this.flakes.material.dispose();
    this.inner.dispose();
    this.outer.dispose();
    for (const own of this.wear.values()) own.dispose();
  }
}
