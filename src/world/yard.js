import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { PALETTE } from '../render/palette.js';
import { RNG, fbm3 } from '../core/rng.js';
import { Colliders } from './collision.js';
import {
  tree, bush, picketFence, house, shed, gnome, paddlingPool, washingLine,
  flowerBed, steppingStones, grassTufts, skyDome,
} from './props.js';

export const YARD = { x0: -10, x1: 10, z0: -8.5, z1: 8 };

function inYard(x, z, pad = 0) {
  return x > YARD.x0 - pad && x < YARD.x1 + pad && z > YARD.z0 - pad && z < YARD.z1 + pad;
}

function ground(rng) {
  const size = 140, seg = 160;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cA = new THREE.Color(PALETTE.grass), cB = new THREE.Color(PALETTE.grassDark), cC = new THREE.Color(PALETTE.grassLight);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // Distance outside the yard → rolling hills.
    const dx = Math.max(YARD.x0 - 3 - x, 0, x - YARD.x1 - 3), dz = Math.max(YARD.z0 - 6 - z, 0, z - YARD.z1 - 3);
    const out = Math.hypot(dx, dz);
    const hill = (fbm3(x * 0.04, 0, z * 0.04, 4) - 0.35) * 6 * Math.min(1, out / 15);
    p.setY(i, Math.max(hill, 0) + (inYard(x, z) ? 0 : fbm3(x * 0.3, 1, z * 0.3, 2) * 0.12));
    const n = fbm3(x * 0.15, 5, z * 0.15, 3);
    c.copy(cA).lerp(n > 0.5 ? cC : cB, Math.abs(n - 0.5) * 1.6);
    if (inYard(x, z)) {
      // Mown lawn stripes.
      const stripe = Math.floor((x + 100) / 1.6) % 2;
      c.lerp(cC, stripe ? 0.22 : 0.0);
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, paint(0xffffff, { vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

export function buildYard(seed = 'biscuit-yard') {
  const rng = new RNG(seed);
  const group = new THREE.Group();
  const col = new Colliders();
  const animated = [];

  group.add(skyDome());
  group.add(ground(rng));

  // The family home along the back of the yard.
  group.add(house(0, -11.6, 0, rng, col, { w: 12, d: 6, h: 3.4 }));

  // Fences: front + sides (house closes the back).
  group.add(picketFence(YARD.x0, YARD.z1, YARD.x1, YARD.z1, col));
  group.add(picketFence(YARD.x0, YARD.z0, YARD.x0, YARD.z1, col));
  group.add(picketFence(YARD.x1, YARD.z0, YARD.x1, YARD.z1, col));

  // Garden features.
  group.add(tree(-6.5, 4.6, 1.35, rng, col));
  group.add(tree(7.6, -5.2, 1.0, rng, col));
  group.add(shed(7.6, 5.3, -Math.PI / 2, col));
  group.add(flowerBed(-5, -7.4, 5, 1.3, rng, col));
  group.add(flowerBed(4.6, -7.4, 4.2, 1.3, rng, col));
  group.add(flowerBed(-9.2, -0.5, 1.2, 4.5, rng, col));
  group.add(paddlingPool(3, 2.2, col));
  const g = gnome(-2.8, 6.6, Math.PI + 0.3);
  group.add(g);
  col.circle(-2.8, 6.6, 0.25);
  const line = washingLine(-7.4, -2.6, -2.4, -4.6, rng);
  group.add(line);
  col.circle(-7.4, -2.6, 0.12);
  col.circle(-2.4, -4.6, 0.12);
  line.traverse((m) => { if (m.userData.sway !== undefined) animated.push((t) => { m.rotation.x = Math.sin(t * 1.6 + m.userData.sway) * 0.12; }); });
  group.add(steppingStones([[0.3, -7.6], [-0.2, -6.7], [0.4, -5.8], [0.0, -4.9], [0.6, -4.0], [1.3, -3.3]], rng));
  for (const [x, z, s] of [[-9, 7, 1.1], [9, -7.4, 0.9], [5.5, 7.2, 1.0], [-8.8, -7.2, 0.9], [-4.4, 7.3, 0.8]]) group.add(bush(x, z, s, rng, col));

  // Beyond the fence: neighbours, trees and hills, softened by fog.
  group.add(house(-19, 6, Math.PI / 2, rng, null, { w: 8, d: 6, wall: 0xe9d3c0, roof: 0x7d8fa8 }));
  group.add(house(19, 2, -Math.PI / 2, rng, null, { w: 7, d: 6, wall: 0xdfe3cf, roof: 0xb87a5e }));
  group.add(house(4, 20, Math.PI, rng, null, { w: 9, d: 6, wall: 0xf1e1c7, roof: 0x8a9a6e }));
  for (let i = 0; i < 40; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(16, 45);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inYard(x, z, 5) || Math.abs(x + 19) < 6 && Math.abs(z - 6) < 6 || Math.abs(x - 19) < 6 && Math.abs(z - 2) < 6 || Math.abs(x - 4) < 7 && Math.abs(z - 20) < 6) continue;
    group.add(tree(x, z, rng.float(0.9, 1.6), rng, null));
  }

  group.add(grassTufts(6000, [YARD.x0, YARD.z0, YARD.x1, YARD.z1], rng, (x, z) => {
    if (Math.hypot(x - 3, z - 2.2) < 1.3) return false;
    if (z < -6.6) return false;
    if (x < -8.4 && z > -3 && z < 2) return false;
    return true;
  }));
  group.add(grassTufts(4000, [-40, -40, 40, 40], rng, (x, z) => !inYard(x, z, 0.5) && z > -9));

  return {
    group,
    colliders: col,
    occluders: (() => { const o = group.children.filter((c) => c.userData.occluder); group.traverse((m) => m.userData.solid && o.push(m)); return o; })(),
    foliage: (() => { const f = []; group.traverse((o) => o.userData.foliage && f.push(o)); return f; })(),
    spawn: new THREE.Vector3(0.5, 0, -1),
    bounds: { x0: YARD.x0 + 0.3, x1: YARD.x1 - 0.3, z0: YARD.z0 + 0.3, z1: YARD.z1 - 0.3 },
    update(t) { for (const f of animated) f(t); },
  };
}
