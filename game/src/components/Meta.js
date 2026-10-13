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

const defaults = () => ({ leaves: 0, levels: {}, runs: 0, bestWave: 0, bossKills: 0, victories: 0, maxTier: 0 });

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return defaults();
  }
}

export const meta = load();

export function saveMeta() {
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

export function leavesForRun({ score, wave, bossKills, victory }) {
  return Math.floor(score / 40) + wave * 3 + bossKills * 15 + (victory ? 100 : 0);
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

/** Tode's reflection after a run: milestones first, then the next line of the story. */
export function runLine({ wave, victory, firstBossKill, reachedGod }) {
  if (victory) return 'The Empress has fallen. Tode finally finishes his tea. It is, at last, perfectly steeped. ☕';
  if (reachedGod) return 'For a moment Tode was a god, and the garden bent around him. He wants that feeling back.';
  if (firstBossKill) return 'The Queen fell, but the hive did not. There is an Empress beyond the hedge…';
  if (wave === 5) return 'So there IS a Queen. And she has a crown. Tode wants that crown.';
  return LINES[(meta.runs - 1) % LINES.length];
}
