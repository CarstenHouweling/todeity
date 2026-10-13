// Todeity game server: serves the built game (../dist) and the leaderboard API.
// No dependencies, so it runs on any Node 18+ host (Azure App Service, a VM, locally).
//
//   GET  /api/scores?board=all|daily&date=YYYY-MM-DD&limit=10
//   POST /api/scores  { name, score, wave, tier, kills, time, victory, daily }
//
// Scores are kept in a JSON file in DATA_DIR (default ./data; on Azure App Service use /home/data,
// which survives restarts and deploys).

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DIST = join(here, '..', 'dist');
const DATA_DIR = process.env.DATA_DIR || join(here, 'data');
const SCORES_FILE = join(DATA_DIR, 'scores.json');
const KEEP = 100; // entries kept per board
const POST_INTERVAL = 10_000; // ms between submissions per IP
const MAX_BODY = 4_096; // bytes

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

// --- Score storage ---------------------------------------------------------------

let boards = { all: [], daily: {} };
let saving = Promise.resolve();

async function loadScores() {
  try {
    boards = JSON.parse(await readFile(SCORES_FILE, 'utf8'));
  } catch {
    boards = { all: [], daily: {} };
  }
}

function saveScores() {
  // Serialise writes so concurrent submissions never interleave.
  saving = saving.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(SCORES_FILE, JSON.stringify(boards));
  });
  return saving;
}

function insert(board, entry) {
  board.push(entry);
  board.sort((a, b) => b.score - a.score || a.at - b.at);
  board.length = Math.min(board.length, KEEP);
  const rank = board.indexOf(entry);
  return rank >= 0 ? rank + 1 : null;
}

const today = () => new Date().toISOString().slice(0, 10);

// --- Validation ----------------------------------------------------------------

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

function cleanName(name) {
  const cleaned = String(name ?? '')
    .replace(/[^\p{L}\p{N} _.\-!?']/gu, '')
    .trim()
    .slice(0, 16);
  return cleaned || 'Anonymous Frog';
}

function parseEntry(body) {
  const entry = {
    name: cleanName(body.name),
    score: clampInt(body.score, 0, 10_000_000),
    wave: clampInt(body.wave, 1, 999),
    tier: clampInt(body.tier, 0, 4),
    kills: clampInt(body.kills, 0, 1_000_000),
    time: clampInt(body.time, 0, 86_400),
    victory: Boolean(body.victory),
    at: Date.now(),
  };
  // A loose sanity check: scores grow with time and kills, not out of nowhere.
  const plausible = entry.score <= 2_000 + entry.kills * 200 + entry.wave * 2_000;
  return plausible ? entry : null;
}

// --- HTTP ---------------------------------------------------------------------

const lastPost = new Map();

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': json ? 'application/json' : 'text/plain',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleScores(req, res, url) {
  if (req.method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit') ?? 10, 1, KEEP);
    const daily = url.searchParams.get('board') === 'daily';
    const date = url.searchParams.get('date') || today();
    const board = daily ? boards.daily[date] ?? [] : boards.all;
    return send(res, 200, { board: daily ? 'daily' : 'all', date, scores: board.slice(0, limit) });
  }

  if (req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (Date.now() - (lastPost.get(ip) ?? 0) < POST_INTERVAL) return send(res, 429, { error: 'Slow down a little.' });
    lastPost.set(ip, Date.now());

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'Invalid JSON.' });
    }
    const entry = parseEntry(body);
    if (!entry) return send(res, 400, { error: 'That score looks a bit too good to be true.' });

    const rank = insert(boards.all, entry);
    let dailyRank = null;
    if (body.daily) {
      const date = today();
      boards.daily[date] ??= [];
      dailyRank = insert(boards.daily[date], { ...entry });
      // Keep only the last two weeks of daily boards.
      for (const old of Object.keys(boards.daily).sort().slice(0, -14)) delete boards.daily[old];
    }
    await saveScores();
    return send(res, 201, { rank, dailyRank });
  }

  return send(res, 405, { error: 'Method not allowed.' });
}

async function serveStatic(res, pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(DIST) || !existsSync(file)) file = join(DIST, 'index.html');
  try {
    const data = await readFile(file);
    const cache = file.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  } catch {
    send(res, 404, 'Not found. Did you run "npm run build"?');
  }
}

await loadScores();

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/scores') return await handleScores(req, res, url);
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    return await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Something went wrong.' });
  }
}).listen(PORT, () => console.log(`Todeity server on http://localhost:${PORT}`));
