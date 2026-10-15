// Presence: a tiny WebSocket to the game server (/ws?presence=1, see game/server/presence.js) so the owner's admin
// page can count who has the game open and what they are doing. It sends nothing but a short state word, reconnects
// with backoff when dropped and stays silent without a server (static hosts, offline).

let ws = null;
let state = 'title';
let started = false;
let retryDelay = 2_000;
let retryTimer = null;
let sendTimer = null;
let lastSent = 0;

// At most one message per ~second (the server closes sockets that chat more); the latest state wins.
function report() {
  if (sendTimer) return;
  sendTimer = setTimeout(() => {
    sendTimer = null;
    if (ws?.readyState !== 1) return;
    ws.send(JSON.stringify({ t: 'state', s: state }));
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
      report();
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
  state = initial;
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

/** What the player is doing now: a short lowercase word such as 'title', 'run' or 'coop'. */
export function setPresence(next) {
  if (next === state) return;
  state = next;
  report();
}
