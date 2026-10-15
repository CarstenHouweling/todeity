/**
 * Daily Brew twists: every day the Daily Brew gets its own rules, the same for everyone. A day rolls one or two
 * **trials** (harder: they raise the score and Golden Leaves) and one or two **boons** (fun help). Saturdays are
 * Feast Days (two boons), Sundays Trial Days (two trials). The server imports this to pay the right leaves, so it
 * must not import three.js.
 */
import { dailySeed, mulberry32 } from './Random.js';

// `reward`: score and Golden Leaves multiplier.
export const TRIALS = {
  glass: { name: 'Glass Cannon', icon: '💥', text: 'Double damage, but only 2 hearts', reward: 1.6 },
  swarm: { name: 'The Great Swarm', icon: '🐝', text: '60% more bees in every wave', reward: 1.5 },
  frenzy: { name: 'Frenzied Hive', icon: '😡', text: 'Every wave is a Frenzy: bees fly 25% faster', reward: 1.4 },
  elites: { name: 'Royal Guard', icon: '💀', text: 'Elite bees from wave 1, three times as many', reward: 1.5 },
  stingers: { name: 'Stinger Day', icon: '🎯', text: 'Stingers from wave 1, and twice as many of them', reward: 1.4 },
  iron: { name: 'Iron Hive', icon: '🛡️', text: 'Bees are 60% tougher', reward: 1.5 },
  cursed: { name: 'Cursed Ground', icon: '☠️', text: 'Cursed tiles from wave 1, half again as many', reward: 1.4 },
  bitter: { name: 'Bitter Tea', icon: '🥀', text: 'No healing of any kind', reward: 1.6 },
  royal: { name: 'Royal Wrath', icon: '👑', text: 'Bosses have 50% more health and attack faster', reward: 1.4 },
  night: { name: 'Eternal Night', icon: '🌙', text: 'Every wave is fought at night, and bees fly 15% faster', reward: 1.25 },
  storm: { name: 'Endless Storm', icon: '⛈️', text: 'Thunderstorms every wave, and meteors from wave 3', reward: 1.35 },
  lastlily: { name: 'Last Lily Pad', icon: '💔', text: 'One heart, but three lily pads bring you back', reward: 1.5 },
  vengeful: { name: 'Vengeful Day', icon: '💢', text: 'Every bee bursts into stingers when it dies', reward: 1.5 },
};

export const BOONS = {
  golden: { name: 'Golden Day', icon: '🌟', text: '+50% Golden Leaves', leaves: 1.5 },
  lucky: { name: 'Lucky Leaves', icon: '🍀', text: 'Rare, Epic and Legendary brews show up far more often' },
  wisdom: { name: 'Leafy Wisdom', icon: '🍃', text: 'Tea leaves are worth 60% more: skills come fast' },
  party: { name: 'Tea Party', icon: '🫖', text: 'Start with two random skills' },
  charms: { name: 'Charm Rain', icon: '🎲', text: 'Charms drop three times as often' },
  bigspit: { name: 'Mighty Spit', icon: '🟢', text: '+1 spit damage and 30% more spit range' },
  spring: { name: 'Spring Day', icon: '🦵', text: 'An extra hop dash and 15% more speed' },
  ultimate: { name: 'Early Ultimate', icon: '✨', text: 'Start with a random ultimate, fully charged' },
  awakened: { name: 'Blessed Start', icon: '😇', text: 'Start the run Awakened' },
  rerolls: { name: 'Second Steep', icon: '🔄', text: '+3 rerolls of the brew offers' },
  hearty: { name: 'Hearty Breakfast', icon: '🥞', text: '+3 max hearts' },
  bombs: { name: 'Kettle Overload', icon: '💣', text: 'An extra tea bomb, and bombs recharge 40% faster' },
};

// Trials that don't go together (both change the hearts).
const CLASHES = [['glass', 'lastlily']];

function pickFrom(random, pool, count, taken = []) {
  const chosen = [];
  const ids = Object.keys(pool);
  while (chosen.length < count) {
    const id = ids[Math.floor(random() * ids.length)];
    if (chosen.includes(id)) continue;
    if (CLASHES.some((pair) => pair.includes(id) && pair.some((other) => other !== id && [...chosen, ...taken].includes(other)))) continue;
    chosen.push(id);
  }
  return chosen;
}

/** The day's twists: { key, title, trials, boons, score, leaves } (multipliers for the score and Golden Leaves). */
export function dailyTwists(key) {
  const random = mulberry32(dailySeed(`twist-${key}`));
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  const trials = pickFrom(random, TRIALS, weekday === 0 ? 2 : 1);
  const boons = pickFrom(random, BOONS, weekday === 6 ? 2 : 1, trials);
  const score = trials.reduce((product, id) => product * TRIALS[id].reward, 1);
  const leaves = boons.reduce((product, id) => product * (BOONS[id].leaves ?? 1), score);
  const title = weekday === 0 ? 'Trial Day' : weekday === 6 ? 'Feast Day' : TRIALS[trials[0]].name;
  return { key, title, trials, boons, score, leaves };
}

/** The UTC date key a day before `key`. */
export function previousDay(key) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
