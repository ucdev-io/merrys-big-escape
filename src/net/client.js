// Talks to the Dog Park server (server/rooms.js) over a WebSocket on the same host, path /ws.
export class NetClient {
  constructor() {
    this.ws = null;
    this.id = null;
    this.code = null;
    this.handlers = {};
    this.sendT = 0;
    this.connected = false;
  }

  on(type, fn) { this.handlers[type] = fn; return this; }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('Could not reach the game server.')), 5000);
      ws.onopen = () => { clearTimeout(timer); this.connected = true; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the game server.')); };
      ws.onclose = () => { this.connected = false; this.handlers.close?.(); };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this.handlers[msg.t]?.(msg);
      };
    });
  }

  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }

  /** Create or join a pack; resolves with the server's welcome message. */
  async enter(kind, data) {
    if (!this.connected) await this.connect();
    return new Promise((resolve, reject) => {
      const prevW = this.handlers.welcome, prevE = this.handlers.error;
      this.handlers.welcome = (m) => { this.handlers.welcome = prevW; this.handlers.error = prevE; this.id = m.id; this.code = m.code; resolve(m); };
      this.handlers.error = (m) => { this.handlers.welcome = prevW; this.handlers.error = prevE; reject(new Error(m.msg)); };
      this.send({ t: kind, ...data });
    });
  }

  /** Send my dog's state, at most ~12 times a second. */
  sendState(dt, pos, heading, speed, flags) {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.08;
    this.send({ t: 's', x: pos.x, z: pos.z, y: pos.y, h: heading, v: speed, f: flags });
  }

  act(a) { this.send({ t: 'act', a }); }
  event(ev) { this.send({ t: 'ev', ev }); }
}
