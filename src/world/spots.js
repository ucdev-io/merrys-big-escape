import { waterAt } from './water.js';

/** Is (x, z) inside something solid (a wall, hedge, fence, tree, bin…) or in the water? */
export function blocked(world, x, z, pad = 0.45) {
  const col = world.colliders;
  for (const c of col.circles) if (c.top > 0.25 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  for (const b of col.boxes) if (b.top > 0.25 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  return !!(world.water && waterAt(world.water, x, z, true)); // (frozen or not: nothing's put down on the pond)
}

/** A free spot a dog can walk to, between rMin and rMax from (cx, cz). null if none turns up. */
export function freeSpot(world, rng, cx, cz, rMin, rMax, { pad = 0.6, tries = 80 } = {}) {
  const b = world.bounds;
  for (let i = 0; i < tries; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(rMin, rMax);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (b && (x < b.x0 + 1.5 || x > b.x1 - 1.5 || z < b.z0 + 1.5 || z > b.z1 - 1.5)) continue;
    if (!blocked(world, x, z, pad)) return { x, z };
  }
  return null;
}
