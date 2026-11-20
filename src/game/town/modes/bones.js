import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { sfx } from '../../../core/audio.js';
import { buzz } from '../../../core/haptics.js';
import { TOWN } from '../../../world/town/generator.js';
import { freeSpot } from '../../../world/spots.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { CHALLENGES } from '../../challenges.js';
import { scoreLine, scoreResults } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let GEO = null;

/** A plain old dog bone (shared shapes). */
function boneMesh() {
  GEO ??= { shaft: new THREE.CapsuleGeometry(0.035, 0.2, 4, 10), knob: new THREE.SphereGeometry(0.048, 12, 8), mat: paint(0xf6eedc, { emissive: 0x3a3226 }) };
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(GEO.shaft, GEO.mat);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  for (const x of [-1, 1]) for (const z of [-1, 1]) { const k = new THREE.Mesh(GEO.knob, GEO.mat); k.position.set(x * 0.13, 0, z * 0.035); g.add(k); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 🦴 Bone Rush: bones all over town; the first dog to each one gets it. Most bones wins. */
export class Bones {
  constructor(ctx, g) { Object.assign(this, { ctx, g }); }
  get title() { return 'Bone Rush'; }

  begin() {
    const { world, layout, scene } = this.ctx, g = this.g;
    const rng = new RNG(`bones:${g.seed}`); // the same bones in the same places for everyone
    const blocks = layout.blocks.filter((b) => b.type !== 'home');
    this.scores = { ...(g.scores ?? {}) };
    this.list = Array.from({ length: CHALLENGES.bones.count }, (_, i) => {
      const b = rng.pick(blocks);
      const at = freeSpot(world, rng, b.x, b.z, 3, TOWN.BLOCK / 2 + 4) ?? { x: b.x, z: b.z };
      const m = boneMesh();
      m.position.set(at.x, 0.3, at.z);
      m.rotation.y = rng.float(0, 6);
      const got = g.got?.[i] !== undefined; // (already gone, if we've just joined in)
      m.visible = !got;
      scene.add(m);
      return { i, m, x: at.x, z: at.z, got };
    });
  }

  update(dt, live) {
    const { player, hud } = this.ctx, P = player.pos, t = performance.now() / 1000;
    let near = null, nd = Infinity;
    for (const b of this.list) {
      if (b.got) continue;
      b.m.rotation.y += dt * 1.6;
      b.m.position.y = 0.3 + Math.sin(t * 3 + b.i) * 0.06;
      const d = Math.hypot(P.x - b.x, P.z - b.z);
      if (live && d < 0.9 && P.y < 1.5) { // chomp!
        b.got = true;
        b.m.visible = false;
        sfx.chomp?.(); buzz(15);
        this.ctx.send({ a: 'grab', i: b.i });
        hud.float('+1 🦴', this.ctx.anchor());
        continue;
      }
      if (d < nd) { nd = d; near = b; }
    }
    if (near && Math.random() < dt * 2) this.ctx.glow()?.spawn({ pos: near.m.position.clone(), vel: V(0, 0.4, 0), life: 0.7, size: 0.03, color: 0xfff3c4 });
    return { compass: near ? { pos: near.m.position, emoji: '🦴' } : null, banner: scoreLine(this.ctx, this.g, this.scores, '🦴') };
  }

  handle(m) {
    if (m.a !== 'got') return;
    this.scores = m.scores;
    const b = this.list[m.i];
    if (b && !b.got) { b.got = true; b.m.visible = false; } // someone else got there first
  }

  results(game) {
    const r = scoreResults(this.ctx, this.g, game.scores ?? {}, 'bones', 'Not a single bone! They must have been very well hidden.');
    const left = this.list.filter((b) => !b.got).length;
    return { html: `<h1>🦴 Bone Rush</h1>${r.html}${left ? '' : '<p>Every last bone found!</p>'}`, xp: Math.min(40, r.mine * 2) + (r.won ? 20 : 0), won: r.won };
  }

  cleanup() { for (const b of this.list ?? []) b.m.removeFromParent(); }
}
