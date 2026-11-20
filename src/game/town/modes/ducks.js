import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { freeSpot } from '../../../world/spots.js';
import { Duck } from '../../../entities/duck.js';
import { CHALLENGES } from '../../challenges.js';
import { secs, solid, otherDogs } from './common.js';

const SCARE = 3.6;  // dogs closer than this send a duck scurrying away
const FLEE = 2.4;   // how fast a scared duck scurries (a walking dog is 2.6)
const AMBLE = 0.35; // a calm duck's wander
const SEND = 0.12;  // seconds between duck updates to the pack

/**
 * 🦆 Duck Round-Up (co-op): mallards have wandered off round the pond. Ducks shy away from dogs, so
 * come at them from the far side and shoo them in — easier with friends. The dog who started the
 * round-up runs the ducks for everyone (if they go home, someone else takes over).
 */
export class DuckRoundUp {
  constructor(ctx, g) { Object.assign(this, { ctx, g }); }
  get title() { return 'Duck Round-Up'; }
  get host() { return this.g.host === this.ctx.me(); }

  begin() {
    const { world, scene } = this.ctx, g = this.g, N = CHALLENGES.ducks.count;
    this.pond = world.water?.find((w) => w.kind === 'pond');
    const P = this.pond ?? { x: 0, z: 0, rx: 6, rz: 6 }, R = Math.max(P.rx, P.rz);
    const rng = new RNG(`ducks:${g.seed}`); // everyone starts with the ducks in the same places
    this.home = [...(g.home ?? [])];
    this.ducks = Array.from({ length: N }, (_, i) => {
      const at = freeSpot(world, rng, P.x, P.z, R + 3, R + 13) ?? { x: P.x + R + 4, z: P.z };
      const duck = new Duck({ mallard: true });
      duck.root.position.set(at.x, 0, at.z);
      duck.root.rotation.y = rng.float(0, Math.PI * 2);
      scene.add(duck.root);
      return { i, duck, pos: duck.root.position, vx: 0, vz: 0, wander: rng.float(0, 6.3), home: this.home.includes(i), to: null, swimTo: null, panic: 0, speed: 0 };
    });
    this.sendT = 0;
  }

  inPond(x, z, k = 0.92) {
    const p = this.pond;
    return !!p && ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < k * k;
  }

  update(dt, live) {
    const { player, me } = this.ctx, mine = { id: me(), x: player.pos.x, z: player.pos.z };
    const dogs = live ? [mine, ...otherDogs(this.ctx)] : [];
    const strays = this.ducks.filter((d) => !d.home);
    const mid = strays.reduce((s, d) => s.add(d.pos), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, strays.length));
    for (const d of this.ducks) {
      if (this.host) this.steer(d, dt, dogs, mid);
      else if (d.to) { // follow along with whoever's running the ducks
        const k = 1 - Math.exp(-dt * 10);
        const dx = (d.to.x - d.pos.x) * k, dz = (d.to.z - d.pos.z) * k;
        d.pos.x += dx; d.pos.z += dz;
        d.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
        let dh = d.to.h - d.duck.root.rotation.y;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        d.duck.root.rotation.y += dh * k;
      }
      const wet = this.inPond(d.pos.x, d.pos.z, 1), ice = wet && !!this.pond?.frozen, swim = wet && !ice; // (a frozen pond: they skate)
      d.duck.root.position.y = ice ? (this.pond.iceTop ?? 0.1) - 0.01 : swim ? -0.06 : 0;
      d.duck.update(dt, { moving: Math.min(1, d.speed / 1.5), swim });
    }
    if (this.host && live) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = SEND;
        this.ctx.send({ a: 'ducks', d: this.ducks.flatMap((d) => [d.pos.x, d.pos.z, d.duck.root.rotation.y]) });
      }
    }
    // The compass points at the nearest duck still out of the water.
    let near = null, nd = Infinity;
    for (const d of strays) { const q = Math.hypot(d.pos.x - mine.x, d.pos.z - mine.z); if (q < nd) { nd = q; near = d; } }
    return { compass: near ? { pos: near.pos, emoji: '🦆' } : null, banner: `🦆 ${this.home.length}/${this.ducks.length} in the pond` };
  }

  /** Running the ducks: shy of dogs, otherwise ambling and keeping together; safe once in the pond. */
  steer(d, dt, dogs, mid) {
    if (d.home) { // paddling about
      const p = this.pond;
      if (!d.swimTo || Math.hypot(d.swimTo.x - d.pos.x, d.swimTo.z - d.pos.z) < 0.3) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.6;
        d.swimTo = { x: p.x + Math.cos(a) * p.rx * r, z: p.z + Math.sin(a) * p.rz * r };
      }
      this.move(d, d.swimTo.x - d.pos.x, d.swimTo.z - d.pos.z, 0.4, dt, true);
      return;
    }
    let fx = 0, fz = 0, by = null, close = Infinity;
    for (const g of dogs) {
      const dx = d.pos.x - g.x, dz = d.pos.z - g.z, dd = Math.hypot(dx, dz);
      if (dd < close) { close = dd; by = g; }
      if (dd < SCARE && dd > 1e-3) { const w = (SCARE - dd) / SCARE; fx += (dx / dd) * w; fz += (dz / dd) * w; }
    }
    d.panic = Math.max(0, d.panic - dt);
    if (fx || fz) {
      if (d.panic <= 0 && Math.random() < 0.5) { d.duck.quack(); sfx.quack?.(); }
      d.panic = 1.2;
      this.move(d, fx, fz, FLEE * Math.min(1, 0.5 + Math.hypot(fx, fz)), dt);
      d.lastDog = by?.id;
    } else {
      d.wander += (Math.random() - 0.5) * dt * 2.5;
      let wx = Math.sin(d.wander), wz = Math.cos(d.wander);
      const cx = mid.x - d.pos.x, cz = mid.z - d.pos.z, cd = Math.hypot(cx, cz);
      if (cd > 4) { wx += (cx / cd) * 0.8; wz += (cz / cd) * 0.8; } // stay with the others
      // A calm duck won't go in on its own (it needs shooing!): it turns away at the water's edge.
      const n = Math.hypot(wx, wz) || 1;
      if (this.inPond(d.pos.x + (wx / n) * 1.2, d.pos.z + (wz / n) * 1.2, 1.05)) {
        const p = this.pond;
        d.wander = Math.atan2(d.pos.x - p.x, d.pos.z - p.z) + (Math.random() - 0.5);
        wx = Math.sin(d.wander); wz = Math.cos(d.wander);
      }
      this.move(d, wx, wz, AMBLE, dt);
    }
    if (this.inPond(d.pos.x, d.pos.z)) { // safe! (and which dog shooed it in)
      d.home = true;
      this.home.push(d.i);
      this.ctx.send({ a: 'home', i: d.i, by: close < SCARE + 2 ? by?.id : d.lastDog });
    }
  }

  /** Head (dx, dz)-wards at `speed`, sliding along fences and walls, and staying in town. */
  move(d, dx, dz, speed, dt, swimming = false) {
    const { world } = this.ctx, n = Math.hypot(dx, dz) || 1, k = 1 - Math.exp(-dt * (swimming ? 2 : 6));
    d.vx += ((dx / n) * speed - d.vx) * k;
    d.vz += ((dz / n) * speed - d.vz) * k;
    const nx = d.pos.x + d.vx * dt, nz = d.pos.z + d.vz * dt;
    if (!solid(world, nx, nz)) { d.pos.x = nx; d.pos.z = nz; }
    else if (!solid(world, nx, d.pos.z)) d.pos.x = nx;
    else if (!solid(world, d.pos.x, nz)) d.pos.z = nz;
    else { d.wander += Math.PI * (0.5 + Math.random()); d.vx *= -0.3; d.vz *= -0.3; }
    const b = world.bounds;
    if (b) { d.pos.x = Math.min(b.x1 - 2, Math.max(b.x0 + 2, d.pos.x)); d.pos.z = Math.min(b.z1 - 2, Math.max(b.z0 + 2, d.pos.z)); }
    d.speed = Math.hypot(d.vx, d.vz);
    if (d.speed > 0.05) d.duck.root.rotation.y = Math.atan2(d.vx, d.vz);
  }

  handle(m) {
    const { hud, me } = this.ctx;
    if (m.a === 'ducks' && !this.host) {
      this.ducks.forEach((d, i) => { if (m.d.length >= i * 3 + 3) d.to = { x: m.d[i * 3], z: m.d[i * 3 + 1], h: m.d[i * 3 + 2] }; });
    } else if (m.a === 'home') {
      this.home = m.home;
      const d = this.ducks[m.i];
      if (d) { d.home = true; d.duck.quack(); }
      sfx.quack?.(); buzz(20);
      const n = `${this.home.length}/${this.ducks.length}`;
      if (m.by === me()) hud.showToastRaw('🦆', `You shooed a duck into the pond! ${n}`, '');
      else { hud.showToastRaw('🦆', '', ''); hud.toast.querySelector('.t-head').textContent = m.name ? `${m.name} shooed a duck into the pond! ${n}` : `A duck waddled into the pond! ${n}`; }
    } else if (m.a === 'host') {
      this.g.host = m.host; // (if that's us, we run the ducks from here on)
      for (const d of this.ducks) d.to = null;
    }
  }

  results(game) {
    const N = this.ducks.length, k = (game.home ?? this.home).length, all = k >= N;
    const team = [this.ctx.me(), ...this.ctx.remotes.dogs.keys()].length;
    const html = all
      ? `<h1>🦆 All ${N} ducks are safe!</h1><p>Rounded up in <b>${secs(game.doneMs)}</b>${team > 1 ? ' — great teamwork!' : ' — all on your own!'}</p>`
      : `<h1>🦆 Duck Round-Up</h1><p>${k ? `${k} of ${N} ducks made it into the pond.` : 'The ducks gave you the slip this time!'} ${team > 1 ? 'Try coming at them from both sides!' : 'Tip: get behind them and walk them in.'}</p>`;
    return { html, xp: k * 5 + (all ? 20 : 0), won: all };
  }

  cleanup() { for (const d of this.ducks ?? []) d.duck.root.removeFromParent(); }
}
