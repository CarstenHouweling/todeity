// Touch controls for phones and tablets: a floating joystick on the left half of the screen
// and action buttons on the right. Tode aims and spits on his own in touch mode (see main.js).

const JOYSTICK_RADIUS = 60; // px the knob can travel

export const isTouchDevice = () =>
  window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = isTouchDevice();
    if (!this.enabled) return;
    document.body.classList.add('touch');

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.innerHTML = `
      <div class="touch-stick-zone"><div class="touch-stick"><div class="touch-knob"></div></div></div>
      <div class="touch-buttons">
        <button class="touch-button" data-code="KeyR" data-role="ultimate">✨</button>
        <button class="touch-button" data-code="Space">💥</button>
        <button class="touch-button big" data-code="ShiftLeft">💨</button>
      </div>`;
    document.body.append(this.root);
    this.zone = this.root.querySelector('.touch-stick-zone');
    this.stick = this.root.querySelector('.touch-stick');
    this.knob = this.root.querySelector('.touch-knob');
    this.ultimateButton = this.root.querySelector('[data-role="ultimate"]');
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };

    this.zone.addEventListener('pointerdown', (event) => this.start(event));
    window.addEventListener('pointermove', (event) => this.move(event));
    window.addEventListener('pointerup', (event) => this.end(event));
    window.addEventListener('pointercancel', (event) => this.end(event));

    for (const button of this.root.querySelectorAll('.touch-button')) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        input.pressed.add(button.dataset.code);
        button.classList.add('pressed');
      });
      button.addEventListener('pointerup', () => button.classList.remove('pressed'));
      button.addEventListener('pointerleave', () => button.classList.remove('pressed'));
    }
  }

  start(event) {
    if (this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.origin = { x: event.clientX, y: event.clientY };
    this.stick.style.left = `${event.clientX}px`;
    this.stick.style.top = `${event.clientY}px`;
    this.stick.classList.add('active');
    this.move(event);
  }

  move(event) {
    if (event.pointerId !== this.pointerId) return;
    let dx = event.clientX - this.origin.x;
    let dy = event.clientY - this.origin.y;
    const length = Math.hypot(dx, dy);
    if (length > JOYSTICK_RADIUS) {
      dx = (dx / length) * JOYSTICK_RADIUS;
      dy = (dy / length) * JOYSTICK_RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen up is negative y; the game wants x right, y up.
    const strength = Math.min(1, length / JOYSTICK_RADIUS);
    if (length < 8) this.input.touchAxis.set(0, 0);
    else this.input.touchAxis.set(dx, -dy).normalize().multiplyScalar(strength > 0.35 ? 1 : strength / 0.35);
  }

  end(event) {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.input.touchAxis.set(0, 0);
    this.knob.style.transform = '';
    this.stick.classList.remove('active');
  }

  /** Shows the controls only while playing; glows the ultimate button when it's charged. */
  update(playing, ultimateReady, hasUltimate) {
    if (!this.enabled) return;
    this.root.hidden = !playing;
    this.ultimateButton.hidden = !hasUltimate;
    this.ultimateButton.classList.toggle('ready', ultimateReady);
  }
}
