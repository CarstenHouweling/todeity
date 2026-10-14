// Version history, newest first. Add an entry (and bump package.json) for every major change; the first entry is
// the version shown in the menus.

export const CHANGELOG = [
  {
    version: '0.9.0',
    date: '2026-10-14',
    title: 'Tablet update',
    changes: [
      'Twin-stick touch controls: the left stick moves Tode, the right stick aims, and he spits all by himself',
      'Fullscreen button in the title and pause menus',
      'Share your run: a card with your score, time, wave and every brew, skill and ultimate you gathered',
      'Version number and this changelog',
    ],
  },
  {
    version: '0.8.1',
    date: '2026-10-14',
    title: 'Online',
    changes: ['Todeity is playable on the web, with leaderboards and co-op rooms for everyone'],
  },
  {
    version: '0.8.0',
    date: '2026-10-13',
    title: 'Level up and chaos',
    changes: [
      'Tea leaves level Tode up: every level is a pick of 14 skills, up to 6 slots and level 5 each',
      'Every arena is bigger, with a side objective (wild hives to smash, shrines to hold) that opens the way on',
      'Wave modifiers, arena hazards (boulders, meteors, brimstone, holy lightning) and coordinated bee squads',
      'Leaderboards for the deepest run and the fastest Bee-zebub, with a run timer that only counts fighting',
      'The Steeping Beam can be steered while it fires',
      'Super-charged ascension stages and a far bigger transformation cut-scene',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-13',
    title: 'Arenas and bullet hell',
    changes: [
      'Five arenas with travel cut-scenes, from the garden to the Underworld',
      'A boss for every arena and Bee-zebub as the true final boss',
      'Bullet patterns, the tea bomb and a hop dash that hurts bees',
      'Tea-leaf experience and critical hits',
      'Summoning: Great Tode, beam clashes and reality-shattering finishers',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-13',
    title: 'Epic finale',
    changes: [
      'The Empress gets her Royal Spiral',
      'A victory ending cut-scene with credits',
      'Achievements worth Golden Leaves',
      'First-run tips',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-13',
    title: 'Phones and story',
    changes: [
      'Touch controls for phones and tablets',
      'Quality that adapts to your device, a cinematic title screen and a photo button',
      'A story cut-scene for the first run',
      "Tode's spit evolves with his divinity",
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-13',
    title: 'Co-op',
    changes: ['Play with 2–4 friends using a room code'],
  },
  {
    version: '0.3.0',
    date: '2026-10-13',
    title: 'Leaderboard',
    changes: ['A global leaderboard', 'The Daily Brew: the same seeded run for everyone, every day'],
  },
  {
    version: '0.2.0',
    date: '2026-10-13',
    title: 'The epic update',
    changes: [
      'An epic procedural soundtrack',
      'Skills that cast themselves',
      "The world transforms with Tode's divinity",
      'Slow-motion finishers, combos, boss entrances and elite bees',
      'Tea spirits who talk to Tode when offering brews',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-13',
    title: 'Tode roguelite',
    changes: [
      'Waves of bees, brews from five Blends with Duo and Legendary brews',
      'Ultimates, ascension from frog to God of Tea, weather and time of day',
      "Queen Buzzbelle, the Empress and Tode's Pantry",
    ],
  },
];

export const VERSION = CHANGELOG[0].version;
