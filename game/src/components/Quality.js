/**
 * Graphics quality. The player picks Auto, High or Low (pause menu, title screen); main.js applies a **step**:
 *
 *   0 everything · 1 no bloom · 2 no multisampling, and no post-processing between screen effects ("lite")
 *   3 no shadows · 4 Low: also the lowest resolutions, fewer particles, plain character materials and no arena
 *     floor shaders or floating motes
 *
 * Auto starts at 0 (or at 4 on a device that looks weak) and steps down while the frame rate stays low (see
 * `adaptQuality` in main.js), lowering the resolution in between. Steps never come back during a session, so the
 * quality settles instead of see-sawing.
 */
export const GRAPHICS = ['auto', 'high', 'low'];
export const GRAPHICS_LABELS = { auto: 'Auto', high: 'High', low: 'Low' };
export const LOW_STEP = 4;

/** What a step turns on. `maxRatio` / `minRatio`: the bounds for the adaptive resolution. */
export function stepFeatures(step) {
  return {
    bloom: step < 1,
    msaa: step < 2,
    lite: step >= 2,
    shadows: step < 3,
    particles: step >= LOW_STEP ? 0.45 : 1,
    arenaFx: step < LOW_STEP,
    plainCharacters: step >= LOW_STEP,
    shadowSize: step >= 2 ? 1024 : 2048, // the sun's shadow map: a quarter of the pixels to draw and sample
    maxRatio: step >= LOW_STEP ? 1 : 1.5,
    minRatio: step >= LOW_STEP ? 0.5 : 0.6,
  };
}

// Mobile GPUs that struggle with bloom and multisampling at phone resolutions.
const WEAK_GPUS = /Mali-(4\d\d|T\d+|G(31|51|52|57|68))|Adreno \(TM\) ([3-5]\d\d|6[0-1]\d)|PowerVR|Apple A(8|9|10|11)\b|Intel\(R\) HD Graphics [2-5]\d{2,3}\b/i;

function gpuName(gl) {
  try {
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  } catch {
    return '';
  }
}

/** A guess whether this device should start on Low: little memory, few cores on a phone, an old GPU, a tiny screen. */
export function looksWeak(gl) {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return true;
  if (touch && nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) return true;
  if (touch && Math.min(screen.width, screen.height) <= 360) return true;
  return WEAK_GPUS.test(gpuName(gl));
}

/** The step a setting starts at. */
export function startStep(setting, gl) {
  if (setting === 'low') return LOW_STEP;
  if (setting === 'high') return 0;
  return looksWeak(gl) ? LOW_STEP : 0;
}
