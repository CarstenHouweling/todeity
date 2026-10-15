// Presence: a tiny WebSocket to the game server (/ws?presence=1, see game/server/presence.js) so the owner's admin
// page can show who has the game open and what they are doing: a short state word, the player tag (name, #tag), the
// frog class and a detail line ("wave 7 · Sage Mountain"). It reconnects with backoff when dropped and stays silent
// without a server (static hosts, offline).

let ws = null;
let state = { s: 'title' };
let sentJson = '';
let started = false;
let retryDelay = 2_000;
let retryTimer = null;
let sendTimer = null;
let lastSent = 0;
let opened = false; // connected at least once
let onBack = null;

/** `fn()` runs whenever the presence socket connects again after a drop (the server restarted, say for a deploy). */
export const onServerBack = (fn) => (onBack = fn);

// At most one message per ~second (the server closes sockets that chat more); the latest state wins.
function report() {
  if (sendTimer) return;
  sendTimer = setTimeout(() => {
    sendTimer = null;
    if (ws?.readyState !== 1) return;
    sentJson = JSON.stringify({ t: 'state', ...state });
    ws.send(sentJson);
    lastSent = Date.now();
  }, Math.max(0, lastSent + 1_100 - Date.now()));
}

function connect() {
  retryTimer = null;
  try {
    // Same URL as the co-op client (Net.js); the Vite dev server proxies /ws to `npm run server`.
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?presence=1`);
    ws = socket;
    socket.onopen = () => {
      retryDelay = 2_000;
      sentJson = '';
      report();
      if (opened) onBack?.();
      opened = true;
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      retryTimer = setTimeout(connect, retryDelay * (0.75 + Math.random() * 0.5));
      retryDelay = Math.min(retryDelay * 2, 120_000);
    };
    socket.onerror = () => {}; // 'close' follows and schedules the retry
  } catch {
    // No WebSocket support or a blocked URL: stay offline.
  }
}

/** Opens the presence socket once; later calls do nothing. `initial` is the first state (default 'title'). */
export function startPresence(initial = state) {
  state = typeof initial === 'string' ? { s: initial } : initial;
  if (started || typeof WebSocket === 'undefined') return;
  started = true;
  connect();
  // Coming back online or to the tab: retry right away instead of waiting out the backoff.
  const retryNow = () => {
    if (ws || !retryTimer) return;
    clearTimeout(retryTimer);
    retryDelay = 2_000;
    connect();
  };
  addEventListener('online', retryNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && retryNow());
}

/**
 * What the player is doing now: { s: 'title' | 'garden' | 'visit' | 'lobby' | 'run' | 'daily' | 'coop' | 'paused' |
 * 'gameover', n: name, g: #tag, c: frog class, d: detail line } (or just the state word). Sent only when it changed.
 */
export function setPresence(next) {
  state = typeof next === 'string' ? { s: next } : next;
  if (JSON.stringify({ t: 'state', ...state }) === sentJson) return;
  report();
}
