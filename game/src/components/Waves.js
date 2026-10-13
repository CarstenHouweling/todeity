/** Every BOSS_EVERY-th wave is a boss wave: Queen Buzzbelle, and the Empress from the final wave on. */
export const BOSS_EVERY = 5;
export const FINAL_WAVE = 20;

export function waveConfig(wave) {
  const isBoss = wave % BOSS_EVERY === 0;
  return {
    wave,
    isBoss,
    boss: wave >= FINAL_WAVE ? 'empress' : 'queen',
    count: isBoss ? 4 + wave : Math.min(60, 5 + Math.round(wave * 2.6)),
    // Bees toughen up faster later on, to keep pace with a powered-up Tode.
    hpScale: 1 + 0.15 * (wave - 1) + 0.014 * (wave - 1) ** 2,
    speedScale: Math.min(1.45, 1 + 0.035 * (wave - 1)),
    spawnInterval: Math.max(0.3, 1.5 - wave * 0.09),
    weights: {
      drone: 1,
      zipper: wave >= 2 ? 0.6 : 0,
      brute: wave >= 3 ? 0.3 : 0,
      stinger: wave >= 4 ? 0.4 : 0,
    },
  };
}

/** The bees of a wave in spawn order. */
export function buildSpawnQueue(config) {
  const entries = Object.entries(config.weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const queue = [];
  for (let i = 0; i < config.count; i++) {
    let roll = Math.random() * total;
    const [kind] = entries.find(([, weight]) => (roll -= weight) < 0) ?? entries[0];
    queue.push(kind);
  }
  return queue;
}
