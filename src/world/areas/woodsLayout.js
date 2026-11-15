import { RNG } from '../../core/rng.js';
import { EDGE, toWorld, laneFor } from './areas.js';
import { spline, distTo, along } from './lines.js';

/*
 * 🌲 Where everything goes in a town's Woods, as plain data (no three.js): the stream and its two
 * crossings (stepping stones, a fallen log), the paths, the den's clearing, the owl's oak, Brock's sett,
 * the mud, the trees… All in the area's own (u, v) frame (see areas.js), from the woods' own random
 * stream, so it's the same on every device. ./woodsBuild.js turns it into meshes and colliders; the game
 * (game/town/woods/) uses the spots.
 */

const STREAM_W = 2.1;  // half the stream's width (m): deep enough to swim in the middle

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function layoutWoods(a, seed) {
  const rng = new RNG(`woods:${seed}`);
  const uL = a.u0, uR = a.u1, vF = a.front, vB = a.v1, gateU = a.lane.gateU;

  // ---- the stream: across the whole valley, in and out of the hills at either side ----
  const vMid = vF + rng.float(24, 28), A1 = rng.float(3, 4.5), A2 = rng.float(0.8, 1.6), p1 = rng.float(0, 6.28), p2 = rng.float(0, 6.28);
  const sv = (u) => vMid + A1 * Math.sin(u * 0.085 + p1) + A2 * Math.sin(u * 0.26 + p2);
  const slope = (u) => (sv(u + 0.5) - sv(u - 0.5));
  const streamPts = [];
  for (let u = uL - 18; u <= uR + 18.01; u += 2) streamPts.push([u, sv(u)]);
  /** A point d metres off the stream's middle at u (+ = the far bank, away from town). */
  const off = (u, d) => { const s = slope(u), l = Math.hypot(1, s); return [u - (s / l) * d, sv(u) + d / l]; };

  // ---- crossings: stepping stones on the main path, a fallen log further along ----
  const u1 = clamp(gateU + rng.float(-9, 9), uL + 16, uR - 16);
  const stones = [-1.65, -0.82, 0, 0.82, 1.65].map((d) => off(u1 + rng.float(-0.12, 0.12), d));
  const roomR = uR - u1, roomL = u1 - uL;
  const side2 = roomR > roomL ? 1 : -1;
  const u2 = clamp(u1 + side2 * rng.float(24, 32), uL + 12, uR - 12);
  const log = { a: off(u2, -3.4), b: off(u2, 3.4) };

  // ---- the den's clearing (over the stream), Brock's sett (this side), the owl's oak (by the path) ----
  const ud = clamp(u1 + rng.float(-14, 14), uL + 13, uR - 13);
  const den = { u: ud, v: Math.min(vB - 9, sv(ud) + rng.float(12, 15)), r: 7 };
  const us = clamp(u2 + side2 * rng.float(3, 8), uL + 9, uR - 9);
  const sett = { u: us, v: Math.max(vF + 8, sv(us) - rng.float(9, 12)) };
  const settDoor = [sett.u - side2 * 0.4, sett.v + 2.6];
  sett.face = Math.atan2(settDoor[0] - sett.u, settDoor[1] - sett.v); // (its holes look out towards the stream path)

  // ---- paths: gate → stepping stones → den (A); den → log → sett → back to A (B) ----
  const nearA = off(u1, -3.3), farA = off(u1, 3.3);
  const bendA = rng.float(-4, 4);
  const pathA1 = spline([[gateU, vF - 0.6], [gateU + bendA * 0.4, vF + 5], [(gateU + nearA[0]) / 2 + bendA, (vF + 5 + nearA[1]) / 2], nearA], 0.6);
  const pathA2 = spline([farA, [farA[0] + (den.u - farA[0]) * 0.4 + rng.float(-2, 2), farA[1] + (den.v - farA[1]) * 0.5], [den.u, den.v - den.r + 0.5]], 0.6);
  const join = along(pathA1, 0.28);
  const nearB = off(u2, -3.5), farB = off(u2, 3.5);
  const pathB2 = spline([[den.u + side2 * (den.r - 0.5), den.v], [(den.u + farB[0]) / 2, (den.v + farB[1]) / 2 + rng.float(-1.5, 1.5)], farB], 0.6);
  const pathB1 = spline([nearB, [(nearB[0] + settDoor[0]) / 2 + side2 * 1.5, (nearB[1] + settDoor[1]) / 2], [settDoor[0] - side2 * 2.2, settDoor[1] + 0.6], [(settDoor[0] + join[0]) / 2, (settDoor[1] + join[1]) / 2 + rng.float(-2, 2)], join], 0.6);
  const paths = [pathA1, pathA2, pathB1, pathB2];
  const tA = rng.float(0.45, 0.62), pa = along(pathA1, tA), pb = along(pathA1, tA + 0.03), sideO = rng.chance(0.5) ? 1 : -1;
  const tdu = pb[0] - pa[0], tdv = pb[1] - pa[1], tl = Math.hypot(tdu, tdv) || 1;
  const owl = { u: pa[0] - (tdv / tl) * 3.4 * sideO, v: pa[1] + (tdu / tl) * 3.4 * sideO };
  owl.face = Math.atan2(pa[0] - owl.u, pa[1] - owl.v); // looking at the path

  // ---- the lane: from the end of a town road, across the meadow to the gate ----
  const laneU = a.lane.u, lane = laneFor(a);

  // ---- mud: a wallow by the stepping stones, puddles on the paths, a proper mud bath by the sett ----
  const ws = rng.chance(0.5) ? 1 : -1, wallow = off(u1 + ws * 3.4, -3.6);
  const mud = [
    { u: wallow[0], v: wallow[1], ru: 2.2, rv: 1.5, big: true },
    { u: along(pathA1, 0.2)[0], v: along(pathA1, 0.2)[1], ru: 1.0, rv: 0.75 },
    { u: along(pathB1, 0.55)[0], v: along(pathB1, 0.55)[1], ru: 1.1, rv: 0.8 },
    { u: along(pathA2, 0.5)[0], v: along(pathA2, 0.5)[1], ru: 0.9, rv: 0.7 },
    { u: sett.u + side2 * 4.8, v: sett.v - 2.5, ru: 2.0, rv: 1.6, big: true },
    { u: along(lane, 0.62)[0] + 0.6, v: along(lane, 0.62)[1], ru: 0.9, rv: 0.65 },
  ];
  const inMud = (u, v, pad = 0) => mud.some((m) => ((u - m.u) / (m.ru + pad)) ** 2 + ((v - m.v) / (m.rv + pad)) ** 2 < 1);

  // ---- what's where, so trees and things don't land on paths, water, clearings or each other ----
  const taken = []; // circles: [u, v, r]
  const near = (u, v, r) => taken.some(([x, z, q]) => (u - x) ** 2 + (v - z) ** 2 < (r + q) ** 2);
  const pathDist = (u, v) => Math.min(...paths.map((p) => distTo(p, u, v)));
  const clear = (u, v, r, { path = 1.25, water = STREAM_W + 1.0, fence = 1.4, space = r } = {}) => {
    if (u < uL + 0.5 || u > uR - 0.5 || v > vB - 0.4) return false;
    if (v < vF + fence) return false;
    if (Math.abs(v - sv(u)) < water + r + 1.2 && distTo(streamPts, u, v) < water + r) return false;
    if (Math.hypot(u - den.u, v - den.v) < den.r + r) return false;
    if (Math.hypot(u - sett.u, v - sett.v) < 4.2 + r) return false;
    if (Math.hypot(u - owl.u, v - owl.v) < 1.5 + r) return false;
    if (Math.hypot(u - u2, v - sv(u2)) < 5 + r && distTo([log.a, log.b], u, v) < 1.2 + r) return false;
    if (inMud(u, v, r + 0.4)) return false;
    if (pathDist(u, v) < path + r) return false;
    return !near(u, v, space);
  };
  taken.push([owl.u, owl.v, 1.2], [sett.u + 0.4, sett.v - 1.8, 1.0]); // (the owl's oak and the tree over the sett)

  const scatter = (n, r, opts, fn) => { const out = []; for (let t = 0; t < n * 12 && out.length < n; t++) { const u = rng.float(uL + 1, uR - 1), v = rng.float(vF + 1.6, vB - 0.6); if (!clear(u, v, r, opts)) continue; const o = fn(u, v); out.push(o); if (r > 0.3) taken.push([u, v, r]); } return out; };
  // Old fallen logs to hop over (first, as they need the most room).
  const logs = scatter(7, 1.7, { path: 1.4 }, (u, v) => ({ u, v, len: rng.float(2.2, 3.4), rot: rng.float(0, Math.PI), r: rng.float(0.2, 0.28) }));

  // Trees: thicker towards the back and the sides (the edges of the valley), never on a path.
  const trees = [];
  const KINDS = [['oak', 0.5], ['birch', 0.27], ['pine', 0.23]];
  const kindOf = () => { let r = rng.next(); for (const [k, w] of KINDS) { r -= w; if (r <= 0) return k; } return 'oak'; };
  for (let tries = 0; tries < 6000 && trees.length < 190; tries++) {
    const u = rng.float(uL + 0.8, uR - 0.8), v = rng.float(vF + 1.6, vB - 0.6);
    const edge = Math.min(u - uL, uR - u, vB - v) / 16;
    const room = 1.45 + Math.min(1, edge) * 1.05; // (how much room a tree wants round it: less at the edges)
    const kind = kindOf(), s = kind === 'pine' ? rng.float(1.2, 1.9) : kind === 'birch' ? rng.float(1.05, 1.45) : rng.float(1.1, 1.75);
    if (!clear(u, v, 0.35 * s, { path: 1.35, space: room })) continue;
    trees.push({ kind, u, v, s, seed: rng.int(0, 1e6), near: pathDist(u, v) < 9 || Math.hypot(u - den.u, v - den.v) < den.r + 6 }); // (near: seen up close, so smoother)
    taken.push([u, v, room]);
  }
  // A few big old trees in the meadow too.
  const meadowTrees = [];
  for (let tries = 0; tries < 60 && meadowTrees.length < 3; tries++) {
    const u = rng.float(uL + 4, uR - 4), v = rng.float(EDGE + 3, vF - 3);
    if (distTo(lane, u, v) < 5 || meadowTrees.some((t) => Math.hypot(t.u - u, t.v - v) < 14) || inMud(u, v, 2)) continue;
    meadowTrees.push({ kind: 'oak', u, v, s: rng.float(1.5, 1.9), seed: rng.int(0, 1e6) });
  }

  // Things lying about (ferns, toadstools, rocks, stumps, old logs to hop over).
  const stumps = scatter(9, 0.5, {}, (u, v) => ({ u, v, r: rng.float(0.28, 0.42), h: rng.float(0.3, 0.55) }));
  const rocks = scatter(12, 0.6, {}, (u, v) => ({ u, v, s: rng.float(0.35, 0.8), seed: rng.int(0, 20) }));
  const ferns = scatter(150, 0, { path: 0.9, water: STREAM_W + 0.6 }, (u, v) => ({ u, v, s: rng.float(0.7, 1.25), rot: rng.float(0, 6.28) }));
  const toadstools = [];
  { // a fairy ring, and a few on their own
    const [cu, cv] = (() => { for (let t = 0; t < 40; t++) { const u = rng.float(uL + 6, uR - 6), v = rng.float(vF + 6, vB - 6); if (clear(u, v, 1.6)) return [u, v]; } return [den.u + 9, den.v]; })();
    for (let i = 0; i < 11; i++) { const ang = (i / 11) * Math.PI * 2; toadstools.push({ u: cu + Math.cos(ang) * 1.3, v: cv + Math.sin(ang) * 1.3, s: rng.float(0.8, 1.2) }); }
    taken.push([cu, cv, 1.6]);
    toadstools.push(...scatter(10, 0, { path: 0.8 }, (u, v) => ({ u, v, s: rng.float(0.7, 1.3) })));
  }
  // Flowers along the verges of the lane, and in the meadow.
  const flowers = [];
  for (let t = 0; t < 400 && flowers.length < 90; t++) {
    const u = rng.float(uL + 1, uR - 1), v = rng.float(EDGE + 0.5, vF - 0.8);
    const dl = distTo(lane, u, v);
    if (dl < 1.9 || (dl > 6 && rng.chance(0.75)) || inMud(u, v, 0.5)) continue;
    flowers.push({ u, v, s: rng.float(0.8, 1.2) });
  }

  // Big sticks can turn up here (in the wood, and a few in the meadow so there's a gate to get through).
  const stickSpots = scatter(20, 0, { path: 0.4 }, (u, v) => [u, v]);
  for (let t = 0; t < 80 && stickSpots.length < 26; t++) {
    const u = rng.float(uL + 3, uR - 3), v = rng.float(EDGE + 3, vF - 2.5);
    if (distTo(lane, u, v) > 2.2 && !inMud(u, v, 0.6) && !meadowTrees.some((m) => Math.hypot(m.u - u, m.v - v) < 2)) stickSpots.push([u, v]);
  }
  // Smells to sniff out.
  const smellSpots = scatter(22, 0, { path: 0, water: STREAM_W + 0.8 }, (u, v) => [u, v]);
  for (let t = 0; t < 40 && smellSpots.length < 28; t++) { const u = rng.float(uL + 2, uR - 2), v = rng.float(EDGE + 2, vF - 2); if (distTo(lane, u, v) > 1.5) smellSpots.push([u, v]); }
  // Somewhere for job things to be left (a spot in the wood, clear of everything).
  const free = (q, r = 0.7) => { for (let i = 0; i < 60; i++) { const u = q.float(uL + 2, uR - 2), v = q.float(vF + 2, vB - 2); if (clear(u, v, r, { path: 0 })) return [u, v]; } return null; };

  // Woods beyond the valley: up the hills behind and either side (just to look at).
  const hillTrees = [];
  for (let t = 0; t < 900 && hillTrees.length < 95; t++) {
    const u = rng.float(uL - 34, uR + 34), v = rng.float(EDGE + 6, vB + 34);
    if (u > uL - 1.5 && u < uR + 1.5 && v < vB + 1.5) continue;
    const out = Math.max(uL - u, u - uR, v - vB, 0); // (thick near the valley, thinning out up the hill)
    if (rng.next() < out / 40 || hillTrees.some((h) => (h.u - u) ** 2 + (h.v - v) ** 2 < 16)) continue;
    hillTrees.push({ kind: rng.chance(0.3) ? 'pine' : 'oak', u, v, s: rng.float(1.4, 2.2), seed: rng.int(0, 1e6) });
  }

  // Grass grows everywhere in the valley except on the paths, the water, the mud and round the den.
  const CELL = 0.5, gw = Math.ceil((uR - uL) / CELL), gh = Math.ceil((vB - EDGE) / CELL), lawn = new Uint8Array(gw * gh).fill(1);
  const unlawn = (u, v, r) => {
    const i0 = Math.max(0, Math.floor((u - r - uL) / CELL)), i1 = Math.min(gw - 1, Math.floor((u + r - uL) / CELL));
    const j0 = Math.max(0, Math.floor((v - r - EDGE) / CELL)), j1 = Math.min(gh - 1, Math.floor((v + r - EDGE) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if ((uL + (i + 0.5) * CELL - u) ** 2 + (EDGE + (j + 0.5) * CELL - v) ** 2 < r * r) lawn[j * gw + i] = 0;
  };
  for (const p of paths) for (const [u, v] of p) unlawn(u, v, 1.25);
  for (const [u, v] of lane) unlawn(u, v, 1.75);
  for (let u = uL; u <= uR; u += 0.4) unlawn(u, sv(u), STREAM_W + 1.0);
  for (const m of mud) for (let k = 0; k < 9; k++) unlawn(m.u + Math.cos(k * 0.7) * m.ru * 0.5, m.v + Math.sin(k * 0.7) * m.rv * 0.5, Math.max(m.ru, m.rv) * 0.75);
  unlawn(den.u, den.v, 2.6);
  unlawn(sett.u, sett.v, 2.4);

  const W = (u, v) => toWorld(a, u, v);
  const local = (x, z) => [a.across[0] * x + a.across[1] * z, a.dir[0] * x + a.dir[1] * z];
  return {
    kind: 'woods', a, seed, uL, uR, vF, vB, gateU, laneU,
    stream: { pts: streamPts, w: STREAM_W, at: sv, off },
    stones, log, den, sett, owl, paths, lane, mud, trees, meadowTrees, logs, stumps, rocks, ferns, toadstools, flowers, hillTrees,
    stickSpots, smellSpots, free,
    /** How much this bit of ground is woodland floor (0 meadow … 1 under the trees), for its colour. */
    floor(x, z) {
      const [u, v] = local(x, z);
      return Math.max(0, Math.min(1, (v - vF + 1) / 5, (u - uL + 3) / 5, (uR + 3 - u) / 5));
    },
    /** Grass here? (world coordinates) */
    lawn(x, z) {
      const [u, v] = local(x, z);
      const i = Math.floor((u - uL) / CELL), j = Math.floor((v - EDGE) / CELL);
      return i >= 0 && j >= 0 && i < gw && j < gh && lawn[j * gw + i] === 1;
    },
    W,
  };
}
