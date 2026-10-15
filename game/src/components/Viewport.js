/**
 * The size of the screen the game draws on: the layout viewport, which the canvas and every fixed element fill.
 * `window.innerWidth` is the visual viewport instead: on phones it grows when the browser zooms out, and a canvas
 * sized from it made the page wider still, which kept the browser zoomed out and cut off the right side of menus.
 */
export const viewWidth = () => document.documentElement.clientWidth || window.innerWidth;
export const viewHeight = () => document.documentElement.clientHeight || window.innerHeight;

/**
 * Keeps the browser from zooming into the game. iPhone Safari ignores `user-scalable=no` (an accessibility choice),
 * so a quick double tap, or both thumbs on the sticks moving like a pinch, zoomed the page in and left it there.
 * `touch-action` in style.css stops most of it; this catches what Safari still lets through. The game's own pinch
 * (the garden camera) uses pointer events, which this leaves alone.
 */
export function blockBrowserZoom() {
  // Safari's pinch gesture events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });

  // Double tap: the second tap of a quick pair isn't allowed to zoom. Cancelling it also cancels its click, so a tap
  // that stayed in place clicks by hand (two quick taps on a button still count twice). Text fields keep theirs.
  let lastTap = -Infinity;
  let start = null;
  document.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches.length === 1 && event.touches[0];
      start = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchend',
    (event) => {
      const quick = event.timeStamp - lastTap < 400;
      lastTap = event.timeStamp;
      if (!quick || event.touches.length || event.changedTouches.length !== 1) return;
      const target = event.target;
      if (target.closest?.('input, textarea, select, [contenteditable]')) return;
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) < 10) target.click?.();
    },
    { passive: false }
  );
}
