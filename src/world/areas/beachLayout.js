import { RNG, fbm3 } from '../../core/rng.js';
import { EDGE, toWorld, toLocal, laneFor } from './areas.js';
import { distTo } from './lines.js';

/*
 * 🏖️ Where everything goes at a town's beach, as plain data (no three.js): the dunes with a boardwalk
 * through them, the sand, the sea (and how far the waves run up), the beach huts, the kiosk, the lifeguard's
 * tower, the rock pools at one end, groynes running down into the sea, picnics, sandcastle spots, an old
 * boat, and the lighthouse out on the headland. All in the area's own (u, v) frame (see areas.js), from the
 * beach's own random stream, so it's the same on every device. ./beachBuild.js turns it into meshes and
 * colliders; the game (game/town/beach/) uses the spots.
 *
 *     v ↑   sea… all the way to the horizon (the hills out here are sunk under it: see sink())
 *       │   ─ ─ ─ buoys (the end of the swimming area: the strip's far end) ─ ─ ─
 *       │   ~~~~~~ the waterline (vS): waves run up the sand from here ~~~~~~
 *       │   sand: rock pools, groynes, the lifeguard, picnics, sandcastles
 *       │   beach huts · kiosk                (the back of the beach)
 *       │   ∩∩∩∩∩∩∩ dunes ∩∩∩ boardwalk ∩∩∩∩∩∩∩   ← front
 *       │   meadow, and the lane from town
 */

export const SHORE = 31;   // the waterline is this far past the dunes' crest (m)
export const SWASH = 8;    // how far up the sand the biggest waves can run (m)
const HUT_COLORS = 8;      // (a colour each, from beachBuild's paint box)

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function layoutBeach(a, seed) {
  const rng = new RNG(`beach:${seed}`);
  const uL = a.u0, uR = a.u1, vF = a.front, vB = a.v1, gateU = a.lane.gateU, laneU = a.lane.u;
  const vS = vF + SHORE; // the waterline (where the sea starts when the waves are out)

  // ---- the dunes: a ridge of sand along the back of the beach, with a gap for the boardwalk ----
  const p1 = rng.float(0, 6.28), p2 = rng.float(0, 6.28), o1 = rng.float(0, 50), o2 = rng.float(0, 50);
  const crest = (u) => vF + 1.6 + 1.2 * Math.sin(u * 0.045 + p1) + 0.5 * Math.sin(u * 0.13 + p2);
  const tall = (u) => 1.05 + 1.0 * fbm3(u * 0.06 + o1, 0.5, o2, 3);
  /** How high the dunes are at (u, v) (0 off them): steep on the meadow side, a long slope down to the beach. */
  const duneH = (u, v) => {
    if (v < vF - 5 || v > vF + 9) return 0;
    const c = crest(u), d = (v - c) / (v < c ? 3.4 : 5.4);
    if (d <= -1 || d >= 1) return 0;
    let h = tall(u) * (1 - d * d) ** 2;
    h *= smooth(1.6, 4.4, Math.abs(u - gateU));          // the gap the boardwalk goes through
    h *= smooth(0, 10, u - uL) * smooth(0, 10, uR - u);   // (they fade out where the headlands begin)
    return h;
  };
  const board = { u: gateU, v0: vF - 3.6, v1: vF + 7.6, w: 1.5 }; // the boardwalk through the gap

  /** The sand's height at (u, v): flat, then shelving gently into the sea, and the dunes on top. */
  const sandY = (u, v) => {
    let y = 0.0;
    if (v > vS - SWASH) y = -0.07 * smooth(vS - SWASH, vS + 0.5, v);
    if (v > vS + 0.5) y -= Math.min(1.5, (v - vS - 0.5) * 0.11);
    return y + duneH(u, v);
  };

  // ---- what's where, so things don't land on top of each other ----
  const taken = []; // circles: [u, v, r]
  const near = (u, v, r) => taken.some(([x, z, q]) => (u - x) ** 2 + (v - z) ** 2 < (r + q) ** 2);
  const sand = (u, v, r = 0.5) => u > uL + 3 + r && u < uR - 3 - r && v > vF + 7 + r && v < vS - SWASH - 0.6 - r && Math.abs(u - gateU) > 2.2 + r;

  // ---- the back of the beach: a row of huts on the roomier side of the boardwalk, the kiosk on the other ----
  const side = uR - gateU > gateU - uL ? 1 : -1;
  const colors = rng.shuffle([...Array(HUT_COLORS).keys()]);
  const huts = [];
  for (let i = 0; i < 8; i++) {
    const u = gateU + side * (6.4 + i * 3.4);
    if (u < uL + 6 || u > uR - 6) break;
    huts.push({ u, v: vF + 9.8, n: i + 1, color: colors[i % colors.length], open: false });
  }
  huts[rng.int(0, huts.length - 1)].open = true;  // (one's open, with a deckchair out front)
  for (const h of huts) taken.push([h.u, h.v, 2.2]);
  const kiosk = { u: gateU - side * 6.8, v: vF + 9.4 };
  taken.push([kiosk.u, kiosk.v, 3.4]);
  taken.push([gateU, vF + 9, 2.4]); // (the end of the boardwalk: keep it clear)

  // ---- the rock pools: at the far end, on the huts' side, near the water ----
  const cu = side > 0 ? uR - 14 : uL + 14, cv = vS - 12.5;
  const pools = [];
  for (let i = 0, t = 0; i < 3 && t < 60; t++) {
    const u = cu + rng.float(-7, 7), v = cv + rng.float(-2.6, 2.4), r = rng.float(1.15, 1.7);
    if (pools.some((p) => Math.hypot(p.u - u, p.v - v) < p.r + r + 1.6)) continue;
    pools.push({ u, v, r });
    i++;
  }
  const rocks = [];
  const rock = (u, v, s, flat = false) => rocks.push({ u, v, s, h: flat ? s * 0.45 : s * (0.6 + rng.float(0, 0.35)), seed: rng.int(0, 30), rot: rng.float(0, 6.28) });
  for (const p of pools) { // round the rim of each pool
    const n = rng.int(4, 6), a0 = rng.float(0, 6.28);
    for (let k = 0; k < n; k++) { const ang = a0 + (k / n) * Math.PI * 2 + rng.float(-0.3, 0.3), d = p.r + rng.float(0.45, 0.8); rock(p.u + Math.cos(ang) * d, p.v + Math.sin(ang) * d, rng.float(0.35, 0.7), true); }
  }
  for (let t = 0, n = 0; t < 80 && n < 9; t++) { // bigger boulders round about (gulls like to stand on these)
    const u = cu + rng.float(-11, 11), v = cv + rng.float(-5, 4);
    if (pools.some((p) => Math.hypot(p.u - u, p.v - v) < p.r + 1.6) || rocks.some((r) => Math.hypot(r.u - u, r.v - v) < r.s + 1.2)) continue;
    rock(u, v, rng.float(0.55, 0.95));
    n++;
  }
  for (let k = 0; k < 6; k++) rock(cu + side * rng.float(-4, 9), vS - 4 + k * 1.6 + rng.float(-0.5, 0.5), rng.float(0.4, 0.8)); // and a spit of rocks running into the sea
  taken.push([cu, cv, 12]);

  // ---- the lifeguard's tower: in front of the swimming area, near the middle ----
  const tower = { u: Math.max(uL + 16, Math.min(uR - 16, gateU + side * rng.float(-4, 12))), v: vS - 10 };
  if (Math.abs(tower.u - cu) < 18) tower.u = cu - side * 18;
  tower.face = 0; // (looking out to sea)
  taken.push([tower.u, tower.v, 3.2]);
  const stand = { u: tower.u + 1.7, v: tower.v + 1.4 }; // where the lifeguard stands, beside it

  // ---- groynes: old wooden breakwaters running down the beach into the sea ----
  const groynes = [];
  for (let t = 0; t < 80 && groynes.length < 2; t++) {
    const u = rng.float(uL + 12, uR - 12);
    if (Math.abs(u - gateU) < 12 || Math.abs(u - tower.u) < 9 || Math.abs(u - cu) < 17 || groynes.some((g) => Math.abs(g.u - u) < 26)) continue;
    groynes.push({ u, v0: vS - 14, v1: vS + 7 });
  }
  const onGroyne = (u, v, r) => groynes.some((g) => Math.abs(u - g.u) < 1.2 + r && v > g.v0 - 1 - r);

  // ---- the old rowing boat, upturned on the sand by the dunes ----
  let boat = null;
  for (let t = 0; t < 40 && !boat; t++) {
    const u = gateU - side * rng.float(14, 26), v = vF + rng.float(11, 13);
    if (sand(u, v, 2) && !near(u, v, 2.5) && !onGroyne(u, v, 2)) boat = { u, v, rot: rng.float(-0.5, 0.5) };
  }
  if (boat) taken.push([boat.u, boat.v, 2.6]);

  // ---- picnic blankets (where the seagulls go for the chips), and sandcastle spots ----
  const spread = (n, r, gap, v0, v1, list) => {
    for (let t = 0; t < n * 60 && list.length < n; t++) {
      const u = rng.float(uL + 5, uR - 5), v = rng.float(v0, v1);
      if (!sand(u, v, r) || near(u, v, r) || onGroyne(u, v, r) || list.some((q) => Math.hypot(q.u - u, q.v - v) < gap)) continue;
      list.push({ u, v, rot: rng.float(-0.6, 0.6) });
    }
    for (const q of list) taken.push([q.u, q.v, r]);
    return list;
  };
  const picnics = spread(3, 2.4, 12, vF + 13, vS - 11.5, []);
  const castles = spread(6, 1.6, 8, vF + 12, vS - SWASH - 1.8, []);
  // People about the beach in the nicer weather (deckchairs, parasols, windbreaks…): see game/town/beach/crowd.js.
  const crowd = spread(5, 2.2, 8, vF + 12, vS - 10.5, []);

  // ---- things to dig up: places a shell might be buried (the game picks a few at a time) ----
  const treasures = [];
  for (let t = 0; t < 900 && treasures.length < 48; t++) {
    const u = rng.float(uL + 4, uR - 4), v = rng.float(vF + 8, vS - SWASH - 1);
    if (!sand(u, v, 0.4) || near(u, v, 0.6) || onGroyne(u, v, 0.5) || treasures.some((q) => Math.hypot(q[0] - u, q[1] - v) < 3)) continue;
    treasures.push([u, v]);
  }

  // ---- marram grass on the dunes, sea pinks in the meadow ----
  const tufts = [];
  for (let t = 0; t < 4000 && tufts.length < 240; t++) {
    const u = rng.float(uL + 1, uR - 1), v = rng.float(vF - 4, vF + 8), h = duneH(u, v);
    if (h < 0.22 || rng.next() > h * 0.9 || Math.abs(u - gateU) < board.w / 2 + 0.6) continue;
    tufts.push({ u, v, y: h, s: rng.float(0.7, 1.25), rot: rng.float(0, 6.28) });
  }
  const lane = laneFor(a);
  const thrift = [];
  for (let t = 0; t < 400 && thrift.length < 70; t++) {
    const u = rng.float(uL + 1, uR - 1), v = rng.float(EDGE + 0.6, vF - 4.2), dl = distTo(lane, u, v);
    if (dl < 1.9 || (dl > 7 && rng.chance(0.7))) continue;
    thrift.push({ u, v, s: rng.float(0.8, 1.25) });
  }

  // ---- smells to sniff out (on the sand, in the meadow, round the rock pools) ----
  const smellSpots = [];
  for (let t = 0; t < 500 && smellSpots.length < 22; t++) {
    const u = rng.float(uL + 4, uR - 4), v = rng.float(vF + 7.5, vS - SWASH - 0.5);
    if (!sand(u, v, 0.3) || near(u, v, 0.3) || onGroyne(u, v, 0.4)) continue;
    smellSpots.push([u, v]);
  }
  for (let t = 0; t < 60 && smellSpots.length < 28; t++) { const u = rng.float(uL + 3, uR - 3), v = rng.float(EDGE + 2, vF - 5); if (distTo(lane, u, v) > 1.6) smellSpots.push([u, v]); }
  for (const p of pools) smellSpots.push([p.u + p.r + 1.4, p.v - 0.6]);

  // ---- out on the headland: a lighthouse on its own rocky island (just to look at) ----
  const lighthouse = { u: side > 0 ? uR + 17 : uL - 17, v: vS + 10 };

  // ---- the meadow's grass (for the grass that follows the dog about): everywhere but the lane ----
  const CELL = 0.5, gw = Math.ceil((uR - uL) / CELL), gh = Math.ceil((vF - 3.6 - EDGE) / CELL), lawn = new Uint8Array(gw * gh).fill(1);
  for (const [u, v] of lane) {
    const i0 = Math.max(0, Math.floor((u - 1.8 - uL) / CELL)), i1 = Math.min(gw - 1, Math.floor((u + 1.8 - uL) / CELL));
    const j0 = Math.max(0, Math.floor((v - 1.8 - EDGE) / CELL)), j1 = Math.min(gh - 1, Math.floor((v + 1.8 - EDGE) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if ((uL + (i + 0.5) * CELL - u) ** 2 + (EDGE + (j + 0.5) * CELL - v) ** 2 < 1.8 * 1.8) lawn[j * gw + i] = 0;
  }

  /** A free spot on the dry sand (for a job), or null. */
  const free = (q, r = 0.7) => {
    for (let i = 0; i < 60; i++) {
      const u = q.float(uL + 5, uR - 5), v = q.float(vF + 8, vS - SWASH - 1);
      if (sand(u, v, r) && !near(u, v, r) && !onGroyne(u, v, r)) return [u, v];
    }
    return null;
  };

  // ---- the sea: the hills out past the waterline sink under it, so it looks like sea to the horizon ----
  // (Nothing of the town's or another area's is this far out on this side: the woods' hills reach 34 m past
  // the town's edge at most, and the sinking starts 36 m out.)
  const sinkFrom = vS - 9, seaFloor = -1.7, sandRect = { u0: uL - 2.5, u1: uR + 2.5, v0: vF - 3.7 };
  /**
   * The ground's height at world (x, z), given the hills' height h there: the hills flatten into a shore
   * just above the sea and sink under it past the waterline; under the beach's own sand it stays below it.
   */
  const sink = (x, z, h) => {
    const [u, v] = toLocal(a, x, z), under = v > sandRect.v0 && u > sandRect.u0 && u < sandRect.u1;
    if (v <= sinkFrom && !under) return h;
    let y = h;
    if (v > sinkFrom) {
      const s = smooth(sinkFrom, vS + 3, v), target = 0.04 + (seaFloor - 0.04) * smooth(vS - 1, vS + 11, v);
      y = h * (1 - s) + target * s;
    }
    return under ? Math.min(y, sandY(u, v) - 0.12) : y;
  };
  const W = (u, v) => toWorld(a, u, v);
  const sandCol = [0.86, 0.79, 0.62], rockCol = [0.66, 0.63, 0.56];
  return {
    kind: 'beach', a, seed, uL, uR, vF, vB, vS, gateU, laneU, side,
    lane, board, huts, kiosk, tower, stand, pools, rocks, groynes, boat, picnics, castles, crowd, treasures, tufts, thrift,
    smellSpots, lighthouse, free, duneH, sandY, crest, sink,
    /** Keep the town's countryside trees out of the sea. */
    keepOut: (x, z) => a.dir[0] * x + a.dir[1] * z > sinkFrom - 1,
    /** The ground's colour near the beach (the town's ground mesh): sandy at the foot of the dunes and down the headlands. */
    tint(x, z, c) {
      const [u, v] = toLocal(a, x, z);
      if (v < EDGE - 2) return;
      const inStrip = u > uL - 2 && u < uR + 2;
      let k = inStrip ? smooth(vF - 7, vF - 3.8, v) : smooth(vS - 16, vS - 3, v) * 0.9; // (beside the bay: a sandy shore round the headlands)
      if (!inStrip && v > vF - 6 && v < vS - 4) { // rocky slopes down to the sea
        const n = fbm3(x * 0.15, 1.5, z * 0.15, 2);
        if (n > 0.55) { const r = Math.min(1, (n - 0.55) * 4) * smooth(vF - 6, vF + 4, v) * 0.7; c.r += (rockCol[0] - c.r) * r; c.g += (rockCol[1] - c.g) * r; c.b += (rockCol[2] - c.b) * r; }
      }
      if (k <= 0) return;
      c.r += (sandCol[0] - c.r) * k; c.g += (sandCol[1] - c.g) * k; c.b += (sandCol[2] - c.b) * k;
    },
    /** Grass here? (world coordinates) Only in the meadow, off the lane. */
    lawn(x, z) {
      const [u, v] = toLocal(a, x, z);
      const i = Math.floor((u - uL) / CELL), j = Math.floor((v - EDGE) / CELL);
      return i >= 0 && j >= 0 && i < gw && j < gh && lawn[j * gw + i] === 1;
    },
    W,
  };
}
