// Fullscreen on and off, with the prefixed API that Safari on iPad still needs.

const root = document.documentElement;

/** False where the page can't go fullscreen (iPhone Safari, some embedded browsers). */
export const canFullscreen = () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);

/** Started from the Home Screen as an app: no browser bars at all. */
export const isStandalone = () =>
  window.navigator.standalone === true || Boolean(window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches);

/**
 * iPhone Safari can't make a page fullscreen (only videos); Add to Home Screen is the way to play without its bars.
 * True there (and not when it already runs from the Home Screen). iPads report themselves as Macs and have the API.
 */
export const needsHomeScreen = () => !canFullscreen() && /iPhone|iPod/.test(navigator.userAgent) && !isStandalone();

export function toggleFullscreen() {
  const request = isFullscreen()
    ? (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)
    : (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root, { navigationUI: 'hide' });
  // Older Safari returns nothing instead of a promise; a refusal (no user gesture) is harmless.
  request?.catch?.(() => {});
}

/** Whether the browser can turn the game sideways by itself (Android: fullscreen plus an orientation lock). */
export const canLockLandscape = () => canFullscreen() && typeof screen.orientation?.lock === 'function' && !/iPhone|iPad|iPod/.test(navigator.userAgent);

/** Fullscreen, turned to landscape (from a tap). Resolves to whether it worked; leaving fullscreen unlocks it. */
export async function landscapeFullscreen() {
  try {
    if (!isFullscreen()) await (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root, { navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/** Calls `listener` whenever fullscreen is entered or left (also with Esc or the browser's own controls). */
export function onFullscreenChange(listener) {
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener);
}
