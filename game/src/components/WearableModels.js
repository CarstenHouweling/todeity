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

  // --- Back ---------------------------------------------------------------------------------------
  cape(rig, f) {
    const cape = piece(rig.parts.body, [0, backTop(f) - 0.4, -f.L / 2 + 3], (add) => {
      add([f.W, 0.6, 12], [0, 0, -5], '#d9443a', { material: 'cloth' });
      add([f.W + 0.4, 0.7, 1.6], [0, 0.1, -10.6], '#a8262a', { material: 'cloth' });
      add([f.W + 1, 1.4, 2], [0, 0.4, 1], '#ffcf3a', { material: 'shiny' });
    });
    return { update: (time) => (cape.rotation.x = -0.85 + Math.sin(time * 2.2) * 0.12) };
  },
  royalcape(rig, f) {
    const cape = piece(rig.parts.body, [0, backTop(f) - 0.4, -f.L / 2 + 3.5], (add) => {
      add([f.W + 1, 0.6, 15], [0, 0, -6.5], '#7a2ab8', { material: 'cloth' });
      add([f.W + 1.4, 0.7, 1.4], [0, 0.05, -13.4], '#ffcf3a', { material: 'cloth' });
      for (const s of [-1, 1]) add([1, 0.7, 15], [s * (f.W / 2 + 0.4), 0.05, -6.5], '#ffcf3a', { material: 'cloth' });
      add([f.W + 2.4, 2.4, 3], [0, 0.8, 0.8], '#f4f1ea');
      for (const x of [-3, 0, 3]) add([0.8, 0.8, 0.8], [x, 1.2, 2.4], '#2a2a2a');
      add([2, 2, 2], [0, 0.4, -7], '#fff2b0', { rotation: [0, Math.PI / 4, 0], material: 'glow' });
    });
    return { update: (time) => (cape.rotation.x = -0.9 + Math.sin(time * 1.8) * 0.1) };
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

// --- Auras: a swirl of little voxels around the frog, one instanced mesh ---------------------------------
const AURA_COUNT = 22;
const AURA_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
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
};

function aura(rig, look) {
  const mesh = new THREE.InstancedMesh(AURA_GEOMETRY, AURA_MATERIAL, AURA_COUNT);
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  const bits = Array.from({ length: AURA_COUNT }, (_, i) => {
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
          const angle = bit.angle + time * look.speed * (i % 2 ? 1 : -0.8);
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
        euler.set(bit.tilt + time * (look.spin ?? 0), time * (look.spin ?? 0) * 0.7, 0);
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
          if (child.isMesh && child.geometry !== AURA_GEOMETRY) child.geometry.dispose();
          if (child.isInstancedMesh) child.dispose();
        });
      }
    },
  };
}
