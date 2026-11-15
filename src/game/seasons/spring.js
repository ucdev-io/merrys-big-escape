import * as THREE from 'three';
import { SeasonPart } from './part.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { EGGS } from '../lines/seasons.js';
import { RNG } from '../../core/rng.js';
import { TOWN } from '../../world/town/generator.js';
import { V, flat, rand, clearSpot, groundY } from './common.js';
import { instanced, eggGeometry, paradeDuck } from './models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SHELLS = [0xf6c3d3, 0xb8e0f0, 0xf9e79a, 0xc9b8f0, 0xbfe8b8, 0xffd0a8];
const H = TOWN.BLOCK / 2;

/**
 * 🌸 Spring: blossom on the trees (painted in), showers and puddles (the weather), and
 *   an egg hunt for sniffers: painted eggs hidden all over town — sniff near one and it puffs coloured
 *   wisps; get your nose right up to it to find it. Find them all and more get hidden;
 *   a duck and her ducklings paddling round the pond in a line.
 */
export class Spring extends SeasonPart {
  constructor(S) {
    super(S);
    this.eggs = this.town ? new EggHunt(this) : null;
    const pond = S.world.water?.find((w) => w.kind === 'pond');
    this.parade = pond ? new Parade(this, pond) : null;
  }

  update(dt, f) {
    this.eggs?.update(dt, this.player, f);
    this.parade?.update(dt, this.player);
  }

  get prompt() { return this.eggs?.prompt ?? null; }
}

/** Painted eggs hidden round town, found by sniffing (each hunt is new: a different day, a different round). */
class EggHunt {
  constructor(Sp) {
    this.Sp = Sp;
    this.n = 10;
    this.mesh = Sp.add(instanced(eggGeometry(0xffffff, 0xd0d0e8), this.n, { shadow: false }));
    this.round = 0;
    this.hide();
    this.nearT = 0;
  }

  /** Hide a new set of eggs (where depends on the town, the day and the round: the same for everyone today). */
  hide() {
    const { world, seed } = this.Sp.S, day = Math.floor(Date.now() / 864e5);
    const rng = new RNG(`season:eggs:${seed}:${day}:${this.round}`), blocks = world.layout.blocks;
    this.list = [];
    for (let tries = 0; this.list.length < this.n && tries < 400; tries++) {
      const b = rng.pick(blocks), x = b.x + rng.float(-H + 1, H - 1), z = b.z + rng.float(-H + 1, H - 1);
      if (!clearSpot(world, x, z, 0.5) || this.list.some((e) => flat(e, { x, z }) < 9)) continue;
      this.list.push({ x, z, y: groundY(world, x, z) - 0.01, col: SHELLS[this.list.length % SHELLS.length], state: 'hidden', t: 0, puffT: rng.float(0, 1) });
    }
    this.list.forEach((e, i) => { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.set(e.col)); });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, P) {
    const S = this.Sp.S, sniffing = !P.frozen && !!S.input?.sniff, nose = S.actions?.nose?.() ?? P.pos;
    let near = Infinity;
    this.list.forEach((e, i) => {
      if (e.state === 'gone') return;
      if (e.state === 'found') { // pops up, then off it goes into your Sniff Book (well, your tummy)
        e.t += dt;
        const k = Math.min(1, e.t * 2.5), y = e.y + Math.sin(k * Math.PI) * 0.6 + (e.t > 0.4 ? 0.1 : 0);
        _q.setFromEuler(_e.set(0, e.t * 6, 0));
        this.mesh.setMatrixAt(i, e.t > 1.6 ? ZERO : _m.compose(_p.set(e.x, y, e.z), _q, _s.setScalar(1.6 * Math.min(1, (1.6 - e.t) * 3))));
        this.mesh.instanceMatrix.needsUpdate = true;
        if (e.t > 1.6) e.state = 'gone';
        return;
      }
      const d = flat(nose, e);
      near = Math.min(near, flat(P.pos, e));
      if (sniffing && d < 12) { e.puffT -= dt; if (e.puffT <= 0) { e.puffT = 0.35; S.actions?.smellPuff(V(e.x, e.y + 0.05, e.z), e.col); } }
      if (sniffing && d < 1.5) this.find(e);
    });
    this.near = near;
    if (this.list.every((e) => e.state === 'gone')) {
      this.round++;
      this.hide();
      this.Sp.hud.showToastRaw('🥚', 'You found every egg!', 'Somebody’s hidden some more… keep sniffing!');
    }
  }

  find(e) {
    e.state = 'found';
    e.t = 0;
    const S = this.Sp.S, before = progress.stats.eggs ?? 0;
    progress.stat('eggs');
    progress.award(4, 'Egg hunt!');
    sfx.found?.();
    buzz([20, 30, 20]);
    S.actions?.sparkle(V(e.x, 0.3, e.z), 14);
    S.hud.float(`🥚 ${S.line(EGGS.found, EGGS.found)} ${this.list.filter((q) => q.state !== 'hidden').length}/${this.list.length}`, S.actions.anchor(), 'xp');
    for (const c of COSMETICS) if (c.friend === 'eggs' && before < c.jobs && before + 1 >= c.jobs) S.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'Egg-cellent sniffing. Wear it from ☰ → My dog → Dress up.');
  }

  get prompt() { return this.near < 5 && !this.Sp.S.input?.sniff ? '🥚 Something eggy round here… hold 👃 Sniff!' : null; }
}

/** A mother duck and four ducklings, paddling round the pond in a line. */
class Parade {
  constructor(Sp, pond) {
    Object.assign(this, { Sp, pond });
    this.mum = Sp.add(instanced(paradeDuck(false), 1));
    this.kids = Sp.add(instanced(paradeDuck(true), 4));
    this.a = Math.random() * 6;
    this.t = 0;
    this.peepT = 4;
  }

  at(a) { const p = this.pond; return [p.x + Math.cos(a) * p.rx * 0.6, p.z + Math.sin(a) * p.rz * 0.55]; }

  update(dt, P) {
    this.t += dt;
    this.a += dt * 0.09;
    const put = (mesh, i, a, bob) => {
      const [x, z] = this.at(a), [x2, z2] = this.at(a + 0.02);
      _q.setFromEuler(_e.set(Math.sin(this.t * 2.2 + bob) * 0.06, Math.atan2(x2 - x, z2 - z), 0));
      mesh.setMatrixAt(i, _m.compose(_p.set(x, this.pond.surface - 0.05 + Math.sin(this.t * 2.2 + bob) * 0.012, z), _q, _s.set(1, 1, 1)));
      return { x, z };
    };
    const mum = put(this.mum, 0, this.a, 0);
    for (let i = 0; i < 4; i++) put(this.kids, i, this.a - 0.11 * (i + 1), i * 1.3);
    this.mum.instanceMatrix.needsUpdate = this.kids.instanceMatrix.needsUpdate = true;
    this.peepT -= dt;
    if (this.peepT <= 0 && flat(P.pos, mum) < 9) { this.peepT = 5 + Math.random() * 5; sfx.peep?.(); setTimeout(() => sfx.peep?.(), 160); this.Sp.hud.float('peep peep!', V(mum.x, 0.5, mum.z), 'sniff'); }
  }
}
