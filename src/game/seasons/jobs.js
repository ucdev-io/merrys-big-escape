import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CARRYABLES } from '../../entities/carryables.js';
import { bake, bakedMat, SPHERE } from '../../entities/shapes.js';
import { STEPS } from '../town/jobs/steps.js';
import { blocked } from '../../world/spots.js';
import { sfx } from '../../core/audio.js';
import { fsfx } from '../../core/friendSounds.js';
import { buzz } from '../../core/haptics.js';
import { RNG } from '../../core/rng.js';
import { season } from '../season.js';
import { paint } from '../../render/watercolorMaterial.js';

/*
 * The seasons' extra jobs for the 📋 board (their rows are in ../town/jobs/types.js: present, brolly):
 * the things to carry (a Christmas present, a bobble hat, mittens, an umbrella, a chocolate egg),
 * joining CARRYABLES, and a new way of finding one: 'blown' — an umbrella the wind keeps blowing away,
 * to nudge home with your nose.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RB = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, r);
const CYL = (r0, r1, h, n = 14) => new THREE.CylinderGeometry(r0, r1, h, n);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const LIFT = 0.04;

function item(parts, lift = LIFT) {
  const g = new THREE.Group(), m = new THREE.Mesh(bake(parts), bakedMat());
  m.position.y = lift;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

const PAPERS = [[0xd9534f, 0xf6d06a], [0x5b86c4, 0xf4f4f4], [0x6f9a52, 0xd9534f], [0x8e6fb0, 0xf6d06a]];
function present() {
  const [paper, ribbon] = PAPERS[Math.floor(Math.random() * PAPERS.length)];
  return item([
    [RB(0.2, 0.16, 0.18, 0.018), paper, [0, 0.08, 0]],
    [RB(0.206, 0.166, 0.03, 0.006), ribbon, [0, 0.08, 0]],
    [RB(0.03, 0.166, 0.186, 0.006), ribbon, [0, 0.08, 0]],
    [new THREE.TorusGeometry(0.032, 0.01, 6, 14), ribbon, [-0.026, 0.18, 0], [0, 0, 0.6]],
    [new THREE.TorusGeometry(0.032, 0.01, 6, 14), ribbon, [0.026, 0.18, 0], [0, 0, -0.6]],
  ]);
}

function bobble() {
  const dome = new THREE.SphereGeometry(0.075, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  return item([
    { geo: dome, color: 0x5b86c4, pos: [0, 0.03, 0], scale: [1, 1.15, 1], colors: (i, v) => (Math.floor((v.y - 0.03) / 0.022) % 2 ? 0xf4f1e8 : 0x5b86c4) },
    [new THREE.TorusGeometry(0.073, 0.016, 8, 22), 0xd9534f, [0, 0.03, 0], [Math.PI / 2, 0, 0]],
    [SPHERE, 0xf4f1e8, [0, 0.13, 0], [0, 0, 0], [0.032, 0.032, 0.032]],
  ]);
}

function mitten() {
  const one = (x, c) => [[SPHERE, c, [x, 0.022, 0], [0, 0, 0], [0.05, 0.022, 0.07]], [SPHERE, c, [x + Math.sign(x) * 0.045, 0.02, 0.02], [0, 0, 0], [0.018, 0.016, 0.03]], [RB(0.09, 0.03, 0.03, 0.01), 0xf4f1e8, [x, 0.022, -0.07]]];
  return item([...one(-0.09, 0xd9534f), ...one(0.09, 0xd9534f), [new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.09, 0.02, -0.08), V(0, 0.01, -0.16), V(0.09, 0.02, -0.08)]), 12, 0.004, 4, false), 0xf4f1e8]]);
}

function umbrella() { // (folded)
  return item([
    [CYL(0.008, 0.008, 0.42, 8), 0x3b2b25, [0, 0.02, 0], [0, 0, Math.PI / 2]],
    [new THREE.ConeGeometry(0.035, 0.3, 10), 0x5b86c4, [0.05, 0.02, 0], [0, 0, -Math.PI / 2]],
    [new THREE.TorusGeometry(0.03, 0.009, 6, 12, Math.PI), 0x3b2b25, [-0.22, 0.02, 0.03], [Math.PI / 2, 0, 0]],
  ]);
}

function chocEgg() {
  const g = new THREE.SphereGeometry(1, 14, 12), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setXYZ(i, v.x * (1 - v.y * 0.12), v.y * 1.3, v.z * (1 - v.y * 0.12)); }
  g.computeVertexNormals();
  return item([{ geo: g, color: 0xe0b04a, pos: [0, 0.07, 0], scale: [0.055, 0.055, 0.055], colors: (i, q) => (Math.abs(q.y - 0.07) < 0.012 ? 0xd9534f : 0xe0b04a) }]);
}

/** An umbrella, open, blowing about (its handle down). */
export function openUmbrella(color = 0xd9534f) {
  const parts = [[CYL(0.009, 0.009, 0.62, 8), 0x3b2b25, [0, 0.31, 0]], [new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), 0x3b2b25, [0.04, 0.0, 0], [0, 0, Math.PI]]];
  const canopy = new THREE.ConeGeometry(0.42, 0.22, 8, 1, true);
  parts.push({ geo: canopy, color, pos: [0, 0.6, 0], colors: (i, q) => (Math.floor((Math.atan2(q.z, q.x) + Math.PI) / (Math.PI / 4)) % 2 ? color : 0xf4f1e8) });
  const m = new THREE.Mesh(bake(parts), paint(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

Object.assign(CARRYABLES, {
  present: { name: 'Christmas present', emoji: '🎁', build: present, hold: { pos: [0, -0.09, 0.07], rot: [0, 0, 0] } },
  bobble: { name: 'bobble hat', emoji: '🧶', build: bobble, hold: { pos: [0, -0.07, 0.04], rot: [0.3, 0, 0] }, seasons: ['autumn', 'winter'] },
  mitten: { name: 'mittens', emoji: '🧤', build: mitten, hold: { pos: [0, -0.03, 0.03], rot: [0.2, 0, 0] }, seasons: ['autumn', 'winter'] },
  umbrella: { name: 'umbrella', emoji: '☂️', build: umbrella, hold: { pos: [0, -0.02, 0.02], rot: [0, Math.PI / 2, 0] } },
  egg: { name: 'chocolate egg', emoji: '🥚', build: chocEgg, hold: { pos: [0, -0.07, 0.04], rot: [0, 0, 0] }, seasons: ['spring'] },
});
// Things that don't suit the season (a sun hat in the snow?) aren't lost then.
if (CARRYABLES.hat) CARRYABLES.hat.seasons ??= ['spring', 'summer', 'autumn'];
if (CARRYABLES.frisbee) CARRYABLES.frisbee.seasons ??= ['spring', 'summer', 'autumn'];

// ---------------------------------------------------------------------------------------------
/**
 * 'blown': an umbrella the wind keeps blowing along (harder on a windy day). Nudge it home with your
 * nose — it hops and tumbles when a gust gets under it. Nothing to carry.
 */
STEPS.blown = {
  carries: false,
  start(r) {
    const s = r.spec, q = new RNG(`brolly:${s.id}`), a = q.float(0, Math.PI * 2);
    r.home = r.person.gate.clone();
    r.c = { pos: V(s.spot.x, 0, s.spot.z), vx: 0, vz: 0, speed: 0, roll: 0, hop: 0, vy: 0, gustT: 2, wind: { x: Math.cos(a), z: Math.sin(a) } };
    r.model = openUmbrella(q.pick([0xd9534f, 0x5b86c4, 0xf6d06a, 0x8e6fb0]));
    r.model.position.copy(r.c.pos);
    r.model.rotation.z = Math.PI / 2 - 0.3; // lying on its side
    r.rt.scene.add(r.model);
  },
  update(r, dt, P, ctx) {
    const c = r.c, w = r.rt.world;
    if (r.homeT !== undefined) {
      r.homeT -= dt;
      r.model.scale.setScalar(Math.max(0.01, Math.min(1, r.homeT / 0.5)));
      return r.homeT <= 0 ? 'done' : null;
    }
    // Dogs nudge it (from behind is best).
    for (const d of [P.pos, ...ctx.others]) {
      if ((d.y ?? 0) > 0.6) continue;
      const dx = c.pos.x - d.x, dz = c.pos.z - d.z, dd = Math.hypot(dx, dz);
      if (dd < 0.55 && dd > 1e-3) {
        c.pos.x = d.x + (dx / dd) * 0.55; c.pos.z = d.z + (dz / dd) * 0.55;
        c.vx += (dx / dd) * 1.6; c.vz += (dz / dd) * 1.6;
        if (!r.bumpT || r.bumpT < 0) { r.bumpT = 0.4; fsfx.kick?.(); }
      }
    }
    r.bumpT = (r.bumpT ?? 0) - dt;
    // The wind: a steady push, and now and then a gust that lifts it.
    const k = season.weather === 'windy' ? 1 : season.weather === 'showers' ? 0.7 : 0.4;
    c.vx += c.wind.x * 0.55 * k * dt; c.vz += c.wind.z * 0.55 * k * dt;
    c.gustT -= dt;
    if (c.gustT <= 0) {
      c.gustT = 3 + Math.random() * 4;
      const a = Math.atan2(c.wind.z, c.wind.x) + (Math.random() - 0.5) * 1.2;
      c.vx += Math.cos(a) * 1.4 * k; c.vz += Math.sin(a) * 1.4 * k; c.vy = 2 * k;
      if (flat(P.pos, c.pos) < 15) sfx.rustle?.();
    }
    c.vy -= 9 * dt; c.hop = Math.max(0, c.hop + c.vy * dt); if (c.hop === 0) c.vy = 0;
    const nx = c.pos.x + c.vx * dt, nz = c.pos.z + c.vz * dt;
    if (!blocked(w, nx, nz, 0.15)) { c.pos.x = nx; c.pos.z = nz; }
    else if (!blocked(w, nx, c.pos.z, 0.15)) { c.pos.x = nx; c.vz *= -0.5; }
    else if (!blocked(w, c.pos.x, nz, 0.15)) { c.pos.z = nz; c.vx *= -0.5; }
    else { c.vx *= -0.5; c.vz *= -0.5; }
    const f = Math.exp(-dt * 1.4);
    c.vx *= f; c.vz *= f;
    const b = w.bounds;
    if (b) { c.pos.x = Math.min(b.x1 - 2, Math.max(b.x0 + 2, c.pos.x)); c.pos.z = Math.min(b.z1 - 2, Math.max(b.z0 + 2, c.pos.z)); }
    c.speed = Math.hypot(c.vx, c.vz);
    c.roll += c.speed * dt * 3;
    r.model.position.set(c.pos.x, 0.05 + c.hop, c.pos.z);
    r.model.rotation.set(c.roll, Math.atan2(c.vx, c.vz), Math.PI / 2 - 0.3);
    if (flat(c.pos, r.home) < 2) {
      r.homeT = 1.2;
      sfx.found?.(); buzz([20, 30]);
      r.rt.hud.float('☂️ Home!', c.pos.clone().add(V(0, 0.8, 0)), 'xp');
      r.rt.actions.sparkle(c.pos.clone().add(V(0, 0.3, 0)), 18);
    }
    return null;
  },
  target(r) { return { pos: r.c.pos, emoji: '☂️' }; },
  objective(r) { return { title: `Chase ${r.person.whose} ☂️ umbrella home to number ${r.person.number}!`, sub: 'The wind keeps blowing it away! Nudge it with your nose to the glowing paw prints.' }; },
  cleanup(r) { r.model?.removeFromParent(); },
};
