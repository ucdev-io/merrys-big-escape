import * as THREE from 'three';
import { paint } from '../../../render/watercolorMaterial.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { LineBag } from '../../dialogue.js';
import { progress } from '../../progress.js';
import { TREASURES, BOTTLES } from '../../lines/beach.js';
import { collection } from '../../collection.js';
import { treasureGeometry, shellTipGeometry } from '../../../entities/beachItems.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const ACTIVE = 6, DIGS = 3, ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SAND = [0xe8d4a6, 0xd9c08a, 0xf0e2c0];

/**
 * 🐚 Beachcombing: things buried in the sand — a bit of shell poking out and a glint now and then shows
 * where. Dig three times (🐾) and up it pops: shells, sea glass, a starfish, a lucky stone, a rubber duck,
 * an old boot, a pirate coin, a fossil… or a message in a bottle. Stars, and the 'treasures' stat (the
 * same one as the garden's). Each player has their own (like jobs); a new one turns up somewhere else.
 */
export class Treasure {
  constructor(B) {
    this.B = B;
    this.spots = B.area.treasureSpots;
    this.tips = new THREE.InstancedMesh(shellTipGeometry(), paint(0xffffff, { vertexColors: true }), ACTIVE);
    this.tips.castShadow = false; this.tips.receiveShadow = true; this.tips.frustumCulled = false;
    B.scene.add(this.tips);
    this.active = [];
    this.waiting = 0;
    for (let i = 0; i < ACTIVE; i++) this.spawn(true);
    this.draw();
    this.glintT = 0;
    this.pops = [];
    this.bags = {};
    this.total = TREASURES.reduce((s, t) => s + t.w, 0);
  }

  /** Bury something new somewhere (not where you're standing, not next to another). */
  spawn(any = false) {
    const P = this.B.player.pos;
    for (let t = 0; t < 30; t++) {
      const [x, z] = this.spots[Math.floor(Math.random() * this.spots.length)];
      if (!any && Math.hypot(x - P.x, z - P.z) < 10) continue;
      if (this.active.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
      this.active.push({ x, z, digs: 0, ry: rand(0, 6.28) });
      return;
    }
  }

  draw() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < ACTIVE; i++) {
      const s = this.active[i];
      if (!s) { this.tips.setMatrixAt(i, ZERO); continue; }
      q.setFromEuler(e.set(0, s.ry, 0));
      const k = 1 - s.digs * 0.22; // (the heap goes down as you dig)
      this.tips.setMatrixAt(i, m.compose(V(s.x, 0.005, s.z), q, V(k, k, k)));
    }
    this.tips.instanceMatrix.needsUpdate = true;
  }

  nearest(nose, r = 1.05) {
    let best = null, bd = r;
    for (const s of this.active) { const d = Math.hypot(s.x - nose.x, s.z - nose.z); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  /** What turns up (rarer things less often). */
  roll() {
    let r = Math.random() * this.total;
    for (const t of TREASURES) { r -= t.w; if (r <= 0) return t; }
    return TREASURES[0];
  }

  /** 🐾 by a buried something: dig! (true if it was ours to dig) */
  onDig(nose) {
    const s = this.nearest(nose);
    if (!s) return false;
    const B = this.B, at = V(s.x, 0.04, s.z);
    s.digs++;
    B.player.digTimer = 0.35;
    B.actions.dirt.burst(9, () => ({
      pos: at.clone().add(V(rand(-0.1, 0.1), 0.03, rand(-0.1, 0.1))), vel: V(rand(-1.4, 1.4), rand(1.6, 3), rand(-1.4, 1.4)),
      life: rand(0.6, 1), size: rand(0.02, 0.04), gravity: 9, floor: 0.02, color: SAND[Math.floor(Math.random() * 3)],
    }));
    if (s.digs < DIGS) { this.draw(); return true; }
    // Up it comes!
    this.active = this.active.filter((q) => q !== s);
    this.draw();
    const t = this.roll(), obj = new THREE.Mesh(treasureGeometry(t.id), paint(0xffffff, { vertexColors: true }));
    obj.castShadow = true;
    obj.position.copy(at);
    obj.scale.setScalar(1.6);
    B.scene.add(obj);
    this.pops.push({ obj, t: 0 });
    sfx.found?.(); buzz([15, 25, 15]);
    B.actions.sparkle(at.clone().add(V(0, 0.3, 0)), 16);
    progress.stat('treasures');
    progress.award(t.xp, t.name);
    const line = (this.bags[t.id] ??= new LineBag(t.lines)).next();
    B.hud.say(`${t.emoji} ${line}`, () => B.actions.anchor().add(V(0, 0.3, 0)), 3.2);
    const first = collection.add('beach', t.id); // (into the 🎒 treasure box: the Sniff Book, and the shelf at home)
    if (t.id === 'bottle') { // a message!
      const msg = collection.note('bottle', BOTTLES, (this.bags.bottle ??= new LineBag(BOTTLES)));
      setTimeout(() => B.hud.showToastRaw('🍾', 'A message in a bottle!', msg, { tip: true }), 900);
    } else if (first) {
      const n = TREASURES.filter((q) => collection.has('beach', q.id)).length;
      setTimeout(() => B.hud.showToastRaw(t.emoji, `New find: ${t.name}!`, `${n} of ${TREASURES.length} kinds of beach find. They’re in your 📖 Sniff Book, and on the shelf at home!`), 700);
    }
    this.waiting += 1;
    setTimeout(() => { this.waiting--; this.spawn(); this.draw(); }, 15000 + Math.random() * 15000);
    return true;
  }

  update(dt) {
    const B = this.B, P = B.player.pos;
    // A glint now and then from things buried near you.
    this.glintT -= dt;
    if (this.glintT <= 0) {
      this.glintT = 0.5;
      for (const s of this.active) {
        if (Math.hypot(s.x - P.x, s.z - P.z) > 22 || Math.random() > 0.35) continue;
        B.actions.glow.spawn({ pos: V(s.x + rand(-0.08, 0.08), 0.08, s.z + rand(-0.08, 0.08)), vel: V(0, 0.4, 0), life: 0.8, size: 0.04, gravity: -0.1, drag: 1, color: 0xfff6c8 });
      }
    }
    // Treasures popping up out of the sand, spinning, then off into your collection.
    for (const p of this.pops) {
      p.t += dt;
      p.obj.position.y = 0.04 + Math.sin(Math.min(1, p.t / 0.6) * Math.PI) * 0.55 + (p.t > 0.6 ? Math.min(0.5, (p.t - 0.6) * 0.4) : 0);
      p.obj.rotation.y += dt * 5;
      if (p.t > 1.6) p.obj.scale.setScalar(Math.max(0.001, 1.6 * (2.2 - p.t) / 0.6));
      if (p.t > 2.2) p.obj.removeFromParent();
    }
    this.pops = this.pops.filter((p) => p.t <= 2.2);
  }

  get hint() {
    const s = this.nearest(this.B.actions.nose(), 1.5);
    return s ? (s.digs ? `🐚 Keep digging! 🐾 ${s.digs}/${DIGS}` : '🐚 Something buried! Dig! 🐾') : null; // (short: it has to fit a phone)
  }
}
