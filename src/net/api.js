// Tiny helpers for the game server's web API (server/api.js). They throw if there's no server.
import { DEMO } from '../core/demo.js';

async function request(path, init, timeout) {
  if (DEMO) throw new Error('No game server in the web demo.');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { cache: 'no-store', ...init, signal: ctl.signal });
    const body = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(body?.error ?? `HTTP ${r.status}`); e.status = r.status; throw e; }
    return body;
  } finally {
    clearTimeout(t);
  }
}

export const getJson = (path, timeout = 4000) => request(path, {}, timeout);

/** keepalive: still delivered if the page is closing (small bodies only). */
export const postJson = (path, body, { timeout = 5000, keepalive = false } = {}) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive }, timeout);
