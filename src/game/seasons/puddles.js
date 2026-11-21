import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { blobGeometry } from '../../world/props.js';
import { progress } from '../progress.js';
import { season } from '../season.js';
import { seasonRng, clearSpot, blockAt, groundY, flat, V } from './common.js';
import { TOWN } from '../../world/town/generator.js';

const H = TOWN.BLOCK / 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

/**
 * 💧 Puddles: they fill up while it rains (and dry up slowly afterwards). Run through one for a splash!
 * All of them are one instanced mesh. In winter there are none (it snows instead).
 */
export class Puddles {
  constructor(S) {
    this.S = S;
    const { world, seed } = S;
    this.spots = [];
    if (world.layout?.blocks) {
      const rng = seasonRng(seed, 'puddles');
      for (let tries = 0; this.spots.length < 34 && tries < 600; tries++) {
        const b = rng.pick(world.layout.blocks);
        const onPath = rng.chance(0.6), along = rng.float(-H + 1, H - 1), off = (H + 1) * (rng.chance(0.5) ? 1 : -1);
        const [x, z] = onPath ? (rng.chance(0.5) ? [b.x + off, b.z + along] : [b.x + along, b.z + off]) : [b.x + rng.float(-H + 2, H - 2), b.z + rng.float(-H + 2, H - 2)];
        if (!blockAt(world, x, z) || !clearSpot(world, x, z, 0.5) || this.spots.some((p) => flat(p, { x, z }) < 4)) continue;
        this.spots.push({ x, z, s: rng.float(0.7, 1.25), r: rng.float(0, 6), y: groundY(world, x, z) + 0.004, cd: 0 });
      }
    } else {
      for (const [x, z, s] of [[-4.6, 1.2, 1], [6.2, -2.4, 0.8], [-1.5, 4.6, 0.9], [2.6, -6.1, 0.7]]) this.spots.push({ x, z, s, r: x, y: 0.02, cd: 0 });
    }
    this.mesh = new THREE.InstancedMesh(blobGeometry(7, 0.2, 2), paint(0x9fc3d6, { kind: 'inst' }), Math.max(1, this.spots.length));
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    S.scene.add(this.mesh);
    this.level = 0;
    this.shown = -1;
    this.starT = 0;
    this.near = new Map(); // remote dog → cooldown
  }

  update(dt) {
    const wet = season.raining && !season.is('winter');
    this.level = wet ? Math.min(1, this.level + dt / 35) : Math.max(0, this.level - dt / 140);
    if (season.is('winter')) this.level = 0;
    const lv = Math.round(this.level * 60) / 60;
    if (lv !== this.shown) {
      this.shown = lv;
      const k = Math.sqrt(lv);
      this.spots.forEach((p, i) => {
        _q.setFromAxisAngle(UP, p.r);
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(0.8 * p.s * k, 0.008, 0.55 * p.s * k));
        this.mesh.setMatrixAt(i, _m);
      });
      this.mesh.count = lv > 0.02 ? this.spots.length : 0;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.level < 0.15) return;
    // Splash! (and friends' dogs too)
    const P = this.S.player, fx = this.S.actions?.waterFx, k = Math.sqrt(this.level);
    this.starT -= dt;
    for (const p of this.spots) {
      p.cd -= dt;
      const r = 0.6 * p.s * k + 0.15;
      if (p.cd <= 0 && P.grounded && P.speed > 1.2 && P.pos.y < 0.3 && flat(P.pos, p) < r) {
        p.cd = 0.9;
        fx?.splash(V(P.pos.x, 0, P.pos.z), p.y, Math.min(1, P.speed / 5), true);
        if (this.starT <= 0) { this.starT = 8; progress.stat('splashes'); progress.award(1, 'Splosh!'); }
      }
      for (const rd of this.S.remotes?.dogs.values() ?? []) {
        const q = rd.dog.root.position, cd = this.near.get(rd.id) ?? 0;
        if (cd > performance.now() || !rd.dog.root.visible || q.y > 0.3 || flat(q, p) > r) continue;
        this.near.set(rd.id, performance.now() + 900);
        fx?.splash(V(q.x, 0, q.z), p.y, 0.5, false);
      }
    }
  }

  get prompt() { return null; }

  dispose() { this.mesh.removeFromParent(); }
}
