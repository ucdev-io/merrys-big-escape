import { JOB_TYPES } from './types.js';
import { SAY, ITEM_NOTES, TWISTS, HENS } from '../../lines/jobs.js';
import { CARRYABLES } from '../../../entities/carryables.js';
import '../../../entities/jobItems.js'; // (the job things — parcels, kites… — join the carryables)
import { fill } from '../../dialogue.js';

/*
 * Making jobs: who + what + where (+ maybe a twist), as plain data ("specs") that read as a sentence:
 * "Mrs Plum’s kite is stuck on her roof — you’ll need a big jump!". Nothing here touches the scene, so
 * the same specs could be shared by a whole pack one day (send the seed, everyone makes the same jobs).
 *
 * A spec: { id, type, who (person id: the thing goes back to them, or a delivery is for them), item,
 *   spot {x, z} (where the thing is), whereName, from (deliveries: who it's from), perch (stuck things),
 *   bin + barks (Pickles), hen + look (runaway hens), twist, secs, stars, bonus, diff, text }
 */

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let nextId = 1;

function weighted(rng, table) {
  const entries = Object.entries(table).filter(([, w]) => w > 0);
  let r = rng.float(0, entries.reduce((s, [, w]) => s + w, 0));
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries.at(-1)?.[0] ?? null;
}

/** Someone to ask (from the type's givers): a grown-up's house, a kid's, Gus, Duchess or the baker. */
function pickPerson(jw, rng, kinds, opts) {
  const table = { ...kinds };
  for (const k of Object.keys(table)) if (!['house', 'kid'].includes(k) && (!jw.people[k] || opts.busy?.has(k) || opts.avoid?.has(k))) table[k] = 0;
  for (let tries = 0; tries < 10; tries++) {
    const kind = weighted(rng, table);
    if (!kind) return null;
    if (kind !== 'house' && kind !== 'kid') return jw.people[kind];
    const list = jw.houses.filter((h) => h.kind === kind && !opts.avoid?.has(h.id));
    if (list.length) return rng.pick(list);
  }
  return null;
}

/** Somewhere for the thing to be, not too near the board and not right across town. */
function pickWhere(jw, rng, wheres, giver, { from = jw.board, min = 12, max = 95 } = {}) {
  for (let tries = 0; tries < 12; tries++) {
    const kind = rng.pick(wheres);
    const own = kind === 'garden' && giver?.garden && rng.chance(0.35);
    const area = jw.area(kind, rng, { giver, house: own ? giver : null });
    const spot = area?.spot(rng);
    if (!spot || flat(spot, jw.board) < 12) continue;
    const d = flat(spot, from);
    if (d < min || d > max) continue;
    return { area, spot };
  }
  return null;
}

/** Up high: on a roof, up a lamppost or in a park tree. Strings (kites, balloons) dangle down to grab. */
function pickPerch(jw, rng, T, giver, item) {
  const strings = item === 'kite' || item === 'balloon';
  const kinds = T.perches.filter((k) => (k === 'roof' ? strings && giver.garden : k === 'lamppost' ? strings : jw.trees.length > 0));
  if (!kinds.length) return null;
  const kind = rng.pick(kinds), need = T.reach, reachY = need + 0.55;
  for (let tries = 0; tries < 10; tries++) {
    let p = null;
    if (kind === 'roof') {
      const g = giver.garden, f = g.front, sx = f.z, sz = -f.x, side = rng.chance(0.5) ? 0.95 : -0.95;
      // Caught on the gable end over the front door (houses are 3–3.6 m to the eaves; the roof overhangs by 0.35).
      const wx = g.door.x - f.x * 0.15, wz = g.door.z - f.z * 0.15, h = g.roof?.h ?? 3.3;
      p = { kind, top: { x: wx + f.x * 0.47 + sx * side, y: h + 0.55, z: wz + f.z * 0.47 + sz * side }, reach: { x: wx + f.x * 0.62 + sx * side, z: wz + f.z * 0.62 + sz * side }, face: Math.atan2(f.x, f.z), name: `on ${giver.their} roof` };
    } else if (kind === 'lamppost') {
      const home = jw.dest(giver);
      const lamps = jw.lamps.slice().sort((a, b) => flat(a, home) - flat(b, home)).slice(0, 4);
      const lamp = rng.chance(0.7) ? rng.pick(lamps) : rng.pick(jw.lamps), a = rng.float(0, Math.PI * 2);
      p = { kind, lamp: lamp.i, top: { x: lamp.x + Math.cos(a) * 0.16, y: 2.92, z: lamp.z + Math.sin(a) * 0.16 }, reach: { x: lamp.x + Math.cos(a) * 0.48, z: lamp.z + Math.sin(a) * 0.48 }, face: Math.atan2(Math.cos(a), Math.sin(a)), name: `up the lamppost ${jw.near(lamp.x, lamp.z)}` };
    } else {
      const t = rng.pick(jw.trees), a = rng.float(0, Math.PI * 2), c = Math.cos(a), s = Math.sin(a);
      const park = jw.places.park?.name ?? 'the park';
      p = strings
        ? { kind, tree: t.i, top: { x: t.x + (t.bend ?? 0) + c * 0.8 * t.s, y: 2.15 * t.s, z: t.z + (t.bend ?? 0) * 0.4 + s * 0.8 * t.s }, reach: { x: t.x + c * 1.05 * t.s, z: t.z + s * 1.05 * t.s }, face: Math.atan2(c, s), name: `up a tree in ${park}` }
        : { kind, tree: t.i, top: { x: t.x + c * 0.5, y: reachY, z: t.z + s * 0.5 }, reach: { x: t.x + c * 0.5, z: t.z + s * 0.5 }, face: Math.atan2(c, s), twig: { x: t.x + (t.bend ?? 0) * 0.3 * Math.min(1, reachY / t.s), z: t.z }, name: `in a tree in ${park}` };
    }
    if (jw.clear(p.reach.x, p.reach.z, 0.3) && flat(p.reach, jw.board) > 8) return { ...p, need, reachY };
  }
  return null;
}

/** Plan one job of a kind. null if this town can't do it right now (e.g. no bins left standing). */
export function makeOffer(type, jw, rng, opts = {}) {
  const T = JOB_TYPES[type];
  const s = { id: nextId++, type, twist: null };
  let dest;
  if (T.step === 'herd') {
    const owner = pickPerson(jw, rng, T.givers, opts);
    if (!owner) return null;
    const w = pickWhere(jw, rng, T.wheres, owner, { from: owner.gate, min: 14, max: 55 });
    if (!w || w.area.house === owner) return null;
    Object.assign(s, { who: owner.id, spot: w.spot, whereName: w.area.name, hen: rng.pick(HENS), look: rng.pick(['brown', 'white', 'grey']) });
    dest = owner.gate;
  } else if (T.step === 'pickup') {
    const to = pickPerson(jw, rng, T.givers, opts);
    if (!to) return null;
    s.who = to.id;
    s.item = rng.pick(T.items[to.kind]);
    dest = jw.dest(to);
    if (s.item === 'newspaper') { s.from = 'paperboy'; s.spot = { x: jw.board.x, z: jw.board.z }; }
    else if (s.item === 'cake' && jw.people.baker && rng.chance(0.8)) { s.from = 'baker'; s.spot = { x: jw.people.baker.step.x, z: jw.people.baker.step.z }; }
    else if (s.item !== 'cake' && rng.chance(0.45)) { s.from = 'postman'; s.spot = null; } // (he's on his round: it'll be wherever he is)
    else {
      const froms = jw.houses.filter((h) => h !== to && flat(h.step, dest) > 15 && flat(h.step, dest) < 80);
      if (!froms.length) return null;
      const f = rng.pick(froms);
      s.from = f.id; s.spot = { x: f.step.x, z: f.step.z };
    }
  } else {
    const giver = pickPerson(jw, rng, T.givers, opts);
    if (!giver) return null;
    s.who = giver.id;
    s.item = rng.pick(T.items[giver.kind] ?? T.items.house);
    dest = jw.dest(giver);
    if (T.step === 'stuck') {
      const perch = pickPerch(jw, rng, T, giver, s.item);
      if (!perch) return null;
      Object.assign(s, { perch, spot: perch.reach, whereName: perch.name });
    } else if (T.step === 'pickles') {
      const bins = jw.bins().filter((b) => flat(b.bin, jw.board) > 14 && flat(b.bin, jw.board) < 95);
      if (!bins.length) return null;
      const b = rng.pick(bins);
      Object.assign(s, { bin: b.bin.id, spot: { x: b.bin.x, z: b.bin.z }, whereName: b.name, barks: rng.chance(0.45) ? 2 : 1 });
    } else {
      const w = pickWhere(jw, rng, T.wheres, giver);
      if (!w) return null;
      Object.assign(s, { spot: w.spot, whereName: w.area.name });
    }
  }
  // Stars: more for trickier kinds and longer walks; a twist adds a bonus on top.
  const start = s.spot ?? jw.board, route = flat(jw.board, start) + flat(start, dest);
  s.twist = pickTwist(T, s, jw, rng, opts, dest);
  s.stars = T.stars + Math.min(15, Math.round(route / 8));
  s.bonus = s.twist ? Math.max(6, Math.round(T.stars * 0.45)) : 0;
  s.diff = Math.min(3, T.level + (s.twist && s.twist !== 'friend' ? 1 : 0));
  s.secs = s.twist === 'timer' ? Math.ceil((40 + route / 2.2 + (T.step === 'herd' ? 45 : T.step === 'stuck' || T.step === 'pickles' ? 20 : 0)) / 10) * 10 : 0;
  s.text = sentence(s, jw, rng);
  return s;
}

function pickTwist(T, s, jw, rng, opts, dest) {
  if (!rng.chance(0.4)) return null;
  const pond = jw.pond, nearPond = (p) => pond && p && Math.hypot(p.x - pond.x, p.z - pond.z) < Math.max(pond.rx, pond.rz) + 14;
  const ok = T.twists.filter((t) => (t !== 'friend' || opts.friend) && (t !== 'dry' || nearPond(s.spot) || nearPond(dest)));
  return ok.length ? rng.pick(ok) : null;
}

/** The job as a sentence for the board. */
function sentence(s, jw, rng) {
  const T = JOB_TYPES[s.type], g = jw.people[s.who];
  const item = CARRYABLES[s.item]?.name ?? '';
  const vars = { Who: g.Name, who: g.name, Whose: g.Whose, whose: g.whose, their: g.their, them: g.them, at: g.at, item, where: s.whereName ?? '', perch: s.whereName ?? '', Hen: s.hen ?? '', to: g.name, toAt: g.at, has: g.has, is: g.is, thinks: g.thinks };
  let key = s.type;
  if (s.type === 'dig' && g.kind === 'gus') key = 'digGus';
  if (s.type === 'deliver') {
    const f = jw.people[s.from];
    if (s.from === 'postman') key = 'deliverPostman';
    else if (s.from === 'paperboy') key = 'deliverPaper';
    else if (s.from === 'baker') key = 'deliverBaker';
    else { vars.From = `${f.Name}${f.at}`; vars.fromHas = f.has; vars.from = `${f.whose} doorstep (number ${f.number})`; vars.Pickup = `Pick it up from ${f.their} doorstep!`; }
  }
  let text = fill(rng.pick(SAY[key] ?? SAY.fetch), vars);
  if (ITEM_NOTES[s.item] && rng.chance(0.3)) text += ` ${rng.pick(ITEM_NOTES[s.item])}`;
  if (s.twist) text += fill(rng.pick(TWISTS[s.twist].say), { secs: String(s.secs) });
  return text;
}

/**
 * A few jobs to choose from. keep: offers still up on the board (topped up to n). team: a friend is in
 * the pack (so team jobs can come up, and there's always one). busy: friends with jobs of their own.
 */
export function makeOffers(jw, rng, { n = 3, team = false, friend = team, keep = [], busy = new Set() } = {}) {
  const out = keep.filter((o) => team || !JOB_TYPES[o.type].team);
  const used = new Set(out.map((o) => o.type)), avoid = new Set(out.map((o) => o.who));
  const opts = { team, friend, avoid, busy };
  for (let tries = 0; out.length < n && tries < 40; tries++) {
    const wantTeam = team && !out.some((o) => JOB_TYPES[o.type].team);
    const table = Object.fromEntries(Object.entries(JOB_TYPES).filter(([k, T]) => (wantTeam ? T.team : !T.team) && (!used.has(k) || tries > 20)).map(([k, T]) => [k, T.weight]));
    const type = weighted(rng, table);
    if (!type) break;
    const spec = makeOffer(type, jw, rng, opts);
    if (!spec) { if (tries > 30) used.add(type); continue; }
    out.push(spec);
    used.add(type);
    avoid.add(spec.who);
  }
  return out;
}
