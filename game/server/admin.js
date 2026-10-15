// Admin access for the game owner: the /admin page (admin.html) and the /api/admin/… API.
// Disabled (everything 404s) unless the ADMIN_TOKEN environment variable is set. Requests authenticate with
// `Authorization: Bearer <token>`. Failed attempts are rate-limited per IP and in total. The token is never logged.
//
//   GET    /api/admin/stats                              online players, co-op rooms, uptime, saves, score counts
//   GET    /api/admin/boards                             every board with its entries (each has an `id`)
//   DELETE /api/admin/boards/:board                      clear a board: all, depth, speed, daily (every day) or daily/YYYY-MM-DD
//   DELETE /api/admin/boards/:board/entries/:id          remove one entry (board as above, daily needs its date)
//   DELETE /api/admin/players/:name                      remove every entry with that name (any case) from all boards

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.ADMIN_TOKEN || '';
const PAGE = join(dirname(fileURLToPath(import.meta.url)), 'admin.html');
const FAIL_WINDOW = 10 * 60_000; // ms
const FAIL_LIMIT = 10; // failed attempts per IP per window, then 429
const GLOBAL_FAIL_LIMIT = 100; // failed attempts from everyone per window (in case IPs are spoofed), then 429
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

const sha256 = (text) => createHash('sha256').update(text).digest();
const TOKEN_HASH = TOKEN ? sha256(TOKEN) : null;

export const adminEnabled = () => Boolean(TOKEN);

// --- Failed attempts ---------------------------------------------------------------

const failures = new Map(); // ip → { since, count }
let globalFailures = { since: 0, count: 0 };

function fresh(entry, now) {
  return entry && now - entry.since < FAIL_WINDOW ? entry : { since: now, count: 0 };
}

function blocked(ip, now) {
  globalFailures = fresh(globalFailures, now);
  return fresh(failures.get(ip), now).count >= FAIL_LIMIT || globalFailures.count >= GLOBAL_FAIL_LIMIT;
}

function fail(ip, now) {
  const entry = fresh(failures.get(ip), now);
  entry.count++;
  failures.set(ip, entry);
  globalFailures.count++;
  if (failures.size > 10_000) for (const [key, value] of failures) if (now - value.since >= FAIL_WINDOW) failures.delete(key);
}

function authorized(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  return Boolean(match) && timingSafeEqual(sha256(match[1].trim()), TOKEN_HASH);
}

// --- Page ----------------------------------------------------------------------------

/** Serves admin.html at /admin (404 while admin is disabled). The page itself holds no secrets. */
export async function serveAdminPage(res, send) {
  if (!TOKEN) return send(res, 404, 'Not found.');
  res.writeHead(200, PAGE_HEADERS);
  res.end(await readFile(PAGE));
}

// --- API -----------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BOARD_TITLES = { all: 'All-time score', depth: 'Deepest runs', speed: 'Fastest clears', coop2: 'Co-op: 2 frogs', coop3: 'Co-op: 3 frogs', coop4: 'Co-op: 4 frogs' };

function listBoards(boards) {
  const list = Object.entries(BOARD_TITLES).map(([key, title]) => ({ key, title, entries: boards[key] ?? [] }));
  for (const date of Object.keys(boards.daily).sort().reverse()) {
    list.push({ key: `daily/${date}`, title: `Daily Brew ${date}`, entries: boards.daily[date] });
  }
  return list;
}

/** Resolves ['daily', '2026-10-15', 'entries', 'ab12'] to { key, list, rest }; `list` is null for "every daily". */
function resolveBoard(boards, parts) {
  const [name, maybeDate] = parts;
  if (name === 'daily') {
    if (maybeDate && DATE.test(maybeDate)) return { key: `daily/${maybeDate}`, list: boards.daily[maybeDate], date: maybeDate, rest: parts.slice(2) };
    return { key: 'daily', list: null, rest: parts.slice(1) };
  }
  if (name in BOARD_TITLES) return { key: name, list: boards[name], rest: parts.slice(1) };
  return null;
}

const sameName = (a, b) => String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase();

/**
 * Handles /api/admin/…. `ctx`: { send, ip, boards() → the scores object, saveScores() → Promise,
 * stats() → extra fields for /stats (presence, co-op, saves, uptime) }.
 */
export async function handleAdmin(req, res, url, ctx) {
  const { send, ip } = ctx;
  if (!TOKEN) return send(res, 404, { error: 'Not found.' });
  const now = Date.now();
  if (blocked(ip, now)) return send(res, 429, { error: 'Too many failed attempts. Try again later.' });
  if (!authorized(req)) {
    fail(ip, now);
    return send(res, 401, { error: 'Wrong or missing token.' }, { 'WWW-Authenticate': 'Bearer' });
  }

  let parts;
  try {
    parts = url.pathname.split('/').slice(3).filter(Boolean).map(decodeURIComponent); // after '', 'api', 'admin'
  } catch {
    return send(res, 400, { error: 'Bad path.' });
  }
  const boards = ctx.boards();
  const [section] = parts;

  if (section === 'stats' && parts.length === 1) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
    const daily = Object.fromEntries(Object.keys(boards.daily).sort().map((date) => [date, boards.daily[date].length]));
    return send(res, 200, {
      ...ctx.stats(),
      scores: { all: boards.all.length, depth: boards.depth.length, speed: boards.speed.length, coop2: boards.coop2?.length ?? 0, coop3: boards.coop3?.length ?? 0, coop4: boards.coop4?.length ?? 0, daily },
    });
  }

  if (section === 'boards') {
    if (parts.length === 1) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
      return send(res, 200, { boards: listBoards(boards) });
    }
    if (req.method !== 'DELETE') return send(res, 405, { error: 'Method not allowed.' });
    const target = resolveBoard(boards, parts.slice(1));
    if (!target) return send(res, 404, { error: 'No such board.' });

    if (target.rest.length === 0) {
      let removed;
      if (target.key === 'daily') {
        removed = Object.values(boards.daily).reduce((sum, list) => sum + list.length, 0);
        for (const date of Object.keys(boards.daily)) delete boards.daily[date];
      } else if (target.date) {
        removed = target.list?.length ?? 0;
        delete boards.daily[target.date];
      } else {
        removed = target.list.length;
        target.list.length = 0;
      }
      await ctx.saveScores();
      console.log(`[admin] cleared board ${target.key} (${removed} entries) from ${ip}`);
      return send(res, 200, { board: target.key, removed });
    }

    if (target.rest.length === 2 && target.rest[0] === 'entries' && target.list) {
      const index = target.list.findIndex((entry) => entry.id === target.rest[1]);
      if (index < 0) return send(res, 404, { error: 'No such entry.' });
      const [entry] = target.list.splice(index, 1);
      await ctx.saveScores();
      console.log(`[admin] removed ${entry.name} (${entry.score}) from ${target.key} from ${ip}`);
      return send(res, 200, { board: target.key, removed: entry });
    }
    return send(res, 404, { error: 'Not found.' });
  }

  if (section === 'players' && parts.length === 2) {
    if (req.method !== 'DELETE') return send(res, 405, { error: 'Method not allowed.' });
    const name = parts[1];
    const removed = {};
    for (const { key, entries } of listBoards(boards)) {
      const before = entries.length;
      // Co-op teams count too: a team with that frog in it goes.
      for (let i = entries.length - 1; i >= 0; i--) if (sameName(entries[i].name, name) || entries[i].team?.some((member) => sameName(member, name))) entries.splice(i, 1);
      if (entries.length < before) removed[key] = before - entries.length;
    }
    const total = Object.values(removed).reduce((sum, n) => sum + n, 0);
    if (total) await ctx.saveScores();
    console.log(`[admin] removed ${total} entries by ${name} from ${ip}`);
    return send(res, 200, { name, removed, total });
  }

  return send(res, 404, { error: 'Not found.' });
}
