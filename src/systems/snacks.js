import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { RNG } from '../core/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** What's inside a knocked-over bin, and what it does to a dog who gobbles it up. */
export const SNACKS = {
  pizza: { emoji: '🍕', name: 'Pizza crust', power: ['speed'], blurb: 'Super speed! (And zoomies that never run out.)', secs: 15 },
  cheese: { emoji: '🧀', name: 'Stinky cheese', power: ['jump'], blurb: 'Super jumps! Double-tap to fly over fences and hedges.', secs: 20 },
  donut: { emoji: '🍩', name: 'Old doughnut', power: ['zoomies'], blurb: 'Sugar rush! Endless zoomies.', secs: 15 },
  sausage: { emoji: '🌭', name: 'Half a sausage', power: ['speed', 'jump', 'zoomies'], blurb: 'SUPER DOG! Everything at once!', secs: 12 },
  icecream: { emoji: '🍦', name: 'Doggy ice cream', power: ['speed', 'zoomies'], blurb: 'Brain freeze! Super speed and endless zoomies!', secs: 15 }, // from the van
};
const KINDS = ['pizza', 'cheese', 'donut', 'pizza', 'cheese', 'donut', 'cheese', 'sausage']; // sausages are rare

function snackModel(kind) {
  const g = new THREE.Group();
  const add = (geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, paint(color));
    m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (kind === 'pizza') {
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 12, 1, false, -0.4, 0.8), 0xf2c96a, [0, 0, -0.1]);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12, 1, true, -0.4, 0.8), 0xd9984a, [0, 0, -0.1], [0, 0, 0], [1.02, 1, 1.02]); // crust
    for (const [x, z] of [[0, 0.02], [0.03, 0.06], [-0.025, -0.02]]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), 0xc94a3a, [x, 0.022, z]);
  } else if (kind === 'cheese') {
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 3, 1, false, 0, 1.1), 0xf3cd52, [0, 0, -0.06]);
    for (const [x, y, z] of [[0.02, 0.02, 0.0], [0.05, -0.01, -0.03]]) add(new THREE.SphereGeometry(0.014, 8, 6), 0xd6a93a, [x, y, z]);
  } else if (kind === 'donut') {
    add(new THREE.TorusGeometry(0.075, 0.038, 10, 20), 0xd9a066, [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.075, 0.03, 8, 20), 0xf2a0b4, [0, 0.018, 0], [Math.PI / 2, 0, 0], [1, 1, 0.7]); // icing
    for (let i = 0; i < 6; i++) add(new THREE.SphereGeometry(0.008, 6, 4), [0xffffff, 0x6fb1d9, 0xf6d06a][i % 3], [Math.cos(i) * 0.075, 0.042, Math.sin(i) * 0.075]);
  } else if (kind === 'icecream') {
    add(new THREE.ConeGeometry(0.05, 0.14, 12), 0xd9a066, [0, 0.0, 0], [Math.PI, 0, 0]);
    add(new THREE.SphereGeometry(0.06, 12, 10), 0xfbf3e2, [0, 0.09, 0]);
    add(new THREE.SphereGeometry(0.014, 6, 4), 0xd9534f, [0, 0.15, 0]);
  } else {
    add(new THREE.CapsuleGeometry(0.035, 0.15, 6, 12), 0xb5562f, [0, 0, 0], [0, 0, Math.PI / 2]);
    add(new THREE.SphereGeometry(0.012, 6, 4), 0xf6d06a, [0.05, 0.03, 0]); // a dab of mustard
  }
  return g;
}

/**
 * Snacks spilled from knocked-over bins: walk over one to gobble it for a power-up.
 * Every dog in a pack gets the same snacks from the same bin (they're picked from the bin's id).
 */
export class Snacks {
  /** bounds: { x0, x1, z0, z1 } — snacks always land somewhere a dog can get to. */
  constructor(scene, seed = '', bounds = null) {
    this.scene = scene;
    this.seed = seed;
    this.bounds = bounds;
    this.items = [];
    this.time = 0;
  }

  /** A bin went over (`dir`: the way it fell). A snack, sometimes two, rolls out with the rubbish. */
  spill(bin, dir) {
    const rng = new RNG(`${this.seed}:${bin.id}`);
    const n = rng.chance(0.35) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const kind = rng.pick(KINDS);
      const d = 0.95 + i * 0.6 + rng.float(0, 0.35), side = rng.float(-0.45, 0.45);
      const pos = V(bin.x + dir.x * d - dir.z * side, 0, bin.z + dir.z * d + dir.x * side);
      if (this.bounds) {
        const b = this.bounds;
        pos.x = Math.min(b.x1 - 0.3, Math.max(b.x0 + 0.3, pos.x));
        pos.z = Math.min(b.z1 - 0.3, Math.max(b.z0 + 0.3, pos.z));
      }
      const g = snackModel(kind);
      g.position.copy(pos);
      g.scale.setScalar(0.01); // pops out of the bin
      this.scene.add(g);
      this.items.push({ kind, g, pos, phase: rng.float(0, 6), age: 0 });
    }
  }

  /** A snack handed out somewhere (the ice-cream van). */
  drop(kind, x, z) {
    const g = snackModel(kind);
    const pos = V(x, 0, z);
    g.position.copy(pos);
    g.scale.setScalar(0.01);
    this.scene.add(g);
    this.items.push({ kind, g, pos, phase: Math.random() * 6, age: 0 });
  }

  /**
   * Bob and twirl; a dog walking over one eats it.
   * @returns the kind eaten this frame (or null), plus where — for sparkles.
   */
  update(dt, dog, canEat) {
    this.time += dt;
    let eaten = null;
    this.items = this.items.filter((s) => {
      s.age += dt;
      const pop = Math.min(1, s.age / 0.35);
      s.g.scale.setScalar(0.01 + pop * (1.3 - 0.3 * pop)); // little overshoot
      s.g.position.y = 0.12 + Math.sin(this.time * 3 + s.phase) * 0.035 + (1 - pop) * 0.3;
      s.g.rotation.y += dt * 1.6;
      if (canEat && !eaten && s.age > 0.5 && Math.hypot(dog.pos.x - s.pos.x, dog.pos.z - s.pos.z) < 0.6 && Math.abs(dog.pos.y - s.pos.y) < 0.7) {
        this.scene.remove(s.g);
        eaten = { kind: s.kind, at: s.pos.clone().setY(0.2) };
        return false;
      }
      return true;
    });
    return eaten;
  }

  /** Shiny dots above each snack so they're easy to spot. */
  forEachSparkle(fn) { for (const s of this.items) fn(s.g.position); }
}
