import * as THREE from 'three';
import { buildTrinket, disposeTrinket } from './TrinketModels.js';
import { DECOR_RADIUS, MAX_DECOR, trinketById } from './Rewards.js';

/**
 * The trinkets placed around Tode on the title screen, and the "My garden" mode that places them: pick one from the
 * tray, it follows the pointer over the lawn, click to set it down; click a placed one to pick it up again; turn it
 * with the ↻ button or R. Placements live in `meta.decor` ([{ id, x, y, r }]); `onChange(decor)` saves them.
 */
export class TitleGarden {
  constructor({ scene, camera, canvas }) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.items = []; // { id, x, y, r, model }
    this.decorating = false;
    this.held = null; // the item following the pointer
    this.onChange = null;
    this.onSelect = null; // tells the tray which trinket is held
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.hit = new THREE.Vector3();
    this.time = 0;
    // A ring under the held trinket: green where it can go, red outside the garden.
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(16, 20, 32),
      new THREE.MeshBasicMaterial({ color: '#7ed957', transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.marker.position.z = 1;
    this.marker.visible = false;
    this.root.add(this.marker);
    this.boundary = new THREE.Mesh(
      new THREE.RingGeometry(DECOR_RADIUS - 2, DECOR_RADIUS + 2, 96),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.boundary.position.z = 0.8;
    this.boundary.visible = false;
    this.root.add(this.boundary);

    canvas.addEventListener('pointermove', (event) => this.move(event));
    canvas.addEventListener('pointerdown', (event) => this.click(event));
  }

  /** Builds the placed trinkets from saved decor. */
  load(decor = []) {
    for (const item of this.items) disposeTrinket(item.model);
    this.items = [];
    this.held = null;
    for (const { id, x, y, r } of decor) if (trinketById(id)) this.add(id, x, y, r);
  }

  add(id, x, y, r = 0) {
    const model = buildTrinket(id);
    model.position.set(x, y, 0);
    model.rotation.z = r;
    this.root.add(model);
    const item = { id, x, y, r, model };
    this.items.push(item);
    return item;
  }

  decor() {
    return this.items.filter((item) => item !== this.held).map(({ id, x, y, r }) => ({ id, x: Math.round(x), y: Math.round(y), r: Math.round(r * 100) / 100 }));
  }

  placed(id) {
    return this.items.some((item) => item.id === id && item !== this.held);
  }

  /** New trinkets find a free spot in a ring around Tode by themselves. */
  autoPlace(ids) {
    let added = false;
    for (const id of ids) {
      if (this.items.some((item) => item.id === id) || this.items.length >= MAX_DECOR) continue;
      const spot = this.freeSpot();
      this.add(id, spot.x, spot.y, Math.random() * Math.PI * 2);
      added = true;
    }
    if (added) this.onChange?.(this.decor());
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

  setVisible(on) {
    this.root.visible = on;
  }

  start() {
    this.decorating = true;
    this.boundary.visible = true;
  }

  stop() {
    if (this.held) this.drop(true);
    this.decorating = false;
    this.boundary.visible = false;
    this.marker.visible = false;
  }

  /** Picks a trinket from the tray (or takes back the one already in the garden). */
  hold(id) {
    if (this.held) this.drop(true);
    const existing = this.items.find((item) => item.id === id);
    this.held = existing ?? this.add(id, this.hit.x, this.hit.y, 0);
    this.onSelect?.(id);
  }

  /** Sets the held trinket down where it is; `cancel` puts a fresh one back in the tray. */
  drop(cancel = false) {
    const item = this.held;
    if (!item) return;
    this.held = null;
    this.marker.visible = false;
    if (cancel && !this.inside(item)) this.remove(item);
    this.onSelect?.(null);
    this.onChange?.(this.decor());
  }

  remove(item) {
    disposeTrinket(item.model);
    this.items.splice(this.items.indexOf(item), 1);
  }

  /** Takes the held trinket off the lawn, back into the tray. */
  putAway() {
    if (!this.held) return;
    const item = this.held;
    this.held = null;
    this.remove(item);
    this.marker.visible = false;
    this.onSelect?.(null);
    this.onChange?.(this.decor());
  }

  turn() {
    if (this.held) this.held.r = (this.held.r + Math.PI / 4) % (Math.PI * 2);
  }

  inside(item) {
    return Math.hypot(item.x, item.y) <= DECOR_RADIUS && Math.hypot(item.x, item.y) > 30; // not on Tode himself
  }

  aim(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, this.hit);
  }

  move(event) {
    if (!this.decorating || !this.held || !this.aim(event)) return;
    this.held.x = this.hit.x;
    this.held.y = this.hit.y;
  }

  click(event) {
    if (!this.decorating || event.button > 0) return;
    if (!this.aim(event)) return;
    if (this.held) {
      this.held.x = this.hit.x;
      this.held.y = this.hit.y;
      if (this.inside(this.held)) this.drop();
      return;
    }
    // Pick up the trinket under the pointer.
    const models = this.items.map((item) => item.model);
    const [first] = this.raycaster.intersectObjects(models, true);
    let target = null;
    if (first) {
      let node = first.object;
      while (node && !node.userData.trinket) node = node.parent;
      target = this.items.find((item) => item.model === node);
    }
    target ??= this.items.find((item) => (item.x - this.hit.x) ** 2 + (item.y - this.hit.y) ** 2 < 22 ** 2);
    if (target) {
      this.held = target;
      this.onSelect?.(target.id);
    }
  }

  update(delta) {
    this.time += delta;
    for (const item of this.items) {
      item.model.position.set(item.x, item.y, item === this.held ? 6 + Math.sin(this.time * 6) * 2 : 0);
      item.model.rotation.z = item.r;
    }
    if (this.held) {
      const ok = this.inside(this.held);
      this.marker.visible = true;
      this.marker.position.set(this.held.x, this.held.y, 1);
      this.marker.material.color.set(ok ? '#7ed957' : '#ff4a3a');
    }
    this.boundary.material.opacity = 0.25 + 0.1 * Math.sin(this.time * 2);
  }
}
