import * as THREE from 'three';
import { blocked } from '../../../world/spots.js';
import { waterAt } from '../../../world/water.js';

/* Little helpers shared by the town dogs' games. */

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Step towards (tx, tz) at `speed`, veering round anything in the way. Returns the heading, or null if stuck. */
export function stepTo(world, p, tx, tz, speed, dt, pad = 0.2) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return null;
  const step = Math.min(d, speed * dt);
  for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
    const c = Math.cos(a), s = Math.sin(a), vx = (dx / d) * c - (dz / d) * s, vz = (dx / d) * s + (dz / d) * c;
    if (blocked(world, p.x + vx * step, p.z + vz * step, pad)) continue;
    p.x += vx * step;
    p.z += vz * step;
    return Math.atan2(vx, vz);
  }
  return null;
}

/** Nothing solid (or wet) all the way along the straight line from a to b? */
export function clearLine(world, ax, az, bx, bz, pad = 0.4) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(d / 0.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (blocked(world, ax + (bx - ax) * t, az + (bz - az) * t, pad)) return false;
  }
  return true;
}

/** The ground a dog stands on at (x, z): a frozen pond, a snowy hill… (0 most places). */
export const groundY = (world, x, z) => world.heightAt?.(x, z) ?? 0;

/** In water you'd swim in (not a frozen pond)? */
export const wet = (world, x, z) => !!(world.water && waterAt(world.water, x, z));

/** Turn a dog's root smoothly towards heading `h`. */
export function turnTo(root, h, dt, rate = 8) { root.rotation.y += wrap(h - root.rotation.y) * (1 - Math.exp(-dt * rate)); }

/** Face (x, z). */
export function lookAt(root, x, z, dt, rate = 5) { turnTo(root, Math.atan2(x - root.position.x, z - root.position.z), dt, rate); }

/** Inside an axis-aligned rect { x0, z0, x1, z1 } (grown by m)? */
export const inRect = (r, x, z, m = 0) => !!r && x > Math.min(r.x0, r.x1) - m && x < Math.max(r.x0, r.x1) + m && z > Math.min(r.z0, r.z1) - m && z < Math.max(r.z0, r.z1) + m;
