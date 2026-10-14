import { meta, saveMeta } from './Meta.js';

/** Achievements: each one pays out Golden Leaves for Tode's Pantry. Stored with the rest of the meta progress. */
export const ACHIEVEMENT_REWARD = 15;

export const ACHIEVEMENTS = [
  { id: 'awakened', icon: '✨', name: 'Awakening', text: 'Reach Awakened Tode.' },
  { id: 'golden', icon: '🌟', name: 'Golden Frog', text: 'Become Golden Tode.' },
  { id: 'radiant', icon: '⚡', name: 'Radiance', text: 'Become Radiant Tode.' },
  { id: 'god', icon: '👑', name: 'God of Tea', text: 'Ascend to God of Tea.' },
  { id: 'infinite', icon: '🌌', name: 'Beyond Godhood', text: 'Become Infinite Tode.' },
  { id: 'queen', icon: '🐝', name: 'Queen Slayer', text: 'Defeat Queen Buzzbelle.' },
  { id: 'empress', icon: '☕', name: 'Empress Down', text: 'Defeat the Empress of the hive.' },
  { id: 'beezebub', icon: '😈', name: 'Perfectly Steeped', text: 'Banish Bee-zebub from the Underworld and finish your tea.' },
  { id: 'combo50', icon: '🔥', name: 'Tea-pocalypse', text: 'Reach a 50 kill combo.' },
  { id: 'duo', icon: '🤝', name: 'Better Together', text: 'Take a Duo brew.' },
  { id: 'legendary', icon: '💎', name: 'Legendary Leaf', text: 'Take a Legendary brew.' },
  { id: 'skills3', icon: '🌀', name: 'Bag of Tricks', text: 'Know three skills in one run.' },
  { id: 'untouchable', icon: '🛡️', name: 'Untouchable', text: 'Clear wave 5 or later without getting hit.' },
  { id: 'elites', icon: '💥', name: 'Elite Hunter', text: 'Defeat 10 elite bees.' },
  { id: 'coop', icon: '👥', name: 'Pond Party', text: 'Clear a wave in co-op.' },
  { id: 'daily', icon: '📅', name: 'Daily Brewer', text: 'Reach wave 5 in a Daily Brew.' },
  { id: 'photo', icon: '📸', name: 'Say Cheese', text: 'Take a photo.' },
];

meta.achievements ??= [];

export const isUnlocked = (id) => meta.achievements.includes(id);

/** Unlocks an achievement once; returns it when it is new (to show a toast), otherwise null. */
export function unlock(id) {
  if (isUnlocked(id)) return null;
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  if (!achievement) return null;
  meta.achievements.push(id);
  meta.leaves += ACHIEVEMENT_REWARD;
  saveMeta();
  return achievement;
}
