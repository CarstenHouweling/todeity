/**
 * Progress that survives death, like the Mirror of Night in Hades: every run earns
 * Golden Leaves to spend in Tode's Pantry, and Tode reflects on each defeat.
 */

const STORAGE_KEY = 'tode-meta';

export const PANTRY = [
  { id: 'heart', name: 'Sturdy Shell', icon: '❤️', text: '+1 max heart', costs: [30, 70, 140] },
  { id: 'damage', name: 'Strong Brew', icon: '💪', text: '+10% damage', costs: [40, 90, 170] },
  { id: 'luck', name: 'Lucky Leaves', icon: '🍀', text: 'Rare and Epic brews show up more often', costs: [35, 80, 150] },
  { id: 'reroll', name: 'Second Steep', icon: '🔄', text: '+1 reroll of the brew offers per run', costs: [25, 60, 120] },
  { id: 'gauge', name: 'Hot Kettle', icon: '♨️', text: 'Your ultimate charges 15% faster', costs: [40, 90] },
  { id: 'revive', name: 'Lily Pad Blessing', icon: '🪷', text: 'Once per run, rise again with 2 hearts', costs: [150] },
];

const defaults = () => ({
  leaves: 0,
  levels: {},
  runs: 0,
  bestWave: 0,
  bossKills: 0,
  victories: 0,
  maxTier: 0,
  eliteKills: 0,
  achievements: [],
  seenStory: false,
  // What the spirits and bosses remember (see Spirits.js).
  lastRun: null, // { wave, killer, tier, victory, steep }
  bosses: {}, // boss kind → { met, beaten, won } (won: times it ended a run)
  blendPicks: {}, // blend → brews picked from it, ever
});

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return defaults();
  }
}

export const meta = load();

// Dev: test runs (the bot) can switch saving off so they don't touch the real progress.
let persist = true;
export const setPersist = (on) => (persist = on);

export function saveMeta() {
  if (!persist) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Storage blocked: progress only lasts this session.
  }
}

export const pantryLevel = (id) => meta.levels[id] ?? 0;

export function nextCost(upgrade) {
  return upgrade.costs[pantryLevel(upgrade.id)];
}

export function buy(id) {
  const upgrade = PANTRY.find((u) => u.id === id);
  const cost = upgrade && nextCost(upgrade);
  if (cost === undefined || meta.leaves < cost) return false;
  meta.leaves -= cost;
  meta.levels[id] = pantryLevel(id) + 1;
  saveMeta();
  return true;
}

/**
 * Golden Leaves for a run: mostly for progress (waves, bosses, victory), a little for score. The whole Pantry
 * (about 1,300) takes several good runs: a wave-5 run pays ~40, a wave-20 run ~250.
 */
export function leavesForRun({ score, wave, bossKills, victory }) {
  return wave * 4 + bossKills * 15 + (victory ? 80 : 0) + Math.floor(score / 500);
}

const LINES = [
  'Tode wakes in his armchair, the kettle whistling. Was it all a dream? The buzzing outside says no.',
  "The tea's gone cold. Again. Tode puts the kettle back on.",
  "Tode dusts off his legs. Those bees won't splash themselves.",
  "Note to self: the bees really don't like chamomile.",
  'Grandma Tode always said: a watched pot never boils. A splashed bee never returns.',
  'Somewhere beyond the fence, a Queen is laughing. Tode is not.',
  'Every sting makes the brew stronger. Tode can feel it.',
  'The garden remembers each battle. So does Tode.',
  'Tode finds a golden leaf in his pocket. Maybe the Pantry has something new…',
  'One more cup. One more try.',
  'Tode stares into his teacup. The leaves spell out: "AGAIN".',
  'The lily pads whisper of a frog who once became a god. Tode likes the sound of that.',
];

// What Tode mutters about the boss that ended his run, the first and the later times.
const BOSS_DEFEATS = {
  queen: ['So there IS a Queen. And she has a crown. Tode wants that crown.', 'Queen Buzzbelle again. Tode is starting to recognise her laugh.'],
  shogun: ["The Hornet Shogun's blade was faster than Tode's tongue. For now.", 'Tode practises his dodge in the mirror. The Shogun will not cut him again.'],
  seraph: ['The Seraph Queen shone so bright that Tode forgot to dodge.', 'Next time, Tode decides, he will bring sunglasses. Frog-sized ones.'],
  empress: ['The Empress looked down at Tode like he was a stain on her throne.', "The Empress's spiral haunts Tode's dreams. Left, then right, then left…"],
  beezebub: ['Bee-zebub laughed as Tode fell. Tode does not like that laugh.', 'The Underworld is hot, Bee-zebub is cruel, and Tode is coming back.'],
};

/** Records what the spirits and bosses will remember about this run. */
export function rememberRun({ wave, killer, tier, victory, steep }) {
  meta.lastRun = { wave, killer, tier, victory, steep };
  if (killer && killer !== 'swarm') boss(killer).won++;
}

/** Per-boss memory: { met, beaten, won }. */
export function boss(kind) {
  meta.bosses ??= {};
  meta.bosses[kind] ??= { met: 0, beaten: 0, won: 0 };
  return meta.bosses[kind];
}

/** Tode's reflection after a run: milestones first, then the next line of the story. */
export function runLine({ wave, victory, firstBossKill, reachedGod, killer }) {
  if (victory) return 'Bee-zebub is banished and the hive is silent. Tode finally finishes his tea. It is, at last, perfectly steeped. ☕';
  if (reachedGod) return 'For a moment Tode was a god, and the garden bent around him. He wants that feeling back.';
  if (firstBossKill) return 'The Queen fell, but the hive did not. There is an Empress beyond the hedge…';
  const lines = BOSS_DEFEATS[killer];
  if (lines) return lines[(meta.bosses?.[killer]?.won ?? 1) > 1 ? 1 : 0];
  return LINES[(meta.runs - 1) % LINES.length];
}
