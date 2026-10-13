/**
 * Brews: Tode's power-ups, inspired by the boons of Hades.
 * - Every brew belongs to a Blend (a tea with its own play style), like the Olympian gods.
 * - Brews roll a rarity; rarer brews have stronger values.
 * - Duo brews need brews from two Blends; Legendary brews need two brews from one Blend.
 *
 * `values` holds the [common, rare, epic] strength; `apply(player, value)` is called on every pick.
 */

export const BLENDS = {
  green: { name: 'Green Tea', color: '#7ed957', icon: '🍵', focus: 'Spit' },
  ember: { name: 'Ember Black', color: '#ff7a2f', icon: '🔥', focus: 'Tea bombs & fire' },
  mint: { name: 'Frost Mint', color: '#5fe3d0', icon: '🌿', focus: 'Speed & frost' },
  chamomile: { name: 'Chamomile', color: '#ffd84d', icon: '🌼', focus: 'Life' },
  storm: { name: 'Storm Oolong', color: '#a3a8ff', icon: '⚡', focus: 'Lightning' },
};

export const RARITIES = [
  { id: 'common', name: 'Common' },
  { id: 'rare', name: 'Rare' },
  { id: 'epic', name: 'Epic' },
];

const percent = (value) => `${Math.round(value * 100)}%`;

const BREWS = [
  // --- Green Tea: spit -------------------------------------------------------
  {
    id: 'gulp', blend: 'green', name: 'Big Gulp', icon: '💧', maxLevel: 5,
    values: [1, 2, 3],
    text: (v) => `Spit deals +${v} damage.`,
    apply: ({ stats }, v) => (stats.spitDamage += v),
  },
  {
    id: 'rapid', blend: 'green', name: 'Rapid Sips', icon: '🌱', maxLevel: 4,
    values: [0.15, 0.22, 0.3],
    text: (v) => `Spit ${percent(v)} faster.`,
    apply: ({ stats }, v) => (stats.spitCooldown *= 1 - v),
  },
  {
    id: 'triple', blend: 'green', name: 'Fan of Spit', icon: '🔱', maxLevel: 2,
    values: [2, 3, 4],
    text: (v) => `+${v} spit projectiles in a fan.`,
    apply: ({ stats }, v) => (stats.spitCount += v),
  },
  {
    id: 'pierce', blend: 'green', name: 'Steeped Shot', icon: '🎯', maxLevel: 3,
    values: [1, 2, 3],
    text: (v) => `Spit pierces through ${v} more bee${v > 1 ? 's' : ''}.`,
    apply: ({ stats }, v) => (stats.spitPierce += v),
  },
  {
    id: 'bubbles', blend: 'green', name: 'Bursting Bubbles', icon: '🫧', maxLevel: 3,
    values: [2, 3, 4],
    text: (v) => `Spit bursts on hit for ${v} damage around it.`,
    apply: ({ stats }, v) => (stats.spitBurst += v),
  },
  {
    id: 'longshot', blend: 'green', name: 'Long Slurp', icon: '🏹', maxLevel: 2,
    values: [0.25, 0.35, 0.5],
    text: (v) => `Spit flies ${percent(v)} further and faster.`,
    apply: ({ stats }, v) => {
      stats.spitRange *= 1 + v;
      stats.spitSpeed *= 1 + v;
    },
  },

  // --- Ember Black: tea bombs and fire --------------------------------------
  {
    id: 'boiling', blend: 'ember', name: 'Boiling Point', icon: '🌡️', maxLevel: 5,
    values: [2, 3, 5],
    text: (v) => `Tea bombs deal +${v} damage.`,
    apply: ({ stats }, v) => (stats.splashDamage += v),
  },
  {
    id: 'earlgrey', blend: 'ember', name: 'Earl Grey Wave', icon: '🫖', maxLevel: 3,
    values: [0.2, 0.3, 0.4],
    text: (v) => `Tea bomb blast radius +${percent(v)}.`,
    apply: ({ stats }, v) => (stats.splashRadius *= 1 + v),
  },
  {
    id: 'quicksteep', blend: 'ember', name: 'Quick Steep', icon: '⏱️', maxLevel: 3,
    values: [0.2, 0.28, 0.36],
    text: (v) => `Tea bombs recharge ${percent(v)} faster.`,
    apply: ({ stats }, v) => (stats.splashCooldown *= 1 - v),
  },
  {
    id: 'scorch', blend: 'ember', name: 'Scorching Tea', icon: '♨️', maxLevel: 3,
    values: [1, 1.5, 2],
    text: (v) => `Tea bombs set bees on fire: ${v} damage per second.`,
    apply: ({ stats }, v) => (stats.splashBurn += v),
  },
  {
    id: 'scald', blend: 'ember', name: 'Scalding Hop', icon: '☄️', maxLevel: 3,
    values: [2, 3, 5],
    text: (v) => `Dashing through bees burns them for ${v} damage.`,
    apply: ({ stats }, v) => (stats.dashDamage += v),
  },
  {
    id: 'kettle', blend: 'ember', name: 'Kettle Landing', icon: '💥', maxLevel: 3,
    values: [1, 1.5, 2],
    text: (v) => `Landing a dash releases a splash for ${Math.round(2 * v)} damage.`,
    apply: ({ stats }, v) => (stats.landingSplash += v),
  },
  {
    id: 'innerfire', blend: 'ember', name: 'Inner Fire', icon: '🌟', maxLevel: 3, needsUltimate: true,
    values: [0.3, 0.45, 0.6],
    text: (v) => `Your ultimate deals ${percent(v)} more damage.`,
    apply: ({ stats }, v) => (stats.ultimatePower *= 1 + v),
  },

  // --- Frost Mint: speed, dashing and frost ----------------------------------
  {
    id: 'zest', blend: 'mint', name: 'Mint Rush', icon: '🍃', maxLevel: 3,
    values: [0.08, 0.12, 0.16],
    text: (v) => `Move ${percent(v)} faster.`,
    apply: ({ stats }, v) => (stats.moveSpeed *= 1 + v),
  },
  {
    id: 'springy', blend: 'mint', name: 'Springy Legs', icon: '🐸', maxLevel: 3,
    values: [0.2, 0.3, 0.4],
    text: (v) => `Dash recharges ${percent(v)} faster.`,
    apply: ({ stats }, v) => (stats.dashCooldown *= 1 - v),
  },
  {
    id: 'doublehop', blend: 'mint', name: 'Double Hop', icon: '🦘', maxLevel: 2,
    values: [1, 1, 1],
    text: () => '+1 dash charge: dash again right away.',
    apply: ({ stats }, v) => (stats.dashCharges += v),
  },
  {
    id: 'frost', blend: 'mint', name: 'Frost Bite', icon: '❄️', maxLevel: 2,
    values: [0.25, 0.35, 0.45],
    text: (v) => `Spit chills bees, slowing them by ${percent(v)}.`,
    apply: ({ stats }, v) => (stats.spitSlow = Math.min(0.8, stats.spitSlow + v)),
  },
  {
    id: 'coldbrew', blend: 'mint', name: 'Cold Brew Splash', icon: '🧊', maxLevel: 2,
    values: [0.35, 0.45, 0.6],
    text: (v) => `Tea bombs chill bees, slowing them by ${percent(v)}.`,
    apply: ({ stats }, v) => (stats.splashSlow = Math.min(0.9, stats.splashSlow + v)),
  },

  // --- Chamomile: life and protection ----------------------------------------
  {
    id: 'calm', blend: 'chamomile', name: 'Chamomile Calm', icon: '🌼', maxLevel: 4,
    values: [1, 1, 2],
    text: (v) => `+${v} max heart${v > 1 ? 's' : ''} and heal fully.`,
    apply: (player, v) => {
      player.stats.maxHp += v;
      player.hp = player.stats.maxHp;
    },
  },
  {
    id: 'honey', blend: 'chamomile', name: 'Stolen Honey', icon: '🍯', maxLevel: 2,
    values: [15, 10, 6],
    text: (v) => `Restore a heart every ${v} bees defeated.`,
    apply: ({ stats }, v) => (stats.honeyEvery = stats.honeyEvery ? Math.min(stats.honeyEvery, v) : v),
  },
  {
    id: 'lastsip', blend: 'chamomile', name: 'Last Sip', icon: '🫗', maxLevel: 2,
    values: [2, 3, 4],
    text: (v) => `Once, when you would fall, revive with ${v} hearts.`,
    apply: ({ stats }, v) => {
      stats.revives += 1;
      stats.reviveHp = Math.max(stats.reviveHp, v);
    },
  },
  {
    id: 'petal', blend: 'chamomile', name: 'Petal Shield', icon: '🌸', maxLevel: 2,
    values: [14, 10, 7],
    text: (v) => `A petal shield blocks one hit. Regrows after ${v}s.`,
    apply: ({ stats }, v) => (stats.shieldEvery = stats.shieldEvery ? Math.min(stats.shieldEvery, v) : v),
  },
  {
    id: 'hug', blend: 'chamomile', name: 'Warm Hug', icon: '🤗', maxLevel: 2,
    values: [1, 2, 2],
    text: (v) => `Clearing a wave heals ${v} more heart${v > 1 ? 's' : ''}.`,
    apply: ({ stats }, v) => (stats.waveHeal += v),
  },

  // --- Storm Oolong: lightning -------------------------------------------------
  {
    id: 'spark', blend: 'storm', name: 'Chain Spark', icon: '⚡', maxLevel: 2,
    values: [1, 2, 3],
    text: (v) => `Spit hits jump to ${v} more bee${v > 1 ? 's' : ''} as lightning.`,
    apply: ({ stats }, v) => (stats.spitChain += v),
  },
  {
    id: 'thundersplash', blend: 'storm', name: 'Thunder Splash', icon: '🌩️', maxLevel: 2,
    values: [3, 4, 6],
    text: (v) => `Tea bombs call down ${v} lightning bolts on nearby bees.`,
    apply: ({ stats }, v) => (stats.splashBolts += v),
  },
  {
    id: 'static', blend: 'storm', name: 'Static Charge', icon: '🔋', maxLevel: 3,
    values: [0.3, 0.45, 0.6],
    text: (v) => `Your ultimate charges ${percent(v)} faster.`,
    apply: ({ stats }, v) => (stats.gaugeRate *= 1 + v),
  },
  {
    id: 'orbit', blend: 'storm', name: 'Sparkling Leaves', icon: '🍂', maxLevel: 3,
    values: [1, 2, 2],
    text: (v) => `${v} charged tea leaf${v > 1 ? 'ves' : ''} orbit you, zapping bees.`,
    apply: ({ stats }, v) => (stats.orbitLeaves = Math.min(6, stats.orbitLeaves + v)),
  },
];

const DUOS = [
  {
    id: 'matcha', blends: ['green', 'storm'], name: 'Matcha Thunder', icon: '🌀',
    text: 'Every 4th spit is a lightning bolt that chains through 4 bees.',
    apply: ({ stats }) => (stats.boltEvery = 4),
  },
  {
    id: 'bubbletea', blends: ['green', 'ember'], name: 'Bubble Tea', icon: '🧋',
    text: 'Spit sets bees on fire. Bursting spit grows twice as big.',
    apply: ({ stats }) => {
      stats.spitBurn = Math.max(stats.spitBurn, 1);
      stats.spitBurst = Math.max(stats.spitBurst, 2);
      stats.burstRadius *= 2;
    },
  },
  {
    id: 'steamengine', blends: ['ember', 'mint'], name: 'Steam Engine', icon: '🚂',
    text: 'Dashing leaves a trail of scalding steam behind you.',
    apply: ({ stats }) => (stats.steamTrail = true),
  },
  {
    id: 'hailstorm', blends: ['mint', 'storm'], name: 'Hailstorm', icon: '🌨️',
    text: 'Lightning freezes bees solid. Frozen bees take double damage.',
    apply: ({ stats }) => (stats.lightningFreeze = true),
  },
  {
    id: 'herbal', blends: ['green', 'chamomile'], name: 'Herbal Remedy', icon: '🌿',
    text: 'Every 50 spit hits restore a heart.',
    apply: ({ stats }) => (stats.spitHealEvery = 50),
  },
  {
    id: 'calmstorm', blends: ['chamomile', 'storm'], name: 'Calm Before the Storm', icon: '⛈️',
    text: 'When you get hit, 6 lightning bolts strike the bees around you.',
    apply: ({ stats }) => (stats.hitStorm = 6),
  },
  {
    id: 'sunbrew', blends: ['ember', 'chamomile'], name: 'Sun Brew', icon: '☀️',
    text: 'Every time you heal, a blazing nova scorches nearby bees.',
    apply: ({ stats }) => (stats.healNova = 8),
  },
  {
    id: 'julep', blends: ['mint', 'chamomile'], name: 'Mint Julep', icon: '🍹',
    text: 'Every 6th dash restores a heart.',
    apply: ({ stats }) => (stats.dashHealEvery = 6),
  },
];

const LEGENDARIES = [
  {
    id: 'geyser', blend: 'green', name: 'Geyser Spit', icon: '⛲',
    text: 'Spit splits into 3 smaller spits when it hits.',
    apply: ({ stats }) => (stats.spitSplit = true),
  },
  {
    id: 'volcano', blend: 'ember', name: 'Volcano Pot', icon: '🌋',
    text: 'Tea bombs leave a pool of lava that burns bees.',
    apply: ({ stats }) => (stats.lavaPool = 4),
  },
  {
    id: 'blizzard', blend: 'mint', name: 'Blizzard Dash', icon: '🌬️',
    text: 'Dashing freezes bees solid, then they shatter for 6 damage.',
    apply: ({ stats }) => (stats.freezeDash = 6),
  },
  {
    id: 'eternal', blend: 'chamomile', name: 'Eternal Brew', icon: '♾️',
    text: '+2 max hearts. Regrow a heart every 20 seconds.',
    apply: (player) => {
      player.stats.maxHp += 2;
      player.heal(2);
      player.stats.regenEvery = 20;
    },
  },
  {
    id: 'eye', blend: 'storm', name: 'Eye of the Storm', icon: '🌪️',
    text: 'A storm cloud follows you, striking a bee every second.',
    apply: ({ stats }) => (stats.stormCloud = 7),
  },
];

for (const brew of BREWS) brew.kind = 'brew';
for (const duo of DUOS) Object.assign(duo, { kind: 'duo', maxLevel: 1 });
for (const legendary of LEGENDARIES) Object.assign(legendary, { kind: 'legendary', maxLevel: 1 });

export const ALL_BREWS = [...BREWS, ...DUOS, ...LEGENDARIES];
export const brewById = (id) => ALL_BREWS.find((brew) => brew.id === id);

/** How many different brews of each blend the player owns. */
function blendCounts(levels) {
  const counts = Object.fromEntries(Object.keys(BLENDS).map((blend) => [blend, 0]));
  for (const id of levels.keys()) {
    const brew = brewById(id);
    if (brew?.kind === 'brew') counts[brew.blend]++;
  }
  return counts;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Rarity index: 0 common, 1 rare, 2 epic. Better odds later in a run and with luck. */
function rollRarity(wave, luck) {
  const roll = Math.random();
  const epic = 0.03 + wave * 0.012 + luck * 0.03;
  const rare = epic + 0.15 + wave * 0.015 + luck * 0.05;
  return roll < epic ? 2 : roll < rare ? 1 : 0;
}

/**
 * Three offers: { brew, rarity, value, level }. Duo and Legendary brews show up once
 * their requirements are met; regular brews come from different blends where possible.
 */
export function rollBrews(levels, { wave, luck = 0, hasUltimate = false, count = 3 }) {
  const owned = (brew) => levels.get(brew.id) ?? 0;
  const counts = blendCounts(levels);
  const offers = [];

  const duos = DUOS.filter((duo) => !owned(duo) && duo.blends.every((blend) => counts[blend] > 0));
  const legendaries = LEGENDARIES.filter((legendary) => !owned(legendary) && counts[legendary.blend] >= 2);
  if (duos.length && Math.random() < 0.35) offers.push({ brew: shuffle(duos)[0] });
  if (legendaries.length && Math.random() < 0.2) offers.push({ brew: shuffle(legendaries)[0] });

  // Fill up with regular brews, preferring blends that aren't on offer yet.
  const regular = shuffle(BREWS.filter((brew) => owned(brew) < brew.maxLevel && (!brew.needsUltimate || hasUltimate)));
  while (offers.length < count && regular.length) {
    const offered = new Set(offers.map((offer) => offer.brew.blend));
    const index = regular.findIndex((brew) => !offered.has(brew.blend));
    offers.push({ brew: regular.splice(Math.max(0, index), 1)[0] });
  }

  return offers.slice(0, count).map(({ brew }) => {
    const rarity = brew.kind === 'brew' ? rollRarity(wave, luck) : null;
    return { brew, rarity, value: brew.values?.[rarity], level: owned(brew) + 1 };
  });
}

/** Text shown on the card for an offer. */
export function describe(offer) {
  return typeof offer.brew.text === 'function' ? offer.brew.text(offer.value) : offer.brew.text;
}
