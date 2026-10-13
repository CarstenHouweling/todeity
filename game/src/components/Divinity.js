import * as THREE from 'three';
import {
  bush,
  flower,
  insideArena,
  instanced,
  material,
  outsideArena,
  pineTree,
  rock,
  roundTree,
  scatterPoints,
} from './Environment.js';
import { MAP_HALF_SIZE } from './Map.js';
import { createTeapot } from './Ultimates.js';

/**
 * The world answers Tode's divinity. Each ascension tier reshapes the garden:
 *   1 Awakened  – lusher lawn, glowing flowers, golden pollen
 *   2 Golden    – cherry blossom trees, drifting petals, floating lanterns over the fence
 *   3 Radiant   – crystal rocks and clusters, a glowing pond, floating islands
 *   4 God of Tea – marble and gold, golden trees, the garden floats above a sea of clouds,
 *                  a celestial teapot circles the sky
 * Changes happen during the transformation flash; new things grow in afterwards.
 */

const BLOSSOM = ['#ffb7d5', '#ff9ec7', '#ffd1e3', '#f78fb3'];
const GOLD_LEAVES = ['#ffd23f', '#ffe680', '#f0b429'];
const GOLD_PINE = ['#e8b923', '#f5d061', '#ffe9a0'];
const CRYSTAL = ['#8fe3ff', '#b48cff', '#d6f5ff'];
const LIGHT_TRUNK = '#d9c7a8';
const GROW_TIME = 1.6; // seconds for new things to grow in

const glowingMaterial = (emissive, intensity) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, emissive, emissiveIntensity: intensity });

const goldMaterial = glowingMaterial('#ffb000', 0.25);
goldMaterial.metalness = 0.35;
const crystalMaterial = glowingMaterial('#5fd8ff', 0.45);

/** Copies the placement of an InstancedMesh onto a new look. */
function restyle(original, geometry, surface = material) {
  const mesh = new THREE.InstancedMesh(geometry, surface, original.count);
  mesh.instanceMatrix.array.set(original.instanceMatrix.array);
  if (original.instanceColor) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(original.instanceColor.array.slice(), 3);
  }
  mesh.castShadow = original.castShadow;
  mesh.receiveShadow = true;
  mesh.visible = false;
  return mesh;
}

function restyleSingle(original, geometry, surface = material) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.userData.prop = true;
  mesh.position.copy(original.position);
  mesh.rotation.copy(original.rotation);
  mesh.scale.copy(original.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.visible = false;
  return mesh;
}

/** A chunk of land floating in the sky, with a little tree on top. Modelled Z-up. */
function floatingIsland(size) {
  const island = new THREE.Group();
  const rockBody = new THREE.Mesh(
    new THREE.ConeGeometry(size, size * 1.6, 7),
    new THREE.MeshStandardMaterial({ color: '#8a7a6a', flatShading: true, roughness: 0.9 })
  );
  rockBody.rotation.x = -Math.PI / 2;
  rockBody.position.z = -size * 0.8;
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(size, size * 0.95, size * 0.25, 7),
    new THREE.MeshStandardMaterial({ color: '#7ed957', flatShading: true })
  );
  top.rotation.x = Math.PI / 2;
  const tree = new THREE.Mesh(roundTree(BLOSSOM), material);
  tree.scale.setScalar(size / 40);
  tree.position.z = size * 0.12;
  island.add(rockBody, top, tree);
  island.traverse((child) => child.isMesh && (child.castShadow = true));
  return island;
}

export class Divinity {
  constructor({ scene, map, environment }) {
    this.map = map;
    this.environment = environment;
    this.tier = 0;
    this.time = 0;
    this.growing = []; // { object, scale, born }
    this.root = new THREE.Group();
    scene.add(this.root);

    // Alternative looks for the existing trees and rocks: { tier → visible mesh } per prop.
    this.variants = [];
    for (const { kind, mesh } of environment.gardenProps) this.addVariants(kind, mesh, restyleSingle);
    for (const { kind, mesh } of environment.forestMeshes) this.addVariants(kind, mesh, restyle);

    this.layers = [this.createBlooms(), this.createGoldenTouches(), this.createCrystals(), this.createHeaven()];
  }

  /** Blossom (tier 2), crystal (tier 3) and golden (tier 4) versions of a prop. */
  addVariants(kind, original, copy) {
    const looks = { 0: original };
    const add = (tier, geometry, surface) => {
      looks[tier] = copy(original, geometry, surface);
      original.parent.add(looks[tier]);
    };
    if (kind === 'roundTree') {
      add(2, roundTree(BLOSSOM, LIGHT_TRUNK));
      add(4, roundTree(GOLD_LEAVES, LIGHT_TRUNK), goldMaterial);
    } else if (kind === 'pineTree') {
      add(4, pineTree(GOLD_PINE, LIGHT_TRUNK), goldMaterial);
    } else if (kind === 'bush') {
      add(2, bush(BLOSSOM));
      add(4, bush(GOLD_LEAVES), goldMaterial);
    } else if (kind === 'rock') {
      add(3, rock(10, CRYSTAL), crystalMaterial);
    }
    this.variants.push(looks);
  }

  // --- Tier 1: blooms ----------------------------------------------------------
  createBlooms() {
    const group = new THREE.Group();
    const { blocked } = this.environment;
    ['#ffe066', '#ff9ec7', '#9fefff', '#ffffff'].forEach((color) => {
      const spots = scatterPoints(40, { inside: insideArena(14), spacing: 20, avoid: blocked });
      const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
      group.add(instanced(flower(color), spots.map((s) => ({ ...s, scale: 1.3 })), { shadows: false, surface: glow }));
    });
    return group;
  }

  // --- Tier 2: petals and lanterns ---------------------------------------------
  createGoldenTouches() {
    const group = new THREE.Group();

    const lanternBody = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd36b' }));
    const lanternGlow = new THREE.Mesh(
      new THREE.SphereGeometry(8, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.lanterns = [];
    const edge = MAP_HALF_SIZE + 4;
    for (let i = -4; i <= 4; i++) {
      const along = (i / 4) * (MAP_HALF_SIZE - 90);
      for (const [x, y] of [
        [along, edge],
        [along, -edge],
        [edge, along],
        [-edge, along],
      ]) {
        const lantern = new THREE.Group();
        lantern.add(lanternBody.clone(), lanternGlow.clone());
        lantern.position.set(x, y, 34);
        lantern.userData.phase = Math.random() * Math.PI * 2;
        group.add(lantern);
        this.lanterns.push(lantern);
      }
    }

    // Petals drifting down over the garden.
    const count = 220;
    this.petals = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(3.2, 2.2),
      new THREE.MeshLambertMaterial({ color: '#ffc4dc', side: THREE.DoubleSide }),
      count
    );
    this.petals.frustumCulled = false;
    this.petalData = Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * MAP_HALF_SIZE * 2.4,
      y: (Math.random() - 0.5) * MAP_HALF_SIZE * 2.4,
      z: Math.random() * 160,
      spin: Math.random() * 10,
      fall: 12 + Math.random() * 14,
    }));
    group.add(this.petals);
    return group;
  }

  // --- Tier 3: crystals and floating islands -----------------------------------
  createCrystals() {
    const group = new THREE.Group();
    const crystal = new THREE.OctahedronGeometry(1, 0);
    crystal.scale(4, 4, 14);
    const crystalGlow = new THREE.MeshStandardMaterial({
      color: '#bff0ff',
      emissive: '#5fd8ff',
      emissiveIntensity: 0.7,
      roughness: 0.15,
      metalness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    const spots = scatterPoints(36, { inside: insideArena(16), spacing: 60, avoid: this.environment.blocked });
    const clusters = new THREE.InstancedMesh(crystal, crystalGlow, spots.length * 3);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (const { x, y } of spots) {
      for (let i = 0; i < 3; i++) {
        const tilt = new THREE.Euler((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, Math.random() * Math.PI);
        const size = 0.5 + Math.random() * 0.7;
        matrix.compose(
          new THREE.Vector3(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 4 * size),
          new THREE.Quaternion().setFromEuler(tilt),
          new THREE.Vector3(size, size, size)
        );
        clusters.setMatrixAt(index++, matrix);
      }
    }
    clusters.castShadow = true;
    group.add(clusters);

    this.islands = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
      const distance = MAP_HALF_SIZE + 160 + Math.random() * 380;
      const island = floatingIsland(25 + Math.random() * 30);
      island.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 70 + Math.random() * 110);
      island.userData.phase = Math.random() * Math.PI * 2;
      island.userData.baseZ = island.position.z;
      group.add(island);
      this.islands.push(island);
    }
    return group;
  }

  // --- Tier 4: heaven ------------------------------------------------------------
  createHeaven() {
    const group = new THREE.Group();

    // The garden becomes a floating island: a square block of earth under the lawn, with a grassy rim
    // for the fence and hives. A 4-sided cylinder turned 45° is a square frustum.
    const rim = MAP_HALF_SIZE + 70;
    const cliffShape = new THREE.CylinderGeometry(rim * Math.SQRT2, MAP_HALF_SIZE * 0.8, 160, 4, 1);
    cliffShape.rotateY(Math.PI / 4);
    const earth = new THREE.MeshStandardMaterial({ color: '#8a7a6a', flatShading: true, roughness: 0.9 });
    const grass = new THREE.MeshStandardMaterial({ color: '#7ed957', flatShading: true, roughness: 0.9 });
    const cliff = new THREE.Mesh(cliffShape, [earth, grass, earth]);
    cliff.rotation.x = Math.PI / 2;
    cliff.position.z = -80.6;
    cliff.receiveShadow = true;
    group.add(cliff);

    // Cloud banks around the island.
    const puffs = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }),
      90
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = MAP_HALF_SIZE * 1.15 + Math.random() * 600;
      const size = 30 + Math.random() * 60;
      matrix.compose(
        new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, -60 + Math.random() * 50),
        new THREE.Quaternion(),
        new THREE.Vector3(size * 1.6, size, size * 0.6)
      );
      puffs.setMatrixAt(i, matrix);
    }
    group.add(puffs);

    // A colossal golden teapot circling in the sky.
    const teapot = createTeapot();
    teapot.traverse((child) => {
      if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#a06a00', emissiveIntensity: 0.4, metalness: 0.8, roughness: 0.25, flatShading: true });
    });
    teapot.scale.setScalar(3);
    this.monument = teapot;
    group.add(teapot);

    // Pillars of light at the four corners.
    const beamMaterial = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.beams = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sy) => {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(14, 22, 600, 16, 1, true), beamMaterial);
        beam.rotation.x = Math.PI / 2;
        beam.position.set(sx * (MAP_HALF_SIZE - 20), sy * (MAP_HALF_SIZE - 20), 300);
        group.add(beam);
        return beam;
      })
    );
    return group;
  }

  /** Shows the world for `tier` right away (call it during the transformation flash). */
  setTier(tier) {
    const previous = this.tier;
    this.tier = tier;

    this.map.setStyle(tier >= 4 ? 'marble' : tier >= 1 ? 'lush' : 'garden', tier >= 4 ? 'clouds' : 'meadow');
    for (const mesh of this.environment.outside) mesh.visible = tier < 4;
    this.environment.insideGrass.visible = tier < 4; // no weeds between the marble tiles

    for (const looks of this.variants) {
      const shown = Math.max(...Object.keys(looks).map(Number).filter((t) => t <= tier));
      for (const [lookTier, mesh] of Object.entries(looks)) {
        const visible = Number(lookTier) === shown;
        mesh.visible = visible;
        if (visible && Number(lookTier) > previous && Number(lookTier) > 0) this.grow(mesh);
      }
    }
    // Golden trees outside the fence would float on clouds; only the garden's own props stay.
    if (tier >= 4) for (const { mesh } of this.environment.forestMeshes) this.hideForest(mesh);

    const water = this.environment.pondWater.material;
    water.emissive.set(tier >= 3 ? '#2fb8ff' : '#000000');
    water.emissiveIntensity = tier >= 3 ? 0.6 : 0;

    this.layers.forEach((layer, i) => {
      const wasVisible = layer.parent && layer.visible;
      const visible = tier >= i + 1;
      if (visible && !layer.parent) this.root.add(layer);
      if (layer.parent) layer.visible = visible;
      if (visible && !wasVisible) layer.children.forEach((child) => this.grow(child));
    });
  }

  hideForest(original) {
    for (const looks of this.variants) {
      if (Object.values(looks).includes(original)) Object.values(looks).forEach((mesh) => (mesh.visible = false));
    }
  }

  /** Grows an object in from nothing. Instanced meshes are skipped: scaling them would move every instance. */
  grow(object) {
    if (object.isInstancedMesh) return;
    const scale = object.scale.clone();
    object.scale.setScalar(0.001);
    this.growing.push({ object, scale, born: this.time });
  }

  update(delta) {
    this.time += delta;
    const time = this.time;

    this.growing = this.growing.filter(({ object, scale, born }) => {
      const t = Math.min(1, (time - born) / GROW_TIME);
      const ease = 1 - (1 - t) ** 3;
      object.scale.copy(scale).multiplyScalar(Math.max(0.001, ease));
      return t < 1;
    });

    if (this.tier >= 2) {
      for (const lantern of this.lanterns) lantern.position.z = 34 + Math.sin(time * 1.5 + lantern.userData.phase) * 5;
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      this.petalData.forEach((petal, i) => {
        petal.z -= petal.fall * delta;
        petal.x += Math.sin(time + petal.spin) * 10 * delta;
        if (petal.z < 0) petal.z += 160;
        rotation.setFromEuler(new THREE.Euler(time * 2 + petal.spin, time * 1.3 + petal.spin, petal.spin));
        matrix.compose(new THREE.Vector3(petal.x, petal.y, petal.z), rotation, one);
        this.petals.setMatrixAt(i, matrix);
      });
      this.petals.instanceMatrix.needsUpdate = true;
    }
    if (this.tier >= 3) {
      for (const island of this.islands) {
        island.position.z = island.userData.baseZ + Math.sin(time * 0.6 + island.userData.phase) * 10;
        island.rotation.z = Math.sin(time * 0.2 + island.userData.phase) * 0.2;
      }
    }
    if (this.tier >= 4) {
      const angle = time * 0.08;
      this.monument.position.set(Math.cos(angle) * 900 - 300, Math.sin(angle) * 900 + 300, 260);
      this.monument.rotation.z = angle + Math.PI / 2;
      this.beams.forEach((beam, i) => (beam.material.opacity = 0.18 + 0.08 * Math.sin(time * 2 + i)));
    }
  }
}
