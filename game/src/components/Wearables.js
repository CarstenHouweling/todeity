/**
 * The wardrobe: wearables a frog earns and shows off on the title screen, in gardens and in runs (`shownOutfit`).
 * One item per slot. Like emotes and garden songs they unlock from progress the server can work out itself
 * (achievements, account level, the best form), so only the chosen outfit is saved (`profile.outfit`, see
 * saves.js). The models are in WearableModels.js. No three.js here (the server imports it).
 *
 * `unlock`: { achievement } | { level } | { tier } (the best form reached) | { trinkets } (how many garden trinkets
 * are owned, `ownedTrinkets` in Rewards.js) | { champion } (a chance in the Daily Brew champion's medal, kept in
 * `progress.wearables`, see Rewards.js) | { season } (out while that season is on, Seasons.js; a run finished during
 * the season keeps it for good, `keepSeasonal`); none: free.
 */
import { accountLevel, ownedTrinkets } from './Rewards.js';
import { bestTier } from './Emotes.js';
import { seasonAt, seasonById, seasonOn } from './Seasons.js';

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
  { id: 'flowercrown', slot: 'head', name: 'Flower Crown', icon: '🌼', unlock: { achievement: 'duo' } },
  { id: 'lilypad', slot: 'head', name: 'Lily Pad Hat', icon: '🪷', unlock: { achievement: 'tower' } },
  { id: 'beehat', slot: 'head', name: "Beekeeper's Hat", icon: '🐝', unlock: { achievement: 'kills1000' } },
  { id: 'toque', slot: 'head', name: "Chef's Toque", icon: '👨‍🍳', unlock: { achievement: 'mastery' } },
  { id: 'antlers', slot: 'head', name: 'Antlers', icon: '🦌', unlock: { level: 20 } },
  { id: 'laurel', slot: 'head', name: "Champion's Laurel", icon: '🌿', unlock: { champion: true } },
  { id: 'acorn', slot: 'head', name: 'Acorn Cap', icon: '🌰', unlock: { achievement: 'skills3' } },
  { id: 'tricorn', slot: 'head', name: "Captain's Tricorn", icon: '⛵', unlock: { achievement: 'wave30' } },
  { id: 'teacup', slot: 'head', name: 'Teacup Hat', icon: '☕', unlock: { trinkets: 10 } },
  { id: 'witchhat', slot: 'head', name: 'Witch Hat', icon: '🧙', unlock: { season: 'halloween' } },
  { id: 'pumpkinhat', slot: 'head', name: "Jack-o'-Lantern", icon: '🎃', unlock: { season: 'halloween' } },
  // Face
  { id: 'specs', slot: 'face', name: 'Round Specs', icon: '👓' },
  { id: 'shades', slot: 'face', name: 'Cool Shades', icon: '😎', unlock: { level: 4 } },
  { id: 'stache', slot: 'face', name: 'Grand Moustache', icon: '🥸', unlock: { achievement: 'whisker' } },
  { id: 'monocle', slot: 'face', name: 'Monocle', icon: '🧐', unlock: { achievement: 'level25' } },
  { id: 'visor', slot: 'face', name: 'Star Visor', icon: '🤩', unlock: { achievement: 'combo150' } },
  { id: 'blush', slot: 'face', name: 'Rosy Cheeks', icon: '☺️' },
  { id: 'heartshades', slot: 'face', name: 'Heart Shades', icon: '😍', unlock: { achievement: 'openhouse' } },
  { id: 'eyepatch', slot: 'face', name: 'Eye Patch', icon: '🏴‍☠️', unlock: { achievement: 'untouchable' } },
  { id: 'goggles', slot: 'face', name: 'Flight Goggles', icon: '🥽', unlock: { achievement: 'breaker' } },
  { id: 'freckles', slot: 'face', name: 'Freckles', icon: '🟤', unlock: { trinkets: 5 } },
  { id: 'starglasses', slot: 'face', name: 'Star Glasses', icon: '⭐', unlock: { achievement: 'flawless' } },
  { id: 'mask', slot: 'face', name: 'Masquerade Mask', icon: '🎭', unlock: { level: 16 } },
  // Body
  { id: 'scarf', slot: 'body', name: 'Cozy Scarf', icon: '🧣' },
  { id: 'bowtie', slot: 'body', name: 'Bow Tie', icon: '🎀', unlock: { achievement: 'photo' } },
  { id: 'leafmail', slot: 'body', name: 'Leaf Armor', icon: '🍂', unlock: { level: 8 } },
  { id: 'hunter', slot: 'body', name: "Hive Hunter's Armor", icon: '⚔️', unlock: { achievement: 'elites' } },
  { id: 'goldplate', slot: 'body', name: 'Golden Breastplate', icon: '🛡️', unlock: { tier: 2 } },
  { id: 'medal', slot: 'body', name: "Hero's Medal", icon: '🏅', unlock: { achievement: 'queen' } },
  { id: 'lei', slot: 'body', name: 'Flower Lei', icon: '🌺', unlock: { achievement: 'shrines' } },
  { id: 'charmbelt', slot: 'body', name: 'Charm Belt', icon: '🧿', unlock: { achievement: 'charms' } },
  { id: 'apron', slot: 'body', name: 'Tea Apron', icon: '🍵', unlock: { level: 18 } },
  { id: 'sash', slot: 'body', name: "Champion's Sash", icon: '🎗️', unlock: { champion: true } },
  { id: 'bandana', slot: 'body', name: 'Bandana', icon: '🔴', unlock: { achievement: 'bitter' } },
  { id: 'vest', slot: 'body', name: "Gardener's Vest", icon: '🦺', unlock: { level: 14 } },
  { id: 'pearls', slot: 'body', name: 'Pond Pearls', icon: '📿', unlock: { trinkets: 15 } },
  // Back
  { id: 'cape', slot: 'back', name: 'Hero Cape', icon: '🦸', unlock: { level: 2 } },
  { id: 'teapack', slot: 'back', name: 'Teapot Backpack', icon: '🫖', unlock: { level: 5 } },
  { id: 'butterfly', slot: 'back', name: 'Butterfly Wings', icon: '🦋', unlock: { level: 12 } },
  { id: 'dragonfly', slot: 'back', name: 'Dragonfly Wings', icon: '🪶', unlock: { achievement: 'lightfeet' } },
  { id: 'royalcape', slot: 'back', name: 'Divine Mantle', icon: '🌟', unlock: { tier: 4 } },
  { id: 'batwings', slot: 'back', name: 'Infernal Wings', icon: '🦇', unlock: { achievement: 'steep12' } },
  { id: 'balloon', slot: 'back', name: 'Party Balloon', icon: '🎈', unlock: { achievement: 'coop4' } },
  { id: 'fairy', slot: 'back', name: 'Fairy Wings', icon: '🧚', unlock: { achievement: 'legendary' } },
  { id: 'jetpack', slot: 'back', name: 'Steam Jetpack', icon: '🚀', unlock: { achievement: 'combo50' } },
  { id: 'shell', slot: 'back', name: 'Snail Shell', icon: '🐚', unlock: { level: 25 } },
  { id: 'featherwings', slot: 'back', name: 'Feather Wings', icon: '🕊️', unlock: { tier: 1 } },
  { id: 'lanternpole', slot: 'back', name: 'Lantern Pole', icon: '🏮', unlock: { trinkets: 20 } },
  { id: 'koikite', slot: 'back', name: 'Koi Streamer', icon: '🎏', unlock: { level: 28 } },
  // Auras
  { id: 'petals', slot: 'aura', name: 'Petal Drift', icon: '🌸', unlock: { level: 7 } },
  { id: 'fireflies', slot: 'aura', name: 'Fireflies', icon: '✨', unlock: { level: 15 } },
  { id: 'bubbles', slot: 'aura', name: 'Pond Bubbles', icon: '🫧', unlock: { achievement: 'coop' } },
  { id: 'snow', slot: 'aura', name: 'Snowfall', icon: '❄️', unlock: { achievement: 'daily' } },
  { id: 'embers', slot: 'aura', name: 'Embers', icon: '🔥', unlock: { achievement: 'steep5' } },
  { id: 'sparkle', slot: 'aura', name: 'Golden Sparkles', icon: '💫', unlock: { tier: 3 } },
  { id: 'stardust', slot: 'aura', name: 'Stardust', icon: '🌌', unlock: { tier: 5 } },
  { id: 'hearts', slot: 'aura', name: 'Floating Hearts', icon: '💕', unlock: { achievement: 'legendary2' } },
  { id: 'sparks', slot: 'aura', name: 'Static Sparks', icon: '⚡', unlock: { achievement: 'skills6' } },
  { id: 'leaves', slot: 'aura', name: 'Falling Leaves', icon: '🍂', unlock: { level: 20 } },
  { id: 'notes', slot: 'aura', name: 'Music Notes', icon: '🎵', unlock: { level: 22 } },
  { id: 'rainbow', slot: 'aura', name: 'Rainbow Ring', icon: '🌈', unlock: { level: 30 } },
  { id: 'confetti', slot: 'aura', name: 'Victory Confetti', icon: '🎊', unlock: { champion: true } },
  { id: 'bees', slot: 'aura', name: 'Friendly Bees', icon: '🐝', unlock: { level: 26 } },
  { id: 'goldleaf', slot: 'aura', name: 'Golden Leaf Fall', icon: '🍁', unlock: { trinkets: 30 } },
  { id: 'butterflies', slot: 'aura', name: 'Butterflies', icon: '🦋', unlock: { trinkets: 35 } },
  { id: 'bats', slot: 'aura', name: 'Bat Swarm', icon: '🦇', unlock: { season: 'halloween' } },
];

export const wearableById = (id) => WEARABLES.find((item) => item.id === id);

const FORMS = ['', 'Awakened', 'Golden', 'Radiant', 'God of Tea', 'Omnitode'];

/** Whether `progress` ({ achievements, maxTier, runs, … }) has unlocked a wearable. */
export function wearableUnlocked(item, progress = {}) {
  const unlock = item?.unlock;
  if (!item) return false;
  if (!unlock) return true;
  if (unlock.champion) return Boolean(progress.wearables?.includes(item.id));
  if (unlock.season) return seasonOn(unlock.season) || Boolean(progress.wearables?.includes(item.id));
  if (unlock.achievement) return Boolean(progress.achievements?.includes(unlock.achievement));
  if (unlock.tier) return bestTier(progress) >= unlock.tier;
  if (unlock.trinkets) return ownedTrinkets(progress).length >= unlock.trinkets;
  return accountLevel(progress).level >= unlock.level;
}

/** How a wearable unlocks, for the wardrobe (`achievementName` turns an id into its name). */
export function wearableHint(item, achievementName = (id) => id, progress = {}) {
  const unlock = item.unlock;
  if (!unlock) return 'Free';
  if (unlock.champion) return 'Win a Daily Brew';
  if (unlock.season) {
    const season = seasonById(unlock.season);
    if (progress.wearables?.includes(item.id)) return `${season.icon} ${season.name} wardrobe: yours for good`;
    return seasonOn(season.id) ? `${season.icon} ${season.name}: finish a run by ${season.until} to keep it` : `${season.icon} Comes back every ${season.name}`;
  }
  if (unlock.achievement) return `Achievement: ${achievementName(unlock.achievement)}`;
  if (unlock.tier) return `Become ${FORMS[unlock.tier]} Tode in a run`;
  if (unlock.trinkets) return `Collect ${unlock.trinkets} garden trinkets`;
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

/**
 * What shows of an outfit right now: in a `run` no aura (the forms bring their own, and the screen is busy enough).
 * A worn hat stays on in every form: the form's crest (Ascension.js, from the Golden form) hides instead
 * (`ascension.hat`). Until v0.34.1 the hat came off under the crest, and the class's own hat (the Mage's, the Ninja's
 * hood) came back in its place: players saw their crown turn into the Mage hat mid-run.
 */
export function shownOutfit(outfit, { run = false } = {}) {
  const shown = { ...outfit };
  if (run) delete shown.aura;
  return shown;
}

/**
 * A run finished during a season keeps that season's wearables for good (in `progress.wearables`, like the champion's).
 * By the calendar at `ms`, so the server and the browser agree. Returns the ids it added.
 */
export function keepSeasonal(progress, ms = Date.now()) {
  const season = seasonAt(ms);
  if (!season) return [];
  progress.wearables ??= [];
  const fresh = WEARABLES.filter((item) => item.unlock?.season === season.id && !progress.wearables.includes(item.id)).map((item) => item.id);
  progress.wearables.push(...fresh);
  return fresh;
}

/** The ids of every wearable `progress` has unlocked. */
export const unlockedWearables = (progress) => WEARABLES.filter((item) => wearableUnlocked(item, progress)).map((item) => item.id);
