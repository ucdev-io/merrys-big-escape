import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);

/** Golden bones on high spots around town (some need a friend's back to reach). */
export class GoldenBones {
  constructor(scene, defs, collected) {
    const gold = paint(0xf2c14e, { emissive: 0x6a4a10 });
    const pink = paint(0xf2a0b4, { emissive: 0x5a2030 });
    this.list = defs.map((b) => {
      const g = new THREE.Group();
      const add = (geom, pos, rot, mat = gold) => { const m = new THREE.Mesh(geom, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); g.add(m); };
      add(new THREE.CapsuleGeometry(0.04, 0.2, 4, 10), [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const x of [-1, 1]) for (const z of [-1, 1]) add(new THREE.SphereGeometry(0.05, 12, 8), [x * 0.14, 0, z * 0.04]);
      if (b.friend) add(new THREE.TorusGeometry(0.22, 0.015, 6, 28), [0, 0, 0], [Math.PI / 2, 0, 0], pink); // "you'll need a friend"
      g.position.set(b.x, b.y, b.z);
      scene.add(g);
      const got = collected.includes(b.id);
      g.visible = !got;
      return { ...b, mesh: g, got };
    });
  }

  get count() { return this.list.length; }

  hide(id) { const b = this.list.find((q) => q.id === id); if (b) { b.got = true; b.mesh.visible = false; } }

  /**
   * Spin and sparkle; detect the dog reaching one.
   * @returns {{ reached: string|null, hint: string|null }}
   */
  update(dt, time, pos, glow, { onFriend = false } = {}) {
    let reached = null, hint = null;
    for (const b of this.list) {
      if (b.got) continue;
      b.mesh.rotation.y += dt * 2;
      b.mesh.position.y = b.y + Math.sin(time * 2.5 + b.x) * 0.05;
      if (Math.random() < dt * 1.5) glow.spawn({ pos: b.mesh.position.clone(), vel: V(rand(-0.2, 0.2), rand(0.3, 0.6), rand(-0.2, 0.2)), life: 0.9, size: 0.03, color: 0xf6d06a });
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      // Pink-ringed bones are team bones: only a dog boosted up by a friend can grab one, however high it jumps.
      const ok = pos.y >= b.need && (!b.friend || onFriend);
      if (d < 0.6 && ok) { reached = b.id; this.hide(b.id); continue; }
      if (d < 1.4 && !ok) hint = b.friend ? 'A team bone! Stand on a friend’s back to grab it 🐾🐾' : 'Too high! Find a way up 🦘';
    }
    return { reached, hint };
  }
}
