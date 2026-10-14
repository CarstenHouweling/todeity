// Fullscreen on and off, with the prefixed API that Safari on iPad still needs.

const root = document.documentElement;

/** False where the page can't go fullscreen (iPhone Safari, some embedded browsers). */
export const canFullscreen = () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);

export function toggleFullscreen() {
  const request = isFullscreen()
    ? (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)
    : (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root, { navigationUI: 'hide' });
  // Older Safari returns nothing instead of a promise; a refusal (no user gesture) is harmless.
  request?.catch?.(() => {});
}

/** Calls `listener` whenever fullscreen is entered or left (also with Esc or the browser's own controls). */
export function onFullscreenChange(listener) {
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener);
}
