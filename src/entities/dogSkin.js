import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { fbm3 } from '../core/rng.js';
import { TORSO, TAILS } from './dogShape.js';

/*
 * Dogs 2.0: one smooth, bendy skin per dog instead of separate parts.
 *
 * A low-poly "cage" is box-modelled from the old dogs' own shapes: the body (wrapped over the
 * haunches), with the neck, four legs and the tail pulled out of it, so every join flows into the
 * body. The cage is nudged until its smoothed surface passes through the points it was built from
 * (so the dog keeps its proportions), then smoothed with two rounds of Catmull–Clark subdivision.
 * Each corner of the cage carries weights for the bones it follows, smoothed along with it, so
 * knees, hips, neck and tail bend softly. The breed's coat painter colours it, blending across the
 * joins, and fluffy breeds get their fur puffed up. The head is still its own piece on the head
 * bone, with the top of the neck tucked up inside it, so every face keeps its exact look.
 */

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const M = 16;      // corners round the body
const RINGS = 21;  // rings along it
const KEEL = 0.25; // the body narrows towards the belly (as the old dogs' did)

// ---------------------------------------------------------------- a small polygon-mesh kit

class Cage {
  constructor() { this.P = []; this.W = []; this.U = []; this.F = []; }
  vert(p, w, u = 0) { this.P.push(p); this.W.push(w); this.U.push(u); return this.P.length - 1; }
  face(...ix) { this.F.push(ix); return this.F.length - 1; }
  /** Take faces out, returning the rim of the hole, in order (the same way round as the faces were). */
  cut(faces) {
    const edges = new Set(), next = new Map();
    for (const f of faces) { const v = this.F[f]; v.forEach((a, i) => edges.add(`${a},${v[(i + 1) % v.length]}`)); }
    for (const f of faces) {
      const v = this.F[f];
      v.forEach((a, i) => { const b = v[(i + 1) % v.length]; if (!edges.has(`${b},${a}`)) next.set(a, b); });
      this.F[f] = null;
    }
    const start = next.keys().next().value, loop = [start];
    for (let v = next.get(start); v !== start; v = next.get(v)) loop.push(v);
    return loop;
  }
  /** Join a rim to the next ring out (same length, lined up) with quads. */
  bridge(a, b) { for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; this.face(a[i], a[j], b[j], b[i]); } }
  /** Flat arrays for smoothing (nb bone weights per corner), leaving out corners no face uses any more (the middles of holes). */
  pack(nb) {
    const F = this.F.filter(Boolean), id = new Int32Array(this.P.length).fill(-1);
    let n = 0;
    for (const f of F) for (const v of f) if (id[v] < 0) id[v] = n++;
    const P = new Float64Array(n * 3), W = new Float64Array(n * nb), U = new Float64Array(n);
    this.P.forEach((p, i) => {
      const j = id[i];
      if (j < 0) return;
      P[j * 3] = p.x; P[j * 3 + 1] = p.y; P[j * 3 + 2] = p.z;
      U[j] = this.U[i];
      for (const [b, w] of Object.entries(this.W[i])) W[j * nb + Number(b)] = w;
    });
    return { P, W, U, F: F.map((f) => f.map((v) => id[v])), n };
  }
}

/**
 * One round of Catmull–Clark subdivision, worked out once for a set of faces: the new faces, the
 * new corner count, and apply(D, k), which smooths any per-corner data (k numbers each) to match.
 */
function ccLevel(F, nv) {
  const nf = F.length, key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const edgeId = new Map(), EA = [], EB = [], EF0 = [], EF1 = [];
  F.forEach((f, i) => f.forEach((a, j) => {
    const b = f[(j + 1) % f.length], e = edgeId.get(key(a, b));
    if (e === undefined) { edgeId.set(key(a, b), EA.length); EA.push(a); EB.push(b); EF0.push(i); EF1.push(i); } else EF1[e] = i;
  }));
  const ne = EA.length;
  const vf = Array.from({ length: nv }, () => []), ve = Array.from({ length: nv }, () => []);
  F.forEach((f, i) => f.forEach((v) => vf[v].push(i)));
  for (let e = 0; e < ne; e++) { ve[EA[e]].push(e); ve[EB[e]].push(e); }
  const eOf = (a, b) => nv + edgeId.get(key(a, b)), F2 = [];
  F.forEach((f, i) => f.forEach((v, j) => F2.push([v, eOf(v, f[(j + 1) % f.length]), nv + ne + i, eOf(f[(j + f.length - 1) % f.length], v)])));
  const apply = (D, k) => {
    const out = new Float64Array((nv + ne + nf) * k), eo = nv * k, fo = (nv + ne) * k;
    // Face points: the middle of each face.
    F.forEach((f, i) => { const s = 1 / f.length; for (const v of f) for (let c = 0; c < k; c++) out[fo + i * k + c] += D[v * k + c] * s; });
    // Edge points: the edge's ends and the two faces' middles.
    for (let e = 0; e < ne; e++) {
      const a = EA[e] * k, b = EB[e] * k, f0 = fo + EF0[e] * k, f1 = fo + EF1[e] * k;
      for (let c = 0; c < k; c++) out[eo + e * k + c] = (D[a + c] + D[b + c] + out[f0 + c] + out[f1 + c]) / 4;
    }
    // Corners: (Q + 2R + (n − 3)P) / n.
    for (let v = 0; v < nv; v++) {
      const fs = vf[v], es = ve[v], n = es.length;
      if (!n) continue;
      for (let c = 0; c < k; c++) {
        let q = 0, r = 0;
        for (const f of fs) q += out[fo + f * k + c];
        for (const e of es) r += D[EA[e] * k + c] + D[EB[e] * k + c];
        out[v * k + c] = (q / fs.length + r / n + (n - 3) * D[v * k + c]) / n;
      }
    }
    return out;
  };
  return { F: F2, n: nv + ne + nf, apply };
}

/** Smoothing shrinks shapes (thin ones most): nudge the cage until the smooth surface passes through its corners. */
function fitCage(P0, smooth, n, rounds = 5) {
  const P = Float64Array.from(P0);
  for (let r = 0; r < rounds; r++) {
    const S = smooth(P, 3);
    for (let i = 0; i < n * 3; i++) P[i] += P0[i] - S[i];
  }
  return P;
}

// ---------------------------------------------------------------- building a dog

/**
 * The cage, in the dog's rest pose (bones posed, root at the origin, unscaled), from the same
 * measurements the old part-built dogs used. dog.skinBones: the bones, in skeleton order.
 */
function buildCage(dog, br) {
  const { L, T, len, gx, gy, tuck, neck: NL } = br;
  const bones = dog.skinBones, bi = (b) => bones.indexOf(b);
  const W = (pairs) => Object.fromEntries(pairs.map(([b, w]) => [bi(b), w]));
  const at = (bone, x, y, z) => V(x, y, z).applyMatrix4(bone.matrixWorld);
  const local = (bone, p) => p.clone().applyMatrix4(bone.matrixWorld.clone().invert());
  const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
  const cage = new Cage(), kept = { legs: [] };
  const B = dog.body, bodyInv = B.matrixWorld.clone().invert();
  const SF = dog.spineF, SR = dog.spineR, LUNGS = dog.chest;
  const P = 0.4 + 0.6 * L; // (as in dog.js: shorter legs, smaller haunches)
  // Along the back: the hips, the middle and the chest bend it; the ribs breathe a little.
  const spine = (z) => {
    const zr = SR.position.z, zf = SF.position.z;
    let pairs;
    if (z <= zr) pairs = [[SR, 1]];
    else if (z >= zf) pairs = [[SF, 1]];
    else if (z < 0) { const f = THREE.MathUtils.smoothstep(z, zr, 0); pairs = [[SR, 1 - f], [B, f]]; }
    else { const f = THREE.MathUtils.smoothstep(z, 0, zf); pairs = [[B, 1 - f], [SF, f]]; }
    const lw = 0.7 * Math.exp(-(((z - zf - 0.02 * len) / (0.1 * len)) ** 2));
    return lw > 0.02 ? [...pairs.map(([b, w]) => [b, w * (1 - lw)]), [LUNGS, lw]] : pairs;
  };

  // The body's measurements (as the old lofted body), and its belly line.
  const st = TORSO.map(([z, top, bot, w, flat]) => [z * len, top * gy, lerp(flat, bot, tuck) * gy, w * gx]);
  const belly = (z) => {
    for (let i = 0; i < st.length - 1; i++) if (z <= st[i + 1][0]) return lerp(st[i][2], st[i + 1][2], Math.max(0, (z - st[i][0]) / (st[i + 1][0] - st[i][0])));
    return st[st.length - 1][2];
  };

  // The haunches: the old dogs' big round thighs (on the hip bones). The body swells over them, fading
  // out towards the belly line; below that, a thigh is part of its leg.
  const ELLIPSOID = new THREE.Matrix4().compose(V(0, -0.06 * P, 0.005), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0)), V(0.048 * gx * T * 0.9, 0.115 * P, 0.072 * T));
  const FADE = 0.4 * 0.115 * P; // (how far below the belly line a haunch fades away)
  const haunches = dog.legs.filter((Lg) => !Lg.front).map((Lg) => ({
    leg: Lg, hip: Lg.hip,
    inv: Lg.hip.matrixWorld.clone().multiply(ELLIPSOID).invert(),
    cut: at(B, 0, belly(at(Lg.hip, 0, 0, 0).applyMatrix4(bodyInv).z), 0).y,
  }));
  // How far out the body reaches along a ray from o (unit direction d) whose own surface is r away: over a haunch, if any.
  const reach = (o, d, r) => {
    let best = { t: r, hip: null };
    for (const h of haunches) {
      const o2 = o.clone().applyMatrix4(h.inv), d2 = o.clone().add(d).applyMatrix4(h.inv).sub(o2);
      const a = d2.dot(d2), b = 2 * o2.dot(d2), c = o2.dot(o2) - 1, disc = b * b - 4 * a * c;
      if (disc <= 0) continue;
      const out = (-b + Math.sqrt(disc)) / (2 * a);
      if (out <= r) continue;
      const f = THREE.MathUtils.smoothstep(o.y + d.y * out, h.cut - FADE, h.cut);
      const t = r + (out - r) * f;
      if (t > best.t) best = { t, hip: h.hip };
    }
    return best;
  };

  // 1. The body: rings along the old lofted body, as a closed tube.
  const A = curve(st.map(([z, t, b]) => [z, t, b])), Wd = curve(st.map(([z, , , w]) => [z, w, 0]));
  const sec = [], ring = [];
  for (let i = 0; i < RINGS; i++) {
    const a = A.getPoint(i / (RINGS - 1)), wd = Wd.getPoint(i / (RINGS - 1));
    const z = a.x, cy = (a.y + a.z) / 2, h = Math.max(1e-4, (a.y - a.z) / 2), hw = Math.max(1e-4, wd.y);
    sec.push({ z, cy, h, hw });
    const o = at(B, 0, cy, z);
    ring.push(Array.from({ length: M }, (_, k) => {
      const s = Math.sin((k / M) * TAU), c = Math.cos((k / M) * TAU);
      const p = at(B, c * hw * (1 - KEEL * Math.max(0, -s)), cy + s * h, z);
      const r = p.distanceTo(o), d = p.clone().sub(o).normalize(), hit = reach(o, d, r);
      if (!hit.hip || hit.t <= r * 1.001) return cage.vert(p, W(spine(z)));
      const k2 = Math.min(0.6, ((hit.t - r) / r) * 1.5); // (the haunch moves a little with its leg)
      return cage.vert(o.clone().addScaledVector(d, hit.t), W([...spine(z).map(([b, w]) => [b, w * (1 - k2)]), [hit.hip, k2]]));
    }));
  }
  const tf = []; // tf[i][k]: the face between rings i and i+1, corners k and k+1
  for (let i = 0; i < RINGS - 1; i++) tf.push(ring[i].map((_, k) => { const k1 = (k + 1) % M; return cage.face(ring[i][k], ring[i][k1], ring[i + 1][k1], ring[i + 1][k]); }));
  cage.face(...[...ring[0]].reverse()); // rump
  cage.face(...ring[RINGS - 1]);        // chest
  const patch = (i0, i1, k0, k1) => { const fs = []; for (let i = i0; i < i1; i++) for (let k = k0; k < k1; k++) fs.push(tf[i][(k + M) % M]); return cage.cut(fs); };
  const nearest = (z) => sec.reduce((best, s, i) => (Math.abs(s.z - z) < Math.abs(sec[best].z - z) ? i : best), 0);

  // Inside the body (or a haunch)? For starting legs, neck and tail where they come out of it.
  const inside = (p) => {
    if (haunches.some((h) => p.y > h.cut && p.clone().applyMatrix4(h.inv).lengthSq() < 1)) return true;
    const q = p.clone().applyMatrix4(bodyInv);
    if (q.z <= sec[0].z || q.z >= sec[RINGS - 1].z) return false;
    let i = 0;
    while (sec[i + 1].z < q.z) i++;
    const f = (q.z - sec[i].z) / Math.max(1e-6, sec[i + 1].z - sec[i].z), e = (key) => lerp(sec[i][key], sec[i + 1][key], f);
    const s = (q.y - e('cy')) / e('h');
    return Math.abs(s) < 1 && Math.abs(q.x) < Math.sqrt(1 - s * s) * e('hw') * (1 - KEEL * Math.max(0, -s));
  };

  // Pull a chain of rings out of a hole. Each ring: { bone, c, b, n, rx, ry, w, u }: centre and axes in the bone's space.
  const extrude = (rim, rings, cap = true) => {
    // Each corner of the rim gets a direction round the rings: its angle round the middle of the hole
    // (seen along the first ring), evened out halfway towards equal steps.
    const r0 = rings[0], b0 = V(...r0.b), n0 = V(...r0.n);
    const pts = rim.map((v) => local(r0.bone, cage.P[v]));
    const mid = pts.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / pts.length);
    const raw = pts.map((p) => { const d = p.clone().sub(mid); return Math.atan2(d.dot(n0), d.dot(b0)); });
    for (let i = 1; i < raw.length; i++) while (Math.abs(raw[i] - raw[i - 1]) > Math.PI) raw[i] -= Math.sign(raw[i] - raw[i - 1]) * TAU;
    const dir = Math.sign(raw[raw.length - 1] - raw[0]) || 1;
    const ang = raw.map((a, i) => lerp(a, raw[0] + (dir * TAU * i) / raw.length, 0.5));
    let prev = rim;
    for (const r of rings) {
      const c = V(...r.c), b = V(...r.b), n = V(...r.n);
      const cur = ang.map((a) => cage.vert(at(r.bone, ...c.clone().addScaledVector(b, Math.cos(a) * r.rx).addScaledVector(n, Math.sin(a) * r.ry).toArray()), r.w, r.u ?? 0));
      cage.bridge(prev, cur);
      prev = cur;
    }
    if (cap) cage.face(...prev);
  };
  // A ring round a tube (which runs in its bone's y–z plane), as the old dogs' tubes were.
  const tubeRing = (bone, cv, u, r, w) => {
    const t = cv.getTangentAt(u);
    return { bone, c: cv.getPointAt(u).toArray(), b: [1, 0, 0], n: V().crossVectors(t, V(1, 0, 0)).normalize().toArray(), rx: r, ry: r, w };
  };
  // Rings from the first one clear of the body (a little way back along the chain); the last few always stay.
  const clear = (rings, keep) => {
    const ctr = (r) => at(r.bone, ...r.c);
    let i = 0;
    while (i < rings.length - keep) {
      const r = rings[i], dir = ctr(rings[i + 1]).sub(ctr(r)).normalize();
      if (!inside(ctr(r).addScaledVector(dir, -0.3 * Math.max(r.rx, r.ry)))) break;
      i++;
    }
    return rings.slice(i);
  };

  // 2. The neck: out of the top of the chest along the old neck's curve, ending up inside the head.
  const N = dog.neck, H = dog.head, nr = Math.max(gx, gy);
  const nc = curve([[0, -0.03, -0.01], [0, 0.06 * NL, 0.012], [0, 0.13 * NL, 0.008], [0, 0.18 * NL, -0.005]]);
  const neckRings = [[0.25, [[SF, 0.35], [N, 0.65]]], [0.42, [[SF, 0.1], [N, 0.9]]], [0.6, [[N, 1]]], [0.76, [[N, 0.7], [H, 0.3]]], [0.9, [[N, 0.3], [H, 0.7]]]]
    .map(([u, w]) => tubeRing(N, nc, u, lerp(0.06, 0.036, u) * nr, W(w)));
  const neck = clear(neckRings, 2);
  const ni = Math.min(RINGS - 2, Math.max(1, nearest(at(neck[0].bone, ...neck[0].c).applyMatrix4(bodyInv).z - 0.03 * len)));
  extrude(patch(ni - 1, ni + 1, 2, 6), neck);
  kept.neck = neck.length;

  // 3. Legs: the old legs' shapes joint by joint, from where they come out under the body down to round paws.
  const paw = (bone, cy, w0, w) => [0.45, -0.2, -0.7, -0.95].map((t, i) => {
    const s = Math.sqrt(1 - t * t);
    return { bone, c: [0, cy + t * 0.014 * T, 0.014], b: [1, 0, 0], n: [0, 0, 1], rx: 0.022 * T * s, ry: 0.032 * T * s, w: i ? w : w0 };
  });
  for (const Lg of dog.legs) {
    const { hip, knee, ankle, foot, front, side } = Lg;
    let rings;
    if (front) {
      const up = curve([[0, 0.02, 0.01], [0, -0.1 * L, -0.005], [0, -0.215 * L, 0]]), lo = curve([[0, 0.01, 0], [0, -0.1 * L, 0.004], [0, -0.2 * L, 0.008]]);
      const ur = (u) => lerp(0.042, 0.022, u) * T, lr = (u) => lerp(0.021, 0.016, u) * T;
      rings = [
        tubeRing(hip, up, 0.3, ur(0.3), W([[hip, 0.8], [SF, 0.2]])),
        tubeRing(hip, up, 0.6, ur(0.6), W([[hip, 1]])),
        tubeRing(hip, up, 0.85, ur(0.85), W([[hip, 0.85], [knee, 0.15]])),
        { bone: knee, c: [0, 0, 0], b: [1, 0, 0], n: [0, 0, 1], rx: 0.0215 * T, ry: 0.0215 * T, w: W([[hip, 0.5], [knee, 0.5]]) },
        tubeRing(knee, lo, 0.35, lr(0.35), W([[knee, 1]])),
        tubeRing(knee, lo, 0.7, lr(0.7), W([[knee, 0.85], [ankle, 0.15]])),
        ...paw(ankle, -0.004, W([[knee, 0.2], [ankle, 0.8]]), W([[ankle, 1]])),
      ];
    } else {
      // The rest of the thigh, below the body (only above the knee, so the leg never folds back up),
      // then a knee as wide as the thigh still is there.
      const h = haunches.find((x) => x.leg === Lg), ty = 0.115 * P, kw = at(knee, 0, 0, 0);
      const sx = 0.048 * gx * T * 0.9, sz = 0.072 * T;
      const thigh = [0.3, 0, -0.3, -0.55, -0.8].map((t) => {
        const s = Math.sqrt(1 - t * t);
        return { bone: hip, c: [0, -0.06 * P + t * ty * Math.cos(0.15), 0.005 + t * ty * Math.sin(0.15)], b: [1, 0, 0], n: [0, 0, 1], rx: sx * s, ry: sz * s, w: W([[hip, 1]]) };
      }).filter((r) => at(hip, ...r.c).y > kw.y + 0.015);
      const q = kw.clone().applyMatrix4(h.inv), ks = Math.abs(q.y) < 1 ? Math.sqrt(1 - q.y * q.y) : 0;
      const lo = curve([[0, 0.03, 0.01], [0, -0.08 * L, 0], [0, -0.17 * L, 0]]), an = curve([[0, 0.01, 0], [0, -0.125 * L, 0]]);
      const lr = (u) => lerp(0.034, 0.018, u) * T, ar = (u) => lerp(0.019, 0.015, u) * T;
      rings = [
        ...thigh,
        { bone: knee, c: [0, 0.005, 0.006], b: [1, 0, 0], n: [0, 0, 1], rx: Math.max(0.034 * T, sx * ks), ry: Math.max(0.036 * T, sz * ks), w: W([[hip, 0.5], [knee, 0.5]]) },
        tubeRing(knee, lo, 0.45, lr(0.45), W([[knee, 1]])),
        tubeRing(knee, lo, 0.8, lr(0.8), W([[knee, 0.8], [ankle, 0.2]])),
        tubeRing(ankle, an, 0.3, ar(0.3), W([[knee, 0.2], [ankle, 0.8]])),
        tubeRing(ankle, an, 0.75, ar(0.75), W([[ankle, 0.85], [foot, 0.15]])),
        ...paw(foot, -0.002, W([[ankle, 0.2], [foot, 0.8]]), W([[foot, 1]])),
      ];
    }
    rings = clear(rings, 4);
    kept.legs.push(rings.length);
    // The hole: a patch on the underside, two corners wide and as long as the leg's first ring.
    const z0 = at(rings[0].bone, ...rings[0].c).applyMatrix4(bodyInv).z;
    let i0 = nearest(z0 - rings[0].ry * 0.9), i1 = nearest(z0 + rings[0].ry * 0.9);
    if (i1 - i0 < 2) { const m = Math.round((i0 + i1) / 2); i0 = m - 1; i1 = m + 1; }
    i0 = Math.max(0, i0); i1 = Math.min(RINGS - 1, i1);
    const k = side > 0 ? 14 : 10;
    extrude(patch(i0, i1, k - 1, k + 1), rings);
  }

  // 4. The tail: out of the top of the rump, along the old tail's curve, on its little chain of bones.
  const [pts, r0, r1] = TAILS[br.tail] ?? TAILS.long;
  const tc = curve(pts), chain = dog.tailBones;
  const us = br.tail === 'stub' ? [0.4, 1] : [0.1, 0.3, 0.5, 0.7, 0.88, 1];
  let up = V(0, 1, 0);
  const tailRings = us.map((u) => {
    const p = tc.getPointAt(u), tang = tc.getTangentAt(u).normalize();
    up = up.sub(tang.clone().multiplyScalar(up.dot(tang))).normalize(); // carried along the curve so rings never flip
    if (!Number.isFinite(up.x) || up.lengthSq() < 0.5) up = V(1, 0, 0).cross(tang).normalize();
    const side = V().crossVectors(up, tang).normalize();
    const seg = Math.min(chain.length - 1, Math.floor(u * chain.length * 0.999)), f = u * chain.length - seg;
    const w = u < 0.15 ? W([[SR, 0.4], [chain[0], 0.6]]) : W(seg + 1 < chain.length ? [[chain[seg], 1 - f], [chain[seg + 1], f]] : [[chain[seg], 1]]);
    const r = lerp(r0, r1, u) * T;
    return { bone: chain[0], c: p.toArray(), b: side.toArray(), n: up.toArray(), rx: r, ry: r, w, u };
  });
  const tail = clear(tailRings, 2);
  extrude(patch(0, 2, 3, 5), tail);
  kept.tail = tail.length;

  cage.kept = kept; // (how many rings of each part made it out of the body: for checking)
  return cage;
}

/** Where each bone's part is, for the coat painter: kind, and which bone's space `l` is measured in. */
function partOf(dog, bone) {
  if (bone === dog.head) return 'head';
  if (bone === dog.neck) return 'neck';
  if (dog.tailBones.includes(bone)) return 'tail';
  for (const Lg of dog.legs) {
    if (bone === Lg.hip) return 'upperLeg';
    if (bone === Lg.knee) return 'lowerLeg';
    if (bone === Lg.ankle) return Lg.front ? 'paw' : 'lowerLeg';
    if (bone === Lg.foot) return 'paw';
  }
  return 'body';
}

const SKIN_CACHE = new Map();

/** The finished skin geometry for a breed (built once, shared by every dog of that breed). */
function skinGeometry(dog, br) {
  if (SKIN_CACHE.has(br)) return SKIN_CACHE.get(br);
  const nb = dog.skinBones.length;
  const built = buildCage(dog, br), cage = built.pack(nb);
  const L1 = ccLevel(cage.F, cage.n), L2 = ccLevel(L1.F, L1.n);
  const smooth = (D, k) => L2.apply(L1.apply(D, k), k);
  const mesh = { P: smooth(fitCage(cage.P, smooth, cage.n), 3), W: smooth(cage.W, nb), U: smooth(cage.U, 1), F: L2.F };

  const n = mesh.P.length / 3;
  const index = [];
  for (const f of mesh.F) index.push(f[0], f[1], f[2], f[0], f[2], f[3]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(mesh.P), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  // Bones per vertex: the four strongest.
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const parts = [];
  for (let v = 0; v < n; v++) {
    const ws = [];
    for (let b = 0; b < nb; b++) if (mesh.W[v * nb + b] > 0.002) ws.push([b, mesh.W[v * nb + b]]);
    ws.sort((a, b) => b[1] - a[1]);
    const top = ws.slice(0, 4), sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    top.forEach(([b, w], k) => { skinIndex[v * 4 + k] = b; skinWeight[v * 4 + k] = w / sum; });
    if (!top.length) { skinIndex[v * 4] = 0; skinWeight[v * 4] = 1; }
    parts.push(top.map(([b, w]) => [b, w / sum]));
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  // Fur: puff the surface out, more on fluffy parts (body, ruff, tail), less on legs and face.
  const F = br.fluff ?? 0, CURL = br.curl ?? 0, HF = F * (br.headFluff ?? 0.3);
  const furBy = { body: F, neck: F * 1.15, head: HF, upperLeg: F * 0.8, lowerLeg: F * 0.4, paw: F * 0.2, tail: F * ({ plume: 1.7, feather: 1.6, sabre: 1.3, otter: 0.6, curl: 0.8 }[br.tail] ?? 1) };
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (F > 0) {
    const p = V(), nn = V();
    for (let v = 0; v < n; v++) {
      const amt = parts[v].reduce((s, [b, w]) => s + furBy[partOf(dog, dog.skinBones[b])] * w, 0);
      if (amt <= 0) continue;
      p.fromBufferAttribute(pos, v); nn.fromBufferAttribute(nor, v);
      const tuft = fbm3(p.x * 45 + 11, p.y * 45, p.z * 45 - 7, 3);
      const curls = CURL ? (fbm3(p.x * 170, p.y * 170 + 3, p.z * 170, 2) - 0.5) * CURL : 0;
      p.addScaledVector(nn, amt * (0.55 + tuft * 0.9 + curls * 1.8));
      pos.setXYZ(v, p.x, p.y, p.z);
    }
    geo.computeVertexNormals();
  }

  // Coat: each part painted by the breed's painter (as before), blended across the joins.
  const cols = new Float32Array(n * 3);
  const d = V(), l = V(), nrm = V(), c = new THREE.Color(), acc = new THREE.Color();
  const inv = dog.skinBones.map((b) => b.matrixWorld.clone().invert());
  const NECK = dog.skinBones.indexOf(dog.neck), HEAD = dog.skinBones.indexOf(dog.head), BODY = dog.skinBones.indexOf(dog.body);
  const { gx, gy, len } = br;
  for (let v = 0; v < n; v++) {
    d.fromBufferAttribute(pos, v);
    nrm.set(d.x / gx, (d.y - dog.bodyY) / gy + 0.48, d.z / len);
    // Group the weights by part; paint each part (in its strongest bone's space) and mix.
    const byPart = new Map();
    for (const [b0, w] of parts[v]) {
      const b = b0 === HEAD ? NECK : b0; // (the top of the neck, tucked inside the head, is still neck)
      const kind = partOf(dog, dog.skinBones[b]);
      const e = byPart.get(kind);
      if (!e) byPart.set(kind, { w, b, bw: w }); else { e.w += w; if (w > e.bw) { e.bw = w; e.b = b; } }
    }
    acc.setRGB(0, 0, 0);
    let total = 0;
    for (const [kind, { w, b }] of byPart) {
      if (w < 0.04 && byPart.size > 1) continue;
      l.copy(d).applyMatrix4(inv[kind === 'body' ? BODY : b]); // (the whole back is painted in the body's own space)
      br.coat(kind, l, nrm, mesh.U[v], c);
      acc.r += c.r * w; acc.g += c.g * w; acc.b += c.b * w;
      total += w;
    }
    cols[v * 3] = acc.r / total; cols[v * 3 + 1] = acc.g / total; cols[v * 3 + 2] = acc.b / total;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeBoundingSphere();
  geo.userData.kept = built.kept;
  SKIN_CACHE.set(br, geo);
  return geo;
}

/** A dog's skin, bound to its bones (call with the dog in its rest pose, root at the origin, unscaled). */
export function buildSkin(dog, br) {
  const geo = skinGeometry(dog, br);
  const skin = new THREE.SkinnedMesh(geo, paint(0xffffff, { vertexColors: true, kind: 'skin' }));
  skin.castShadow = skin.receiveShadow = true;
  // Culled like anything else (a dog off-screen, or far down the road, isn't drawn: nor is her shadow), by a
  // sphere round her rest pose with room to spare for the bones moving her about (a stretch, a roll, a jump
  // is the whole dog moving: that's the root). Given here, so three doesn't work one out from every bent vertex.
  skin.boundingSphere = geo.boundingSphere.clone();
  skin.boundingSphere.radius *= 1.5;
  dog.root.add(skin);
  skin.bind(new THREE.Skeleton(dog.skinBones));
  return skin;
}
