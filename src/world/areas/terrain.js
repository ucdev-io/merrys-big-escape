import { fbm3 } from '../../core/rng.js';

// The lie of the land: flat where the town and its areas are, rolling hills everywhere else. Shared by
// the ground mesh (builders.js) and anything that has to sit on the hills (trees beyond an area).

/** How far (x, z) is outside the nearest flat rect ({ x0, z0, x1, z1 }), in metres (0 inside one). */
export function flatOut(flats, x, z) {
  let best = Infinity;
  for (const r of flats) {
    const d = Math.hypot(Math.max(0, r.x0 - x, x - r.x1), Math.max(0, r.z0 - z, z - r.z1));
    if (d < best) best = d;
  }
  return best;
}

/** Ground height at (x, z), `out` metres from the flat ground (the hills rise over the first 25 m). */
export function hillHeight(x, z, out) {
  const hill = (fbm3(x * 0.03, 0, z * 0.03, 4) - 0.3) * 10 * Math.min(1, out / 25);
  return out > 0 ? Math.max(0, hill) - 0.05 : -0.05;
}

export const groundAt = (flats, x, z) => hillHeight(x, z, flatOut(flats, x, z));
