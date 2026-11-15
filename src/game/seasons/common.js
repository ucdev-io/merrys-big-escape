import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { TOWN } from '../../world/town/generator.js';
import { blocked } from '../../world/spots.js';

// Bits shared by the seasonal things (see ./seasons.js): where they can go, and how high the ground is.

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
const H = TOWN.BLOCK / 2, STEP = TOWN.BLOCK + TOWN.ROAD, ORIGIN = -TOWN.SIZE / 2 + TOWN.ROAD;

/** A new random stream for this town (never one the town is built from, so nothing else moves). */
export const seasonRng = (seed, name) => new RNG(`season:${name}:${seed}`);

/** The town block at (x, z), with (dx, dz) from its centre (pavements included), or null in the road. */
export function blockAt(world, x, z) {
  const L = world.layout;
  if (!L?.blocks) return null;
  const i = Math.floor((x - ORIGIN + TOWN.ROAD / 2) / STEP), j = Math.floor((z - ORIGIN + TOWN.ROAD / 2) / STEP);
  const b = L.blocks.find((q) => q.i === i && q.j === j);
  if (!b) return null;
  const dx = x - b.x, dz = z - b.z;
  return Math.abs(dx) <= H + 2 && Math.abs(dz) <= H + 2 ? { b, dx, dz, lawn: Math.abs(dx) <= H && Math.abs(dz) <= H } : null;
}

/** How high the ground's surface is to the eye (lawns and pavements are a few centimetres up). */
export function groundY(world, x, z) {
  if (!world.layout?.blocks) return 0.012; // (the garden: the lawn is the ground)
  const at = blockAt(world, x, z);
  return !at ? 0.014 : at.lawn ? 0.064 : 0.049;
}

/** Somewhere free for a seasonal thing: not in a wall, hedge, tree, bin or the water, nor a flowerbed. */
export function clearSpot(world, x, z, pad = 0.6) {
  if (blocked(world, x, z, pad)) return false;
  for (const b of world.beds ?? []) if (x > b.x0 - 0.5 && x < b.x1 + 0.5 && z > b.z0 - 0.5 && z < b.z1 + 0.5) return false;
  const B = world.bounds;
  return !B || (x > B.x0 + 1.5 && x < B.x1 - 1.5 && z > B.z0 + 1.5 && z < B.z1 - 1.5);
}

/** A free spot on a lawn (not the pavement or the road) between rMin and rMax of (cx, cz). */
export function lawnSpot(world, rng, cx, cz, rMin, rMax, { pad = 0.6, tries = 40, lawn = true, avoid = [], gap = 1.5 } = {}) {
  for (let i = 0; i < tries; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(rMin, rMax), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!clearSpot(world, x, z, pad)) continue;
    if (lawn && world.layout?.blocks && !blockAt(world, x, z)?.lawn) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    return V(x, 0, z);
  }
  return null;
}

/** The trees in town (from the landmarks), inside the streets (not the countryside round about). */
export function townTrees(world) {
  const B = world.bounds;
  return (world.landmarks?.trees ?? []).filter((t) => !B || (t.x > B.x0 && t.x < B.x1 && t.z > B.z0 && t.z < B.z1));
}

/** Bake a few coloured shapes into one geometry (vertex colours): [geometry, color, pos, rot, scale]. */
export { bake, bakedMesh, bakedMat, SPHERE } from '../../entities/shapes.js';
