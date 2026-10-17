/**
 * The wardrobe: wearables a frog earns and shows off on the title screen, in gardens and in runs (`shownOutfit`).
 * One item per slot. Like emotes and garden songs they unlock from progress the server can work out itself
 * (achievements, account level, the best form), so only the chosen outfit is saved (`profile.outfit`, see
 * saves.js). The models are in WearableModels.js. No three.js here (the server imports it).
 *
 * `unlock`: { achievement } | { level } | { tier } (the best form reached); none: free.
 */
import { accountLevel } from './Rewards.js';
import { bestTier } from './Emotes.js';

export const SLOTS = [
  { id: 'head', name: 'Hats', icon: '🎩' },
  { id: 'face', name: 'Face', icon: '👓' },
  { id: 'body', name: 'Body', icon: '🧣' },
  { id: 'back', name: 'Back', icon: '🦋' },
  { id: 'aura', name: 'Aura', icon: '✨' },
];

export const WEARABLES = [
  // Hats
  { id: 'leafcap', slot: 'head', name: 'Leaf Cap', icon: '🍃' },
  { id: 'cosy', slot: 'head', name: 'Tea Cosy', icon: '🧶', unlock: { level: 3 } },
  { id: 'sunhat', slot: 'head', name: "Gardener's Sun Hat", icon: '👒', unlock: { level: 6 } },
  { id: 'tophat', slot: 'head', name: 'Top Hat', icon: '🎩', unlock: { level: 10 } },
  { id: 'partyhat', slot: 'head', name: 'Party Hat', icon: '🥳', unlock: { achievement: 'party' } },
  { id: 'kabuto', slot: 'head', name: 'Ronin Helm', icon: '🪖', unlock: { achievement: 'shogun' } },
  { id: 'halo', slot: 'head', name: 'Fallen Halo', icon: '😇', unlock: { achievement: 'seraph' } },
  { id: 'crown', slot: 'head', name: "Empress's Crown", icon: '👑', unlock: { achievement: 'empress' } },
  { id: 'horns', slot: 'head', name: 'Devil Horns', icon: '😈', unlock: { achievement: 'beezebub' } },
  // Face
  { id: 'specs', slot: 'face', name: 'Round Specs', icon: '👓' },
  { id: 'shades', slot: 'face', name: 'Cool Shades', icon: '😎', unlock: { level: 4 } },
  { id: 'stache', slot: 'face', name: 'Grand Moustache', icon: '🥸', unlock: { achievement: 'whisker' } },
  { id: 'monocle', slot: 'face', name: 'Monocle', icon: '🧐', unlock: { achievement: 'level25' } },
  { id: 'visor', slot: 'face', name: 'Star Visor', icon: '🤩', unlock: { achievement: 'combo150' } },
  // Body
  { id: 'scarf', slot: 'body', name: 'Cozy Scarf', icon: '🧣' },
  { id: 'bowtie', slot: 'body', name: 'Bow Tie', icon: '🎀', unlock: { achievement: 'photo' } },
  { id: 'leafmail', slot: 'body', name: 'Leaf Armor', icon: '🍂', unlock: { level: 8 } },
  { id: 'hunter', slot: 'body', name: "Hive Hunter's Armor", icon: '⚔️', unlock: { achievement: 'elites' } },
  { id: 'goldplate', slot: 'body', name: 'Golden Breastplate', icon: '🛡️', unlock: { tier: 2 } },
  // Back
  { id: 'cape', slot: 'back', name: 'Hero Cape', icon: '🦸', unlock: { level: 2 } },
  { id: 'teapack', slot: 'back', name: 'Teapot Backpack', icon: '🫖', unlock: { level: 5 } },
  { id: 'butterfly', slot: 'back', name: 'Butterfly Wings', icon: '🦋', unlock: { level: 12 } },
  { id: 'dragonfly', slot: 'back', name: 'Dragonfly Wings', icon: '🪶', unlock: { achievement: 'lightfeet' } },
  { id: 'royalcape', slot: 'back', name: 'Divine Mantle', icon: '🌟', unlock: { tier: 4 } },
  { id: 'batwings', slot: 'back', name: 'Infernal Wings', icon: '🦇', unlock: { achievement: 'steep12' } },
  // Auras
  { id: 'petals', slot: 'aura', name: 'Petal Drift', icon: '🌸', unlock: { level: 7 } },
  { id: 'fireflies', slot: 'aura', name: 'Fireflies', icon: '✨', unlock: { level: 15 } },
  { id: 'bubbles', slot: 'aura', name: 'Pond Bubbles', icon: '🫧', unlock: { achievement: 'coop' } },
  { id: 'snow', slot: 'aura', name: 'Snowfall', icon: '❄️', unlock: { achievement: 'daily' } },
  { id: 'embers', slot: 'aura', name: 'Embers', icon: '🔥', unlock: { achievement: 'steep5' } },
  { id: 'sparkle', slot: 'aura', name: 'Golden Sparkles', icon: '💫', unlock: { tier: 3 } },
  { id: 'stardust', slot: 'aura', name: 'Stardust', icon: '🌌', unlock: { tier: 5 } },
];

export const wearableById = (id) => WEARABLES.find((item) => item.id === id);

const FORMS = ['', 'Awakened', 'Golden', 'Radiant', 'God of Tea', 'Omnitode'];

/** Whether `progress` ({ achievements, maxTier, runs, … }) has unlocked a wearable. */
export function wearableUnlocked(item, progress = {}) {
  const unlock = item?.unlock;
  if (!item) return false;
  if (!unlock) return true;
  if (unlock.achievement) return Boolean(progress.achievements?.includes(unlock.achievement));
  if (unlock.tier) return bestTier(progress) >= unlock.tier;
  return accountLevel(progress).level >= unlock.level;
}

/** How a wearable unlocks, for the wardrobe (`achievementName` turns an id into its name). */
export function wearableHint(item, achievementName = (id) => id) {
  const unlock = item.unlock;
  if (!unlock) return 'Free';
  if (unlock.achievement) return `Achievement: ${achievementName(unlock.achievement)}`;
  if (unlock.tier) return `Become ${FORMS[unlock.tier]} Tode in a run`;
  return `Reach level ${unlock.level}`;
}

/**
 * A clean outfit { slot: id }: known items in their own slot only, and (with `progress`) only unlocked ones.
 * Without progress (another frog in a garden says what it wears) any known item is taken: it's looks only.
 */
export function cleanOutfit(outfit, progress = null) {
  const clean = {};
  if (!outfit || typeof outfit !== 'object') return clean;
  for (const slot of SLOTS) {
    const item = wearableById(outfit[slot.id]);
    if (item?.slot === slot.id && (!progress || wearableUnlocked(item, progress))) clean[slot.id] = item.id;
  }
  return clean;
}

/** From this form on the ascension's crest sits on the head (Ascension.js): a hat would poke through it. */
export const CREST_TIER = 2;

/**
 * What shows of an outfit right now: no hat under the crest (`tier` ≥ CREST_TIER), and in a `run` no aura (the
 * forms bring their own, and the screen is busy enough).
 */
export function shownOutfit(outfit, { tier = 0, run = false } = {}) {
  const shown = { ...outfit };
  if (tier >= CREST_TIER) delete shown.head;
  if (run) delete shown.aura;
  return shown;
}

/** The ids of every wearable `progress` has unlocked. */
export const unlockedWearables = (progress) => WEARABLES.filter((item) => wearableUnlocked(item, progress)).map((item) => item.id);
