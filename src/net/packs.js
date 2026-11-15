import { BREEDS } from '../entities/breeds.js';
import { townName } from '../world/town/generator.js';

// "Friends playing now": every open neighbourhood on this game server, so joining is one tap —
// no codes to type, no QR codes to scan.

/** { packs: playing now, worlds: saved neighbourhoods } — or null without a game server. */
export async function fetchPacks() {
  try {
    const r = await fetch('/api/packs', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return { packs: d.packs ?? [], worlds: d.worlds ?? [] };
  } catch {
    return null; // no game server (e.g. a plain static host): just don't show the lists
  }
}

/** Keep calling render(packs, worlds) with fresh data until the returned stop() is called. */
export function watchPacks(render, every = 2500) {
  let stopped = false, timer = null;
  const tick = async () => {
    if (stopped) return;
    const d = await fetchPacks();
    if (stopped) return;
    render(d?.packs ?? null, d?.worlds ?? null);
    timer = setTimeout(tick, document.hidden ? 6000 : every);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

const dogLabel = (d) => `${BREEDS[d.breed]?.emoji ?? '🐕'} ${d.name}`;
const ago = (t) => {
  const days = Math.floor((Date.now() - t) / 864e5);
  return days < 1 ? 'today' : days < 2 ? 'yesterday' : days < 14 ? `${days} days ago` : 'a while ago';
};

/** One button per saved neighbourhood that nobody's playing in right now. */
export function renderWorldRows(container, worlds, { onGo, exclude = null } = {}) {
  container.textContent = '';
  const list = (worlds ?? []).filter((w) => !w.live && w.seed !== exclude && w.code).slice(0, 6);
  for (const w of list) {
    const b = document.createElement('button');
    b.className = 'pill big pack-row';
    const top = document.createElement('span');
    top.className = 'pr-top';
    top.textContent = `🏘️ ${townName(w.seed)}`;
    const sub = document.createElement('small');
    const finds = [w.places && `${w.places} place${w.places > 1 ? 's' : ''}`, w.bones && `${w.bones} golden bone${w.bones > 1 ? 's' : ''}`].filter(Boolean).join(', ');
    sub.textContent = `${w.owner ? `${w.owner}'s · ` : ''}${finds ? `${finds} found · ` : ''}played ${ago(w.played)}`;
    b.append(top, sub);
    b.onclick = () => onGo(w);
    container.appendChild(b);
  }
  return list.length;
}

/**
 * Fill `container` with one big button per open neighbourhood. Names come from other
 * players, so everything is set with textContent.
 */
export function renderPackRows(container, list, { onJoin, exclude = null, joinLabel = (p) => `Join ${p.host}` } = {}) {
  container.textContent = '';
  const packs = (list ?? []).filter((p) => p.code !== exclude);
  for (const p of packs) {
    const b = document.createElement('button');
    b.className = 'pill big pack-row';
    b.disabled = p.full;
    const top = document.createElement('span');
    top.className = 'pr-top';
    top.textContent = `🐾 ${p.full ? `${p.host}'s pack is full` : joinLabel(p)}`;
    const sub = document.createElement('small');
    sub.textContent = `${townName(p.seed)} · ${p.dogs.map(dogLabel).join(', ')}`;
    b.append(top, sub);
    b.onclick = () => onJoin(p);
    container.appendChild(b);
  }
  return packs.length;
}
