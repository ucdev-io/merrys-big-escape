import { COSMETIC } from './cosmetics.js';

/*
 * What makes your dog quicker: ⚡ speed (walking and running) and 💨 zoomies (how long the zoomies
 * bar lasts). Every level adds a point of each, and clothes add more (see cosmetics.js).
 */
export const STATS = {
  speed: { emoji: '⚡', name: 'Speed' },
  zoomies: { emoji: '💨', name: 'Zoomies' },
};
const LEVEL_POINTS_MAX = 20; // points from levels stop growing at level 21

export function levelStats(level) {
  const n = Math.max(0, Math.min(LEVEL_POINTS_MAX, level - 1));
  return { speed: n, zoomies: n };
}

export function outfitStats(look) {
  const s = { speed: 0, zoomies: 0 };
  for (const id of Object.values(look ?? {})) for (const [k, v] of Object.entries(COSMETIC[id]?.boost ?? {})) s[k] += v;
  return s;
}

export function statsFor(level, look) {
  const a = levelStats(level), b = outfitStats(look);
  return { speed: a.speed + b.speed, zoomies: a.zoomies + b.zoomies };
}

/** Each ⚡ point: 1.5% quicker. Each 💨 point: the zoomies bar lasts 4% longer. */
export const speedMult = (s) => 1 + 0.015 * (s?.speed ?? 0);
export const zoomiesMult = (s) => 1 + 0.04 * (s?.zoomies ?? 0);

/** "+2 ⚡ +1 💨" */
export const boostText = (b) => Object.entries(b ?? {}).filter(([, v]) => v).map(([k, v]) => `+${v} ${STATS[k].emoji}`).join(' ');
