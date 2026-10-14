/**
 * The size of the screen the game draws on: the layout viewport, which the canvas and every fixed element fill.
 * `window.innerWidth` is the visual viewport instead: on phones it grows when the browser zooms out, and a canvas
 * sized from it made the page wider still, which kept the browser zoomed out and cut off the right side of menus.
 */
export const viewWidth = () => document.documentElement.clientWidth || window.innerWidth;
export const viewHeight = () => document.documentElement.clientHeight || window.innerHeight;
