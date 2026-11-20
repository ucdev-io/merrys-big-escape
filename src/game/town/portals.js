import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { blocked } from '../../world/spots.js';
import { toWorld, toLocal } from '../../world/areas/areas.js';
import { groundY } from '../seasons/common.js';
import { UfoSite } from './ufo.js';
import { JettySite } from './jetty.js';

/*
 * 🕳️ The ways into trips from town: the manhole in the alley (down to the sewers, any time), and the old outfall
 * pipe in the beach's dunes (the sewers' other end: grilled shut until the sluice inside is turned, and from then
 * on a shortcut, alley ↔ beach), and the crop circle under the flying saucer over the Farm's field (up a beam of
 * light to Planet Boing). They're put down when the town's set up, never built into it, so every town is
 * built just as it always was.
 *
 * Each: { id, trip, x, z (the hole), face, out: { x, z, face } (where she comes back out), r (how close for 🐾),
 *         open(): bool, text, shut (what it says when it's locked), paw?, style? ('beam': up, not down) }
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mesh = (geo, color, parent, pos, rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, paint(color));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

export class Portals {
  /** go(trip, from): off down it; prefetch(trip): start the trip's download (she's getting close). */
  constructor({ scene, world, layout, tripState, go, prefetch, hud, why = null }) {
    Object.assign(this, { scene, world, layout, tripState, go, prefetch, hud, why });
    this.list = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.fetched = new Set();
    const alley = this.alley();
    if (alley) this.list.push(alley);
    const pipe = this.beachPipe();
    if (pipe) this.list.push(pipe);
    const ufo = this.ufo();
    if (ufo) this.list.push(ufo);
    const jetty = this.jetty();
    if (jetty) this.list.push(jetty);
  }

  /** The crop circle in the Farm's field, under the hovering flying saucer. */
  ufo() {
    const site = new UfoSite(this.group, this.world.areas?.find((a) => a.kind === 'farm'), this.world);
    if (!site.spot) return null;
    this.site = site;
    const s = site.spot;
    return {
      id: 'farm', trip: 'ufo', x: s.x, z: s.z, face: 0, r: 2.0, out: site.out, style: 'beam', paw: 'beam',
      open: () => true, text: '🐾 Beam me up!',
    };
  }

  /** The saucer's beam on for `secs` (on the way up, or back down). */
  beam(secs) { this.site?.beam(secs); }

  /** The jetty out into the sea at the beach (clear of the outfall pipe), and the tender that runs out to the ship. */
  jetty() {
    const area = this.world.areas?.find((a) => a.kind === 'beach'), pipe = this.get('beach');
    const avoid = pipe && area ? [toLocal(area.layout.a, pipe.x, pipe.z)[0]] : [];
    const site = new JettySite(this.group, area, this.world, avoid);
    if (!site.spot) return null;
    this.jettySite = site;
    const e = site.end;
    return {
      id: 'jetty', trip: 'cruise', x: e.x, z: e.z, face: e.face, r: 1.7, out: e, style: 'boat', paw: 'aboard', emoji: '🚢',
      ride: (k, P, dir) => site.ride(k, P, dir), open: () => true, text: '🐾 All aboard!',
    };
  }

  /** In the alley, just off the middle (not on the pigeons' spot, the bins or the crates). */
  alley() {
    const p = this.layout.places.find((q) => q.type === 'alley');
    if (!p) return null;
    const tries = [[0, 6.2], [6.2, 0], [0, -6.2], [-6.2, 0], [1.6, 7.6], [7.6, 1.6], [-1.6, -7.6], [-7.6, -1.6], [0, 9.5], [9.5, 0], [2.2, 2.2], [-2.2, 2.2]];
    for (const [dx, dz] of tries) {
      const x = p.x + dx, z = p.z + dz;
      if (blocked(this.world, x, z, 0.9)) continue;
      // Out the way she came in: a step towards the middle of the alley.
      const l = Math.hypot(dx, dz), ox = x - (dx / l) * 1.4, oz = z - (dz / l) * 1.4;
      if (blocked(this.world, ox, oz, 0.5)) continue;
      const face = Math.atan2(-dx, -dz);
      this.manhole(x, z);
      return {
        id: 'alley', trip: 'sewer', x, z, face, r: 0.85, out: { x: ox, z: oz, face },
        open: () => true, text: '🐾 Squeeze down the drain!',
      };
    }
    return null;
  }

  /** An iron manhole cover, slid a little aside: a dark gap underneath. */
  manhole(x, z) {
    const g = new THREE.Group(), y = groundY(this.world, x, z);
    g.position.set(x, y, z);
    mesh(new THREE.CircleGeometry(0.5, 20), 0x23201f, g, [0, 0.004, 0], [-Math.PI / 2, 0, 0]); // the hole
    const lid = new THREE.Group();
    lid.position.set(0.28, 0, 0.12);
    g.add(lid);
    mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.045, 20), 0x5c5f66, lid, [0, 0.022, 0]);
    for (const k of [-0.24, -0.08, 0.08, 0.24]) mesh(new THREE.BoxGeometry(0.72 * Math.sqrt(1 - (k / 0.5) ** 2), 0.02, 0.05), 0x4a4d54, lid, [0, 0.052, k]);
    mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 20), 0x4a4d54, lid, [0, 0.045, 0], [Math.PI / 2, 0, 0]);
    this.group.add(g);
  }

  /** The beach's outfall pipe, poking out of the beach side of the dunes. */
  beachPipe() {
    const built = this.world.areas?.find((a) => a.kind === 'beach'), d = built?.layout;
    if (!d?.crest) return null;
    const area = d.a; // (the beach's plan: its frame and which way it faces)
    // Along the dunes, nearest the boardwalk first: clear of the huts and the kiosk at the back of the beach,
    // with nothing in the way of the pipe or in front of it.
    const room = (u) => u > d.uL + 12 && u < d.uR - 12 && Math.abs(u - d.gateU) > 4.5
      && d.huts.every((h) => Math.abs(h.u - u) > 3.2) && Math.abs(d.kiosk.u - u) > 5.5;
    const offsets = [];
    for (let k = 3; k <= 24; k++) offsets.push(k * 1.5, -k * 1.5);
    for (const du of offsets) {
      const u = d.gateU + du;
      if (!room(u)) continue;
      const v = d.crest(u) + 3.4; // (on the dune's long slope down to the beach)
      const [x, z] = toWorld(area, u, v), [ox, oz] = toWorld(area, u, v + 2.2);
      const clear = [-2.4, -1.2, 0, 1.2, 2.2, 3.4].every((dv) => [-0.9, 0, 0.9].every((dw) => { const [px, pz] = toWorld(area, u + dw, v + dv); return !blocked(this.world, px, pz, 0.4); }));
      if (!clear) continue;
      const face = area.turn;
      this.pipe = this.outfall(area, u, v);
      const [mx, mz] = toWorld(area, u, v + 0.3);
      return {
        id: 'beach', trip: 'sewer', x: ox - (ox - x) * 0.45, z: oz - (oz - z) * 0.45, at: { x: mx, z: mz }, face, r: 1.1, out: { x: ox, z: oz, face },
        open: () => !!this.tripState('sewer').open, text: '🐾 Into the pipe!', shut: '🔒 A grille… locked from the inside.',
      };
    }
    return null;
  }

  outfall(area, u, v) {
    const [x, z] = toWorld(area, u, v), y = groundY(this.world, x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = area.turn; // (built looking out along +z: down the beach)
    const R = 0.78, L = 2.6;
    mesh(new THREE.CylinderGeometry(R, R, L, 22, 1, true), 0xb9b4a8, g, [0, R - 0.18, -L / 2], [Math.PI / 2, 0, 0]).material = paint(0xb9b4a8, { side: THREE.DoubleSide });
    mesh(new THREE.TorusGeometry(R, 0.09, 8, 22), 0xa7a196, g, [0, R - 0.18, 0]);
    mesh(new THREE.CircleGeometry(R - 0.02, 22), 0x2b2a28, g, [0, R - 0.18, -0.9]); // (dark, deep inside)
    mesh(new THREE.CircleGeometry(R * 0.7, 18), 0x6e8a8a, g, [0, 0.02, 0.5], [-Math.PI / 2, 0, 0]).scale.set(1, 1.6, 1); // a damp patch on the sand
    // The grille (until the sluice is opened, inside).
    const grille = new THREE.Group();
    for (let k = -3; k <= 3; k++) mesh(new THREE.CylinderGeometry(0.03, 0.03, 2 * Math.sqrt(Math.max(0.01, R * R - (k * 0.21) ** 2)), 6), 0x5c5f66, grille, [k * 0.21, R - 0.18, 0.04]);
    mesh(new THREE.BoxGeometry(R * 2, 0.06, 0.06), 0x4a4d54, grille, [0, R - 0.18, 0.05]);
    g.add(grille);
    this.grille = grille;
    // The pipe's body is solid (you can hop up on it, though).
    const [ax, az] = toWorld(area, u - R - 0.05, v - L), [bx, bz] = toWorld(area, u + R + 0.05, v - 0.1);
    this.world.colliders.box(ax, az, bx, bz, y + R * 2 - 0.2);
    this.group.add(g);
    this.refresh();
    return g;
  }

  /** The grille comes off once the sluice is open. */
  refresh() { if (this.grille) this.grille.visible = !this.tripState('sewer').open; }

  get(id) { return this.list.find((p) => p.id === id) ?? null; }
  /** Where she comes back out of a way in (or null). */
  out(id) { return this.get(id)?.out ?? null; }

  /** The way in the dog's at (her body or her nose within reach of 🐾), or null. */
  at(pos, nose = null) {
    const near = (q, p, r) => q && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < r * r;
    return this.list.find((p) => near(pos, p, p.r) || near(nose, p, p.r * 0.9)) ?? null;
  }

  /** Why she can't go down just now (Pepper's on a walk with her…), or null. (Not the moment-to-moment ones.) */
  blocked() { const w = this.why?.(); return w && w !== 'Not just now!' ? w : null; }

  /** What 🐾 does here: { text, paw } or null. */
  hint(pos, nose = null) {
    const p = this.at(pos, nose);
    if (!p) return null;
    if (!p.open()) return { text: p.shut, paw: 'dig' };
    const why = this.blocked();
    return why ? { text: `${p.emoji ?? (p.style === 'beam' ? '🛸' : '🕳️')} ${why}`, paw: 'dig' } : { text: p.text, paw: p.paw ?? 'squeeze' };
  }

  /** 🐾 pressed: down the way in she's at (true if there was one). */
  onDig(nose, pos) {
    const p = this.at(pos, nose);
    if (!p) return false;
    if (!p.open()) { this.hud.float('Locked! 🔒', V(pos.x, 1.2, pos.z)); return true; }
    if (this.go(p.trip, { id: p.id, at: p.at ?? { x: p.x, z: p.z }, style: p.style, ride: p.ride }) && p.style === 'beam') this.beam(2.4);
    return true;
  }

  /** Getting close to a way in: start fetching the trip, so it's ready when she gets there. (And the saucer bobs.) */
  update(pos, dt = 1 / 60) {
    this.site?.update(dt, pos);
    this.jettySite?.update(dt, pos);
    for (const p of this.list) {
      if (this.fetched.has(p.trip)) continue;
      if ((pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 < 15 * 15) { this.fetched.add(p.trip); this.prefetch(p.trip); }
    }
  }
}
