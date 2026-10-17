import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from './FrogModels.js';
import { SLOTS } from './Wearables.js';

/**
 * The wardrobe's models (the items are in Wearables.js): voxel boxes in the frogs' own style, hung on the rig's
 * joints (FrogModels.js), so they hop, turn and emote with the frog. Built Y-up facing +Z like the frogs; every size
 * comes from `rig.fit`, so one model fits all seven classes. `dressFrog` also hides the class's own gear in a filled
 * slot (`rig.cover`).
 */

const WEAR = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 });
// (Only a little metal: without a reflection map, metal turns dark brown in the garden.)
const SHINY = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.25 });
const CLOTH = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
const MATERIALS = { wear: WEAR, shiny: SHINY, cloth: CLOTH, glow: GLOW };

/**
 * A worn piece: a pivot group on `parent` with one merged mesh per material. `draw(add)` calls
 * add(size, position, color, { rotation, material }) for each box.
 */
function piece(parent, pivot, draw, rotation = null) {
  const group = new THREE.Group();
  group.position.set(...pivot);
  if (rotation) group.rotation.set(...rotation);
  const boxes = { wear: [], shiny: [], cloth: [], glow: [] };
  draw((size, position, color, { rotation: turn = null, material = 'wear' } = {}) => box(boxes[material], size, position, color, turn));
  for (const [name, list] of Object.entries(boxes)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), MATERIALS[name]);
    mesh.castShadow = name !== 'glow';
    group.add(mesh);
  }
  parent.add(group);
  return group;
}

// Where things go, in the head's and the body's own space (see buildFrog).
const HAT_Y = 10.4; // on top of the eyes
const eyeX = (f) => f.headW / 2 - 2.4;
const EYE_Y = 7.4;
const EYE_Z = 8.1;
const backTop = (f) => 1.5 + f.H / 2 + 1;

/**
 * Each item: (rig, fit) → { update?(time) } after adding its pieces. Time in seconds, for things that move.
 */
const MODELS = {
  // --- Hats ---------------------------------------------------------------------------------------
  leafcap(rig, f) {
    // A big autumn leaf worn like a cap, its tip over the brow and its stem sticking up at the back.
    piece(rig.parts.head, [0, HAT_Y, 2], (add) => {
      add([f.headW + 1, 1, 9], [0, 0.5, 0], '#f0a020');
      add([f.headW - 3, 1.1, 3], [0, 0.55, 5.4], '#e8801a');
      add([f.headW - 7, 1.2, 2], [0, 0.6, 7.6], '#d9601a');
      for (const s of [-1, 1]) add([2.4, 1.05, 4], [s * (f.headW / 2 + 1.2), 0.5, -1], '#f0a020');
      add([0.8, 1.3, 11], [0, 0.7, 1.4], '#a8501a');
      add([1, 4, 1], [0, 2.4, -4.4], '#7a4a22', { rotation: [-0.5, 0, 0] });
    });
  },
  cosy(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 0.6, 2.5], (add) => {
      add([f.headW + 1, 2.6, 10.4], [0, 1.3, 0], '#e85a7a', { material: 'cloth' });
      add([f.headW + 1.2, 0.7, 10.6], [0, 2.3, 0], '#fff2f6', { material: 'cloth' });
      add([f.headW - 1.2, 2.4, 8.6], [0, 3.6, 0], '#f07a92', { material: 'cloth' });
      add([f.headW - 4, 2, 6.6], [0, 5.6, 0], '#e85a7a', { material: 'cloth' });
      add([2.8, 2.8, 2.8], [0, 7.6, 0], '#fff2f6', { material: 'cloth' });
    });
  },
  sunhat(rig, f) {
    piece(rig.parts.head, [0, HAT_Y, 2.5], (add) => {
      add([f.headW + 10, 0.7, 18], [0, 0.35, 0], '#e8cf8a');
      add([f.headW - 1, 4, 9], [0, 2.6, -0.5], '#d9b86a');
      add([f.headW - 0.6, 1.2, 9.4], [0, 1.4, -0.5], '#4a9a5a');
      add([2.2, 2.2, 1], [f.headW / 2 - 0.4, 1.8, 3.6], '#ff7aa8');
      add([1, 1, 1.2], [f.headW / 2 - 0.4, 1.8, 3.8], '#ffe680');
    });
  },
  tophat(rig, f) {
    piece(rig.parts.head, [0, HAT_Y, 2.5], (add) => {
      add([f.headW + 4, 0.8, 13], [0, 0.4, 0], '#1e1e26');
      add([f.headW - 2.5, 8.5, 8], [0, 5, -0.5], '#24242e');
      add([f.headW - 2, 1.5, 8.4], [0, 1.6, -0.5], '#a8323a');
    });
  },
  partyhat(rig) {
    piece(rig.parts.head, [1.5, HAT_Y, 2.5], (add) => {
      [['#5fb8ff', 6.2], ['#ffd23f', 4.8], ['#ff7aa8', 3.4], ['#7ed957', 2]].forEach(([color, size], i) => add([size, 2.2, size], [0, 1.1 + i * 2.2, 0], color));
      add([2, 2, 2], [0, 9.6, 0], '#ffffff', { material: 'glow' });
    }, [0, 0, -0.2]);
  },
  kabuto(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 1, 2], (add) => {
      add([f.headW + 1.4, 3.8, 10.4], [0, 1.9, 0], '#2a2a34', { material: 'shiny' });
      add([f.headW - 1.5, 1.6, 8], [0, 4.4, -0.5], '#2a2a34', { material: 'shiny' });
      add([f.headW + 4, 1.2, 4], [0, 0.2, -4.2], '#3a3a46');
      add([f.headW + 4.6, 1.2, 4], [0, -1, -4.8], '#3a3a46');
      add([f.headW + 4.8, 0.4, 4.2], [0, -0.3, -4.5], '#a83a2a');
      for (const s of [-1, 1]) {
        add([1.2, 3, 6], [s * (f.headW / 2 + 1.4), 0.4, 0], '#3a3a46');
        // The crescent crest: two golden blades rising in a V.
        add([1.2, 6.5, 0.8], [s * 2.4, 6.4, 5.4], '#e8c050', { rotation: [0, 0, s * -0.55], material: 'shiny' });
      }
      add([2, 2, 1.2], [0, 3.6, 5.4], '#e8c050', { material: 'shiny' });
    });
  },
  halo(rig) {
    const halo = piece(rig.parts.head, [0, HAT_Y + 5, 2.5], (add) => {
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2;
        add([2.2, 0.8, 1.2], [Math.cos(angle) * 5.6, 0, Math.sin(angle) * 5.6], '#fff2b0', { rotation: [0, -angle + Math.PI / 2, 0], material: 'glow' });
      }
    });
    return {
      update(time) {
        halo.position.y = HAT_Y + 5 + Math.sin(time * 2) * 0.8;
        halo.rotation.y = time * 0.8;
      },
    };
  },
  crown(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 0.4, 2.5], (add) => {
      add([f.headW - 2, 2.2, 8], [0, 1.1, 0], '#ffcf3a', { material: 'shiny' });
      const w = f.headW / 2 - 1.5;
      for (const [x, z, h] of [[0, 4, 3.6], [-w, 2.5, 2.6], [w, 2.5, 2.6], [-w, -2.5, 2.6], [w, -2.5, 2.6], [0, -4, 3]]) {
        add([1.6, h, 1.6], [x, 2.2 + h / 2, z], '#ffcf3a', { material: 'shiny' });
      }
      add([1.6, 1.6, 0.6], [0, 1.2, 4.2], '#ff3a6a', { material: 'glow' });
      for (const s of [-1, 1]) add([1.2, 1.2, 0.6], [s * 2.6, 1.2, 4.1], '#5ac8ff', { material: 'glow' });
    });
  },
  horns(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 2.6, 1], (add) => {
      for (const s of [-1, 1]) {
        const x = s * (f.headW / 2 - 0.6);
        add([2.2, 3.4, 2.2], [x, 1.4, 0], '#c2262a', { rotation: [0, 0, -s * 0.5], material: 'shiny' });
        add([1.7, 3.4, 1.7], [x + s * 2, 4, 0.2], '#c2262a', { rotation: [0, 0, -s * 0.2], material: 'shiny' });
        add([1.2, 2.6, 1.2], [x + s * 2.4, 6.8, 0.6], '#2a0a0a', { rotation: [0.3, 0, s * 0.25], material: 'shiny' });
      }
    });
  },

  flowercrown(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 0.2, 2.5], (add) => {
      const colors = ['#ff7aa8', '#ffd23f', '#ffffff', '#c58aff', '#ff9a3a'];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const x = Math.cos(angle) * (f.headW / 2 - 0.5);
        const z = Math.sin(angle) * 4.6;
        add([2.2, 1.2, 2.2], [x, 0.8, z], colors[i % colors.length]);
        add([0.9, 1.3, 0.9], [x, 1.3, z], '#ffe680');
        add([1.6, 0.6, 1.6], [x * 0.92, 0.2, z * 0.92], '#4f9a2e');
      }
    });
  },
  lilypad(rig, f) {
    piece(rig.parts.head, [0, HAT_Y, 2.5], (add) => {
      add([f.headW + 3, 0.7, 13], [0, 0.35, 0], '#3f9d3a');
      add([4, 0.75, 4], [f.headW / 2 - 1, 0.4, 4.5], '#5fbf6a'); // the notch, a lighter wedge
      add([1, 2.4, 1], [-1.5, 1.6, -1], '#ff9ec7');
      add([2.6, 1.2, 2.6], [-1.5, 3, -1], '#ffd1e3');
      add([1, 1, 1], [-1.5, 3.8, -1], '#ffe680');
    });
  },
  beehat(rig, f) {
    piece(rig.parts.head, [0, HAT_Y, 2.5], (add) => {
      add([f.headW + 7, 0.6, 16], [0, 0.3, 0], '#efe6c8');
      add([f.headW - 1, 4.4, 9], [0, 2.6, -0.5], '#efe6c8');
      add([f.headW - 0.6, 1, 9.4], [0, 1.2, -0.5], '#3a2a1a');
      // The veil hanging round the brim.
      for (const s of [-1, 1]) add([0.3, 5, 14], [s * (f.headW / 2 + 3.3), -2.3, 0], '#5a5a50', { material: 'cloth' });
      add([f.headW + 6.6, 5, 0.3], [0, -2.3, -7.8], '#5a5a50', { material: 'cloth' });
      add([1.6, 1.2, 1], [f.headW / 2 - 1, 3, 4.3], '#ffcf3a'); // a little bee on the hat
      add([1.8, 0.4, 1.1], [f.headW / 2 - 1, 3, 4.3], '#2a1a0a');
    });
  },
  toque(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 0.6, 2], (add) => {
      add([f.headW - 1, 2.6, 8.6], [0, 1.3, 0], '#ffffff');
      add([f.headW + 1.2, 3.6, 10.4], [0, 4.4, 0], '#f8f8f4');
      add([f.headW + 2, 2.6, 11.2], [0, 7.2, 0], '#ffffff');
      for (const x of [-3.4, 0, 3.4]) add([2.6, 2, 2.6], [x, 8.8, 0.5], '#f4f4ee');
    });
  },
  antlers(rig, f) {
    piece(rig.parts.head, [0, HAT_Y - 1.4, 0.8], (add) => {
      for (const s of [-1, 1]) {
        const x = s * (f.headW / 2 - 1);
        add([1.4, 6, 1.4], [x + s * 1, 2.6, 0], '#a8784a', { rotation: [0, 0, -s * 0.35] });
        add([1.2, 3.4, 1.2], [x + s * 3.4, 5.6, 0], '#a8784a', { rotation: [0, 0, -s * 0.9] });
        add([1.1, 3.4, 1.1], [x + s * 2, 7, 0.4], '#a8784a', { rotation: [0.2, 0, -s * 0.15] });
        add([1, 2.6, 1], [x + s * 0.4, 5.2, 0.6], '#a8784a', { rotation: [0.3, 0, s * 0.4] });
      }
    });
  },

  // --- Face ---------------------------------------------------------------------------------------
  specs(rig, f) {
    piece(rig.parts.head, [0, EYE_Y, EYE_Z], (add) => {
      const ex = eyeX(f);
      for (const s of [-1, 1]) {
        const x = s * ex;
        add([5.4, 0.6, 0.6], [x, 2.6, 0], '#3a2a1a');
        add([5.4, 0.6, 0.6], [x, -2.6, 0], '#3a2a1a');
        add([0.6, 5.8, 0.6], [x - 2.7, 0, 0], '#3a2a1a');
        add([0.6, 5.8, 0.6], [x + 2.7, 0, 0], '#3a2a1a');
        add([0.6, 0.6, 6], [s * (ex + 2.7), 1.6, -3], '#3a2a1a');
      }
      add([Math.max(0.6, 2 * ex - 5.4), 0.6, 0.6], [0, 0.6, 0], '#3a2a1a');
    });
  },
  shades(rig, f) {
    piece(rig.parts.head, [0, EYE_Y, EYE_Z + 0.2], (add) => {
      const ex = eyeX(f);
      for (const s of [-1, 1]) {
        add([5, 3.4, 0.6], [s * ex, 0, 0], '#121218', { material: 'shiny' });
        add([1.2, 0.8, 0.3], [s * ex - 1.2, 0.8, 0.4], '#ffffff', { material: 'glow' });
        add([0.6, 0.6, 6], [s * (ex + 2.5), 1.2, -3], '#121218');
      }
      add([2 * ex, 0.7, 0.6], [0, 1.3, 0], '#121218');
    });
  },
  stache(rig) {
    piece(rig.parts.head, [0, 2.3, 9.6], (add) => {
      add([3.2, 1.3, 1], [0, 0, 0], '#3a2414');
      for (const s of [-1, 1]) {
        add([3.6, 1.2, 1], [s * 2.8, -0.4, 0], '#3a2414', { rotation: [0, 0, s * 0.3] });
        add([1.2, 1.8, 1], [s * 4.8, 0.4, 0], '#3a2414', { rotation: [0, 0, s * -0.4] });
      }
    });
  },
  monocle(rig, f) {
    piece(rig.parts.head, [eyeX(f), EYE_Y, EYE_Z + 0.1], (add) => {
      add([5.2, 0.6, 0.6], [0, 2.5, 0], '#e8c050', { material: 'shiny' });
      add([5.2, 0.6, 0.6], [0, -2.5, 0], '#e8c050', { material: 'shiny' });
      add([0.6, 5.6, 0.6], [-2.6, 0, 0], '#e8c050', { material: 'shiny' });
      add([0.6, 5.6, 0.6], [2.6, 0, 0], '#e8c050', { material: 'shiny' });
      add([0.4, 6, 0.4], [2.6, -5.2, -0.4], '#e8c050', { material: 'shiny' });
    });
  },
  visor(rig, f) {
    const visor = piece(rig.parts.head, [0, EYE_Y, EYE_Z + 0.3], (add) => {
      const ex = eyeX(f);
      add([2 * ex + 6.4, 2.6, 0.7], [0, 0, 0], '#5a2a8a', { material: 'shiny' });
      add([2 * ex + 5, 1.2, 0.4], [0, 0, 0.45], '#ff7ae0', { material: 'glow' });
      for (const s of [-1, 1]) add([1.2, 1.2, 0.4], [s * ex, 1.6, 0.5], '#ffe680', { material: 'glow' });
    });
    return { update: (time) => (visor.children.at(-1).visible = Math.sin(time * 6) > -0.6) };
  },

  blush(rig, f) {
    // (On the Ninja's face mask, which covers the cheeks.)
    piece(rig.parts.head, [0, 2.6, rig.id === 'ninja' ? 9.7 : 8.4], (add) => {
      for (const s of [-1, 1]) add([2.6, 1.4, 1.2], [s * (f.headW / 2 - 1.6), 0, 0.6], '#ff8aa8');
    });
  },
  heartshades(rig, f) {
    piece(rig.parts.head, [0, EYE_Y, EYE_Z + 0.2], (add) => {
      const ex = eyeX(f);
      for (const s of [-1, 1]) {
        // A voxel heart over each eye: two bumps on top, a point below.
        for (const b of [-1, 1]) add([2.4, 2.2, 0.6], [s * ex + b * 1.2, 0.9, 0], '#ff3a6a', { material: 'shiny' });
        add([4.2, 1.8, 0.6], [s * ex, -0.6, 0], '#ff3a6a', { material: 'shiny' });
        add([1.8, 1.4, 0.6], [s * ex, -1.9, 0], '#ff3a6a', { material: 'shiny' });
        add([0.6, 0.6, 6], [s * (ex + 2.5), 1, -3], '#ff3a6a');
      }
      add([2 * ex - 4, 0.6, 0.6], [0, 1, 0], '#ff3a6a');
    });
  },
  eyepatch(rig, f) {
    piece(rig.parts.head, [-eyeX(f), EYE_Y, EYE_Z + 0.2], (add) => {
      add([4.6, 4.2, 0.7], [0, 0, 0], '#1a1a1a');
      add([f.headW + 1.4, 0.7, 0.7], [eyeX(f), 2.4, -1.2], '#1a1a1a', { rotation: [0, 0, -0.18] });
      add([0.7, 0.7, 9], [eyeX(f) * 2 + 2.6, 1.6, -5], '#1a1a1a');
      add([0.7, 0.7, 9], [-2.6, 1.6, -5], '#1a1a1a');
    });
  },
  goggles(rig, f) {
    piece(rig.parts.head, [0, EYE_Y + 0.2, EYE_Z], (add) => {
      const ex = eyeX(f);
      for (const s of [-1, 1]) {
        add([5, 4.6, 1.4], [s * ex, 0, 0], '#8a5a2a');
        add([3.8, 3.4, 0.5], [s * ex, 0, 0.8], '#7fd8f0', { material: 'shiny' });
        add([1, 0.8, 0.3], [s * ex - 0.9, 0.8, 1.1], '#ffffff', { material: 'glow' });
      }
      add([f.headW + 1.6, 1.2, 1], [0, 0.2, -4], '#5a3a1a');
      for (const s of [-1, 1]) add([0.8, 1.2, 4.4], [s * (f.headW / 2 + 0.6), 0.2, -2], '#5a3a1a');
    });
  },

  // --- Body ---------------------------------------------------------------------------------------
  scarf(rig, f) {
    // A collar wrapped round the top of the body behind the head: over the back, down both sides, across the chest.
    const top = backTop(f);
    const z = f.L / 2 - 3.4;
    piece(rig.parts.body, [0, 0, z], (add) => {
      add([f.W + 1.6, 1.6, 5], [0, top - 0.2, 0], '#d9443a', { material: 'cloth' });
      add([f.W + 1.8, 0.6, 5.2], [0, top + 0.1, 0], '#f4f1ea', { material: 'cloth' });
      for (const s of [-1, 1]) {
        add([1.4, 4.4, 5], [s * (f.W / 2 + 0.6), top - 2.6, 0], '#d9443a', { material: 'cloth' });
        add([1.5, 0.6, 5.2], [s * (f.W / 2 + 0.6), top - 2.2, 0], '#f4f1ea', { material: 'cloth' });
      }
      add([f.W + 1.6, 2.6, 1.4], [0, top - 4.2, 3.2], '#d9443a', { material: 'cloth' });
    });
    const y = top - 4;
    const tail = piece(rig.parts.body, [-f.W / 2 + 2, y - 0.6, f.L / 2 - 1.2], (add) => {
      add([2.6, 6, 0.8], [0, -3, 0], '#d9443a', { material: 'cloth' });
      add([2.8, 0.7, 1], [0, -2, 0], '#f4f1ea', { material: 'cloth' });
      for (const x of [-0.9, 0, 0.9]) add([0.5, 1.2, 0.6], [x, -6.4, 0], '#f4f1ea', { material: 'cloth' });
    }, [0.35, 0, 0.15]);
    return { update: (time) => (tail.rotation.z = 0.15 + Math.sin(time * 2.6) * 0.12) };
  },
  bowtie(rig, f) {
    piece(rig.parts.body, [0, 1.5 - f.H / 2 + 2.2, f.L / 2 + 0.3], (add) => {
      for (const s of [-1, 1]) {
        add([2.6, 2.6, 1], [s * 1.8, 0, 0], '#d9443a', { rotation: [0, 0, s * 0.35] });
        add([1, 1, 1.1], [s * 2.6, 0.9, 0.05], '#ff7a6a');
      }
      add([1.4, 1.6, 1.3], [0, 0, 0.1], '#a8262a');
    }, [-0.2, 0, 0]);
  },
  leafmail(rig, f) {
    const top = backTop(f);
    piece(rig.parts.body, [0, 0, 0], (add) => {
      const rows = Math.round((f.L - 2) / 3.2);
      for (let i = 0; i < rows; i++) {
        const z = -f.L / 2 + 2 + i * 3.2;
        add([f.W + 0.8, 1.2, 3.6], [0, top + 0.2 + (i % 2) * 0.2, z], i % 2 ? '#4f9a2e' : '#6fbf3a');
        for (const s of [-1, 1]) add([0.8, f.H - 3, 3.4], [s * (f.W / 2 + 0.5), 1, z], i % 2 ? '#6fbf3a' : '#4f9a2e');
      }
      add([f.W - 3, f.H - 3.5, 0.8], [0, 0.8, f.L / 2 + 0.4], '#5fae34');
      add([0.6, f.H - 4, 0.9], [0, 0.8, f.L / 2 + 0.8], '#3f7a22');
    });
  },
  hunter(rig, f) {
    const top = backTop(f);
    piece(rig.parts.body, [0, 0, 0], (add) => {
      for (const s of [-1, 1]) {
        add([4.6, 2.6, 5], [s * (f.W / 2 + 0.2), top - 1.6, f.L / 2 - 3.6], '#5a5a66', { material: 'shiny' });
        add([4.8, 0.8, 5.2], [s * (f.W / 2 + 0.2), top - 2.8, f.L / 2 - 3.6], '#e8c050', { material: 'shiny' });
      }
      add([f.W - 2, f.H - 3, 1], [0, 0.8, f.L / 2 + 0.5], '#6a6a76', { material: 'shiny' });
      // A little hexagon of honeycomb on the chest.
      add([2.4, 2.4, 0.6], [0, 1.4, f.L / 2 + 1.1], '#e8c050', { rotation: [0, 0, Math.PI / 4], material: 'shiny' });
      add([f.W + 0.8, 1.4, f.L + 0.8], [0, -1.6, 0], '#3a2a1a');
    });
  },
  goldplate(rig, f) {
    const top = backTop(f);
    piece(rig.parts.body, [0, 0, 0], (add) => {
      add([f.W - 1, f.H - 2, 1.2], [0, 1, f.L / 2 + 0.5], '#ffcf3a', { material: 'shiny' });
      add([f.W - 3, 1, 1.4], [0, 1 + (f.H - 2) / 2 - 0.4, f.L / 2 + 0.6], '#fff2a0', { material: 'shiny' });
      add([f.W + 0.6, 1, f.L - 3], [0, top + 0.3, -0.5], '#ffcf3a', { material: 'shiny' });
      for (const s of [-1, 1]) add([3.6, 3.6, 3.6], [s * (f.W / 2 + 0.2), top - 1.4, f.L / 2 - 3.4], '#ffcf3a', { material: 'shiny' });
      add([2, 2, 0.6], [0, 1.6, f.L / 2 + 1.3], '#ff5a7a', { material: 'glow' });
    });
  },

  medal(rig, f) {
    // Big enough to read under the chin: a blue ribbon round the neck and a gold star medal on the chest.
    const top = backTop(f);
    piece(rig.parts.body, [0, 0, f.L / 2 - 3.4], (add) => {
      add([f.W + 0.8, 0.8, 4.4], [0, top - 0.4, 0], '#3a6ad9', { material: 'cloth' });
      for (const s of [-1, 1]) add([0.8, 4.4, 4.4], [s * (f.W / 2 + 0.4), top - 2.6, 0], '#3a6ad9', { material: 'cloth' });
    });
    piece(rig.parts.body, [0, 1.5 - f.H / 2 + 1.6, f.L / 2 + 0.9], (add) => {
      for (const s of [-1, 1]) add([1.4, 3.4, 0.6], [s * 0.9, 2, -0.2], '#3a6ad9', { rotation: [0, 0, s * 0.3], material: 'cloth' });
      add([4.2, 4.2, 0.9], [0, -0.6, 0], '#ffcf3a', { material: 'shiny' });
      add([4.2, 4.2, 0.9], [0, -0.6, 0], '#ffcf3a', { rotation: [0, 0, Math.PI / 4], material: 'shiny' });
      add([2, 2, 0.5], [0, -0.6, 0.55], '#fff2a0', { material: 'shiny' });
    }, [-0.35, 0, 0]);
  },
  lei(rig, f) {
    const top = backTop(f);
    piece(rig.parts.body, [0, 0, f.L / 2 - 3.6], (add) => {
      const colors = ['#ff6a9a', '#ffd23f', '#ffffff', '#ff9a3a', '#c58aff'];
      let i = 0;
      // Over the shoulders and round the front of the neck.
      for (let x = -f.W / 2; x <= f.W / 2 + 0.01; x += 2.2) add([2, 1.6, 2], [x, top - 0.6, 0], colors[i++ % colors.length]);
      for (const s of [-1, 1]) for (let y = top - 2.4; y > top - 6; y -= 1.8) add([1.6, 1.8, 2], [s * (f.W / 2 + 0.6), y, 0.6], colors[i++ % colors.length]);
      for (let x = -f.W / 2 + 1; x <= f.W / 2 - 1 + 0.01; x += 2.2) add([2, 1.8, 1.4], [x, top - 6.2, 3], colors[i++ % colors.length]);
    });
  },
  charmbelt(rig, f) {
    piece(rig.parts.body, [0, -1.4, 0], (add) => {
      add([f.W + 0.8, 1.6, f.L + 0.8], [0, 0, 0], '#6a3a1a');
      add([2.6, 2.2, 0.6], [0, 0, f.L / 2 + 0.6], '#e8c050', { material: 'shiny' });
      const charms = [['#5ac8ff', -4], ['#ff5a7a', -1.8], ['#7ed957', 2], ['#c58aff', 4.2]];
      for (const [color, x] of charms) add([1.2, 1.6, 1.2], [x * f.W / 14, -1.4, f.L / 2 + 0.7], color, { material: 'glow' });
    });
  },
  apron(rig, f) {
    piece(rig.parts.body, [0, 0.6, f.L / 2 + 0.5], (add) => {
      add([f.W - 3, f.H - 1, 0.6], [0, -0.8, 0], '#f4f1ea', { material: 'cloth' });
      add([f.W - 5, 2.4, 0.7], [0, -2.4, 0.05], '#7fb8e8', { material: 'cloth' });
      add([2.4, 1.8, 0.8], [0, 1.6, 0.1], '#b06a2a'); // a little teacup on the bib
      for (const s of [-1, 1]) add([0.7, 0.7, f.L], [s * (f.W / 2 - 1.5), 2 + f.H / 2 - 1.4, -f.L / 2], '#f4f1ea', { material: 'cloth' });
    });
  },

  // --- Back ---------------------------------------------------------------------------------------
  cape(rig, f) {
    return drapedCape(rig, f, { cloth: '#d9443a', lining: '#a8262a', hem: '#ffcf3a', clasp: '#ffcf3a', hang: 9 });
  },
  royalcape(rig, f) {
    return drapedCape(rig, f, { cloth: '#7a2ab8', lining: '#4a1a78', hem: '#ffcf3a', clasp: '#ffcf3a', hang: 13, trim: '#ffcf3a', fur: '#f4f1ea', gem: '#fff2b0' });
  },
  teapack(rig, f) {
    piece(rig.parts.body, [0, backTop(f) + 2.4, -2.2], (add) => {
      add([7.4, 5.4, 6.4], [0, 0, 0], '#f4f1ea');
      add([7.6, 1.2, 6.6], [0, -0.6, 0], '#7fb8e8');
      add([5, 1, 4.4], [0, 3.1, 0], '#f4f1ea');
      add([1.6, 1.2, 1.6], [0, 4, 0], '#7fb8e8');
      add([1.4, 1.4, 4.4], [4.6, 0.6, 0], '#f4f1ea', { rotation: [0, 0, -0.7] });
      add([1, 3.2, 3.4], [-4.2, 0.4, 0], '#f4f1ea');
      for (const s of [-1, 1]) add([0.8, 0.5, f.L - 6], [s * 2.6, -2.6, 3], '#7a4a22');
    });
  },
  butterfly(rig, f) {
    // Upright wings on the back (seen in full from behind, where the garden camera is), opening and closing.
    const wings = [-1, 1].map((s) =>
      piece(rig.parts.body, [s * 0.8, backTop(f) + 0.4, -2], (add) => {
        add([7.5, 8, 0.4], [s * 4.2, 5, 0], '#ff9ec7', { material: 'cloth' });
        add([5.5, 5, 0.42], [s * 3.4, -1.2, 0], '#c58aff', { material: 'cloth' });
        add([2.2, 2.2, 0.5], [s * 5, 6.4, 0], '#ffd23f', { material: 'cloth' });
        add([1.4, 1.4, 0.5], [s * 3.6, -1.4, 0], '#ffd23f', { material: 'cloth' });
        add([0.7, 8.2, 0.45], [s * 8, 5, 0], '#5a2a6a', { material: 'cloth' });
        add([7.6, 0.7, 0.45], [s * 4.2, 9, 0], '#5a2a6a', { material: 'cloth' });
      }, [-0.25, 0, 0])
    );
    return { update: (time) => wings.forEach((wing, i) => (wing.rotation.y = (i ? 1 : -1) * (0.35 + 0.45 * Math.sin(time * 5)))) };
  },
  dragonfly(rig, f) {
    const wings = [-1, 1].flatMap((s) =>
      [0, -3].map((z, i) =>
        piece(rig.parts.body, [s * 1.2, backTop(f) + 0.6, -1 + z], (add) => {
          add([11, 0.3, 2.2], [s * 5.6, 0, 0], '#bff4ff', { material: 'cloth' });
          add([11, 0.35, 0.4], [s * 5.6, 0.02, 0.6], '#5ab8d8', { material: 'cloth' });
        }, [0, s * (i ? -0.25 : 0.2), 0])
      )
    );
    return { update: (time) => wings.forEach((wing, i) => (wing.rotation.z = (i < 2 ? 1 : -1) * (0.2 + 0.25 * Math.sin(time * 22 + i)))) };
  },
  batwings(rig, f) {
    // Spread upright like a devil's: a bony arm along the top, ribs fanning down, a ragged membrane between them.
    const wings = [-1, 1].map((s) =>
      piece(rig.parts.body, [s * 1.2, backTop(f) + 0.6, -2.4], (add) => {
        add([11, 1, 1], [s * 5.5, 6.5, 0], '#1a0a0a', { rotation: [0, 0, s * 0.35] });
        add([10, 6.5, 0.4], [s * 5.4, 2.8, 0], '#5a0a1e', { material: 'cloth' });
        for (const x of [3, 6.5, 10]) add([0.6, 7, 0.6], [s * x, 3, 0.1], '#1a0a0a', { rotation: [0, 0, s * (0.15 + x * 0.02)] });
        for (const x of [4.6, 8.2]) add([2.2, 2, 0.42], [s * x, -0.8, 0], '#5a0a1e', { material: 'cloth' });
      }, [-0.2, 0, 0])
    );
    return { update: (time) => wings.forEach((wing, i) => (wing.rotation.y = (i ? 1 : -1) * (0.2 + 0.3 * Math.sin(time * 2.6)))) };
  },
};

Object.assign(MODELS, {
  balloon(rig, f) {
    // A balloon on a string tied to the back, bobbing above the frog.
    const string = piece(rig.parts.body, [1.5, backTop(f), -2], (add) => add([0.3, 15, 0.3], [0, 7.5, 0], '#f4f1ea'));
    const balloon = piece(string, [0, 15, 0], (add) => {
      add([7, 8, 7], [0, 4.6, 0], '#ff3a5a', { material: 'shiny' });
      add([5, 10, 5], [0, 4.6, 0], '#ff3a5a', { material: 'shiny' });
      add([9, 5, 5], [0, 4.6, 0], '#ff3a5a', { material: 'shiny' });
      add([5, 5, 9], [0, 4.6, 0], '#ff3a5a', { material: 'shiny' });
      add([1.6, 1.2, 1.6], [0, 0, 0], '#c2262a');
      add([1.4, 1.4, 0.4], [-1.6, 6.8, 3.6], '#ffffff', { material: 'glow' });
    });
    return {
      update(time) {
        string.rotation.z = -0.2 + Math.sin(time * 1.3) * 0.12;
        string.rotation.x = -0.15 + Math.sin(time * 0.9) * 0.08;
        balloon.rotation.y = Math.sin(time * 0.7) * 0.4;
      },
    };
  },
  fairy(rig, f) {
    const wings = [-1, 1].map((s) =>
      piece(rig.parts.body, [s * 0.8, backTop(f) + 0.4, -1.8], (add) => {
        add([5, 9, 0.35], [s * 3, 5.2, 0], '#bff4ff', { material: 'cloth' });
        add([3.4, 5, 0.37], [s * 2.4, -0.8, 0], '#e0d0ff', { material: 'cloth' });
        add([0.5, 9, 0.4], [s * 5.5, 5.2, 0], '#9fd8ff', { material: 'cloth' });
        for (const [x, y] of [[2.4, 7], [3.8, 3.6], [2, -1.2]]) add([0.9, 0.9, 0.45], [s * x, y, 0], '#ffffff', { material: 'glow' });
      }, [-0.3, 0, 0])
    );
    return { update: (time) => wings.forEach((wing, i) => (wing.rotation.y = (i ? 1 : -1) * (0.3 + 0.35 * Math.sin(time * 9)))) };
  },
  jetpack(rig, f) {
    const top = backTop(f);
    const flames = [];
    piece(rig.parts.body, [0, top + 2, -2.6], (add) => {
      for (const s of [-1, 1]) {
        add([3.4, 7, 3.4], [s * 2.2, 0, 0], '#c9922a', { material: 'shiny' });
        add([3.8, 1, 3.8], [s * 2.2, 3.4, 0], '#8a5a2a', { material: 'shiny' });
        add([2.6, 1.4, 2.6], [s * 2.2, -4, 0], '#4a4a52', { material: 'shiny' });
      }
      add([3, 4, 2.4], [0, 0.6, 0.4], '#8a8f96', { material: 'shiny' });
      add([1, 1, 1], [0, 1.6, 1.8], '#ff5a3a', { material: 'glow' });
    });
    for (const s of [-1, 1]) {
      flames.push(piece(rig.parts.body, [s * 2.2, top - 3, -2.6], (add) => {
        add([1.8, 2.4, 1.8], [0, -1.2, 0], '#ffb020', { material: 'glow' });
        add([1, 1.6, 1], [0, -2.8, 0], '#fff2a0', { material: 'glow' });
      }));
    }
    return { update: (time) => flames.forEach((flame, i) => flame.scale.set(1, 0.7 + 0.35 * Math.abs(Math.sin(time * 17 + i * 2)), 1)) };
  },
  shell(rig, f) {
    piece(rig.parts.body, [0, backTop(f) + 4.8, -1.8], (add) => {
      // A rounded shell on its side (a cross of boxes), with a square voxel spiral on both flat faces.
      const w = Math.min(9, f.W * 0.62);
      add([w, 10, 7], [0, 0, 0], '#e0a868');
      add([w, 7, 10], [0, 0, 0], '#e0a868');
      add([w - 1, 8.6, 8.6], [0, 0, 0], '#d9985a');
      const path = [[-4, -4], [4, -4], [4, 4], [-3, 4], [-3, -2], [2, -2], [2, 2], [-1, 2], [-1, 0], [0.4, 0]];
      for (const side of [-1, 1]) {
        for (let i = 1; i < path.length; i++) {
          const [z0, y0] = path[i - 1];
          const [z1, y1] = path[i];
          const length = Math.abs(z1 - z0) + Math.abs(y1 - y0) + 0.8;
          add([0.4, y0 === y1 ? 0.8 : length, z0 === z1 ? 0.8 : length], [side * (w / 2 + 0.1), (y0 + y1) / 2, (z0 + z1) / 2], '#8a5a2a');
        }
      }
      add([w + 0.4, 1.4, 9], [0, -4.8, 0], '#8a5a2a');
    });
  },
});

/**
 * A cape that drapes like cloth: a collar with clasps at the neck, a panel lying along the back, then two hanging
 * panels that flare a little and sway in a wave (the lower one follows the upper a moment later). One flat slab
 * hinged at the back looked like a plank. `look`: colours, `hang` (length of the hanging part), `trim` (side edges),
 * `fur` (a collar), `gem` (a glowing jewel on the back).
 */
function drapedCape(rig, f, look) {
  const top = backTop(f);
  const neck = f.L / 2 - 3;
  const along = f.L - 3.5; // from the neck to the rump
  const cloth = { material: 'cloth' };
  piece(rig.parts.body, [0, top - 0.6, neck], (add) => {
    if (look.fur) add([f.W + 2.4, 2.6, 3.4], [0, 0.6, 0.4], look.fur);
    else add([f.W + 1, 1.2, 2], [0, 0.4, 0.4], look.cloth, cloth);
    for (const s of [-1, 1]) add([2, 2, 1.2], [s * (f.W / 2 - 0.4), 0.6, 1.6], look.clasp, { material: 'shiny' });
  });
  const back = piece(rig.parts.body, [0, top + 0.25, neck - 0.6], (add) => {
    add([f.W - 1, 0.5, along], [0, 0, -along / 2], look.cloth, cloth);
    add([f.W - 1.2, 0.5, along], [0, -0.2, -along / 2], look.lining, cloth);
    if (look.trim) for (const s of [-1, 1]) add([0.8, 0.55, along], [s * (f.W / 2 - 0.4), 0.02, -along / 2], look.trim, cloth);
    if (look.gem) add([2, 2, 0.8], [0, 0.6, -along * 0.45], look.gem, { rotation: [Math.PI / 2, 0, Math.PI / 4], material: 'glow' });
  }, [0.04, 0, 0]);
  const upperLength = look.hang * 0.55;
  const lowerLength = look.hang * 0.45;
  const upper = piece(back, [0, 0, -along], (add) => {
    add([f.W, 0.5, upperLength], [0, 0, -upperLength / 2], look.cloth, cloth);
    add([f.W - 0.2, 0.5, upperLength], [0, -0.2, -upperLength / 2], look.lining, cloth);
    if (look.trim) for (const s of [-1, 1]) add([0.8, 0.55, upperLength], [s * (f.W / 2), 0.02, -upperLength / 2], look.trim, cloth);
  });
  const lower = piece(upper, [0, 0, -upperLength], (add) => {
    add([f.W + 1.2, 0.5, lowerLength], [0, 0, -lowerLength / 2], look.cloth, cloth);
    add([f.W + 1, 0.5, lowerLength], [0, -0.2, -lowerLength / 2], look.lining, cloth);
    add([f.W + 1.4, 0.6, 1.2], [0, 0.02, -lowerLength + 0.5], look.hem, cloth);
    if (look.trim) for (const s of [-1, 1]) add([0.8, 0.55, lowerLength], [s * (f.W / 2 + 0.6), 0.02, -lowerLength / 2], look.trim, cloth);
    // A pointed tail in the middle of the hem, stepped like the voxels.
    add([f.W * 0.5, 0.5, 2], [0, 0, -lowerLength - 1], look.cloth, cloth);
    add([f.W * 0.22, 0.5, 1.6], [0, 0, -lowerLength - 2.6], look.cloth, cloth);
    add([f.W * 0.52, 0.6, 0.8], [0, 0.02, -lowerLength - 1.6], look.hem, cloth);
  });
  return {
    update(time) {
      const wave = Math.sin(time * 2.1);
      upper.rotation.x = -1.4 + wave * 0.07;
      lower.rotation.x = 0.1 + Math.sin(time * 2.1 - 0.9) * 0.12; // flares out a little, a beat behind
    },
  };
}

// --- Auras: a swirl of little voxels around the frog, one instanced mesh ---------------------------------
const AURA_COUNT = 22;
const AURA_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
/** Shaped bits (built from unit voxels, about 1 across) for the auras that need more than a cube. */
const shape = (draw) => {
  const boxes = [];
  draw((size, position) => box(boxes, size, position, '#ffffff'));
  const geometry = mergeGeometries(boxes);
  geometry.deleteAttribute('color');
  return geometry;
};
const AURA_SHAPES = {
  heart: shape((add) => {
    add([0.5, 0.45, 0.3], [-0.25, 0.2, 0]);
    add([0.5, 0.45, 0.3], [0.25, 0.2, 0]);
    add([0.8, 0.35, 0.3], [0, -0.15, 0]);
    add([0.35, 0.3, 0.3], [0, -0.4, 0]);
  }),
  note: shape((add) => {
    add([0.45, 0.35, 0.3], [-0.15, -0.4, 0]);
    add([0.15, 1, 0.3], [0.05, 0.1, 0]);
    add([0.4, 0.15, 0.3], [0.25, 0.55, 0]);
  }),
  leaf: shape((add) => {
    add([1, 0.12, 0.5], [0, 0, 0]);
    add([0.6, 0.12, 0.8], [0, 0, 0]);
  }),
};
const AURA_MATERIAL = new THREE.MeshBasicMaterial({ color: '#ffffff' });
/**
 * `motion`: 'fall' (from above, drifting), 'rise' (up from the ground), 'orbit' (circling, bobbing); `size`: [x,y,z];
 * `spin`; `twinkle` (shrinks and grows); `speed`: how fast.
 */
const AURAS = {
  petals: { motion: 'fall', colors: ['#ffb6d0', '#ff9ec7', '#ffe0ec'], size: [1.8, 0.35, 1.3], spin: 3, speed: 9 },
  snow: { motion: 'fall', colors: ['#ffffff', '#e0f4ff', '#c8e8ff'], size: [1, 1, 1], spin: 1, speed: 6 },
  bubbles: { motion: 'rise', colors: ['#bfefff', '#8fd8ff', '#e8fbff'], size: [1.6, 1.6, 1.6], speed: 10, wobble: 2 },
  embers: { motion: 'rise', colors: ['#ff6a00', '#ffb020', '#ff3a1a'], size: [0.9, 0.9, 0.9], speed: 18, twinkle: true, wobble: 1 },
  fireflies: { motion: 'orbit', colors: ['#e8ff6a', '#c8ff4a', '#fff27a'], size: [1, 1, 1], speed: 0.7, twinkle: true },
  sparkle: { motion: 'orbit', colors: ['#ffe680', '#ffcf3a', '#fff6c8'], size: [1.1, 1.1, 1.1], speed: 1.4, twinkle: true, spin: 4 },
  stardust: { motion: 'orbit', colors: ['#c8b0ff', '#9ff4ff', '#ffffff', '#ff9ef0'], size: [0.9, 0.9, 0.9], speed: 0.5, twinkle: true, ring: true },
  hearts: { motion: 'rise', shape: 'heart', colors: ['#ff5a8a', '#ff8aa8', '#ff3a6a'], size: [1.6, 1.6, 1.6], speed: 7, wobble: 2.5, face: true },
  notes: { motion: 'orbit', shape: 'note', colors: ['#3a2a6a', '#5a3aa8', '#1a1a3a'], size: [1.7, 1.7, 1.7], speed: 0.6, face: true },
  leaves: { motion: 'fall', shape: 'leaf', colors: ['#e8801a', '#f0a020', '#c2402a', '#d9b03a'], size: [1.8, 1.8, 1.8], spin: 2.4, speed: 7 },
  sparks: { motion: 'orbit', colors: ['#bfe8ff', '#ffffff', '#7fd8ff'], size: [0.5, 2.2, 0.5], speed: 2.6, twinkle: true, spin: 9 },
  rainbow: { motion: 'orbit', colors: ['#ff4a4a', '#ff9a3a', '#ffe14a', '#5fd85a', '#4ab8ff', '#9a6aff'], size: [1.2, 1.2, 1.2], speed: 0.9, ring: true, rainbow: true },
};

function aura(rig, look) {
  const mesh = new THREE.InstancedMesh(AURA_SHAPES[look.shape] ?? AURA_GEOMETRY, AURA_MATERIAL, AURA_COUNT);
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  const bits = Array.from({ length: AURA_COUNT }, (_, i) => {
    if (look.rainbow) {
      // An even ring, its colours in order.
      mesh.setColorAt(i, color.set(look.colors[Math.floor((i / AURA_COUNT) * look.colors.length)]));
      return { angle: (i / AURA_COUNT) * Math.PI * 2, radius: 22, phase: 0, height: 0.5, tilt: 0 };
    }
    mesh.setColorAt(i, color.set(look.colors[i % look.colors.length]));
    return { angle: Math.random() * Math.PI * 2, radius: 14 + Math.random() * 18, phase: Math.random(), height: Math.random(), tilt: Math.random() * Math.PI };
  });
  rig.root.add(mesh);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  return {
    mesh,
    update(time) {
      bits.forEach((bit, i) => {
        let k = 1;
        if (look.motion === 'orbit') {
          const angle = bit.angle + time * look.speed * (look.rainbow || i % 2 ? 1 : -0.8); // (the rainbow keeps its order)
          const radius = look.ring ? 22 + Math.sin(time + bit.phase * 6) * 2 : bit.radius;
          position.set(Math.cos(angle) * radius, 4 + bit.height * (look.ring ? 6 : 30) + Math.sin(time * 1.5 + bit.phase * 6) * 2, Math.sin(angle) * radius);
        } else {
          // Falling or rising through a column, over and over.
          const t = (time * look.speed / 40 + bit.phase) % 1;
          const y = look.motion === 'fall' ? 44 * (1 - t) : 44 * t;
          const sway = Math.sin(time * 1.6 + bit.phase * 9) * (look.wobble ?? 3);
          position.set(Math.cos(bit.angle) * bit.radius + sway, y, Math.sin(bit.angle) * bit.radius);
          k = Math.min(1, t * 6, (1 - t) * 6); // fade in and out at the ends
        }
        if (look.twinkle) k *= 0.35 + 0.65 * Math.max(0, Math.sin(time * 5 + bit.phase * 20));
        if (look.face) euler.set(0, Math.atan2(position.x, position.z) + Math.sin(time * 2 + bit.phase * 6) * 0.3, 0); // upright, facing out
        else euler.set(bit.tilt + time * (look.spin ?? 0), time * (look.spin ?? 0) * 0.7, 0);
        rotation.setFromEuler(euler);
        scale.set(look.size[0] * k * 1.7, look.size[1] * k * 1.7, look.size[2] * k * 1.7); // (bigger: they read at garden distance)
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * Dresses a frog (`rig` from buildFrog) in an outfit { slot: wearable id }. Returns { update(delta), dispose() }:
 * update every frame (things sway and flap), dispose to take it all off again.
 */
export function dressFrog(rig, outfit = {}) {
  const added = [];
  const updates = [];
  const watch = (parent) => {
    const before = new Set(parent.children);
    return () => parent.children.filter((child) => !before.has(child));
  };
  const parents = [rig.parts.head, rig.parts.body, rig.root];
  const newOnes = parents.map(watch);
  const worn = [];
  for (const slot of SLOTS) {
    const id = outfit[slot.id];
    if (!id) continue;
    if (slot.id === 'aura') {
      const look = AURAS[id];
      if (!look) continue;
      updates.push(aura(rig, look).update);
    } else {
      const model = MODELS[id];
      if (!model) continue;
      const result = model(rig, rig.fit);
      if (result?.update) updates.push(result.update);
    }
    worn.push(slot.id);
  }
  for (const found of newOnes) added.push(...found());
  rig.cover(worn.filter((slot) => slot !== 'body' && slot !== 'aura'));
  let time = Math.random() * 10;
  return {
    worn,
    update(delta) {
      time += delta;
      for (const update of updates) update(time);
    },
    dispose() {
      rig.cover([]);
      for (const object of added) {
        object.removeFromParent();
        object.traverse((child) => {
          if (child.isMesh && child.geometry !== AURA_GEOMETRY && !Object.values(AURA_SHAPES).includes(child.geometry)) child.geometry.dispose();
          if (child.isInstancedMesh) child.dispose();
        });
      }
    },
  };
}
