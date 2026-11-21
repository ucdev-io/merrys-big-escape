import * as THREE from 'three';
import { paint } from '../../../render/watercolorMaterial.js';
import { LineBag } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { CRABS } from '../../lines/beach.js';
import { crabBodyGeometry, crabClawGeometry } from '../../../entities/beachItems.js';
import { bsfx } from './sounds.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const N = 6; // crabs round the rock pools (the first is Nipper, the oldest and biggest)

/**
 * 🦀 Crabs at the rock pools: pottering about sideways (the only proper way), waving their claws at a dog
 * who comes to look ("Snip snip!"), dashing off and burrowing into the sand if you get too close — just
 * their eyes poking out — and popping up again a bit later. A woof sends them all scuttling. Nipper, the
 * oldest, has a lot to say about his rock pools. Each device has its own crabs. Three instanced meshes.
 */
export class Crabs {
  constructor(B) {
    this.B = B;
    const pools = B.area.pools;
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, paint(0xffffff, { vertexColors: true, kind: 'inst' }), N);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      B.scene.add(m);
      return m;
    };
    this.bodyMesh = mk(crabBodyGeometry());
    this.clawR = mk(crabClawGeometry(1));
    this.clawL = mk(crabClawGeometry(-1));
    this.crabs = Array.from({ length: pools.length ? N : 0 }, (_, i) => {
      const p = pools[i % pools.length], a = rand(0, 6.28), r = p.r + rand(0.35, 0.9);
      const home = V(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r);
      return { i, nipper: i === 0, s: i === 0 ? 1.5 : rand(0.75, 1.05), pool: p, home, pos: home.clone(), heading: rand(0, 6.28), to: null, state: 'potter', t: rand(0.5, 3), y: 0, wave: 0, bob: rand(0, 6), talkT: 0 };
    });
    this.rig = new THREE.Object3D();
    this.R = new THREE.Object3D(); this.L = new THREE.Object3D();
    this.R.position.set(0.07, 0.045, 0.035); this.L.position.set(-0.07, 0.045, 0.035);
    this.rig.add(this.R, this.L);
    this.spotted = false;
    this.awardT = 0;
    this.bags = {};
  }

  line(key) { return (this.bags[key] ??= new LineBag(CRABS[key])).next(); }

  /** A new spot near home (round the rim of its pool). */
  wander(c) {
    const a = rand(0, 6.28), r = c.pool.r + rand(0.3, 1.1);
    c.to = V(c.pool.pos.x + Math.cos(a) * r, 0, c.pool.pos.z + Math.sin(a) * r);
  }

  /** Off it dashes (sideways), away from `from`, then burrows. */
  flee(c, from) {
    if (c.state === 'hide' || c.state === 'dig') return false;
    const away = c.pos.clone().sub(from).setY(0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    c.to = c.pos.clone().addScaledVector(away, rand(1.2, 1.8));
    c.state = 'flee';
    c.t = 0.9;
    return true;
  }

  /** A woof (mine or a friend's): every crab nearby scuttles off and hides. */
  onBark(pos, mine = true) {
    let n = 0;
    for (const c of this.crabs) if (flat(c.pos, pos) < 6 && this.flee(c, pos)) n++;
    if (n) bsfx.snip(mine ? 0.9 : 0.5);
    if (mine && n && this.awardT <= 0) { this.awardT = 15; progress.award(1, 'Crab dash!'); this.B.hud.float(`🦀 ${this.line('hide')}`, this.B.actions.anchor()); }
  }

  update(dt, P, { canAct = true } = {}) {
    this.awardT -= dt;
    const B = this.B;
    for (const c of this.crabs) {
      c.t -= dt; c.talkT -= dt; c.bob += dt;
      const d = flat(P.pos, c.pos), close = canAct && P.pos.y < 0.6;
      let speed = 0;
      switch (c.state) {
        case 'potter':
          if (close && d < 1.5) { this.flee(c, P.pos); bsfx.snip(0.7); break; }
          if (close && d < 3.4) { // claws up, watching you
            c.wave = Math.min(1, c.wave + dt * 3);
            c.heading += Math.atan2(Math.sin(Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z) - c.heading), Math.cos(Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z) - c.heading)) * (1 - Math.exp(-dt * 3));
            if (c.nipper && c.talkT <= 0) { c.talkT = 22; B.hud.say(`🦀 ${this.line('nipper')}`, () => c.pos.clone().add(V(0, 0.45, 0)), 4); bsfx.snip(0.6); }
            break;
          }
          c.wave = Math.max(0, c.wave - dt * 2);
          if (!c.to && c.t <= 0) { this.wander(c); c.t = rand(2, 5); }
          speed = 0.5;
          break;
        case 'flee': speed = 1.9; c.wave = 1; if (c.t <= 0) { c.state = 'dig'; c.t = 0.4; } break;
        case 'dig': c.y = Math.max(-0.075 * c.s, c.y - dt * 0.3); if (c.t <= 0) { c.state = 'hide'; c.t = rand(5, 9); } break; // down into the sand: just eyes
        case 'hide': if (c.t <= 0 && !(close && d < 2.2)) { c.state = 'up'; c.t = 0.4; } break;
        case 'up': c.y = Math.min(0, c.y + dt * 0.3); if (c.t <= 0) { c.y = 0; c.state = 'potter'; c.to = null; c.t = rand(1, 3); } break;
      }
      // Scuttling sideways towards wherever it's going.
      if (c.to && speed) {
        const dx = c.to.x - c.pos.x, dz = c.to.z - c.pos.z, l = Math.hypot(dx, dz);
        if (l < 0.05) c.to = null;
        else {
          const st = Math.min(l, speed * dt);
          c.pos.x += (dx / l) * st; c.pos.z += (dz / l) * st;
          const side = Math.atan2(dx, dz) - Math.PI / 2; // (facing across the way it's going)
          c.heading += Math.atan2(Math.sin(side - c.heading), Math.cos(side - c.heading)) * (1 - Math.exp(-dt * 6));
          c.bob += dt * 10;
        }
      }
    }
    // First crab of the day.
    if (!this.spotted && canAct && this.crabs.some((c) => c.state === 'potter' && flat(P.pos, c.pos) < 3)) {
      this.spotted = true;
      progress.award(2, 'Crab!');
      B.hud.float(CRABS.spotted, B.actions.anchor(), 'xp');
    }
    this.pose();
  }

  pose() {
    const r = this.rig;
    for (const c of this.crabs) {
      r.position.set(c.pos.x, c.y + Math.abs(Math.sin(c.bob)) * 0.006, c.pos.z);
      r.rotation.set(0, c.heading, Math.sin(c.bob) * 0.06);
      r.scale.setScalar(c.s);
      const lift = c.wave * (0.5 + Math.sin(c.bob * 5) * 0.25);
      this.R.rotation.set(-lift, 0, -lift * 0.6);
      this.L.rotation.set(-lift, 0, lift * 0.6);
      r.updateMatrixWorld(true);
      this.bodyMesh.setMatrixAt(c.i, r.matrixWorld);
      this.clawR.setMatrixAt(c.i, this.R.matrixWorld);
      this.clawL.setMatrixAt(c.i, this.L.matrixWorld);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = this.clawR.instanceMatrix.needsUpdate = this.clawL.instanceMatrix.needsUpdate = true;
  }

  /** Nipper (for a story to find): where he is. */
  get nipper() { return this.crabs[0]?.pos ?? null; }
}
