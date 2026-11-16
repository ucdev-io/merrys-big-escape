import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { TOWN } from '../../../world/town/generator.js';
import { blocked, freeSpot } from '../../../world/spots.js';
import { NEIGHBOURS } from '../../lines/jobs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = TOWN.BLOCK / 2;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const THEM = { her: 'her', his: 'him', their: 'them' };
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Mrs Plum’s", "Gus’s", "the Pickering twins’". */
export const possessive = (name) => `${name}’${/twins$/.test(name) ? '' : 's'}`;

/**
 * Everyone and everywhere a job can involve, worked out from the town itself, so it's the same on every
 * device: who lives at each house (and its number), the park, pond, bakery and alley, the lampposts
 * and park trees things get stuck up, and the bins Pickles likes to sit on.
 */
export class JobWorld {
  /**
   * @param world  the built town (gardens, homes, bins, water, parkTrees…)
   * @param seed   the town's seed
   * @param live   { gus(), duchess(), postman() → positions; board: Vector3 } (things that live elsewhere)
   */
  constructor(world, seed, live) {
    Object.assign(this, { world, live });
    this.board = live.board;
    const rng = new RNG(`folk:${seed}`);
    const names = rng.shuffle(NEIGHBOURS.slice());
    const gardens = world.gardens.filter((g) => !g.home && g.door && g.front);
    const numbers = rng.shuffle(gardens.map((_, i) => i + 1));
    this.people = {};
    gardens.forEach((g, i) => {
      const n = names[i % names.length];
      const step = g.door.clone().setY(0).addScaledVector(g.front, 1.1);
      const gate = world.homes?.find((h) => h.garden === g)?.pos.clone() ?? step.clone().addScaledVector(g.front, 6);
      this.add({ ...n, id: `h${i}`, kind: n.kid ? 'kid' : 'house', number: numbers[i], garden: g, step, gate, look: i, reach: 1.6 });
    });
    this.houses = Object.values(this.people);
    // Friends who can ask too: Gus in the park, Duchess at the pond, and the baker at the bakery's door.
    this.add({ id: 'gus', kind: 'gus', name: 'Gus', their: 'his', emoji: '👴', reach: 2.2 });
    this.add({ id: 'duchess', kind: 'duchess', name: 'Duchess', their: 'her', emoji: '🦆', reach: 3.6 });
    this.places = Object.fromEntries(world.layout.places.filter((p) => p.type !== 'home').map((p) => [p.type, p]));
    this.pond = world.water?.find((w) => w.kind === 'pond') ?? null;
    this.woods = world.areas?.find((a) => a.kind === 'woods') ?? null; // (out past the edge of town)
    this.farm = world.areas?.find((a) => a.kind === 'farm') ?? null;
    const bk = this.places.bakery;
    const shop = bk && world.gardens.find((g) => !g.front && !g.home && Math.abs(g.door.x - bk.x) < H + 2 && Math.abs(g.door.z - bk.z) < H + 2);
    // (She's the baker at her stall in the heists, too: world.heist.bakery.baker is where she stands.)
    if (shop) this.add({ id: 'baker', kind: 'baker', name: 'the baker', their: 'her', emoji: '🧑‍🍳', door: shop.door, step: this.outside(shop.door), head: world.heist?.bakery?.baker ?? null, reach: 1.8 });
    // Lampposts on every block corner, and the park's trees (things get stuck up them).
    this.lamps = world.layout.blocks.flatMap((b) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz], k) => ({ i: `${b.id}.${k}`, x: b.x + sx * (H + 1.4), z: b.z + sz * (H + 1.4), block: b })));
    this.trees = (world.parkTrees ?? []).map((t, i) => ({ ...t, i }));
  }

  add(p) {
    p.Name = cap(p.name);
    p.whose = possessive(p.name);
    p.Whose = cap(p.whose);
    p.them = THEM[p.their] ?? 'them';
    p.at = p.number ? ` at number ${p.number}` : '';
    Object.assign(p, p.plural ? { has: 'have', is: 'are', thinks: 'think' } : { has: 'has', is: 'is', thinks: 'thinks' });
    this.people[p.id] = p;
  }

  /** Just outside a door (the side that isn't inside a building). */
  outside(door) {
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = door.x + dx * 0.9, z = door.z + dz * 0.9;
      if (!blocked(this.world, x, z, 0.3) && blocked(this.world, door.x - dx * 0.6, door.z - dz * 0.6, 0.05)) return V(x, 0, z);
    }
    return V(door.x, 0, door.z);
  }

  /** Where a thing goes back to for this person (right now: Gus and Duchess can wander a little). */
  dest(p) {
    if (p.kind === 'gus') return this.live.gus();
    if (p.kind === 'duchess') return this.live.duchess();
    return p.step;
  }

  /** Just above their head, or their door (for speech bubbles). */
  anchor(p) {
    if (p.kind === 'gus') return () => this.live.gus().clone().add(V(0, 1.05, 0));
    if (p.kind === 'duchess') return () => this.live.duchess().clone().add(V(0, 0.55, 0));
    const d = (p.head ?? p.garden?.door ?? p.door).clone().setY(p.head ? 2.0 : 2.1); // (the baker: from behind her stall)
    return () => d;
  }

  /** "by number 12", "by Wiggleton Park", "on Crumbs Street"… (for lampposts and pavements). */
  near(x, z) {
    let best = null, bd = 14;
    for (const h of this.houses) { const d = Math.hypot(h.gate.x - x, h.gate.z - z); if (d < bd) { bd = d; best = h; } }
    if (best) return `by number ${best.number}`;
    const b = this.blockAt(x, z, 3);
    const pl = b && Object.values(this.places).find((q) => q.block === b.id);
    if (pl) return pl.type === 'bakery' ? `on ${pl.name}` : pl.type === 'alley' ? `at the end of ${pl.name}` : `by ${pl.name}`;
    return 'round the corner';
  }

  blockAt(x, z, pad = 0) { return this.world.layout.blocks.find((b) => Math.abs(x - b.x) < H + pad && Math.abs(z - b.z) < H + pad) ?? null; }

  /** Not in a flowerbed (nobody leaves a job there: mischief would be unfair). */
  clear(x, z, pad = 0.7) {
    if (blocked(this.world, x, z, pad)) return false;
    for (const b of this.world.beds ?? []) if (x > b.x0 - 0.4 && x < b.x1 + 0.4 && z > b.z0 - 0.4 && z < b.z1 + 0.4) return false;
    return true;
  }

  spotIn(rng, x0, z0, x1, z1, pad = 0.7) {
    for (let i = 0; i < 60; i++) {
      const x = rng.float(x0, x1), z = rng.float(z0, z1);
      if (this.clear(x, z, pad)) return { x, z };
    }
    return null;
  }

  /**
   * A place for a job: { kind, name (how it reads: "in Wiggleton Park"), spot(rng) → {x, z} | null, house? }.
   * kind: park | pond | bakery | alley | garden | street | woods. `house` picks whose garden/pavement.
   */
  area(kind, rng, { giver = null, house = null } = {}) {
    const P = this.places;
    if (kind === 'woods') {
      const w = this.woods;
      return w && { kind, far: true, name: `in ${w.name}`, spot: (q) => { const s = w.spot(q); return s && this.clear(s.x, s.z) ? s : null; } };
    }
    if (kind === 'farm') { // (on the farm: in the fields, the orchard, round the yard…)
      const f = this.farm;
      return f && { kind, far: true, name: `on ${f.name}`, spot: (q) => { const s = f.spot(q); return s && this.clear(s.x, s.z) ? s : null; } };
    }
    if (kind === 'garden' || kind === 'street') {
      const h = house ?? rng.pick(this.houses);
      if (!h) return null;
      if (kind === 'garden') {
        const r = h.garden.rect, own = giver && giver === h;
        return { kind, house: h, name: own ? `somewhere in ${h.their} own garden` : `in ${h.whose} garden (number ${h.number})`, spot: (q) => this.spotIn(q, r.x0 + 0.8, r.z0 + 0.8, r.x1 - 0.8, r.z1 - 0.8) };
      }
      const along = V(-h.garden.front.z, 0, h.garden.front.x);
      return {
        kind, house: h, name: `on the pavement by number ${h.number}`,
        spot: (q) => { for (let i = 0; i < 20; i++) { const s = q.float(2, 7) * (q.chance(0.5) ? 1 : -1), x = h.gate.x + along.x * s, z = h.gate.z + along.z * s; if (this.clear(x, z, 0.5)) return { x, z }; } return null; },
      };
    }
    const pl = P[kind];
    if (!pl) return null;
    if (kind === 'pond' && this.pond) {
      const w = this.pond;
      return {
        kind, name: `by ${pl.name}`,
        spot: (q) => { for (let i = 0; i < 40; i++) { const a = q.float(0, Math.PI * 2), k = q.float(1.12, 1.45), x = w.x + Math.cos(a) * (w.rx * k + 0.6), z = w.z + Math.sin(a) * (w.rz * k + 0.6); if (Math.abs(x - pl.x) < H - 1 && Math.abs(z - pl.z) < H - 1 && this.clear(x, z)) return { x, z }; } return null; },
      };
    }
    const name = kind === 'park' ? `in ${pl.name}` : kind === 'bakery' ? `on ${pl.name}` : `down ${pl.name}`;
    const inset = kind === 'park' ? 2 : 1.2;
    return { kind, name, spot: (q) => this.spotIn(q, pl.x - H + inset, pl.z - H + inset, pl.x + H - inset, pl.z + H - inset) };
  }

  /** Bins Pickles might be sat on, with how each one reads ("down Whiffy Alley", "outside number 4"). */
  bins() {
    return (this.world.bins ?? []).filter((b) => !b.tipped).map((b) => {
      const h = b.garden && this.houses.find((q) => q.garden === b.garden);
      if (h) return { bin: b, name: `outside number ${h.number}` };
      const blk = this.blockAt(b.x, b.z, 3), pl = blk && Object.values(this.places).find((q) => q.block === blk.id);
      return { bin: b, name: pl?.type === 'bakery' ? `behind the shops on ${pl.name}` : pl ? `down ${pl.name}` : this.near(b.x, b.z) };
    });
  }

  /** A free spot near a point (e.g. beside the postman). */
  spotNear(rng, x, z, rMin, rMax) { return freeSpot(this.world, rng, x, z, rMin, rMax, { pad: 0.5 }); }

  dist(a, b) { return flat(a, b); }
}
