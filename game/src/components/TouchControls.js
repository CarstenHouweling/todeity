import { viewHeight, viewWidth } from './Viewport.js';

// Touch controls for phones and tablets: twin sticks (left half moves, right half aims) and action buttons on
// the right edge. Tode keeps spitting on his own in touch mode: where the right stick points, or at the nearest
// bee when it's let go (see main.js).

const STICK_RADIUS = 60; // px the knob can travel
const DEAD_ZONE = 8; // px before a stick counts as pushed
const REST_INSET = 130; // px from the bottom corner where an untouched stick waits

/** The screen's safe-area insets in pixels (the notch and the home bar; 0 elsewhere). */
let probe = null;
function safeInsets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.append(probe);
  }
  const style = getComputedStyle(probe);
  return { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
}

/** Phones and tablets: a coarse primary pointer, or touch without a hovering mouse. */
export const isTouchDevice = () =>
  window.matchMedia?.('(pointer: coarse)').matches ||
  (navigator.maxTouchPoints > 0 && !window.matchMedia?.('(hover: hover)').matches);

/** A floating thumbstick: it appears under the finger anywhere in its zone and waits in its corner otherwise. */
class Stick {
  constructor(parent, side, onChange) {
    this.side = side;
    this.onChange = onChange;
    this.vector = { x: 0, y: 0 }; // x right, y up, length 0–1
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };

    this.zone = document.createElement('div');
    this.zone.className = `touch-stick-zone ${side}`;
    this.base = document.createElement('div');
    this.base.className = `touch-stick ${side}`;
    this.base.innerHTML = `<div class="touch-knob"></div><span class="touch-stick-label">${side === 'left' ? 'move' : 'aim'}</span>`;
    this.knob = this.base.querySelector('.touch-knob');
    parent.append(this.zone, this.base);

    this.zone.addEventListener('pointerdown', (event) => this.start(event));
    window.addEventListener('pointermove', (event) => this.move(event));
    window.addEventListener('pointerup', (event) => this.end(event));
    window.addEventListener('pointercancel', (event) => this.end(event));
    window.addEventListener('resize', () => this.pointerId === null && this.rest());
    this.rest();
  }

  /** Back to its corner (clear of the iPhone's notch and home bar), so players can see where their thumbs go. */
  rest() {
    const safe = safeInsets();
    const x = this.side === 'left' ? REST_INSET + safe.left : viewWidth() - REST_INSET - safe.right;
    this.place(x, viewHeight() - REST_INSET - safe.bottom);
  }

  place(x, y) {
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
  }

  start(event) {
    if (this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.origin = { x: event.clientX, y: event.clientY };
    this.place(event.clientX, event.clientY);
    this.base.classList.add('active');
    this.move(event);
  }

  move(event) {
    if (event.pointerId !== this.pointerId) return;
    let dx = event.clientX - this.origin.x;
    let dy = event.clientY - this.origin.y;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) {
      dx = (dx / length) * STICK_RADIUS;
      dy = (dy / length) * STICK_RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (length < DEAD_ZONE) {
      this.vector = { x: 0, y: 0 };
    } else {
      // Full speed from a third of the way out; screen y points down, the game's y up.
      const strength = Math.min(1, length / STICK_RADIUS / 0.35);
      this.vector = { x: (dx / length) * strength, y: (-dy / length) * strength };
    }
    this.onChange(this.vector);
  }

  end(event) {
    if (event && event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.knob.style.transform = '';
    this.base.classList.remove('active');
    this.rest();
    this.onChange(this.vector);
  }
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.onEnable = () => {};
    if (isTouchDevice()) this.enable();
    else {
      // A touchscreen laptop or an iPad with a trackpad: switch over on the first real touch.
      const listener = (event) => {
        if (event.pointerType !== 'touch') return;
        window.removeEventListener('pointerdown', listener, true);
        this.enable();
      };
      window.addEventListener('pointerdown', listener, true);
    }
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
    const { input } = this;

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    document.body.append(this.root);
    this.moveStick = new Stick(this.root, 'left', (v) => input.touchAxis.set(v.x, v.y));
    this.aimStick = new Stick(this.root, 'right', (v) => {
      if (v.x || v.y) input.aimAxis.set(v.x, v.y).normalize();
      input.aiming = Boolean(v.x || v.y);
    });

    // (The row runs right to left: the first button is the one on the right.)
    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';
    buttons.innerHTML = `
      <button class="touch-button" data-code="KeyE" data-role="ultimate">✨</button>
      <button class="touch-button big" data-code="ShiftLeft" data-role="dash">💨</button>
      <button class="touch-button boop" data-code="KeyB" data-role="boop" aria-label="Boop" hidden>🥊</button>`;
    this.root.append(buttons);
    this.ultimateButton = buttons.querySelector('[data-role="ultimate"]');
    this.dashButton = buttons.querySelector('[data-role="dash"]');
    this.boopButton = buttons.querySelector('[data-role="boop"]');
    for (const button of buttons.querySelectorAll('.touch-button')) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        input.pressed.add(button.dataset.code);
        button.classList.add('pressed');
      });
      button.addEventListener('pointerup', () => button.classList.remove('pressed'));
      button.addEventListener('pointerleave', () => button.classList.remove('pressed'));
    }
    this.onEnable();
  }

  /**
   * Shows the controls only while playing; glows the ultimate button when it's charged. `garden`: hopping around a
   * garden: only the move stick, a jump button and BOOP beside it (the right half of the screen turns the camera).
   */
  update(playing, ultimateReady, hasUltimate, garden = false) {
    if (!this.enabled) return;
    if (this.root.classList.contains('garden') !== garden) {
      this.root.classList.toggle('garden', garden);
      this.dashButton.textContent = garden ? '🦘' : '💨';
      this.boopButton.hidden = !garden; // boop the frog next to you, left of the jump button
      this.aimStick.end();
    }
    playing ||= garden;
    if (this.root.hidden === playing) {
      this.root.hidden = !playing;
      // Let go of both sticks when a menu or cut-scene takes over, so nothing stays pushed.
      if (!playing) {
        this.moveStick.end();
        this.aimStick.end();
      }
    }
    this.ultimateButton.hidden = !hasUltimate;
    this.ultimateButton.classList.toggle('ready', ultimateReady);
  }
}
