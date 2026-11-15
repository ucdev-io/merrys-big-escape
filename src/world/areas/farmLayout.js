import { RNG } from '../../core/rng.js';
import { EDGE, toWorld, laneFor } from './areas.js';
import { spline, distTo, along } from './lines.js';

/*
 * 🚜 Where everything goes on a town's Farm, as plain data (no three.js): the farmyard with its big red
 * barn, the farmhouse, the duck pond, the hen house, the well, the pigsty, the tractor and a stack of hay
 * bales to climb; the sheep field (with its pen) on one side of the yard and the crop field (with the
 * scarecrow) on the other; an orchard and round bales behind the barn; a buttercup meadow out front.
 * All in the area's own (u, v) frame (see areas.js), from the farm's own random stream, so it's the same
 * on every device. ./farmBuild.js turns it into meshes and colliders; the game (game/town/farm/) uses
 * the spots.
 *
 *     crop field 🌾   orchard 🍎 · bales      sheep field 🐑
 *     (scarecrow)  ┌───── BARN ─────┐            ┌pen┐
 *                  │                 │ hay stack └───┘
 *       pond  coop  ·····yard·····  tractor
 *     farmhouse 🏠     well    trough   pigsty 🐷   ║ field gate
 *   ═══ hedge ═══════════ gate ═════════════════════════ hedge ═══
 *     buttercup meadow           lane
 */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const FENCE_DU = 17;   // the fields' fences are this far either side of the middle of the yard
export const POND_R = 2.8;

export function layoutFarm(a, seed) {
  const rng = new RNG(`farm:${seed}`);
  const uL = a.u0, uR = a.u1, vF = a.front, vB = a.v1, gateU = a.lane.gateU;
  const yu = clamp(gateU + rng.float(-5, 5), uL + 36, uR - 36); // the middle of the yard
  const s = rng.chance(0.5) ? 1 : -1;                            // which side the sheep live (+u or -u)
  const D = (du) => yu + s * du;                                 // so the layout reads the same either way round
  const span = (du0, du1) => [Math.min(D(du0), D(du1)), Math.max(D(du0), D(du1))];

  // ---- the farmyard ----
  const yard = { u: yu, v: vF + 15.5, ru: 10.5, rv: 12.5 };
  const barn = { u: D(0), v: vF + 32, w: 11, d: 8, door: 4.4, face: Math.PI }; // (doors at the front, looking back towards town)
  barn.front = barn.v - barn.d / 2;
  const house = { u: D(-11.5), v: vF + 11, w: 7.5, d: 5.5, face: (s * Math.PI) / 2 }; // (looking into the yard)
  house.door = [house.u + s * (house.d / 2 + 0.55), house.v];
  const basket = [house.door[0] + s * 0.25, house.v + 1.55];
  const pond = { u: D(-11), v: vF + 22.5, r: POND_R };
  const coop = { u: D(-4.6), v: vF + 22.2, face: s > 0 ? Math.PI / 2 : -Math.PI / 2 };
  const well = { u: D(3.4), v: vF + 12.2 };
  const sty = { u: D(10), v: vF + 10, hu: 3, hv: 2.5, gateU: D(7), gate: 1.3 }; // (its gate faces the yard)
  const trough = { u: D(5.6), v: vF + 14.8, rot: 0 };
  const stack = { u: D(9.2), v: vF + 24.2, face: s > 0 ? -Math.PI / 2 : Math.PI / 2 }; // the hay castle: steps up from the yard side
  const tractor = { u: D(4.4), v: vF + 20.2, face: Math.PI + s * rng.float(0.5, 0.9) };
  const farmer = { u: D(1.8), v: vF + 13.6 }; // (where the farmer's usually to be found: by the well)

  // ---- the fields: a fence each side of the yard, front hedge to back hedge, with a gate into each ----
  const [su0, su1] = span(FENCE_DU, (s > 0 ? uR : uL) * s - yu * s - 1.2); // sheep field, from its fence to the edge of the strip
  const sheepField = { u0: su0, u1: su1, v0: vF + 1.2, v1: vB - 1.2, fenceU: D(FENCE_DU), gateV: vF + 10, side: s };
  const [cu0, cu1] = span(-FENCE_DU, (s > 0 ? uL : uR) * s - yu * s + 1.2);
  const cropField = { u0: cu0, u1: cu1, v0: vF + 1.2, v1: vB - 1.2, fenceU: D(-FENCE_DU), gateV: vF + 5.5, side: -s };
  // The sheep pen: against the sheep field's fence, its way in facing out into the field.
  const pen = { fenceU: D(FENCE_DU), v0: vF + 23.4, v1: vF + 29, depth: 5.5, gap: 2.8, side: s };
  [pen.u0, pen.u1] = span(FENCE_DU + 0.25, FENCE_DU + pen.depth);
  pen.gateU = D(FENCE_DU + pen.depth);  // the open side
  pen.gateV = (pen.v0 + pen.v1) / 2;
  const scarecrow = { u: (cropField.u0 + cropField.u1) / 2 + rng.float(-3, 3), v: vF + rng.float(26, 34) };
  const patch = { u0: cropField.u0 + 1.5, u1: cropField.u1 - 1.5, v0: vF + 2.5, v1: vF + 14 }; // pumpkins grow here in autumn

  // ---- the lane in, and the track up to the yard ----
  const laneU = a.lane.u, lane = laneFor(a);
  const track = spline([[gateU, vF - 0.4], [gateU, vF + 2.5], [(gateU + yu) / 2, vF + 5.5], [yu, vF + 8.5], [yu + rng.float(-0.6, 0.6), vF + 14]], 0.6);

  // ---- mud: the pigsty, the field gateway, puddles ----
  const mud = [
    { u: sty.u, v: sty.v, ru: sty.hu - 0.45, rv: sty.hv - 0.45, big: true },
    { u: D(FENCE_DU - 1.3), v: sheepField.gateV + rng.float(-0.4, 0.4), ru: 1.1, rv: 1.6 },
    { u: along(track, 0.32)[0] + rng.float(-0.3, 0.3), v: along(track, 0.32)[1], ru: 0.9, rv: 0.7 },
    { u: along(lane, 0.66)[0] + 0.6, v: along(lane, 0.66)[1], ru: 0.85, rv: 0.6 },
  ];
  const inMud = (u, v, pad = 0) => mud.some((m) => ((u - m.u) / (m.ru + pad)) ** 2 + ((v - m.v) / (m.rv + pad)) ** 2 < 1);

  // ---- what's where (for putting trees, bales and things down) ----
  const rects = [ // [u0, v0, u1, v1] that are taken
    [barn.u - barn.w / 2 - 0.8, barn.v - barn.d / 2 - 1.6, barn.u + barn.w / 2 + 0.8, barn.v + barn.d / 2 + 0.6],
    [Math.min(house.u - house.d / 2, house.door[0]) - 0.8, house.v - house.w / 2 - 0.8, Math.max(house.u + house.d / 2, house.door[0]) + 0.8, house.v + house.w / 2 + 0.8],
    [sty.u - sty.hu - 0.6, sty.v - sty.hv - 0.6, sty.u + sty.hu + 0.6, sty.v + sty.hv + 0.6],
    [pen.u0 - 0.5, pen.v0 - 0.5, pen.u1 + 0.5, pen.v1 + 0.5],
    [stack.u - 2.6, stack.v - 2.3, stack.u + 2.6, stack.v + 2.3],
  ];
  const circles = [[pond.u, pond.v, pond.r + 1.2], [coop.u, coop.v, 2.0], [well.u, well.v, 1.3], [tractor.u, tractor.v, 2.6], [trough.u, trough.v, 1.2], [scarecrow.u, scarecrow.v, 1.2]];
  const fences = [sheepField.fenceU, cropField.fenceU];
  const taken = []; // more circles, as things go down
  const clear = (u, v, r, { path = 1.2, fence = 1.0, space = r, yardOk = true, fieldsOk = true } = {}) => {
    if (u < uL + 1 || u > uR - 1 || v < vF + 1 || v > vB - 1) return false;
    if (rects.some(([u0, v0, u1, v1]) => u > u0 - r && u < u1 + r && v > v0 - r && v < v1 + r)) return false;
    if (circles.some(([cu, cv, cr]) => Math.hypot(u - cu, v - cv) < cr + r)) return false;
    if (fences.some((f) => Math.abs(u - f) < fence + r)) return false;
    if (!yardOk && ((u - yard.u) / (yard.ru + r)) ** 2 + ((v - yard.v) / (yard.rv + r)) ** 2 < 1) return false;
    if (!fieldsOk && (Math.abs(u - yu) > FENCE_DU)) return false;
    if (inMud(u, v, r + 0.3) || distTo(track, u, v) < path + r) return false;
    return !taken.some(([x, z, q]) => (u - x) ** 2 + (v - z) ** 2 < (space + q) ** 2);
  };
  const scatter = (n, r, box, opts, fn) => {
    const out = [];
    for (let t = 0; t < n * 14 && out.length < n; t++) {
      const u = rng.float(box[0], box[2]), v = rng.float(box[1], box[3]);
      if (!clear(u, v, r, opts)) continue;
      out.push(fn(u, v));
      if (r > 0.3) taken.push([u, v, r]);
    }
    return out;
  };

  // ---- behind the barn: an orchard on one side, round bales on the other ----
  const back = { v0: barn.v + barn.d / 2 + 2.5, v1: vB - 2.5 };
  const orchard = [];
  for (let i = 0; i < 6; i++) {
    const row = i % 2, col = Math.floor(i / 2), du = -(4.5 + col * 4.6) + rng.float(-0.6, 0.6), v = back.v0 + 2.5 + row * 6.5 + rng.float(-0.7, 0.7) + (col % 2) * 2;
    if (v > back.v1 - 1 || !clear(D(du), v, 1.6, { path: 0 })) continue;
    orchard.push({ u: D(du), v, s: rng.float(0.85, 1.05), seed: rng.int(0, 1e6) });
    taken.push([D(du), v, 1.8]);
  }
  const [bu0, bu1] = span(2.5, FENCE_DU - 2.2);
  const bales = scatter(4, 1.4, [bu0, back.v0 + 1, bu1, back.v1], { path: 0 }, (u, v) => ({ u, v, rot: rng.float(0, Math.PI) }));
  mud.push(...scatter(1, 1.2, [Math.min(D(-12), D(12)), back.v0, Math.max(D(-12), D(12)), back.v1], { path: 0 }, (u, v) => ({ u, v, ru: 1.3, rv: 0.95 })));

  // ---- trees: a few big ones along the hedges and in the meadow ----
  const hedgeTrees = [];
  for (let t = 0; t < 80 && hedgeTrees.length < 7; t++) {
    const k = rng.int(0, 2), u = k === 0 ? uL + 1.6 : k === 1 ? uR - 1.6 : rng.float(uL + 6, uR - 6), v = k === 2 ? vB - 1.6 : rng.float(vF + 8, vB - 4);
    if (hedgeTrees.some((h) => Math.hypot(h.u - u, h.v - v) < 14) || Math.hypot(u - pen.gateU, v - pen.gateV) < 9) continue;
    if (k === 2 && Math.abs(u - yu) < FENCE_DU + 2 && orchard.some((o) => Math.hypot(o.u - u, o.v - v) < 5)) continue;
    hedgeTrees.push({ u, v, s: rng.float(1.4, 1.85), seed: rng.int(0, 1e6) });
  }
  const meadowTrees = [];
  for (let tries = 0; tries < 60 && meadowTrees.length < 3; tries++) {
    const u = rng.float(uL + 4, uR - 4), v = rng.float(EDGE + 3, vF - 3);
    if (distTo(lane, u, v) < 5 || meadowTrees.some((t) => Math.hypot(t.u - u, t.v - v) < 15) || inMud(u, v, 2)) continue;
    meadowTrees.push({ u, v, s: rng.float(1.4, 1.8), seed: rng.int(0, 1e6) });
  }
  // Up the hills round about (just to look at).
  const hillTrees = [];
  for (let t = 0; t < 700 && hillTrees.length < 40; t++) {
    const u = rng.float(uL - 34, uR + 34), v = rng.float(EDGE + 6, vB + 34);
    if (u > uL - 1.5 && u < uR + 1.5 && v < vB + 1.5) continue;
    const out = Math.max(uL - u, u - uR, v - vB, 0);
    if (rng.next() < out / 34 || hillTrees.some((h) => (h.u - u) ** 2 + (h.v - v) ** 2 < 30)) continue;
    hillTrees.push({ kind: rng.chance(0.2) ? 'pine' : 'oak', u, v, s: rng.float(1.4, 2.1), seed: rng.int(0, 1e6) });
  }

  // Buttercups, daisies and clover in the meadow (thickest by the lane), and a few round the yard.
  const flowers = [];
  for (let t = 0; t < 500 && flowers.length < 110; t++) {
    const u = rng.float(uL + 1, uR - 1), v = rng.float(EDGE + 0.5, vF - 0.9);
    const dl = distTo(lane, u, v);
    if (dl < 1.9 || (dl > 7 && rng.chance(0.6)) || inMud(u, v, 0.5)) continue;
    flowers.push({ u, v, s: rng.float(0.8, 1.2), kind: rng.chance(0.62) ? 0 : rng.chance(0.6) ? 1 : 2 }); // (0 buttercup, 1 daisy, 2 clover)
  }
  // Long grass tufts along the fences and hedges (where the mower can't get).
  const tufts = [];
  for (let t = 0; t < 900 && tufts.length < 150; t++) {
    const k = rng.int(0, 3), along2 = rng.next();
    const u = k < 2 ? fences[k] + rng.float(-0.7, 0.7) : k === 2 ? uL + 1.2 + rng.float(0, 1) : uR - 1.2 - rng.float(0, 1), v = vF + 1 + along2 * (vB - vF - 2);
    if (inMud(u, v, 0.3) || rects.some(([u0, v0, u1, v1]) => u > u0 && u < u1 && v > v0 && v < v1) || Math.abs(v - sheepField.gateV) < 1.8 || Math.abs(v - cropField.gateV) < 1.8) continue;
    tufts.push({ u, v, s: rng.float(0.7, 1.3), rot: rng.float(0, 6.28) });
  }

  // ---- smells to sniff out, and spots for jobs and hidden things ----
  const smellSpots = scatter(20, 0, [uL + 2, vF + 2, uR - 2, vB - 2], { path: 0, fence: 0.6 }, (u, v) => [u, v]);
  for (let t = 0; t < 40 && smellSpots.length < 26; t++) { const u = rng.float(uL + 2, uR - 2), v = rng.float(EDGE + 2, vF - 2); if (distTo(lane, u, v) > 1.5) smellSpots.push([u, v]); }
  /** Somewhere for a job's thing to be left (anywhere on the farm, clear of everything), or null. */
  const free = (q, r = 0.7) => { for (let i = 0; i < 60; i++) { const u = q.float(uL + 2, uR - 2), v = q.float(vF + 2, vB - 2); if (clear(u, v, r, { path: 0 })) return [u, v]; } return null; };
  // Named hiding places (eggs get laid in them; things can be hidden in them).
  const hides = [
    { id: 'barn', name: 'in the barn', u: barn.u + s * rng.float(-3.6, -1.2), v: barn.v + rng.float(-1.5, 1.8) },
    { id: 'loft', name: 'up on the hay in the barn', u: barn.u + s * 3.4, v: barn.v + 2.6, y: 1.5 },
    { id: 'coop', name: 'behind the hen house', u: coop.u - s * 1.4, v: coop.v + 1.4 },
    { id: 'pond', name: 'in the reeds by the duck pond', u: pond.u + Math.cos(0.8) * (pond.r + 0.7), v: pond.v + Math.sin(0.8) * (pond.r + 0.7) },
    { id: 'tractor', name: 'under the tractor', u: tractor.u + Math.sin(tractor.face) * 1.6, v: tractor.v + Math.cos(tractor.face) * 1.6 },
    { id: 'well', name: 'by the old well', u: well.u + 1.1, v: well.v - 0.8 },
    { id: 'stack', name: 'by the hay bales', u: stack.u - s * 0.2, v: stack.v + 2.6 },
    { id: 'orchard', name: 'in the orchard', u: orchard[0] ? orchard[0].u + 1.4 : D(-6), v: orchard[0] ? orchard[0].v - 1.2 : back.v0 + 3 },
    { id: 'house', name: 'round the back of the farmhouse', u: house.u - s * (house.d / 2 + 1.0), v: house.v + rng.float(-2, 2) },
    { id: 'scarecrow', name: 'by the scarecrow', u: scarecrow.u + 1.0, v: scarecrow.v - 0.6 },
  ];
  // Where the farmer potters about.
  const posts = [
    farmer,
    { u: coop.u + s * 1.8, v: coop.v - 1.2 },
    { u: sty.gateU - s * 1.4, v: sty.v + 0.6 },
    { u: barn.u - s * 3.2, v: barn.front - 1.6 },
    { u: house.door[0] + s * 1.6, v: house.v - 1.0 },
  ];

  // ---- grass grows everywhere but the yard, the track, the lane, the mud, the pond and inside things ----
  const CELL = 0.5, gw = Math.ceil((uR - uL) / CELL), gh = Math.ceil((vB - EDGE) / CELL), lawn = new Uint8Array(gw * gh).fill(1);
  const unlawn = (u, v, ru, rv = ru) => {
    const i0 = Math.max(0, Math.floor((u - ru - uL) / CELL)), i1 = Math.min(gw - 1, Math.floor((u + ru - uL) / CELL));
    const j0 = Math.max(0, Math.floor((v - rv - EDGE) / CELL)), j1 = Math.min(gh - 1, Math.floor((v + rv - EDGE) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (((uL + (i + 0.5) * CELL - u) / ru) ** 2 + ((EDGE + (j + 0.5) * CELL - v) / rv) ** 2 < 1) lawn[j * gw + i] = 0;
  };
  const unrect = (u0, v0, u1, v1) => { for (let u = u0; u <= u1; u += CELL) for (let v = v0; v <= v1; v += CELL) unlawn(u, v, CELL * 0.6); };
  for (const [u, v] of track) unlawn(u, v, 1.7);
  for (const [u, v] of lane) unlawn(u, v, 1.75);
  unlawn(yard.u, yard.v, yard.ru, yard.rv);
  unlawn(pond.u, pond.v, pond.r + 0.3);
  for (const m of mud) unlawn(m.u, m.v, m.ru * 1.05, m.rv * 1.05);
  unrect(barn.u - barn.w / 2, barn.v - barn.d / 2, barn.u + barn.w / 2, barn.v + barn.d / 2);
  unrect(sty.u - sty.hu, sty.v - sty.hv, sty.u + sty.hu, sty.v + sty.hv);
  unrect(cropField.u0, cropField.v0, cropField.u1, cropField.v1); // (ploughed: the crops grow in rows)

  const W = (u, v) => toWorld(a, u, v);
  const local = (x, z) => [a.across[0] * x + a.across[1] * z, a.dir[0] * x + a.dir[1] * z];
  return {
    kind: 'farm', a, seed, uL, uR, vF, vB, gateU, laneU, yu, side: s,
    yard, barn, house, basket, pond, coop, well, sty, trough, stack, tractor, farmer, posts,
    sheepField, cropField, pen, scarecrow, patch, back, orchard, bales,
    lane, track, mud, hedgeTrees, meadowTrees, hillTrees, flowers, tufts,
    smellSpots, hides, free, clear,
    /** Grass here? (world coordinates) */
    lawn(x, z) {
      const [u, v] = local(x, z);
      const i = Math.floor((u - uL) / CELL), j = Math.floor((v - EDGE) / CELL);
      return i >= 0 && j >= 0 && i < gw && j < gh && lawn[j * gw + i] === 1;
    },
    W,
  };
}
