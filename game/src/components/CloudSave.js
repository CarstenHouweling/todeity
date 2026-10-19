// Cloud saves (server/saves.js): the server owns the progress that matters (Golden Leaves, Pantry, achievements,
// run stats), so editing localStorage doesn't stick: the next sync puts the server's copy back. Every browser gets a
// save code (MINT-FROG-42) on its first visit; entering it on another device continues the same progress.
// Without a server (a static host, or the server is down) the game keeps its progress in this browser, as before.

import { isPersisting, meta, saveMeta } from './Meta.js';
import { claimGift, claimKettle, cleanDecor, withRewards } from './Rewards.js';
import { TAG_COLORS, cleanName, nameProblem } from './PlayerTag.js';

const API = '/api/save';
const CODE_KEY = 'tode-save-code';
const RUNS_KEY = 'tode-unsent-runs'; // run reports the server hasn't answered yet (a restart, no connection)
const RUN_GAP = 11_000; // ms between reports (the server allows one per 10 s)
const FIELDS = ['leaves', 'levels', 'achievements', 'runs', 'bestWave', 'bossKills', 'victories', 'maxTier', 'eliteKills', 'streak', 'kettleAt', 'kettles', 'trinkets', 'decor', 'medals', 'wearables'];

const storage = (action, key, value) => {
  try {
    if (action === 'get') return localStorage.getItem(key);
    if (action === 'set') localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: this session only.
  }
  return null;
};

/**
 * `status`: 'connecting', 'online' or 'offline'. `onChange` runs after the progress changed from the server;
 * `onRefused(error)` when the server refused a run report (it pays no leaves).
 */
export const cloud = { code: storage('get', CODE_KEY), status: 'connecting', onChange: null, onRefused: null, medals: [] };

// Achievements unlocked this session that the server hasn't confirmed yet: they go with the next run report.
// Only in memory: kept in storage, they could be edited to unlock keepsakes early.
const pending = new Map(); // id → its Golden Leaves (Achievements.js imports this module, so it passes them in)
let eliteBase = meta.eliteKills ?? 0; // elite kills the server knows about

export const notePending = (id, reward) => pending.set(id, reward);

// The outfit picked here that the server hasn't confirmed yet. A reply to an earlier outfit save (or a run report)
// carries the old one, and taking it made the wardrobe jump back to the item worn before.
let outfitWanted = null;
export const noteOutfit = (outfit) => (outfitWanted = structuredClone(outfit));

/** Takes the server's progress, keeping achievements (and their leaves) that are still on their way. */
function apply(data) {
  const progress = data.progress;
  cloud.code = data.code;
  storage('set', CODE_KEY, data.code);
  for (const id of progress.achievements) pending.delete(id);
  withRewards(progress);
  for (const field of FIELDS) meta[field] = structuredClone(progress[field]);
  cloud.medals = Array.isArray(data.medals) ? data.medals : []; // Daily Brew days won, their medals still to claim
  meta.achievements.push(...pending.keys());
  for (const reward of pending.values()) meta.leaves += reward;
  eliteBase = progress.eliteKills;
  if (data.profile) meta.profile = structuredClone(data.profile); // the player tag lives in the cloud save too
  if (outfitWanted) meta.profile = { ...meta.profile, outfit: structuredClone(outfitWanted) };
  cloud.status = 'online';
  saveMeta();
  cloud.onChange?.();
}

async function request(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

let syncTries = 0;
let retryTimer = null;

/** The server couldn't be reached (a restart, no connection): try again in a while. */
function retryLater(delay) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => (cloud.status === 'online' ? sendUnsentRuns() : initCloud()), delay);
}
if (typeof addEventListener === 'function') addEventListener('online', () => retryLater(1_000));

/** On start: load this browser's save, or make one. Retries quietly while the server is away. */
export async function initCloud() {
  if (!isPersisting()) return;
  try {
    if (cloud.code) {
      const { ok, status, data } = await request(`/${encodeURIComponent(cloud.code)}`);
      if (ok) {
        apply(data);
        return sendUnsentRuns(); // runs that ended while the server was away
      }
      if (status !== 404) throw new Error(data.error);
    }
    // First visit (or the save is gone): a fresh save. Progress from before cloud saves doesn't carry over.
    pending.clear();
    const { ok, data } = await request('', {});
    if (!ok) throw new Error(data.error);
    apply(data);
    sendUnsentRuns();
  } catch {
    cloud.status = 'offline';
    cloud.onChange?.();
    // Back in 15 s, then less and less often (a static host without a server just stays offline).
    if (++syncTries <= 12) retryLater(Math.min(15_000 * 1.5 ** (syncTries - 1), 300_000));
  }
}

/** Continues the progress of another save code. Resolves with an error message, or null. */
export async function loadCode(code) {
  try {
    const { ok, data } = await request(`/${encodeURIComponent(code.trim())}`);
    if (!ok) return data.error ?? "Couldn't load that save.";
    pending.clear();
    outfitWanted = null; // another save: its own outfit
    apply(data);
    return null;
  } catch {
    return "Can't reach the server right now.";
  }
}

/**
 * Reports a finished run; the server pays its Golden Leaves. `run`: { wave, bossKills, victory, score, kills,
 * time, steep, maxTier, goldLeaf, daily, coop }.
 */
export async function reportRun(run) {
  if (!cloud.code || !isPersisting()) return;
  // A run id lets the server pay a report only once, even when it is sent again.
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const body = { ...run, eliteKills: Math.max(0, (meta.eliteKills ?? 0) - eliteBase), achievements: [...pending.keys()], runId };
  eliteBase = meta.eliteKills ?? 0; // (counted in this report now)
  // Kept until the server answers, so a run that ends while the server restarts still pays its leaves later.
  unsentRuns(cloud.code, (runs) => runs.push(body));
  if (cloud.status === 'online') sendUnsentRuns();
}

/** The reports waiting to be sent for a save code; `change(runs)` edits the list. */
function unsentRuns(code, change = null) {
  let all = {};
  try {
    all = JSON.parse(storage('get', RUNS_KEY) ?? '{}') ?? {};
  } catch {
    // a broken list starts over
  }
  const runs = Array.isArray(all[code]) ? all[code] : [];
  if (change) {
    change(runs);
    if (runs.length) all[code] = runs.slice(-10);
    else delete all[code];
    storage(Object.keys(all).length ? 'set' : 'remove', RUNS_KEY, JSON.stringify(all));
  }
  return runs;
}

let sending = false;

/** Sends the waiting run reports, oldest first; ones that didn't get through wait for the next try. */
async function sendUnsentRuns() {
  if (sending || !cloud.code || !isPersisting()) return;
  sending = true;
  const code = cloud.code;
  try {
    for (let i = 0; ; i++) {
      const [body] = unsentRuns(code);
      if (!body) break;
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, RUN_GAP));
      let answer;
      try {
        answer = await request(`/${encodeURIComponent(code)}/run`, body);
      } catch {
        answer = null; // no connection
      }
      if (!answer || answer.status >= 500 || answer.status === 429) {
        retryLater(30_000);
        break;
      }
      // Paid, or refused for good (the server decided either way): it leaves the list.
      unsentRuns(code, (runs) => runs.splice(runs.findIndex((r) => r.runId === body.runId) >>> 0, 1));
      if (answer.ok) for (const id of body.achievements ?? []) pending.delete(id);
      // Refused: the leaves the game-over screen showed won't come, so say why instead of quietly taking them back.
      else if (!answer.data.duplicate) cloud.onRefused?.(answer.data.error ?? "The server didn't count that run.");
      if (answer.data.progress && cloud.code === code) apply(answer.data);
    }
  } finally {
    sending = false;
  }
}

/** A Pantry purchase (already made locally): the server checks it and has the final word. */
export async function reportBuy(id) {
  if (!cloud.code || !isPersisting() || cloud.status === 'offline') return;
  try {
    const { data } = await request(`/${encodeURIComponent(cloud.code)}/buy`, { id });
    if (data.progress) apply(data);
  } catch {
    // Offline: the purchase stays local until the next sync.
  }
}

/**
 * Claims the daily gift ('gift'), pours the kettle ('kettle') or takes a champion's medal ('medal'). The server pays
 * it; without a server the local progress does (but there is no Daily Brew champion offline). Resolves with
 * { reward } or { error }.
 */
export async function claimReward(kind) {
  if (cloud.status === 'online' && cloud.code && isPersisting()) {
    try {
      const { ok, data } = await request(`/${encodeURIComponent(cloud.code)}/claim`, { kind });
      if (data.progress) apply(data);
      return ok ? { reward: data.reward } : { error: data.error ?? "Couldn't claim that." };
    } catch {
      return { error: "Can't reach the server right now." };
    }
  }
  if (cloud.status === 'connecting') return { error: 'Still connecting to your save…' };
  if (kind === 'medal') return { error: "Can't reach the server right now." };
  const reward = (kind === 'gift' ? claimGift : claimKettle)(meta, Date.now());
  if (typeof reward === 'string') return { error: reward };
  saveMeta();
  return { reward };
}

let decorTimer = null;

/** Trinkets placed in the title garden: kept locally right away, sent to the server a moment later. */
export function saveDecor(decor) {
  meta.decor = cleanDecor(decor, meta);
  saveMeta();
  clearTimeout(decorTimer);
  if (cloud.status !== 'online' || !cloud.code || !isPersisting()) return;
  decorTimer = setTimeout(() => {
    request(`/${encodeURIComponent(cloud.code)}/decor`, { decor: meta.decor }).catch(() => {});
  }, 800);
}

/**
 * This save's public garden code (made on first use), for others to look at the garden. It is not the save code:
 * it can't load or change anything. Resolves with the code, or null offline.
 */
export async function gardenCode(name, options = {}) {
  if (cloud.status !== 'online' || !cloud.code) return null;
  try {
    const { ok, data } = await request(`/${encodeURIComponent(cloud.code)}/garden`, { name, ...options });
    if (ok) cloud.gardenPublic = Boolean(data.public);
    return ok ? data.garden : null;
  } catch {
    return null;
  }
}

/** Lists your garden for everyone (or not). Resolves with the new state, or null offline. */
export async function setGardenPublic(on) {
  const code = await gardenCode(null, { public: on });
  return code ? cloud.gardenPublic : null;
}

/** Your garden's look for visitors: { night, song }. Resolves with true when the server took it. */
export async function setGardenLook(look) {
  return Boolean(await gardenCode(null, { night: Boolean(look.night), song: look.song }));
}

/** Someone's garden by its public garden code: { name, decor, level, rank, trinkets, beauty } or { error }. */
export async function fetchGarden(code) {
  try {
    const response = await fetch(`/api/garden/${encodeURIComponent(code.trim())}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    return response.ok ? data : { error: data.error ?? "Couldn't find that garden." };
  } catch {
    return { error: "Can't reach the server right now." };
  }
}

/**
 * Saves what the frog wears ({ slot: id }, Wearables.js; the caller has already put it in `meta.profile.outfit`).
 * The server keeps only unlocked items. Offline it stays in this browser.
 */
export async function saveOutfit(outfit) {
  if (cloud.status !== 'online' || !cloud.code || !isPersisting()) return;
  try {
    const { data } = await request(`/${encodeURIComponent(cloud.code)}/outfit`, { outfit });
    if (!data.progress) return;
    // The latest choice arrived: the server's copy counts again (it keeps only unlocked items).
    if (JSON.stringify(outfit) === JSON.stringify(outfitWanted)) outfitWanted = null;
    apply(data);
  } catch {
    // Kept locally; it goes up with the next change.
  }
}

/**
 * Sets the player tag (name and colour; the #tag comes from the server). Checked against the name rules here and
 * on the server. Without a server it's kept in this browser. Resolves with {} or { error }.
 */
export async function saveProfile({ name, color }) {
  const problem = nameProblem(name);
  if (problem) return { error: problem };
  const tagColor = TAG_COLORS.includes(color) ? color : null;
  if (cloud.status === 'online' && cloud.code && isPersisting()) {
    try {
      const { ok, data } = await request(`/${encodeURIComponent(cloud.code)}/profile`, { name: cleanName(name), color: tagColor });
      if (data.progress) apply(data);
      return ok ? {} : { error: data.error ?? "Couldn't save that name." };
    } catch {
      return { error: "Can't reach the server right now." };
    }
  }
  meta.profile = { tag: null, ...meta.profile, name: cleanName(name), color: tagColor };
  saveMeta();
  return {};
}
