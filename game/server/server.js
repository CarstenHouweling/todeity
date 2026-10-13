// Todeity game server: serves the built game (../dist), the leaderboard API and the co-op relay.
// Runs on any Node 18+ host (Azure App Service, a VM, locally). Its only dependency is `ws`.
//
//   GET  /api/scores?board=all|daily&date=YYYY-MM-DD&limit=10
//   POST /api/scores  { name, score, wave, tier, kills, time, victory, daily }
//   WS   /ws          co-op rooms (see "Co-op relay" below)
//
// Scores are kept in a JSON file in DATA_DIR (default ./data; on Azure App Service use /home/data,
// which survives restarts and deploys).

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

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

// --- Co-op relay -------------------------------------------------------------------
// Rooms have a 4-letter code and up to 4 players. The server only forwards messages; the host's
// browser runs the bees and the waves.
//
// client → server: { t: 'create', name } | { t: 'join', code, name } | { t: 'relay', to: 'all'|'host'|id, d }
// server → client: { t: 'joined', code, id, hostId } | { t: 'players', players, hostId, started }
//                  { t: 'relay', from, d } | { t: 'error', message } | { t: 'closed', reason }

const MAX_PLAYERS = 4;
const COLORS = ['#7ed957', '#5fb8ff', '#ff9ec7', '#ffd23f'];
const rooms = new Map();
let nextClientId = 1;

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, to avoid confusion with 1 and 0
  let code;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

const sendTo = (ws, message) => ws.readyState === 1 && ws.send(JSON.stringify(message));

function broadcastPlayers(room) {
  const players = [...room.clients.values()].map(({ id, name, color }) => ({ id, name, color }));
  for (const client of room.clients.values()) sendTo(client.ws, { t: 'players', players, hostId: room.hostId, started: room.started });
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  room.clients.delete(client.id);
  client.room = null;
  if (client.id === room.hostId || room.clients.size === 0) {
    for (const other of room.clients.values()) {
      sendTo(other.ws, { t: 'closed', reason: 'The host left the game.' });
      other.room = null;
    }
    rooms.delete(room.code);
  } else {
    broadcastPlayers(room);
  }
}

function joinRoom(client, room, name) {
  const used = new Set([...room.clients.values()].map((c) => c.color));
  client.name = String(name ?? '').replace(/[^\p{L}\p{N} _.\-!?']/gu, '').trim().slice(0, 16) || 'Frog';
  client.color = COLORS.find((color) => !used.has(color));
  client.room = room;
  room.clients.set(client.id, client);
  sendTo(client.ws, { t: 'joined', code: room.code, id: client.id, hostId: room.hostId });
  broadcastPlayers(room);
}

function handleSocketMessage(client, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (message.t === 'create') {
    leaveRoom(client);
    const room = { code: makeCode(), hostId: client.id, clients: new Map(), started: false };
    rooms.set(room.code, room);
    joinRoom(client, room, message.name);
  } else if (message.t === 'join') {
    const room = rooms.get(String(message.code ?? '').toUpperCase().trim());
    if (!room) return sendTo(client.ws, { t: 'error', message: 'No room with that code.' });
    if (room.started) return sendTo(client.ws, { t: 'error', message: 'That run has already started.' });
    if (room.clients.size >= MAX_PLAYERS) return sendTo(client.ws, { t: 'error', message: 'That room is full.' });
    leaveRoom(client);
    joinRoom(client, room, message.name);
  } else if (message.t === 'leave') {
    leaveRoom(client);
  } else if (message.t === 'start' && client.room?.hostId === client.id) {
    client.room.started = true;
    broadcastPlayers(client.room);
  } else if (message.t === 'relay' && client.room) {
    const { room } = client;
    const out = JSON.stringify({ t: 'relay', from: client.id, d: message.d });
    for (const other of room.clients.values()) {
      if (other === client) continue;
      const wanted = message.to === 'all' || (message.to === 'host' ? other.id === room.hostId : other.id === message.to);
      if (wanted && other.ws.readyState === 1) other.ws.send(out);
    }
  }
}

const sockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
sockets.on('connection', (ws) => {
  const client = { id: nextClientId++, ws, room: null };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => handleSocketMessage(client, raw));
  ws.on('close', () => leaveRoom(client));
});

// Drop connections that stopped answering (closed laptops, lost Wi-Fi).
setInterval(() => {
  for (const ws of sockets.clients) {
    if (!ws.isAlive) ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);

await loadScores();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/scores') return await handleScores(req, res, url);
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    return await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Something went wrong.' });
  }
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws') return socket.destroy();
  sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req));
});

server.listen(PORT, () => console.log(`Todeity server on http://localhost:${PORT}`));
