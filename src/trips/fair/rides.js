import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';

/*
 * 🎠🎡🌀🎢🚗 The rides at Wagtail Wonderland. Each one goes round (or up and down) whether anybody's on it or not,
 * and knows how to carry a dog: where she sits, and when the ride's over. All in the park's own coordinates (they
 * live in the trip's `dyn` group); `O` turns those into the world's.
 *   ride.board(P)        on she gets
 *   ride.carry(dt, P)    move her along with it; true when it's over
 *   ride.off()           where she gets off: { x, z, face } (world)
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RB = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);
const UP = V(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

function mesh(geo, color, parent, pos = [0, 0, 0], rot = [0, 0, 0], opts, scale) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Stripes round a cylinder-ish shape (vertex colours, by angle). */
function stripes(geo, a, b, n = 12, twist = 0) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), ca = new THREE.Color(a), cb = new THREE.Color(b);
  for (let i = 0; i < p.count; i++) {
    const ang = Math.atan2(p.getZ(i), p.getX(i)) + p.getY(i) * twist;
    (Math.floor(((ang / (Math.PI * 2)) + 1) * n) % 2 ? ca : cb).toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Sit her down on something, facing `heading`, her body tilted (nose up the slope: pitch < 0). */
export function seatAt(P, pos, heading, pitch = 0) { seat(P, pos, heading, pitch); }
function seat(P, pos, heading, pitch = 0) {
  P.pos.copy(pos);
  P.heading = heading;
  P.object.rotation.y = heading;
  P.dog.body.rotation.x = pitch;
  P.vel.set(0, 0);
  sitStill(P.dog);
}

/** Sitting, and staying sat (an emote that's started again blends in from standing: this holds it mid-sit). */
export function sitStill(dog) {
  if (dog.emoteKind === 'sit' && (dog.emoteT ?? 0) > 0.3) dog.emoteT = Math.max(dog.emoteT, 1.5);
  else dog.emote('sit');
}

// ======================================================================= 🎠 the carousel

/** A horse for the carousel: white, with a coloured saddle and a golden mane, looking along +z. */
function horse(saddle) {
  const g = new THREE.Group(), S = new THREE.SphereGeometry(1, 16, 12), body = 0xf7f3ea, gold = 0xe0b04a;
  mesh(S, body, g, [0, 0, 0], [0, 0, 0], undefined, [0.2, 0.2, 0.42]);
  mesh(S, body, g, [0, 0.26, 0.34], [-0.7, 0, 0], undefined, [0.1, 0.22, 0.11]);       // neck
  mesh(S, body, g, [0, 0.44, 0.46], [0.5, 0, 0], undefined, [0.09, 0.1, 0.17]);         // head
  mesh(S, gold, g, [0, 0.4, 0.32], [-0.7, 0, 0], undefined, [0.04, 0.22, 0.09]);        // mane
  mesh(S, gold, g, [0, 0.06, -0.44], [0.9, 0, 0], undefined, [0.05, 0.2, 0.06]);        // tail
  mesh(S, saddle, g, [0, 0.16, -0.02], [0, 0, 0], undefined, [0.18, 0.06, 0.2]);        // saddle
  for (const [x, z, rx] of [[0.1, 0.25, -0.9], [-0.1, 0.25, -0.5], [0.1, -0.28, 0.6], [-0.1, -0.28, 0.9]]) {
    mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 8), body, g, [x, -0.2, z], [rx, 0, 0]);
  }
  return g;
}

export class Carousel {
  constructor(parent, c, O) {
    Object.assign(this, { c, O });
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    parent.add(g);
    mesh(new THREE.CylinderGeometry(c.r + 0.25, c.r + 0.35, 0.2, 48), 0xd8cfc0, g, [0, 0.1, 0]);
    this.top = new THREE.Group();
    g.add(this.top);
    mesh(stripes(new THREE.CylinderGeometry(c.r, c.r, 0.16, 48), 0xf7f3ea, 0xf2a0c8, 24), 0xffffff, this.top, [0, 0.28, 0], [0, 0, 0], { vertexColors: true });
    mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.4, 24), 0xe0b04a, this.top, [0, 2.0, 0]);
    // The canopy: a striped cone with a scalloped edge and a flag on top.
    mesh(stripes(new THREE.ConeGeometry(c.r + 0.4, 1.6, 48, 1, true), 0xd9534f, 0xfffaf0, 12), 0xffffff, this.top, [0, 4.1, 0], [0, 0, 0], { vertexColors: true, side: THREE.DoubleSide });
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; mesh(new THREE.SphereGeometry(0.22, 10, 8), k % 2 ? 0xd9534f : 0xfffaf0, this.top, [Math.cos(a) * (c.r + 0.35), 3.3, Math.sin(a) * (c.r + 0.35)], [0, 0, 0], undefined, [1, 0.6, 1]); }
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), 0xe0b04a, this.top, [0, 5.3, 0]);
    mesh(new THREE.ConeGeometry(0.22, 0.4, 4), 0x5b86c4, this.top, [0.18, 5.6, 0], [0, 0, -Math.PI / 2]);
    // Eight horses on golden poles, going up and down.
    this.horses = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, r = c.r * 0.72;
      const pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.0, 8), 0xe0b04a, this.top, [Math.cos(a) * r, 1.85, Math.sin(a) * r]);
      pole.castShadow = false;
      const h = horse([0xd9534f, 0x5b86c4, 0x6f9a52, 0xb69be0][k % 4]);
      h.position.set(Math.cos(a) * r, 1.0, Math.sin(a) * r);
      h.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)); // (looking the way it goes round)
      this.top.add(h);
      this.horses.push({ g: h, a });
    }
    this.spin = 0;
    this.speed = 0.45;
    this.t = 0;
  }

  /** Where to hop on (the side facing the plaza): the trail leads here. */
  get door() { return V(this.c.x + this.c.r + 1.0, 0, this.c.z); }
  near(l) { return Math.hypot(l.x - this.c.x, l.z - this.c.z) < this.c.r + 1.5; }

  update(dt) {
    this.t += dt;
    this.speed += ((this.riding ? 0.85 : 0.45) - this.speed) * (1 - Math.exp(-dt * 0.8));
    this.spin += this.speed * dt;
    this.top.rotation.y = this.spin;
    for (const h of this.horses) h.g.position.y = 1.0 + Math.sin(this.spin * 3 + h.a * 2) * 0.22;
    this.top.updateMatrixWorld(true); // (so she sits where the horse is this frame, not last)
  }

  board(P) {
    // The horse nearest her.
    let best = null, bd = Infinity;
    for (const h of this.horses) { const d = h.g.getWorldPosition(_v).distanceToSquared(P.pos); if (d < bd) { bd = d; best = h; } }
    this.riding = { h: best, t: 0, laps: 0, start: this.spin };
  }

  carry(dt, P) {
    const R = this.riding;
    R.t += dt;
    const h = R.h.g, at = h.localToWorld(V(0, 0.22, -0.02)), dir = V(0, 0, 1).transformDirection(h.matrixWorld);
    seat(P, at, Math.atan2(dir.x, dir.z), 0);
    if (this.spin - R.start > Math.PI * 4) { this.riding = null; return true; } // (twice round)
    return false;
  }

  /** Off at the edge nearest `pos` (world), looking outward. */
  offFrom(pos) {
    const c = this.c, o = this.O, dx = pos.x - (c.x + o.x), dz = pos.z - (c.z + o.z), l = Math.hypot(dx, dz) || 1;
    return { x: c.x + o.x + (dx / l) * (c.r + 1.1), z: c.z + o.z + (dz / l) * (c.r + 1.1), face: Math.atan2(dx, dz) };
  }
}

// ======================================================================= 🎡 the big wheel

export class BigWheel {
  constructor(parent, w, O) {
    Object.assign(this, { w, O });
    const g = new THREE.Group();
    g.position.set(w.x, 0, w.z);
    parent.add(g);
    // The legs: an A-frame each side, up to the axle.
    for (const s of [-1, 1]) for (const lx of [-1, 1]) {
      const foot = V(lx * 3.4, 0, s * 1.6), hub = V(0, w.hub, s * 0.7), mid = foot.clone().add(hub).multiplyScalar(0.5);
      const leg = mesh(new THREE.CylinderGeometry(0.14, 0.2, foot.distanceTo(hub), 10), 0xf7f3ea, g, mid.toArray());
      leg.quaternion.setFromUnitVectors(UP, hub.clone().sub(foot).normalize());
    }
    mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 16), 0xe0b04a, g, [0, w.hub, 0], [Math.PI / 2, 0, 0]);
    // The wheel itself: two rims, spokes, and lights round the edge.
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, w.hub, 0);
    g.add(this.wheel);
    for (const z of [-0.55, 0.55]) {
      mesh(new THREE.TorusGeometry(w.R, 0.1, 8, 72), 0x5b86c4, this.wheel, [0, 0, z]);
      mesh(new THREE.TorusGeometry(w.R * 0.45, 0.06, 6, 40), 0x5b86c4, this.wheel, [0, 0, z]);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, s = mesh(new THREE.CylinderGeometry(0.04, 0.04, w.R, 6), 0xf7f3ea, this.wheel, [Math.sin(a) * w.R / 2, -Math.cos(a) * w.R / 2, z], [0, 0, a]);
        s.castShadow = false;
      }
    }
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2, c = [0xfff1a0, 0xffb0d0, 0x9ff0f0][k % 3];
      mesh(new THREE.SphereGeometry(0.1, 8, 6), c, this.wheel, [Math.sin(a) * (w.R + 0.12), -Math.cos(a) * (w.R + 0.12), 0.62], [0, 0, 0], { emissive: c }).castShadow = false;
    }
    // Gondolas: little open cabins that hang level from the rim (each its own colour).
    this.gondolas = [];
    for (let k = 0; k < 8; k++) {
      const c = [0xd9534f, 0xf2c94c, 0x6f9a52, 0x5b86c4, 0xf2a0c8, 0xe8743c, 0xb69be0, 0x4aa3a0][k], gd = new THREE.Group();
      g.add(gd);
      mesh(RB(1.5, 0.55, 1.2, 0.1), c, gd, [0, -1.25, 0]);
      mesh(RB(1.4, 0.06, 1.1, 0.03), 0xf7f3ea, gd, [0, -0.95, 0]);
      for (const sx of [-0.62, 0.62]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), 0xf7f3ea, gd, [sx, -0.5, 0]);
      mesh(new THREE.SphereGeometry(0.8, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), c, gd, [0, -0.05, 0], [0, 0, 0], undefined, [1, 0.32, 0.8]); // (a little domed roof)
      this.gondolas.push({ g: gd, k });
    }
    this.angle = 0;
    this.speed = 0.18;
  }

  /** The boarding platform, in front of the bottom of the wheel. */
  get door() { return V(this.w.x, 0, this.w.z + 2.2); }
  near(l) { return Math.hypot(l.x - this.door.x, l.z - this.door.z) < 2; }

  update(dt) {
    this.speed += ((this.riding ? 0.38 : 0.18) - this.speed) * (1 - Math.exp(-dt * 0.8));
    this.angle += this.speed * dt;
    this.wheel.rotation.z = this.angle;
    for (const G of this.gondolas) {
      const a = this.angle + (G.k / 8) * Math.PI * 2;
      G.g.position.set(-Math.sin(a) * this.w.R, this.w.hub - Math.cos(a) * this.w.R, 0);
      G.g.updateMatrixWorld(true);
    }
  }

  board() {
    // The gondola nearest the bottom.
    let best = null, bd = Infinity;
    for (const G of this.gondolas) { const d = G.g.position.y; if (d < bd) { bd = d; best = G; } }
    this.riding = { G: best, t: 0, start: this.angle };
  }

  carry(dt, P) {
    const R = this.riding;
    R.t += dt;
    const at = R.G.g.localToWorld(V(0, -0.92, 0));
    seat(P, at, 0, 0); // (looking out over the park)
    if (this.angle - R.start > Math.PI * 2) { this.riding = null; return true; }
    return false;
  }

  offFrom() { const d = this.door; return { x: d.x + this.O.x, z: d.z + 0.6 + this.O.z, face: 0 }; }
}

// ======================================================================= 🌀 the helter-skelter

export class Helter {
  constructor(parent, h, O) {
    Object.assign(this, { h, O });
    const g = new THREE.Group();
    g.position.set(h.x, 0, h.z);
    parent.add(g);
    this.g = g;
    // The tower: red and white stripes spiralling up, a pointy blue roof, a flag.
    const bands = 9, bh = (h.H + 0.6) / bands; // (bands of red and white, crisp: each its own ring)
    for (let k = 0; k < bands; k++) mesh(new THREE.CylinderGeometry(h.r * (1.08 - 0.08 * (k + 1) / bands), h.r * (1.08 - 0.08 * k / bands), bh, 40), k % 2 ? 0xfffaf0 : 0xd9534f, g, [0, bh * (k + 0.5), 0]).userData.occluder = k === 2;
    mesh(new THREE.ConeGeometry(h.r + 0.5, 2.2, 32), 0x5b86c4, g, [0, h.H + 1.7, 0]);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), 0xe0b04a, g, [0, h.H + 3.1, 0]);
    mesh(new THREE.ConeGeometry(0.2, 0.36, 4), 0xf2c94c, g, [0.16, h.H + 3.35, 0], [0, 0, -Math.PI / 2]);
    // The door at the bottom (looking south, +z) and a little window at the top.
    mesh(new THREE.CircleGeometry(0.5, 20, 0, Math.PI), 0x6a4f3a, g, [0, 0.02, h.r * 1.08 + 0.01]).castShadow = false;
    mesh(new THREE.PlaneGeometry(1.0, 1.0), 0x6a4f3a, g, [0, 0.5, h.r * 1.08 + 0.01]).castShadow = false;
    mesh(new THREE.CircleGeometry(0.45, 20), 0x6a4f3a, g, [0, 1.0, h.r * 1.08 + 0.005]).castShadow = false;
    // The slide: a yellow trough spiralling down round the tower, on poles.
    this.a0 = Math.PI / 2; // (starts at the top on the south side, goes round clockwise seen from above)
    const N = 220, pos = [], idx = [], W = 0.5;
    for (let i = 0; i <= N; i++) {
      const t = i / N, { p, side } = this.at(t);
      for (let j = 0; j <= 6; j++) {
        const w = -1 + (2 * j) / 6, dip = -0.16 * (1 - w * w) + (Math.abs(w) > 0.95 ? 0.12 : 0);
        pos.push(p.x + side.x * w * W, p.y + dip, p.z + side.z * w * W);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 6; j++) { const a = i * 7 + j, b = a + 7; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const slide = mesh(geo, 0xf2c94c, g, [0, 0, 0], [0, 0, 0], { side: THREE.DoubleSide });
    slide.position.set(-h.x, 0, -h.z); // (built in park coordinates)
    for (let k = 0; k < 9; k++) {
      const t = (k + 0.5) / 9, { p, out } = this.at(t);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, p.y, 6), 0xf7f3ea, g, [p.x - h.x + out.x * 0.55, p.y / 2, p.z - h.z + out.z * 0.55]).castShadow = false;
    }
    // The mat at the bottom.
    const end = this.at(1);
    this.end = end;
    mesh(RB(1.2, 0.12, 1.6, 0.05), 0xf2a0c8, g, [end.p.x - h.x + end.tan.x * 1.2, 0.06, end.p.z - h.z + end.tan.z * 1.2], [0, Math.atan2(end.tan.x, end.tan.z), 0]);
  }

  /** On the slide at t (0 top … 1 bottom), park coordinates: the middle of the trough, which way's along and across. */
  at(t) {
    const h = this.h, ang = this.a0 - t * h.turns * Math.PI * 2, y = h.H - t * (h.H - 0.35);
    const p = V(h.x + Math.cos(ang) * h.R, y, h.z + Math.sin(ang) * h.R);
    const out = V(Math.cos(ang), 0, Math.sin(ang)), tan = V(Math.sin(ang), 0, -Math.cos(ang)); // (round, clockwise)
    return { p, out, side: out, tan, ang };
  }

  get door() { return V(this.h.x, 0, this.h.z + this.h.r + 1.0); }
  near(l) { return Math.hypot(l.x - this.door.x, l.z - this.door.z) < 1.8; }
  update() {}

  board() { this.riding = { t: 0, s: 0, phase: 'climb' }; }

  carry(dt, P) {
    const R = this.riding, o = this.O;
    R.t += dt;
    if (R.phase === 'climb') {
      // In at the door, up the stairs inside (hidden in the tower), and out onto the top of the slide.
      const k = Math.min(1, R.t / 1.8), d = this.door, top = this.at(0).p, c = V(this.h.x, 0, this.h.z);
      let at;
      if (k < 0.2) at = d.clone().lerp(c, k / 0.2);
      else if (k < 0.85) at = c.clone().setY(top.y * ((k - 0.2) / 0.65));
      else at = c.clone().setY(top.y).lerp(top, (k - 0.85) / 0.15);
      P.object.visible = k < 0.12 || k > 0.85;
      seat(P, at.add(V(o.x, 0, o.z)), Math.PI, 0);
      if (k >= 1) { R.phase = 'slide'; R.t = 0; P.object.visible = true; }
      return false;
    }
    // Whoosh, round and round and down.
    R.s = Math.min(1, R.s + dt * (0.1 + 0.3 * R.s));
    const { p, tan } = this.at(R.s), slope = Math.atan2(this.h.H - 0.35, this.h.turns * Math.PI * 2 * this.h.R);
    seat(P, V(p.x + o.x, p.y + 0.04, p.z + o.z), Math.atan2(tan.x, tan.z), slope * 0.8);
    if (R.s >= 1) { this.riding = null; return true; }
    return false;
  }

  offFrom() { const e = this.end, o = this.O; return { x: e.p.x + e.tan.x * 2.2 + o.x, z: e.p.z + e.tan.z * 2.2 + o.z, face: Math.atan2(e.tan.x, e.tan.z) }; }
}

// ======================================================================= 🎢 the Wiggly Woof

export class Coaster {
  constructor(parent, plan, O) {
    Object.assign(this, { O });
    this.curve = new THREE.CatmullRomCurve3(plan.track.map(([x, y, z]) => V(x, y, z)), true, 'centripetal');
    const L = (this.L = this.curve.getLength());
    // Rails either side of the middle line, sleepers across, and white posts holding it up.
    const N = Math.round(L / 0.5), left = [], right = [], sleepers = [];
    for (let i = 0; i < N; i++) {
      const u = i / N, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u), side = V(t.z, 0, -t.x).normalize();
      left.push(p.clone().addScaledVector(side, 0.34));
      right.push(p.clone().addScaledVector(side, -0.34));
      sleepers.push({ p, t, side });
    }
    const g = new THREE.Group();
    parent.add(g);
    for (const pts of [left, right]) mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), N * 2, 0.055, 6, true), 0xd9534f, g).castShadow = false;
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.07, 0.14), paint(0xf7f3ea), sleepers.length);
    sleepers.forEach(({ p, t, side }, i) => {
      const up = t.clone().cross(side).normalize().negate();
      _m.makeBasis(side, up, t).setPosition(p.x, p.y - 0.06, p.z);
      sl.setMatrixAt(i, _m);
    });
    sl.computeBoundingSphere();
    sl.receiveShadow = true;
    g.add(sl);
    for (let s = 0; s < L; s += 3.2) {
      const p = this.curve.getPointAt(s / L);
      if (p.y < 0.7) continue;
      mesh(new THREE.CylinderGeometry(0.07, 0.1, p.y - 0.08, 8), 0xf7f3ea, g, [p.x, (p.y - 0.08) / 2, p.z]).castShadow = false;
    }
    // The station: a platform along the south side of the track, with a striped roof.
    const st = plan.station;
    mesh(RB(st.len, 0.28, 2.2, 0.06), 0xd8cfc0, g, [st.x, 0.14, st.z + 1.6]);
    for (const sx of [-st.len / 2 + 0.3, st.len / 2 - 0.3]) for (const sz of [st.z - 0.9, st.z + 2.5]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 8), 0xf7f3ea, g, [st.x + sx, 1.65, sz]);
    for (let k = 0; k < 11; k++) mesh(new THREE.BoxGeometry(st.len / 11, 0.06, 3.8), k % 2 ? 0xfffaf0 : 0x5b86c4, g, [st.x - st.len / 2 + (k + 0.5) * (st.len / 11), 3.35, st.z + 0.8], [0, 0, 0]);
    mesh(RB(3.2, 0.6, 0.1, 0.05), 0xf2c94c, g, [st.x, 3.85, st.z + 2.7]);
    // The train: three little cars, red, yellow and blue, with a safety bar.
    this.cars = [0xd9534f, 0xf2c94c, 0x5b86c4].map((c) => {
      const car = new THREE.Group();
      parent.add(car);
      mesh(RB(0.95, 0.42, 1.25, 0.14), c, car, [0, 0.28, 0]);
      mesh(RB(0.78, 0.1, 1.0, 0.04), 0x2f3a52, car, [0, 0.46, 0]);
      mesh(RB(0.85, 0.36, 0.14, 0.06), c, car, [0, 0.6, -0.5]);
      mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 16, Math.PI), 0xe0b04a, car, [0, 0.42, 0.58], [-0.35, 0, 0]).castShadow = false; // (the safety bar, at the front)
      for (const sx of [-0.4, 0.4]) for (const sz of [-0.42, 0.42]) mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), 0x3a3a3a, car, [sx, 0.06, sz], [0, 0, Math.PI / 2]);
      return car;
    });
    // Where the station is along the track, and the top of the lift hill.
    let s0 = 0, sTop = 0, yTop = -1, bd = Infinity;
    for (let s = 0; s < L; s += 0.25) {
      const p = this.curve.getPointAt(s / L), d = (p.x - st.x) ** 2 + (p.z - st.z) ** 2 + (p.y - 1.2) ** 2;
      if (d < bd) { bd = d; s0 = s; }
    }
    for (let s = 0; s < L * 0.4; s += 0.25) { const y = this.curve.getPointAt(((s0 + s) % L) / L).y; if (y > yTop) { yTop = y; sTop = s; } }
    Object.assign(this, { s0, sTop, yTop, s: 0 });
    this.place(this.s0);
  }

  get door() { return V(this.curve.getPointAt(this.s0 / this.L).x, 0, this.curve.getPointAt(this.s0 / this.L).z + 1.7); }
  near(l) { return Math.abs(l.x - this.door.x) < 2.2 && Math.abs(l.z - this.door.z) < 1.6; }

  /** The train with its front car at s (metres along the track). */
  place(s) {
    this.cars.forEach((car, i) => {
      const u = ((((s - i * 1.45) % this.L) + this.L) % this.L) / this.L, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      car.position.copy(p);
      _q.setFromRotationMatrix(_m.lookAt(V(0, 0, 0), t.clone().negate(), UP));
      car.quaternion.copy(_q);
      car.updateMatrixWorld(true);
    });
  }

  update() {}

  board() { this.riding = { s: 0, v: 0, t: 0, clack: 0 }; }

  /** One lap: up the lift hill at a steady clank, then gravity does the rest; brakes back into the station. */
  carry(dt, P, fx = {}) {
    const R = this.riding, g = 9.8 * 0.72;
    R.t += dt;
    if (R.s < this.sTop) { R.v = 3.0; R.clack -= dt; if (R.clack <= 0) { R.clack = 0.22; fx.clack?.(); } }
    else {
      const y = this.curve.getPointAt(((this.s0 + R.s) % this.L) / this.L).y;
      R.v = Math.max(2.4, Math.sqrt(9 + 2 * g * Math.max(0, this.yTop - y)));
      const left = this.L - R.s;
      if (left < 12) R.v = Math.min(R.v, Math.max(0.6, left * 0.45));
    }
    R.s = Math.min(this.L, R.s + R.v * dt);
    const s = this.s0 + R.s;
    this.place(s);
    const u = (s % this.L) / this.L, t = this.curve.getTangentAt(u), car = this.cars[0];
    seat(P, car.localToWorld(V(0, 0.42, -0.05)), Math.atan2(t.x, t.z), -Math.asin(THREE.MathUtils.clamp(t.y, -1, 1)) * 0.9);
    R.speed = R.v;
    if (R.s >= this.L - 0.01) { this.riding = null; this.place(this.s0); return true; }
    return false;
  }

  offFrom() { const d = this.door; return { x: d.x + this.O.x, z: d.z + 0.3 + this.O.z, face: 0 }; }
}

// ======================================================================= 🚗 the dodgems

/** A dodgem car: a chunky rounded body, a black rubber bumper, a seat back and a pole with a spark at the top. */
export function dodgemModel(color) {
  const g = new THREE.Group();
  mesh(RB(1.25, 0.32, 1.6, 0.16), 0x2b2b2b, g, [0, 0.16, 0]);
  mesh(RB(1.12, 0.42, 1.45, 0.18), color, g, [0, 0.4, 0.02]);
  mesh(RB(0.8, 0.3, 0.16, 0.07), color, g, [0, 0.66, -0.52]);
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), 0xb9bccf, g, [0, 1.2, -0.62]).castShadow = false;
  mesh(new THREE.SphereGeometry(0.06, 8, 6), 0xfff1a0, g, [0, 2.0, -0.62], [0, 0, 0], { emissive: 0xfff1a0 }).castShadow = false;
  return g;
}
