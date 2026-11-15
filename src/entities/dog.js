import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { BREEDS } from './breeds.js';
import { COSMETIC } from '../game/cosmetics.js';

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

// Base (whippet) torso:  z, top, bottom(tucked), halfWidth, bottom(untucked)
const TORSO = [
  [-0.39, 0.005, -0.03, 0.02, -0.03],
  [-0.36, 0.045, -0.045, 0.06, -0.06],
  [-0.29, 0.075, -0.05, 0.077, -0.09],
  [-0.2, 0.095, -0.03, 0.066, -0.1],
  [-0.1, 0.1, 0.005, 0.055, -0.105],
  [0.0, 0.09, -0.045, 0.063, -0.115],
  [0.09, 0.08, -0.14, 0.077, -0.145],
  [0.17, 0.075, -0.175, 0.08, -0.175],
  [0.25, 0.06, -0.15, 0.07, -0.15],
  [0.3, 0.02, -0.08, 0.045, -0.08],
  [0.315, -0.01, -0.04, 0.02, -0.04],
];
const HEAD = [
  [-0.065, 0.02, -0.01, 0.018],
  [-0.045, 0.05, -0.03, 0.04],
  [-0.01, 0.06, -0.04, 0.048],
  [0.03, 0.05, -0.037, 0.042],
  [0.07, 0.03, -0.032, 0.029],
  [0.11, 0.021, -0.027, 0.022],
  [0.145, 0.016, -0.022, 0.017],
  [0.165, 0.006, -0.012, 0.009],
];

const SPHERE = new THREE.SphereGeometry(1, 32, 22);

/**
 * A dog of any breed (see breeds.js), built from smooth lofted shapes and animated procedurally.
 * Faces +Z. Root sits on the ground.
 */
export class Dog {
  constructor(breedKey = 'merry') {
    const br = (this.breed = BREEDS[breedKey] ?? BREEDS.merry);
    const { L, T, len, gx, gy, tuck, neck: NL, headLen: HL, headW: HW } = br;
    this.root = new THREE.Group();
    this.root.scale.setScalar(br.size);
    this.bodyY = 0.065 + 0.415 * L;
    this.body = group(this.root, [0, this.bodyY, 0]);
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

    // Torso.
    this.chest = coat(loft(TORSO.map(([z, top, bot, w, flat]) => [z * len, top * gy, lerp(flat, bot, tuck) * gy, w * gx])), 'body', B, B);
    if (br.fluffyBum) coat(SPHERE, 'extra', B, B, [0, 0.0, -0.37 * len], [0, 0, 0], [0.07 * gx, 0.065 * gy, 0.05]);

    // Neck.
    this.neck = group(B, [0, 0.03 * gy, 0.24 * len], [0.85, 0, 0]);
    const nr = Math.max(gx, gy);
    coat(taperedTube([[0, -0.03, -0.01], [0, 0.06 * NL, 0.012], [0, 0.13 * NL, 0.008], [0, 0.18 * NL, -0.005]], 0.06 * nr, 0.036 * nr, 20, 24), 'neck', this.neck, this.neck);
    this.dims = { NL, nr, gx, gy, len };
    if (br.collar) this.breedCollar = this.makeCollar(br.collar.color, br.collar.tag); // e.g. Pippin's own black collar
    this.head = group(this.neck, [0, 0.175 * NL, -0.005], [-0.6, 0, 0]);
    this.head.scale.setScalar(HW);
    const H = this.head;
    const muzzle = (z) => (z > 0.03 ? 0.03 + (z - 0.03) * HL : z);
    const MW = br.muzzleW ?? 1; // broader muzzle for terriers
    const mw = (z) => 1 + (MW - 1) * Math.min(1, Math.max(0, (z - 0.02) / 0.06));
    coat(loft(HEAD.map(([z, t, b, w]) => [muzzle(z), t * mw(z), b * mw(z), w * mw(z)]), 40, 32, 0.15), 'head', H, H);
    const tip = muzzle(0.166);
    mesh(SPHERE, br.nose, H, [0, 0.0, tip], [0, 0, 0], [0.016, 0.014, 0.012]);
    if (br.beard) coat(SPHERE, 'extra', H, H, [0, -0.03, tip - 0.035], [0, 0, 0], [0.022, 0.018, 0.03]);
    this.eyes = [-1, 1].map((s) => {
      const e = mesh(SPHERE, 0x241a17, H, [s * 0.036, 0.026, 0.035], [0, s * 0.35, 0], [0.011, 0.012, 0.009]);
      mesh(SPHERE, 0xffffff, e, [s * 0.25, 0.35, 0.6], [0, 0, 0], [0.3, 0.3, 0.3]);
      return e;
    });
    const bs = br.browSize ?? 1;
    this.browTilt = br.grumpy ? 0.45 : -0.3;
    this.brows = [-1, 1].map((s) => mesh(SPHERE, br.brow, H, [s * 0.034, 0.044, 0.035], [0, 0, s * this.browTilt], [0.012 * bs, 0.0035 * bs, 0.006 * bs]));

    // Ears.
    this.ears = [-1, 1].map((s) => {
      let g;
      if (br.ears === 'flop') {
        g = group(H, [s * 0.04, 0.035, -0.02], [0, 0, s * 0.15]);
        coat(SPHERE, 'ear', g, g, [s * 0.008, -0.042, 0.0], [0, 0, 0], [0.011, 0.05, 0.032]);
        g.userData.base = [0, 0, s * 0.15];
        g.userData.flop = true;
      } else if (br.ears === 'prick') {
        g = group(H, [s * 0.03, 0.05, -0.02], [0, 0, s * -0.3]);
        coat(new THREE.ConeGeometry(0.028, 0.075, 12), 'ear', g, g, [0, 0.035, 0], [0, 0, 0], [1, 1, 0.45]);
        g.userData.base = [0, 0, s * -0.3];
      } else if (br.ears === 'button') {
        g = group(H, [s * 0.035, 0.05, -0.01], [0.9, 0, s * -0.5]);
        coat(SPHERE, 'ear', g, g, [s * 0.004, 0.012, 0.012], [0, 0, 0], [0.008, 0.02, 0.022]);
        g.userData.base = [0.9, 0, s * -0.5];
      } else {
        g = group(H, [s * 0.03, 0.04, -0.035], [-0.5, s * 0.2, s * -0.7]);
        coat(SPHERE, 'ear', g, g, [s * 0.005, 0.006, -0.026], [0.35, 0, 0], [0.009, 0.02, 0.036]);
        g.userData.base = [-0.5, s * 0.2, s * -0.7];
      }
      return g;
    });
    this.tongue = mesh(SPHERE, 0xe88a8f, H, [0, -0.032, tip - 0.055], [0.3, 0, 0], [0.016, 0.005, 0.028]);
    this.tongue.visible = false;

    // Tail.
    this.tail = group(B, [0, 0.03 * gy, -0.37 * len]);
    const tails = {
      long: [[[0, 0, 0], [0, -0.06, -0.07], [0, -0.16, -0.11], [0, -0.25, -0.1], [0, -0.29, -0.05]], 0.017, 0.005],
      up: [[[0, 0, 0], [0, 0.05, -0.025], [0, 0.1, -0.03], [0, 0.13, -0.025]], 0.02, 0.012],
      otter: [[[0, 0, 0], [0, -0.03, -0.1], [0, -0.1, -0.18], [0, -0.18, -0.22]], 0.032, 0.01],
      straight: [[[0, 0, 0], [0, -0.02, -0.1], [0, -0.08, -0.19], [0, -0.13, -0.25], [0, -0.14, -0.29]], 0.018, 0.005],
    };
    if (br.tail === 'stub') coat(SPHERE, 'tail', this.tail, this.tail, [0, 0.005, -0.01], [0, 0, 0], [0.025, 0.022, 0.03]);
    else { const [pts, r0, r1] = tails[br.tail]; coat(taperedTube(pts, r0 * T, r1 * T), 'tail', this.tail, this.tail); }

    // Legs.
    const P = 0.4 + 0.6 * L; // how much the haunch shrinks with short legs
    this.legs = [];
    const mkFront = (side) => {
      const hip = group(B, [side * 0.052 * gx, -0.03 * gy, 0.18 * len]);
      coat(taperedTube([[0, 0.02, 0.01], [0, -0.1 * L, -0.005], [0, -0.215 * L, 0]], 0.042 * T, 0.022 * T, 16, 16), 'upperLeg', hip, hip);
      const knee = group(hip, [0, -0.215 * L, 0]);
      coat(taperedTube([[0, 0.01, 0], [0, -0.1 * L, 0.004], [0, -0.2 * L, 0.008]], 0.021 * T, 0.016 * T, 12, 12), 'lowerLeg', knee, knee);
      const ankle = group(knee, [0, -0.2 * L, 0.008]);
      coat(SPHERE, 'paw', ankle, ankle, [0, -0.004, 0.014], [0, 0, 0], [0.022 * T, 0.014 * T, 0.032 * T]);
      return { hip, knee, ankle, front: true, side, rest: [0.08, -0.08, 0] };
    };
    const mkRear = (side) => {
      const hip = group(B, [side * 0.06 * gx, 0.0, -0.28 * len]);
      coat(SPHERE, 'upperLeg', hip, hip, [0, -0.06 * P, 0.005], [0.15, 0, 0], [0.048 * gx * T * 0.9, 0.115 * P, 0.072 * T]);
      const knee = group(hip, [0, -0.17 * L, 0]);
      coat(taperedTube([[0, 0.03, 0.01], [0, -0.08 * L, 0], [0, -0.17 * L, 0]], 0.034 * T, 0.018 * T, 12, 12), 'lowerLeg', knee, knee);
      const ankle = group(knee, [0, -0.17 * L, 0]);
      coat(taperedTube([[0, 0.01, 0], [0, -0.125 * L, 0]], 0.019 * T, 0.015 * T, 8, 12), 'lowerLeg', ankle, ankle);
      const foot = group(ankle, [0, -0.125 * L, 0]);
      coat(SPHERE, 'paw', foot, foot, [0, -0.002, 0.014], [0, 0, 0], [0.022 * T, 0.014 * T, 0.032 * T]);
      return { hip, knee, ankle, foot, front: false, side, rest: [-0.32, 0.82, -0.5] };
    };
    this.legs.push(mkFront(-1), mkFront(1), mkRear(-1), mkRear(1));

    // Paint the coat in rest pose. Patterns get the point in "normalised whippet" space so
    // markings line up across every part whatever the breed's proportions.
    this.legs.forEach((Lg) => { Lg.hip.rotation.x = Lg.rest[0]; Lg.knee.rotation.x = Lg.rest[1]; Lg.ankle.rotation.x = Lg.rest[2]; });
    const savedScale = this.root.scale.clone();
    this.root.scale.setScalar(1);
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), d = new THREE.Vector3(), l = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
    for (const [m, kind, ref] of coatParts) {
      const p = m.geometry.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const toRef = new THREE.Matrix4().copy(ref.matrixWorld).invert().multiply(m.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        d.copy(v).applyMatrix4(m.matrixWorld);
        l.copy(v).applyMatrix4(toRef);
        n.set(d.x / gx, (d.y - this.bodyY) / gy + 0.48, d.z / len);
        br.coat(kind, l, n, i / p.count, c);
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      m.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    this.root.scale.copy(savedScale);

    // Animation state.
    this.legScale = L;
    this.phase = 0;
    this.time = Math.random() * 10;
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
    this.barkT = 0;
    this.shakeT = 0;
    this.air = 0;
    this.squash = 0;
  }

  /** A collar with a little round tag, sized to this dog's neck. */
  makeCollar(color, tagColor = 0xdfe3e8) {
    const { NL, nr } = this.dims;
    const g = group(this.neck);
    const cy = 0.085 * NL, cr = 0.049 * nr;
    mesh(new THREE.TorusGeometry(cr, 0.007, 8, 32), color, g, [0, cy, 0.008], [Math.PI / 2 + 0.3, 0, 0]);
    mesh(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), 0xb8bec6, g, [0, cy - 0.016, cr + 0.012], [0, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.003, 20), tagColor, g, [0, cy - 0.032, cr + 0.014], [Math.PI / 2 - 0.3, 0, 0]);
    return g;
  }

  /**
   * Dress up: { collar, neck, hat } cosmetic ids (or null). Swaps the meshes on the dog;
   * a cosmetic collar replaces the breed's own collar while worn.
   */
  setLook(look = {}) {
    for (const m of this.lookMeshes ?? []) m.removeFromParent();
    this.lookMeshes = [];
    const keep = (m) => { this.lookMeshes.push(m); return m; };
    const { gx, gy, len } = this.dims;
    const c = (slot) => COSMETIC[look[slot]];
    if (this.breedCollar) this.breedCollar.visible = !c('collar');

    if (c('collar')) keep(this.makeCollar(c('collar').color, 0xf2c14e));

    if (c('neck')) {
      // Bandana: a soft triangle hanging at the front of the chest.
      const g = keep(group(this.body, [0, 0.035 * gy, 0.255 * len], [0.25, 0, 0]));
      const cone = new THREE.ConeGeometry(0.075, 0.13, 3, 1);
      cone.rotateZ(Math.PI); cone.rotateY(Math.PI / 6);
      mesh(cone, c('neck').color, g, [0, -0.045, 0.012], [0, 0, 0], [gx, 1, 0.32]);
      mesh(new THREE.TorusGeometry(0.06 * gx, 0.012, 6, 20, Math.PI), c('neck').color, g, [0, 0.012, -0.012], [Math.PI / 2 + 0.2, 0, Math.PI]);
    }

    const hat = c('hat');
    if (hat) {
      const g = keep(group(this.head, [0, 0.06, -0.012], [0.15, 0, 0]));
      if (hat.id === 'hat-party') {
        mesh(new THREE.ConeGeometry(0.032, 0.11, 18), hat.color, g, [0, 0.055, 0]);
        mesh(new THREE.TorusGeometry(0.031, 0.006, 6, 18), 0xf6d06a, g, [0, 0.008, 0], [Math.PI / 2, 0, 0]);
        mesh(SPHERE, 0xf6d06a, g, [0, 0.115, 0], [0, 0, 0], [0.012, 0.012, 0.012]);
      } else if (hat.id === 'hat-cap') {
        mesh(new THREE.SphereGeometry(0.045, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat.color, g, [0, 0, 0]);
        mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.006, 18, 1, false, -Math.PI / 2, Math.PI), hat.color, g, [0, 0.003, 0.03], [0, Math.PI, 0], [1, 1, 1.25]);
        mesh(SPHERE, 0xffffff, g, [0, 0.046, 0], [0, 0, 0], [0.008, 0.006, 0.008]);
      } else if (hat.id === 'hat-crown') {
        mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.03, 20, 1, true), hat.color, g, [0, 0.015, 0], [0, 0, 0], [1, 1, 1], );
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          mesh(new THREE.ConeGeometry(0.01, 0.028, 6), hat.color, g, [Math.cos(a) * 0.034, 0.042, Math.sin(a) * 0.034]);
          mesh(SPHERE, i % 2 ? 0xd9534f : 0x5b86c4, g, [Math.cos(a) * 0.036, 0.016, Math.sin(a) * 0.036], [0, 0, 0], [0.006, 0.006, 0.006]);
        }
      } else if (hat.id === 'hat-flowers') {
        mesh(new THREE.TorusGeometry(0.04, 0.006, 6, 24), hat.color, g, [0, 0.006, 0], [Math.PI / 2, 0, 0]);
        const petals = [0xf2a0b4, 0xf6d06a, 0xffffff, 0xb69be0, 0xf08a6a];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          mesh(SPHERE, petals[i % petals.length], g, [Math.cos(a) * 0.04, 0.012, Math.sin(a) * 0.04], [0, 0, 0], [0.012, 0.009, 0.012]);
        }
      } else if (hat.id === 'hat-wizard') {
        mesh(new THREE.ConeGeometry(0.038, 0.14, 18), hat.color, g, [0, 0.07, -0.008], [-0.15, 0, 0]);
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.005, 24), hat.color, g, [0, 0.002, 0]);
        for (let i = 0; i < 4; i++) mesh(SPHERE, 0xf6d06a, g, [Math.cos(i * 1.7) * 0.02, 0.04 + i * 0.022, Math.sin(i * 1.7) * 0.02 + 0.012], [0, 0, 0], [0.005, 0.005, 0.005]);
      }
    }
  }

  bark() { this.barkT = 0.45; }
  jump() { this.squash = -0.25; }
  land(k = 1) { this.squash = 0.28 * k; }
  shake() { this.shakeT = 1.3; }

  /**
   * @param {number} dt
   * @param {{speed:number, turnRate:number, sniff:boolean, dig:boolean, happy:number}} s
   */
  update(dt, s) {
    const br = this.breed;
    this.time += dt;
    const t = this.time;
    // Speeds are in world metres; the dog is scaled, so think in its own units.
    const v = s.speed / br.size;
    this.speed = v;
    const moving = smooth(0.05, 0.4, v);
    const gTarget = smooth(3.0 * (0.7 + 0.3 * this.legScale), 4.2 * (0.7 + 0.3 * this.legScale), v);
    this.gallop = lerp(this.gallop, gTarget, 1 - Math.exp(-dt * 6));
    const g = this.gallop;
    this.sniff = lerp(this.sniff, s.sniff ? 1 : 0, 1 - Math.exp(-dt * 8));
    this.digging = lerp(this.digging, s.dig ? 1 : 0, 1 - Math.exp(-dt * 10));
    this.lean = lerp(this.lean, THREE.MathUtils.clamp(-s.turnRate * v * 0.04, -0.25, 0.25), 1 - Math.exp(-dt * 6));

    // Short legs → short, busy steps.
    const legK = 0.3 + 0.7 * this.legScale;
    const stride = lerp(0.36 + v * 0.13, 1.35, g) * legK;
    this.phase = (this.phase + (dt * v) / stride) % 1;
    const P = this.phase * TAU;

    // Legs. Old dogs (stiff) swing less and lift less.
    const trot = [0, 0.5, 0.5, 0]; // FL FR RL RR
    const gal = [0, 0.12, 0.55, 0.67];
    const stiffK = 1 - (br.stiff ?? 0) * 0.35;
    const amp = lerp(0.42, 0.95, g) * moving * stiffK;
    this.legs.forEach((L, i) => {
      const off = lerp(trot[i], gal[i], g) * TAU;
      const ph = P + off;
      const swing = Math.sin(ph) * amp;
      const lift = Math.max(0, -Math.cos(ph)) * moving * stiffK;
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

    // In the air: front legs reach forward, back legs kick out behind, body tilts with the jump.
    this.air = lerp(this.air, s.air ?? 0, 1 - Math.exp(-dt * 14));
    if (this.air > 0.01) {
      const a = this.air;
      this.legs.forEach((Lg) => {
        if (Lg.front) { Lg.hip.rotation.x = lerp(Lg.hip.rotation.x, -0.9, a); Lg.knee.rotation.x = lerp(Lg.knee.rotation.x, 1.3, a); }
        else { Lg.hip.rotation.x = lerp(Lg.hip.rotation.x, 0.5, a); Lg.knee.rotation.x = lerp(Lg.knee.rotation.x, 0.3, a); Lg.ankle.rotation.x = lerp(Lg.ankle.rotation.x, 0.2, a); }
      });
    }
    this.squash = lerp(this.squash, 0, 1 - Math.exp(-dt * 10));

    // Body motion: trot bob, gallop rock & stretch, lean into turns, breathing.
    const B = this.body;
    const hk = 0.4 + 0.6 * this.legScale;
    const trotBob = Math.abs(Math.cos(P * 2)) * 0.012 * moving * (1 - g) * hk * (1 + (br.stiff ?? 0));
    const galBob = Math.sin(P + 1.2) * 0.045 * g * hk;
    B.position.y = this.bodyY + trotBob + galBob - this.sniff * 0.03 * hk - this.digging * 0.06 * hk;
    B.rotation.x = Math.sin(P) * 0.13 * g + this.sniff * 0.08 + this.digging * 0.28 - THREE.MathUtils.clamp((s.vy ?? 0) * 0.08, -0.35, 0.35) * this.air;
    B.rotation.z = this.lean + Math.sin(P * 2) * 0.06 * (br.wiggle ?? 0) * moving;
    B.rotation.y = Math.sin(P * 2 + 0.5) * 0.09 * (br.wiggle ?? 0) * moving; // sausage wiggle
    B.scale.z = 1 + Math.sin(P + 0.5) * 0.07 * g - this.squash * 0.3 + this.air * 0.06;
    B.scale.y = 1 - this.squash;
    B.position.y -= this.squash * 0.12 * hk;
    this.chest.scale.x = 1 + Math.sin(t * lerp(2.2, 9, g)) * 0.03;

    // Whippet shiver: random little shivers when standing still (they're always cold!).
    this.shiverT -= dt * (1 - moving);
    if (this.shiverT < 0) { this.shiver = br === BREEDS.merry ? 1.2 : 0; this.shiverT = 7 + Math.random() * 8; }
    this.shiver = Math.max(0, this.shiver - dt);
    B.position.x = Math.sin(t * 70) * 0.006 * Math.min(1, this.shiver * 2);

    // Head & neck: counter-bob, sniffing nose to the ground, idle glances.
    this.idleLook = lerp(this.idleLook, Math.sin(t * 0.7) * 0.5 * (1 - moving) * (1 - this.sniff), 1 - Math.exp(-dt * 2));
    this.neck.rotation.x = 0.85 + this.sniff * 0.75 + g * 0.35 + this.digging * 0.4 - galBob * 2;
    this.neck.rotation.y = this.idleLook * 0.6 + Math.sin(t * 9) * 0.12 * this.sniff;
    this.head.rotation.x = -0.6 + this.sniff * 0.35 - g * 0.25 + Math.cos(P * 2) * 0.04 * moving;
    this.head.rotation.y = this.idleLook * 0.5;

    // Ears: stream back when running, bounce with steps; floppy ears swing.
    this.ears.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      const [bx, by, bz] = e.userData.base;
      if (e.userData.flop) {
        e.rotation.x = bx - g * 0.9 - this.sniff * -0.5 + Math.sin(P * 2) * 0.25 * moving;
        e.rotation.z = bz + side * (Math.sin(t * 25 + i) * 0.2 * g + this.shakeT * Math.sin(t * 48) * 0.8);
      } else {
        e.rotation.x = bx - g * 0.6 + Math.sin(t * 25 + i) * 0.18 * g + Math.sin(P * 2) * 0.08 * moving;
        e.rotation.z = bz + side * (-g * 0.3 + this.sniff * 0.35);
      }
      e.rotation.y = by;
    });

    // Tail: happy wag, streams out behind during zoomies.
    const happy = s.happy ?? 0.5;
    this.wag = lerp(this.wag, happy, 1 - Math.exp(-dt * 3));
    this.tail.rotation.y = Math.sin(t * lerp(6, 16, this.wag)) * lerp(0.2, 0.6, this.wag) * (1 - g * 0.7);
    this.tail.rotation.x = br.tail === 'up' ? 0.2 - g * 0.6 : -g * 1.0 - this.wag * 0.25;

    // Swimming: doggy paddle — legs churn under the water, body level, head held high,
    // tail floating out behind. Blends in/out smoothly as she wades deeper or climbs out.
    this.swimK = lerp(this.swimK ?? 0, s.swim ?? 0, 1 - Math.exp(-dt * 6));
    if (this.swimK > 0.01) {
      const k = this.swimK, sp = t * (8 + Math.min(4, v * 2));
      this.legs.forEach((Lg) => {
        const o = (Lg.side > 0 ? Math.PI : 0) + (Lg.front ? 0 : Math.PI / 2);
        if (Lg.front) {
          Lg.hip.rotation.x = lerp(Lg.hip.rotation.x, -0.55 + Math.sin(sp + o) * 0.75, k);
          Lg.knee.rotation.x = lerp(Lg.knee.rotation.x, 0.9 + Math.cos(sp + o) * 0.7, k);
        } else {
          Lg.hip.rotation.x = lerp(Lg.hip.rotation.x, 0.25 + Math.sin(sp + o) * 0.55, k);
          Lg.knee.rotation.x = lerp(Lg.knee.rotation.x, 0.7 + Math.cos(sp + o) * 0.4, k);
          Lg.ankle.rotation.x = lerp(Lg.ankle.rotation.x, -0.3, k);
        }
      });
      B.rotation.x = lerp(B.rotation.x, -0.1, k);
      B.rotation.z = lerp(B.rotation.z, Math.sin(t * 2.2) * 0.05, k);
      B.position.y = lerp(B.position.y, this.bodyY + Math.sin(t * 3.1) * 0.012, k);
      B.scale.z = lerp(B.scale.z, 1, k);
      this.neck.rotation.x = lerp(this.neck.rotation.x, 0.45, k);
      this.head.rotation.x = lerp(this.head.rotation.x, -0.25, k);
      this.tail.rotation.x = lerp(this.tail.rotation.x, -1.25, k);
    }

    // Bark: head flicks up, little hop. Shake: full-body wet-dog wiggle.
    this.barkT = Math.max(0, this.barkT - dt);
    const bk = Math.sin((this.barkT / 0.45) * Math.PI);
    this.neck.rotation.x -= bk * 0.5;
    this.head.rotation.x -= bk * 0.35;
    B.position.y += bk * 0.03 * hk;
    this.shakeT = Math.max(0, this.shakeT - dt);
    const sk = Math.min(1, this.shakeT * 2) * (this.shakeT > 0 ? 1 : 0);
    B.rotation.z += Math.sin(t * 48) * 0.3 * sk;
    this.neck.rotation.z = Math.sin(t * 48 + 0.6) * 0.5 * sk;
    if (sk > 0) this.ears.forEach((e, i) => (e.rotation.y = Math.sin(t * 48 + i) * 1.2 * sk));
    this.tail.rotation.y += Math.sin(t * 40) * 0.6 * sk;

    // Eyes blink; brows lift when happy (grumpy dogs just scowl harder); tongue out when galloping.
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    this.eyes.forEach((e) => (e.scale.y = 0.012 * blink * (br.grumpy ? 0.75 : 1)));
    this.brows.forEach((b) => (b.position.y = 0.044 + (br.grumpy ? -0.004 : this.wag * 0.006) + this.sniff * -0.004));
    this.tongue.visible = g > 0.4;
    this.tongue.rotation.x = 0.3 + Math.sin(t * 20) * 0.15;
  }
}
