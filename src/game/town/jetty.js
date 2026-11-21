import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { bakedMat } from '../../entities/shapes.js';
import { toWorld } from '../../world/areas/areas.js';
import { farShipGeometry, tenderModel, SHIP } from '../../entities/ship.js';

/*
 * 🚢 A wooden jetty runs out into the sea from a town's beach, with the tender (a little motor boat) tied up at
 * the end, and out on the water a cruise ship, the Sunny Dolphin, waits. At the end of the jetty 🐾: "All aboard!"
 * She hops into the tender and off it chugs (ride(): trips/manager.js plays it), out to the ship (trips/cruise/).
 * Coming back, the tender brings her in and she hops back up onto the jetty.
 * Placed when the town's set up (see portals.js), never built into it: every town's built just as it always was.
 */

const DECK = 0.45, WIDE = 1.0, END = 1.8; // the deck's height, half its width, and the end platform's half-width
const SEA = 0.02;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Where the jetty goes on a town's beach (the built area): along the beach, clear of the boardwalk, the groynes, the
 * lifeguard's tower, the rock pools (and their spit of rocks) and the outfall pipe. { u, v0, v1 } in the beach's own
 * frame (from the sand out to the end), or null.
 */
export function jettySpot(area, avoidU = []) {
  const d = area?.layout;
  if (!d?.vS) return null;
  const cu = d.side > 0 ? d.uR - 14 : d.uL + 14, v0 = d.vS - 5, v1 = d.vS + 15;
  const ok = (u) => u > d.uL + 10 && u < d.uR - 10 && Math.abs(u - d.gateU) > 7 && Math.abs(u - cu) > 17 && Math.abs(u - d.tower.u) > 6
    && d.groynes.every((g) => Math.abs(g.u - u) > 5) && avoidU.every((a) => Math.abs(a - u) > 5)
    && d.rocks.every((r) => Math.abs(r.u - u) > 2.6 + r.s || r.v < v0 - 2);
  for (let k = 3; k <= 30; k++) for (const s of [-d.side, d.side]) { const u = d.gateU + s * k * 2; if (ok(u)) return { u, v0, v1 }; }
  return null;
}

export class JettySite {
  constructor(parent, area, world, avoidU = []) {
    const s = jettySpot(area, avoidU);
    this.spot = s;
    if (!s) return;
    const d = area.layout, a = d.a;
    this.a = a;
    this.W = (u, v, y = 0) => { const [x, z] = toWorld(a, u, v); return V(x, y, z); };
    this.group = new THREE.Group();
    parent.add(this.group);
    const along = this.W(s.u, s.v0 + 1).sub(this.W(s.u, s.v0)); // (out to sea, in the world)
    this.face = Math.atan2(along.x, along.z);
    this.len = s.v1 - s.v0;
    // (The jetty's own frame: z out along it from where it starts on the sand, x across it.)
    const o = this.W(s.u, s.v0), cs = Math.cos(this.face), sn = Math.sin(this.face);
    this.L = (x, z, y = 0) => V(o.x + x * cs + z * sn, y, o.z - x * sn + z * cs);
    this.buildJetty(d, world);
    // The tender, tied up beside the end, nose out to sea.
    this.tender = tenderModel();
    this.tender.position.copy(this.L(-END - 1.25, this.len - 2.2, SEA));
    this.tender.rotation.y = this.face;
    this.group.add(this.tender);
    // The ship, out at sea, side on to the beach.
    this.ship = new THREE.Mesh(farShipGeometry(), bakedMat());
    this.shipAt = this.W(s.u + 16 * (d.side > 0 ? -1 : 1), d.vS + 62, SEA + SHIP.H - 0.2);
    this.ship.position.copy(this.shipAt);
    this.ship.rotation.y = this.face + Math.PI / 2;
    this.group.add(this.ship);
    // Where she gets on (and off): the middle of the end platform, looking back to the beach.
    const e = this.L(0, this.len - 1.4);
    this.end = { x: e.x, z: e.z, face: this.face + Math.PI, y: DECK }; // (y: up on the deck, not in the sea under it)
    this.t = Math.random() * 10;
    this.cur = null;
    // (Sandy's beach balls never land under the jetty.)
    const r = this.rect(s.u - END - 0.5, s.v0, s.u + END + 0.5, s.v1 + 0.5);
    area.inJetty = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  }

  /** A rectangle in the beach's frame, in the world's (the beach is square to the world). */
  rect(u0, v0, u1, v1) {
    const p = this.W(u0, v0), q = this.W(u1, v1);
    return { x0: Math.min(p.x, q.x), z0: Math.min(p.z, q.z), x1: Math.max(p.x, q.x), z1: Math.max(p.z, q.z) };
  }

  buildJetty(d, world) {
    const s = this.spot, g = new THREE.Group(), u = s.u;
    g.position.copy(this.W(u, s.v0));
    g.rotation.y = this.face;
    this.group.add(g);
    const L = s.v1 - s.v0, plank = paint(0xc8a47a), dark = paint(0x9a7652), post = paint(0x7a5a3e), rope = paint(0xe8dcc0);
    const box = (w, h, dd, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    // The deck: planks across, the first one a step up from the sand, and the wider platform at the end.
    for (let z = 0.15; z < L - 3.2; z += 0.36) box(WIDE * 2, 0.07, 0.32, (Math.round(z / 0.36) % 3) ? plank : dark, 0, z < 0.7 ? 0.2 : DECK - 0.035, z);
    for (let z = L - 3.2; z < L; z += 0.36) box(END * 2, 0.07, 0.32, (Math.round(z / 0.36) % 3) ? plank : dark, 0, DECK - 0.035, z + 0.16);
    for (const sx of [-1, 1]) box(0.14, 0.12, L, dark, sx * (WIDE - 0.05), DECK - 0.13, L / 2); // (the beams underneath)
    // Posts down into the sea (and the sand), with a rope along them.
    const seabed = (v) => d.sandY(u, v);
    for (let z = 0.8; z <= L; z += 2.4) for (const sx of [-1, 1]) {
      const wide = z > L - 3.4, x = sx * (wide ? END : WIDE), y0 = seabed(s.v0 + z) - 0.3, h = DECK + 0.9 - y0;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, h, 10), post);
      p.position.set(x, y0 + h / 2, z);
      p.castShadow = true;
      g.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark);
      cap.position.set(x, DECK + 0.9, z);
      g.add(cap);
    }
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L - 4, 6), rope);
      r.rotation.x = Math.PI / 2;
      r.position.set(sx * WIDE, DECK + 0.72, 0.8 + (L - 4) / 2);
      g.add(r);
    }
    // At the end: a lamp post, a bollard with a rope to the tender, a life ring, and a sign.
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 10), paint(0x2f4a7a));
    lamp.position.set(END - 0.3, DECK + 1.2, L - 0.4);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), paint(0xfff1b8, { emissive: 0x8a7a40 }));
    bulb.position.set(END - 0.3, DECK + 2.45, L - 0.4);
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 12), paint(0x3a3a40));
    bollard.position.set(-END + 0.3, DECK + 0.2, L - 2.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 20), paint(0xf2f0ea));
    ring.position.set(END - 0.05, DECK + 0.65, L - 1.9);
    ring.rotation.y = Math.PI / 2;
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.083, 8, 4, Math.PI / 8), paint(0xd9534f)); b.position.copy(ring.position); b.rotation.set(0, Math.PI / 2, k * (Math.PI / 2)); g.add(b); }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.06), paint(0xbfe0ec));
    const SX = -END + 0.35; // (to one side: not in the way of the camera, looking back up the jetty)
    sign.position.set(SX, DECK + 1.75, L - 0.15);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 0.04), paint(0x2f4a7a));
    board.position.set(SX, DECK + 1.75, L - 0.12);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), dark);
    stick.position.set(SX, DECK + 0.8, L - 0.1);
    for (const m of [lamp, bulb, bollard, ring, sign, board, stick]) { m.castShadow = true; g.add(m); }
    // A little ship on the sign (three dabs of colour: a hull, a cabin, a funnel).
    for (const [w, h, x, y, c] of [[1.2, 0.06, 0, 1.53, 0x5f9ec0], [0.8, 0.14, 0, 1.63, 0x2f4a7a], [0.5, 0.12, -0.05, 1.76, 0xfbf6ec], [0.1, 0.18, 0.08, 1.87, 0xe0603e]]) box(w, h, 0.02, paint(c), SX + x, DECK + y, L - 0.2);
    // Colliders: the step up, the deck, the end platform (walls below: she can't swim under it, but can jump off).
    const C = world.colliders, r1 = this.rect(u - WIDE, s.v0, u + WIDE, s.v0 + 0.7), r2 = this.rect(u - WIDE, s.v0 + 0.7, u + WIDE, s.v1 - 3.2), r3 = this.rect(u - END, s.v1 - 3.2, u + END, s.v1 + 0.2);
    C.box(r1.x0, r1.z0, r1.x1, r1.z1, 0.22);
    C.box(r2.x0, r2.z0, r2.x1, r2.z1, DECK);
    C.box(r3.x0, r3.z0, r3.x1, r3.z1, DECK);
  }

  /**
   * The tender's run (trips/manager.js plays it): 'out' from the end of the jetty (k 0 → 1: she hops in, it chugs
   * off), or 'in' (k 0 → 1: it chugs back in, she hops out onto the end). Moves her too.
   */
  ride(k, P, dir = 'out') {
    if (!this.cur || this.cur.dir !== dir || k < this.cur.k) this.cur = { dir, from: P.pos.clone() };
    this.cur.k = k;
    const HOP = 0.22, out = (q) => this.L(-END - 1.25, this.len - 2.2 + 18 * q * q, SEA); // (the tender, q of the way out)
    const seat = (p) => p.clone().add(V(Math.sin(this.face) * -1.3, 0.22, Math.cos(this.face) * -1.3)); // (on the seat at the back)
    const land = V(this.end.x, DECK, this.end.z);
    let boat, me, face = this.face;
    if (dir === 'out') {
      if (k < HOP) {
        const t = k / HOP;
        boat = out(0);
        me = this.cur.from.clone().lerp(seat(boat), t);
        me.y += Math.sin(t * Math.PI) * 0.7;
      } else { boat = out((k - HOP) / (1 - HOP)); me = seat(boat); }
    } else {
      face = this.face + Math.PI;
      if (k < 1 - HOP) { boat = out(1 - k / (1 - HOP)); me = seat(boat); }
      else {
        const t = (k - (1 - HOP)) / HOP;
        boat = out(0);
        me = seat(boat).lerp(land, t);
        me.y += Math.sin(t * Math.PI) * 0.7;
      }
    }
    const bob = Math.sin(this.t * 2.2) * 0.05;
    this.tender.position.copy(boat).setY(SEA + bob);
    this.tender.rotation.y = dir === 'in' && k < 1 - HOP ? this.face + Math.PI : this.face;
    this.tender.rotation.z = Math.sin(this.t * 1.7) * 0.03;
    P.pos.copy(me).setY(me.y + bob);
    P.heading = face;
    if (k >= 1) { this.cur = null; this.tender.rotation.y = this.face; }
  }

  update(dt, pos) {
    if (!this.spot) return;
    this.t += dt;
    const near = (pos.x - this.end.x) ** 2 + (pos.z - this.end.z) ** 2 < 170 * 170;
    this.group.visible = near;
    if (!near) return;
    if (!this.cur) {
      this.tender.position.y = SEA + Math.sin(this.t * 2.2) * 0.05;
      this.tender.rotation.z = Math.sin(this.t * 1.7) * 0.03;
    }
    this.ship.position.y = this.shipAt.y + Math.sin(this.t * 0.5) * 0.12;
    this.ship.rotation.z = Math.sin(this.t * 0.4) * 0.008;
  }
}
