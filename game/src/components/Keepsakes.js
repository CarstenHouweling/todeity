import { meta, saveMeta } from './Meta.js';
import { ACHIEVEMENTS, isUnlocked } from './Achievements.js';

/**
 * Keepsakes: one trinket Tode carries into every run, chosen on the title screen. New ones unlock with
 * the harder achievements, so mastering the game opens up new ways to start a run.
 * `apply(run)` gets { stats, player, grant } where `grant` holds hooks for the special effects (see main.js).
 */
export const KEEPSAKES = [
  {
    id: 'teacup', icon: '🍵', name: 'Cracked Teacup', text: '+1 max heart.',
    apply: ({ stats }) => (stats.maxHp += 1),
  },
  {
    id: 'whisk', icon: '🎋', name: 'Bamboo Whisk', unlock: 'mastery', text: 'Start the run with a skill pick.',
    apply: ({ grant }) => grant.level(),
  },
  {
    id: 'coal', icon: '🔥', name: 'Ember Coal', unlock: 'shogun', text: 'Spit sets bees on fire (1 damage per second).',
    apply: ({ stats }) => (stats.spitBurn = Math.max(stats.spitBurn, 1)),
  },
  {
    id: 'scarf', icon: '🧣', name: "Granny's Scarf", unlock: 'untouchable', text: 'A petal shield blocks one hit. It regrows after 18 s.',
    apply: ({ stats }) => (stats.shieldEvery = stats.shieldEvery ? Math.min(stats.shieldEvery, 18) : 18),
  },
  {
    id: 'honeyjar', icon: '🍯', name: 'Honey Jar', unlock: 'level25', text: 'Tea leaves are worth 30% more: level up faster.',
    apply: ({ stats }) => (stats.leafValue *= 1.3),
  },
  {
    id: 'feather', icon: '🪶', name: 'Storm Feather', unlock: 'combo150', text: 'Every 6th spit is a bolt of chain lightning.',
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
    id: 'goldleaf', icon: '🪙', name: 'Golden Leaf', unlock: 'legendary2', text: '+50% Golden Leaves from runs, but 1 heart fewer.',
    apply: ({ stats, grant }) => {
      stats.maxHp -= 1;
      grant.leaves(1.5);
    },
  },
  {
    id: 'root', icon: '🥀', name: 'Bitter Root', unlock: 'flawless', text: '+30% damage, but 2 hearts fewer.',
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
    id: 'teapot', icon: '🫖', name: "Grandma's Teapot", unlock: 'beezebub', text: 'Start the run Awakened.',
    apply: ({ grant }) => grant.awaken(),
  },
  // v0.24
  {
    id: 'bandana', icon: '🎀', name: 'Silk Bandana', unlock: 'coop', text: 'Move 15% faster.',
    apply: ({ stats }) => (stats.moveSpeed *= 1.15),
  },
  {
    id: 'lilypad', icon: '🪷', name: 'Spare Lily Pad', unlock: 'whisker', text: 'Once per run, rise again with 2 hearts (on top of the Pantry\'s).',
    apply: ({ stats }) => (stats.revives += 1),
  },
  {
    id: 'scroll', icon: '📜', name: 'Old Scroll', unlock: 'skills6', text: 'Start the run with a random skill at level 2.',
    apply: ({ grant }) => grant.skill(2),
  },
  {
    id: 'thermos', icon: '🧋', name: 'Hot Thermos', unlock: 'daily', text: 'One more tea bomb, and bombs recharge 25% faster.',
    apply: ({ stats }) => {
      stats.bombCharges += 1;
      stats.splashCooldown *= 0.75;
    },
  },
  {
    id: 'compass', icon: '🧭', name: 'Garden Compass', unlock: 'tower', text: 'Tea leaves fly to you from 50% farther and are worth 15% more.',
    apply: ({ stats }) => {
      stats.magnet *= 1.5;
      stats.leafValue *= 1.15;
    },
  },
  {
    id: 'bell', icon: '🔔', name: 'Party Bell', unlock: 'party', text: 'In co-op, +10% damage for every other frog in the run.',
    apply: ({ grant }) => grant.teamDamage(0.1),
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
