// Cloud saves: the server keeps every player's progress (Golden Leaves, Pantry, achievements, run stats), so
// editing localStorage no longer works. Players get an easy save code (MINT-FROG-42) to continue on any device.
//
//   POST /api/save                       → { code, progress }            a new save
//   GET  /api/save/:code                 → { code, progress }
//   POST /api/save/:code/run  { report } → { code, progress, leaves }    leaves for a finished run
//   POST /api/save/:code/buy  { id }     → { code, progress }            a Pantry upgrade
//
// The browser only reports what happened in a run; the server works out the reward with the game's own rules
// (Meta.js, Achievements.js, Steeping.js), checks that the run is plausible and that the playtime fits the time
// since the previous report. A determined cheater can still forge requests, but not by editing their storage.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PANTRY, leavesForRun } from '../src/components/Meta.js';
import { ACHIEVEMENTS, rewardFor } from '../src/components/Achievements.js';
import { STEEP_MAX, steepBonus } from '../src/components/Steeping.js';

const FLAVOURS = [
  'MINT', 'CHAI', 'MATCHA', 'SENCHA', 'OOLONG', 'EARL', 'HONEY', 'LEMON', 'GINGER', 'PEACH', 'PLUM', 'ROSE',
  'LOTUS', 'SAGE', 'BASIL', 'THYME', 'CLOVE', 'MAPLE', 'BERRY', 'COCOA', 'LILY', 'DAISY', 'FERN', 'MOSS',
  'AMBER', 'GOLDEN', 'MISTY', 'SUNNY', 'STORMY', 'COZY', 'BREWED', 'STEAMY',
];
const CRITTERS = [
  'FROG', 'TOAD', 'NEWT', 'BEE', 'WASP', 'MOTH', 'SNAIL', 'HERON', 'OTTER', 'DUCK', 'SWAN', 'CRANE', 'KOI',
  'CARP', 'BEETLE', 'CRICKET', 'RABBIT', 'MOLE', 'FOX', 'OWL', 'WREN', 'ROBIN', 'FINCH', 'LARK', 'MOUSE',
  'BADGER', 'SPARROW', 'TADPOLE', 'LADYBUG', 'KETTLE', 'TEAPOT', 'TEACUP',
];

const GOLDEN_LEAF = 1.5; // the Golden Leaf keepsake (Keepsakes.js)
const RUN_GAP = 10_000; // ms between run reports per save
const CREATE_LIMIT = 5; // new saves per IP per hour
const MISS_LIMIT = 20; // unknown codes per IP per hour (no guessing other players' codes)
const SLACK = 90; // seconds of reported playtime allowed beyond the real time since the last report

let saves = {};
let file = null;
let writing = Promise.resolve();

export async function loadSaves(dataDir) {
  file = join(dataDir, 'saves.json');
  try {
    saves = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    saves = {};
  }
}

function persist() {
  writing = writing.then(async () => {
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, JSON.stringify(saves));
  });
  return writing;
}

const emptyProgress = () => ({
  leaves: 0, levels: {}, achievements: [], runs: 0, bestWave: 0, bossKills: 0, victories: 0, maxTier: 0, eliteKills: 0,
});

/** "mint frog 42", "Mint-Frog-42" and "MINTFROG42" are all the same save. */
export const normalizeCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const code = `${pick(FLAVOURS)}-${pick(CRITTERS)}-${10 + Math.floor(Math.random() * 90)}`;
    if (!saves[normalizeCode(code)]) return code;
  }
  throw new Error('No free save codes left.');
}

// --- Rate limits per IP (in memory, reset every hour) ---
const counters = new Map();
function overLimit(kind, ip, limit) {
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || now - entry.since > 3_600_000) {
    counters.set(key, { since: now, count: 0 });
    return false;
  }
  return entry.count >= limit;
}
const count = (kind, ip) => counters.get(`${kind}:${ip}`).count++;

const view = (save) => ({ code: save.code, progress: save.progress });

// --- Rules -----------------------------------------------------------------------

const int = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

/** Whether an achievement claimed in a run report fits that run (and the save so far). */
function earned(id, run, progress) {
  const tierFor = { awakened: 1, golden: 2, radiant: 3, god: 4, infinite: 5 };
  if (tierFor[id]) return run.maxTier >= tierFor[id];
  // Endless mode brings every boss back, so a deep run can beat one it skipped (never more than one per 5 waves).
  const beat = (bossWave, kills) => run.wave >= bossWave && run.bossKills >= kills;
  switch (id) {
    case 'queen': return run.bossKills >= 1 || progress.bossKills >= 1;
    case 'shogun': return beat(10, 2);
    case 'seraph': return beat(15, 3);
    case 'empress': return beat(20, 4);
    case 'beezebub': return run.victory;
    case 'flawless': return run.bossKills >= 1;
    case 'breaker': return beat(10, 1);
    case 'combo150': return run.wave >= 8 && run.kills >= 150;
    case 'kills1000': return run.kills >= 1000;
    case 'elites': return progress.eliteKills + run.eliteKills >= 50;
    case 'untouchable': return run.wave >= 7;
    case 'lightfeet': return run.wave >= 10;
    case 'legendary2': return run.wave >= 8;
    case 'skills6': case 'mastery': case 'charms': return run.wave >= 6;
    case 'level25': return run.wave >= 15;
    case 'wave30': return run.wave >= 30 && run.bossKills >= 5;
    case 'steep5': return run.steep >= 5 && beat(10, 2);
    case 'steep12': return run.steep >= 12 && beat(20, 4);
    case 'shrines': return run.wave >= 6;
    case 'coop': return run.coop && run.bossKills >= 1;
    case 'daily': return run.daily && run.wave >= 10;
    case 'photo': return true;
    default: return run.wave >= 2; // combo50, duo, legendary, skills3, whisker, bitter
  }
}

/** Applies a finished run to a save; returns the Golden Leaves it earned, or an error message. */
function applyRun(save, body, now) {
  const progress = save.progress;
  const run = {
    wave: int(body.wave, 1, 999),
    bossKills: int(body.bossKills, 0, 999),
    victory: Boolean(body.victory),
    score: int(body.score, 0, 10_000_000),
    kills: int(body.kills, 0, 1_000_000),
    time: int(body.time, 0, 86_400),
    steep: int(body.steep, 0, STEEP_MAX),
    maxTier: int(body.maxTier, 0, 5),
    eliteKills: int(body.eliteKills, 0, 10_000),
    goldLeaf: Boolean(body.goldLeaf),
    daily: Boolean(body.daily),
    coop: Boolean(body.coop),
  };
  // Playtime can't exceed the real time since the previous report (or since the save was made).
  const since = (now - (save.lastRunAt ?? save.created)) / 1000;
  if (run.time > since + SLACK) return 'That run took longer than the time since your last one.';
  // Waves take time, bosses come every 5 waves, Bee-zebub is wave 21.
  if (run.time < (run.wave - 1) * 8) return 'That was a very fast run.';
  if (run.bossKills > Math.floor(run.wave / 5) + 1) return 'More bosses than waves.';
  if (run.victory && run.wave < 21) return 'Victory comes at wave 21.';
  if (run.eliteKills > run.wave * 15) return 'Too many elites for that run.';
  const bonus = steepBonus(run.steep);
  if (run.score > (2_000 + run.kills * 200 + run.wave * 2_000) * bonus) return 'That score looks a bit too good to be true.';
  // The Golden Leaf keepsake unlocks with the Living Legend achievement.
  const claimed = [...new Set((Array.isArray(body.achievements) ? body.achievements : []).map(String))];
  const fresh = claimed.filter(
    (id) => ACHIEVEMENTS.some((a) => a.id === id) && !progress.achievements.includes(id) && earned(id, run, progress)
  );
  const goldLeaf = run.goldLeaf && (progress.achievements.includes('legendary2') || fresh.includes('legendary2'));

  const leaves = Math.round(
    leavesForRun({ score: run.score / bonus, wave: run.wave, bossKills: run.bossKills, victory: run.victory }) *
      bonus *
      (goldLeaf ? GOLDEN_LEAF : 1)
  );
  progress.leaves += leaves + fresh.reduce((sum, id) => sum + rewardFor(id), 0);
  progress.achievements.push(...fresh);
  progress.runs++;
  progress.bossKills += run.bossKills;
  progress.victories += run.victory ? 1 : 0;
  progress.bestWave = Math.max(progress.bestWave, run.wave);
  progress.maxTier = Math.max(progress.maxTier, run.maxTier);
  progress.eliteKills += run.eliteKills;
  save.lastRunAt = now;
  return leaves;
}

function applyBuy(save, id) {
  const upgrade = PANTRY.find((u) => u.id === id);
  if (!upgrade) return 'Unknown upgrade.';
  const level = save.progress.levels[id] ?? 0;
  const cost = upgrade.costs[level];
  if (cost === undefined) return 'Already maxed.';
  if (save.progress.leaves < cost) return 'Not enough Golden Leaves.';
  save.progress.leaves -= cost;
  save.progress.levels[id] = level + 1;
  return null;
}

// --- HTTP ------------------------------------------------------------------------

/** Handles /api/save…; `readJson` reads a request body as JSON. */
export async function handleSave(req, res, url, { send, ip, readJson }) {
  const [, , , code, action] = url.pathname.split('/'); // '', 'api', 'save', code?, action?

  if (!code) {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    if (overLimit('create', ip, CREATE_LIMIT)) return send(res, 429, { error: 'Too many new saves. Try again later.' });
    count('create', ip);
    const display = newCode();
    const now = Date.now();
    const save = { code: display, progress: emptyProgress(), created: now, updated: now };
    saves[normalizeCode(display)] = save;
    await persist();
    return send(res, 201, view(save));
  }

  if (overLimit('miss', ip, MISS_LIMIT)) return send(res, 429, { error: 'Too many wrong codes. Try again later.' });
  const save = saves[normalizeCode(decodeURIComponent(code))];
  if (!save) {
    count('miss', ip);
    return send(res, 404, { error: 'No save with that code.' });
  }

  if (!action && req.method === 'GET') return send(res, 200, view(save));
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Invalid JSON.' });
  }
  const now = Date.now();
  if (action === 'run') {
    if (now - (save.lastRunAt ?? 0) < RUN_GAP) return send(res, 429, { error: 'Slow down a little.', ...view(save) });
    const result = applyRun(save, body, now);
    if (typeof result === 'string') return send(res, 400, { error: result, ...view(save) });
    save.updated = now;
    await persist();
    return send(res, 200, { ...view(save), leaves: result });
  }
  if (action === 'buy') {
    const error = applyBuy(save, String(body.id));
    if (error) return send(res, 400, { error, ...view(save) });
    save.updated = now;
    await persist();
    return send(res, 200, view(save));
  }
  return send(res, 404, { error: 'Not found.' });
}
