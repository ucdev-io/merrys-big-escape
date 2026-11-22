import * as THREE from 'three';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { bakedMesh } from '../../../entities/shapes.js';
import { pals } from '../pals.js';
import { Game } from './base.js';
import { V, flat, lookAt, inRect } from './common.js';

const DIGS = 4;      // digs to make a hole big enough for a Staffy
const REACH = 1.5;   // dig this close to the loose soil
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WOOD = 0xa9825a, WOOD2 = 0x8f6b47;

/** A closed wooden garden gate, `w` wide, facing along `face` (the way out to the street): low and gappy, so Tank peeps over. */
function gateMesh(at, face, w = 2.1) {
  const parts = [];
  for (const y of [0.22, 0.56]) parts.push([BOX, WOOD2, [0, y, 0], [0, 0, 0], [w, 0.07, 0.06]]);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.12 + (i * (w - 0.24)) / (n - 1);
    parts.push([BOX, i % 2 ? WOOD : 0xb59066, [x, 0.36, 0.04], [0, 0, 0], [0.1, 0.7, 0.04]]);
    parts.push([BOX, i % 2 ? WOOD : 0xb59066, [x, 0.71, 0.04], [0, 0, Math.PI / 4], [0.07, 0.07, 0.04]]); // (pointy tops)
  }
  parts.push([BOX, WOOD2, [0, 0.39, 0.06], [0, 0, Math.atan2(0.3, w - 0.24)], [Math.hypot(w - 0.24, 0.3), 0.06, 0.03]]); // the brace
  return bakedMesh(parts, null, [at.x, 0, at.z], [0, face, 0]);
}

/**
 * 🕳️ Dig Tank out (Tank, in somebody's garden): his gate's shut and his legs aren't made for jumping. There's
 * loose soil just outside it: dig, dig, dig (he digs his side too), and he squeezes out under the gate.
 */
class Dig extends Game {
  start() {
    this.n = 0;
    this.phase = 'dig';
    this.say('ask', {}, 4.5);
    this.remindT = 9;
    this.insideSaid = false;
  }

  get h() { return this.e.home; }

  update(dt, P) {
    const e = this.e, td = this.td, h = this.h;
    this.t += dt;
    this.pose = { happy: 1 };
    if (this.phase === 'dig') {
      const inside = h.gate.clone().addScaledVector(h.out, -0.55);
      td.move(e, inside.x, inside.z, 1.6, dt, { stop: 0.25 });
      if (flat(e.pos, inside) < 0.4) lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
      this.pose = { happy: 1, dig: this.digT > 0 };
      this.digT = (this.digT ?? 0) - dt;
      this.remindT -= dt;
      if (inRect(h.garden?.rect, P.pos.x, P.pos.z) && !this.insideSaid) { this.insideSaid = true; this.say('inside', {}, 4); }
      else if (this.remindT <= 0 && flat(P.pos, e.pos) < 8) { this.remindT = 12; this.say('remind', {}, 3); }
      if (this.away(dt, h.mark, 45, 25)) return 'stop';
      return;
    }
    if (this.phase === 'squeeze') {
      const k = this.t;
      const under = h.gate.clone().addScaledVector(h.out, -0.25);
      if (!this.out) { // (up beside the hole, on the side away from you, so you see him pop out)
        const side = V(h.out.z, 0, -h.out.x), s = (P.pos.x - h.mark.x) * side.x + (P.pos.z - h.mark.z) * side.z > 0 ? -1 : 1;
        this.out = h.mark.clone().addScaledVector(side, 0.95 * s).addScaledVector(h.out, 0.2);
      }
      const out = this.out;
      e.yFree = true;
      this.pose = { dig: k < 1.1, happy: 1 };
      if (k < 0.5) { td.move(e, under.x, under.z, 1.5, dt, { stop: 0.05 }); e.pos.y = 0; }
      else if (k < 1.1) { e.pos.y = -0.8 * (k - 0.5) / 0.6; if (Math.random() < dt * 10) td.actions.dirtBurst(e.pos.clone().setY(0.02), 2); }
      else if (k < 1.5) { e.hidden = true; }
      else if (k < 2.1) {
        if (e.hidden) { e.hidden = false; e.pos.set(out.x, -0.8, out.z); e.lastX = out.x; e.lastZ = out.z; e.dog.root.rotation.y = Math.atan2(h.out.x, h.out.z); td.actions.dirtBurst(out.clone().setY(0.02), 8); sfx.pop?.(); }
        e.pos.y = -0.8 * (1 - (k - 1.5) / 0.6);
      } else if (k < 3.4) {
        e.pos.y = 0;
        if (!this.shook) { this.shook = true; e.dog.shake(); this.say('free', {}, 2.6); }
        lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
      } else { e.yFree = false; return 'win'; }
    }
  }

  onDig(nose) {
    if (this.phase !== 'dig' || flat(nose, this.h.mark) > REACH) return false;
    const td = this.td, s = this.h.soil;
    this.n++;
    this.digT = 0.6;
    td.actions.dirtBurst(this.h.mark.clone().setY(0.03), 9);
    buzz(12);
    if (s) { s.scale.set(1 + this.n * 0.12, 0.22 - this.n * 0.035, 1 + this.n * 0.12); }
    if (this.n === 1) this.say('dug', {}, 2.4);
    if (this.n >= DIGS) {
      if (s) s.material = this.h.holeMat;
      this.phase = 'squeeze';
      this.t = 0;
      sfx.found?.();
    }
    return true;
  }

  target() { return this.phase === 'dig' ? { pos: this.h.mark, emoji: '🕳️' } : { pos: this.e.pos, emoji: '💪' }; }

  objective() {
    return { icon: '🕳️', title: `Dig ${this.name} out under the gate <b>${this.n}/${DIGS}</b>`, sub: 'Dig dig dig at the loose soil outside his gate 🐾' };
  }

  get hint() {
    if (this.phase !== 'dig') return null;
    return flat(this.P.pos, this.h.mark) < 2.4 ? 'Dig here! 🐾🕳️' : null;
  }
}

/** Tank's day: pacing behind his gate, peering out at the street, paws up when somebody comes by. */
function idle(td, e, dt, P, d) {
  const h = e.home;
  if (!h.gate) return false;
  const side = V(h.out.z, 0, -h.out.x); // (along the fence)
  if (d < 9) {
    const inside = h.gate.clone().addScaledVector(h.out, -0.55);
    if (td.move(e, inside.x, inside.z, 1.8, dt, { stop: 0.25 })) {
      lookAt(e.dog.root, P.pos.x, P.pos.z, dt);
      if ((e.bowT = (e.bowT ?? 0) - dt) <= 0) { e.bowT = 4 + Math.random() * 3; e.dog.emote('bow'); }
    }
    return true;
  }
  e.paceT = (e.paceT ?? 0) - dt;
  if (e.paceT <= 0) { e.paceT = 3 + Math.random() * 3; e.paceTo = h.gate.clone().addScaledVector(h.out, -0.9 - Math.random() * 1.2).addScaledVector(side, (Math.random() - 0.5) * 3); }
  if (e.paceTo && td.move(e, e.paceTo.x, e.paceTo.z, 1.1, dt, { stop: 0.2 })) lookAt(e.dog.root, h.street.x, h.street.z, dt, 3);
  return true;
}

/** His gate (shut: no way out but under it) and the loose soil outside, while he's still stuck. */
function setup(td, pal, h) {
  if (!h.gate || pals.isPal(pal.id)) return;
  const face = Math.atan2(h.out.x, h.out.z);
  td.scene.add(gateMesh(h.gate, face));
  const across = Math.abs(h.out.x) > Math.abs(h.out.z); // (gardens are square to the streets)
  const half = 1.05, th = 0.07;
  td.world.colliders.box(h.gate.x - (across ? th : half), h.gate.z - (across ? half : th), h.gate.x + (across ? th : half), h.gate.z + (across ? half : th), 0.8, false);
  const soil = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 8), paint(0x7a5a3e));
  soil.scale.set(1, 0.22, 1);
  soil.position.set(h.mark.x, 0.02, h.mark.z);
  soil.receiveShadow = true;
  td.scene.add(soil);
  h.soil = soil;
  h.holeMat = paint(0x3e2a1e);
}

export default { Game: Dig, idle, setup, askR: 4.2 };
