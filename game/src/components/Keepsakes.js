import { meta, saveMeta } from './Meta.js';
import { ACHIEVEMENTS, isUnlocked } from './Achievements.js';

/**
 * Keepsakes: one trinket Tode carries into every run, chosen on the title screen. New ones unlock with
 * achievements, so every achievement opens up a new way to start a run.
 * `apply(run)` gets { stats, player, grant } where `grant` holds hooks for the special effects (see main.js).
 */
export const KEEPSAKES = [
  {
    id: 'teacup', icon: '🍵', name: 'Cracked Teacup', text: '+1 max heart.',
    apply: ({ stats }) => (stats.maxHp += 1),
  },
  {
    id: 'whisk', icon: '🎋', name: 'Bamboo Whisk', unlock: 'awakened', text: 'Start the run with a skill pick.',
    apply: ({ grant }) => grant.level(),
  },
  {
    id: 'coal', icon: '🔥', name: 'Ember Coal', unlock: 'queen', text: 'Spit sets bees on fire (1 damage per second).',
    apply: ({ stats }) => (stats.spitBurn = Math.max(stats.spitBurn, 1)),
  },
  {
    id: 'scarf', icon: '🧣', name: "Granny's Scarf", unlock: 'untouchable', text: 'A petal shield blocks one hit. It regrows after 18 s.',
    apply: ({ stats }) => (stats.shieldEvery = stats.shieldEvery ? Math.min(stats.shieldEvery, 18) : 18),
  },
  {
    id: 'honeyjar', icon: '🍯', name: 'Honey Jar', unlock: 'skills3', text: 'Tea leaves are worth 30% more: level up faster.',
    apply: ({ stats }) => (stats.leafValue *= 1.3),
  },
  {
    id: 'feather', icon: '🪶', name: 'Storm Feather', unlock: 'combo50', text: 'Every 6th spit is a bolt of chain lightning.',
    apply: ({ stats }) => (stats.boltEvery = stats.boltEvery ? Math.min(stats.boltEvery, 6) : 6),
  },
  {
    id: 'clover', icon: '🍀', name: 'Four-Leaf Clover', unlock: 'elites', text: 'Start with a random charm. Charms drop half again as often.',
    apply: ({ grant }) => {
      grant.charmLuck(1.5);
      grant.charm();
    },
  },
  {
    id: 'goldleaf', icon: '🪙', name: 'Golden Leaf', unlock: 'duo', text: '+50% Golden Leaves from runs, but 1 heart fewer.',
    apply: ({ stats, grant }) => {
      stats.maxHp -= 1;
      grant.leaves(1.5);
    },
  },
  {
    id: 'root', icon: '🥀', name: 'Bitter Root', unlock: 'legendary', text: '+30% damage, but 2 hearts fewer.',
    apply: ({ stats }) => {
      stats.maxHp -= 2;
      stats.damageMultiplier *= 1.3;
    },
  },
  {
    id: 'crown', icon: '👑', name: 'Tiny Crown', unlock: 'empress', text: 'Your ultimate charges 40% faster and starts full.',
    apply: ({ stats, grant }) => {
      stats.gaugeRate *= 1.4;
      grant.fullGauge();
    },
  },
  {
    id: 'teapot', icon: '🫖', name: "Grandma's Teapot", unlock: 'god', text: 'Start the run Awakened.',
    apply: ({ grant }) => grant.awaken(),
  },
];

export const isKeepsakeUnlocked = (keepsake) => !keepsake.unlock || isUnlocked(keepsake.unlock);

/** The keepsake Tode carries (falls back to the teacup if the saved one is unknown or locked). */
export function currentKeepsake() {
  const chosen = KEEPSAKES.find((k) => k.id === meta.keepsake);
  return chosen && isKeepsakeUnlocked(chosen) ? chosen : KEEPSAKES[0];
}

export function chooseKeepsake(id) {
  const keepsake = KEEPSAKES.find((k) => k.id === id);
  if (!keepsake || !isKeepsakeUnlocked(keepsake)) return false;
  meta.keepsake = id;
  saveMeta();
  return true;
}

/** The keepsake an achievement unlocks, if any. */
export const keepsakeFor = (achievementId) => KEEPSAKES.find((k) => k.unlock === achievementId) ?? null;

/** How to unlock a keepsake, for the locked cards. */
export function unlockHint(keepsake) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === keepsake.unlock);
  return achievement ? `${achievement.icon} ${achievement.text}` : '';
}
