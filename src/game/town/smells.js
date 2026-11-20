import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { TOWN } from '../../world/town/generator.js';
import { blocked } from '../../world/spots.js';
import { BREEDS } from '../../entities/breeds.js';
import { LineBag } from '../dialogue.js';
import { SMELLS, smellWeights, POND_SMELLS } from '../lines/smells.js';
import { season } from '../season.js';
import { WOODS_SMELLS, WOODS_SMELL_WEIGHTS, WOODS_SEASON_SMELLS } from '../lines/woods.js';
import { BEACH_SMELLS, BEACH_SMELL_WEIGHTS, BEACH_SEASON_SMELLS } from '../lines/beach.js';
import { FARM_SMELLS, FARM_SMELL_WEIGHTS, FARM_SEASON_SMELLS } from '../lines/farm.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = TOWN.BLOCK / 2;
const COUNT = 110;               // smells around town at any one time
const QUIET = [240, 420];        // seconds before a sniffed spot smells of something new
const BURIED = 0.5;              // the chance a spot on soft ground is something buried (see ./buried.js)
const SOFT = { woods: 'woods', farm: 'farm' }; // (areas with soft ground, and what's buried there)
const DOG_NAMES = Object.values(BREEDS).map((b) => b.dogName);
const now = () => performance.now() / 1000;
// Out in the town's areas, spots smell of things from the area's own list (where: the area's kind).
const AREA_SMELLS = { woods: { weights: WOODS_SMELL_WEIGHTS, seasons: WOODS_SEASON_SMELLS } };
AREA_SMELLS.beach = { weights: BEACH_SMELL_WEIGHTS, seasons: BEACH_SEASON_SMELLS };
const INFO = { ...SMELLS, ...WOODS_SMELLS, ...BEACH_SMELLS };
AREA_SMELLS.farm = { weights: FARM_SMELL_WEIGHTS, seasons: FARM_SEASON_SMELLS }; // 🚜 the farm's own
Object.assign(INFO, FARM_SMELLS);


/**
 * Smells all over the neighbourhood: news on lamp posts, dropped chips, hedgehog trails, lost
 * socks… Sniffing shows little wisps rising from the ones nearby, and the golden trail leads to
 * the closest. Get your nose right up to it to find out what it is. A few minutes later the
 * same spot smells of something new, so there's always more to find. On soft ground (gardens, the
 * park, the woods, the farm) it's often something buried: then the nose finds the spot, and 🐾 digs
 * it up (./buried.js).
 */
export class Smells {
  constructor(world, seed) {
    const rng = (this.rng = new RNG(`smells:${seed}`));
    this.digRng = new RNG(`buried:${seed}`); // (its own stream: the smells stay just where they always were)
    this.spots = [];
    this.bags = {};
    const b0 = world.bounds;
    const inGarden = (x, z) => (world.gardens ?? []).some((g) => x > g.rect.x0 && x < g.rect.x1 && z > g.rect.z0 && z < g.rect.z1);
    const add = (x, z, where, soil = null) => {
      if (x < b0.x0 + 1 || x > b0.x1 - 1 || z < b0.z0 + 1 || z > b0.z1 - 1 || blocked(world, x, z)) return false;
      if (this.spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 9)) return false; // spread them out
      const s = { x, z, pos: V(x, 0.05, z), where, soil, kind: null, buried: null, quietUntil: 0 };
      this.reroll(s);
      this.spots.push(s);
      return true;
    };
    // Dog news on about half the lamp posts (block corners).
    for (const b of world.layout.blocks) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (rng.chance(0.5)) add(b.x + sx * (H + 1.4) - sx * 0.5, b.z + sz * (H + 1.4) - sz * 0.5, 'post');
    }
    // Ducks and frogs round the pond.
    for (const w of world.water ?? []) {
      if (w.kind !== 'pond') continue;
      for (let i = 0; i < 4; i++) { const a = rng.float(0, Math.PI * 2); add(w.x + Math.cos(a) * (w.rx + 1.2), w.z + Math.sin(a) * (w.rz + 1.2), 'pond'); }
    }
    // Everything else: pavements, gardens, the park…
    for (let tries = 0; this.spots.length < COUNT && tries < COUNT * 30; tries++) {
      const b = rng.pick(world.layout.blocks);
      if (rng.chance(0.45)) { // pavement
        const along = rng.float(-H, H), off = (H + 1) * (rng.chance(0.5) ? 1 : -1);
        if (rng.chance(0.5)) add(b.x + off, b.z + along, 'any'); else add(b.x + along, b.z + off, 'any');
      } else {
        const x = b.x + rng.float(-H + 1, H - 1), z = b.z + rng.float(-H + 1, H - 1);
        add(x, z, 'any', inGarden(x, z) || b.type === 'park' || b.type === 'pond' ? 'town' : null); // (gardens and the park: soft ground)
      }
    }
    // And out in the areas (the woods…): their spots are worked out with the area.
    for (const a of world.areas ?? []) for (const [x, z] of a.smellSpots ?? []) add(x, z, a.kind, SOFT[a.kind] ?? null);
  }

  reroll(s) {
    s.buried = s.soil && this.digRng.chance(BURIED) ? s.soil : null; // (something buried here this time?)
    if (s.where === 'post') s.kind = 'news';
    else if (s.where === 'pond') s.kind = this.rng.pick(POND_SMELLS[season.is('winter') ? 'winter' : 'other']);
    else {
      // (the seasons' smells: mince pies, bonfires, cut grass… and out in an area, its own list, through the seasons too)
      const area = AREA_SMELLS[s.where];
      const weights = smellWeights(season.name, season.weather, season.festive, area?.weights, area?.seasons);
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      let r = this.rng.float(0, total);
      for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) { s.kind = k; break; } }
      s.kind ??= 'chips';
    }
  }

  /** Something buried here's been dug up (or forgotten): a while later it'll smell of something new. */
  dugUp(s) {
    s.dug = false;
    s.quietUntil = now() + QUIET[0] + Math.random() * (QUIET[1] - QUIET[0]);
    this.reroll(s);
  }

  /** The closest smell that's ready to be found (or null). */
  nearest(pos, maxDist = 30) {
    let best = null, bd = maxDist * maxDist;
    const t = now();
    for (const s of this.spots) {
      if (s.quietUntil > t) continue;
      const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /**
   * While sniffing: wisps rise from smells nearby, and a nose right next to one finds it.
   * @returns { emoji, name, line, xp, at } for a smell just found, or null
   */
  update(dt, { nose, sniffing, glow, myName = '' }) {
    if (!sniffing) return null;
    const t = now();
    let found = null;
    for (const s of this.spots) {
      if (s.quietUntil > t) continue;
      const d2 = (s.x - nose.x) ** 2 + (s.z - nose.z) ** 2;
      if (d2 < 256 && Math.random() < dt * 4) {
        glow.burst(1, () => ({
          pos: s.pos.clone().add(V(Math.random() * 0.4 - 0.2, 0.05, Math.random() * 0.4 - 0.2)),
          vel: V(Math.random() * 0.2 - 0.1, 0.45 + Math.random() * 0.4, Math.random() * 0.2 - 0.1),
          life: 1.1, size: 0.05, gravity: -0.25, drag: 1.2, color: s.buried ? 0xfff2b0 : s.kind === 'news' ? 0xf6d06a : 0xb6e07a,
        }));
      }
      if (!found && !s.dug && d2 < 1.3 * 1.3) found = s;
    }
    if (!found) return null;
    if (found.buried) { found.dug = true; return { buried: found }; } // (the nose has found the spot: now dig!)
    const info = INFO[found.kind];
    this.bags[found.kind] ??= new LineBag(info.lines);
    const others = DOG_NAMES.filter((n) => n !== myName);
    const line = this.bags[found.kind].next().replaceAll('{dog}', others[Math.floor(Math.random() * others.length)]);
    found.quietUntil = t + QUIET[0] + Math.random() * (QUIET[1] - QUIET[0]);
    const at = found.pos.clone();
    this.reroll(found); // next time it'll be something else
    return { emoji: info.emoji, name: info.name, line, xp: info.xp, at };
  }
}
