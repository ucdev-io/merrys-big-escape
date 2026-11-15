import * as THREE from 'three';
import { Lookout } from './lookout.js';
import { cook as cookPerson, guest as guestPerson } from './people.js';
import { brickBbq, GRILL_SLOTS, puff } from './models.js';
import { heistSfx } from './sounds.js';
import { treatGeometry, treatMaterial } from '../../../entities/treats.js';
import { PARTY_IDS, lootKind } from '../../heistRules.js';
import { COOK, GUESTS } from '../../lines/heists.js';
import { blocked } from '../../../world/spots.js';
import { LineBag } from '../../dialogue.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRect = (p, r, m = 0.5) => p.x > r.x0 + m && p.x < r.x1 - m && p.z > r.z0 + m && p.z < r.z1 - m;
const PUFFS = 10, SMOKE_LIFE = 5, RISE = 0.85;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

/**
 * Front gardens with room for a BBQ party: a clear spot for the grill, the cook and two guests. Never
 * anyone's home (the first eight houses are the pack's), and the same list on every device.
 */
function partySpots(world) {
  const homes = new Set(world.homes.slice(0, 8).map((h) => h.garden));
  const out = [];
  for (const g of world.gardens) {
    if (g.home || !g.front || homes.has(g)) continue;
    const c = { x: (g.rect.x0 + g.rect.x1) / 2, z: (g.rect.z0 + g.rect.z1) / 2 }, f = g.front, side = { x: f.z, z: -f.x };
    let spot = null;
    for (const fwd of [4.2, 3.8, 4.8]) for (const s of [1, -1]) {
      if (spot) continue;
      const at = (a, b) => V(c.x + f.x * a + side.x * b * s, 0, c.z + f.z * a + side.z * b * s);
      const grill = at(fwd, 3.4), cook = at(fwd - 0.9, 3.4), guests = [at(fwd - 1.3, 4.9), at(fwd - 0.3, 5.5)];
      if ([[grill, 0.9], [cook, 0.4], [guests[0], 0.4], [guests[1], 0.4]].every(([q, pad]) => inRect(q, g.rect) && !blocked(world, q.x, q.z, pad))) {
        spot = { garden: g, grill, cook, guests, face: Math.atan2(f.x, f.z) };
      }
    }
    if (spot) out.push(spot);
  }
  return out;
}

/**
 * 🍔 BBQ parties: now and then a garden has a barbecue on (the HeistRoom says when, and which:
 * everyone sees the same one). A cook minds the grill (sausages and burgers!) and keeps turning round
 * to chat with the guests: that's your chance. It's the bakery's heist all over again (the same
 * Lookout), just at somebody's house, with smoke you can see from down the street.
 */
export class BbqParty {
  constructor(H) {
    this.H = H;
    this.on = false;
    this.grill = brickBbq();
    this.cook = cookPerson();
    this.guests = [guestPerson(0), guestPerson(1)];
    this.L = new Lookout({ hud: H.hud, person: this.cook, pos: V(0, 0, 0), faces: { busy: 0, look: 0 }, zone: { x: 0, z: 0, r: 5 }, work: 'chat', lookWork: 'flip', marks: { busy: '💬' } });
    this.L.mark.style.display = 'none';
    this.grillAt = V(0, 0, 0);
    this.L.site = {
      door: V(0, 0, 0), lines: COOK, whom: 'the cook', doorMood: ['😍', ''], goods: () => (this.on ? this.grillAt : null), // (he's pleased to see a dog)
      prompts: { busy: '🤫 The cook’s chatting… pinch something! 🐾', warn: '❗ He’s about to check the grill!', look: '👀 He’s watching the grill! Wait for it…', door: '❓ He’s distracted… quick! 🐾', woof: '🗣️ Woof at the guests to distract the cook!' },
    };
    // The food on the grill: one instanced mesh per kind; what you grab is its own (carry.js) mesh.
    this.food = {};
    for (const kind of ['sausage', 'burger']) {
      const m = new THREE.InstancedMesh(treatGeometry(kind), treatMaterial(), PARTY_IDS.filter((id) => lootKind(id) === kind).length);
      m.castShadow = true;
      m.visible = false;
      H.scene.add(m);
      this.food[kind] = { mesh: m, n: 0 };
    }
    for (const id of PARTY_IDS) {
      const kind = lootKind(id), it = H.carry.add(kind, 0, 0), f = this.food[kind];
      it.obj.visible = false;
      it.loot = { id, kind, lookout: 'cook', home: V(0, 0, 0), rot: 0, mesh: f.mesh, index: f.n++, state: 'gone', by: null, pending: false };
      H.items.set(id, it);
      H.place(it, 'gone');
    }
    // Smoke rising from the grill (one instanced mesh of puffs): you can spot a party from down the street.
    const pm = puff();
    this.smoke = new THREE.InstancedMesh(pm.geometry, pm.material, PUFFS);
    this.smoke.visible = false;
    this.smoke.frustumCulled = false;
    H.scene.add(this.smoke);
    this.puffs = Array.from({ length: PUFFS }, (_, i) => ({ p: V(0, 0, 0), t: (i / PUFFS) * SMOKE_LIFE }));
    this.smokeAt = V(0, 0, 0);
    this.chatT = 3;
    this.sizzleT = 0;
  }

  near(r) { return this.on && flat(this.H.player.pos, this.grillAt) < r; }

  /** The HeistRoom says a party's started (n: where) or finished (n: null). */
  onParty(m) {
    if (m.n === null || m.n === undefined) return this.end();
    if (this.on && this.n === m.n) return;
    this.end(true);
    this.start(m.n);
    if (this.on && !this.near(28)) this.H.hud.showToastRaw('🍔', 'Someone’s having a BBQ party!', 'Follow your nose (and the smoke). The compass knows the way!');
  }

  start(n) {
    const H = this.H, spots = (this.spots ??= partySpots(H.world));
    if (!spots.length) return;
    const S = spots[n % spots.length], scene = H.scene;
    this.on = true;
    this.n = n;
    this.grillAt.copy(S.grill);
    this.grill.position.copy(S.grill);
    this.grill.rotation.y = S.face;
    scene.add(this.grill);
    this.collider = H.world.colliders.circle(S.grill.x, S.grill.z, 0.6);
    // The cook stands behind the grill; the guests chat to one side.
    const mid = S.guests[0].clone().add(S.guests[1]).multiplyScalar(0.5);
    this.cook.root.position.copy(S.cook);
    this.L.faces = { busy: Math.atan2(mid.x - S.cook.x, mid.z - S.cook.z), look: S.face };
    this.L.zone = { x: S.grill.x, z: S.grill.z, r: 5 };
    this.L.site.door.copy(mid);
    this.L.mark.style.display = '';
    scene.add(this.cook.root);
    H.lookouts.cook = this.L;
    this.guests.forEach((g, i) => {
      g.root.position.copy(S.guests[i]);
      g.root.rotation.y = Math.atan2(S.cook.x - S.guests[i].x, S.cook.z - S.guests[i].z);
      scene.add(g.root);
    });
    // Sausages and burgers on the grill (unless someone's still got one from the last party).
    const c = Math.cos(S.face), s = Math.sin(S.face);
    PARTY_IDS.forEach((id, i) => {
      const it = H.items.get(id), [x, y, z, r] = GRILL_SLOTS[i];
      it.loot.home.set(S.grill.x + x * c + z * s, y, S.grill.z - x * s + z * c);
      it.loot.rot = S.face + r;
      if (it.loot.state !== 'held') H.place(it, 'home');
    });
    for (const { mesh } of Object.values(this.food)) { mesh.visible = true; mesh.computeBoundingSphere(); }
    this.smokeAt.set(S.grill.x - 0.32 * c, 0.65, S.grill.z + 0.32 * s); // (from the end of the grill, not in the cook's face)
    for (const q of this.puffs) q.p.set(this.smokeAt.x + q.t * 0.15, 0.65 + q.t * RISE, this.smokeAt.z);
    this.smoke.visible = true;
  }

  end(quiet = false) {
    if (!this.on) return;
    const H = this.H;
    if (!quiet && this.near(24)) H.say(this.L, `👋 ${H.line('cook-over', COOK.over)}`, 3);
    this.on = false;
    for (const o of [this.grill, this.cook.root, ...this.guests.map((g) => g.root)]) o.removeFromParent();
    const cs = H.world.colliders.circles, i = cs.indexOf(this.collider);
    if (i >= 0) cs.splice(i, 1);
    delete H.lookouts.cook;
    this.L.mark.style.display = 'none';
    for (const id of PARTY_IDS) { const it = H.items.get(id); if (it.loot.state !== 'held') H.place(it, 'gone'); }
    for (const { mesh } of Object.values(this.food)) mesh.visible = false;
    this.smoke.visible = false;
  }

  /** A guest notices a dog getting away with something (and thinks it's hilarious). */
  cheer() {
    if (!this.near(16)) return;
    const g = this.guests[Math.floor(Math.random() * 2)];
    this.H.hud.say(`😂 ${this.H.line('guest-cheer', GUESTS.cheer)}`, () => g.root.position.clone().add(V(0, 2.05, 0)), 2.4, 'heist');
  }

  update(dt) {
    if (!this.on) return;
    const H = this.H, P = H.player.pos;
    for (const g of this.guests) {
      g.update(dt, 0);
      g.arms[1].rotation.x = -1.2 + Math.sin(performance.now() / 700 + g.root.position.x) * 0.15; // drink in hand
      this.solid(P, g.root.position);
    }
    this.solid(P, this.cook.root.position);
    // Chit-chat, when you're near enough to hear it.
    this.chatT -= dt;
    if (this.chatT <= 0) {
      this.chatT = 6 + Math.random() * 4;
      if (this.near(18)) {
        const [a, b] = (H.bags['guest-chat'] ??= new LineBag(GUESTS.chat)).next();
        const at = (g) => () => g.root.position.clone().add(V(0, 2.05, 0));
        H.hud.say(a, at(this.guests[0]), 2.6, 'heist');
        setTimeout(() => { if (this.on) H.hud.say(b, at(this.guests[1]), 2.6, 'heist'); }, 2300);
      }
    }
    this.sizzleT -= dt;
    if (this.sizzleT <= 0) { this.sizzleT = 1.3; const d = flat(P, this.grillAt); if (d < 10) heistSfx.sizzle(1 - d / 10); }
    // Smoke: puffs rise, drift and swell, then fade away (shrink) and start again at the grill.
    for (let i = 0; i < PUFFS; i++) {
      const q = this.puffs[i];
      q.t += dt;
      if (q.t >= SMOKE_LIFE) { q.t -= SMOKE_LIFE; q.p.set(this.smokeAt.x + (Math.random() - 0.5) * 0.1, 0.65, this.smokeAt.z + (Math.random() - 0.5) * 0.1); }
      q.p.y += dt * RISE;
      q.p.x += dt * 0.15;
      // A thin wisp by the grill, billowing out once it's above everyone's heads.
      const k = q.t / SMOKE_LIFE, high = THREE.MathUtils.smoothstep(q.p.y, 2.2, 3.6);
      const size = (0.05 + k * 0.08 + high * 0.38) * Math.min(1, (1 - k) * 5);
      this.smoke.setMatrixAt(i, _m.compose(q.p, _q, _s.setScalar(size)));
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  /** People are solid: a dog bumping into one slides round them. */
  solid(P, at) {
    const dx = P.x - at.x, dz = P.z - at.z, d = Math.hypot(dx, dz), r = 0.53;
    if (d < r && d > 1e-4 && P.y < 1.6) { P.x = at.x + (dx / d) * r; P.z = at.z + (dz / d) * r; }
  }

  /** For the compass: the party (when nothing more important's going on). */
  target() { return this.on ? { pos: this.grillAt, label: '🍔 BBQ' } : null; }
}
