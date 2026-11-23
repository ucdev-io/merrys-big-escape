import * as THREE from 'three';
import { blobGeometry, mesh } from '../../world/props.js';
import { ITEMS } from '../../entities/items.js';
import { sfx } from '../../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z); // distance on the ground, ignoring jumps

/**
 * The garden's buried treasures (and the escape tunnel): hidden mounds that sniffing reveals,
 * dig progress, and "reach" treasures hanging somewhere high (the sock on the washing line).
 */
export class DigSpots {
  constructor(scene, defs, found, actions) {
    this.scene = scene;
    this.actions = actions;
    this.list = defs.map((d) => this.make(d));
    for (const s of this.list) if (found.includes(s.key)) this.finish(s);
  }

  make(d) {
    const g = new THREE.Group();
    g.position.copy(d.pos);
    this.scene.add(g);
    const mound = mesh(blobGeometry(5, 0.25, 2), 0x9a7356, g, [0, 0, 0], [0, Math.random() * 3, 0], [0.38, 0.1, 0.32]);
    mound.castShadow = false;
    const hole = mesh(new THREE.CircleGeometry(0.3, 20), 0x4a3426, g, [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
    hole.castShadow = false;
    const pile = mesh(blobGeometry(9, 0.3, 2), 0x8a6346, g, [0.45, 0, 0.1], [0, 0, 0], [0.3, 0.14, 0.25]);
    g.visible = false;
    mound.scale.multiplyScalar(0.001);
    let hang = null;
    if (d.reach) {
      // Pegged up high and swaying. Visible from the start — the trick is getting up there.
      hang = ITEMS[d.key].build();
      hang.position.set(d.pos.x, 1.38, d.pos.z);
      hang.rotation.z = Math.PI;
      hang.scale.setScalar(1.3);
      this.scene.add(hang);
      mound.visible = hole.visible = pile.visible = false;
    }
    return { ...d, group: g, mound, hole, pile, hang, revealed: !!d.reach, reveal: 0, progress: 0, done: false };
  }

  finish(s) {
    s.done = true;
    if (s.reach) { if (s.hang) s.hang.visible = false; return; }
    s.revealed = true;
    s.reveal = 1;
    s.group.visible = true;
    s.hole.visible = true;
    s.hole.scale.setScalar(s.key === 'tunnel' ? 1.3 : 1);
    s.mound.visible = false;
    s.pile.visible = true;
  }

  get(key) { return this.list.find((s) => s.key === key); }

  /** Not yet dug; the tunnel only counts once every treasure is found. */
  active(treasuresFound, treasureCount) {
    return this.list.filter((s) => !s.done && (s.key === 'tunnel' ? treasuresFound >= treasureCount : true));
  }

  /** Sniffed out (or dug right into): the mound shows. True if it's the tunnel. */
  reveal(s) {
    if (s.revealed) return false;
    s.revealed = true;
    s.group.visible = true;
    sfx.pop();
    this.actions.hud.float('!', s.pos.clone().add(V(0, 0.6, 0)), 'dig');
    return s.key === 'tunnel';
  }

  /**
   * @returns {{ nearest, near, reached, prompt, revealedTunnel }}
   *   nearest: closest active spot (for the scent trail) · near: diggable spot under the dog
   *   reached: a "reach" treasure the dog just got to · prompt: e.g. "Too high!"
   */
  update(dt, active, pos, sniffing, time) {
    let nearest = null, nd = Infinity, reached = null, prompt = null, revealedTunnel = false;
    for (const s of active) {
      const d = hd(s.pos, pos);
      if (d < nd) { nd = d; nearest = s; }
      if (s.reach) {
        s.hang.rotation.x = Math.sin(time * 1.7) * 0.12;
        if (Math.random() < dt * 2) this.actions.smellPuff(V(s.pos.x, 1.1, s.pos.z), 0x9ab86a);
        if (d < 0.8 && pos.y >= s.reach - 0.01) reached = s;
        else if (d < 1.3 && pos.y < s.reach) prompt = 'Too high! Find something to jump up on 📦';
        continue;
      }
      if (!s.revealed && sniffing && d < 5 && this.reveal(s)) revealedTunnel = true;
      if (s.revealed) {
        s.reveal = Math.min(1, s.reveal + dt * 2);
        const k = Math.max(0.001, s.reveal) * (1 + (s.progress / s.need) * 0.4);
        s.mound.scale.set(0.38 * k, 0.1 * k, 0.32 * k);
        s.pile.scale.set(0.3, 0.14, 0.25).multiplyScalar(Math.max(0.001, s.progress / s.need));
        s.pile.visible = s.progress > 0;
        s.hole.visible = s.progress > 0;
        s.hole.scale.setScalar(Math.max(0.01, (s.progress / s.need) * (s.key === 'tunnel' ? 1.3 : 0.9)));
        if (Math.random() < dt * 2.2) this.actions.smellPuff(s.pos, 0xd9b98a);
      } else if (d < 6 && Math.random() < dt * 0.8) {
        this.actions.smellPuff(s.pos, 0xd9b98a);
      }
    }
    // (Forgiving: half a step off still digs it, and digging right on a spot that hasn't been sniffed out yet finds it anyway.)
    const near = active.find((s) => !s.reach && hd(s.pos, pos) < (s.revealed ? 1.5 : 1.2) && pos.y < 0.3) ?? null;
    return { nearest, near, reached, prompt, revealedTunnel };
  }
}
