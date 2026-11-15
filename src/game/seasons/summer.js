import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeasonPart } from './part.js';
import { paint } from '../../render/watercolorMaterial.js';
import { Sprinkler } from '../yard/sprinkler.js';
import { progress } from '../progress.js';
import { POOL } from '../lines/seasons.js';
import { V, flat, seasonRng, clearSpot } from './common.js';
import { paddlingPoolGeometry } from './models.js';

/**
 * ☀️ Summer: lush greens (painted in), and
 *   paddling pools in some gardens (hop in for a splash) and sprinklers (run through — then shake!);
 *   the ice-cream van out and about more often; and more BBQ parties (see heistRules.js PARTY).
 */
export class Summer extends SeasonPart {
  constructor(S) {
    super(S);
    this.pools = [];
    this.sprinklers = [];
    if (this.town) this.garden();
    // The ice-cream van parks up far more often in summer (see systems/traffic.js).
    if (S.traffic) { this.van = S.traffic.van; S.traffic.van = { stay: 18, gap: [14, 24], cool: 20 }; }
  }

  /** Pools and sprinklers in a few gardens (the same ones on every device). */
  garden() {
    const { world, seed } = this.S, rng = seasonRng(seed, 'summer');
    const gardens = rng.shuffle((world.gardens ?? []).filter((g) => g.rect && g.front && !g.home).slice());
    const geos = [];
    for (const g of gardens) {
      if (this.pools.length >= 4 && this.sprinklers.length >= 3) break;
      const r = g.rect, pool = this.pools.length < 4;
      for (let k = 0; k < 10; k++) {
        const x = rng.float(r.x0 + 2, r.x1 - 2), z = rng.float(r.z0 + 2, r.z1 - 2);
        if (!clearSpot(world, x, z, pool ? 1.5 : 0.8) || [...this.pools, ...this.sprinklers.map((s) => s.pos)].some((p) => flat(p, { x, z }) < 4)) continue;
        if (pool) {
          geos.push(paddlingPoolGeometry([0x6fa6d6, 0xf2a0b4, 0xf6d06a][this.pools.length % 3]).translate(x, 0.02, z));
          const zone = { kind: 'pool', x, z, r: 0.84, surface: 0.28 };
          (world.water ??= []).push(zone);
          this.pools.push({ x, z, zone });
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this.circle(x + Math.cos(a) * 1.0, z + Math.sin(a) * 1.0, 0.17, 0.44); }
          this.circle(x, z, 0.86, 0.12);
        } else {
          const before = world.colliders.circles.length, s = new Sprinkler(this.S.scene, world, V(x, 0, z));
          this.cols.push(...world.colliders.circles.slice(before));
          this.objects.push(s.head.parent, s.spray.mesh);
          this.sprinklers.push(s);
        }
        break;
      }
    }
    if (geos.length) {
      const m = this.add(new THREE.Mesh(mergeGeometries(geos), paint(0xffffff, { vertexColors: true })));
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.soakT = 0;
  }

  update(dt) {
    const P = this.player;
    this.soakT -= dt;
    for (const s of this.sprinklers) {
      if (s.update(dt, P.pos, !P.frozen) && this.soakT <= 0) {
        this.soakT = 10;
        progress.award(3, 'Soaked!');
        this.hud.float(`💦 ${this.S.line(POOL.sprinkler, POOL.sprinkler)}`, this.S.actions.anchor(), 'xp');
        setTimeout(() => this.S.actions?.waterFx.shake(P.dog, P.pos), 900);
      }
    }
    // A splash in a paddling pool: a happy word (the splash and the shake are the water's own).
    if (P.enteredSpeed && this.pools.some((p) => flat(P.pos, p) < 1.1)) this.hud.float(this.S.line(POOL.splash, POOL.splash), this.S.actions.anchor(), 'xp');
  }

  dispose() {
    const W = this.S.world;
    if (W.water) W.water = W.water.filter((z) => !this.pools.some((p) => p.zone === z));
    if (this.S.traffic && this.van) this.S.traffic.van = this.van;
    super.dispose();
  }
}
