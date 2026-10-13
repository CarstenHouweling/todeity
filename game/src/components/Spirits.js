/**
 * The tea spirits: each Blend has a patron who offers its brews and talks to Tode, like the gods in Hades.
 * Duo brews get a little exchange between the two spirits involved.
 */

export const SPIRITS = {
  green: {
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

/** What the spirits say over a set of brew offers: a Duo exchange, a Legendary line, or a greeting. */
export function brewDialogue(offers) {
  const duo = offers.find(({ brew }) => brew.kind === 'duo');
  if (duo) {
    const talk = DUO_TALK[[...duo.brew.blends].sort().join(',')];
    if (talk) return talk.map(([spirit, line]) => say(spirit, line));
  }
  const legendary = offers.find(({ brew }) => brew.kind === 'legendary');
  if (legendary) return [say(legendary.brew.blend, SPIRITS[legendary.brew.blend].legendary)];
  const blends = offers.map(({ brew }) => brew.blend).filter(Boolean);
  const speaker = blends[Math.floor(Math.random() * blends.length)] ?? 'kettle';
  return [say(speaker, randomLine(speaker))];
}

export function kettleDialogue(which) {
  return [say('kettle', SPIRITS.kettle.lines[which === 'ultimate' ? 0 : 1 + Math.floor(Math.random() * 2)])];
}
