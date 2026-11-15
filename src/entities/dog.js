import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { PALETTE } from '../render/palette.js';
import { fbm3 } from '../core/rng.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function mesh(geo, color, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, paint(color));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.rotation.set(...rot);
  parent.add(g);
  return g;
}

// A tube whose radius tapers from r0 to r1 along its length.
function taperedTube(points, r0, r1, segs = 24, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs);
    const r = lerp(r0, r1, i / segs);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth lofted body: a spline through stations [z, top, bottom, halfWidth] with
 * egg-shaped cross sections (narrower at the bottom, like a dog's keel).
 */
function loft(stations, rings = 56, radial = 40, keel = 0.25) {
  const A = new THREE.CatmullRomCurve3(stations.map(([z, t, b]) => new THREE.Vector3(z, t, b)));
  const W = new THREE.CatmullRomCurve3(stations.map(([z, , , w]) => new THREE.Vector3(z, w, 0)));
  const pos = [], idx = [];
  const a = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    A.getPoint(t, a); W.getPoint(t, w);
    const cy = (a.y + a.z) / 2, h = Math.max(1e-4, (a.y - a.z) / 2), hw = Math.max(1e-4, w.y);
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * TAU;
      const sn = Math.sin(th);
      pos.push(Math.cos(th) * hw * (1 - keel * Math.max(0, -sn)), cy + sn * h, a.x);
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a0 = i * radial + j, a1 = i * radial + ((j + 1) % radial), b0 = a0 + radial, b1 = a1 + radial;
    idx.push(a0, a1, b0, a1, b1, b0);
  }
  // Rounded end caps.
  for (const [ring, dir] of [[0, -1], [rings - 1, 1]]) {
    let cy = 0, cz = 0;
    for (let j = 0; j < radial; j++) { cy += pos[(ring * radial + j) * 3 + 1]; cz += pos[(ring * radial + j) * 3 + 2]; }
    cy /= radial; cz /= radial;
    const pole = pos.length / 3;
    pos.push(0, cy, cz + dir * 0.008);
    for (let j = 0; j < radial; j++) {
      const v0 = ring * radial + j, v1 = ring * radial + ((j + 1) % radial);
      if (dir < 0) idx.push(pole, v1, v0); else idx.push(pole, v0, v1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---- Merry's coat: white lower half, tan upper half with dark brown brindle stripes & mottles.
const COAT = {
  white: new THREE.Color(0xf6f1e8),
  whiteShade: new THREE.Color(0xe6dccd),
  tan: new THREE.Color(0xc98f58),
  tanLight: new THREE.Color(0xdcac77),
  brown: new THREE.Color(0x553525),
  brownMid: new THREE.Color(0x85563a),
};
const ss = THREE.MathUtils.smoothstep;
function brindle(p, out) {
  const warp = fbm3(p.x * 9, p.y * 9, p.z * 9, 3);
  // Stripes run down the sides (across the body's length), warped so they wiggle like real brindle.
  const s1 = Math.sin(p.z * 62 + p.y * 18 + warp * 9);
  const s2 = Math.sin(p.z * 31 - p.y * 11 + warp * 5 + 1.3);
  const stripe = ss(s1, 0.25, 0.75) * 0.8 + ss(s2, 0.55, 0.9) * 0.35;
  const mottle = fbm3(p.x * 16 + 3, p.y * 16, p.z * 16, 3);
  out.copy(COAT.tan).lerp(COAT.tanLight, ss(0.45 - mottle, 0, 0.15));
  out.lerp(COAT.brownMid, Math.min(1, stripe));
  out.lerp(COAT.brown, Math.min(1, ss(mottle, 0.58, 0.72) * 0.75 + Math.max(0, stripe - 0.7) * 0.6));
  return out;
}

// Each pattern returns true where the coat is brindle, false where it's white.
// `l` is the vertex in the part's own space, `d` in whole-dog rest space.
const PATTERNS = {
  body: (l, d) => d.y > 0.455 + (fbm3(d.x * 14, d.y * 6, d.z * 14, 3) - 0.5) * 0.07,
  // Neck: tan on top, white throat (front of the neck = local +z).
  neck: (l, d) => l.z < -0.008 + (fbm3(d.x * 20, d.y * 20, d.z * 20, 2) - 0.5) * 0.03,
  // Head: white jaw & muzzle, and a white blaze down the face.
  head: (l) => {
    const n = (fbm3(l.x * 40, l.y * 40, l.z * 40, 2) - 0.5) * 0.012;
    if (l.y < -0.012 + n + Math.max(0, l.z - 0.06) * 0.2) return false;
    const blaze = 0.007 + Math.max(0, l.z + 0.01) * 0.09;
    if (Math.abs(l.x) < blaze + n && l.y > 0 && l.z > -0.035) return false;
    return true;
  },
  ear: () => true,
  tail: (l, d, t) => t < 0.72,
};

function paintCoat(m, kind, ref) {
  const g = m.geometry;
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const toRef = new THREE.Matrix4().copy(ref.matrixWorld).invert().multiply(m.matrixWorld);
  const v = new THREE.Vector3(), d = new THREE.Vector3(), l = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    d.copy(v).applyMatrix4(m.matrixWorld);
    l.copy(v).applyMatrix4(toRef);
    if (PATTERNS[kind](l, d, i / p.count)) brindle(d, c);
    else c.copy(COAT.white).lerp(COAT.whiteShade, fbm3(d.x * 25, d.y * 25, d.z * 25, 2) * 0.6);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

const SPHERE = new THREE.SphereGeometry(1, 32, 22);

/**
 * Merry the whippet. Built from smooth lofted shapes and animated procedurally.
 * Faces +Z. Root sits on the ground.
 */
export class Dog {
  constructor() {
    this.root = new THREE.Group();
    this.body = group(this.root, [0, 0.48, 0]);
    const B = this.body;
    const coatParts = [];
    const coat = (geo, kind, parent, ref, pos, rot, scale) => {
      const m = new THREE.Mesh(geo.clone(), paint(0xffffff, { vertexColors: true }));
      if (pos) m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      if (scale) m.scale.set(...scale);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      coatParts.push([m, kind, ref]);
      return m;
    };
    const white = COAT.white.getHex();

    // Torso: one smooth shape — deep chest, dramatic tuck-up, arched loin, sloping croup.
    //  z       top     bottom  halfWidth
    this.chest = coat(loft([
      [-0.39, 0.005, -0.03, 0.02],
      [-0.36, 0.045, -0.045, 0.06],
      [-0.29, 0.075, -0.05, 0.077],
      [-0.2, 0.095, -0.03, 0.066],
      [-0.1, 0.1, 0.005, 0.055],
      [0.0, 0.09, -0.045, 0.063],
      [0.09, 0.08, -0.14, 0.077],
      [0.17, 0.075, -0.175, 0.08],
      [0.25, 0.06, -0.15, 0.07],
      [0.3, 0.02, -0.08, 0.045],
      [0.315, -0.01, -0.04, 0.02],
    ]), 'body', B, B);

    // Neck: long, arched and tapering into the head.
    this.neck = group(B, [0, 0.03, 0.24], [0.85, 0, 0]);
    coat(taperedTube([[0, -0.03, -0.01], [0, 0.06, 0.012], [0, 0.13, 0.008], [0, 0.18, -0.005]], 0.06, 0.036, 20, 24), 'neck', this.neck, this.neck);
    this.head = group(this.neck, [0, 0.175, -0.005], [-0.6, 0, 0]);
    const H = this.head;
    // Head: a long, narrow wedge from skull to nose.
    coat(loft([
      [-0.065, 0.02, -0.01, 0.018],
      [-0.045, 0.05, -0.03, 0.04],
      [-0.01, 0.06, -0.04, 0.048],
      [0.03, 0.05, -0.037, 0.042],
      [0.07, 0.03, -0.032, 0.029],
      [0.11, 0.021, -0.027, 0.022],
      [0.145, 0.016, -0.022, 0.017],
      [0.165, 0.006, -0.012, 0.009],
    ], 40, 32, 0.15), 'head', H, H);
    mesh(SPHERE, PALETTE.nose, H, [0, 0.0, 0.166], [0, 0, 0], [0.016, 0.014, 0.012]);
    this.eyes = [-1, 1].map((s) => {
      const e = mesh(SPHERE, 0x241a17, H, [s * 0.036, 0.026, 0.035], [0, s * 0.35, 0], [0.011, 0.012, 0.009]);
      mesh(SPHERE, 0xffffff, e, [s * 0.25, 0.35, 0.6], [0, 0, 0], [0.3, 0.3, 0.3]);
      return e;
    });
    this.brows = [-1, 1].map((s) => mesh(SPHERE, COAT.brown.getHex(), H, [s * 0.034, 0.044, 0.035], [0, 0, s * -0.3], [0.012, 0.0035, 0.006]));
    // Rose ears, folded back along the skull.
    this.ears = [-1, 1].map((s) => {
      const g = group(H, [s * 0.03, 0.04, -0.035], [-0.5, s * 0.2, s * -0.7]);
      coat(SPHERE, 'ear', g, g, [s * 0.005, 0.006, -0.026], [0.35, 0, 0], [0.009, 0.02, 0.036]);
      return g;
    });
    this.tongue = mesh(SPHERE, 0xe88a8f, H, [0, -0.032, 0.11], [0.3, 0, 0], [0.016, 0.005, 0.028]);
    this.tongue.visible = false;

    // Tail: long, thin, low with a little curl and a white tip.
    this.tail = group(B, [0, 0.03, -0.37]);
    coat(taperedTube([[0, 0, 0], [0, -0.06, -0.07], [0, -0.16, -0.11], [0, -0.25, -0.1], [0, -0.29, -0.05]], 0.017, 0.005), 'tail', this.tail, this.tail);

    // Legs: white socks all the way up; upper legs pick up the body markings.
    this.legs = [];
    const mkFront = (side) => {
      const hip = group(B, [side * 0.052, -0.03, 0.18]);
      // Shoulder/upper arm: starts inside the chest so there's no visible joint.
      coat(taperedTube([[0, 0.02, 0.01], [0, -0.1, -0.005], [0, -0.215, 0]], 0.042, 0.022, 16, 16), 'body', hip, hip);
      const knee = group(hip, [0, -0.215, 0]);
      mesh(taperedTube([[0, 0.01, 0], [0, -0.1, 0.004], [0, -0.2, 0.008]], 0.021, 0.016, 12, 12), white, knee);
      const ankle = group(knee, [0, -0.2, 0.008]);
      mesh(SPHERE, white, ankle, [0, -0.004, 0.014], [0, 0, 0], [0.022, 0.014, 0.032]);
      return { hip, knee, ankle, front: true, side, rest: [0.08, -0.08, 0] };
    };
    const mkRear = (side) => {
      const hip = group(B, [side * 0.06, 0.0, -0.28]);
      // Muscular haunch blending up into the croup.
      coat(SPHERE, 'body', hip, hip, [0, -0.06, 0.005], [0.15, 0, 0], [0.048, 0.115, 0.072]);
      const knee = group(hip, [0, -0.17, 0]);
      mesh(taperedTube([[0, 0.03, 0.01], [0, -0.08, 0], [0, -0.17, 0]], 0.034, 0.018, 12, 12), white, knee);
      const ankle = group(knee, [0, -0.17, 0]);
      mesh(taperedTube([[0, 0.01, 0], [0, -0.125, 0]], 0.019, 0.015, 8, 12), white, ankle);
      const foot = group(ankle, [0, -0.125, 0]);
      mesh(SPHERE, white, foot, [0, -0.002, 0.014], [0, 0, 0], [0.022, 0.014, 0.032]);
      return { hip, knee, ankle, foot, front: false, side, rest: [-0.32, 0.82, -0.5] };
    };
    this.legs.push(mkFront(-1), mkFront(1), mkRear(-1), mkRear(1));

    // Paint the coat in rest pose, in dog space, so the markings line up across parts.
    this.legs.forEach((L) => {
      L.hip.rotation.x = L.rest[0]; L.knee.rotation.x = L.rest[1]; L.ankle.rotation.x = L.rest[2];
    });
    this.root.updateMatrixWorld(true);
    for (const [m, kind, ref] of coatParts) paintCoat(m, kind, ref);

    // Animation state.
    this.phase = 0;
    this.time = 0;
    this.speed = 0;
    this.gallop = 0;
    this.sniff = 0;
    this.lean = 0;
    this.blinkT = 2;
    this.shiverT = 5 + Math.random() * 5;
    this.shiver = 0;
    this.wag = 0.5;
    this.idleLook = 0;
    this.digging = 0;
  }

  /**
   * @param {number} dt
   * @param {{speed:number, turnRate:number, sniff:boolean, dig:boolean, happy:number}} s
   */
  update(dt, s) {
    this.time += dt;
    const t = this.time;
    this.speed = s.speed;
    const v = s.speed;
    const moving = smooth(0.05, 0.4, v);
    const gTarget = smooth(3.4, 4.6, v);
    this.gallop = lerp(this.gallop, gTarget, 1 - Math.exp(-dt * 6));
    const g = this.gallop;
    this.sniff = lerp(this.sniff, s.sniff ? 1 : 0, 1 - Math.exp(-dt * 8));
    this.digging = lerp(this.digging, s.dig ? 1 : 0, 1 - Math.exp(-dt * 10));
    this.lean = lerp(this.lean, THREE.MathUtils.clamp(-s.turnRate * v * 0.04, -0.25, 0.25), 1 - Math.exp(-dt * 6));

    const stride = lerp(0.36 + v * 0.13, 1.35, g); // longer steps as she speeds up
    this.phase = (this.phase + (dt * v) / stride) % 1;
    const P = this.phase * TAU;

    // Legs.
    const trot = [0, 0.5, 0.5, 0]; // FL FR RL RR
    const gal = [0, 0.12, 0.55, 0.67];
    const amp = lerp(0.42, 0.95, g) * moving;
    this.legs.forEach((L, i) => {
      const off = lerp(trot[i], gal[i], g) * TAU;
      const ph = P + off;
      const swing = Math.sin(ph) * amp;
      const lift = Math.max(0, -Math.cos(ph)) * moving;
      let digSwing = 0;
      if (L.front && this.digging > 0.01) {
        digSwing = (Math.sin(t * 22 + (L.side > 0 ? Math.PI : 0)) * 0.7 - 0.5) * this.digging;
      }
      if (L.front) {
        L.hip.rotation.x = L.rest[0] + swing + digSwing;
        L.knee.rotation.x = L.rest[1] + lift * lerp(1.1, 1.6, g) + Math.max(0, -digSwing) * 1.2;
      } else {
        L.hip.rotation.x = L.rest[0] + swing;
        L.knee.rotation.x = L.rest[1] + lift * 0.5 - this.digging * 0.3;
        L.ankle.rotation.x = L.rest[2] - lift * 0.5 + this.digging * 0.2;
      }
    });

    // Body motion: trot bob, gallop rock & stretch, lean into turns, breathing.
    const B = this.body;
    const trotBob = Math.abs(Math.cos(P * 2)) * 0.012 * moving * (1 - g);
    const galBob = Math.sin(P + 1.2) * 0.045 * g;
    B.position.y = 0.48 + trotBob + galBob - this.sniff * 0.03 - this.digging * 0.06;
    B.rotation.x = Math.sin(P) * 0.13 * g + this.sniff * 0.08 + this.digging * 0.28;
    B.rotation.z = this.lean;
    B.scale.z = 1 + Math.sin(P + 0.5) * 0.07 * g;
    this.chest.scale.x = 1 + Math.sin(t * lerp(2.2, 9, g)) * 0.03;

    // Whippet shiver: random little shivers when standing still (they're always cold!).
    this.shiverT -= dt * (1 - moving);
    if (this.shiverT < 0) { this.shiver = 1.2; this.shiverT = 7 + Math.random() * 8; }
    this.shiver = Math.max(0, this.shiver - dt);
    B.position.x = Math.sin(t * 70) * 0.006 * Math.min(1, this.shiver * 2);

    // Head & neck: counter-bob, sniffing nose to the ground, idle glances.
    this.idleLook = lerp(this.idleLook, Math.sin(t * 0.7) * 0.5 * (1 - moving) * (1 - this.sniff), 1 - Math.exp(-dt * 2));
    this.neck.rotation.x = 0.85 + this.sniff * 0.75 + g * 0.35 + this.digging * 0.4 - galBob * 2;
    this.neck.rotation.y = this.idleLook * 0.6 + Math.sin(t * 9) * 0.12 * this.sniff;
    this.head.rotation.x = -0.6 + this.sniff * 0.35 - g * 0.25 + Math.cos(P * 2) * 0.04 * moving;
    this.head.rotation.y = this.idleLook * 0.5;

    // Ears stream back when running, perk a bit when sniffing.
    this.ears.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      e.rotation.x = -0.5 - g * 0.6 + Math.sin(t * 25 + i) * 0.18 * g + Math.sin(P * 2) * 0.08 * moving;
      e.rotation.z = side * (-0.7 - g * 0.3 + this.sniff * 0.35);
    });

    // Tail: happy wag, streams out behind during zoomies.
    const happy = s.happy ?? 0.5;
    this.wag = lerp(this.wag, happy, 1 - Math.exp(-dt * 3));
    this.tail.rotation.y = Math.sin(t * lerp(6, 16, this.wag)) * lerp(0.2, 0.6, this.wag) * (1 - g * 0.7);
    this.tail.rotation.x = -g * 1.0 - this.wag * 0.25;

    // Eyes blink; brows lift when happy; tongue out when galloping.
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    this.eyes.forEach((e) => (e.scale.y = 0.012 * blink));
    this.brows.forEach((b) => (b.position.y = 0.044 + this.wag * 0.006 + this.sniff * -0.004));
    this.tongue.visible = g > 0.4;
    this.tongue.rotation.x = 0.3 + Math.sin(t * 20) * 0.15;
  }
}
