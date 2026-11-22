import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { TOWN } from '../../world/town/generator.js';
import { blocked, freeSpot } from '../../world/spots.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const R = TOWN.BLOCK / 2 + 1; // the middle of the pavement round a block (as in ../town/life.js)

/** Walking round a block's pavement: s = distance along it → { x, z, heading }. */
export function ring(b, s, dir = 1) {
  const L = 8 * R;
  s = ((s % L) + L) % L;
  const side = Math.floor(s / (2 * R)), t = s - side * 2 * R - R;
  const pts = [[t, -R, 1, 0], [R, t, 0, 1], [-t, R, -1, 0], [-R, -t, 0, -1]][side];
  return { x: b.x + pts[0], z: b.z + pts[1], heading: Math.atan2(pts[2] * dir, pts[3] * dir) };
}
export const RING = 8 * R;

/**
 * Where each town dog lives in this town (the same every time you come back): id → { x, z, face, kind, … }.
 * avoid: spots somebody's already using (Gus, Duchess…). Missing places (no beach in this town?) fall back
 * to the park.
 */
export function palHomes(world, seed, PALS, avoid = []) {
  const used = avoid.map((p) => ({ x: p.x, z: p.z }));
  const ok = (s, gap = 6) => s && used.every((u) => flat(u, s) > gap);
  const take = (s) => { used.push(s); return s; };
  const place = (type) => world.layout.places.find((p) => p.type === type);
  const area = (kind) => world.areas?.find((a) => a.kind === kind);
  const spawn = world.spawn ?? V(0, 0, 0);
  const out = {};

  const near = (rng, cx, cz, r0, r1, gap = 6, pad = 0.8) => {
    for (let i = 0; i < 30; i++) { const s = freeSpot(world, rng, cx, cz, r0, r1, { pad }); if (ok(s, gap)) return s; }
    return freeSpot(world, rng, cx, cz, r0, r1 + 6, { pad });
  };
  const parkSpot = (rng) => { const p = place('park') ?? { x: spawn.x + 20, z: spawn.z }; return near(rng, p.x, p.z, 4, 11.5, 7, 0.9) ?? { x: p.x + 5, z: p.z + 5 }; };

  for (const pal of PALS) {
    const rng = new RNG(`palhome:${pal.id}:${seed}`);
    let h = null;
    switch (pal.home) {
      case 'pond': {
        const pond = world.water?.find((w) => w.kind === 'pond');
        if (!pond) break;
        for (let i = 0; i < 40 && !h; i++) {
          const a = rng.float(0, Math.PI * 2), x = pond.x + Math.cos(a) * (pond.rx + 1.7), z = pond.z + Math.sin(a) * (pond.rz + 1.7);
          if (!blocked(world, x, z, 0.6) && ok({ x, z }, 6)) h = { x, z, face: Math.atan2(pond.x - x, pond.z - z), pond };
        }
        break;
      }
      case 'bakery': case 'alley': {
        const p = place(pal.home);
        const s = p && near(rng, p.x, p.z, 4, 13, 6, 0.7);
        if (s) h = { ...s, face: Math.atan2(p.x - s.x, p.z - s.z) };
        break;
      }
      case 'woods': {
        const W = area('woods');
        if (!W) break;
        for (let i = 0; i < 30 && !h; i++) { // at the edge of the den's clearing (Fern sings there)
          const a = rng.float(0, Math.PI * 2), r = Math.max(1.5, (W.den.r ?? 4) - 1.2), x = W.den.pos.x + Math.cos(a) * r, z = W.den.pos.z + Math.sin(a) * r;
          if (!blocked(world, x, z, 0.6)) h = { x, z, face: Math.atan2(W.den.pos.x - x, W.den.pos.z - z), area: W };
        }
        if (!h) { const s = W.spot(rng); if (s) h = { ...s, face: rng.float(0, 6.28), area: W }; }
        break;
      }
      case 'farm': case 'beach': {
        const A = area(pal.home);
        if (!A) break;
        const c = pal.home === 'farm' ? A.yard?.pos : null;
        const s = (c && near(rng, c.x, c.z, 1, (A.yard?.r ?? 6) + 4, 5, 0.8)) ?? A.spot(rng);
        if (s) h = { ...s, face: rng.float(0, Math.PI * 2), area: A };
        break;
      }
      case 'garden': { // somebody else's garden, not far from home (but never a friend's house in a pack: homes 1–4)
        const homes = world.homes ?? [];
        const pool = (homes.length > 6 ? homes.slice(5) : homes.slice(1)).filter((q) => q.garden);
        pool.sort((a, b) => flat(a.pos, spawn) - flat(b.pos, spawn));
        const hm = pool[Math.min(pool.length - 1, rng.int(0, 2))];
        if (!hm) break;
        const f = V(Math.sin(hm.face), 0, Math.cos(hm.face)); // (from the house out to the street)
        const gate = hm.pos.clone().addScaledVector(f, -1.7);  // the gap in the front fence
        const inside = gate.clone().addScaledVector(f, -1.3);
        h = { x: inside.x, z: inside.z, face: hm.face, garden: hm.garden, gate, out: f, mark: gate.clone().addScaledVector(f, 0.8), street: hm.pos.clone() };
        break;
      }
      case 'street': { // round the pavement of a block of houses near home
        const home = world.layout.blocks.find((b) => b.type === 'home');
        const blocks = world.layout.blocks.filter((b) => b.type === 'houses' && b !== home).sort((a, b) => flat(a, spawn) - flat(b, spawn));
        const b = blocks[Math.min(blocks.length - 1, rng.int(0, 2))];
        if (!b) break;
        const s = rng.float(0, RING), dir = rng.chance(0.5) ? 1 : -1, r = ring(b, s, dir);
        h = { x: r.x, z: r.z, face: r.heading, block: b, s, dir };
        break;
      }
      default: break; // park (below)
    }
    if (!h) { const s = parkSpot(rng); h = { ...s, face: rng.float(0, Math.PI * 2) }; }
    out[pal.id] = { kind: pal.home, ...take(h) };
  }
  return out;
}
