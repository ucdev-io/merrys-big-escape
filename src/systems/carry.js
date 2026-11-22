import * as THREE from 'three';
import { CARRYABLES } from '../entities/carryables.js';
import { paint } from '../render/watercolorMaterial.js';
import { sfx } from '../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let nextId = 1;

/**
 * Things lying about (or buried) that a dog can pick up, carry and drop: lost toys, Gus's slipper…
 * One thing at a time, in the mouth. 🐾 / E near something grabs it, again drops it — and a bark
 * drops it too (it's hard to woof with your mouth full).
 */
export class Carry {
  constructor(scene, player, glow) {
    Object.assign(this, { scene, player, glow });
    this.items = [];  // on the ground (or buried)
    this.held = null;
    this.moundMat = paint(0x7a5a3e);
    this.twinkle = 0;
    this.onChange = null; // (kind | null) → tell friends what's in my mouth
    this.onGrab = null;   // (item) picked up / put down: a trip shares some things with friends (trips/kit.js)
    this.onDrop = null;
  }

  /** Put something in the world. buried: how many digs before it pops up. job: what it's for. */
  add(kind, x, z, { buried = 0, job = null } = {}) {
    const def = CARRYABLES[kind];
    const obj = def.build();
    obj.position.set(x, 0.02, z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(obj);
    const item = { id: nextId++, kind, def, obj, pos: obj.position, buried, job, hop: 0 };
    if (buried) {
      obj.visible = false;
      item.mound = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), this.moundMat);
      item.mound.scale.set(1, 0.22, 1);
      item.mound.position.set(x, 0.02, z);
      item.mound.receiveShadow = true;
      this.scene.add(item.mound);
    }
    this.items.push(item);
    return item;
  }

  /** Take something out of the world altogether (it's been delivered, or its job is over). */
  remove(item) {
    if (!item) return;
    if (this.held === item) { this.held = null; this.player.dog.hold(null); this.onChange?.(null); }
    this.items = this.items.filter((q) => q !== item);
    item.obj.removeFromParent();
    item.mound?.removeFromParent();
  }

  /** The closest thing within reach of the nose. */
  nearby(nose, r = 0.8) {
    let best = null, bd = Infinity;
    for (const it of this.items) {
      const reach = (it.buried ? r + 0.3 : r) + (it.def.reach ?? 0); // (long things can be grabbed from further off)
      const d = Math.hypot(it.pos.x - nose.x, it.pos.z - nose.z);
      if (d < reach && d < bd && Math.abs(it.pos.y - this.player.pos.y) < (it.floats ? 1.1 : 0.7)) { bd = d; best = it; } // (floating on a pond: big dogs swim low)
    }
    return best;
  }

  /** 🐾 pressed: drop, grab or dig something up. Returns 'drop' | 'grab' | 'dig' | 'tug' | null (nothing here). */
  press(nose) {
    if (this.held) {
      if (this.held.onPress?.()) return 'tug'; // (e.g. one end of a string of sausages in a tug of war: 🐾 pulls)
      this.drop(nose);
      return 'drop';
    }
    const it = this.nearby(nose);
    if (!it) return null;
    if (it.buried > 0) {
      it.buried--;
      it.mound.scale.y = 0.22 * (0.4 + 0.6 * (it.buried / 3));
      if (it.buried === 0) this.unearth(it);
      return 'dig';
    }
    this.grab(it);
    return 'grab';
  }

  grab(it) {
    this.items = this.items.filter((q) => q !== it);
    this.held = it;
    this.player.dog.hold(it.obj, it.def.hold);
    sfx.pop?.();
    this.onChange?.(it.kind);
    this.onGrab?.(it);
  }

  drop(nose = this.player.pos) {
    const it = this.held;
    if (!it) return;
    this.held = null;
    this.player.dog.hold(null);
    it.obj.scale.setScalar(1);
    it.obj.position.set(nose.x, this.player.pos.y + 0.02, nose.z);
    it.obj.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.scene.add(it.obj);
    this.items.push(it);
    sfx.boink?.();
    this.onChange?.(null);
    this.onDrop?.(it);
  }

  /** Handed over (to Gus, a neighbour…): it's gone from the mouth and the world. */
  consume() {
    const it = this.held;
    if (!it) return null;
    this.held = null;
    this.player.dog.hold(null);
    it.obj.removeFromParent();
    this.onChange?.(null);
    return it;
  }

  unearth(it) {
    it.mound.removeFromParent();
    it.mound = null;
    it.obj.visible = true;
    it.hop = 1;
    sfx.found?.();
  }

  /** What 🐾 would do right now, for the prompt and the button label: { act, text } or null. */
  hint(nose) {
    if (this.held) return { act: this.held.pulls?.() ? 'pull' : 'drop', text: `Carrying the ${this.held.def.name} ${this.held.def.emoji} · 🐾 drops it` };
    const it = this.nearby(nose);
    if (!it) return null;
    if (it.buried) return { act: 'dig', text: it.def.digText ?? 'Something’s buried here! Dig dig dig! 🐾' };
    return { act: 'grab', text: `${it.def.emoji} Grab the ${it.def.name}!` };
  }

  update(dt) {
    this.twinkle -= dt;
    const sparkle = this.twinkle <= 0;
    if (sparkle) this.twinkle = 0.45;
    for (const it of this.items) {
      if (it.hop > 0) { // popping out of the ground
        it.hop = Math.max(0, it.hop - dt * 2.2);
        it.pos.y = 0.02 + Math.sin((1 - it.hop) * Math.PI) * 0.45;
      }
      // Things somebody's looking for twinkle, so they're easy to spot.
      if (sparkle && it.job && !it.buried) {
        this.glow.burst(1, () => ({
          pos: it.pos.clone().add(V(Math.random() * 0.3 - 0.15, 0.15, Math.random() * 0.3 - 0.15)), vel: V(0, 0.5, 0),
          life: 0.9, size: 0.035, gravity: -0.2, drag: 1, color: 0xfff2a8,
        }));
      }
    }
  }
}
