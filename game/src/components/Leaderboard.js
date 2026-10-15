// Talks to the leaderboard API of game/server/server.js. Everything fails quietly:
// without a server (e.g. a static host) the leaderboard simply doesn't show up.

import { meta } from './Meta.js';

const API = '/api/scores';
const NAME_KEY = 'tode-name';

export async function fetchScores(board = 'all', limit = 10) {
  try {
    const response = await fetch(`${API}?board=${board}&limit=${limit}`);
    if (!response.ok) return null;
    return (await response.json()).scores;
  } catch {
    return null;
  }
}

/** Resolves with { rank, dailyRank } or { error }. */
export async function submitScore(entry) {
  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const result = await response.json().catch(() => ({}));
    return response.ok ? result : { error: result.error ?? 'The leaderboard is not available right now.' };
  } catch {
    return { error: 'The leaderboard is not available right now.' };
  }
}

/** The player tag's name (PlayerTag.js), else the name last typed for a score. */
export function playerName() {
  if (meta.profile?.name) return meta.profile.name;
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered; that's fine.
  }
}
