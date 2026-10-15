// Presence: every open game keeps a tiny WebSocket on /ws?presence=1 (src/components/Presence.js), so the admin
// page can show how many players are online and what they are doing. Presence sockets live in their own
// WebSocketServer: they never reach the co-op relay, so they can't join rooms or touch a run.
//
// client → server: { t: 'state', s: 'title' | 'run' | 'coop' | …, n: name, g: #tag, c: frog class, d: detail }
//   `s` is a short lowercase word; `d` a short line for the admin page ("wave 7 · Sage Mountain"). Only the admin
//   API ever shows them (presenceStats → GET /api/admin/stats).
// server → client: nothing (pings only)

import { WebSocketServer } from 'ws';
import { publicName } from '../src/components/PlayerTag.js';

const PER_IP = 8; // presence sockets per IP (a household or a classroom behind one address)
const MAX_TOTAL = 5_000; // presence sockets in total
const MAX_MESSAGE = 512; // bytes; bigger messages close the socket
const BURST = 5; // messages allowed at once…
const REFILL = 1_000; // …then one per second; faster clients get disconnected
const PING_EVERY = 20_000; // ms; sockets that miss a pong are dropped

const presence = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE, perMessageDeflate: false });
const perIp = new Map(); // ip → open presence sockets
let peak = 0;
let peakAt = null;

const cleanState = (state) => (typeof state === 'string' && /^[a-z0-9_-]{1,16}$/.test(state) ? state : 'other');
// A detail line: letters, digits and a little punctuation, short.
const cleanDetail = (text) => (typeof text === 'string' ? text.replace(/[^\p{L}\p{N} _.,:'·×#()/+-]/gu, '').slice(0, 80) : '');

function reject(socket, status) {
  socket.on('error', () => {});
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** Handles an HTTP upgrade for /ws?presence=1. */
export function acceptPresence(req, socket, head, ip) {
  if ((perIp.get(ip) ?? 0) >= PER_IP || presence.clients.size >= MAX_TOTAL) return reject(socket, '429 Too Many Requests');
  presence.handleUpgrade(req, socket, head, (ws) => {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    ws.isAlive = true;
    ws.state = 'unknown';
    ws.info = { name: null, tag: null, cls: null, detail: '' };
    ws.connectedAt = Date.now();
    ws.stateSince = Date.now();
    ws.tokens = BURST;
    ws.refilled = Date.now();
    if (presence.clients.size > peak) {
      peak = presence.clients.size;
      peakAt = Date.now();
    }

    ws.on('pong', () => (ws.isAlive = true));
    ws.on('error', () => {}); // e.g. an oversized message; 'close' follows
    ws.on('message', (raw, isBinary) => {
      const now = Date.now();
      ws.tokens = Math.min(BURST, ws.tokens + (now - ws.refilled) / REFILL);
      ws.refilled = now;
      if (ws.tokens < 1 || isBinary) return ws.close(1008, 'Too chatty');
      ws.tokens -= 1;
      try {
        const message = JSON.parse(raw);
        if (message?.t === 'state') {
          const state = cleanState(message.s);
          if (state !== ws.state) ws.stateSince = now;
          ws.state = state;
          ws.info = {
            name: message.n ? publicName(message.n, 'Frog') : null,
            tag: /^\d{4}$/.test(message.g) ? message.g : null,
            cls: /^[a-z]{2,16}$/.test(message.c) ? message.c : null,
            detail: cleanDetail(message.d),
          };
        }
      } catch {
        // Ignore garbage.
      }
    });
    ws.on('close', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left > 0) perIp.set(ip, left);
      else perIp.delete(ip);
    });
  });
}

// Drop sockets that stopped answering (closed laptops, lost Wi-Fi).
setInterval(() => {
  for (const ws of presence.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, PING_EVERY).unref();

/** { online, byState: { title: 3, run: 2 }, peak, peakAt, addresses, players: [{ name, tag, cls, state, detail, since, connected }] } */
export function presenceStats() {
  const byState = {};
  const players = [];
  for (const ws of presence.clients) {
    byState[ws.state] = (byState[ws.state] ?? 0) + 1;
    players.push({ ...ws.info, state: ws.state, since: ws.stateSince, connected: ws.connectedAt });
  }
  players.sort((a, b) => a.state.localeCompare(b.state) || a.connected - b.connected);
  return { online: presence.clients.size, byState, peak, peakAt, addresses: perIp.size, players: players.slice(0, 500) };
}
