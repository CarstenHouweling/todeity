import * as THREE from 'three';
import { buildTrinket, disposeTrinket } from './TrinketModels.js';
import { DECOR_RADIUS, MAX_DECOR, gardenSets, trinketById } from './Rewards.js';

/**
 * Tode's garden on the title screen: the trinkets placed around him, and the "My garden" editor.
 *
 * - **Camera** (while editing or visiting): drag the lawn to look around, scroll or pinch to zoom, right-drag,
 *   two fingers or WASD to pan, Q/E to turn; `resetView()` and `planView()` (straight down).
 * - **Editing:** drag a trinket from the tray onto the lawn, or a placed one to move it (tap the tray, then the lawn,
 *   works too). A tapped trinket is selected: turn it (R, ↻, scroll while held), put it away (Delete). `snap`
 *   lines them up on a grid; `undo()` steps back (Ctrl+Z).
 * - **Sets** (Rewards.js): trinkets of a set close together light up a little display.
 * - **Visiting:** `visit(decor)` shows someone else's garden, look only.
 *
 * Placements live in `meta.decor` ([{ id, x, y, r }]); `onChange(decor)` saves them.
 */
const GRID = 20;
const TURN = Math.PI / 4;
const UNDO_LIMIT = 50;
const VIEW = { yaw: -Math.PI / 4, pitch: 0.82, distance: 430 };
const PITCH = [0.22, 1.5];
const DISTANCE = [140, 720];

const SET_EFFECTS = {
  steam: { colors: ['#ffffff', '#f4ead8'], up: 60, gravity: -30, size: 3.2, height: 18, count: 2, every: 0.12, spread: 12 },
  sparkle: { colors: ['#fff2a0', '#ffd36b', '#ffffff'], up: 40, gravity: -10, size: 1.8, height: 10, count: 2, every: 0.1, spread: 70, glow: true },
  fireflies: { colors: ['#fff27a', '#c58aff', '#d4ff8a'], up: 14, gravity: -6, size: 1.6, height: 16, count: 1, every: 0.08, spread: 80, glow: true, life: 1.6 },
  ripples: { colors: ['#bfefff', '#ffffff'], up: 4, gravity: 0, size: 1.4, height: 1, count: 10, every: 0.9, spread: 0, ring: 40 },
  petals: { colors: ['#ff9ec7', '#ffd1e3', '#ffffff'], up: -10, gravity: 20, size: 1.8, height: 70, count: 1, every: 0.15, spread: 90, life: 2.4 },
  leaves: { colors: ['#7ed957', '#c8f77a', '#ffd36b'], up: 30, gravity: 30, size: 1.8, height: 8, count: 2, every: 0.2, spread: 70 },
  beam: { colors: ['#fff2a0', '#ffffff'], up: 160, gravity: -40, size: 2, height: 4, count: 2, every: 0.08, spread: 8, glow: true },
};

export class TitleGarden {
  constructor({ scene, camera, canvas, particles, play }) {
    Object.assign(this, { scene, camera, canvas, particles, play });
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.items = []; // { id, x, y, r, model, bounce, lift }
    this.editing = false;
    this.visiting = false;
    this.walking = false; // hopping around (GardenHub.js): the camera follows `follow`
    this.follow = null;
    this.night = false;
    this.snap = false;
    this.held = null; // the trinket being dragged or following the pointer
    this.selected = null;
    this.undoStack = [];
    this.gesture = null;
    this.pointers = new Map();
    this.sets = [];
    this.setFx = []; // { set, x, y, ring, timer, beam }
    this.onChange = null;
    this.onSelect = null; // the tray redraws (held or selected trinket changed)
    this.onPlaced = null; // a trinket was set down (Tode looks at it)
    this.onSetFormed = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.hit = new THREE.Vector3();
    this.time = 0;
    this.view = { ...VIEW, x: 0, y: 0 };
    this.goal = { ...VIEW, x: 0, y: 0 };

    const ring = (inner, outer, color, opacity = 0.8) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      mesh.position.z = 1;
      mesh.visible = false;
      this.root.add(mesh);
      return mesh;
    };
    this.marker = ring(16, 20, '#7ed957'); // under the held trinket: green where it can go, red where it can't
    this.selection = ring(22, 25, '#ffd36b', 0.9);
    this.boundary = ring(DECOR_RADIUS - 2, DECOR_RADIUS + 2, '#ffffff', 0.35);
    this.boundary.geometry = new THREE.RingGeometry(DECOR_RADIUS - 2, DECOR_RADIUS + 2, 96);
    this.grid = new THREE.GridHelper(DECOR_RADIUS * 2, (DECOR_RADIUS * 2) / GRID, '#ffffff', '#ffffff');
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.z = 0.9;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.18;
    this.grid.visible = false;
    this.root.add(this.grid);

    canvas.addEventListener('pointerdown', (event) => this.down(event));
    window.addEventListener('pointermove', (event) => this.move(event));
    window.addEventListener('pointerup', (event) => this.up(event));
    window.addEventListener('pointercancel', (event) => this.up(event, true));
    canvas.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
    canvas.addEventListener('contextmenu', (event) => this.active && event.preventDefault());
  }

  get active() {
    return this.editing || this.visiting || this.walking;
  }

  // --- Trinkets ------------------------------------------------------------------------------

  /** Builds the placed trinkets from saved decor. */
  load(decor = []) {
    for (const item of this.items) disposeTrinket(item.model);
    this.items = [];
    this.held = this.selected = null;
    for (const { id, x, y, r } of decor) if (trinketById(id)) this.add(id, x, y, r);
    this.updateSets(false);
  }

  add(id, x, y, r = 0) {
    const model = buildTrinket(id);
    this.root.add(model);
    const item = { id, x, y, r, model, bounce: 0, lift: 0 };
    this.items.push(item);
    this.place(item);
    return item;
  }

  remove(item) {
    disposeTrinket(item.model);
    this.items.splice(this.items.indexOf(item), 1);
    if (this.selected === item) this.selected = null;
  }

  decor() {
    return this.items.filter((item) => item !== this.held || !item.fresh).map(({ id, x, y, r }) => ({ id, x: Math.round(x), y: Math.round(y), r: Math.round(r * 100) / 100 }));
  }

  placed(id) {
    return this.items.some((item) => item.id === id && !item.fresh);
  }

  /** New trinkets find a free spot in a ring around Tode by themselves. */
  autoPlace(ids) {
    let added = false;
    for (const id of ids) {
      if (this.items.some((item) => item.id === id) || this.items.length >= MAX_DECOR) continue;
      const spot = this.freeSpot();
      const item = this.add(id, spot.x, spot.y, Math.random() * Math.PI * 2);
      item.bounce = 1;
      added = true;
    }
    if (added) this.changed();
  }

  freeSpot() {
    for (let tries = 0; tries < 60; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 75 + Math.random() * 110;
      const spot = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      if (this.items.every((item) => (item.x - spot.x) ** 2 + (item.y - spot.y) ** 2 > 36 ** 2)) return spot;
    }
    return { x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 300 };
  }

  inside(item) {
    const distance = Math.hypot(item.x, item.y);
    return distance <= DECOR_RADIUS && distance > 30; // not on Tode himself
  }

  /** Snaps a position to the grid (when snapping is on). */
  snapped(x, y) {
    return this.snap ? [Math.round(x / GRID) * GRID, Math.round(y / GRID) * GRID] : [x, y];
  }

  place(item) {
    item.model.position.set(item.x, item.y, 0);
    item.model.rotation.z = item.r;
  }

  /** Something changed: remember it for undo (the state before it is passed in), save it, look for sets. */
  changed(before = null) {
    if (before) {
      this.undoStack.push(before);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }
    this.onChange?.(this.decor());
    this.updateSets(true);
  }

  undo() {
    if (!this.editing || !this.undoStack.length) return false;
    this.cancelHeld();
    this.load(this.undoStack.pop());
    this.onChange?.(this.decor());
    this.onSelect?.();
    this.play?.('click');
    return true;
  }

  // --- Editing ---------------------------------------------------------------------------------

  setVisible(on) {
    this.root.visible = on;
  }

  /** Into the editor (or a visit): the camera takes over from wherever it is now. */
  enter({ visiting = false, yaw = VIEW.yaw } = {}) {
    this.editing = !visiting;
    this.visiting = visiting;
    const fromWalk = this.walking;
    this.walking = false;
    this.boundary.visible = this.editing;
    this.grid.visible = this.editing && this.snap;
    // Start from the camera's current place, so the move into the editor is smooth.
    if (fromWalk) this.goal = { ...VIEW, yaw: this.view.yaw, x: this.view.x, y: this.view.y };
    else {
      this.view = this.viewFromCamera();
      this.goal = { ...VIEW, yaw, x: 0, y: 0 };
    }
    this.undoStack = [];
  }

  /** Hopping around: the camera follows `follow` (Tode's position), closer in; the lawn can't be edited. */
  walk(follow) {
    const fromEditor = this.editing || this.visiting;
    this.cancelHeld();
    this.selected = null;
    this.editing = this.visiting = false;
    this.walking = true;
    this.follow = follow;
    for (const mesh of [this.boundary, this.grid, this.marker, this.selection]) mesh.visible = false;
    if (!fromEditor) this.view = this.viewFromCamera();
    Object.assign(this.goal, { pitch: 0.62, distance: 300 });
  }

  /** Where the camera is now, as orbit values around the middle of the garden. */
  viewFromCamera() {
    const p = this.camera.getWorldPosition(new THREE.Vector3());
    const distance = Math.max(1, p.length());
    return { yaw: Math.atan2(p.y, p.x), pitch: Math.asin(THREE.MathUtils.clamp(p.z / distance, -1, 1)), distance, x: 0, y: 0 };
  }

  exit() {
    this.cancelHeld();
    this.editing = this.visiting = this.walking = false;
    this.follow = null;
    this.selected = null;
    this.gesture = null;
    this.pointers.clear();
    for (const mesh of [this.boundary, this.grid, this.marker, this.selection]) mesh.visible = false;
  }

  /** Someone else's garden: built from their decor, look only. */
  visit(decor) {
    this.load(decor);
    this.enter({ visiting: true, yaw: this.goal.yaw });
  }

  toggleSnap() {
    this.snap = !this.snap;
    this.grid.visible = this.editing && this.snap;
    return this.snap;
  }

  setNight(on) {
    this.night = on;
  }

  /** The tray: press on a trinket to drag it onto the lawn (or tap it, then tap the lawn). */
  beginTray(id, event) {
    if (!this.editing) return;
    this.cancelHeld();
    const existing = this.items.find((item) => item.id === id);
    const item = existing ?? this.add(id, 0, 0, 0);
    item.fresh = !existing;
    item.from = existing ? { x: existing.x, y: existing.y, r: existing.r } : null;
    item.model.visible = Boolean(existing);
    this.held = item;
    this.selected = item;
    this.before = this.decor();
    this.gesture = { mode: 'tray', id: event.pointerId, x: event.clientX, y: event.clientY, last: { x: event.clientX, y: event.clientY }, moved: false };
    this.onSelect?.();
  }

  /** Lets go of the held trinket without placing it: a new one goes back to the tray, a moved one back home. */
  cancelHeld() {
    const item = this.held;
    if (!item) return;
    this.held = null;
    if (item.fresh) this.remove(item);
    else if (item.from) Object.assign(item, item.from);
    item.fresh = false;
    this.marker.visible = false;
  }

  /** Sets the held trinket down where it is (if it may stand there). */
  drop() {
    const item = this.held;
    if (!item) return false;
    if (!this.inside(item)) {
      this.cancelHeld();
      this.play?.('click');
      this.onSelect?.();
      return false;
    }
    this.held = null;
    item.fresh = false;
    item.model.visible = true;
    item.bounce = 1;
    this.marker.visible = false;
    this.selected = item;
    this.particles?.burst(new THREE.Vector3(item.x, item.y, 0), { count: 14, colors: ['#d9c9a0', '#c4b48a', '#9ed27a'], speed: 70, up: 50, size: 1.8, height: 1, life: 0.5 });
    this.play?.('pop');
    this.onPlaced?.(new THREE.Vector3(item.x, item.y, 0));
    this.changed(this.before);
    this.onSelect?.();
    return true;
  }

  turn() {
    const item = this.held ?? this.selected;
    if (!item || !this.editing) return;
    const before = this.held ? null : this.decor();
    item.r = (Math.round(item.r / TURN) * TURN + TURN) % (Math.PI * 2);
    item.bounce = Math.max(item.bounce, 0.4);
    this.play?.('click');
    if (before) this.changed(before);
  }

  /** The held or selected trinket goes back into the tray. */
  putAway() {
    const item = this.held ?? this.selected;
    if (!item || !this.editing) return;
    const before = item === this.held ? this.before : this.decor();
    if (item === this.held) this.held = null;
    this.remove(item);
    this.selected = null;
    this.marker.visible = false;
    this.play?.('click');
    this.changed(before);
    this.onSelect?.();
  }

  // --- Pointer and camera ---------------------------------------------------------------------------

  aim(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, this.hit);
  }

  /** The placed trinket under the pointer (call `aim` first). */
  trinketUnderPointer() {
    const [first] = this.raycaster.intersectObjects(this.items.filter((item) => item !== this.held).map((item) => item.model), true);
    let node = first?.object;
    while (node && !node.userData.trinket) node = node.parent;
    return (node && this.items.find((item) => item.model === node)) ?? this.items.find((item) => item !== this.held && (item.x - this.hit.x) ** 2 + (item.y - this.hit.y) ** 2 < 20 ** 2);
  }

  followPointer(clientX, clientY) {
    if (!this.held || !this.aim(clientX, clientY)) return;
    [this.held.x, this.held.y] = this.snapped(this.hit.x, this.hit.y);
    this.held.model.visible = true;
  }

  down(event) {
    if (!this.active) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      // Two fingers: pinch to zoom, move to pan. A drag in progress is called off.
      if (this.gesture?.mode === 'drag') this.cancelHeld();
      const [a, b] = [...this.pointers.values()];
      this.gesture = { mode: 'pinch', spread: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (this.pointers.size > 2) return;
    const start = { id: event.pointerId, x: event.clientX, y: event.clientY, last: { x: event.clientX, y: event.clientY }, moved: false };
    const pan = this.editing && (event.button === 2 || event.button === 1 || event.shiftKey);
    if (this.editing && this.held && !pan) {
      // A trinket picked from the tray with a tap follows the pointer: this tap sets it down.
      this.gesture = { ...start, mode: 'place' };
      this.followPointer(event.clientX, event.clientY);
      return;
    }
    if (this.editing && !pan && this.aim(event.clientX, event.clientY)) {
      const item = this.trinketUnderPointer();
      if (item) {
        this.before = this.decor();
        item.from = { x: item.x, y: item.y, r: item.r };
        this.gesture = { ...start, mode: 'drag', item, offset: { x: item.x - this.hit.x, y: item.y - this.hit.y } };
        this.selected = item;
        this.onSelect?.();
        return;
      }
    }
    this.gesture = { ...start, mode: pan ? 'pan' : 'orbit' };
  }

  move(event) {
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = this.gesture;
    if (!gesture) {
      // A tapped tray trinket follows the mouse.
      if (this.editing && this.held && event.pointerType === 'mouse') this.followPointer(event.clientX, event.clientY);
      return;
    }
    if (gesture.mode === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (gesture.spread / Math.max(1, spread)), ...DISTANCE);
      this.panBy(mid.x - gesture.mid.x, mid.y - gesture.mid.y);
      Object.assign(gesture, { spread, mid });
      return;
    }
    if (event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.last.x;
    const dy = event.clientY - gesture.last.y;
    gesture.last = { x: event.clientX, y: event.clientY };
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
    if (gesture.mode === 'orbit') {
      this.goal.yaw -= dx * 0.006;
      this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + dy * 0.004, ...PITCH);
    } else if (gesture.mode === 'pan') {
      this.panBy(dx, dy);
    } else if (gesture.mode === 'drag' && gesture.moved) {
      if (!this.held) {
        this.held = gesture.item;
        this.held.lift = 1;
        this.play?.('click');
      }
      if (this.aim(event.clientX, event.clientY)) [this.held.x, this.held.y] = this.snapped(this.hit.x + gesture.offset.x, this.hit.y + gesture.offset.y);
    } else if (gesture.mode === 'tray' || gesture.mode === 'place') {
      this.followPointer(event.clientX, event.clientY);
    }
  }

  up(event, cancelled = false) {
    this.pointers.delete(event.pointerId);
    const gesture = this.gesture;
    if (!gesture || (gesture.mode !== 'pinch' && event.pointerId !== gesture.id)) return;
    if (gesture.mode === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    this.gesture = null;
    if (cancelled) {
      this.cancelHeld();
      return;
    }
    if (gesture.mode === 'drag') {
      if (gesture.moved) this.drop();
    } else if (gesture.mode === 'tray') {
      // Dragged out onto the lawn: set it down there. Just tapped: it follows the pointer until the next tap.
      const overLawn = document.elementFromPoint(event.clientX, event.clientY) === this.canvas;
      if (gesture.moved && overLawn) {
        this.followPointer(event.clientX, event.clientY);
        this.drop();
      } else if (gesture.moved) {
        this.cancelHeld();
        this.onSelect?.();
      }
    } else if (gesture.mode === 'place') {
      this.followPointer(event.clientX, event.clientY);
      this.drop();
    } else if (gesture.mode === 'orbit' && !gesture.moved && this.editing) {
      // A tap on bare lawn: nothing selected any more.
      this.selected = null;
      this.onSelect?.();
    }
  }

  wheel(event) {
    if (!this.active) return;
    event.preventDefault();
    const step = Math.sign(event.deltaY);
    if (this.editing && (this.held || (this.selected && event.shiftKey))) {
      if (step) this.turn();
      return;
    }
    this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (1 + step * 0.12), ...DISTANCE);
  }

  /** Moves the view by a screen-space drag (pixels). */
  panBy(dx, dy) {
    const scale = this.goal.distance / 650;
    const yaw = this.goal.yaw;
    // Screen right and screen up on the ground, as seen from the camera.
    const right = { x: -Math.sin(yaw), y: Math.cos(yaw) };
    const away = { x: -Math.cos(yaw), y: -Math.sin(yaw) };
    this.goal.x -= (right.x * dx - away.x * dy) * scale;
    this.goal.y -= (right.y * dx - away.y * dy) * scale;
    const limit = DECOR_RADIUS + 80;
    const length = Math.hypot(this.goal.x, this.goal.y);
    if (length > limit) {
      this.goal.x *= limit / length;
      this.goal.y *= limit / length;
    }
  }

  /** Keyboard: WASD / arrows pan, Q/E turn the view. `axes`: { x, y, turn } from -1 to 1. */
  steer({ x, y, turn }, delta) {
    if (!this.editing && !this.visiting) return;
    this.panBy(-x * 600 * delta, y * 600 * delta);
    this.goal.yaw += turn * 1.6 * delta;
  }

  resetView() {
    Object.assign(this.goal, { ...VIEW, yaw: this.goal.yaw, x: 0, y: 0 });
  }

  planView() {
    this.goal.pitch = PITCH[1];
    this.goal.distance = Math.max(this.goal.distance, 520);
  }

  /** Places the camera; it is a child of Tode's group, at `origin` (where Tode stands) in the world. */
  updateCamera(camera, delta, origin = null) {
    if (this.walking && this.follow) {
      this.goal.x = this.follow.x;
      this.goal.y = this.follow.y;
    }
    const k = 1 - Math.exp(-8 * delta);
    // Turn the shorter way round.
    const yawGap = Math.atan2(Math.sin(this.goal.yaw - this.view.yaw), Math.cos(this.goal.yaw - this.view.yaw));
    this.view.yaw += yawGap * k;
    for (const key of ['pitch', 'distance', 'x', 'y']) this.view[key] += (this.goal[key] - this.view[key]) * k;
    const { yaw, pitch, distance, x, y } = this.view;
    const lookZ = this.walking && this.follow ? this.follow.z * 0.8 + 12 : 0;
    camera.position.set(x + Math.cos(yaw) * Math.cos(pitch) * distance, y + Math.sin(yaw) * Math.cos(pitch) * distance, lookZ + Math.sin(pitch) * distance);
    if (origin) camera.position.sub(origin);
    // Looking straight down needs an up that isn't straight up.
    camera.up.set(pitch > 1.45 ? -Math.cos(yaw) : 0, pitch > 1.45 ? -Math.sin(yaw) : 0, pitch > 1.45 ? 0 : 1);
    camera.lookAt(x, y, lookZ);
  }

  // --- Sets --------------------------------------------------------------------------------------

  /** Finds the sets on the lawn; new ones light up (with `celebrate`). */
  updateSets(celebrate) {
    const found = gardenSets(this.decor());
    const had = new Set(this.sets.map(({ set }) => set.id));
    this.sets = found;
    for (const fx of this.setFx) {
      fx.ring.removeFromParent();
      fx.ring.geometry.dispose();
      fx.ring.material.dispose();
    }
    this.setFx = found.map(({ set, x, y }) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(108, 114, 72),
        new THREE.MeshBasicMaterial({ color: set.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.position.set(x, y, 0.8);
      this.root.add(ring);
      return { set, x, y, ring, timer: 0 };
    });
    if (!celebrate) return;
    for (const { set, x, y } of found) {
      if (had.has(set.id)) continue;
      this.particles?.burst(new THREE.Vector3(x, y, 0), { count: 60, colors: [set.color, '#ffffff'], speed: 160, up: 160, size: 2.2, glow: true, ring: 40 });
      this.play?.('legendary');
      this.onSetFormed?.(set);
    }
  }

  // --- Every frame -----------------------------------------------------------------------------------

  update(delta) {
    this.time += delta;
    for (const item of this.items) {
      item.bounce = Math.max(0, item.bounce - delta * 2.6);
      item.lift = item === this.held ? Math.min(1, item.lift + delta * 8) : Math.max(0, item.lift - delta * 8);
      // Dropped: a little bounce with a squash. Held: it floats and wobbles.
      const bounce = Math.abs(Math.sin(item.bounce * Math.PI * 2)) * item.bounce * 12;
      const squash = 1 - Math.sin(item.bounce * Math.PI * 3) * 0.12 * item.bounce;
      item.model.position.set(item.x, item.y, bounce + item.lift * (10 + Math.sin(this.time * 6) * 2));
      item.model.rotation.set(Math.sin(this.time * 9) * 0.06 * item.lift, 0, item.r);
      item.model.scale.set(1 / Math.sqrt(squash), 1 / Math.sqrt(squash), squash);
      item.model.userData.animate?.(this.time + item.x * 0.01, this.night);
      if (item.model.userData.glow) item.model.userData.glow.visible = this.night;
    }
    if (this.held && this.editing) {
      const ok = this.inside(this.held);
      this.marker.visible = this.held.model.visible;
      this.marker.position.set(this.held.x, this.held.y, 1);
      this.marker.material.color.set(ok ? '#7ed957' : '#ff4a3a');
    } else {
      this.marker.visible = false;
    }
    const selected = this.editing && this.selected && this.selected !== this.held;
    this.selection.visible = Boolean(selected);
    if (selected) {
      this.selection.position.set(this.selected.x, this.selected.y, 1);
      this.selection.scale.setScalar(1 + 0.06 * Math.sin(this.time * 5));
    }
    this.boundary.material.opacity = 0.25 + 0.1 * Math.sin(this.time * 2);
    // Sets: a glowing ring and their own little show.
    for (const fx of this.setFx) {
      fx.ring.material.opacity = 0.16 + 0.08 * Math.sin(this.time * 2 + fx.x);
      const look = SET_EFFECTS[fx.set.effect];
      if (!look || !this.particles || (fx.timer -= delta) > 0) continue;
      fx.timer = look.every;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * look.spread;
      this.particles.burst(new THREE.Vector3(fx.x + Math.cos(angle) * r, fx.y + Math.sin(angle) * r, 0), {
        count: look.count, colors: look.colors, speed: 12, up: look.up, gravity: look.gravity, size: look.size, height: look.height, glow: look.glow, life: look.life ?? 1, ring: look.ring ?? 0,
      });
    }
  }
}
