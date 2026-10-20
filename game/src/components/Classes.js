import { meta, saveMeta } from './Meta.js';
import { dailySeed } from './Random.js';

/**
 * Frog classes: who plays the run. Each one is a starting point on top of BASE_STATS (Player.js), with its own
 * frog (FrogModels.js), starting kit and sometimes a mechanic of its own (main.js reads the stats marked "class").
 * Brews, skills, charms, keepsakes and ascension work the same for every class.
 *
 * `apply({ stats, player, grant })` runs at the start of a run, before the Pantry and the keepsake; `grant` holds the
 * hooks for things that aren't stats (a skill, the ultimate). All classes are open; the Daily Brew picks one for
 * everybody (`classOfTheDay`).
 */
export const CLASSES = [
  {
    id: 'tode',
    icon: '🐸',
    name: 'Tode',
    title: 'The Classic',
    hearts: 5,
    short: 'Balanced spit, tea bombs and hop-dash.', // the class picker's card; `text` has the details
    text: 'Balanced: spit, tea bombs and a hop-dash. Where it all began.',
    apply: () => {},
  },
  {
    id: 'brawler',
    icon: '🥊',
    name: 'Bullfrog Brawler',
    title: 'The Wall',
    hearts: 8,
    short: 'Spinning axes that hit hard. Tough, but slow.',
    text: 'Hurls a pair of spinning axes: slower than spit, but each one hits three times as hard and cleaves through a bee. The hop-dash hits three times as hard and shoves bees away. Starts with Tongue Lash. Moves 15% slower.',
    apply: ({ stats, grant }) => {
      stats.maxHp = 8;
      stats.moveSpeed *= 0.85;
      stats.spitCount = 2;
      stats.spitSpread = 0.2;
      stats.spitDamage *= 3;
      stats.spitRange *= 0.75;
      stats.spitSpeed *= 0.85;
      stats.spitCooldown *= 1.9;
      stats.spitPierce += 1;
      stats.dashDamage *= 3;
      stats.dashKnockback = 2.2;
      stats.spitStyle = 'axe';
      grant.skill('tongue');
    },
  },
  {
    id: 'sharpshooter',
    icon: '🎯',
    name: 'Tree Frog Sharpshooter',
    title: 'The Eye',
    hearts: 4,
    short: 'Long, piercing spit for double damage. Fragile.',
    text: 'Spit flies 70% further and 50% faster, deals double damage, pierces two bees and crits 15% more often. Spits 60% slower.',
    apply: ({ stats }) => {
      stats.maxHp = 4;
      stats.spitRange *= 1.7;
      stats.spitSpeed *= 1.5;
      stats.spitDamage *= 2;
      stats.spitCooldown *= 1.6;
      stats.spitPierce += 2;
      stats.critChance += 0.15;
      stats.spitStyle = 'dart';
    },
  },
  {
    id: 'alchemist',
    icon: '⚗️',
    name: 'Toad Alchemist',
    title: 'The Brewer',
    hearts: 5,
    short: 'Lobs potions that splash whole crowds.',
    text: 'Lobs potions in an arc over the swarm: each shatters where it lands and splashes every bee around for double damage. Three tea bombs that recharge 30% faster and blast 20% wider, each with a random element: fire, frost or lightning. Starts with Sugar Mines.',
    apply: ({ stats, grant }) => {
      stats.bombCharges = 3;
      stats.splashCooldown *= 0.7;
      stats.splashRadius *= 1.2;
      stats.spitCooldown *= 1.6;
      stats.spitDamage *= 2;
      stats.spitSpeed *= 0.62;
      stats.bombElements = true;
      stats.spitStyle = 'potion';
      grant.skill('mines');
    },
  },
  {
    id: 'mage',
    icon: '🔮',
    name: 'Starleaf Mage',
    title: 'The Spark',
    hearts: 4,
    short: 'Homing fireballs that burn. Faster skills.',
    text: 'Spit becomes small homing fireballs that set bees alight. Skills recharge 25% faster. Starts with Ball Lightning.',
    apply: ({ stats, grant }) => {
      stats.maxHp = 4;
      stats.spitHoming = 1;
      stats.spitRange *= 1.2;
      stats.spitBurn += 1;
      stats.skillCooldown *= 0.75;
      stats.spitStyle = 'fireball';
      grant.skill('orb');
    },
  },
  {
    id: 'summoner',
    icon: '📜',
    name: 'Toad Summoner',
    title: 'The Caller',
    hearts: 5,
    short: 'Pond toads fight at his side.',
    text: 'Two little pond toads hop at his side and spit at bees (one more at level 8 and 16). His ultimate is always the giant Ancient Pond Toad, ready at half charge from the start, and it charges 30% faster. Spits 40% slower.',
    apply: ({ stats, grant }) => {
      stats.companions = 2;
      stats.spitCooldown *= 1.4;
      stats.gaugeRate += 0.3;
      grant.ultimate('summon', 50);
    },
  },
  {
    id: 'ninja',
    icon: '🥷',
    name: 'Ninja Toad',
    title: 'The Shadow',
    hearts: 5,
    short: 'Throwing stars, two dashes and a decoy log.',
    text: 'Throws spinning stars that hit twice as hard (but fly 60% less often) and pierce one bee, and crits 10% more often. Two dash charges: the hop-dash vanishes in smoke and leaves a decoy log that bees chase. Moves 10% faster.',
    apply: ({ stats }) => {
      stats.moveSpeed *= 1.1;
      stats.dashCharges = 2;
      stats.critChance += 0.1;
      // Whole numbers: hits round to whole damage, so a +20% on a 1-damage spit would do nothing.
      stats.spitDamage *= 2;
      stats.spitCooldown *= 1.6;
      stats.spitPierce += 1;
      stats.dashDecoy = true;
      stats.spitStyle = 'star';
    },
  },
];

export const classById = (id) => CLASSES.find((c) => c.id === id) ?? CLASSES[0];

/** The class this browser plays (all are open). */
export const chosenClass = () => classById(meta.frogClass);

export function chooseClass(id) {
  if (!CLASSES.some((c) => c.id === id)) return false;
  meta.frogClass = id;
  saveMeta();
  return true;
}

/** The Daily Brew's class: the same for everybody today, a different one most days. */
export const classOfTheDay = (key) => CLASSES[(dailySeed(key) >>> 3) % CLASSES.length];
