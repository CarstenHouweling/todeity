/**
 * Every BOSS_EVERY-th wave is a boss wave: Queen Buzzbelle, the Empress at wave 20, and after her the fall into
 * the Underworld for the true finale against Bee-zebub (wave 21, and his boss waves in endless mode).
 */
export const BOSS_EVERY = 5;
export const FINAL_WAVE = 20; // the Empress
export const HELL_WAVE = 21; // Bee-zebub: beating him wins the run

// Endless mode: after Bee-zebub every boss comes back in turn, and everything keeps growing.
const ENDLESS_BOSSES = ['queen', 'shogun', 'seraph', 'empress', 'beezebub'];

export function waveConfig(wave) {
  const isBoss = wave % BOSS_EVERY === 0 || wave === HELL_WAVE;
  const late = Math.max(0, wave - 10); // past the first two arenas the swarm grows faster
  const endless = Math.max(0, wave - HELL_WAVE); // waves beyond the finale
  return {
    wave,
    isBoss,
    endless,
    // Every arena has its own boss; endless mode cycles through all of them.
    boss: endless
      ? ENDLESS_BOSSES[Math.floor(wave / BOSS_EVERY) % ENDLESS_BOSSES.length]
      : wave >= HELL_WAVE ? 'beezebub' : wave >= FINAL_WAVE ? 'empress' : wave === 15 ? 'seraph' : wave === 10 ? 'shogun' : 'queen',
    count: isBoss ? 4 + wave : Math.min(160, Math.round(6 + wave * 3 + late * late * 0.3 + endless * 4)),
    // Bees toughen up faster later on, to keep pace with a powered-up Tode; in endless mode 10% more every wave.
    hpScale: (1 + 0.2 * (wave - 1) + 0.024 * (wave - 1) ** 2) * 1.1 ** endless,
    speedScale: Math.min(1.45 + endless * 0.02, 1 + 0.035 * (wave - 1)),
    spawnInterval: Math.max(0.16, 1.5 - wave * 0.09 - endless * 0.01),
    // From the Tournament on, bees hit for an extra heart (and another every 10 endless waves).
    contactBonus: (wave >= 16 ? 1 : 0) + Math.floor(endless / 10),
    weights: {
      drone: 1,
      zipper: wave >= 2 ? 0.6 : 0,
      brute: wave >= 3 ? 0.3 + 0.02 * late : 0,
      // More and more of the swarm shoots: the screen fills with bullets.
      stinger: wave >= 4 ? 0.4 + 0.06 * late : 0,
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

/**
 * Wave modifiers, like the curses and artifacts of other roguelites: from wave 4 a wave may get one, more often
 * the deeper the run, and from wave 14 sometimes two.
 */
export const MODIFIERS = {
  frenzy: { name: 'Frenzy', icon: '😡', text: 'Bees fly 25% faster' },
  horde: { name: 'Horde', icon: '🐝', text: 'Half again as many bees' },
  elites: { name: 'Elite Surge', icon: '💀', text: 'Elite bees everywhere' },
  meteors: { name: 'Meteor Shower', icon: '☄️', text: 'Meteors rain down: watch the red circles' },
  vengeful: { name: 'Vengeful Swarm', icon: '💢', text: 'Bees burst into stingers when they die' },
  armored: { name: 'Armoured', icon: '🛡️', text: 'Bees are 50% tougher but drop twice the leaves' },
};

export function rollModifiers(wave, isBoss) {
  if (wave < 4) return [];
  // Endless: always two modifiers, three from wave 30.
  if (wave > HELL_WAVE) return Object.keys(MODIFIERS).sort(() => Math.random() - 0.5).slice(0, wave >= 30 ? 3 : 2);
  const chance = Math.min(0.85, 0.25 + wave * 0.03) * (isBoss ? 0.5 : 1);
  if (Math.random() > chance) return [];
  const pool = Object.keys(MODIFIERS).sort(() => Math.random() - 0.5);
  const count = wave >= 14 && Math.random() < 0.35 + (wave - 14) * 0.05 ? 2 : 1;
  return pool.slice(0, count);
}
