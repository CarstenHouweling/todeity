/**
 * Daily challenge randomness. During a Daily Brew, `seeded(fn)` runs `fn` with Math.random replaced
 * by the day's seeded generator, so wave composition, weather and brew offers are the same for
 * everyone who makes the same choices. Everything else (particles, aim wobble…) stays random.
 */

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let dailyRandom = null;

export const todayKey = () => new Date().toISOString().slice(0, 10);

/** A number derived from today's date (UTC), the same for every player. */
export function dailySeed(key = todayKey()) {
  let hash = 2166136261;
  for (const char of `todeity-${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function startDaily(seed = dailySeed()) {
  dailyRandom = mulberry32(seed);
}

export function stopDaily() {
  dailyRandom = null;
}

export const isDaily = () => dailyRandom !== null;

export function seeded(fn) {
  if (!dailyRandom) return fn();
  const native = Math.random;
  Math.random = dailyRandom;
  try {
    return fn();
  } finally {
    Math.random = native;
  }
}
