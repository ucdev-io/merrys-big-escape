import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../../render/watercolorMaterial.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';

/*
 * 🏅 The agility ring at the Big Dog Show: through the start flags, then six things in order: a jump, the weave
 * poles, the tunnel, the tyre, the seesaw and one more jump, and out through the finish flags, against the clock.
 * The weaves, the tunnel, the tyre and the seesaw are done for her once she's lined up at their way in (in the
 * right order, on a run); the jumps are real jumps: run through without jumping and the pole comes down (that's
 * all: "Whoops!"). Skip one and the finish won't count: the arrow and the scent trail show what's next.
 * Off a run, everything's there to play on.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, r);
const SEESAW_TILT = Math.atan(0.45 / 2.5);

// The course, in the trip's own coordinates (see build.js). dir: the way through.
export const COURSE = {
  start: { x: 6, z: 7.5, dir: [1, 0], half: 1.6 },
  finish: { x: 6.5, z: -7.5, dir: [-1, 0], half: 1.6 },
  obstacles: [
    { id: 'jump1', kind: 'jump', name: 'the first jump', emoji: '🚧', x: 9.5, z: 7.5, dir: [1, 0], half: 0.8, bar: 0.36 },
    { id: 'weave', kind: 'weave', name: 'the weave poles', emoji: '〰️', x: 12.5, z: 7.5, dir: [1, 0], n: 7, gap: 1.1 },
    { id: 'tunnel', kind: 'tunnel', name: 'the tunnel', emoji: '🌀', pts: [[21.2, 7.5], [22.8, 7.3], [24.0, 6.2], [24.5, 4.4], [24.4, 2.2]] },
    { id: 'tyre', kind: 'tyre', name: 'the tyre', emoji: '⭕', x: 24.2, z: -3.5, dir: [0, -1] },
    { id: 'seesaw', kind: 'seesaw', name: 'the seesaw', emoji: '⚖️', x: 18, z: -7.5, dir: [-1, 0], half: 2.5, pivot: 0.45 },
    { id: 'jump2', kind: 'jump', name: 'the last jump', emoji: '🚧', x: 12, z: -7.5, dir: [-1, 0], half: 0.8, bar: 0.36 },
  ],
};

function add(parent, geo, color, pos, rot = [0, 0, 0], opts) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A group stood at (x, z) and turned so its +z runs along `dir`. */
function placed(parent, x, z, dir) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = Math.atan2(dir[0], dir[1]);
  parent.add(grp);
  return grp;
}

/**
 * The course's shapes: what never moves into `g` (merged with the rest of the showground), what does (jump
 * poles, the tunnel's hoops, the seesaw's plank, the arrow) into `dyn`. Colliders through C. Returns the moving bits.
 */
export function buildCourse(g, dyn, C) {
  const out = { bars: {}, ribs: [], plank: null, arrow: null, tunnelCurve: null };
  // Start and finish: two tall poles with flags (green to start, chequered to finish).
  for (const [line, col] of [[COURSE.start, 0x6f9a52], [COURSE.finish, 0x2b2b38]]) {
    const grp = placed(g, line.x, line.z, line.dir);
    for (const s of [-1, 1]) {
      add(grp, new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), 0xfbf7ee, [s * line.half, 0.9, 0]);
      add(grp, new THREE.BoxGeometry(0.5, 0.34, 0.02), col, [s * line.half + 0.26 * s, 1.6, 0], [0, 0, 0], { side: THREE.DoubleSide });
      if (col !== 0x6f9a52) add(grp, new THREE.BoxGeometry(0.25, 0.17, 0.025), 0xfbf7ee, [s * line.half + 0.385 * s, 1.685, 0]);
      const w = grp.localToWorld(V(s * line.half, 0, 0));
      C.circle(w.x - g.position.x, w.z - g.position.z, 0.08);
    }
  }
  for (const o of COURSE.obstacles) {
    if (o.kind === 'jump') {
      const grp = placed(g, o.x, o.z, o.dir);
      for (const s of [-1, 1]) {
        const wing = new THREE.Group(); wing.position.set(s * (o.half + 0.12), 0, 0); grp.add(wing);
        add(wing, new THREE.BoxGeometry(0.06, 0.9, 0.06), 0xfbf7ee, [0, 0.45, 0]);
        add(wing, new THREE.BoxGeometry(0.06, 0.9, 0.06), 0xfbf7ee, [s * 0.4, 0.45, 0]);
        for (let k = 0; k < 3; k++) add(wing, new THREE.BoxGeometry(0.4, 0.12, 0.03), k % 2 ? 0xfbf7ee : 0x5b86c4, [s * 0.2, 0.25 + k * 0.22, 0]);
        const w = grp.localToWorld(V(s * (o.half + 0.3), 0, 0));
        C.circle(w.x, w.z, 0.28, 0.9);
      }
      // The pole: red and white, resting in its cups (it can come down).
      const bar = new THREE.Group(), barAt = placed(dyn, o.x, o.z, o.dir);
      bar.position.set(0, o.bar, 0);
      barAt.add(bar);
      for (let k = 0; k < 6; k++) add(bar, new THREE.CylinderGeometry(0.028, 0.028, (o.half * 2) / 6, 8), k % 2 ? 0xfbf7ee : 0xd9534f, [-o.half + (k + 0.5) * (o.half * 2) / 6, 0, 0], [0, 0, Math.PI / 2]);
      out.bars[o.id] = { bar, rest: o.bar, fall: 0 };
    } else if (o.kind === 'weave') {
      const grp = placed(g, o.x, o.z, [0, 1]);
      const len = (o.n - 1) * o.gap;
      add(grp, new THREE.BoxGeometry(0.12, 0.04, len + 0.4), 0xfbf7ee, [0, 0.02, len / 2], [0, 0, 0]);
      for (let i = 0; i < o.n; i++) {
        add(grp, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), i % 2 ? 0xf2c94c : 0x5b86c4, [0, 0.5, i * o.gap]);
        add(grp, new THREE.SphereGeometry(0.035, 8, 6), 0xfbf7ee, [0, 1.0, i * o.gap]);
      }
      grp.rotation.y = Math.atan2(o.dir[0], o.dir[1]); // (+z of the group along dir)
      for (let i = 0; i < o.n; i++) C.circle(o.x + o.dir[0] * i * o.gap, o.z + o.dir[1] * i * o.gap, 0.05);
    } else if (o.kind === 'tunnel') {
      const curve = new THREE.CatmullRomCurve3(o.pts.map(([x, z]) => V(x, 0.48, z)));
      out.tunnelCurve = curve;
      const tube = add(g, new THREE.TubeGeometry(curve, 40, 0.5, 14, false), 0x5b86c4, [0, 0, 0], [0, 0, 0], { side: THREE.DoubleSide });
      tube.castShadow = true;
      // Hoops round it (they bulge as she goes through), and darker rims at each end.
      const len = curve.getLength(), n = Math.round(len / 0.45);
      for (let i = 0; i <= n; i++) {
        const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
        const rib = add(dyn, new THREE.TorusGeometry(0.52, 0.035, 5, 18), i === 0 || i === n ? 0x2f3a52 : 0x8fb0d8, [p.x, p.y, p.z]);
        rib.lookAt(rib.position.clone().add(t));
        rib.castShadow = false;
        out.ribs.push({ rib, s: u * len });
      }
      // Solid along its length (not at the ends: that's the way in and out).
      for (let i = 2; i < n - 1; i++) { const p = curve.getPointAt(i / n); C.circle(p.x, p.z, 0.5, 1.0); }
    } else if (o.kind === 'tyre') {
      const grp = placed(g, o.x, o.z, o.dir);
      for (const s of [-1, 1]) add(grp, new THREE.CylinderGeometry(0.06, 0.07, 1.75, 8), 0xfbf7ee, [s * 1.0, 0.87, 0]);
      add(grp, new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), 0xfbf7ee, [0, 1.75, 0], [0, 0, Math.PI / 2]);
      add(grp, new THREE.TorusGeometry(0.42, 0.11, 10, 26), 0x2b2b38, [0, 0.8, 0]);
      add(grp, new THREE.TorusGeometry(0.42, 0.03, 4, 26), 0xd9534f, [0, 0.8, 0.09]);
      for (const [x0, y0, x1, y1] of [[0, 1.22, 0, 1.75], [-0.42, 0.8, -1.0, 0.8], [0.42, 0.8, 1.0, 0.8]]) {
        const len = Math.hypot(x1 - x0, y1 - y0);
        add(grp, new THREE.CylinderGeometry(0.012, 0.012, len, 4), 0x9aa0a8, [(x0 + x1) / 2, (y0 + y1) / 2, 0], [0, 0, Math.atan2(x1 - x0, y1 - y0) * -1]);
      }
      const perp = [-o.dir[1], o.dir[0]];
      for (const s of [-1, 1]) C.circle(o.x + perp[0] * s * 1.0, o.z + perp[1] * s * 1.0, 0.1);
      // Under the tyre: in the way (through it, not under it).
      const ex = Math.abs(perp[0]) * 0.55 + Math.abs(o.dir[0]) * 0.12, ez = Math.abs(perp[1]) * 0.55 + Math.abs(o.dir[1]) * 0.12;
      C.box(o.x - ex, o.z - ez, o.x + ex, o.z + ez, 0.36, false);
    } else if (o.kind === 'seesaw') {
      const grp = placed(g, o.x, o.z, [0, 1]);
      add(grp, new THREE.ConeGeometry(0.32, o.pivot, 3), 0x2f3a52, [0, o.pivot / 2, 0], [0, Math.PI / 2, 0]);
      const pivot = new THREE.Group();
      pivot.position.set(o.x, o.pivot, o.z);
      dyn.add(pivot);
      const plank = new THREE.Group();
      pivot.add(plank);
      add(plank, RB(o.half * 2, 0.06, 0.42, 0.02), 0xf2c94c, [0, 0.03, 0]);
      for (const s of [-1, 1]) add(plank, RB(0.9, 0.065, 0.43, 0.02), 0x5b86c4, [s * (o.half - 0.45), 0.031, 0]); // (the contact zones at the ends)
      plank.rotation.z = -SEESAW_TILT; // (the east end down, ready)
      out.plank = plank;
      C.box(o.x - o.half, o.z - 0.22, o.x + o.half, o.z + 0.22, 0.3, false);
    }
  }
  // The arrow: points down at whatever's next (bobbing, turning).
  const arrow = new THREE.Group();
  add(arrow, new THREE.ConeGeometry(0.22, 0.45, 12), 0xf2c94c, [0, 0, 0], [Math.PI, 0, 0], { emissive: 0x6a5420 }).castShadow = false;
  add(arrow, new THREE.CylinderGeometry(0.08, 0.08, 0.35, 10), 0xf2c94c, [0, 0.38, 0], [0, 0, 0], { emissive: 0x6a5420 }).castShadow = false;
  dyn.add(arrow);
  out.arrow = arrow;
  return out;
}

/** Did she go across this line (centre x, z; dir; half its width) since `a`, to `b`? (all in the trip's coordinates) */
function crossed(line, a, b, pad = 0) {
  const d = line.dir, side = (p) => (p.x - line.x) * d[0] + (p.z - line.z) * d[1];
  if (!(side(a) < 0 && side(b) >= 0)) return false;
  const lat = Math.abs(-(b.x - line.x) * d[1] + (b.z - line.z) * d[0]);
  return lat < line.half + pad;
}

const fmt = (ms) => { const s = ms / 1000; return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)} s`; };
export { fmt as agilityTime };

/**
 * A run round the course. ctx: { O (the trip's middle, in the world), player, hud, actions, onStart(), onFinish({ ms, faults }) }.
 */
export class Agility {
  constructor(course, ctx) {
    Object.assign(this, ctx, { course });
    this.run = null;       // { t, next, faults }
    this.move = null;      // being carried through something (weaves, tunnel, tyre, seesaw)
    this.prev = null;      // where she was last frame (trip coordinates)
    this.tau = -1;         // the seesaw: -1 east end down, +1 west end down
    this.time = 0;
    this.saidT = 0;
  }

  local(p = this.player.pos) { return { x: p.x - this.O.x, z: p.z - this.O.z }; }
  world(x, z, y = 0) { return V(x + this.O.x, y, z + this.O.z); }

  /** Is she somewhere on the course (the ring's rope, give or take)? */
  inRing(l, a, pad = 0) { return l.x > a.x0 - pad && l.x < a.x1 + pad && l.z > a.z0 - pad && l.z < a.z1 + pad; }

  /** The thing she does next on a run (or the start, off one): { x, z, y } in the trip's coordinates. */
  target() {
    if (!this.run) return { x: COURSE.start.x, z: COURSE.start.z };
    const o = COURSE.obstacles[this.run.next];
    if (!o) return { x: COURSE.finish.x, z: COURSE.finish.z };
    const e = this.entry(o);
    return { x: e.x, z: e.z };
  }

  /** Where an obstacle's way in is (a jump: its middle), and which way to be going. */
  entry(o) {
    if (o.kind === 'jump') return { x: o.x, z: o.z, dir: o.dir, r: 0 };
    if (o.kind === 'weave') return { x: o.x - o.dir[0] * 0.95, z: o.z - o.dir[1] * 0.95, dir: o.dir, r: 1.2 };
    if (o.kind === 'tunnel') { const [a, b] = o.pts, l = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; return { x: a[0] - d[0] * 0.5, z: a[1] - d[1] * 0.5, dir: d, r: 1.1 }; }
    if (o.kind === 'tyre') return { x: o.x - o.dir[0] * 1.5, z: o.z - o.dir[1] * 1.5, dir: o.dir, r: 1.3 };
    return { x: o.x - o.dir[0] * (o.half + 0.6), z: o.z - o.dir[1] * (o.half + 0.6), dir: o.dir, r: 1.1 }; // (the seesaw: its far end)
  }

  /** What to say at the bottom (or null). */
  hint() {
    if (this.run) {
      const o = COURSE.obstacles[this.run.next];
      return `⏱️ ${fmt(this.run.t * 1000)} · ${o ? `Next: ${o.emoji} ${o.name}` : '🏁 To the finish flags!'}`;
    }
    const l = this.local(), s = COURSE.start;
    if (!this.move && Math.hypot(l.x - s.x, l.z - s.z) < 4.5) return '🏅 Agility! Run through the green flags to start the clock';
    return null;
  }

  /** Where the scent trail leads (in the world), when she's doing agility. */
  goal() { const t = this.target(); return this.run || this.inRing(this.local(), this.ring, 1) ? this.world(t.x, t.z) : null; }

  start() {
    this.run = { t: 0, next: 0, faults: 0 };
    for (const b of Object.values(this.course.bars)) { b.fall = 0; b.bar.position.set(0, b.rest, 0); b.bar.rotation.set(0, 0, 0); }
    sfx.whistle?.();
    buzz(20);
    this.hud.float('GO! 🏁', this.actions.anchor(), 'xp');
    this.onStart?.();
  }

  stop(why) {
    this.run = null;
    if (why) this.hud.float(why, this.actions.anchor());
  }

  /** Done one (on a run, the right one next): tick it off. */
  passed(o) {
    if (!this.run || COURSE.obstacles[this.run.next] !== o) return;
    this.run.next++;
    sfx.pop?.();
    const n = this.run.next, all = COURSE.obstacles.length;
    if (n < all) this.hud.float(`✓ ${n}/${all}`, this.actions.anchor());
    else this.hud.float('🏁 Now the finish!', this.actions.anchor());
  }

  // ---------- being carried through ----------

  /** Off along a path (trip coordinates [x, y, z]) at `speed`; opts.hide: [s0, s1] metres in which she's out of sight. */
  carry(o, pts, speed, opts = {}) {
    const P = this.player, ps = pts.map(([x, y, z]) => V(x, y, z)), cum = [0];
    for (let i = 1; i < ps.length; i++) cum.push(cum[i - 1] + ps[i].distanceTo(ps[i - 1]));
    this.move = { o, ps, cum, len: cum[cum.length - 1], s: 0, speed, ...opts };
    Object.assign(P, { frozen: true, lockY: true });
    P.vy = 0;
    P.dog.stopEmote();
  }

  stepCarry(dt) {
    const M = this.move, P = this.player;
    M.s = Math.min(M.len, M.s + M.speed * dt);
    let i = 1;
    while (i < M.cum.length - 1 && M.cum[i] < M.s) i++;
    const a = M.ps[i - 1], b = M.ps[i], k = (M.s - M.cum[i - 1]) / Math.max(1e-6, M.cum[i] - M.cum[i - 1]);
    const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    P.pos.set(x + this.O.x, y, z + this.O.z);
    P.heading = Math.atan2(dx, dz);
    P.object.rotation.y = P.heading;
    P.vel.set((dx / l) * M.speed, (dz / l) * M.speed);
    P.grounded = !M.air;
    if (M.hide) P.object.visible = !(M.s > M.hide[0] && M.s < M.hide[1]);
    M.onStep?.(M.s, M);
    if (M.s >= M.len) this.endCarry();
  }

  endCarry() {
    const M = this.move, P = this.player;
    this.move = null;
    Object.assign(P, { frozen: false, lockY: false });
    P.pos.y = 0; P.vy = 0; P.grounded = true;
    P.object.visible = true;
    P.dog.body.rotation.x = 0;
    if (M.air) P.dog.land?.(0.6);
    const l = P.vel.length();
    if (l > 3.4) P.vel.multiplyScalar(3.4 / l); // (out the other end, still trotting on)
    for (const r of this.course.ribs) r.rib.scale.setScalar(1);
    this.passed(M.o);
  }

  /** Lined up at the way in to one of the carried-through things: go. */
  tryEnter(l, P) {
    const sp = Math.hypot(P.vel.x, P.vel.y), hx = Math.sin(P.heading), hz = Math.cos(P.heading);
    for (const o of COURSE.obstacles) {
      if (o.kind === 'jump') continue;
      const e = this.entry(o);
      if (Math.hypot(l.x - e.x, l.z - e.z) > e.r) continue;
      if (hx * e.dir[0] + hz * e.dir[1] < 0.3 || sp < 0.5) continue;
      if (this.run && COURSE.obstacles[this.run.next] !== o) {
        if (this.time - this.saidT > 2.5) { this.saidT = this.time; const nx = COURSE.obstacles[this.run.next]; this.hud.float(`Not yet! First: ${nx ? nx.name : 'the finish'}`, this.actions.anchor()); }
        continue;
      }
      this.enter(o, l);
      return true;
    }
    return false;
  }

  enter(o, l) {
    if (o.kind === 'weave') {
      const pts = [[l.x, 0, l.z]], A = 0.5, x0 = o.x, len = (o.n - 1) * o.gap;
      for (let u = -0.45; u <= len + 0.55; u += 0.1) {
        const k = Math.min(1, (u + 0.45) / 0.6); // (eases in from straight)
        pts.push([x0 + o.dir[0] * u - o.dir[1] * A * Math.cos((Math.PI * u) / o.gap) * k, 0, o.z + o.dir[1] * u + o.dir[0] * A * Math.cos((Math.PI * u) / o.gap) * k]);
      }
      pts.push([x0 + o.dir[0] * (len + 1.1), 0, o.z + o.dir[1] * (len + 1.1)]);
      this.carry(o, pts, 4.2);
      this.hud.float('Weave, weave, weave!', this.actions.anchor());
    } else if (o.kind === 'tunnel') {
      const c = this.course.tunnelCurve, len = c.getLength(), pts = [[l.x, 0, l.z]];
      for (let i = 0; i <= 30; i++) { const p = c.getPointAt(i / 30); pts.push([p.x, 0, p.z]); }
      const end = c.getPointAt(1), t = c.getTangentAt(1);
      pts.push([end.x + t.x * 0.8, 0, end.z + t.z * 0.8]);
      const lead = Math.hypot(pts[1][0] - l.x, pts[1][2] - l.z);
      this.carry(o, pts, 4.6, { hide: [lead + 0.35, lead + len - 0.3], onStep: (s) => { for (const r of this.course.ribs) r.rib.scale.setScalar(1 + 0.2 * Math.exp(-(((r.s + lead - s) / 0.55) ** 2))); } });
      sfx.tunnel?.();
    } else if (o.kind === 'tyre') {
      // A leap: from where she is, through the very middle of the tyre, to a landing beyond it.
      const d = o.dir, xz = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; xz.push([l.x + (o.x - l.x) * t, l.z + (o.z - l.z) * t]); }
      for (let i = 1; i <= 8; i++) { const t = i / 8; xz.push([o.x + d[0] * 1.7 * t, o.z + d[1] * 1.7 * t]); }
      const cum = [0];
      for (let i = 1; i < xz.length; i++) cum.push(cum[i - 1] + Math.hypot(xz[i][0] - xz[i - 1][0], xz[i][1] - xz[i - 1][1]));
      const L = cum[cum.length - 1], mid = cum[8] / L;
      const pts = xz.map(([x, z], i) => { const t = cum[i] / L, k = t < mid ? t / mid : 1 + (t - mid) / (1 - mid); return [x, 0.52 * Math.sin((k * Math.PI) / 2), z]; });
      this.carry(o, pts, 5.2, { air: true });
      this.player.dog.jump?.();
      sfx.boing?.();
      this.hud.float('Hup! ⭕', this.actions.anchor());
    } else if (o.kind === 'seesaw') {
      const d = o.dir, up = o.half - 0.1, tip = { x: o.x + d[0] * 0.1, z: o.z + d[1] * 0.1 };
      const start = { x: o.x - d[0] * up, z: o.z - d[1] * up }, end = { x: o.x + d[0] * (o.half + 0.5), z: o.z + d[1] * (o.half + 0.5) };
      const y = (x, z) => this.plankY(o, x, z);
      const pts = [[l.x, 0, l.z], [start.x, y(start.x, start.z), start.z]];
      for (let i = 1; i <= 8; i++) { const t = i / 8, x = start.x + (tip.x - start.x) * t, z = start.z + (tip.z - start.z) * t; pts.push([x, 0, z]); }
      this.carry(o, pts, 2.4, {
        onStep: () => { const p = this.local(); this.player.pos.y = this.plankY(o, p.x, p.z) + 0.05; this.player.dog.body.rotation.x = SEESAW_TILT * this.tau * 0.9; },
      });
      this.seesaw = { o, phase: 'up', end, tip };
    }
  }

  /** How high the seesaw's plank is here (the trip's coordinates). */
  plankY(o, x, z) {
    const u = (x - o.x) * -o.dir[0] + (z - o.z) * -o.dir[1]; // (+ toward the way-in end, which is down to start with: tau -1)
    return Math.max(0, o.pivot + u * Math.tan(SEESAW_TILT) * this.tau);
  }

  // ---------- every frame ----------

  update(dt) {
    this.time += dt;
    const P = this.player, l = this.local();
    if (this.run) this.run.t += dt;
    // The seesaw: up to the middle, it tips (gently), and down the other side.
    const S = this.seesaw;
    if (S && !this.move) {
      if (S.phase === 'up') { S.phase = 'tip'; S.t = 0; Object.assign(P, { frozen: true, lockY: true }); sfx.clack?.(); }
      if (S.phase === 'tip') {
        S.t += dt;
        this.tau = Math.min(1, -1 + (S.t / 0.4) * 2);
        P.pos.y = this.plankY(S.o, l.x, l.z) + 0.05;
        P.dog.body.rotation.x = SEESAW_TILT * this.tau * 0.9;
        P.vel.set(0, 0);
        if (S.t >= 0.4) {
          S.phase = 'down';
          sfx.bonk?.();
          const o = S.o, pts = [[l.x, P.pos.y, l.z]];
          for (let i = 1; i <= 10; i++) { const t = i / 10, x = S.tip.x + (S.end.x - S.tip.x) * t, z = S.tip.z + (S.end.z - S.tip.z) * t; pts.push([x, 0, z]); }
          this.carry(o, pts, 2.6, { onStep: () => { const p = this.local(); P.pos.y = this.plankY(o, p.x, p.z) + 0.05; P.dog.body.rotation.x = SEESAW_TILT * 0.9; } });
        }
      } else if (S.phase === 'down') this.seesaw = null;
    } else if (!S && !this.move && this.tau > -1) this.tau = Math.max(-1, this.tau - dt * 1.2); // (tips back once she's off)
    if (this.course.plank) this.course.plank.rotation.z = SEESAW_TILT * this.tau;
    if (this.move) {
      // (the seesaw's way up isn't the end of it: hold the passing until she's down the other side)
      const M = this.move;
      if (S && S.phase === 'up' && M.s + M.speed * dt >= M.len) { M.s = M.len; this.move = null; Object.assign(P, { frozen: true, lockY: true }); }
      else this.stepCarry(dt);
    } else if (!P.frozen) {
      // Across a line: the start (a run begins), the jumps (over, or the pole comes down), the finish.
      if (this.prev) {
        if (crossed(COURSE.start, this.prev, l)) this.start();
        for (const o of COURSE.obstacles) if (o.kind === 'jump' && crossed(o, this.prev, l, 0.2)) this.jumped(o);
        if (this.run && crossed(COURSE.finish, this.prev, l)) {
          if (this.run.next >= COURSE.obstacles.length) { const r = this.run; this.run = null; sfx.whistle?.(); this.onFinish?.({ ms: Math.round(r.t * 1000), faults: r.faults }); }
          else if (this.time - this.saidT > 1.5) { this.saidT = this.time; this.hud.float(`Oops! You missed ${COURSE.obstacles[this.run.next].name}! 🐾`, this.actions.anchor()); }
        }
      }
      if (!this.move) this.tryEnter(l, P);
      // Off the course on a run (or taking ages): that run's over, no fuss.
      if (this.run && (!this.inRing(l, this.ring, 2.5) || this.run.t > 240)) this.stop('Run over! Start again at the green flags 🐾');
    }
    this.prev = l;
    // Poles that came down roll off their cups; the arrow bobs over what's next.
    for (const b of Object.values(this.course.bars)) {
      if (b.fall > 0 && b.fall < 1) {
        b.fall = Math.min(1, b.fall + dt * 2.8);
        b.bar.position.y = b.rest * (1 - b.fall * b.fall) + 0.03;
        b.bar.position.z = 0.25 * b.fall;
        b.bar.rotation.y = 0.35 * b.fall;
      }
    }
    const a = this.course.arrow, t = this.target(), near = this.run || this.inRing(l, this.ring, 6);
    a.visible = !!near;
    if (near) { a.position.set(t.x, 1.7 + Math.sin(this.time * 4) * 0.15, t.z); a.rotation.y += dt * 2; }
  }

  /** Over a jump (or through it: the pole comes down, that's all). */
  jumped(o) {
    const P = this.player, b = this.course.bars[o.id];
    if (P.pos.y >= o.bar - 0.14 && b.fall === 0) {
      this.hud.float(['Hup!', 'Over!', 'Boing!'][Math.floor(Math.random() * 3)], this.actions.anchor());
    } else if (b.fall === 0) {
      b.fall = 0.01;
      sfx.bonk?.();
      this.hud.float('Whoops! A pole down 🙈', this.actions.anchor());
      if (this.run) this.run.faults++;
    }
    this.passed(o);
    if (!this.run) setTimeout(() => { if (!this.run) { b.fall = 0; b.bar.position.set(0, b.rest, 0); b.bar.rotation.set(0, 0, 0); } }, 2500);
  }

  /** Let her go (leaving the trip mid-tunnel, say). */
  dispose() {
    const P = this.player;
    this.move = null;
    this.seesaw = null;
    Object.assign(P, { frozen: false, lockY: false });
    P.object.visible = true;
    P.dog.body.rotation.x = 0;
  }
}
