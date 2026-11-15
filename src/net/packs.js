import { BREEDS } from '../entities/breeds.js';
import { townName } from '../world/town/generator.js';

// "Friends playing now": every open neighbourhood on this game server, so joining is one tap —
// no codes to type, no QR codes to scan.

export async function fetchPacks() {
  try {
    const r = await fetch('/api/packs', { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).packs ?? [];
  } catch {
    return null; // no game server (e.g. a plain static host): just don't show the list
  }
}

/** Keep calling render(list) with fresh data until the returned stop() is called. */
export function watchPacks(render, every = 2500) {
  let stopped = false, timer = null;
  const tick = async () => {
    if (stopped) return;
    const list = await fetchPacks();
    if (stopped) return;
    render(list);
    timer = setTimeout(tick, document.hidden ? 6000 : every);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

const dogLabel = (d) => `${BREEDS[d.breed]?.emoji ?? '🐕'} ${d.name}`;

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
