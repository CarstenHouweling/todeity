import { notePending } from './CloudSave.js';
import { meta, saveMeta } from './Meta.js';

/**
 * Achievements: each one pays out Golden Leaves for Tode's Pantry (`reward`: a few for the easy ones, a lot for the
 * hard ones), and many unlock a keepsake. Stored with the rest of the meta progress; the server checks each one
 * against the run it came with (`earned()` in server/saves.js).
 */
export const ACHIEVEMENTS = [
  // Ascension
  { id: 'awakened', icon: '✨', name: 'Awakening', text: 'Reach Awakened Tode.', reward: 5 },
  { id: 'golden', icon: '🌟', name: 'Golden Frog', text: 'Become Golden Tode.', reward: 8 },
  { id: 'radiant', icon: '⚡', name: 'Radiance', text: 'Become Radiant Tode.', reward: 12 },
  { id: 'god', icon: '👑', name: 'God of Tea', text: 'Ascend to God of Tea.', reward: 25 },
  { id: 'infinite', icon: '🌌', name: 'Beyond Godhood', text: 'Become Omnitode.', reward: 40 },
  // Bosses
  { id: 'queen', icon: '🐝', name: 'Queen Slayer', text: 'Defeat Queen Buzzbelle.', reward: 8 },
  { id: 'shogun', icon: '⚔️', name: 'Blade Breaker', text: 'Defeat the Hornet Shogun.', reward: 12 },
  { id: 'seraph', icon: '😇', name: 'Fallen Halo', text: 'Defeat the Seraph Queen.', reward: 18 },
  { id: 'empress', icon: '☕', name: 'Empress Down', text: 'Defeat the Empress of the hive.', reward: 30 },
  { id: 'beezebub', icon: '😈', name: 'Perfectly Steeped', text: 'Banish Bee-zebub from the Underworld and finish your tea.', reward: 60 },
  { id: 'flawless', icon: '🎯', name: 'Flawless', text: 'Defeat a boss without losing a heart.', reward: 30 },
  { id: 'breaker', icon: '🔨', name: 'Ritual Breaker', text: "Break a boss's ritual before it completes.", reward: 12 },
  // Fighting
  { id: 'combo50', icon: '🔥', name: 'Tea-pocalypse', text: 'Reach a 50 kill combo.', reward: 8 },
  { id: 'combo150', icon: '🌋', name: 'Boiling Over', text: 'Reach a 150 kill combo.', reward: 30 },
  { id: 'kills1000', icon: '🪦', name: 'Exterminator', text: 'Defeat 1,000 bees in one run.', reward: 25 },
  { id: 'elites', icon: '💥', name: 'Elite Hunter', text: 'Defeat 50 elite bees (over all your runs).', reward: 15 },
  { id: 'untouchable', icon: '🛡️', name: 'Untouchable', text: 'Clear 3 waves in a row from wave 5 on without losing a heart.', reward: 25 },
  { id: 'lightfeet', icon: '🩰', name: 'Light Feet', text: 'Get through a whole arena past the garden without stepping on a cursed tile.', reward: 20 },
  { id: 'whisker', icon: '💔', name: 'By a Whisker', text: 'Clear a wave with a single heart left.', reward: 8 },
  // Builds
  { id: 'duo', icon: '🤝', name: 'Better Together', text: 'Take a Duo brew.', reward: 8 },
  { id: 'legendary', icon: '💎', name: 'Legendary Leaf', text: 'Take a Legendary brew.', reward: 10 },
  { id: 'legendary2', icon: '👑', name: 'Living Legend', text: 'Take two Legendary brews in one run.', reward: 30 },
  { id: 'skills3', icon: '🌀', name: 'Bag of Tricks', text: 'Know three skills in one run.', reward: 5 },
  { id: 'skills6', icon: '🎒', name: 'Full Kit', text: 'Fill all six skill slots in one run.', reward: 20 },
  { id: 'mastery', icon: '📈', name: 'Mastery', text: 'Raise a skill to level 5.', reward: 15 },
  { id: 'charms', icon: '🧿', name: 'Trinket Hoarder', text: 'Carry 12 charms at once.', reward: 15 },
  { id: 'level25', icon: '🎓', name: 'Tea Scholar', text: 'Reach level 25 in one run.', reward: 25 },
  // Depth and Steeping
  { id: 'wave30', icon: '♾️', name: 'Bottomless Cup', text: 'Reach wave 30 in endless mode.', reward: 50 },
  { id: 'steep5', icon: '🌶️', name: 'Hot Water', text: 'Defeat the Hornet Shogun at Steep 5 or higher.', reward: 25 },
  { id: 'steep12', icon: '🌋', name: 'Scalding', text: 'Defeat the Empress at Steep 12 or higher.', reward: 60 },
  // Ways to play
  { id: 'shrines', icon: '⛩️', name: 'Pilgrim', text: 'Use 4 shrines in one run.', reward: 12 },
  { id: 'bitter', icon: '🍋', name: 'Acquired Taste', text: "Survive a Bitter Shrine's wave.", reward: 10 },
  { id: 'coop', icon: '👥', name: 'Pond Party', text: 'Defeat a boss in co-op.', reward: 15 },
  { id: 'daily', icon: '📅', name: 'Daily Brewer', text: 'Reach wave 10 in a Daily Brew.', reward: 15 },
  { id: 'photo', icon: '📸', name: 'Say Cheese', text: 'Take a photo.', reward: 3 },
  // Gardens (v0.24)
  { id: 'tower', icon: '🗼', name: 'Frog Tower', text: 'Be part of a tower of three frogs in a garden.', reward: 10 },
  { id: 'party', icon: '🎉', name: 'Garden Party', text: 'Set off on a co-op run from a garden party.', reward: 12 },
  { id: 'openhouse', icon: '🏡', name: 'Open House', text: 'Have three visitors in your garden at once.', reward: 15 },
  { id: 'coop4', icon: '🐸', name: 'Full Pond', text: 'Defeat a boss in a co-op run of four frogs.', reward: 20 },
];

export const rewardFor = (id) => ACHIEVEMENTS.find((a) => a.id === id)?.reward ?? 0;

meta.achievements ??= [];

export const isUnlocked = (id) => meta.achievements.includes(id);

/** Unlocks an achievement once; returns it when it is new (to show a toast), otherwise null. */
export function unlock(id) {
  if (isUnlocked(id)) return null;
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  if (!achievement) return null;
  meta.achievements.push(id);
  meta.leaves += achievement.reward;
  notePending(id, achievement.reward); // the server confirms it with the next run report
  saveMeta();
  return achievement;
}
