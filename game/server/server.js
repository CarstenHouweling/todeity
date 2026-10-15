// Todeity game server: serves the built game (../dist), the leaderboard API and the co-op relay.
// Runs on any Node 18+ host (Azure App Service, a VM, locally). Its only dependency is `ws`.
//
//   GET  /api/scores?board=all|daily|depth|speed&date=YYYY-MM-DD&limit=10
//   POST /api/scores  { name, score, wave, level, tier, kills, time, clear, victory, daily, steep }
//   /api/save…        cloud saves with easy save codes (see saves.js)
//
// Boards: `all` (score), `daily` (score, today's seeded run), `depth` (wave, then level) and `speed` (runs that
// beat Bee-zebub, by clear time: play time, menus and pauses excluded).
//   GET  /api/rooms   public co-op rooms that can be joined
//   WS   /ws          co-op rooms (see "Co-op relay" below)
//   WS   /ws?presence=1   who is online (see presence.js)
//   /admin, /api/admin/…  the owner's admin page and API, only when ADMIN_TOKEN is set (see admin.js)
//
// Scores are kept in a JSON file in DATA_DIR (default ./data; on Azure App Service use /home/data,
// which survives restarts and deploys).

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { handleSave, loadSaves, saveCount } from './saves.js';
import { acceptPresence, presenceStats } from './presence.js';
import { adminEnabled, handleAdmin, serveAdminPage } from './admin.js';
import { CLASSES } from '../src/components/Classes.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DIST = join(here, '..', 'dist');
const DATA_DIR = process.env.DATA_DIR || join(here, 'data');
const SCORES_FILE = join(DATA_DIR, 'scores.json');
const KEEP = 100; // entries kept per board
const POST_INTERVAL = 10_000; // ms between submissions per IP
const MAX_BODY = 4_096; // bytes
const CLASS_IDS = CLASSES.map((c) => c.id);
const STARTED_AT = Date.now();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

// --- Score storage ---------------------------------------------------------------

let boards = { all: [], daily: {}, depth: [], speed: [] };
let saving = Promise.resolve();

// Every entry has a short random `id` (the admin API deletes by it). Copies of one run on several boards share it.
const newId = () => randomBytes(5).toString('hex');

async function loadScores() {
  try {
    boards = { all: [], daily: {}, depth: [], speed: [], ...JSON.parse(await readFile(SCORES_FILE, 'utf8')) };
  } catch {
    boards = { all: [], daily: {}, depth: [], speed: [] };
  }
  // Scores from before entries had ids get one now.
  let added = 0;
  for (const list of [boards.all, boards.depth, boards.speed, ...Object.values(boards.daily)]) {
    for (const entry of list) {
      if (entry.id) continue;
      entry.id = newId();
      added++;
    }
  }
  if (added) await saveScores();
}

function saveScores() {
  // Serialise writes so concurrent submissions never interleave.
  saving = saving.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(SCORES_FILE, JSON.stringify(boards));
  });
  return saving;
}

const ORDERS = {
  score: (a, b) => b.score - a.score || a.at - b.at,
  depth: (a, b) => b.wave - a.wave || (b.level ?? 0) - (a.level ?? 0) || b.score - a.score || a.at - b.at,
  speed: (a, b) => a.clear - b.clear || a.at - b.at,
};

function insert(board, entry, order = ORDERS.score) {
  board.push(entry);
  board.sort(order);
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
    level: clampInt(body.level, 0, 999),
    tier: clampInt(body.tier, 0, 5),
    kills: clampInt(body.kills, 0, 1_000_000),
    time: clampInt(body.time, 0, 86_400),
    victory: Boolean(body.victory),
    clear: clampInt(body.clear, 0, 86_400), // seconds to beat Bee-zebub (0: not beaten)
    steep: clampInt(body.steep, 0, 40), // Steeping vows taken (they multiply the score)
    cls: CLASS_IDS.includes(body.cls) ? body.cls : 'tode', // the frog that played (src/components/Classes.js)
    at: Date.now(),
    id: newId(),
  };
  // A loose sanity check: scores grow with time and kills, not out of nowhere.
  // The Daily Brew's trials multiply the score too (at most about ×2.6 on a Trial Day).
  const plausible = entry.score <= (2_000 + entry.kills * 200 + entry.wave * 2_000) * (1 + 0.12 * entry.steep) * (body.daily ? 2.6 : 1);
  return plausible ? entry : null;
}

// --- HTTP ---------------------------------------------------------------------

const lastPost = new Map();

// Azure's front end may add the client's port ("1.2.3.4:5678"); strip it so limits per IP hold.
const stripPort = (ip) => (/^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(ip) ?? /^\[([^\]]+)\](?::\d+)?$/.exec(ip))?.[1] ?? ip;
const clientIp = (req) => stripPort(req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '');

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
    const name = ['daily', 'depth', 'speed'].includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'all';
    const date = url.searchParams.get('date') || today();
    const board = name === 'daily' ? boards.daily[date] ?? [] : boards[name];
    return send(res, 200, { board: name, date, scores: board.slice(0, limit) });
  }

  if (req.method === 'POST') {
    const ip = clientIp(req);
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
    const depthRank = insert(boards.depth, { ...entry }, ORDERS.depth);
    const speedRank = entry.victory && entry.clear > 0 ? insert(boards.speed, { ...entry }, ORDERS.speed) : null;
    let dailyRank = null;
    if (body.daily) {
      const date = today();
      boards.daily[date] ??= [];
      dailyRank = insert(boards.daily[date], { ...entry });
      // Keep only the last two weeks of daily boards.
      for (const old of Object.keys(boards.daily).sort().slice(0, -14)) delete boards.daily[old];
    }
    await saveScores();
    return send(res, 201, { rank, dailyRank, depthRank, speedRank });
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
// Rooms are private (joined with their code or an invite link) or public: listed by GET /api/rooms, joined with a
// click, and filled by Quick play (the fullest open public room, or a new one).
//
// client → server: { t: 'create', name, public } | { t: 'join', code, name } | { t: 'quick', name }
//                  { t: 'visibility', public } (host) | { t: 'start' } / { t: 'open' } (host: a run starts / ended)
//                  { t: 'relay', to: 'all'|'host'|id, d } | { t: 'leave' }
// server → client: { t: 'joined', code, id, hostId, public } | { t: 'players', players, hostId, started, public }
//                  { t: 'relay', from, d } | { t: 'error', message } | { t: 'closed', reason }

const MAX_PLAYERS = 4;
const COLORS = ['#7ed957', '#5fb8ff', '#ff9ec7', '#ffd23f'];
const rooms = new Map();
const MAX_PUBLIC_ROOMS = 200; // a list longer than this is noise (and a sign of abuse)
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
  for (const client of room.clients.values()) sendTo(client.ws, { t: 'players', players, hostId: room.hostId, started: room.started, public: room.public });
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
  sendTo(client.ws, { t: 'joined', code: room.code, id: client.id, hostId: room.hostId, public: room.public });
  broadcastPlayers(room);
}

function createRoom(client, name, isPublic) {
  const room = { code: makeCode(), hostId: client.id, clients: new Map(), started: false, public: isPublic && publicCount() < MAX_PUBLIC_ROOMS, createdAt: Date.now() };
  rooms.set(room.code, room);
  joinRoom(client, room, name);
}

const publicCount = () => [...rooms.values()].filter((room) => room.public).length;

/** Public rooms that can be joined right now: the fullest first, then the oldest. */
function openPublicRooms() {
  return [...rooms.values()]
    .filter((room) => room.public && !room.started && room.clients.size < MAX_PLAYERS)
    .sort((a, b) => b.clients.size - a.clients.size || a.createdAt - b.createdAt);
}

/** GET /api/rooms: the public rooms list (and how many players are in co-op right now). */
function listRooms(res) {
  const open = openPublicRooms().slice(0, 50);
  send(res, 200, {
    rooms: open.map((room) => ({
      code: room.code,
      host: room.clients.get(room.hostId)?.name ?? 'Frog',
      players: room.clients.size,
      max: MAX_PLAYERS,
    })),
    playing: [...rooms.values()].reduce((sum, room) => sum + (room.started ? room.clients.size : 0), 0),
  }, { 'Cache-Control': 'no-store' });
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
    createRoom(client, message.name, Boolean(message.public));
  } else if (message.t === 'quick') {
    // Quick play: the fullest public room that still has space (players find each other fast), or a new one.
    leaveRoom(client);
    const room = openPublicRooms()[0];
    if (room) joinRoom(client, room, message.name);
    else createRoom(client, message.name, true);
  } else if (message.t === 'visibility' && client.room?.hostId === client.id) {
    client.room.public = Boolean(message.public) && (client.room.public || publicCount() < MAX_PUBLIC_ROOMS);
    broadcastPlayers(client.room);
  } else if (message.t === 'open' && client.room?.hostId === client.id) {
    client.room.started = false; // the run is over: others may join before the next one
    broadcastPlayers(client.room);
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

const RELAY_PER_IP = 16; // co-op sockets per IP
const relayPerIp = new Map();
const sockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
sockets.on('connection', (ws, req, ip) => {
  const client = { id: nextClientId++, ws, room: null };
  relayPerIp.set(ip, (relayPerIp.get(ip) ?? 0) + 1);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => handleSocketMessage(client, raw));
  ws.on('close', () => {
    leaveRoom(client);
    const left = (relayPerIp.get(ip) ?? 1) - 1;
    if (left > 0) relayPerIp.set(ip, left);
    else relayPerIp.delete(ip);
  });
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
await loadSaves(DATA_DIR);

// Extra fields for GET /api/admin/stats (admin.js adds the score counts).
const adminStats = () => ({
  startedAt: STARTED_AT,
  uptime: Math.round((Date.now() - STARTED_AT) / 1000),
  presence: presenceStats(),
  coop: {
    sockets: sockets.clients.size,
    rooms: [...rooms.values()].map((room) => ({
      code: room.code,
      players: room.clients.size,
      started: room.started,
      public: room.public,
      host: room.clients.get(room.hostId)?.name ?? null,
    })),
  },
  saves: saveCount(),
  memoryMb: Math.round(process.memoryUsage().rss / 1048576),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/scores') return await handleScores(req, res, url);
    if (url.pathname === '/api/save' || url.pathname.startsWith('/api/save/')) {
      return await handleSave(req, res, url, { send, ip: clientIp(req), readJson: async (r) => JSON.parse((await readBody(r)) || '{}') });
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (url.pathname === '/api/rooms' && req.method === 'GET') return listRooms(res);
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) {
      return await handleAdmin(req, res, url, { send, ip: clientIp(req), boards: () => boards, saveScores, stats: adminStats });
    }
    if (url.pathname === '/admin' || url.pathname === '/admin/') return await serveAdminPage(res, send);
    return await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Something went wrong.' });
  }
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  const ip = clientIp(req);
  if (url.searchParams.has('presence')) return acceptPresence(req, socket, head, ip);
  if ((relayPerIp.get(ip) ?? 0) >= RELAY_PER_IP) {
    socket.on('error', () => {});
    return socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }
  sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req, ip));
});

server.listen(PORT, () => console.log(`Todeity server on http://localhost:${PORT}${adminEnabled() ? ' (admin on /admin)' : ''}`));
