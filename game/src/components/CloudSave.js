// Cloud saves (server/saves.js): the server owns the progress that matters (Golden Leaves, Pantry, achievements,
// run stats), so editing localStorage doesn't stick: the next sync puts the server's copy back. Every browser gets a
// save code (MINT-FROG-42) on its first visit; entering it on another device continues the same progress.
// Without a server (a static host, or the server is down) the game keeps its progress in this browser, as before.

import { isPersisting, meta, saveMeta } from './Meta.js';

const API = '/api/save';
const CODE_KEY = 'tode-save-code';
const FIELDS = ['leaves', 'levels', 'achievements', 'runs', 'bestWave', 'bossKills', 'victories', 'maxTier', 'eliteKills'];

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

/** `status`: 'connecting', 'online' or 'offline'. `onChange` runs after the progress changed from the server. */
export const cloud = { code: storage('get', CODE_KEY), status: 'connecting', onChange: null };

// Achievements unlocked this session that the server hasn't confirmed yet: they go with the next run report.
// Only in memory: kept in storage, they could be edited to unlock keepsakes early.
const pending = new Map(); // id → its Golden Leaves (Achievements.js imports this module, so it passes them in)
let eliteBase = meta.eliteKills ?? 0; // elite kills the server knows about

export const notePending = (id, reward) => pending.set(id, reward);

/** Takes the server's progress, keeping achievements (and their leaves) that are still on their way. */
function apply(data) {
  const progress = data.progress;
  cloud.code = data.code;
  storage('set', CODE_KEY, data.code);
  for (const id of progress.achievements) pending.delete(id);
  for (const field of FIELDS) meta[field] = structuredClone(progress[field]);
  meta.achievements.push(...pending.keys());
  for (const reward of pending.values()) meta.leaves += reward;
  eliteBase = progress.eliteKills;
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

/** On start: load this browser's save, or make one. */
export async function initCloud() {
  if (!isPersisting()) return;
  try {
    if (cloud.code) {
      const { ok, status, data } = await request(`/${encodeURIComponent(cloud.code)}`);
      if (ok) return apply(data);
      if (status !== 404) throw new Error(data.error);
    }
    // First visit (or the save is gone): a fresh save. Progress from before cloud saves doesn't carry over.
    pending.clear();
    const { ok, data } = await request('', {});
    if (!ok) throw new Error(data.error);
    apply(data);
  } catch {
    cloud.status = 'offline';
    cloud.onChange?.();
  }
}

/** Continues the progress of another save code. Resolves with an error message, or null. */
export async function loadCode(code) {
  try {
    const { ok, data } = await request(`/${encodeURIComponent(code.trim())}`);
    if (!ok) return data.error ?? "Couldn't load that save.";
    pending.clear();
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
  if (!cloud.code || !isPersisting() || cloud.status === 'offline') return;
  try {
    const body = { ...run, eliteKills: Math.max(0, (meta.eliteKills ?? 0) - eliteBase), achievements: [...pending.keys()] };
    const { ok, data } = await request(`/${encodeURIComponent(cloud.code)}/run`, body);
    if (ok) pending.clear(); // the server decided about every one of them
    if (data.progress) apply(data);
  } catch {
    // Offline for now: this run's leaves stay in this browser until the next sync.
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
