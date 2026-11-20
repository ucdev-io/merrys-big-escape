import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { bakedMat } from '../../entities/shapes.js';
import { buriedGeometry } from '../../entities/buriedItems.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { LineBag } from '../dialogue.js';
import { progress } from '../progress.js';
import { BURIED, CAPSULES } from '../lines/buried.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const DIGS = 3;
const KEEP = 240;                 // seconds a found spot waits to be dug before the smell's lost
const FOUND = 'merry.buried.v1';  // (which kinds this device has dug up: for "new find!")
const DIRT = [0x9a7356, 0x7a5236, 0xb08a68];
const ALL = new Set(Object.values(BURIED).flat().map((t) => t.id));

const readFound = () => { try { return new Set(JSON.parse(localStorage.getItem(FOUND) ?? '[]')); } catch { return new Set(); } };

/**
 * 🦴 Buried treasure. Lots of the smells on soft ground (gardens, the park, the woods, the farm) are
 * something buried (./smells.js decides which): sniff your way to one and your nose says so, a little
 * mound of earth shows where, and three digs (🐾) bring it up. Bones, marbles, toy soldiers, old keys,
 * a dinosaur bone… a truffle in the woods, potatoes on the farm, and once in a while a time capsule.
 * Stars, and the 'treasures' stat (the same as the garden's and the beach's). Digging up somebody's lawn
 * for it still leaves a hole, mind (and that's naughty).
 */
export class Buried {
  constructor({ scene, hud, player, actions, smells }) {
    Object.assign(this, { scene, hud, player, actions, smells });
    this.open = [];   // spots found by a nose and waiting to be dug: { spot, digs, mound, at }
    this.pops = [];
    this.bags = {};
    this.found = readFound();
    this.moundMat = paint(0x7a5a3e);
    this.mat = bakedMat();
    this.glintT = 0;
    this.hint = null;
    this.onUnearth = null; // (x, z) → the chapter (a hole in somebody's lawn?)
  }

  /** A nose has found something buried here. */
  reveal(spot) {
    if (this.open.some((o) => o.spot === spot)) return;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 7), this.moundMat);
    mound.scale.set(1, 0.2, 1);
    mound.position.set(spot.x, 0.05, spot.z);
    mound.receiveShadow = true;
    this.scene.add(mound);
    this.open.push({ spot, digs: 0, mound, at: performance.now() / 1000 });
    sfx.sniff?.(); sfx.pop?.();
    buzz(12);
    this.actions.sparkle(V(spot.x, 0.3, spot.z), 12);
    this.hud.float('🐾 Something’s buried here! Dig!', this.actions.anchor().add(V(0, 0.3, 0)), 'xp');
  }

  nearest(nose, r = 1.1) {
    let best = null, bd = r;
    for (const o of this.open) { const d = Math.hypot(o.spot.x - nose.x, o.spot.z - nose.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  /** 🐾 by a found spot: dig! (true if it was ours to dig) */
  onDig(nose) {
    const o = this.nearest(nose);
    if (!o) return false;
    const at = V(o.spot.x, 0.05, o.spot.z);
    o.digs++;
    this.player.digTimer = 0.35;
    this.actions.dirt.burst(9, () => ({
      pos: at.clone().add(V(rand(-0.1, 0.1), 0.03, rand(-0.1, 0.1))), vel: V(rand(-1.4, 1.4), rand(1.6, 3), rand(-1.4, 1.4)),
      life: rand(0.6, 1), size: rand(0.02, 0.04), gravity: 9, floor: 0.02, color: DIRT[Math.floor(Math.random() * 3)],
    }));
    o.mound.scale.set(1 + o.digs * 0.15, 0.2 + o.digs * 0.06, 1 + o.digs * 0.15); // (a heap of earth as you dig)
    if (o.digs >= DIGS) this.unearth(o);
    return true;
  }

  /** What turns up, from what's buried round here (rarer things less often). */
  roll(region) {
    const list = BURIED[region] ?? BURIED.town, total = list.reduce((s, t) => s + t.w, 0);
    let r = Math.random() * total;
    for (const t of list) { r -= t.w; if (r <= 0) return t; }
    return list[0];
  }

  unearth(o) {
    this.close(o);
    const s = o.spot, t = this.roll(s.buried), at = V(s.x, 0.05, s.z);
    const obj = new THREE.Mesh(buriedGeometry(t.model ?? t.id), this.mat);
    obj.castShadow = true;
    obj.position.copy(at);
    obj.scale.setScalar(1.6);
    this.scene.add(obj);
    this.pops.push({ obj, t: 0 });
    sfx.found?.(); buzz([15, 25, 15]);
    this.actions.sparkle(at.clone().add(V(0, 0.3, 0)), 16);
    progress.stat('treasures');
    progress.award(t.xp, t.name);
    const line = (this.bags[t.id] ??= new LineBag(t.lines)).next();
    this.hud.say(`${t.emoji} ${line}`, () => this.actions.anchor().add(V(0, 0.3, 0)), 3.2);
    const first = !this.found.has(t.id);
    if (first) {
      this.found.add(t.id);
      try { localStorage.setItem(FOUND, JSON.stringify([...this.found])); } catch { /* private mode */ }
    }
    if (t.capsule) {
      const note = (this.bags.capsule ??= new LineBag(CAPSULES)).next();
      setTimeout(() => this.hud.showToastRaw('⏳', 'A note in the time capsule!', note, { tip: true }), 900);
    } else if (first) {
      const n = [...this.found].filter((id) => ALL.has(id)).length;
      setTimeout(() => this.hud.showToastRaw(t.emoji, `New find: ${t.name}!`, `${n} of ${ALL.size} kinds of buried treasure found. Keep sniffing!`), 700);
    }
    this.smells.dugUp(s);
    this.onUnearth?.(s.x, s.z);
  }

  close(o) {
    this.open = this.open.filter((q) => q !== o);
    o.mound.removeFromParent();
    o.mound.geometry.dispose();
  }

  update(dt, nose) {
    const P = this.player.pos, now = performance.now() / 1000;
    this.hint = null;
    // Found spots wait a few minutes, then the smell's gone (and it's back to being just a smell somewhere).
    for (const o of [...this.open]) if (now - o.at > KEEP) { this.close(o); this.smells.dugUp(o.spot); }
    if (nose && this.nearest(nose, 1.6)) this.hint = '🐾 Something’s buried here: dig it up!';
    this.glintT -= dt;
    if (this.glintT <= 0) {
      this.glintT = 0.4;
      for (const o of this.open) {
        if (Math.hypot(o.spot.x - P.x, o.spot.z - P.z) > 25) continue;
        this.actions.glow.spawn({ pos: V(o.spot.x + rand(-0.12, 0.12), 0.12, o.spot.z + rand(-0.12, 0.12)), vel: V(0, 0.45, 0), life: 0.8, size: 0.04, gravity: -0.1, drag: 1, color: 0xfff2b0 });
      }
    }
    // Treasures popping up out of the ground, spinning, then off into your collection.
    for (const p of this.pops) {
      p.t += dt;
      p.obj.position.y = 0.05 + Math.sin(Math.min(1, p.t / 0.6) * Math.PI) * 0.55 + (p.t > 0.6 ? Math.min(0.5, (p.t - 0.6) * 0.4) : 0);
      p.obj.rotation.y += dt * 5;
      if (p.t > 1.6) p.obj.scale.setScalar(Math.max(0.001, 1.6 * (2.2 - p.t) / 0.6));
      if (p.t > 2.2) p.obj.removeFromParent(); // (its geometry's cached: kept for next time)
    }
    this.pops = this.pops.filter((p) => p.t <= 2.2);
  }
}
