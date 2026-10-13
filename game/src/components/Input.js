import * as THREE from 'three';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
]);

/** Keyboard + mouse state. `pressed` holds one-shot presses for the current frame. */
export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.pressed = new Set();
    this.pointer = new THREE.Vector2(); // normalized device coordinates
    this.primaryDown = false;

    window.addEventListener('keydown', (event) => {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.held.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.held.delete(event.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.primaryDown = false;
    });

    window.addEventListener('pointermove', (event) => {
      this.pointer.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 0) this.primaryDown = true;
      if (event.button === 2) this.pressed.add('MouseRight');
      if (event.button === 1) {
        event.preventDefault(); // no auto-scroll
        this.pressed.add('MouseMiddle');
      }
    });
    window.addEventListener('pointerup', (event) => {
      if (event.button === 0) this.primaryDown = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  isHeld(...codes) {
    return codes.some((code) => this.held.has(code));
  }

  wasPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  /** Movement stick from WASD / arrows: x = screen right, y = screen up, length 0 or 1. */
  moveAxis(target) {
    const x = (this.isHeld('KeyD', 'ArrowRight') ? 1 : 0) - (this.isHeld('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.isHeld('KeyW', 'ArrowUp') ? 1 : 0) - (this.isHeld('KeyS', 'ArrowDown') ? 1 : 0);
    target.set(x, y);
    if (x || y) target.normalize();
    return target;
  }

  endFrame() {
    this.pressed.clear();
  }
}
