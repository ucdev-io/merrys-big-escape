import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../render/watercolorMaterial.js';
import { breedOf } from './breeds.js';
import { COSMETIC } from '../game/cosmetics.js';
import { fbm3 } from '../core/rng.js';
import { TORSO, HEAD, TAILS } from './dogShape.js';
import { buildSkin } from './dogSkin.js';
import { daisyChain } from './friendLooks.js';
import { bakedMesh } from './shapes.js';

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

// Bones: the dog's moving parts (Dogs 2.0 bends one smooth skin with them).
function bone(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const b = new THREE.Bone();
  b.position.set(...pos);
  b.rotation.set(...rot);
  parent.add(b);
  return b;
}

// Dogs 2.0: every dog is one smooth skin (dogSkin.js) instead of separate parts. A breed key added to
// PARTS is built the old way instead (handy for comparing the two).
export const PARTS = new Set();

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

/**
 * Split a lofted head (rings × radial corners, then its two end points) along the mouth line into the
 * skull with the top of the muzzle, and a lower jaw from the mouth's corner (zc) to the nose (tip; the
 * line ends at yf there). Closed, the two make the same head. Each gets a 'mouth' attribute marking
 * the corners that became the inside of the mouth. The jaw comes back measured from its hinge.
 */
function splitJaw(geo, zc, tip, yf, rings = 40, radial = 32) {
  const P = geo.attributes.position, n = P.count;
  let ic = 0;
  while (ic < rings - 1 && P.getZ(ic * radial) < zc) ic++;
  const z0 = P.getZ(ic * radial);
  let y0 = Infinity;
  for (let j = 0; j < radial; j++) y0 = Math.min(y0, P.getY(ic * radial + j));
  y0 += 0.004;
  const line = (z) => lerp(y0, yf, THREE.MathUtils.clamp((z - z0) / (tip - z0), 0, 1));
  const upper = geo.clone(), jaw = geo.clone();
  const U = upper.attributes.position, J = jaw.attributes.position;
  // 'mouth': 1 inside the mouth, 2 along the lips (the corners next to the outside).
  const mU = new Float32Array(n), mJ = new Float32Array(n);
  // How wide each ring is where the mouth line crosses it (the cut edges stay on the surface there).
  const halfW = (i, m) => {
    let w = 0;
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), ya = P.getY(a) - m, yb = P.getY(b) - m;
      if ((ya <= 0) !== (yb <= 0)) w = Math.max(w, Math.abs(lerp(P.getX(a), P.getX(b), ya / (ya - yb))));
    }
    return w;
  };
  for (let v = 0; v < n; v++) {
    const z = P.getZ(v), y = P.getY(v);
    if (z < z0 - 1e-6) continue;
    const m = line(z), i = Math.floor(v / radial), w = i < rings ? halfW(i, m) : 0;
    const x = THREE.MathUtils.clamp(P.getX(v), -w, w);
    if (y < m) { U.setXYZ(v, x, m, z); mU[v] = 1; }
    if (y > m) { J.setXYZ(v, x, m, z); mJ[v] = 1; }
  }
  for (const mk of [mU, mJ]) for (let i = ic; i < rings; i++) for (let j = 0; j < radial; j++) {
    const v = i * radial + j, at = (d) => mk[i * radial + ((j + d + radial) % radial)];
    if (mk[v] === 1 && (!at(1) || !at(-1) || !at(2) || !at(-2))) mk[v] = 2;
  }
  // The jaw starts at the mouth's corner: the rings behind it fold onto that one.
  for (let i = 0; i < ic; i++) for (let j = 0; j < radial; j++) { const s = ic * radial + j; J.setXYZ(i * radial + j, J.getX(s), J.getY(s), J.getZ(s)); }
  let cx = 0, cy = 0;
  for (let j = 0; j < radial; j++) { cx += J.getX(ic * radial + j); cy += J.getY(ic * radial + j); }
  J.setXYZ(rings * radial, cx / radial, cy / radial, z0 - 0.002);
  jaw.translate(0, -y0, -z0);
  upper.setAttribute('mouth', new THREE.BufferAttribute(mU, 1));
  jaw.setAttribute('mouth', new THREE.BufferAttribute(mJ, 1));
  upper.computeVertexNormals();
  jaw.computeVertexNormals();
  return { upper, jaw, hinge: [0, y0, z0], line };
}

const MOUTH = new THREE.Color(0x9a4048), LIPS = new THREE.Color(0x3b2c2c); // inside the mouth; its dark edge

const SPHERE = new THREE.SphereGeometry(1, 32, 22);

/**
 * Fluffy coats: puff a part's surface out in soft, uneven tufts (curl > 0 adds tight curls).
 * `amt` is in dog units; `scale` is the mesh's own scale (unit spheres get stretched into ears etc.),
 * so tufts come out the same size whatever the part.
 */
function fluffify(geo, amt, curl = 0, scale = [1, 1, 1]) {
  let g = geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), w = new THREE.Vector3();
  const [sx, sy, sz] = scale, mo = g.attributes.mouth;
  for (let i = 0; i < p.count; i++) {
    if (mo && mo.getX(i) > 0) continue; // (no fur inside the mouth)
    v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
    w.set(v.x * sx, v.y * sy, v.z * sz); // where this point really is on the dog
    const tuft = fbm3(w.x * 45 + 11, w.y * 45, w.z * 45 - 7, 3);
    const curls = curl ? (fbm3(w.x * 170, w.y * 170 + 3, w.z * 170, 2) - 0.5) * curl : 0;
    const d = amt * (0.55 + tuft * 0.9 + curls * 1.8);
    v.set(v.x + (n.x * d) / sx, v.y + (n.y * d) / sy, v.z + (n.z * d) / sz);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A lumpy ball of fur (ruffs, beards, topknots, fluffy ears).
const FLUFF = (() => {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (fbm3(v.x * 2.4 + 5, v.y * 2.4, v.z * 2.4, 3) - 0.5) * 0.55);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
})();

const UP_TAILS = new Set(['up', 'curl', 'plume']);
// How long each emote lasts (seconds).
const EMOTE_TIME = { bow: 1.8, spin: 1.3, sit: 3, roll: 2.6, howl: 2.4, dance: 2.2 };
export const EMOTES = [
  { id: 'bow', emoji: '🙇', name: 'Play bow' }, { id: 'spin', emoji: '🌀', name: 'Chase tail' }, { id: 'sit', emoji: '🪑', name: 'Sit' },
  { id: 'roll', emoji: '🙃', name: 'Roll over' }, { id: 'howl', emoji: '🐺', name: 'Howl' }, { id: 'dance', emoji: '💃', name: 'Happy dance' },
];
const TAIL_FLUFF = { plume: 1.7, feather: 1.6, sabre: 1.3, otter: 0.6, curl: 0.8 };
const DARK_EYE = 0x241a17;
// Finished (fluffed and painted) coat shapes per breed: every dog of a breed is identical, so build it once.
const GEO_CACHE = new Map();

/**
 * A dog of any breed (see breeds.js), built from smooth lofted shapes and animated procedurally.
 * Faces +Z. Root sits on the ground.
 */
export class Dog {
  constructor(breedKey = 'merry') {
    const br = (this.breed = breedOf(breedKey));
    const { L, T, len, gx, gy, tuck, neck: NL, headLen: HL, headW: HW } = br;
    const F = br.fluff ?? 0, CURL = br.curl ?? 0, HF = F * (br.headFluff ?? 0.3);
    this.root = new THREE.Group();
    this.root.scale.setScalar(br.size);
    this.bodyY = 0.065 + 0.415 * L;
    const v2 = (this.skinned = !PARTS.has(breedKey));
    this.body = bone(this.root, [0, this.bodyY, 0]);
    const B = this.body;
    const coatParts = [];
    const cacheKey = `${breedKey}:${v2 ? 2 : 1}`; // (old and new dogs have different parts)
    const cached = GEO_CACHE.get(cacheKey);
    let ci = 0;
    // fl: how fluffy this part is (dog units).
    const coat = (geo, kind, parent, ref, pos, rot, scale, fl = 0) => {
      const g = cached ? cached[ci++] : fl > 0 ? fluffify(geo.clone(), fl, CURL, scale) : geo.clone();
      const m = new THREE.Mesh(g, paint(0xffffff, { vertexColors: true }));
      if (pos) m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      if (scale) m.scale.set(...scale);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      coatParts.push([m, kind, ref]);
      return m;
    };

    // The spine: the middle of the back (the body bone), with the chest and the hips either side of it,
    // so the back can arch, stretch and curl. (Part-built dogs keep their one stiff body.)
    this.spineF = v2 ? bone(B, [0, 0, 0.12 * len]) : B;
    this.spineR = v2 ? bone(B, [0, 0, -0.14 * len]) : B;
    const on = (sp, [x, y, z]) => (sp === B ? [x, y, z] : [x - sp.position.x, y - sp.position.y, z - sp.position.z]); // body space → that bone's

    // Torso. (Smooth dogs: the chest is a little bone in the ribs that breathes.)
    this.chest = v2 ? bone(this.spineF, [0, -0.06 * gy, 0.02 * len]) : coat(loft(TORSO.map(([z, top, bot, w, flat]) => [z * len, top * gy, lerp(flat, bot, tuck) * gy, w * gx])), 'body', B, B, null, null, undefined, F);
    if (br.fluffyBum) coat(SPHERE, 'extra', this.spineR, B, on(this.spineR, [0, 0.0, -0.37 * len]), [0, 0, 0], [0.07 * gx, 0.065 * gy, 0.05], F);
    // A fluffy chest ruff (collies, huskies, poms…).
    if (br.ruff) coat(FLUFF, 'body', this.spineF, B, on(this.spineF, [0, 0.005 * gy, 0.255 * len]), [0.35, 0, 0], [0.074 * gx * br.ruff, 0.088 * gy * br.ruff, 0.062 * br.ruff]);

    // Neck.
    this.neck = bone(this.spineF, on(this.spineF, [0, 0.03 * gy, 0.24 * len]), [0.85, 0, 0]);
    const nr = Math.max(gx, gy);
    if (!v2) coat(taperedTube([[0, -0.03, -0.01], [0, 0.06 * NL, 0.012], [0, 0.13 * NL, 0.008], [0, 0.18 * NL, -0.005]], 0.06 * nr, 0.036 * nr, 20, 24), 'neck', this.neck, this.neck, null, null, undefined, F * 1.15);
    this.dims = { NL, nr, gx, gy, len, F, HF };
    if (br.collar) this.breedCollar = this.makeCollar(br.collar.color, br.collar.tag); // e.g. Pippin's own black collar
    this.head = bone(this.neck, [0, 0.175 * NL, -0.005], [-0.6, 0, 0]);
    this.head.scale.setScalar(HW);
    const H = this.head;
    const muzzle = (z) => (z > 0.03 ? 0.03 + (z - 0.03) * HL : z);
    const MW = br.muzzleW ?? 1; // broader muzzle for terriers
    const mw = (z) => 1 + (MW - 1) * Math.min(1, Math.max(0, (z - 0.02) / 0.06));
    // The head (smooth-skinned dogs keep it too: the skin's neck tucks up inside it), in two pieces: the
    // skull with the top of the muzzle, and a lower jaw hinged at the corner of the mouth.
    const tip = muzzle(0.166);
    const { upper, jaw, hinge, line: mouthLine } = splitJaw(loft(HEAD.map(([z, t, b, w]) => [muzzle(z), t * mw(z), b * mw(z), w * mw(z)]), 40, 32, 0.15), muzzle(0.045), tip, -0.006 * MW);
    coat(upper, 'head', H, H, null, null, undefined, HF / HW);
    this.jaw = group(H, hinge);
    coat(jaw, 'head', this.jaw, H, null, null, undefined, HF / HW);
    const hf = HF / HW; // fluffy faces: sit the eyes, nose and brows on top of the fur
    mesh(SPHERE, br.nose, H, [0, 0.0, tip + hf * 0.7], [0, 0, 0], [0.016, 0.014, 0.012]);
    if (br.beard) coat(FLUFF, 'extra', H, H, [0, -0.03, tip - 0.03], [0.3, 0, 0], [0.024, 0.02, 0.032]);
    // Droopy lips (boxers, bulldogs, Great Danes…).
    if (br.jowls) for (const s of [-1, 1]) coat(SPHERE, 'head', H, H, [s * 0.016 * MW, -0.022, tip - 0.026], [0, 0, s * 0.25], [0.014 * MW, 0.02, 0.025]);
    const es = br.eyeSize ?? 1;
    this.eyeY = 0.012 * es;
    this.eyes = [-1, 1].map((s, i) => {
      const col = Array.isArray(br.eyeColor) ? br.eyeColor[i] : br.eyeColor ?? DARK_EYE;
      const e = mesh(SPHERE, col, H, [s * (0.036 + hf * 0.6), 0.026 + hf * 0.2, 0.035 + hf * 0.6], [0, s * 0.35, 0], [0.011 * es, 0.012 * es, 0.009 * es]);
      if (col !== DARK_EYE) mesh(SPHERE, 0x16110f, e, [0, 0, 0.62], [0, 0, 0], [0.55, 0.6, 0.45]); // pupil for pale eyes
      mesh(SPHERE, 0xffffff, e, [s * 0.25, 0.35, 0.6], [0, 0, 0], [0.3, 0.3, 0.3]);
      return e;
    });
    const bs = br.browSize ?? 1;
    this.browTilt = br.grumpy ? 0.45 : -0.3;
    this.browY = 0.044 + hf * 0.3;
    this.brows = [-1, 1].map((s) => mesh(SPHERE, br.brow, H, [s * (0.034 + hf * 0.5), this.browY, 0.035 + hf * 0.6], [0, 0, s * this.browTilt], [0.012 * bs, 0.0035 * bs, 0.006 * bs]));
    // A topknot with a bow (Maltese).
    if (br.topknot) {
      this.topknot = group(H, [0, 0.058 + hf * 0.6, -0.004]);
      coat(FLUFF, 'head', this.topknot, H, [0, 0.01, 0], [0, 0, 0], [0.024, 0.022, 0.024]);
      for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.012, 0.024, 12), br.topknot, this.topknot, [s * 0.012, 0.03, 0], [0, 0, (-s * Math.PI) / 2]);
      mesh(SPHERE, br.topknot, this.topknot, [0, 0.03, 0], [0, 0, 0], [0.007, 0.007, 0.007]);
    }

    // Ears.
    const el = br.earLen ?? 1;
    this.ears = [-1, 1].map((s) => {
      let g;
      if (br.ears === 'flop') {
        g = group(H, [s * 0.04, 0.035, -0.02], [0, 0, s * 0.15]);
        coat(SPHERE, 'ear', g, g, [s * 0.008, -0.042 * el, 0.0], [0, 0, 0], [0.011, 0.05 * el, 0.032], F * 0.8);
        g.userData.base = [0, 0, s * 0.15];
        g.userData.flop = true;
      } else if (br.ears === 'long') { // spaniels and doodles: long, silky, hanging past the jaw
        g = group(H, [s * 0.043, 0.032, -0.022], [0, 0, s * 0.08]);
        coat(F > 0 ? FLUFF : SPHERE, 'ear', g, g, [s * 0.012, -0.05 * el, 0.004], [0, 0, 0], [0.014, 0.06 * el, 0.034], F * 0.7);
        g.userData.base = [0, 0, s * 0.08];
        g.userData.flop = true;
      } else if (br.ears === 'prick') {
        g = group(H, [s * 0.03, 0.05, -0.02], [0, 0, s * -0.3]);
        coat(new THREE.ConeGeometry(0.028, 0.075, 12), 'ear', g, g, [0, 0.035, 0], [0, 0, 0], [1, 1, 0.45], F * 0.25);
        g.userData.base = [0, 0, s * -0.3];
      } else if (br.ears === 'bat') { // French bulldog: big, round and upright
        g = group(H, [s * 0.033, 0.047, -0.018], [0.05, s * 0.3, s * -0.45]);
        coat(SPHERE, 'ear', g, g, [0, 0.033, 0], [0, 0, 0], [0.028, 0.041, 0.009]);
        g.userData.base = [0.05, s * 0.3, s * -0.45];
      } else if (br.ears === 'tipped') { // collies: up at the base, tips folded over
        g = group(H, [s * 0.03, 0.05, -0.02], [0.1, 0, s * -0.25]);
        coat(new THREE.ConeGeometry(0.027, 0.05, 12), 'ear', g, g, [0, 0.022, 0], [0, 0, 0], [1, 1, 0.45], F * 0.25);
        const tipG = group(g, [0, 0.045, 0.002], [1.2, 0, 0]);
        coat(new THREE.ConeGeometry(0.015, 0.032, 10), 'ear', tipG, g, [0, 0.013, 0], [0, 0, 0], [1, 1, 0.45]);
        g.userData.base = [0.1, 0, s * -0.25];
      } else if (br.ears === 'button') {
        g = group(H, [s * 0.035, 0.05, -0.01], [0.9, 0, s * -0.5]);
        coat(SPHERE, 'ear', g, g, [s * 0.004, 0.012, 0.012], [0, 0, 0], [0.008, 0.02, 0.022]);
        g.userData.base = [0.9, 0, s * -0.5];
      } else {
        g = group(H, [s * 0.03, 0.04, -0.035], [-0.5, s * 0.2, s * -0.7]);
        coat(SPHERE, 'ear', g, g, [s * 0.005, 0.006, -0.026], [0.35, 0, 0], [0.009, 0.02, 0.036]);
        g.userData.base = [-0.5, s * 0.2, s * -0.7];
      }
      g.scale.setScalar(br.earSize ?? 1);
      return g;
    });
    const tz = Math.max(tip - 0.035, lerp(hinge[2], tip, 0.55)); // (in the jaw, even on a squashed pug face)
    this.tongue = mesh(SPHERE, 0xe88a8f, this.jaw, [0, mouthLine(tz + 0.005) + 0.002 - hinge[1], tz - hinge[2]], [0.3, 0, 0], [0.016, 0.005, 0.028]);
    this.tongue.visible = false;
    this.mouth = group(H, [0, -0.025, tip - 0.035]); // where carried things go

    // Tail.
    this.tail = bone(this.spineR, on(this.spineR, [0, 0.03 * gy, -0.37 * len]));
    const tails = TAILS;
    if (v2) {
      // A chain of five tail bones along its curve, so it can swish and ripple.
      const curve = new THREE.CatmullRomCurve3((tails[br.tail] ?? tails.long)[0].map((p) => new THREE.Vector3(...p)));
      this.tailBones = [this.tail];
      let last = new THREE.Vector3();
      for (const u of [0.2, 0.4, 0.6, 0.8]) {
        const p = curve.getPointAt(u);
        this.tailBones.push(bone(this.tailBones[this.tailBones.length - 1], p.clone().sub(last).toArray()));
        last = p;
      }
    }
    const tf = F * (TAIL_FLUFF[br.tail] ?? 1);
    if (v2) { /* the tail is part of the skin */ }
    else if (br.tail === 'stub') coat(SPHERE, 'tail', this.tail, this.tail, [0, 0.005, -0.01], [0, 0, 0], [0.025, 0.022, 0.03], tf);
    else { const [pts, r0, r1] = tails[br.tail] ?? tails.long; coat(taperedTube(pts, r0 * T, r1 * T), 'tail', this.tail, this.tail, null, null, undefined, tf); }

    // Legs.
    const P = 0.4 + 0.6 * L; // how much the haunch shrinks with short legs
    this.legs = [];
    const mkFront = (side) => {
      const hip = bone(this.spineF, on(this.spineF, [side * 0.052 * gx, -0.03 * gy, 0.18 * len]));
      if (!v2) coat(taperedTube([[0, 0.02, 0.01], [0, -0.1 * L, -0.005], [0, -0.215 * L, 0]], 0.042 * T, 0.022 * T, 16, 16), 'upperLeg', hip, hip, null, null, undefined, F * 0.7);
      const knee = bone(hip, [0, -0.215 * L, 0]);
      if (!v2) coat(taperedTube([[0, 0.01, 0], [0, -0.1 * L, 0.004], [0, -0.2 * L, 0.008]], 0.021 * T, 0.016 * T, 12, 12), 'lowerLeg', knee, knee, null, null, undefined, F * 0.35);
      const ankle = bone(knee, [0, -0.2 * L, 0.008]);
      if (!v2) coat(SPHERE, 'paw', ankle, ankle, [0, -0.004, 0.014], [0, 0, 0], [0.022 * T, 0.014 * T, 0.032 * T], F * 0.2);
      return { hip, knee, ankle, front: true, side, rest: [0.08, -0.08, 0] };
    };
    const mkRear = (side) => {
      const hip = bone(this.spineR, on(this.spineR, [side * 0.06 * gx, 0.0, -0.28 * len]));
      if (!v2) coat(SPHERE, 'upperLeg', hip, hip, [0, -0.06 * P, 0.005], [0.15, 0, 0], [0.048 * gx * T * 0.9, 0.115 * P, 0.072 * T], F * 0.9);
      const knee = bone(hip, [0, -0.17 * L, 0]);
      if (!v2) coat(taperedTube([[0, 0.03, 0.01], [0, -0.08 * L, 0], [0, -0.17 * L, 0]], 0.034 * T, 0.018 * T, 12, 12), 'lowerLeg', knee, knee, null, null, undefined, F * 0.5);
      const ankle = bone(knee, [0, -0.17 * L, 0]);
      if (!v2) coat(taperedTube([[0, 0.01, 0], [0, -0.125 * L, 0]], 0.019 * T, 0.015 * T, 8, 12), 'lowerLeg', ankle, ankle, null, null, undefined, F * 0.3);
      const foot = bone(ankle, [0, -0.125 * L, 0]);
      if (!v2) coat(SPHERE, 'paw', foot, foot, [0, -0.002, 0.014], [0, 0, 0], [0.022 * T, 0.014 * T, 0.032 * T], F * 0.2);
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
    for (const [m, kind, ref] of cached ? [] : coatParts) {
      const p = m.geometry.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const toRef = new THREE.Matrix4().copy(ref.matrixWorld).invert().multiply(m.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        d.copy(v).applyMatrix4(m.matrixWorld);
        l.copy(v).applyMatrix4(toRef);
        n.set(d.x / gx, (d.y - this.bodyY) / gy + 0.48, d.z / len);
        br.coat(kind, l, n, i / p.count, c);
        const mo = m.geometry.attributes.mouth?.getX(i);
        if (mo) c.copy(mo > 1.5 ? LIPS : MOUTH);
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      m.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    if (!cached) GEO_CACHE.set(cacheKey, coatParts.map(([m]) => m.geometry));
    if (v2) {
      // Dogs 2.0: the smooth skin, bound to the bones in this rest pose.
      this.skinBones = [this.body, this.spineF, this.spineR, this.chest, this.neck, this.head, ...this.tailBones, ...this.legs.flatMap((Lg) => [Lg.hip, Lg.knee, Lg.ankle, Lg.foot].filter(Boolean))];
      this.skin = buildSkin(this, br);
      // Where the front of the chest is, under the neck (a bandana hangs there).
      const sg = this.skin.geometry;
      if (sg.userData.chestZ === undefined) {
        const p = sg.attributes.position, yb = this.bodyY + 0.035 * gy - 0.045;
        let front = -Infinity;
        for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.02 && Math.abs(p.getY(i) - yb) < 0.025) front = Math.max(front, p.getZ(i));
        sg.userData.chestZ = Number.isFinite(front) ? front : null;
      }
      this.dims.chestZ = sg.userData.chestZ;
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
    const cy = 0.085 * NL, cr = 0.049 * nr + (this.dims.F ?? 0) * 1.3; // sits on top of fluffy fur
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
    const { gx, gy, len, F, HF } = this.dims;
    const c = (slot) => COSMETIC[look[slot]];
    if (this.breedCollar) this.breedCollar.visible = !c('collar');
    if (this.topknot) this.topknot.visible = !c('hat'); // the bow comes off for a hat

    if (c('collar')) keep(this.makeCollar(c('collar').color, 0xf2c14e));

    if (c('neck')?.style === 'bowtie') {
      // A dapper bow tie under the chin.
      const g = keep(group(this.neck, [0, 0.04 * this.dims.NL, 0.05 * this.dims.nr + F * 1.3], [0.4, 0, 0]));
      for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.022, 0.04, 4), c('neck').color, g, [s * 0.02, 0, 0], [0, 0, (s * Math.PI) / 2], [1, 1, 0.5]);
      mesh(SPHERE, c('neck').color, g, [0, 0, 0.004], [0, 0, 0], [0.009, 0.009, 0.008]);
    } else if (c('neck')?.style === 'daisies') {
      keep(daisyChain(this.neck, this.dims)); // Pepper's daisy chain
    } else if (c('neck')?.style === 'scarf') {
      // A woolly scarf (from the flock's own wool): stripy, wound round the neck, two ends hanging down in front.
      const { NL, nr } = this.dims, cy = 0.085 * NL - 0.006, R = 0.049 * nr + F * 1.3 + 0.012, col = c('neck').color, cream = 0xf4ecdc;
      const ring = keep(group(this.neck, [0, cy, 0.006], [Math.PI / 2 + 0.3, 0, 0]));
      bakedMesh([{ geo: new THREE.TorusGeometry(R, 0.016, 8, 32), color: col, colors: (i, v) => (Math.floor((Math.atan2(v.y, v.x) + Math.PI) / (Math.PI / 6)) % 2 ? col : cream) }], ring);
      const ends = keep(group(this.neck, [0.018, cy - 0.02, R + 0.008], [0.35, 0, 0.12]));
      for (const [x, len, tilt] of [[0, 0.075, 0.08], [0.024, 0.06, -0.12]]) {
        bakedMesh([{ geo: new THREE.BoxGeometry(0.022, len, 0.008, 1, 6, 1), color: col, pos: [x, -len / 2, 0], rot: [0, 0, tilt], colors: (i, v) => (Math.floor((-v.y + 0.5) / 0.018) % 2 ? cream : col) }], ends);
      }
    } else if (c('neck')) {
      // Bandana: a soft triangle hanging at the front of the chest (smooth dogs: on the skin there).
      const sp = this.spineF, o = sp === this.body ? [0, 0, 0] : sp.position.toArray();
      const z = Math.max(0.255 * len + F * 1.4, (this.dims.chestZ ?? -1) + 0.004);
      const g = keep(group(sp, [-o[0], 0.035 * gy - o[1], z - o[2]], [0.25, 0, 0]));
      const cone = new THREE.ConeGeometry(0.075, 0.13, 3, 1);
      cone.rotateZ(Math.PI); cone.rotateY(Math.PI / 6);
      mesh(cone, c('neck').color, g, [0, -0.045, 0.012], [0, 0, 0], [gx, 1, 0.32]);
      mesh(new THREE.TorusGeometry(0.06 * gx, 0.012, 6, 20, Math.PI), c('neck').color, g, [0, 0.012, -0.012], [Math.PI / 2 + 0.2, 0, Math.PI]);
    }

    const hat = c('hat');
    if (hat) {
      const g = keep(group(this.head, [0, 0.06 + (HF / this.breed.headW) * 0.8, -0.012], [0.15, 0, 0]));
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
      } else if (hat.id === 'hat-flatcap') {
        mesh(new THREE.SphereGeometry(0.047, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat.color, g, [0, -0.004, -0.004], [0, 0, 0], [1, 0.55, 1.08]);
        mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 18, 1, false, -Math.PI / 2, Math.PI), hat.color, g, [0, 0.0, 0.024], [0.12, Math.PI, 0], [1, 1, 1.15]);
        mesh(SPHERE, 0x6a5a48, g, [0, 0.022, 0], [0, 0, 0], [0.006, 0.004, 0.006]);
      } else if (hat.id === 'hat-acorn') {
        // An acorn cup, worn at a jaunty angle (Nut & Meg's present), with its little stalk.
        mesh(new THREE.SphereGeometry(0.047, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat.color, g, [0, -0.006, -0.004], [0, 0, 0.12], [1, 0.62, 1]);
        mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 28), 0x6e4626, g, [0, -0.004, -0.004], [Math.PI / 2, 0, 0.12]);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mesh(SPHERE, 0x7a4e2c, g, [Math.cos(a) * 0.03, 0.016, Math.sin(a) * 0.03 - 0.004], [0, 0, 0], [0.007, 0.004, 0.007]); } // knobbly
        mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.026, 8), 0x5a3a20, g, [0.004, 0.036, -0.004], [0, 0, -0.35]);
      } else if (hat.id === 'hat-bobble') {
        // A woolly bobble hat (for building snowmen): stripy, with a big pom-pom.
        mesh(new THREE.SphereGeometry(0.047, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat.color, g, [0, -0.004, -0.004], [0, 0, 0], [1, 1.2, 1]);
        mesh(new THREE.CylinderGeometry(0.0478, 0.0465, 0.012, 18, 1, true), 0xf7f3ea, g, [0, 0.017, -0.004]);
        mesh(new THREE.TorusGeometry(0.046, 0.009, 8, 24), 0xf7f3ea, g, [0, -0.004, -0.004], [Math.PI / 2, 0, 0]);
        mesh(SPHERE, 0xf7f3ea, g, [0, 0.062, -0.004], [0, 0, 0], [0.019, 0.019, 0.019]);
      } else if (hat.id === 'hat-leaves') {
        // A crown of autumn leaves on a twig.
        mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 24), 0x7a5232, g, [0, 0.006, 0], [Math.PI / 2, 0, 0]);
        const cols = [0xd9893c, 0xc0632d, 0xe0b04a, 0xb5482a];
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; mesh(SPHERE, cols[i % 4], g, [Math.cos(a) * 0.041, 0.016, Math.sin(a) * 0.041], [0.35, -a, 0.55], [0.017, 0.006, 0.011]); }
      } else if (hat.id === 'hat-bunny') {
        // Bunny ears (for sniffing out eggs), a bit floppy.
        for (const s of [-1, 1]) {
          mesh(SPHERE, hat.color, g, [s * 0.022, 0.066, -0.006], [0.12, 0, s * -0.22], [0.014, 0.05, 0.008]);
          mesh(SPHERE, 0xf2a0b4, g, [s * 0.022, 0.066, 0.0], [0.12, 0, s * -0.22], [0.008, 0.038, 0.004]);
          mesh(SPHERE, hat.color, g, [s * 0.022, 0.018, -0.006], [0, 0, 0], [0.016, 0.012, 0.012]);
        }
      } else if (hat.id === 'hat-postie') {
        // The postman's peaked cap: navy, with a red band.
        mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.034, 20), hat.color, g, [0, 0.014, -0.004]);
        mesh(new THREE.CylinderGeometry(0.0458, 0.0458, 0.009, 20, 1, true), 0xd9534f, g, [0, 0.005, -0.004]);
        mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.005, 18, 1, false, -Math.PI / 2, Math.PI), 0x232b3d, g, [0, 0.0, 0.026], [0.12, Math.PI, 0], [1, 1, 1.15]);
        mesh(SPHERE, 0xe0b04a, g, [0, 0.016, 0.042], [0, 0, 0], [0.006, 0.006, 0.003]); // a little badge
      } else if (hat.style === 'mask') { // a robber's mask across the eyes, which peep out through white holes
        const hf = this.dims.HF / this.breed.headW, es = this.breed.eyeSize ?? 1, m = keep(group(this.head));
        const o = hf * 0.6; // (fluffy faces: on top of the fur)
        for (const s of [-1, 1]) {
          const x = s * (0.036 + o), y = 0.026 + hf * 0.2, z = 0.035 + o;
          mesh(SPHERE, hat.color, m, [x + s * 0.003, y + 0.001, z - 0.003], [0, s * 0.35, s * 0.22], [0.028 * es, 0.019 * es, 0.007]);
          mesh(SPHERE, 0xf4efe6, m, [x, y, z - 0.0015], [0, s * 0.35, 0], [0.017 * es, 0.018 * es, 0.0095]);
          mesh(SPHERE, hat.color, m, [s * (0.046 + o), 0.03, 0.002], [0, 0, 0], [0.005, 0.009, 0.032]); // the band round the side
          mesh(SPHERE, hat.color, m, [s * 0.01, 0.022, -0.062 - o], [0.5, s * 0.6, 0], [0.004, 0.016, 0.006]); // a tail of the knot
        }
        mesh(SPHERE, hat.color, m, [0, 0.044 + hf * 0.3, 0.046 + o], [0.45, 0, 0], [0.026, 0.006, 0.012]); // across the bridge of the nose
        mesh(SPHERE, hat.color, m, [0, 0.034, -0.054 - o], [0, 0, 0], [0.011, 0.01, 0.008]);                // the knot at the back
      } else if (hat.id === 'hat-straw') {
        // Farmer Mabel's straw hat: a wide brim, a red band, and a daisy tucked into it.
        mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.006, 24), hat.color, g, [0, -0.002, -0.004]);
        mesh(new THREE.CylinderGeometry(0.038, 0.043, 0.036, 20), hat.color, g, [0, 0.016, -0.004]);
        mesh(new THREE.CylinderGeometry(0.0436, 0.0436, 0.011, 20, 1, true), 0xd9534f, g, [0, 0.007, -0.004]);
        mesh(SPHERE, 0xfbf7ee, g, [0.043, 0.008, 0.008], [0, 0, 0], [0.004, 0.009, 0.009]);
        mesh(SPHERE, 0xf2c14e, g, [0.046, 0.008, 0.008], [0, 0, 0], [0.003, 0.004, 0.004]);
      } else if (hat.id === 'hat-wizard') {
        mesh(new THREE.ConeGeometry(0.038, 0.14, 18), hat.color, g, [0, 0.07, -0.008], [-0.15, 0, 0]);
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.005, 24), hat.color, g, [0, 0.002, 0]);
        for (let i = 0; i < 4; i++) mesh(SPHERE, 0xf6d06a, g, [Math.cos(i * 1.7) * 0.02, 0.04 + i * 0.022, Math.sin(i * 1.7) * 0.02 + 0.012], [0, 0, 0], [0.005, 0.005, 0.005]);
      }
    }
  }

  /**
   * Carry something in the mouth (or nothing: null). `hold` = { pos, rot } in head space (see
   * carryables.js). It keeps its real size whatever size the dog is.
   */
  hold(obj, hold = {}) {
    for (const c of [...this.mouth.children]) this.mouth.remove(c);
    if (!obj) return;
    obj.scale.setScalar(1 / (this.breed.size * this.breed.headW));
    obj.position.set(...(hold.pos ?? [0, 0, 0]));
    obj.rotation.set(...(hold.rot ?? [0, 0, 0]));
    this.mouth.add(obj);
  }

  bark() { this.barkT = 0.45; }
  /** Show off: 'bow' | 'spin' | 'sit' | 'roll' | 'howl' | 'dance' (see EMOTES in dog.js). */
  emote(kind) { if (EMOTE_TIME[kind]) { this.emoteKind = kind; this.emoteT = EMOTE_TIME[kind]; } }
  stopEmote() { this.emoteT = Math.min(this.emoteT ?? 0, 0.25); }
  jump() { this.squash = -0.25; }
  land(k = 1) { this.squash = 0.28 * k; }
  shake() { this.shakeT = 1.3; }

  /** Pose for the current emote, blended in by k (0..1). */
  poseEmote(t, k) {
    const B = this.body, lerpTo = (o, key, v) => (o[key] += (v - o[key]) * k);
    const hk = 0.4 + 0.6 * this.legScale, spine = this.spineF !== B;
    this.emoteK = k;
    switch (this.emoteKind) {
      case 'bow': // elbows down, bottom up, tail going mad
        lerpTo(B.rotation, 'x', 0.42);
        B.position.y -= 0.05 * hk * k;
        this.legs.forEach((L) => { if (L.front) { lerpTo(L.hip.rotation, 'x', -0.9); lerpTo(L.knee.rotation, 'x', 1.6); } });
        this.tail.rotation.y = Math.sin(t * 22) * 0.7;
        lerpTo(this.neck.rotation, 'x', 0.4);
        break;
      case 'sit':
      case 'howl': { // bottom down, front legs straight (howl: nose to the sky)
        lerpTo(B.rotation, 'x', -0.55);
        B.position.y -= 0.07 * hk * k;
        this.legs.forEach((L) => {
          if (L.front) { lerpTo(L.hip.rotation, 'x', 0.55); lerpTo(L.knee.rotation, 'x', -0.1); }
          else { lerpTo(L.hip.rotation, 'x', -1.4); lerpTo(L.knee.rotation, 'x', 1.9); lerpTo(L.ankle.rotation, 'x', -1.1); }
        });
        if (this.emoteKind === 'howl') { lerpTo(this.neck.rotation, 'x', -0.2); lerpTo(this.head.rotation, 'x', -1.3); }
        break;
      }
      case 'spin': // round and round after that tail
        B.rotation.y += ((EMOTE_TIME.spin - this.emoteT) / EMOTE_TIME.spin) * Math.PI * 4 * k;
        B.rotation.z += Math.sin(t * 30) * 0.08 * k;
        if (spine) { this.spineF.rotation.y += 0.45 * k; this.spineR.rotation.y -= 0.45 * k; } // curled up after it
        break;
      case 'roll': // belly up for a tummy rub, paws waving
        lerpTo(B.rotation, 'z', Math.PI);
        B.position.y -= (this.bodyY - 0.11) * k;
        this.legs.forEach((L, i) => { L.hip.rotation.x += Math.sin(t * 9 + i) * 0.35 * k; L.knee.rotation.x += 0.6 * k; });
        this.tail.rotation.y = Math.sin(t * 16) * 0.8;
        break;
      case 'dance': // happy hops and wiggles
        B.position.y += Math.abs(Math.sin(t * 11)) * 0.07 * hk * k;
        B.rotation.z += Math.sin(t * 11) * 0.18 * k;
        if (spine) { this.spineF.rotation.y += Math.sin(t * 11) * 0.15 * k; this.spineR.rotation.y += Math.sin(t * 11) * 0.15 * k; } // a wiggle
        this.tail.rotation.y = Math.sin(t * 24) * 0.8;
        this.legs.forEach((L) => { if (L.front) L.hip.rotation.x += Math.sin(t * 11) * 0.5 * k; });
        break;
    }
  }

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

    // The spine (smooth dogs): the back arches and stretches through a gallop and curves into turns.
    if (this.spineF !== B) {
      this.curve = lerp(this.curve ?? 0, THREE.MathUtils.clamp((s.turnRate ?? 0) * 0.03 * moving, -0.28, 0.28), 1 - Math.exp(-dt * 6));
      const flex = -Math.sin(P + 0.5) * 0.12 * g; // + = arched
      this.spineF.rotation.set(flex + this.sniff * 0.06, this.curve, 0);
      this.spineR.rotation.set(-flex, -this.curve, 0);
    }

    // Whippet shiver: random little shivers when standing still (they're always cold!).
    this.shiverT -= dt * (1 - moving);
    if (this.shiverT < 0) { this.shiver = br.shivers ? 1.2 : 0; this.shiverT = 7 + Math.random() * 8; }
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
    const wagK = br.tail === 'curl' ? 0.45 : 1; // curly tails just wiggle
    this.tail.rotation.y = Math.sin(t * lerp(6, 16, this.wag)) * lerp(0.2, 0.6, this.wag) * (1 - g * 0.7) * wagK;
    this.tail.rotation.x = UP_TAILS.has(br.tail) ? 0.2 - g * (br.tail === 'up' ? 0.6 : 0.4) : -g * 1.0 - this.wag * 0.25;
    if (this.tailBones) { // a swish that ripples down the tail
      const f = lerp(6, 16, this.wag), a = lerp(0.08, 0.2, this.wag) * (1 - g * 0.7) * wagK;
      for (let i = 1; i < this.tailBones.length; i++) this.tailBones[i].rotation.y = Math.sin(t * f - 0.7 * i) * a * (0.8 + 0.1 * i);
    }

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

    // Emotes: blend into the pose, hold it, blend back out.
    this.emoteT = Math.max(0, (this.emoteT ?? 0) - dt);
    if (this.emoteT > 0) this.poseEmote(t, Math.min(1, this.emoteT / 0.25, (EMOTE_TIME[this.emoteKind] - this.emoteT) / 0.25 + 0.0001));

    // Eyes blink; brows lift when happy (grumpy dogs just scowl harder); tongue out when galloping.
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    this.eyes.forEach((e) => (e.scale.y = this.eyeY * blink * (br.grumpy ? 0.75 : 1)));
    this.brows.forEach((b) => (b.position.y = this.browY + (br.grumpy ? -0.004 : this.wag * 0.006) + this.sniff * -0.004));
    this.tongue.visible = g > 0.4;
    this.tongue.rotation.x = 0.3 + Math.sin(t * 20) * 0.15;

    // The mouth: snaps open to bark, hangs open panting (tongue out), opens wide to howl, and holds
    // whatever is being carried.
    const howl = this.emoteT > 0 && this.emoteKind === 'howl' ? this.emoteK ?? 0 : 0;
    const open = Math.max(bk * 0.5, g > 0.4 ? 0.2 + Math.sin(t * 20) * 0.04 : 0, howl * 0.45, this.mouth.children.length ? 0.1 : 0);
    this.jaw.rotation.x = lerp(this.jaw.rotation.x, open, 1 - Math.exp(-dt * 18));
  }
}
