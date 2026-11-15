import { RNG } from '../../core/rng.js';
import { spline } from './lines.js';

/*
 * 🗺️ Areas: places out beyond the edge of town, where the empty hills used to be: the Woods, the Farm, the
 * Beach. Every town has every kind there is, each out past its own edge. Plain data (no three.js), worked
 * out from the seed, so every device builds the same ones.
 *
 * Each area sits in a "strip" outside one edge of town: a flat valley between the hills, reached by a
 * lane from the end of one of the town's roads. In the area's own coordinates, u runs along the town's
 * edge and v runs outwards from the middle of town (the town's edge is at v = EDGE):
 *
 *        hills      ┌──────────── strip (flat) ────────────┐      hills
 *                   │   the area itself (woods, farm…)     │  ← v = far
 *                   │                                      │
 *                   ├──────────── front ──── gate ─────────┤  ← v = front (a fence, a wall, a dune…)
 *                   │   meadow          lane │             │
 *   ════════════════╧═══════ town's edge ════╪═════════════╧═══════════   ← v = EDGE
 *                       (outer road)         lane starts at the end of a town road
 *
 * To add a kind: a row in AREA_KINDS (emoji, names, blurb, depth…), its place in KIND_ORDER, a layout and
 * a builder in ./build.js, and a game controller (see game/town/woods/) created by TownChapter.
 */

export const EDGE = 89;            // the town's own edge (its old bounds)
const STRIP_HALF = 58;             // a strip is this wide either side of its middle
const ROAD_U = [-40, 0, 40];       // where the town's roads meet its outer road (lanes start there)
const LANE_START = 85;             // the outer road's far edge

export const AREA_KINDS = {
  woods: {
    emoji: '🌲',
    names: ['Bluebell Wood', 'Twiggy Wood', 'Owlhoot Wood', 'Muddypaw Copse', 'Snuffle Wood', 'Conker Wood'],
    blurb: 'Sticks! Mud! And somebody up a tree going “hooo”…',
    depth: 70,      // how far out the strip goes from the town's edge (m)
    front: 15,      // the meadow between the town and the wood's fence (m)
  },
  beach: {
    emoji: '🏖️',
    names: ['Pebble Bay', 'Sandy Paws Beach', 'Shell Cove', 'Seagull Sands', 'Crabby Cove', 'Paddlesworth Bay'],
    blurb: 'Waves to chase, sandcastles to build… and seagulls after everyone’s chips!',
    depth: 72,      // out to the buoys at the end of the swimming area (the sea goes on to the horizon)
    front: 14,      // the meadow between the town and the dunes
  },
};
export const AREA_EMOJI = Object.fromEntries(Object.entries(AREA_KINDS).map(([k, a]) => [k, a.emoji]));
export const AREA_BLURBS = Object.fromEntries(Object.entries(AREA_KINDS).map(([k, a]) => [k, a.blurb]));

// Which way is "out of town" from each edge (dir), and which way runs along it (across). (across is dir
// turned a quarter, so an area can be built in its own (u, v) frame inside one group turned by `turn`.)
const SIDES = {
  n: { dir: [0, -1], across: [-1, 0] },
  s: { dir: [0, 1], across: [1, 0] },
  e: { dir: [1, 0], across: [0, -1] },
  w: { dir: [-1, 0], across: [0, 1] },
};

// The order kinds are planned in: each takes a free edge of town in turn (with its own dice), so a kind
// added later never moves the ones before it. New kinds go on the end.
const KIND_ORDER = ['woods', 'farm', 'beach'];

/** Which kinds of area a town gets: all of them (a lot to do in one town), one per edge. */
function chooseKinds(/* seed, townName */) { return KIND_ORDER.filter((k) => AREA_KINDS[k]); }

/** Area-local (u along the edge, v outwards) → world [x, z]. */
export function toWorld(a, u, v) { return [a.across[0] * u + a.dir[0] * v, a.across[1] * u + a.dir[1] * v]; }
/** World → area-local [u, v]. */
export function toLocal(a, x, z) { return [a.across[0] * x + a.across[1] * z, a.dir[0] * x + a.dir[1] * z]; }
/** A local rectangle (u0..u1, v0..v1) as a world one { x0, z0, x1, z1 }. */
export function worldRect(a, u0, v0, u1, v1) {
  const [ax, az] = toWorld(a, u0, v0), [bx, bz] = toWorld(a, u1, v1);
  return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
}
export const inRect = (r, x, z, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

/**
 * Plan a town's areas (pure: the same seed gives the same areas everywhere). Each kind has its own random
 * stream, so a town's Woods stay put when other kinds of area come along later.
 * @returns [{ kind, side, dir, across, turn (a group turned this much round y builds in (u, 0, v)), u0, u1, v0, v1
 *   (the strip), front (v of the fence), lane: { u, gateU },
 *   strip (world rect), rect (world rect of the area beyond its front), place }]
 */
export function planAreas(seed, townName = '') {
  const used = new Set(), out = [];
  for (const kind of chooseKinds(seed, townName)) {
    const K = AREA_KINDS[kind], rng = new RNG(`area:${kind}:${seed}`);
    const side = rng.pick(Object.keys(SIDES).filter((s) => !used.has(s)));
    used.add(side);
    const laneU = rng.pick(ROAD_U);
    const mid = Math.max(-(EDGE - STRIP_HALF), Math.min(EDGE - STRIP_HALF, laneU + rng.float(-24, 24)));
    const gateU = laneU + rng.float(-5, 5);
    const a = { kind, side, ...SIDES[side], turn: Math.atan2(SIDES[side].dir[0], SIDES[side].dir[1]), u0: mid - STRIP_HALF, u1: mid + STRIP_HALF, v0: EDGE, v1: EDGE + K.depth, front: EDGE + K.front, lane: { u: laneU, gateU }, name: rng.pick(K.names) };
    a.strip = worldRect(a, a.u0, a.v0, a.u1, a.v1);
    a.rect = worldRect(a, a.u0, a.front, a.u1, a.v1);
    const [gx, gz] = toWorld(a, gateU, a.front);
    // The compass leads to the gate; walking in past it discovers the place.
    a.place = { id: kind, type: kind, name: a.name, x: gx, z: gz, rect: a.rect, area: kind };
    out.push(a);
  }
  return out;
}

/** The town's edges plus its areas: one box that holds everywhere a dog can go. */
export function areaBounds(areas, half) {
  const b = { x0: -half, x1: half, z0: -half, z1: half };
  for (const a of areas ?? []) {
    b.x0 = Math.min(b.x0, a.strip.x0); b.x1 = Math.max(b.x1, a.strip.x1);
    b.z0 = Math.min(b.z0, a.strip.z0); b.z1 = Math.max(b.z1, a.strip.z1);
  }
  return b;
}

/**
 * The bits of that box that aren't town or area (the hillsides beside a strip): solid, so dogs, jobs and
 * smells stay out of them. Returns world rects.
 */
export function areaFillers(areas, half) {
  if (!areas?.length) return [];
  const b = areaBounds(areas, half), rects = [{ x0: -half, z0: -half, x1: half, z1: half }, ...areas.map((a) => a.strip)];
  const xs = [...new Set([b.x0, b.x1, ...rects.flatMap((r) => [r.x0, r.x1])])].sort((p, q) => p - q);
  const zs = [...new Set([b.z0, b.z1, ...rects.flatMap((r) => [r.z0, r.z1])])].sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (xs[i + 1] - xs[i] < 0.01 || zs[j + 1] - zs[j] < 0.01 || rects.some((r) => inRect(r, cx, cz))) continue;
    out.push({ x0: xs[i], z0: zs[j], x1: xs[i + 1], z1: zs[j + 1] });
  }
  return out;
}

/** The lane out to an area: from the end of a town road, across the meadow to its gate. Points in (u, v). */
export function laneFor(a) {
  const { u, gateU } = a.lane;
  return spline([[u, LANE_START - 0.5], [u, EDGE + 1], [u + (gateU - u) * 0.55, (EDGE + a.front) / 2 + 1], [gateU, a.front - 0.8]], 0.6);
}

/** Which area (if any) a point is in: the whole strip, meadow and all. */
export function areaAt(areas, x, z, pad = 0) { return (areas ?? []).find((a) => inRect(a.strip, x, z, pad)) ?? null; }
