// WebSocket client for co-op rooms (server: game/server/server.js, path /ws).
// Messages are batched: game code calls `queue(to, message)` during a frame and `flush()` once per tick.

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

  /** `listener(message)` gets every server message: joined, players, relay, error, closed, disconnected. */
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(message) {
    for (const listener of this.listeners) listener(message);
  }

  connect() {
    if (this.connected) return Promise.resolve();
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
        this.reset();
        this.emit({ t: 'disconnected' });
      };
      ws.onmessage = (event) => this.receive(JSON.parse(event.data));
    });
  }

  receive(message) {
    if (message.t === 'joined') {
      this.id = message.id;
      this.hostId = message.hostId;
      this.code = message.code;
      this.isPublic = Boolean(message.public);
    } else if (message.t === 'players') {
      this.players = message.players;
      this.hostId = message.hostId;
      this.started = message.started;
      this.isPublic = Boolean(message.public);
    } else if (message.t === 'closed') {
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
    this.ws = null;
    this.id = null;
    this.hostId = null;
    this.code = null;
    this.players = [];
    this.started = false;
    this.outbox.clear();
  }
}
