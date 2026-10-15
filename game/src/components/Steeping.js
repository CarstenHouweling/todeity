import { meta, saveMeta } from './Meta.js';

/**
 * Steeping: vows the player takes on before a run to make it harder, for a bigger score and more Golden Leaves.
 * Every rank of a vow adds its `heat` to the Steep level. Solo runs only (not the Daily Brew or co-op), so those
 * leaderboards stay fair. In co-op the host's vows count for everyone.
 */
export const VOWS = [
  { id: 'swarm', icon: '🐝', name: 'Thick Swarm', heat: 1, ranks: 3, text: (r) => `${20 * r}% more bees in every wave` },
  { id: 'hardy', icon: '🛡️', name: 'Hardened Hive', heat: 1, ranks: 3, text: (r) => `Bees have ${15 * r}% more health` },
  { id: 'wings', icon: '💨', name: 'Restless Wings', heat: 1, ranks: 2, text: (r) => `Bees fly ${10 * r}% faster` },
  { id: 'stingers', icon: '🎯', name: 'Sharp Stingers', heat: 1, ranks: 2, text: (r) => `Enemy bullets fly ${15 * r}% faster` },
  { id: 'royal', icon: '👑', name: 'Royal Wrath', heat: 1, ranks: 2, text: (r) => `Bosses have ${30 * r}% more health` },
  { id: 'shell', icon: '💔', name: 'Thin Shell', heat: 2, ranks: 2, text: (r) => `Start with ${r} heart${r > 1 ? 's' : ''} fewer` },
  { id: 'elite', icon: '💀', name: 'Elite Guard', heat: 2, ranks: 1, text: () => 'Elite bees from wave 3, twice as often' },
  { id: 'hivemind', icon: '🧠', name: 'Hive Mind', heat: 2, ranks: 1, text: () => 'Bees use all their tactics from wave 2' },
  { id: 'bitter', icon: '🌀', name: 'Bitter Leaves', heat: 2, ranks: 1, text: () => 'Every wave from wave 2 has a modifier' },
  { id: 'pantry', icon: '🔒', name: 'Locked Pantry', heat: 3, ranks: 1, text: () => 'Your Pantry upgrades do nothing this run' },
];

meta.vows ??= {};

export const vowRank = (id) => meta.vows[id] ?? 0;

/** The Steep level of the vows currently taken. */
export function steepLevel(vows = meta.vows) {
  return VOWS.reduce((sum, vow) => sum + (vows[vow.id] ?? 0) * vow.heat, 0);
}

export const STEEP_MAX = steepLevel(Object.fromEntries(VOWS.map((vow) => [vow.id, vow.ranks])));

/** Score and Golden Leaves multiplier for a Steep level. */
export const steepBonus = (steep) => 1 + 0.12 * steep;

/** Cycles a vow through its ranks (0 → 1 → … → max → 0). */
export function cycleVow(id) {
  const vow = VOWS.find((v) => v.id === id);
  if (!vow) return;
  meta.vows[id] = (vowRank(id) + 1) % (vow.ranks + 1);
  saveMeta();
}

export function clearVows() {
  meta.vows = {};
  saveMeta();
}

/**
 * The vows in force for a run: { id: rank }. None for the Daily Brew; in co-op the host's vows (`shared`, sent with
 * the start message), so the whole room plays the same Steep.
 */
export function runVows({ daily, coop, shared = null }) {
  if (daily) return {};
  if (coop) return { ...(shared ?? {}) };
  return { ...meta.vows };
}
