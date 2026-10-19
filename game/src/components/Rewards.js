/**
 * Reasons to come back: a **daily gift** (once per UTC day; a streak of days pays more and gives trinkets on days 3
 * and 7), the **tea kettle** (it brews a reward every few hours), the **champion's medal** (the day after topping the
 * Daily Brew board: leaves and a chance at a champion's trinket or wearable) and **trinkets**: little ornaments Tode collects and
 * places in his garden on the title screen. Some trinkets come from milestones (runs, bosses, achievements), some from
 * gifts and the kettle. The account level sums up how much someone has played.
 *
 * Shared by the game and the server (server/saves.js pays the rewards), so no three.js here. `progress` is the cloud
 * save's progress object (see Meta.js `meta` for the local copy).
 */

export const KETTLE_HOURS = 4;
const HOUR = 3_600_000;

// Day 1…7 of a streak, then it starts over at day 1 (still counting the streak).
export const STREAK_GIFTS = [
  { leaves: 15 },
  { leaves: 20 },
  { leaves: 25, trinket: true },
  { leaves: 35 },
  { leaves: 45 },
  { leaves: 60 },
  { leaves: 100, trinket: true },
];

// `source`: 'milestone' (unlocked by `unlock(progress)`), 'gift' (daily streak) or 'kettle' (a chance per brew).
export const TRINKETS = [
  { id: 'lantern', name: 'Stone Lantern', icon: '🏮', source: 'milestone', how: 'Play your first run', unlock: (p) => p.runs >= 1 },
  { id: 'teapot', name: 'Teapot Statue', icon: '🫖', source: 'milestone', how: 'Play 10 runs', unlock: (p) => p.runs >= 10 },
  { id: 'mushrooms', name: 'Fairy Ring', icon: '🍄', source: 'milestone', how: 'Play 25 runs', unlock: (p) => p.runs >= 25 },
  { id: 'hive', name: "Queen's Hive", icon: '🍯', source: 'milestone', how: 'Defeat Queen Buzzbelle', unlock: (p) => has(p, 'queen') || p.bossKills >= 1 },
  { id: 'helm', name: "Shogun's Helm", icon: '🪖', source: 'milestone', how: 'Defeat the Hornet Shogun', unlock: (p) => has(p, 'shogun') },
  { id: 'feather', name: 'Seraph Feather', icon: '🪶', source: 'milestone', how: 'Defeat the Seraph Queen', unlock: (p) => has(p, 'seraph') },
  { id: 'crown', name: "Empress's Crown", icon: '👑', source: 'milestone', how: 'Defeat the Empress', unlock: (p) => has(p, 'empress') },
  { id: 'horns', name: 'Horns of Bee-zebub', icon: '😈', source: 'milestone', how: 'Defeat Bee-zebub', unlock: (p) => has(p, 'beezebub') || p.victories >= 1 },
  { id: 'idol', name: 'Golden Tode Idol', icon: '🗿', source: 'milestone', how: 'Become the God of Tea', unlock: (p) => p.maxTier >= 4 },
  { id: 'banner', name: 'Hero Banner', icon: '🎏', source: 'milestone', how: 'Reach wave 15', unlock: (p) => p.bestWave >= 15 },
  { id: 'bonsai', name: 'Bonsai Tree', icon: '🌳', source: 'milestone', how: 'Earn 10 achievements', unlock: (p) => (p.achievements?.length ?? 0) >= 10 },
  { id: 'fountain', name: 'Lily Fountain', icon: '⛲', source: 'milestone', how: 'Earn 25 achievements', unlock: (p) => (p.achievements?.length ?? 0) >= 25 },
  { id: 'gnome', name: 'Frog Gnome', icon: '🐸', source: 'gift', how: 'A daily gift (day 3 or 7)' },
  { id: 'chimes', name: 'Wind Chimes', icon: '🎐', source: 'gift', how: 'A daily gift (day 3 or 7)' },
  { id: 'trophy', name: 'Golden Kettle', icon: '🏆', source: 'gift', how: 'A daily gift (day 3 or 7)' },
  { id: 'tulips', name: 'Tulip Pot', icon: '🌷', source: 'gift', how: 'A daily gift (day 3 or 7)' },
  { id: 'bench', name: 'Garden Bench', icon: '🪑', source: 'gift', how: 'A daily gift (day 3 or 7)' },
  { id: 'cups', name: 'Teacup Tower', icon: '☕', source: 'kettle', how: 'Brewed by the tea kettle' },
  { id: 'jar', name: 'Firefly Jar', icon: '🫙', source: 'kettle', how: 'Brewed by the tea kettle' },
  { id: 'crystal', name: 'Tea Crystal', icon: '💎', source: 'kettle', how: 'Brewed by the tea kettle' },
  { id: 'duck', name: 'Pond Duck', icon: '🦆', source: 'kettle', how: 'Brewed by the tea kettle' },
  { id: 'snail', name: 'Snail Buddy', icon: '🐌', source: 'kettle', how: 'Brewed by the tea kettle' },
  { id: 'scarebee', name: 'Scare-bee', icon: '🎃', source: 'kettle', how: 'Brewed by the tea kettle' },
  // The Daily Brew's champions (v0.31): a chance in the medal's reward.
  { id: 'podium', name: "Champion's Podium", icon: '🥇', source: 'champion', how: 'Win a Daily Brew (a chance in the medal)' },
  { id: 'fireworks', name: 'Firework Crate', icon: '🎆', source: 'champion', how: 'Win a Daily Brew (a chance in the medal)' },
  // The playground (v0.24): things to play with together in a garden.
  { id: 'trampoline', name: 'Lily Pad Trampoline', icon: '🤸', source: 'milestone', how: 'Play your first run', unlock: (p) => p.runs >= 1, play: 'Bounce on it' },
  { id: 'ball', name: 'Tea Ball', icon: '⚪', source: 'milestone', how: 'Play 2 runs', unlock: (p) => p.runs >= 2, play: 'Hop into it to kick it' },
  { id: 'launcher', name: 'Teapot Cannon', icon: '💨', source: 'milestone', how: 'Defeat a boss', unlock: (p) => p.bossKills >= 1, play: 'Hop in: it fires you across the garden' },
  { id: 'stage', name: 'Little Stage', icon: '🎤', source: 'milestone', how: 'Earn 5 achievements', unlock: (p) => (p.achievements?.length ?? 0) >= 5, play: 'Stand on it and emote' },
];
export const trinketById = (id) => TRINKETS.find((t) => t.id === id);
const KETTLE_TRINKET_CHANCE = 0.3;
// The champion's medal: leaves, then a chance at a champion's trinket and one at a champion's wearable (Wearables.js
// `unlock: { champion }`, kept in `progress.wearables`). With all of them collected it gives any trinket still missing.
export const MEDAL = { leaves: [60, 100], trinket: 0.5, wearable: 0.4, extra: 25, days: 7 };
export const CHAMPION_WEARABLES = ['laurel', 'sash', 'confetti'];
export const MAX_DECOR = 40;
export const DECOR_RADIUS = 240; // how far from Tode trinkets may stand

const has = (progress, achievement) => progress.achievements?.includes(achievement);

/** UTC day key of a time in ms. */
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const previous = (key) => dayKey(Date.parse(`${key}T12:00:00Z`) - 86_400_000);

/** Fills in the reward fields an older save doesn't have yet. */
export function withRewards(progress) {
  progress.streak ??= { day: null, count: 0 };
  progress.kettleAt ??= 0;
  progress.kettles ??= 0;
  progress.trinkets ??= [];
  progress.decor ??= [];
  progress.medals ??= []; // the Daily Brew days whose champion's medal was claimed
  progress.wearables ??= []; // wearables given as rewards (the rest unlock from the progress)
  return progress;
}

/** Every trinket this save owns: the ones it was given plus the milestones it has reached. */
export function ownedTrinkets(progress) {
  const owned = new Set(progress.trinkets ?? []);
  for (const trinket of TRINKETS) if (trinket.unlock?.(progress)) owned.add(trinket.id);
  return [...owned];
}

/** The daily gift: { ready, day (1–7 of the cycle it would pay), streak (days in a row it would make) }. */
export function giftStatus(progress, now) {
  const today = dayKey(now);
  const { day, count } = progress.streak ?? { day: null, count: 0 };
  const ready = day !== today;
  const streak = ready ? (day === previous(today) ? count + 1 : 1) : count;
  const nextIn = Date.parse(`${today}T00:00:00Z`) + 86_400_000 - now;
  return { ready, streak, day: ((streak - 1) % STREAK_GIFTS.length) + 1, nextIn };
}

export function kettleStatus(progress, now) {
  const nextIn = Math.max(0, (progress.kettleAt ?? 0) + KETTLE_HOURS * HOUR - now);
  return { ready: nextIn === 0, nextIn };
}

function giveTrinket(progress, source, random) {
  const owned = new Set(ownedTrinkets(progress));
  const sources = [source].flat();
  const pool = TRINKETS.filter((t) => sources.includes(t.source) && !owned.has(t.id));
  if (!pool.length) return null;
  const trinket = pool[Math.floor(random() * pool.length)];
  progress.trinkets.push(trinket.id);
  return trinket.id;
}

/** Claims today's gift. Returns { leaves, trinket, streak, day } or an error string. */
export function claimGift(progress, now, random = Math.random) {
  withRewards(progress);
  const status = giftStatus(progress, now);
  if (!status.ready) return 'Come back tomorrow for the next gift.';
  const gift = STREAK_GIFTS[status.day - 1];
  progress.streak = { day: dayKey(now), count: status.streak };
  let leaves = gift.leaves;
  const trinket = gift.trinket ? giveTrinket(progress, 'gift', random) : null;
  if (gift.trinket && !trinket) leaves += 30; // every gift trinket collected already
  progress.leaves += leaves;
  return { leaves, trinket, streak: status.streak, day: status.day };
}

/** Pours the kettle. Returns { leaves, trinket } or an error string. */
export function claimKettle(progress, now, random = Math.random) {
  withRewards(progress);
  if (!kettleStatus(progress, now).ready) return 'The kettle is still brewing.';
  progress.kettleAt = now;
  progress.kettles++;
  const leaves = 8 + Math.floor(random() * 10);
  const trinket = random() < KETTLE_TRINKET_CHANCE ? giveTrinket(progress, 'kettle', random) : null;
  progress.leaves += leaves;
  return { leaves, trinket };
}

/**
 * The champion's medal for topping the Daily Brew board on `date` (the server works out who won; see saves.js).
 * Returns { leaves, trinket, wearable, date } or an error string.
 */
export function claimMedal(progress, date, random = Math.random) {
  withRewards(progress);
  if (!date) return "No champion's medal is waiting for you.";
  if (progress.medals.includes(date)) return 'That medal is already yours.';
  progress.medals = [...progress.medals, date].slice(-30);
  let leaves = MEDAL.leaves[0] + Math.floor(random() * (MEDAL.leaves[1] - MEDAL.leaves[0] + 1));
  let trinket = null;
  if (random() < MEDAL.trinket) {
    trinket = giveTrinket(progress, 'champion', random) ?? giveTrinket(progress, ['gift', 'kettle'], random);
    if (!trinket) leaves += MEDAL.extra;
  }
  let wearable = null;
  if (random() < MEDAL.wearable) {
    const pool = CHAMPION_WEARABLES.filter((id) => !progress.wearables.includes(id));
    if (pool.length) {
      wearable = pool[Math.floor(random() * pool.length)];
      progress.wearables.push(wearable);
    } else leaves += MEDAL.extra;
  }
  progress.leaves += leaves;
  return { leaves, trinket, wearable, date };
}

/** Only owned trinkets, at most MAX_DECOR, positions rounded and kept near Tode. */
export function cleanDecor(list, progress) {
  if (!Array.isArray(list)) return [];
  const owned = new Set(ownedTrinkets(progress));
  const clamp = (v) => Math.max(-DECOR_RADIUS, Math.min(DECOR_RADIUS, Math.round(Number(v) || 0)));
  return list
    .filter((item) => item && owned.has(item.id))
    .slice(0, MAX_DECOR)
    .map((item) => ({ id: String(item.id), x: clamp(item.x), y: clamp(item.y), r: Math.round((Number(item.r) || 0) * 100) / 100 }));
}

// --- Account level ------------------------------------------------------------------
const RANKS = [
  [1, 'Tadpole'],
  [3, 'Pond Hopper'],
  [6, 'Leaf Brewer'],
  [10, 'Tea Adept'],
  [15, 'Kettle Master'],
  [20, 'Tea Sage'],
  [30, 'Todeity'],
];

// --- Garden music: the owner picks a song for their garden, and everyone in it hears it ------------------------
// `level`: the account level that unlocks it; `achievement`: an achievement that does. The songs are in Music.js.
export const GARDEN_SONGS = [
  { id: 'garden', name: 'Morning Brew', icon: '🌅' },
  { id: 'lantern', name: 'Lantern Night', icon: '🏮', level: 3 },
  { id: 'koi', name: 'Koi Pond', icon: '🎏', level: 6 },
  { id: 'ceremony', name: 'Tea Ceremony', icon: '🍵', level: 10 },
  { id: 'groove', name: 'Garden Groove', icon: '🕺', level: 15 },
  { id: 'celestial', name: 'Celestial Steep', icon: '🌌', level: 20 },
  { id: 'infernal', name: 'Infernal Waltz', icon: '😈', achievement: 'beezebub' },
];
export const gardenSong = (id) => GARDEN_SONGS.find((song) => song.id === id) ?? GARDEN_SONGS[0];

/** Whether a save's progress has unlocked garden song `id`. */
export function songUnlocked(id, progress) {
  const song = GARDEN_SONGS.find((s) => s.id === id);
  if (!song) return false;
  if (song.achievement) return Boolean(progress.achievements?.includes(song.achievement));
  return accountLevel(progress).level >= (song.level ?? 1);
}

/** How a song unlocks, for the song list. */
export const songHint = (song) => (song.achievement ? 'Beat Bee-zebub' : `Reach level ${song.level}`);

const LEVEL_XP = 150;
const LEVEL_CURVE = 1.4;

/** A level's rank as a number, 0 (Tadpole) to 6 (Todeity): garden auras grow with it (GardenAuras.js). */
export const rankTier = (level) => Math.max(0, RANKS.findLastIndex(([at]) => level >= at));

/** How much someone has played: { level, rank, progress (0–1 to the next level), xp }. */
export function accountLevel(progress) {
  // Playing again counts most (runs, bosses, victories); one-off milestones (achievements, the best wave) a little.
  // Until v0.27.1 one full run reached level 5–6 and 19 runs only level 10–11: it barely moved after the first.
  const xp =
    (progress.runs ?? 0) * 60 +
    (progress.bossKills ?? 0) * 50 +
    (progress.victories ?? 0) * 200 +
    (progress.achievements?.length ?? 0) * 15 +
    (progress.bestWave ?? 0) * 5 +
    (progress.streak?.count ?? 0) * 10 +
    (progress.kettles ?? 0) * 5;
  // Level n needs LEVEL_XP·(n−1)^LEVEL_CURVE xp: a first full run ~4, 19 runs ~14, 40 runs ~24, Todeity ~55 runs.
  const level = Math.floor((xp / LEVEL_XP) ** (1 / LEVEL_CURVE)) + 1;
  const from = LEVEL_XP * (level - 1) ** LEVEL_CURVE;
  const to = LEVEL_XP * level ** LEVEL_CURVE;
  const rank = RANKS.filter(([at]) => level >= at).pop()[1];
  return { level, rank, xp, progress: (xp - from) / (to - from) };
}

// --- Sets and beauty: trinkets placed close together form a display (looks only, no gameplay) ---------------------
export const SET_RADIUS = 120; // every part of a set within this distance of the set's middle
export const SETS = [
  { id: 'teaparty', name: 'Tea Party', icon: '🍵', parts: ['teapot', 'cups', 'bench'], beauty: 60, color: '#fff2e0', effect: 'steam' },
  { id: 'victory', name: 'Hall of Victory', icon: '🏆', parts: ['hive', 'helm', 'feather', 'crown', 'horns'], beauty: 150, color: '#ffd36b', effect: 'sparkle' },
  { id: 'glade', name: 'Fairy Glade', icon: '✨', parts: ['mushrooms', 'crystal', 'jar'], beauty: 70, color: '#c58aff', effect: 'fireflies' },
  { id: 'pond', name: 'Pond Friends', icon: '🦆', parts: ['duck', 'snail', 'fountain'], beauty: 60, color: '#7fd8ff', effect: 'ripples' },
  { id: 'zen', name: 'Zen Corner', icon: '🎐', parts: ['bonsai', 'lantern', 'chimes'], beauty: 60, color: '#ff9ec7', effect: 'petals' },
  { id: 'guardians', name: 'Garden Guardians', icon: '🐸', parts: ['gnome', 'scarebee', 'tulips'], beauty: 50, color: '#7ed957', effect: 'leaves' },
  { id: 'glory', name: 'Hall of Glory', icon: '🗿', parts: ['idol', 'banner', 'trophy'], beauty: 80, color: '#fff2a0', effect: 'beam' },
  { id: 'playground', name: 'Playground', icon: '🎪', parts: ['trampoline', 'ball', 'launcher', 'stage'], beauty: 90, color: '#ff9ec7', effect: 'confetti' },
  { id: 'champions', name: "Champion's Corner", icon: '🏅', parts: ['podium', 'fireworks', 'trophy'], beauty: 100, color: '#ffd36b', effect: 'confetti' },
];
const BEAUTY = { milestone: 15, gift: 20, kettle: 12, champion: 30 };

/** The sets a garden shows: [{ set, x, y }] (the middle of its parts). */
export function gardenSets(decor = []) {
  const at = new Map(decor.map((item) => [item.id, item]));
  const found = [];
  for (const set of SETS) {
    const parts = set.parts.map((id) => at.get(id));
    if (parts.some((part) => !part)) continue;
    const x = parts.reduce((sum, p) => sum + p.x, 0) / parts.length;
    const y = parts.reduce((sum, p) => sum + p.y, 0) / parts.length;
    if (parts.every((p) => Math.hypot(p.x - x, p.y - y) <= SET_RADIUS)) found.push({ set, x, y });
  }
  return found;
}

/** How lovely a garden is: every placed trinket counts, a finished set much more. */
export function gardenBeauty(decor = []) {
  const trinkets = decor.reduce((sum, item) => sum + (BEAUTY[trinketById(item.id)?.source] ?? 0), 0);
  return trinkets + gardenSets(decor).reduce((sum, { set }) => sum + set.beauty, 0);
}

/** Which set a trinket belongs to. */
export const setOf = (id) => SETS.find((set) => set.parts.includes(id));
