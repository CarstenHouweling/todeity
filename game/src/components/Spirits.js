import { meta } from './Meta.js';

/**
 * The tea spirits: each Blend has a patron who offers its brews and talks to Tode, like the gods in Hades.
 * Duo brews get a little exchange between the two spirits involved. They remember Tode's earlier runs (who beat
 * him, how far he got, which Blend he favours), and each has a voice: synthesized babble (see Sound.js `babble`).
 */

export const SPIRITS = {
  green: {
    voice: { pitch: 150, type: 'triangle', rate: 9, wobble: 0.08 }, // slow and low: an old turtle
    name: 'Master Sencha',
    title: 'Spirit of Green Tea',
    portrait: '🐢',
    color: '#7ed957',
    lines: [
      'Patience, little frog. The finest leaves take time… your spit need not.',
      'Aim true. A bee is merely a fly that has not yet met you.',
      'Steep yourself in the moment, Tode. Then spit.',
      'Three hundred springs I have watched this garden. Never such tongue-work.',
      'The calm frog drinks the tea. The hasty frog wears it.',
    ],
    legendary: 'The Geyser awakens. Few have earned this, little frog.',
  },
  ember: {
    voice: { pitch: 105, type: 'sawtooth', rate: 17, wobble: 0.25, loud: true },
    name: 'Ember',
    title: 'the Kettle Drake',
    portrait: '🐉',
    color: '#ff7a2f',
    lines: [
      'BOIL THEM! Boil them ALL!',
      'Your tea is lukewarm, frog. Let me fix that.',
      'Fire and tea, Tode! The two finest things in the world!',
      'When the kettle screams, the bees should scream too!',
      'I have opinions about bees. They are all on FIRE.',
    ],
    legendary: "THE VOLCANO POT! I'VE WAITED CENTURIES TO SAY THAT!",
  },
  mint: {
    voice: { pitch: 440, type: 'triangle', rate: 16, wobble: 0.15 },
    name: 'Mintaka',
    title: 'Fox of the North Wind',
    portrait: '🦊',
    color: '#5fe3d0',
    lines: [
      "Fast feet, cool head. The bees can't catch you. Neither can I.",
      'Chill out, Tode. Let the frost do the work.',
      "A minty breeze for a sweaty frog. You're welcome.",
      "Hop, skip, freeze. That's the whole dance.",
      'Stay frosty, little prince.',
    ],
    legendary: "The blizzard is yours now. Don't catch a cold.",
  },
  chamomile: {
    voice: { pitch: 330, type: 'sine', rate: 11, wobble: 0.3 }, // a warm, wavering granny
    name: 'Granny Chamomile',
    title: 'Keeper of Calm',
    portrait: '🦔',
    color: '#ffd84d',
    lines: [
      'Oh, look at you, all covered in stings. Here, dear, drink this.',
      'A good cup of chamomile fixes everything. Except bees. Bees you squash.',
      "Mind your health, sweetheart. Grandma's watching.",
      "I knitted you a shield. Out of petals. Don't ask.",
      'Sit down, have a biscuit… oh. Later, then. Go get them, dear.',
    ],
    legendary: "An eternal brew, for my eternal favourite. Don't tell the others.",
  },
  storm: {
    voice: { pitch: 240, type: 'square', rate: 15, wobble: 0.2, loud: true },
    name: 'Oolong',
    title: 'the Storm Eagle',
    portrait: '🦅',
    color: '#a3a8ff',
    lines: [
      'THE SKY ANSWERS YOUR CALL, FROG!',
      'Lightning never strikes twice? I strike as often as I please.',
      'Let the heavens crackle, Tode. Let the hive tremble.',
      "Feel the static in your toes? That's destiny.",
      'Thunder is just the sky applauding you.',
    ],
    legendary: 'The eye of the storm opens. And it is watching over you.',
  },
  kettle: {
    voice: { pitch: 620, type: 'sine', rate: 12, wobble: 0.05 }, // a whistle
    name: 'The Old Kettle',
    title: 'Hearth of the Garden',
    portrait: '🫖',
    color: '#ffc93c',
    lines: [
      'Your spirit is steeped enough, Tode. Choose the power that will shake the garden.',
      'A new trick for the road, little hero?',
      'Every legend needs a signature move. Pick wisely.',
    ],
  },
};

// Pairs, keyed by the two blend ids in alphabetical order: [speaker, line] twice.
const DUO_TALK = {
  'green,storm': [['green', 'Steady aim, little frog…'], ['storm', '…AND A BOLT TO FOLLOW IT!']],
  'ember,green': [['ember', 'Bubbles? BURNING bubbles!'], ['green', 'Must everything be on fire with you?']],
  'ember,mint': [['mint', 'Hot and cold, darling. The perfect steam.'], ['ember', 'STEAM IS JUST WATER THAT GOT ANGRY!']],
  'mint,storm': [['storm', 'ICE AND LIGHTNING!'], ['mint', 'Frozen bees, shattered by thunder. Very chic.']],
  'chamomile,green': [['chamomile', 'Eat your greens, dear.'], ['green', 'And spit them at the bees.']],
  'chamomile,storm': [['storm', 'STRIKE THOSE WHO STRIKE YOU!'], ['chamomile', 'Now, now… but yes. Do that, dear.']],
  'chamomile,ember': [['chamomile', 'Warm hugs for my favourite frog.'], ['ember', 'WARM? MAKE IT BLAZING!']],
  'chamomile,mint': [['mint', 'A little mint in your julep, Granny?'], ['chamomile', 'Only on special occasions, foxy.']],
};

const lastLine = {};

function randomLine(spiritId) {
  const { lines } = SPIRITS[spiritId];
  let index = Math.floor(Math.random() * lines.length);
  if (index === lastLine[spiritId]) index = (index + 1) % lines.length;
  lastLine[spiritId] = index;
  return lines[index];
}

const say = (spiritId, line) => ({ spirit: SPIRITS[spiritId], line });

// --- Memory: lines about Tode's earlier runs ----------------------------------------------
const BOSS_NAMES = { queen: 'Queen Buzzbelle', shogun: 'the Hornet Shogun', seraph: 'the Seraph Queen', empress: 'the Empress', beezebub: 'Bee-zebub' };

// {boss}, {fav}, {wave}, {steep} and {runs} are filled in. Spirits that shout get it in capitals.
const MEMORY = {
  green: {
    boss: 'So {boss} bested you last time. Even the oldest leaf falls once.',
    swarm: 'Felled by mere drones? Patience. And perhaps aim.',
    deep: 'Wave {wave} last time. You climb higher with every cup, little frog.',
    god: 'Yesterday a god, today a frog. The wheel turns, Tode.',
    victory: 'The frog who banished Bee-zebub sits before me. Again, then?',
    favourite: 'Green again? A wise frog knows his roots.',
    jealous: 'You favour {fav}. Even so, my leaves are here.',
    steep: '{steep} vows deep? Bold. The bitterest tea is the most honest.',
    runs: 'Run {runs}. I have counted every one. Tortoises do that.',
  },
  ember: {
    boss: '{boss} BURNED YOU? NOBODY BURNS YOU BUT ME!',
    swarm: 'BEES? JUST BEES? We BOIL them this time!',
    deep: 'WAVE {wave}! That is HOT, frog! Go HOTTER!',
    god: 'YOU WERE A GOD! BE ONE AGAIN! LOUDER!',
    victory: 'THE BEE-ZEBUB BANISHER RETURNS! LET THE KETTLE SCREAM!',
    favourite: 'MY FAVOURITE FROG PICKS ME! OF COURSE HE DOES!',
    jealous: '{fav}? BORING! Try FIRE!',
    steep: 'STEEP {steep}! MORE VOWS! MORE HEAT! I LOVE IT!',
    runs: 'RUN {runs}! EVERY ONE OF THEM ON FIRE!',
  },
  mint: {
    boss: 'Losing to {boss} again? Dodge left this time, darling.',
    swarm: 'Plain old bees got you? Hop more, frog.',
    deep: 'Wave {wave}. Not bad. Not fast enough, but not bad.',
    god: 'Missing the halo already? It suited you.',
    victory: 'Look who banished Bee-zebub. Try not to let it go to your head.',
    favourite: 'Me again? I am flattered. Mostly.',
    jealous: 'Always {fav}, never me. I am not hurt. Much.',
    steep: 'Making it harder on purpose? Stylish. Reckless, but stylish.',
    runs: 'Run {runs}. You really don’t give up, do you?',
  },
  chamomile: {
    boss: 'Did {boss} hurt my favourite frog? Drink this, dear.',
    swarm: 'Those little ones swarmed you, poor thing. Not today.',
    deep: 'Wave {wave}, sweetheart! Granny is so proud.',
    god: 'You looked so radiant last time, dear. Like a little sun.',
    victory: 'My hero! Bee-zebub banished, and still you come back for more.',
    favourite: 'You always come back to Granny. Good boy.',
    jealous: '{fav} is lovely, dear, but have you tried a nice chamomile?',
    steep: 'All those vows, sweetheart… {steep} of them! Do be careful.',
    runs: 'Run {runs} already? You must be exhausted. Have a biscuit.',
  },
  storm: {
    boss: '{boss} WILL FEEL THE SKY’S REVENGE!',
    swarm: 'A SWARM OF NOBODIES! THUNDER WILL SCATTER THEM!',
    deep: 'WAVE {wave}! THE HEAVENS NOTICED, FROG!',
    god: 'THE HEAVENS REMEMBER YOUR CROWN!',
    victory: 'BANISHER OF BEE-ZEBUB! THE SKY KNEELS! (A LITTLE.)',
    favourite: 'LOYALTY! THE STORM APPROVES!',
    jealous: '{FAV} IS A DRIZZLE BESIDE ME!',
    steep: 'STEEP {steep}! THE SKY SALUTES YOUR NERVE!',
    runs: 'RUN {runs}! THE STORM NEVER TIRES AND NEITHER DO YOU!',
  },
};

/** The Blend Tode picks most often (after a few picks), or null. */
function favouriteBlend() {
  const picks = Object.entries(meta.blendPicks ?? {}).sort((a, b) => b[1] - a[1]);
  return picks[0]?.[1] >= 5 ? picks[0][0] : null;
}

function fill(template, values, shout) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = String(values[key.toLowerCase()] ?? '');
    return key === key.toUpperCase() || shout ? value.toUpperCase() : value;
  });
}

/** A line about Tode's past, if this spirit has something to say. `first`: the first offer of the run. */
function memoryLine(spiritId, { first, steep }) {
  const lines = MEMORY[spiritId];
  if (!lines) return null;
  const last = meta.lastRun;
  const fav = favouriteBlend();
  const values = { boss: BOSS_NAMES[last?.killer], wave: last?.wave, steep, runs: meta.runs + 1, fav: fav && SPIRITS[fav].name };
  const shout = spiritId === 'ember' || spiritId === 'storm';
  let key = null;
  if (first) {
    if (steep >= 3) key = 'steep';
    else if (last?.victory) key = 'victory';
    else if (last?.tier >= 4) key = 'god';
    else if (BOSS_NAMES[last?.killer]) key = 'boss';
    else if (last && last.wave >= 11) key = 'deep';
    else if (last && last.wave <= 4) key = 'swarm';
    else if ((meta.runs + 1) % 10 === 0) key = 'runs';
  }
  if (!key && fav && Math.random() < (first ? 1 : 0.25)) key = fav === spiritId ? 'favourite' : 'jealous';
  return key ? fill(lines[key], values, shout && key !== 'jealous') : null;
}

/**
 * What the spirits say over a set of brew offers: a Duo exchange, a Legendary line, a memory of earlier runs or a
 * greeting. `memory`: { first, steep } (see memoryLine).
 */
export function brewDialogue(offers, memory = {}) {
  const duo = offers.find(({ brew }) => brew.kind === 'duo');
  if (duo) {
    const talk = DUO_TALK[[...duo.brew.blends].sort().join(',')];
    if (talk) return talk.map(([spirit, line]) => say(spirit, line));
  }
  const legendary = offers.find(({ brew }) => brew.kind === 'legendary');
  if (legendary) return [say(legendary.brew.blend, SPIRITS[legendary.brew.blend].legendary)];
  const blends = offers.map(({ brew }) => brew.blend).filter(Boolean);
  const speaker = blends[Math.floor(Math.random() * blends.length)] ?? 'kettle';
  return [say(speaker, memoryLine(speaker, memory) ?? randomLine(speaker))];
}

// --- Bosses remember too ---------------------------------------------------------------
const BOSS_TAUNTS = {
  queen: {
    first: 'Who dares splash MY garden?',
    won: 'Back for another sting, little frog?',
    lost: 'You got lucky last time, tadpole.',
  },
  shogun: {
    first: 'Draw your tongue, frog.',
    won: 'My blade remembers you.',
    lost: 'You shamed me once. There will be no mercy.',
  },
  seraph: {
    first: 'Kneel before the light.',
    won: 'The light burned you once. It will again.',
    lost: 'You dimmed my halo once. Never twice.',
  },
  empress: {
    first: 'A frog? At MY throne?',
    won: 'Crawl back to your teacup, little thing.',
    lost: 'I have waited a long time for this rematch.',
  },
  beezebub: {
    first: 'So the little god of tea falls to me at last.',
    won: 'Welcome back to the Underworld, frog. Again.',
    lost: 'You banished me once. I came back. I always come back.',
  },
};

export const BOSS_VOICE = { pitch: 80, type: 'sawtooth', rate: 10, wobble: 0.35, loud: true };

/** The boss's line at its entrance, from what it remembers: { met, beaten, won } (see Meta.js `boss`). */
export function bossTaunt(kind, { met = 0, beaten = 0, won = 0 } = {}) {
  const taunts = BOSS_TAUNTS[kind];
  if (!taunts) return '';
  if (won >= 3) return `${won} times now, frog. Shall we make it ${won + 1}?`;
  if (!met) return taunts.first;
  if (beaten > won) return taunts.lost;
  if (won > 0) return taunts.won;
  return taunts.first;
}

export function kettleDialogue(which) {
  return [say('kettle', SPIRITS.kettle.lines[which === 'ultimate' ? 0 : 1 + Math.floor(Math.random() * 2)])];
}
