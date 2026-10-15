// WebSocket client for co-op rooms (server: game/server/server.js, path /ws).
// Messages are batched: game code calls `queue(to, message)` during a frame and `flush()` once per tick.
//
// **Riding out a restart:** when the connection drops while we're in a room (a deploy restarts the server, Wi-Fi
// blips), we don't give up: `reconnecting` is emitted, the socket is opened again with backoff for up to RESUME_FOR,
// and a `resume` message asks for our old room, id and host back. `resumed` follows when it worked; `disconnected`
// when it never did, or `closed` when the room is gone for good.

const RESUME_FOR = 150_000; // ms to keep trying (an App Service restart takes about a minute)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The public rooms that can be joined: { rooms: [{ code, host, players, max }], playing }, or null without a server. */
export async function fetchRooms() {
  try {
    const response = await fetch('/api/rooms', { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.hostId = null;
    this.code = null;
    this.players = [];
    this.started = false;
    this.isPublic = false; // listed for everyone (see server.js), or only joined by code
    this.listeners = new Set();
    this.outbox = new Map(); // to → messages
    this.resuming = null; // { until, session } while getting back into the room after a drop
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isHost() {
    return this.id !== null && this.id === this.hostId;
  }

  get inRoom() {
    return this.code !== null;
  }

  /**
   * `listener(message)` gets every server message (joined, players, relay, error, closed, restarting) and the
   * client's own: disconnected, reconnecting, resumed.
   */
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(message) {
    for (const listener of this.listeners) listener(message);
  }

  connect() {
    if (this.connected) return Promise.resolve();
    if (this.resuming) return Promise.reject(new Error('Reconnecting to the server…'));
    return this.open();
  }

  /** Opens a socket (resolves once it is open). */
  open() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${location.host}/ws`);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('The co-op server is not reachable.'));
      }, 6000);
      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('The co-op server is not reachable.'));
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.resuming) return; // the resume loop tries again
        if (this.code !== null && this.id !== null) return void this.resume();
        this.reset();
        this.emit({ t: 'disconnected' });
      };
      ws.onmessage = (event) => this.receive(JSON.parse(event.data));
    });
  }

  /** Back into our room after the connection dropped (see the top of this file). */
  async resume() {
    const me = this.players.find((p) => p.id === this.id);
    const session = { t: 'resume', code: this.code, id: this.id, hostId: this.hostId, name: me?.name, color: me?.color, public: this.isPublic, started: this.started };
    const resuming = (this.resuming = { until: Date.now() + RESUME_FOR, session });
    this.emit({ t: 'reconnecting' });
    let delay = 1_000;
    while (this.resuming === resuming && Date.now() < resuming.until) {
      await sleep(delay * (0.75 + Math.random() * 0.5));
      delay = Math.min(delay * 1.6, 8_000);
      if (this.resuming !== resuming) return;
      try {
        if (!this.connected) await this.open();
        this.send(session);
        // Wait for the answer ('joined' ends the resume); a socket that closes again just loops.
        for (let waited = 0; waited < 6_000 && this.resuming === resuming && this.connected; waited += 200) await sleep(200);
      } catch {
        // not back yet
      }
    }
    if (this.resuming !== resuming) return;
    this.resuming = null;
    this.ws?.close();
    this.reset();
    this.emit({ t: 'disconnected' });
  }

  receive(message) {
    if (message.t === 'joined') {
      this.id = message.id;
      this.hostId = message.hostId;
      this.code = message.code;
      this.isPublic = Boolean(message.public);
      if (this.resuming) {
        this.resuming = null;
        this.emit(message);
        this.emit({ t: 'resumed' });
        return;
      }
    } else if (message.t === 'players') {
      this.players = message.players;
      this.hostId = message.hostId;
      this.started = message.started;
      this.isPublic = Boolean(message.public);
    } else if (message.t === 'closed') {
      this.resuming = null;
      this.code = null;
      this.players = [];
    }
    this.emit(message);
  }

  send(message) {
    if (this.connected) this.ws.send(JSON.stringify(message));
  }

  async create(name, isPublic = false) {
    await this.connect();
    this.send({ t: 'create', name, public: isPublic });
  }

  /** Quick play: the server puts us in the fullest open public room, or makes a new one. */
  async quick(name) {
    await this.connect();
    this.send({ t: 'quick', name });
  }

  /** Host: list the room for everyone, or make it private (code only). */
  setPublic(on) {
    this.send({ t: 'visibility', public: on });
  }

  /** Host: the run is over, others may join before the next one. */
  reopen() {
    this.send({ t: 'open' });
  }

  async join(code, name) {
    await this.connect();
    this.send({ t: 'join', code, name });
  }

  start() {
    this.send({ t: 'start' });
  }

  leave() {
    this.resuming = null;
    this.send({ t: 'leave' });
    this.code = null;
    this.players = [];
    this.started = false;
  }

  /** Sends right away. `to` is 'all', 'host' or a player id. */
  relay(to, data) {
    this.send({ t: 'relay', to, d: data });
  }

  /** Collects messages until the next `flush()`. */
  queue(to, message) {
    if (!this.outbox.has(to)) this.outbox.set(to, []);
    this.outbox.get(to).push(message);
  }

  flush() {
    for (const [to, messages] of this.outbox) if (messages.length) this.relay(to, messages);
    this.outbox.clear();
  }

  reset() {
    this.resuming = null;
    this.ws = null;
    this.id = null;
    this.hostId = null;
    this.code = null;
    this.players = [];
    this.started = false;
    this.outbox.clear();
  }
}
