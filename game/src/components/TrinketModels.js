import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural models for the trinkets players place in the title garden (see Rewards.js for the list). Each is a
 * small low-poly ornament in the garden's style, modelled Y-up and turned Z-up by `buildTrinket`, standing on z = 0
 * and roughly 20–45 units tall (Tode is about 40).
 */

const materials = new Map();
function mat(color, { emissive = null, intensity = 0.6, metal = 0, rough = 0.6, opacity = 1 } = {}) {
  const key = `${color}|${emissive}|${intensity}|${metal}|${rough}|${opacity}`;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        emissive: emissive ?? '#000000',
        emissiveIntensity: emissive ? intensity : 0,
        metalness: metal,
        roughness: rough,
        transparent: opacity < 1,
        opacity,
        flatShading: true,
      })
    );
  }
  return materials.get(key);
}

const GOLD = () => mat('#ffc93c', { emissive: '#7a4a00', intensity: 0.5, metal: 0.7, rough: 0.3 });
const STONE = () => mat('#b8b0a0', { rough: 0.9 });
const WOOD = () => mat('#8a5a32', { rough: 0.8 });
const FROG = () => mat('#5fbf3a', { rough: 0.5 });

function mesh(geometry, material, [x = 0, y = 0, z = 0] = [], rotation = null) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, material, at, rotation) => mesh(new THREE.BoxGeometry(w, h, d), material, at, rotation);
const cyl = (top, bottom, h, material, at, segments = 8, rotation) => mesh(new THREE.CylinderGeometry(top, bottom, h, segments), material, at, rotation);
const ball = (r, material, at, detail = 1) => mesh(new THREE.IcosahedronGeometry(r, detail), material, at);
const cone = (r, h, material, at, segments = 6, rotation) => mesh(new THREE.ConeGeometry(r, h, segments), material, at, rotation);
const torus = (r, tube, material, at, rotation, arc = Math.PI * 2) => mesh(new THREE.TorusGeometry(r, tube, 6, 16, arc), material, at, rotation);

/** A little frog head, used by the gnome and the idol. */
function frogHead(group, material, y, size = 1) {
  group.add(ball(7 * size, material, [0, y, 0]));
  for (const side of [-1, 1]) {
    group.add(ball(2.6 * size, material, [side * 4 * size, y + 5 * size, 2 * size]));
    group.add(ball(1.3 * size, mat('#1a1a1a'), [side * 4 * size, y + 5.6 * size, 4 * size], 0));
  }
}

const BUILDERS = {
  lantern: (g) => {
    g.add(cyl(7, 9, 4, STONE(), [0, 2, 0], 6));
    g.add(cyl(3, 3, 14, STONE(), [0, 11, 0], 6));
    g.add(box(12, 9, 12, STONE(), [0, 22, 0]));
    const flame = box(8, 6, 13, new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ff9a2a', emissiveIntensity: 1.4, flatShading: true }), [0, 22, 0]);
    g.add(flame);
    g.userData.anim = (t, night) => (flame.material.emissiveIntensity = (night ? 2.4 : 1.2) + 0.35 * Math.sin(t * 9) * Math.sin(t * 3.3));
    g.add(cone(12, 7, STONE(), [0, 30, 0], 4, [0, Math.PI / 4, 0]));
    g.add(ball(2, STONE(), [0, 35, 0], 0));
  },
  teapot: (g) => {
    g.add(box(18, 6, 18, STONE(), [0, 3, 0]));
    const pot = mat('#f4f0e8', { rough: 0.3 });
    g.add(ball(10, pot, [0, 16, 0]));
    const lid = new THREE.Group();
    lid.add(cyl(4, 6, 4, pot, [0, 0, 0]), ball(2, GOLD(), [0, 3, 0], 0));
    lid.position.y = 26;
    g.add(lid);
    // The lid rattles now and then, as if the tea inside were boiling.
    g.userData.anim = (t) => {
      const rattle = Math.max(0, Math.sin(t * 0.9)) ** 8;
      lid.position.y = 26 + rattle * 1.5 * Math.abs(Math.sin(t * 30));
      lid.rotation.z = rattle * 0.08 * Math.sin(t * 25);
    };
    g.add(cyl(1.5, 2.5, 12, pot, [11, 18, 0], 6, [0, 0, -0.9]));
    g.add(torus(5, 1.4, pot, [-10, 17, 0], [0, 0, 0]));
    g.add(torus(10.2, 1, mat('#5b8fd6'), [0, 16, 0], [Math.PI / 2, 0, 0]));
  },
  mushrooms: (g) => {
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const r = 14;
      const h = 5 + (i % 3) * 3;
      g.add(cyl(1.4, 1.8, h, mat('#f3e6c8'), [Math.cos(angle) * r, h / 2, Math.sin(angle) * r], 6));
      const cap = mesh(new THREE.SphereGeometry(4 + (i % 2) * 1.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(i % 2 ? '#e0523b' : '#9b4dff', { emissive: i % 2 ? '#5a1010' : '#4a1a8a', intensity: 0.4 }), [Math.cos(angle) * r, h, Math.sin(angle) * r]);
      g.add(cap);
    }
    const wisp = ball(1.6, mat('#fff27a', { emissive: '#ffd36b', intensity: 1.5 }), [0, 10, 0], 0);
    g.add(wisp);
    g.userData.anim = (t) => {
      wisp.position.set(Math.cos(t * 0.8) * 8, 10 + Math.sin(t * 1.7) * 4, Math.sin(t * 0.8) * 8);
    };
  },
  hive: (g) => {
    g.add(cyl(9, 9, 3, WOOD(), [0, 1.5, 0], 10));
    const honey = mat('#ffb52e', { emissive: '#8a4a00', intensity: 0.4, rough: 0.4 });
    for (let i = 0; i < 5; i++) g.add(cyl(8 - i * 1.3, 9 - i * 1.3, 4, honey, [0, 5 + i * 4, 0], 10));
    g.add(ball(2, mat('#1a1a1a'), [0, 9, 8], 0));
    g.add(ball(3, GOLD(), [0, 26, 0], 0));
    g.add(cone(3, 4, GOLD(), [0, 30, 0], 5));
    const bees = [0, 1, 2].map(() => ball(1.3, mat('#ffd23f', { emissive: '#8a5a00', intensity: 0.4 }), [0, 0, 0], 0));
    g.add(...bees);
    g.userData.anim = (t) => bees.forEach((bee, i) => {
      const a = t * (2.2 + i * 0.5) + i * 2.1;
      bee.position.set(Math.cos(a) * (11 + i * 2), 14 + Math.sin(t * 5 + i) * 4, Math.sin(a) * (11 + i * 2));
    });
  },
  helm: (g) => {
    g.add(cyl(3, 4, 16, WOOD(), [0, 8, 0], 6));
    const red = mat('#b8322a', { metal: 0.4, rough: 0.3 });
    g.add(mesh(new THREE.SphereGeometry(10, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), red, [0, 18, 0]));
    g.add(cyl(13, 14, 2, mat('#2a1a1a', { metal: 0.5, rough: 0.4 }), [0, 18, 0], 10));
    for (const side of [-1, 1]) g.add(cone(2, 14, GOLD(), [side * 6, 32, 0], 4, [0, 0, -side * 0.4]));
  },
  feather: (g) => {
    g.add(cyl(6, 8, 3, STONE(), [0, 1.5, 0], 8));
    const plume = mat('#fff1b8', { emissive: '#ffd36b', intensity: 0.7 });
    const blade = mesh(new THREE.SphereGeometry(6, 8, 6), plume, [0, 22, 0]);
    blade.scale.set(0.9, 3.4, 0.3);
    blade.rotation.z = 0.25;
    const quill = cyl(0.6, 0.8, 34, GOLD(), [-1, 18, 0], 5, [0, 0, 0.25]);
    const plumeGroup = new THREE.Group();
    plumeGroup.add(blade, quill);
    g.add(plumeGroup);
    g.userData.anim = (t) => {
      plumeGroup.position.y = 3 + Math.sin(t * 1.4) * 2.5;
      plumeGroup.rotation.y = t * 0.6;
    };
  },
  crown: (g) => {
    g.add(box(16, 10, 16, mat('#7a3dbf', { rough: 0.5 }), [0, 5, 0]));
    g.add(box(14, 2, 14, mat('#c86bff', { emissive: '#4a1a8a', intensity: 0.3 }), [0, 11, 0]));
    const crown = new THREE.Group();
    crown.add(cyl(7, 7, 6, GOLD(), [0, 15, 0], 10));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      crown.add(cone(1.6, 6, GOLD(), [Math.cos(angle) * 6.5, 21, Math.sin(angle) * 6.5], 4));
      crown.add(ball(1, mat('#ff3b6b', { emissive: '#a0103a', intensity: 0.8 }), [Math.cos(angle) * 7.2, 15, Math.sin(angle) * 7.2], 0));
    }
    g.add(crown);
    g.userData.anim = (t) => {
      crown.rotation.y = t * 0.5;
      crown.position.y = 1 + Math.sin(t * 1.2) * 1.2;
    };
  },
  horns: (g) => {
    g.add(box(18, 8, 10, mat('#3a1a14', { rough: 0.9 }), [0, 4, 0]));
    const horn = mat('#2a0606', { emissive: '#ff3a10', intensity: 0.35, rough: 0.4 });
    for (const side of [-1, 1]) {
      g.add(cone(3.5, 18, horn, [side * 6, 16, 0], 6, [0, 0, -side * 0.5]));
      g.add(cone(2, 8, horn, [side * 11, 25, 0], 6, [0, 0, side * 0.6]));
    }
    const ember = ball(2.5, new THREE.MeshStandardMaterial({ color: '#ff6a10', emissive: '#ff3a00', emissiveIntensity: 1.6, flatShading: true }), [0, 11, 5], 0);
    g.add(ember);
    g.userData.anim = (t, night) => (ember.material.emissiveIntensity = (night ? 2.6 : 1.4) + Math.sin(t * 4) * 0.6);
  },
  idol: (g) => {
    g.add(box(18, 6, 18, STONE(), [0, 3, 0]));
    g.add(ball(9, GOLD(), [0, 14, 0]));
    frogHead(g, GOLD(), 26, 1);
    const halo = torus(10, 0.8, mat('#fff2a0', { emissive: '#ffd36b', intensity: 1.2 }), [0, 40, 0], [Math.PI / 2, 0, 0]);
    g.add(halo);
    g.userData.anim = (t) => {
      halo.position.y = 40 + Math.sin(t * 2) * 1.5;
      halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.15;
    };
  },
  banner: (g) => {
    g.add(cyl(1, 1.2, 44, WOOD(), [0, 22, 0], 6));
    const cloth = mat('#e0523b', { emissive: '#5a1010', intensity: 0.3 });
    const flag = new THREE.Group();
    flag.add(box(14, 20, 0.6, cloth, [7, 0, 0]), ball(4, mat('#ffd36b', { emissive: '#8a5a00', intensity: 0.5 }), [7, 0, 0.6], 0));
    flag.position.set(0.5, 32, 0);
    g.add(flag);
    g.userData.anim = (t) => (flag.rotation.y = Math.sin(t * 2.3) * 0.35 + Math.sin(t * 5.1) * 0.08);
    g.add(ball(1.6, GOLD(), [0, 44.5, 0], 0));
  },
  bonsai: (g) => {
    g.add(box(18, 5, 12, mat('#3a5f8a', { rough: 0.4 }), [0, 2.5, 0]));
    g.add(cyl(1.6, 2.6, 12, WOOD(), [0, 10, 0], 6, [0, 0, 0.3]));
    const leaves = mat('#3f9d3a', { rough: 0.7 });
    const crown = new THREE.Group();
    crown.add(ball(6, leaves, [-3, 4, 0]), ball(5, leaves, [5, 1, 2]), ball(4, leaves, [2, 7, -3]));
    crown.position.y = 14;
    g.add(crown);
    g.userData.anim = (t) => (crown.rotation.z = Math.sin(t * 1.1) * 0.05);
  },
  fountain: (g) => {
    g.add(cyl(16, 17, 5, STONE(), [0, 2.5, 0], 12));
    g.add(cyl(14, 14, 1, mat('#7fd8ff', { emissive: '#2a7aaa', intensity: 0.5, rough: 0.1, opacity: 0.85 }), [0, 5, 0], 12));
    g.add(cyl(3, 4, 12, STONE(), [0, 9, 0], 8));
    g.add(cyl(8, 6, 3, STONE(), [0, 16, 0], 10));
    const pad = mat('#4caf3a');
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1;
      g.add(cyl(4, 4, 0.8, pad, [Math.cos(angle) * 9, 5.6, Math.sin(angle) * 9], 10));
    }
    g.add(ball(2.5, mat('#ff9ec7', { emissive: '#a0284a', intensity: 0.4 }), [0, 19, 0], 0));
    const water = mat('#bfefff', { emissive: '#4ab8ff', intensity: 0.6, opacity: 0.8 });
    const drops = Array.from({ length: 8 }, () => ball(0.9, water, [0, 0, 0], 0));
    g.add(...drops);
    g.userData.anim = (t) => drops.forEach((drop, i) => {
      const k = (t * 0.9 + i / drops.length) % 1;
      const a = (i / drops.length) * Math.PI * 2;
      drop.position.set(Math.cos(a) * k * 10, 21 + k * 10 - k * k * 24, Math.sin(a) * k * 10);
    });
  },
  gnome: (g) => {
    g.add(cyl(6, 8, 14, mat('#3a7ad9'), [0, 7, 0], 8));
    frogHead(g, FROG(), 19, 0.8);
    const hat = cone(6, 14, mat('#e0523b'), [0, 29, 0], 8, [0.2, 0, 0]);
    g.add(hat);
    g.userData.anim = (t) => (hat.rotation.z = Math.sin(t * 1.6) * 0.12);
    g.add(ball(4, mat('#ffffff'), [0, 13, 5], 0));
  },
  chimes: (g) => {
    g.add(cyl(0.8, 1, 36, WOOD(), [0, 18, 0], 5));
    g.add(box(18, 1.2, 1.2, WOOD(), [7, 35, 0]));
    const tube = mat('#cfe0ff', { metal: 0.8, rough: 0.2 });
    const tubes = [];
    for (let i = 0; i < 4; i++) {
      const hanger = new THREE.Group();
      hanger.position.set(3 + i * 4, 34.5, 0);
      hanger.add(cyl(0.9, 0.9, 7 + i * 2, tube, [0, -(4.5 + i), 0], 6));
      tubes.push(hanger);
      g.add(hanger);
    }
    g.add(ball(1.8, mat('#ff9ec7'), [10, 24, 0], 0));
    g.userData.anim = (t) => tubes.forEach((hanger, i) => (hanger.rotation.z = Math.sin(t * 2.4 + i * 1.3) * 0.18 * (0.6 + 0.4 * Math.sin(t * 0.5))));
  },
  trophy: (g) => {
    g.add(box(14, 4, 14, mat('#3a2a1a'), [0, 2, 0]));
    g.add(cyl(2, 3, 6, GOLD(), [0, 7, 0], 8));
    g.add(ball(9, GOLD(), [0, 17, 0]));
    g.add(cyl(3, 5, 4, GOLD(), [0, 26, 0], 8));
    g.add(cyl(1.5, 2.5, 10, GOLD(), [10, 19, 0], 6, [0, 0, -0.9]));
    g.add(torus(4.5, 1.3, GOLD(), [-9.5, 18, 0], [0, 0, 0]));
  },
  tulips: (g) => {
    g.add(cyl(8, 6, 10, mat('#c8693a'), [0, 5, 0], 8));
    const colors = ['#ff5a7a', '#ffd23f', '#ff9ec7', '#e0523b', '#c86bff'];
    const stems = colors.map((color, i) => {
      const angle = (i / colors.length) * Math.PI * 2;
      const stem = new THREE.Group();
      stem.position.set(Math.cos(angle) * 4, 9, Math.sin(angle) * 4);
      stem.add(cyl(0.5, 0.5, 12, mat('#3f9d3a'), [0, 6, 0], 4));
      stem.add(cone(2.6, 5, mat(color, { emissive: color, intensity: 0.15 }), [0, 13.5, 0], 6, [Math.PI, 0, 0]));
      g.add(stem);
      return stem;
    });
    g.userData.anim = (t) => stems.forEach((stem, i) => (stem.rotation.z = Math.sin(t * 1.5 + i) * 0.08));
  },
  bench: (g) => {
    g.add(box(30, 2, 9, WOOD(), [0, 9, 0]));
    g.add(box(30, 8, 1.6, WOOD(), [0, 16, -4.5], [-0.15, 0, 0]));
    for (const x of [-12, 12]) for (const z of [-3, 3]) g.add(box(2, 8, 2, mat('#3a3a3a', { metal: 0.6 }), [x, 4, z]));
    g.add(cyl(2.6, 2, 3, mat('#ffffff'), [6, 11.5, 1], 10));
  },
  cups: (g) => {
    const colors = ['#ffffff', '#ffd1e3', '#bfe8ff', '#fff2a0'];
    for (let i = 0; i < 6; i++) {
      const y = 3 + i * 5.5;
      g.add(cyl(5.5 - i * 0.4, 4 - i * 0.3, 5, mat(colors[i % 4], { rough: 0.3 }), [(i % 2) * 1.2, y, 0], 10, [0, 0, (i % 2 ? 1 : -1) * 0.06]));
    }
    g.add(ball(2, mat('#c98a2b'), [0, 36, 0], 0));
    g.userData.anim = (t) => (g.rotation.z = Math.sin(t * 1.3) * 0.03);
  },
  jar: (g) => {
    g.add(cyl(6, 6, 16, mat('#d8f4ff', { rough: 0.05, opacity: 0.45 }), [0, 8, 0], 12));
    g.add(cyl(6.5, 6.5, 3, WOOD(), [0, 17.5, 0], 12));
    const glow = mat('#fff27a', { emissive: '#ffd36b', intensity: 2 });
    const flies = Array.from({ length: 6 }, (_, i) => ball(0.9, glow, [0, 0, 0], 0));
    g.add(...flies);
    g.userData.anim = (t) => flies.forEach((fly, i) => {
      const a = t * (1 + i * 0.2) + i * 2.4;
      fly.position.set(Math.cos(a) * 3.5, 3 + ((t * 0.3 + i / 6) % 1) * 12, Math.sin(a) * 3.5);
      fly.visible = Math.sin(t * 3 + i * 1.7) > -0.6; // blinking
    });
  },
  crystal: (g) => {
    g.add(cyl(6, 8, 3, STONE(), [0, 1.5, 0], 6));
    const gem = mat('#7ff0d0', { emissive: '#1fa08a', intensity: 0.9, rough: 0.1 });
    const big = mesh(new THREE.OctahedronGeometry(8, 0), gem, [0, 15, 0]);
    big.scale.set(0.7, 1.6, 0.7);
    g.add(big);
    g.userData.anim = (t) => {
      big.rotation.y = t * 0.8;
      big.position.y = 16 + Math.sin(t * 1.5) * 2;
    };
    g.add(mesh(new THREE.OctahedronGeometry(4, 0), gem, [6, 6, 2]));
    g.add(mesh(new THREE.OctahedronGeometry(3, 0), gem, [-5, 5, -2]));
  },
  duck: (g) => {
    const yellow = mat('#ffd23f', { rough: 0.4 });
    const body = ball(8, yellow, [0, 8, 0]);
    body.scale.set(1.3, 0.9, 1);
    g.add(body, ball(5, yellow, [7, 16, 0]));
    g.add(cone(2.4, 5, mat('#ff8a2a'), [12, 16, 0], 6, [0, 0, -Math.PI / 2]));
    for (const z of [-2.6, 2.6]) g.add(ball(1, mat('#1a1a1a'), [9.5, 18, z], 0));
    g.add(cone(3, 5, yellow, [-10, 11, 0], 4, [0, 0, 1]));
    g.userData.anim = (t) => {
      g.position.y = Math.abs(Math.sin(t * 2)) * 1.2;
      g.rotation.z = Math.sin(t * 2) * 0.06;
    };
  },
  snail: (g) => {
    const body = mat('#c8e08a', { rough: 0.5 });
    const foot = ball(5, body, [0, 3, 0]);
    foot.scale.set(2.6, 0.7, 1);
    g.add(foot);
    g.add(torus(6, 3.2, mat('#c98a2b', { rough: 0.4 }), [-2, 11, 0], [0, 0, 0]));
    g.add(ball(3, mat('#e7b45a'), [-2, 11, 0], 0));
    for (const z of [-1.6, 1.6]) {
      g.add(cyl(0.5, 0.5, 7, body, [11, 9, z], 4, [0, 0, -0.3]));
      g.add(ball(1.2, mat('#1a1a1a'), [12.2, 12.6, z], 0));
    }
    // Inches around a little circle.
    g.userData.anim = (t) => {
      const a = t * 0.12;
      g.position.set(Math.cos(a) * 8, 0, -Math.sin(a) * 8);
      g.rotation.y = a + Math.PI / 2;
      foot.scale.set(2.6 + Math.sin(t * 3) * 0.15, 0.7, 1);
    };
  },
  trampoline: (g) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(cyl(1.2, 1.2, 8, mat('#3a3a3a', { metal: 0.6 }), [Math.cos(a) * 17, 4, Math.sin(a) * 17], 5));
    }
    g.add(torus(19, 2, mat('#5fb8ff', { rough: 0.4 }), [0, 8.5, 0], [Math.PI / 2, 0, 0]));
    const pad = cyl(18, 18, 1.2, mat('#4caf3a', { emissive: '#1f5a10', intensity: 0.3 }), [0, 8.5, 0], 20);
    g.add(pad);
    const flower = ball(2.5, mat('#ff9ec7', { emissive: '#a0284a', intensity: 0.4 }), [6, 9.5, 4], 0);
    g.add(flower);
    // A bounce (TitleGarden sets `bounce` when a frog lands on it) makes the pad dip and spring back.
    g.userData.moving = [pad, flower]; // only after a bounce, so mergeStill can't see them move by itself
    g.userData.anim = (t) => {
      const dip = g.userData.springAt ? Math.max(0, 1 - (t - g.userData.springAt) * 3) : 0;
      pad.position.y = 8.5 - Math.sin(dip * Math.PI * 3) * 2.5 * dip;
      flower.position.y = pad.position.y + 1;
    };
  },
  ball: (g) => {
    const steel = mat('#d8dde6', { metal: 0.9, rough: 0.25 });
    g.add(ball(8, mat('#c98a2b', { rough: 0.6 }), [0, 8, 0], 1)); // the tea leaves inside
    for (let i = 0; i < 4; i++) g.add(torus(8.6, 0.6, steel, [0, 8, 0], [0, (i / 4) * Math.PI, 0]));
    g.add(torus(8.6, 0.6, steel, [0, 8, 0], [Math.PI / 2, 0, 0]));
    g.add(torus(1.6, 0.4, steel, [0, 17, 0], [0, 0, 0]));
  },
  launcher: (g) => {
    g.add(box(30, 6, 22, WOOD(), [0, 3, 0]));
    for (const z of [-12, 12]) for (const x of [-10, 10]) g.add(cyl(4, 4, 2, mat('#3a2a1a'), [x, 4, z], 10, [Math.PI / 2, 0, 0]));
    const pot = mat('#7fb8d6', { rough: 0.35, metal: 0.2 });
    const body = ball(11, pot, [-2, 16, 0]);
    body.scale.set(1.1, 0.9, 1);
    g.add(body);
    // The spout points along +X (the way frogs are fired) and up.
    g.add(cyl(3.5, 6, 20, pot, [12, 22, 0], 10, [0, 0, -1.05]));
    g.add(torus(4, 1, GOLD(), [20.5, 26.5, 0], [0, Math.PI / 2, 0.52]));
    g.add(cyl(4, 6, 4, pot, [-2, 26, 0], 10));
    g.add(ball(1.8, GOLD(), [-2, 29, 0], 0));
    const puff = ball(3, mat('#ffffff', { opacity: 0.7 }), [22, 28, 0], 0);
    g.add(puff);
    g.userData.anim = (t) => {
      const k = (t * 0.6) % 1;
      puff.position.set(22 + k * 6, 28 + k * 12, 0);
      puff.scale.setScalar(0.5 + k);
    };
  },
  stage: (g) => {
    g.add(cyl(30, 32, 8, WOOD(), [0, 4, 0], 16));
    g.add(cyl(29, 29, 0.6, mat('#b8322a', { rough: 0.8 }), [0, 8.3, 0], 16));
    for (const side of [-1, 1]) {
      g.add(cyl(1, 1, 34, mat('#3a3a3a', { metal: 0.6 }), [side * 26, 17, -14], 5));
      const lamp = cone(4, 6, mat('#2a2a2a', { metal: 0.5 }), [side * 24, 33, -12], 8, [0.6, 0, side * 0.5]);
      g.add(lamp);
      g.add(ball(2, mat('#fff2a0', { emissive: '#ffd36b', intensity: 1.5 }), [side * 23, 31, -10], 0));
    }
    const stars = [0, 1, 2].map((i) => ball(1.2, mat('#fff27a', { emissive: '#ffd36b', intensity: 1.4 }), [0, 0, 0], 0));
    g.add(...stars);
    g.userData.anim = (t) => stars.forEach((star, i) => {
      const a = t * 0.9 + (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 24, 14 + Math.sin(t * 2 + i) * 3, Math.sin(a) * 24);
    });
  },
  scarebee: (g) => {
    g.add(cyl(1, 1, 34, WOOD(), [0, 17, 0], 5));
    g.add(box(22, 1.5, 1.5, WOOD(), [0, 24, 0]));
    const stripes = [mat('#ffd23f'), mat('#2b2b2b')];
    for (let i = 0; i < 4; i++) g.add(cyl(5.5 - Math.abs(i - 1.5), 5.5 - Math.abs(i - 1.5), 3.5, stripes[i % 2], [0, 12 + i * 3.5, 0], 10));
    g.add(ball(5, mat('#ffd23f'), [0, 30, 0]));
    g.add(cone(5, 7, mat('#8a6a3a'), [0, 37, 0], 8));
    const wing = mat('#e8f8ff', { opacity: 0.6, rough: 0.1 });
    const wings = [-1, 1].map((side) => {
      const hinge = new THREE.Group();
      hinge.position.set(side * 3, 27, -2);
      const w = ball(5, wing, [side * 6, 0, 0]);
      w.scale.set(1.4, 0.8, 0.2);
      hinge.add(w);
      g.add(hinge);
      return { hinge, side };
    });
    g.userData.anim = (t) => wings.forEach(({ hinge, side }) => (hinge.rotation.y = side * Math.sin(t * 30) * 0.35 * (Math.sin(t * 0.7) > 0.3 ? 1 : 0.15)));
  },
  // The Daily Brew champion's trinkets (Rewards.js, source 'champion').
  podium: (g) => {
    // Three steps, gold in the middle, with a star spinning over the winner's step.
    const steps = [
      { x: 0, h: 16, top: GOLD(), mark: 1 },
      { x: -13, h: 11, top: mat('#d8dee8', { metal: 0.6, rough: 0.3 }), mark: 2 },
      { x: 13, h: 7, top: mat('#d0884a', { metal: 0.5, rough: 0.35 }), mark: 3 },
    ];
    for (const { x, h, top, mark } of steps) {
      g.add(box(13, h, 13, mat('#f4efe4', { rough: 0.7 }), [x, h / 2, 0]));
      g.add(box(13.4, 1.2, 13.4, top, [x, h + 0.6, 0]));
      // Its place in little bars on the front (1, 2 or 3 of them).
      for (let i = 0; i < mark; i++) g.add(box(1.2, Math.min(5, h - 3), 0.6, top, [x + (i - (mark - 1) / 2) * 2.4, h / 2, 6.6]));
    }
    g.add(cyl(1.6, 2.4, 3, GOLD(), [0, 18.7, 0], 8));
    g.add(ball(3.6, GOLD(), [0, 22.6, 0]));
    const star = new THREE.Group();
    star.position.set(0, 32, 0);
    const glow = mat('#fff27a', { emissive: '#ffd36b', intensity: 1.4 });
    star.add(box(5.5, 1.6, 1.6, glow, [0, 0, 0]), box(1.6, 5.5, 1.6, glow, [0, 0, 0]));
    star.add(box(4, 1.4, 1.4, glow, [0, 0, 0], [0, 0, Math.PI / 4]), box(1.4, 4, 1.4, glow, [0, 0, 0], [0, 0, Math.PI / 4]));
    g.add(star);
    g.userData.anim = (t) => {
      star.rotation.y = t * 1.6;
      star.position.y = 32 + Math.sin(t * 2) * 1.5;
    };
  },
  fireworks: (g) => {
    // A crate of rockets: one by one they whoosh up and burst into a ring of sparks.
    g.add(box(22, 10, 16, WOOD(), [0, 5, 0]));
    for (const z of [-8.2, 8.2]) g.add(box(22.4, 1.6, 0.6, mat('#5a3a1e', { rough: 0.8 }), [0, 7.5, z]));
    g.add(box(14, 4, 0.6, mat('#d9443a', { rough: 0.6 }), [0, 4.5, 8.3]));
    const colors = ['#ff5a7a', '#ffd23f', '#5fb8ff'];
    const rockets = colors.map((color, i) => {
      const x = (i - 1) * 6.5;
      g.add(cyl(1.6, 1.6, 9, mat(color, { rough: 0.5 }), [x, 14.5, 0], 8));
      g.add(cone(1.8, 3, mat('#f4efe4'), [x, 20.5, 0], 8));
      const spark = mat(color, { emissive: color, intensity: 1.6 });
      const rocket = ball(1.2, spark, [x, 22.5, 0], 0);
      rocket.visible = false;
      rocket.userData.unframed = true; // (the tray's picture frames the crate, see TrinketPortraits.js)
      const burst = new THREE.Group();
      burst.userData.unframed = true;
      const sparks = Array.from({ length: 10 }, (_, k) => {
        const piece = ball(1.1, spark, [0, 0, 0], 0);
        piece.userData.angle = (k / 10) * Math.PI * 2;
        burst.add(piece);
        return piece;
      });
      burst.visible = false;
      g.add(rocket, burst);
      return { x, rocket, burst, sparks, offset: i * 1.4 };
    });
    const CYCLE = 4.2;
    g.userData.anim = (t) => {
      for (const { x, rocket, burst, sparks, offset } of rockets) {
        const k = ((t + offset) % CYCLE) / CYCLE;
        rocket.visible = k < 0.25;
        rocket.position.set(x + Math.sin(k * 30) * 0.6, 22.5 + (k / 0.25) * 48, 0);
        const b = (k - 0.25) / 0.3;
        burst.visible = b >= 0 && b < 1;
        if (!burst.visible) continue;
        burst.position.set(x, 72 - b * 6, 0);
        for (const piece of sparks) {
          const r = 4 + b * 16;
          piece.position.set(Math.cos(piece.userData.angle) * r, Math.sin(piece.userData.angle) * r, 0);
          piece.scale.setScalar(1.3 * (1 - b) + 0.2);
        }
      }
    };
  },
  // More to collect (v0.32). Milestones first.
  windmill: (g) => {
    g.add(cyl(7, 10, 26, mat('#f4efe4', { rough: 0.8 }), [0, 13, 0], 8));
    g.add(cone(9.5, 10, mat('#b8322a', { rough: 0.6 }), [0, 31, 0], 8));
    g.add(box(4.5, 7, 1, WOOD(), [0, 3.5, 9.6]));
    g.add(box(3.4, 3.4, 0.6, mat('#5b8fd6'), [0, 16, 8.4]));
    // The sails turn on a hub on the front.
    const sails = new THREE.Group();
    sails.position.set(0, 25, 9.4);
    sails.add(cyl(1.6, 1.6, 3, WOOD(), [0, 0, 0], 8, [Math.PI / 2, 0, 0]));
    const cloth = mat('#fff8e8', { rough: 0.9 });
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      arm.add(box(1.1, 17, 0.8, WOOD(), [0, 9, 1]), box(5, 12, 0.4, cloth, [3.2, 11, 1.4]));
      sails.add(arm);
    }
    g.add(sails);
    g.userData.anim = (t) => (sails.rotation.z = -t * 1.1);
  },
  totem: (g) => {
    g.add(cyl(6.5, 7.5, 3, STONE(), [0, 1.5, 0], 8));
    // Three carved bee heads stacked up, wings on top: it keeps the swarm off the harvest.
    const faces = ['#8a5a32', '#ffd23f', '#6a4024'];
    const dark = mat('#1a1a1a');
    faces.forEach((color, i) => {
      const y = 7.5 + i * 9;
      g.add(box(10, 8.4, 10, mat(color, { rough: 0.8 }), [0, y, 0]));
      g.add(box(10.4, 1.4, 10.4, mat(i === 1 ? '#2b2b2b' : '#ffd23f', { rough: 0.8 }), [0, y - 3.4, 0]));
      for (const side of [-1, 1]) g.add(box(2.4, 2.4, 0.8, dark, [side * 2.4, y + 1.2, 5.1]));
      g.add(box(4.5, 1, 0.8, dark, [0, y - 1.4, 5.1]));
    });
    for (const side of [-1, 1]) {
      g.add(cyl(0.4, 0.4, 6, dark, [side * 2.5, 33, 0], 4, [0, 0, -side * 0.35]));
      g.add(ball(1.2, mat('#ffd23f', { emissive: '#8a5a00', intensity: 0.4 }), [side * 3.6, 36, 0], 0));
    }
    const wing = mat('#e8f8ff', { opacity: 0.6, rough: 0.1 });
    const wings = [-1, 1].map((side) => {
      const hinge = new THREE.Group();
      hinge.position.set(side * 5, 27, -2);
      const w = ball(5, wing, [side * 6, 2, 0]);
      w.scale.set(1.5, 0.8, 0.2);
      hinge.add(w);
      g.add(hinge);
      return { hinge, side };
    });
    g.userData.anim = (t) => wings.forEach(({ hinge, side }) => (hinge.rotation.z = side * (0.15 + Math.sin(t * 3) * 0.2)));
  },
  gong: (g) => {
    const lacquer = mat('#8a2a1e', { rough: 0.5 });
    for (const side of [-1, 1]) {
      g.add(box(6, 3, 8, WOOD(), [side * 14, 1.5, 0]));
      g.add(box(2.6, 38, 2.6, lacquer, [side * 14, 20, 0]));
    }
    g.add(box(36, 3, 3.4, lacquer, [0, 39, 0]));
    g.add(box(30, 1.6, 2.6, lacquer, [0, 34, 0]));
    for (const side of [-1, 1]) g.add(box(4, 2, 3.6, GOLD(), [side * 17, 40.5, 0], [0, 0, side * 0.3]));
    // The gong hangs on two cords and shimmers; it sways a little when the wind takes it.
    const disc = new THREE.Group();
    disc.position.set(0, 33, 0);
    for (const side of [-1, 1]) disc.add(cyl(0.3, 0.3, 6, mat('#3a2a1a'), [side * 4, -3, 0], 4));
    // (thinner than the rim, whose flat facets lay in the face's plane and flickered)
    const face = cyl(9.6, 9.6, 1, GOLD(), [0, -15, 0], 20, [Math.PI / 2, 0, 0]);
    disc.add(face, cyl(4, 4, 1.8, mat('#ffe680', { emissive: '#a06a00', intensity: 0.6, metal: 0.8, rough: 0.2 }), [0, -15, 0], 16, [Math.PI / 2, 0, 0]));
    disc.add(torus(10, 0.8, mat('#b07a10', { metal: 0.8, rough: 0.3 }), [0, -15, 0]));
    g.add(disc);
    g.add(cyl(0.6, 0.6, 14, WOOD(), [17, 6, 4], 5, [0, 0, 0.5]), ball(2.4, mat('#f4efe4', { rough: 0.9 }), [20.5, 12, 4], 1));
    g.userData.anim = (t) => (disc.rotation.x = Math.sin(t * 1.2) * 0.06);
  },
  orrery: (g) => {
    g.add(cyl(9, 10, 4, STONE(), [0, 2, 0], 10));
    const brass = mat('#d8a84a', { metal: 0.8, rough: 0.3 });
    g.add(cyl(1, 1.4, 22, brass, [0, 15, 0], 6));
    const sun = ball(4.5, new THREE.MeshStandardMaterial({ color: '#ffd36b', emissive: '#ff9a2a', emissiveIntensity: 1.2, flatShading: true }), [0, 28, 0], 1);
    g.add(sun);
    // Planets on brass arms, each at its own pace.
    const planets = [
      { r: 9, size: 1.6, color: '#7fd8ff', speed: 1.3, tilt: 0.1 },
      { r: 14, size: 2.4, color: '#ff8a6b', speed: 0.8, tilt: -0.15 },
      { r: 19, size: 2, color: '#c58aff', speed: 0.5, tilt: 0.2, ring: true },
    ].map((p, i) => {
      const arm = new THREE.Group();
      arm.position.y = 26 - i * 3;
      arm.add(cyl(0.35, 0.35, p.r, brass, [p.r / 2, 0, 0], 4, [0, 0, Math.PI / 2]));
      arm.add(ball(p.size, mat(p.color, { emissive: p.color, intensity: 0.4, rough: 0.4 }), [p.r, 1.6, 0], 1));
      if (p.ring) arm.add(torus(p.size * 1.8, 0.35, brass, [p.r, 1.6, 0], [Math.PI / 2 + 0.4, 0, 0]));
      g.add(arm);
      return { arm, ...p, at: i * 2 };
    });
    g.userData.anim = (t, night) => {
      for (const p of planets) p.arm.rotation.y = t * p.speed + p.at;
      sun.material.emissiveIntensity = (night ? 2.2 : 1.1) + Math.sin(t * 2) * 0.25;
    };
  },
  torii: (g) => {
    const red = mat('#d9443a', { rough: 0.5 });
    const black = mat('#2a1a1a', { rough: 0.6 });
    for (const side of [-1, 1]) {
      g.add(box(5, 3, 5, black, [side * 13, 1.5, 0]));
      g.add(cyl(1.8, 2.2, 36, red, [side * 13, 20, 0], 8));
    }
    g.add(box(40, 2.4, 4, black, [0, 39.5, 0]));
    for (const side of [-1, 1]) g.add(box(5, 2.4, 4, black, [side * 21.5, 40.4, 0], [0, 0, side * 0.2]));
    g.add(box(36, 3, 3, red, [0, 36.6, 0]));
    g.add(box(31, 2, 2.4, red, [0, 30, 0]));
    g.add(box(4, 5, 0.8, GOLD(), [0, 33.5, 1.6]));
    // Between the posts the way to the endless waves shimmers.
    const glow = new THREE.MeshStandardMaterial({ color: '#c8b0ff', emissive: '#8a6aff', emissiveIntensity: 0.6, transparent: true, opacity: 0.28, flatShading: true, side: THREE.DoubleSide, depthWrite: false });
    const veil = box(22, 26, 0.3, glow, [0, 15.5, 0]);
    veil.castShadow = false;
    g.add(veil);
    const motes = Array.from({ length: 8 }, () => ball(0.8, mat('#ffffff', { emissive: '#c8b0ff', intensity: 1.6 }), [0, 0, 0], 0));
    g.add(...motes);
    g.userData.anim = (t, night) => {
      glow.emissiveIntensity = (night ? 1.3 : 0.6) + Math.sin(t * 1.7) * 0.25;
      motes.forEach((mote, i) => {
        const a = t * 0.9 + (i / motes.length) * Math.PI * 2;
        mote.position.set(Math.cos(a) * 8, 15.5 + Math.sin(a) * 11, Math.sin(t * 2 + i) * 1.2);
      });
    };
  },
  bell: (g) => {
    g.add(box(24, 3, 24, STONE(), [0, 1.5, 0]));
    for (const x of [-9, 9]) for (const z of [-9, 9]) g.add(box(2.4, 28, 2.4, WOOD(), [x, 17, z]));
    g.add(box(24, 2, 24, WOOD(), [0, 32, 0]));
    g.add(cone(20, 9, mat('#3a4a5a', { rough: 0.5 }), [0, 37.5, 0], 4, [0, Math.PI / 4, 0]));
    g.add(ball(1.6, GOLD(), [0, 42.5, 0], 0));
    // The bronze bell swings gently on its beam.
    const bronze = mat('#b07a3a', { metal: 0.7, rough: 0.35 });
    const swing = new THREE.Group();
    swing.position.y = 31;
    swing.add(cyl(0.5, 0.5, 4, mat('#3a2a1a'), [0, -2, 0], 4));
    swing.add(mesh(new THREE.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), bronze, [0, -8, 0]));
    swing.add(cyl(5, 7, 11, bronze, [0, -13.5, 0], 12));
    swing.add(torus(7, 0.6, GOLD(), [0, -18.6, 0], [Math.PI / 2, 0, 0]));
    swing.add(cyl(1.2, 1.2, 2, GOLD(), [0, -20.5, 0], 6));
    g.add(swing);
    g.userData.anim = (t) => (swing.rotation.z = Math.sin(t * 1.5) * 0.06 * (0.6 + 0.4 * Math.sin(t * 0.4)));
  },
  pagoda: (g) => {
    const wall = mat('#f4efe4', { rough: 0.8 });
    const roof = mat('#3f7a5a', { rough: 0.5 });
    const lights = [];
    const glow = new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ff9a2a', emissiveIntensity: 1.2, flatShading: true });
    g.add(box(22, 3, 22, STONE(), [0, 1.5, 0]));
    // Three storeys, each smaller, each under a wide upturned roof, with a lit window on the front.
    let y = 3;
    for (let i = 0; i < 3; i++) {
      const w = 14 - i * 3;
      const h = 8 - i;
      g.add(box(w, h, w, wall, [0, y + h / 2, 0]));
      g.add(box(w * 0.4, h * 0.5, 0.6, glow, [0, y + h / 2, w / 2 + 0.1]));
      g.add(cone(w * 0.95 + 4, 4.5, roof, [0, y + h + 2.2, 0], 4, [0, Math.PI / 4, 0]));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(ball(0.9, GOLD(), [sx * (w / 2 + 2.6), y + h + 0.3, sz * (w / 2 + 2.6)], 0));
      lights.push(y + h / 2);
      y += h + 3.6;
    }
    g.add(cyl(0.6, 0.9, 9, GOLD(), [0, y + 3.5, 0], 6));
    for (let k = 0; k < 3; k++) g.add(cyl(1.6 - k * 0.4, 1.6 - k * 0.4, 0.6, GOLD(), [0, y + 1.5 + k * 2.2, 0], 8));
    g.userData.anim = (t, night) => (glow.emissiveIntensity = (night ? 2.2 : 1) + 0.25 * Math.sin(t * 2.6) * Math.sin(t * 1.1));
  },
  sundial: (g) => {
    g.add(cyl(7, 8, 3, STONE(), [0, 1.5, 0], 8));
    g.add(cyl(3.5, 4.5, 12, STONE(), [0, 9, 0], 8));
    g.add(cyl(11, 10, 2.4, mat('#d8d0c0', { rough: 0.85 }), [0, 16, 0], 16));
    const brass = mat('#d8a84a', { metal: 0.8, rough: 0.3 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(box(i % 3 ? 0.7 : 1.2, 0.4, i % 3 ? 2 : 3, brass, [Math.cos(a) * 8.6, 17.3, Math.sin(a) * 8.6], [0, -a + Math.PI / 2, 0]));
    }
    // The gnomon: a brass fin; its shadow creeps around the dial.
    const fin = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -7), new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 9, -7)]);
    fin.computeVertexNormals();
    const gnomon = new THREE.Mesh(fin, new THREE.MeshStandardMaterial({ color: '#d8a84a', metalness: 0.8, roughness: 0.3, flatShading: true, side: THREE.DoubleSide }));
    gnomon.position.y = 17.2;
    gnomon.castShadow = true;
    g.add(gnomon);
    const shadow = new THREE.Group();
    shadow.position.y = 17.3;
    shadow.add(box(0.9, 0.2, 8, mat('#4a4438', { rough: 1 }), [0, 0, 4]));
    g.add(shadow);
    g.userData.anim = (t) => (shadow.rotation.y = -0.9 + Math.sin(t * 0.15) * 1.3);
  },
  // Daily gifts.
  birdhouse: (g) => {
    g.add(cyl(1.2, 1.5, 24, WOOD(), [0, 12, 0], 6));
    g.add(box(12, 12, 10, mat('#5fb8ff', { rough: 0.7 }), [0, 30, 0]));
    for (const side of [-1, 1]) g.add(box(8.4, 1, 12, mat('#d9443a', { rough: 0.6 }), [side * 3.5, 38.5, 0], [0, 0, -side * 0.75]));
    g.add(cyl(2.4, 2.4, 1, mat('#1a1a1a'), [0, 31, 5.1], 10, [Math.PI / 2, 0, 0]));
    g.add(cyl(0.4, 0.4, 5, WOOD(), [0, 27, 6.5], 4, [Math.PI / 2, 0, 0]));
    g.add(ball(1.4, mat('#ffd23f'), [3.5, 34, 5.1], 0));
    // Now and then a little bird hops out onto the perch, looks around and goes back in.
    const bird = new THREE.Group();
    const feathers = mat('#ff8a6b', { rough: 0.5 });
    bird.add(ball(2.2, feathers, [0, 0, 0], 1), ball(1.6, feathers, [0, 2.2, 0.8], 1));
    bird.add(cone(0.6, 1.6, mat('#ffb000'), [0, 2.1, 2.6], 4, [Math.PI / 2, 0, 0]));
    bird.add(cone(1.2, 3, feathers, [0, 0.4, -2.6], 4, [-Math.PI / 2 - 0.4, 0, 0]));
    for (const side of [-1, 1]) bird.add(ball(0.4, mat('#1a1a1a'), [side * 1, 2.7, 1.8], 0));
    g.add(bird);
    g.userData.anim = (t) => {
      const k = (t % 7) / 7;
      const out = k < 0.15 ? k / 0.15 : k < 0.6 ? 1 : k < 0.75 ? 1 - (k - 0.6) / 0.15 : 0;
      bird.visible = out > 0.05;
      bird.position.set(0, 29.6 + Math.abs(Math.sin(k * 40)) * (out === 1 ? 0.8 : 0), 3 + out * 5);
      bird.rotation.y = out === 1 ? Math.sin(t * 3) * 0.8 : 0;
    };
  },
  birdbath: (g) => {
    g.add(cyl(7, 8, 3, STONE(), [0, 1.5, 0], 10));
    g.add(cyl(2.5, 3.5, 14, STONE(), [0, 10, 0], 8));
    g.add(cyl(13, 6, 5, STONE(), [0, 19, 0], 14));
    // The water sits a little above the basin's rim: flush with it, the two flickered through each other.
    g.add(cyl(11.5, 11.5, 0.6, mat('#7fd8ff', { emissive: '#2a7aaa', intensity: 0.5, rough: 0.1, opacity: 0.85 }), [0, 21.5, 0], 14));
    // A bird on the rim dips its head for a drink.
    const bird = new THREE.Group();
    bird.position.set(-10, 23, 3);
    bird.rotation.y = Math.PI / 2;
    const feathers = mat('#7fb8ff', { rough: 0.5 });
    bird.add(ball(2.4, feathers, [0, 1.6, 0], 1), cone(1.3, 3.2, feathers, [0, 2, -2.8], 4, [-Math.PI / 2 - 0.3, 0, 0]));
    const head = new THREE.Group();
    head.position.set(0, 3.2, 1.4);
    head.add(ball(1.7, feathers, [0, 0.8, 0.6], 1), cone(0.6, 1.8, mat('#ffb000'), [0, 0.7, 2.6], 4, [Math.PI / 2, 0, 0]));
    for (const side of [-1, 1]) head.add(ball(0.4, mat('#1a1a1a'), [side * 1.1, 1.3, 1.5], 0));
    bird.add(head);
    g.add(bird);
    const drop = ball(0.7, mat('#bfefff', { emissive: '#4ab8ff', intensity: 0.6, opacity: 0.8 }), [0, 0, 0], 0);
    g.add(drop);
    g.userData.anim = (t) => {
      const dip = Math.max(0, Math.sin(t * 1.4)) ** 6;
      head.rotation.x = dip * 1.1;
      const k = (t * 1.4) % (Math.PI * 2);
      drop.visible = k > 1.6 && k < 2.6;
      drop.position.set(-10 + (k - 1.6) * 3, 22 + Math.sin((k - 1.6) * Math.PI) * 3, 6);
    };
  },
  // Kettle brews.
  owl: (g) => {
    g.add(cyl(8, 9, 10, WOOD(), [0, 5, 0], 9));
    g.add(cyl(7, 7, 0.4, mat('#c9a06a', { rough: 0.9 }), [0, 10.2, 0], 9));
    const brown = mat('#8a6a4a', { rough: 0.7 });
    const body = ball(7, brown, [0, 17, 0], 1);
    body.scale.set(1, 1.15, 0.9);
    const belly = ball(4.6, mat('#e8d0a0', { rough: 0.8 }), [0, 16, 3.8], 1);
    belly.scale.set(1, 1.15, 0.6);
    g.add(body, belly);
    for (const side of [-1, 1]) {
      const wing = ball(4, mat('#6a4a2a', { rough: 0.7 }), [side * 6, 17, -0.5], 1);
      wing.scale.set(0.5, 1.2, 0.9);
      g.add(wing, cone(0.8, 2, mat('#ffb000'), [side * 2, 10.6, 3], 4));
    }
    // Its head turns to look around; the big eyes glow at night and blink.
    const head = new THREE.Group();
    head.position.y = 26;
    head.add(ball(6, brown, [0, 0, 0], 1));
    const eye = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.5, flatShading: true });
    const eyes = [-1, 1].map((side) => {
      head.add(cyl(2.8, 2.8, 0.6, mat('#e8d8b8', { rough: 0.8 }), [side * 2.6, 0.5, 4.8], 10, [Math.PI / 2, 0, 0]));
      const ring = cyl(1.8, 1.8, 0.6, eye, [side * 2.6, 0.5, 5.3], 10, [Math.PI / 2, 0, 0]);
      head.add(ring, ball(0.8, mat('#1a1a1a'), [side * 2.6, 0.5, 5.8], 0));
      head.add(cone(1.6, 4, brown, [side * 4, 5.6, 0], 4, [0, 0, -side * 0.35]));
      return ring;
    });
    head.add(cone(0.9, 2.4, mat('#ffb000'), [0, -1.6, 5.6], 4, [Math.PI, 0, 0]));
    g.add(head);
    g.userData.anim = (t, night) => {
      head.rotation.y = Math.sin(t * 0.5) ** 3 * 1.4;
      eye.emissiveIntensity = night ? 2.2 : 0.5;
      const blink = Math.sin(t * 0.8) > 0.985 ? 0.1 : 1;
      for (const ring of eyes) ring.scale.set(1, 1, blink);
    };
  },
  koi: (g) => {
    g.add(torus(8, 1.6, WOOD(), [0, 3, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(box(2, 6, 2, WOOD(), [Math.cos(a) * 8, 3, Math.sin(a) * 8]));
    }
    g.add(mesh(new THREE.SphereGeometry(10, 14, 10, 0, Math.PI * 2, 0.35, Math.PI - 0.35), mat('#d8f4ff', { rough: 0.05, opacity: 0.4 }), [0, 14, 0]));
    g.add(cyl(9.2, 7.8, 9, mat('#5fb8ff', { emissive: '#2a7aaa', intensity: 0.35, rough: 0.1, opacity: 0.55 }), [0, 9.5, 0], 14));
    g.add(cyl(3.2, 3.2, 0.4, mat('#4caf3a'), [3, 14.2, -2], 10));
    // Two koi circle each other.
    const fish = ['#ff7a2a', '#ffffff'].map((color, i) => {
      const swim = new THREE.Group();
      const koi = new THREE.Group();
      koi.position.x = 4.5;
      const body = ball(1.8, mat(color, { rough: 0.4 }), [0, 0, 0], 1);
      body.scale.set(0.8, 0.7, 1.8);
      koi.add(body, ball(0.9, mat(i ? '#ff7a2a' : '#ffffff'), [0, 0.8, 0.4], 0));
      const tail = cone(1.4, 2.4, mat(color, { rough: 0.4 }), [0, 0, -3.8], 4, [-Math.PI / 2, 0, 0]);
      koi.add(tail);
      swim.add(koi);
      swim.position.y = 8 + i * 2.5;
      g.add(swim);
      return { swim, tail, i };
    });
    g.userData.anim = (t) => fish.forEach(({ swim, tail, i }) => {
      swim.rotation.y = -t * (0.7 + i * 0.15) + i * Math.PI;
      tail.rotation.y = Math.sin(t * 8 + i) * 0.4;
    });
  },
  sprout: (g) => {
    g.add(cyl(8, 6, 9, mat('#c8693a', { rough: 0.7 }), [0, 4.5, 0], 10));
    g.add(cyl(8.6, 8.6, 1.6, mat('#a8552e', { rough: 0.7 }), [0, 9, 0], 10));
    g.add(cyl(7.4, 7.4, 0.4, mat('#4a3020', { rough: 1 }), [0, 9.9, 0], 10)); // above the rim's top (9.8), not flush
    g.add(cyl(0.9, 1.3, 8, WOOD(), [0, 13, 0], 5));
    // A little tea bush: glossy leaf clumps and white tea flowers, swaying.
    const bush = new THREE.Group();
    bush.position.y = 16;
    const leaf = mat('#3f9d3a', { rough: 0.35 });
    const light = mat('#6cc04a', { rough: 0.35 });
    for (const [x, y, z, r, m] of [[0, 4, 0, 6, leaf], [-5, 1, 2, 4.4, light], [5, 2, -1, 4.8, leaf], [1, 7.5, -2, 4, light], [-2, 3, -4, 4, leaf], [3, 2, 4, 3.6, light]]) {
      bush.add(ball(r, m, [x, y, z], 0));
    }
    const petal = mat('#ffffff', { rough: 0.5 });
    for (const [x, y, z] of [[4, 6, 3], [-5, 4, 4], [2, 10, -1], [-3, 7, -4]]) {
      bush.add(ball(1.2, petal, [x, y, z], 0), ball(0.5, mat('#ffd23f'), [x, y + 0.2, z + 1], 0));
    }
    g.add(bush);
    g.userData.anim = (t) => {
      bush.rotation.z = Math.sin(t * 1.2) * 0.05;
      bush.rotation.x = Math.sin(t * 0.9 + 1) * 0.04;
    };
  },
  barrow: (g) => {
    const red = mat('#d9443a', { rough: 0.6 });
    // Tray, legs and handles pointing back (−X), the wheel in front (+X).
    g.add(box(18, 2, 14, red, [0, 9, 0]));
    for (const side of [-1, 1]) g.add(box(18, 6, 1.2, red, [0, 12, side * 6.6], [side * 0.15, 0, 0]));
    g.add(box(1.2, 6, 14, red, [-8.6, 12, 0], [0, 0, -0.2]));
    g.add(box(1.2, 6, 14, red, [8.6, 12, 0], [0, 0, 0.3]));
    for (const side of [-1, 1]) {
      g.add(box(26, 1.4, 1.4, WOOD(), [-2, 8, side * 5], [0, 0, 0.1]));
      g.add(box(1.4, 7, 1.4, WOOD(), [-6, 4, side * 5]));
    }
    g.add(cyl(6, 6, 2.6, mat('#3a3a3a', { rough: 0.8 }), [12, 6, 0], 14, [Math.PI / 2, 0, 0]));
    g.add(cyl(2, 2, 3, mat('#d8dde6', { metal: 0.8, rough: 0.3 }), [12, 6, 0], 8, [Math.PI / 2, 0, 0]));
    // Heaped with golden tea leaves; one keeps blowing off and floating back.
    const colors = ['#ffd36b', '#c98a2b', '#7ed957', '#ffb000'];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const r = 2 + (i % 4) * 1.6;
      g.add(box(3.4, 0.5, 2, mat(colors[i % 4], { rough: 0.6 }), [Math.cos(a) * r * 1.3, 12.5 + (4 - (i % 4)) * 0.9, Math.sin(a) * r], [0.3 * (i % 3), a, 0.2]));
    }
    const flyer = box(3, 0.4, 1.8, GOLD(), [0, 0, 0]);
    g.add(flyer);
    g.userData.anim = (t) => {
      const k = (t * 0.25) % 1;
      const up = Math.sin(k * Math.PI);
      flyer.position.set(Math.sin(t * 1.3) * 6, 16 + up * 14, Math.cos(t * 0.9) * 4);
      flyer.rotation.set(t * 2, t * 1.4, Math.sin(t * 3) * 0.6);
    };
  },
};

/** The model for a trinket, Z-up, standing on the ground. */
export function buildTrinket(id) {
  const inner = new THREE.Group();
  (BUILDERS[id] ?? BUILDERS.lantern)(inner);
  mergeStill(inner);
  const body = new THREE.Group(); // turned Z-up; its own animations move the inner model
  body.add(inner);
  body.rotation.x = Math.PI / 2; // Y-up model, Z-up world
  const group = new THREE.Group();
  group.add(body);
  group.userData.trinket = id;
  group.userData.animate = inner.userData.anim ?? null;
  group.userData.inner = inner;
  // Trinkets that shine light a pool of the lawn around them at night.
  if (GLOWS[id]) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(GLOWS[id].radius * 2, GLOWS[id].radius * 2),
      new THREE.MeshBasicMaterial({ color: GLOWS[id].color, map: glowTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.z = 0.7;
    glow.visible = false;
    group.add(glow);
    group.userData.glow = glow;
  }
  return group;
}

/**
 * Fewer draw calls (v0.28.1): a trinket is built from up to 20 little parts, and a full garden drew 400+ meshes,
 * twice with the shadow pass. The parts its animation never touches are merged: one mesh per kind of surface (the
 * same material but for its colour), the colours baked into the vertices. What the animation moves is found by
 * running it at a few moments (day and night) and seeing which parts changed.
 */
const twins = new Map(); // a material's family (all but the colour) → its vertex-coloured twin
function family(material) {
  if (!material.isMeshStandardMaterial || material.map || material.vertexColors) return null;
  const m = material;
  return [m.emissive.getHex(), m.emissiveIntensity, m.metalness, m.roughness, m.opacity, m.transparent, m.flatShading, m.side].join('|');
}
function twinOf(material, key) {
  if (!twins.has(key)) {
    const twin = material.clone();
    twin.color.set('#ffffff');
    twin.vertexColors = true;
    twins.set(key, twin);
  }
  return twins.get(key);
}

function mergeStill(inner) {
  const anim = inner.userData.anim;
  const state = (o) => {
    const m = o.material;
    return [o.position.toArray(), o.rotation.toArray().slice(0, 3), o.scale.toArray(), o.visible, m?.emissiveIntensity, m?.opacity, m?.color?.getHex()].join();
  };
  const moving = new Set(inner.userData.moving ?? []); // parts that only move on an event (a bounce)
  if (anim) {
    const before = new Map();
    inner.traverse((o) => before.set(o, state(o)));
    // What the probing changes, to put back afterwards: left at the last probe, the cannon's steam puff hung high
    // over the spout and its height field (GardenPhysics.js, sampled from a fresh model) bounced every shot back.
    const rest = [];
    inner.traverse((o) => {
      const m = o.material;
      rest.push([o, o.position.clone(), o.rotation.clone(), o.scale.clone(), o.visible, m?.emissiveIntensity, m?.opacity, m?.color?.clone()]);
    });
    for (const [t, night] of [[0.37, false], [1.91, true], [4.3, false], [7.7, true], [13.1, false]]) {
      anim(t, night);
      inner.traverse((o) => before.get(o) !== state(o) && moving.add(o));
    }
    for (const [o, position, rotation, scale, visible, emissiveIntensity, opacity, color] of rest) {
      o.position.copy(position);
      o.rotation.copy(rotation);
      o.scale.copy(scale);
      o.visible = visible;
      const m = o.material;
      if (m && emissiveIntensity !== undefined) m.emissiveIntensity = emissiveIntensity;
      if (m && opacity !== undefined) m.opacity = opacity;
      if (m && color) m.color.copy(color);
    }
  }
  // Parts are merged within the closest thing that moves them (a swaying crown, a bending stem), or the trinket.
  const rootOf = (o) => {
    for (let p = o.parent; p && p !== inner; p = p.parent) if (moving.has(p)) return p;
    return inner;
  };
  inner.updateMatrixWorld(true);
  const groups = new Map(); // root → family (or the material itself) → its still meshes
  inner.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.children.length || !o.visible || moving.has(o)) return;
    const root = rootOf(o);
    const key = family(o.material) ?? o.material;
    if (!groups.has(root)) groups.set(root, new Map());
    const byKey = groups.get(root);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(o);
  });
  for (const [root, byKey] of groups) for (const [key, meshes] of byKey) {
    if (meshes.length < 2) continue;
    const toRoot = root.matrixWorld.clone().invert();
    const coloured = typeof key === 'string';
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      if (coloured) {
        const { r, g, b } = mesh.material.color;
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      return geometry;
    });
    if (!geometries.every((g) => g.attributes.uv)) geometries.forEach((g) => g.deleteAttribute('uv'));
    geometries.forEach((g) => (g.morphAttributes = {}, g.clearGroups()));
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, coloured ? twinOf(meshes[0].material, key) : key);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    root.add(mesh);
    for (const old of meshes) {
      old.removeFromParent();
      old.geometry.dispose();
    }
  }
}

let softGlow = null;
/** A soft round falloff, so a glow fades into the lawn instead of ending in a hard edge. */
function glowTexture() {
  if (softGlow) return softGlow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  softGlow = new THREE.CanvasTexture(canvas);
  return softGlow;
}

const GLOWS = {
  lantern: { color: '#ffb040', radius: 46 },
  jar: { color: '#fff27a', radius: 30 },
  crystal: { color: '#7ff0d0', radius: 36 },
  horns: { color: '#ff5010', radius: 32 },
  idol: { color: '#ffe680', radius: 40 },
  mushrooms: { color: '#c58aff', radius: 34 },
  fountain: { color: '#7fd8ff', radius: 36 },
  podium: { color: '#ffe680', radius: 36 },
  orrery: { color: '#ffd36b', radius: 36 },
  torii: { color: '#c8b0ff', radius: 40 },
  pagoda: { color: '#ffb040', radius: 40 },
  owl: { color: '#ffd23f', radius: 26 },
};

/** Frees a trinket's geometries (the materials are shared and kept). */
export function disposeTrinket(group) {
  group.removeFromParent();
  group.traverse((child) => child.geometry?.dispose());
  group.userData.glow?.material.dispose();
}
