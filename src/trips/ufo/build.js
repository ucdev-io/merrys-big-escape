import * as THREE from 'three';
import { paint } from '../../render/watercolorMaterial.js';
import { mergeStatic, collectOccluders } from '../../world/merge.js';
import { blobGeometry } from '../../world/props.js';
import { saucerModel, SAUCER } from '../../entities/saucer.js';
import { tripWorld } from '../kit.js';

/*
 * 🪐 Planet Boing: soft lilac dust, round craters, purple rock stacks to leap up, bouncy mushrooms, crystals, the
 * Blips' little dome houses, and Zib's saucer landed in the middle on its legs (a ramp down from its hatch). Out
 * past the hills, a pink sky full of stars: a big ringed planet, two moons, and a little blue-green one (home!).
 * The ground has real hollows and rises: world.heightAt is the dog's ground (and everything else's).
 * Its own coordinates (0, 0 is under the saucer; the ramp comes down towards +z):
 *
 *                     ✨ big crater             (−z)
 *        🏐 the moon-ball arena          🪨 stack
 *     🏠        🪨 stack       🛸 saucer          🪨🍄 tall stack
 *        crater      🍄            ramp ↓        🍄    🪨 stack
 *     🏠           🍄                                  🏠    (+z)
 */

export const GRAV = 0.33; // how much of Earth's gravity there is here (jumps go three times as high)
const SIZE = 34;          // she can go anywhere |x|, |z| < SIZE
const RIMC = 0xf08a9a;

export const PLAN = {
  SIZE,
  ramp: { z0: 3.1, z1: 6.1, w: 1.5, y0: 1.32, n: 6 }, // from the hatch (z0, y0 high) down to the ground at z1
  craters: [
    { x: 12, z: -13, r: 6.5, d: 1.7 }, { x: -15, z: 9, r: 4.2, d: 1.0 }, { x: -20, z: -9, r: 2.6, d: 0.6 },
    { x: 22, z: 11, r: 2.5, d: 0.6 }, { x: 4, z: 23, r: 3.4, d: 0.8 }, { x: -3, z: -30, r: 2.2, d: 0.5 }, { x: 28, z: -20, r: 3.0, d: 0.7 },
  ],
  flats: [{ x: 0, z: 0, r: 7.5 }, { x: -9, z: -21, r: 6.2 }], // (the saucer's pad, the arena)
  stacks: [
    { x: -11, z: -5, r: 1.6, h: 3.0 }, { x: 9, z: 14, r: 1.4, h: 4.0 }, { x: 24, z: -3, r: 1.3, h: 7.2 }, { x: -25, z: 20, r: 1.5, h: 5.2 },
  ],
  mushrooms: [ // cap: radius, height; v: how fast it boings you up
    { x: -4, z: 12, r: 1.0, y: 1.1, v: 6.6, c: 0xf2a65a }, { x: 21.2, z: -1.0, r: 1.05, y: 1.2, v: 7.8, c: 0xf28ab0 },
    { x: -18, z: -15, r: 0.95, y: 1.0, v: 6.4, c: 0x6fd6c8 }, { x: 14, z: 4, r: 0.9, y: 0.95, v: 6.0, c: 0xf2a65a },
    { x: -22, z: 17, r: 1.0, y: 1.1, v: 7.4, c: 0xb69be0 }, { x: 6, z: -25, r: 0.9, y: 1.0, v: 6.4, c: 0xf28ab0 },
  ],
  houses: [
    { x: -19, z: 23, r: 2.4, c: 0xa8e0c8, face: -0.6 }, { x: -27, z: 3, r: 2.0, c: 0xf6c39a, face: Math.PI / 2 }, { x: 18, z: 22, r: 2.1, c: 0xa9c8f0, face: 0.7 + Math.PI },
  ],
  crystals: [
    { x: -21, z: -24, s: 1.3, c: 0xf7a8d8 }, { x: 4, z: -15, s: 0.8, c: 0x9ff0f0 }, { x: 28, z: 13, s: 1.2, c: 0x9ff0f0 },
    { x: -29, z: -15, s: 1.1, c: 0xf7a8d8 }, { x: -6, z: 26, s: 1.0, c: 0xc6b0ff }, { x: 15, z: -27, s: 1.1, c: 0xc6b0ff }, { x: 30, z: 26, s: 0.9, c: 0xf7a8d8 },
  ],
  arena: { x: -9, z: -21, r: 5.2 },
  zib: { x: 2.4, z: 5.4 },
  zob: { x: -3.2, z: -18.4 },
};
// (Flat ground under the houses and the mushrooms too.)
for (const o of [...PLAN.houses, ...PLAN.mushrooms]) PLAN.flats.push({ x: o.x, z: o.z, r: o.r + 0.4 });

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

/** How high the ground is at (x, z), in the planet's own coordinates. */
export function hLocal(x, z) {
  let h = 0.3 * Math.sin(x * 0.16 + 1.3) * Math.cos(z * 0.12 - 0.4) + 0.2 * Math.sin((x + z) * 0.085 + 2.0) + 0.1 * Math.sin(x * 0.41 - z * 0.33);
  for (const f of PLAN.flats) h *= smooth(f.r, f.r + 3.5, Math.hypot(x - f.x, z - f.z));
  for (const c of PLAN.craters) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d > 2) continue;
    if (d < 1) h -= c.d * (1 - d * d) ** 1.3;
    h += c.d * 0.32 * Math.exp(-(((d - 1) / 0.28) ** 2)); // (a soft rim)
  }
  // Out past where she can go, the ground rises into rolling hills all round.
  const r = Math.hypot(x, z);
  if (r > 40) { const a = Math.atan2(z, x); h += smooth(40, 75, r) * (3.5 + 2.2 * Math.sin(a * 5 + 1) + 1.4 * Math.sin(a * 11 + 3)); }
  return h;
}

const LILAC = new THREE.Color(0xc4aee0), DUST = new THREE.Color(0xdccbee), DEEP = new THREE.Color(0x9c8acb), TEAL = new THREE.Color(0x9ccfd0);
function groundColor(x, z, out) {
  const n = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.21) * 2) * Math.cos(z * 0.29 - x * 0.07);
  out.copy(LILAC).lerp(DUST, n * 0.6);
  for (const c of PLAN.craters) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1) out.lerp(DEEP, (1 - d) * 0.75).lerp(TEAL, (1 - d) * (1 - d) * 0.35);
    else if (d < 1.4) out.lerp(DUST, (1.4 - d) * 0.9);
  }
  const speck = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  out.offsetHSL(0, 0, ((speck - Math.floor(speck)) - 0.5) * 0.035);
  return out;
}

/** The ground: a fine mesh where she goes (the craters are small and round), a coarse one out to the hills. */
function groundGeometry(half, seg, sink = null) {
  const g = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute('uv');
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let y = hLocal(x, z);
    if (sink && Math.abs(x) < sink && Math.abs(z) < sink) y -= 0.08; // (tucked under the fine one)
    p.setY(i, y);
    groundColor(x, z, c).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function add(g, geo, color, pos, { rot = [0, 0, 0], scale = null, cast = true, opts, occluder = false } = {}) {
  const m = new THREE.Mesh(geo, paint(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (occluder) m.userData.occluder = true;
  g.add(m);
  return m;
}

const STRATA = [new THREE.Color(0x9d86bd), new THREE.Color(0xbba4d8), new THREE.Color(0x85709f)];

/** A rock stack: a knobbly purple column with a flat, paler top to stand on. */
function stack(g, s, base) {
  const pts = [], n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = -0.4 + t * (s.h + 0.4);
    const r = s.r * (1.18 - 0.22 * t + 0.07 * Math.sin(t * 13 + s.x) + (i === n ? -0.08 : 0));
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(0.001, s.h));
  const geo = new THREE.LatheGeometry(pts, 22);
  geo.rotateY(s.x);
  // Soft layers of rock, paler and darker bands up its sides (a little wavy).
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), k = Math.sin(y * 2.6 + Math.sin(a * 3 + s.z) * 0.5 + s.x);
    c.copy(STRATA[0]).lerp(k > 0 ? STRATA[1] : STRATA[2], Math.abs(k) * 0.8).toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  add(g, geo, 0xffffff, [s.x, base, s.z], { occluder: true, opts: { vertexColors: true } });
  add(g, new THREE.CircleGeometry(s.r * 0.97, 22), 0xcdb9e6, [s.x, base + s.h + 0.012, s.z], { rot: [-Math.PI / 2, 0, 0], cast: false });
  // A few pebbles round its foot.
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + s.z, rr = s.r * 1.45;
    add(g, blobGeometry(k + Math.round(s.x), 0.25, 1), 0xa893c6, [s.x + Math.cos(a) * rr, base + 0.08, s.z + Math.sin(a) * rr], { scale: [0.32, 0.22, 0.28] });
  }
}

/** A Blip house: a dome with a round door (looking `face`), round windows, and an antenna with a light on top. */
function house(g, h, base) {
  const grp = new THREE.Group();
  grp.position.set(h.x, base, h.z);
  grp.rotation.y = h.face;
  g.add(grp);
  add(grp, new THREE.SphereGeometry(h.r, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), h.c, [0, -0.05, 0], { occluder: true });
  add(grp, new THREE.TorusGeometry(h.r + 0.02, 0.09, 8, 48), 0xffffff, [0, 0.0, 0], { rot: [Math.PI / 2, 0, 0], cast: false });
  // The door (a round hole with a frame) and a doormat.
  const dz = h.r * 0.97;
  add(grp, new THREE.CircleGeometry(0.55, 24), 0x6a4f8a, [0, 0.55, dz - 0.08], { rot: [-0.25, 0, 0], cast: false });
  add(grp, new THREE.TorusGeometry(0.57, 0.07, 8, 28), 0xf6d06a, [0, 0.55, dz - 0.06], { rot: [-0.25, 0, 0], cast: false });
  add(grp, new THREE.CircleGeometry(0.5, 20), 0xf28ab0, [0, 0.02, dz + 0.55], { rot: [-Math.PI / 2, 0, 0], cast: false, scale: [1.3, 0.8, 1] });
  for (const s of [-1, 1]) {
    const a = s * 0.85, y = h.r * 0.5;
    const w = add(grp, new THREE.CircleGeometry(0.24, 18), 0xfff1a0, [Math.sin(a) * h.r * 0.9, y, Math.cos(a) * h.r * 0.9], { cast: false, opts: { emissive: 0x6a5a20 } });
    w.lookAt(grp.localToWorld(new THREE.Vector3(Math.sin(a) * h.r * 3, y + 1, Math.cos(a) * h.r * 3)));
  }
  add(grp, new THREE.CylinderGeometry(0.03, 0.04, 0.9, 8), 0xb9bccf, [0, h.r + 0.4, 0]);
  add(grp, new THREE.SphereGeometry(0.12, 12, 8), 0xff6f7f, [0, h.r + 0.9, 0], { opts: { emissive: 0x802838 } });
}

/** A cluster of crystals: six-sided, pointed, leaning out from the middle. */
function crystals(g, k, base) {
  const shard = (r, len) => {
    const prism = new THREE.CylinderGeometry(r, r * 1.1, len, 6);
    const tip = new THREE.ConeGeometry(r, r * 2.2, 6);
    tip.translate(0, len / 2 + r * 1.1, 0);
    return [prism, tip, len];
  };
  const lean = [[0, 0, 0, 1.0], [0.5, 0.35, 0.3, 0.7], [-0.45, 0.4, -0.2, 0.6], [0.2, -0.5, 0.45, 0.55], [-0.3, -0.35, -0.5, 0.5]];
  for (const [ox, oz, tilt, f] of lean) {
    const len = 1.6 * k.s * f, r = 0.26 * k.s * (0.7 + 0.3 * f), [prism, tip] = shard(r, len), grp = new THREE.Group();
    grp.position.set(k.x + ox * k.s, base, k.z + oz * k.s);
    grp.rotation.set(oz * 0.5, tilt, -ox * 0.5);
    g.add(grp);
    add(grp, prism, k.c, [0, len / 2, 0], { opts: { emissive: 0x2a1a38 } });
    add(grp, tip, k.c, [0, len / 2, 0], { opts: { emissive: 0x2a1a38 } });
  }
}

/** The sky: pink at the horizon to deep indigo overhead, full of twinkly stars. */
function spaceDome(radius = 160) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uTop: { value: new THREE.Color(0x2c2a62) }, uMid: { value: new THREE.Color(0x8f7ccb) }, uHorizon: { value: new THREE.Color(0xf0c8e0) } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon; uniform float uTime;
      varying vec3 vDir;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float y = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.3, y));
        c = mix(c, uTop, smoothstep(0.25, 0.85, y));
        // Stars: one in a few cells of a grid round the sky, a soft dot that twinkles.
        vec3 p = d * 70.0, i = floor(p), f = fract(p) - 0.5;
        float r = h3(i), s = 0.0;
        if (r > 0.93) {
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
          s = smoothstep(0.2, 0.0, length(f)) * tw * smoothstep(0.05, 0.35, y);
        }
        c = mix(c, vec3(1.0, 0.98, 0.9), s);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
}

/** A planet or a moon in the sky: lit from one side, banded (a gas giant) or with seas and land (home). */
function skyBody(r, a, b, { bands = 0, land = false } = {}) {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uBands: { value: bands }, uLand: { value: land ? 1 : 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN, vP;
      void main() { vN = normal; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB; uniform float uBands, uLand;
      varying vec3 vN, vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 N = normalize(vN), P = normalize(vP);
        float k = 0.0;
        if (uBands > 0.0) k = 0.5 + 0.5 * sin(P.y * uBands + sin(P.x * 3.0) * 0.8);
        if (uLand > 0.5) { vec2 q = vec2(atan(P.z, P.x) * 2.0, P.y * 3.0); k = step(0.55, n(q * 1.6) * 0.7 + n(q * 4.0) * 0.3); }
        vec3 c = mix(uA, uB, k);
        if (uLand > 0.5) c = mix(c, vec3(1.0), smoothstep(0.82, 0.9, abs(P.y)) * 0.9); // (snowy poles)
        float l = dot(N, normalize(vec3(0.6, 0.5, -0.6)));
        c *= 0.45 + 0.55 * smoothstep(-0.35, 0.5, l);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), mat);
}

export function buildPlanet(origin) {
  const { group: g, C, W, R, col, ox, oz } = tripWorld(origin);
  g.userData.season = 'none'; // (no autumn leaves or snow on another planet)
  const { ramp } = PLAN;
  const heightAt = (x, z) => hLocal(x - ox, z - oz);

  // ---- the ground ----
  add(g, groundGeometry(38, 152), 0xffffff, [0, 0, 0], { cast: false, opts: { vertexColors: true } });
  add(g, groundGeometry(100, 60, 38.5), 0xffffff, [0, 0, 0], { cast: false, opts: { vertexColors: true } });

  // ---- rock stacks (standing on the ground there) ----
  for (const s of PLAN.stacks) {
    s.base = hLocal(s.x, s.z);
    stack(g, s, s.base);
    C.circle(s.x, s.z, s.r * 1.05, s.base + s.h);
  }
  // ---- the Blips' houses ----
  for (const h of PLAN.houses) {
    h.base = hLocal(h.x, h.z);
    house(g, h, h.base);
    C.circle(h.x, h.z, h.r * 0.92, h.base + h.r * 0.82);
  }
  // ---- crystals (not for standing on: too pointy) ----
  for (const k of PLAN.crystals) {
    const base = hLocal(k.x, k.z);
    crystals(g, k, base);
    C.circle(k.x, k.z, 0.75 * k.s, base + 1.6 * k.s, false);
  }
  // ---- the moon-ball arena: a ring of little glowing posts on the flat, and a plinth in the middle ----
  {
    const a = PLAN.arena;
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2, x = a.x + Math.cos(t) * (a.r + 0.6), z = a.z + Math.sin(t) * (a.r + 0.6);
      add(g, new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8), 0xb9bccf, [x, 0.25, z]);
      add(g, new THREE.SphereGeometry(0.11, 10, 8), i % 2 ? 0x9ff0f0 : 0xffb0d0, [x, 0.55, z], { cast: false, opts: { emissive: i % 2 ? 0x2a6060 : 0x6a2a48 } });
    }
    add(g, new THREE.RingGeometry(a.r - 0.12, a.r + 0.05, 64), 0xe6d8f4, [a.x, 0.02, a.z], { rot: [-Math.PI / 2, 0, 0], cast: false });
    add(g, new THREE.CylinderGeometry(0.42, 0.55, 0.34, 20), 0xb9bccf, [a.x, 0.17, a.z]);
  }
  // ---- rocks and pebbles about the place ----
  for (let k = 0; k < 26; k++) {
    const a = k * 2.399, r = 9 + ((k * 7.3) % 24), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (PLAN.craters.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 1.3) || PLAN.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r)) continue;
    if ([...PLAN.stacks, ...PLAN.houses, ...PLAN.mushrooms].some((o) => Math.hypot(x - o.x, z - o.z) < (o.r ?? 1) + 1.8)) continue;
    if (PLAN.crystals.some((o) => Math.hypot(x - o.x, z - o.z) < 2.5)) continue;
    const s = 0.25 + (k % 4) * 0.12;
    add(g, blobGeometry(k + 40, 0.25, 1), k % 3 ? 0xa893c6 : 0xb7a2d4, [x, hLocal(x, z) + s * 0.25, z], { scale: [s * 1.3, s * 0.8, s] });
    if (s > 0.45) C.circle(x, z, s * 0.9, hLocal(x, z) + s * 0.6);
  }
  // ---- out past the edge: bigger crystals and rocks on the hills (to look at) ----
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2 + 0.13 * (k % 3), r = 44 + (k % 5) * 6, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hLocal(x, z);
    if (k % 3 === 0) crystals(g, { x, z, s: 2.2 + (k % 4) * 0.5, c: [0xf7a8d8, 0x9ff0f0, 0xc6b0ff][k % 3] }, y);
    else add(g, blobGeometry(k + 90, 0.3, 1), 0x9d86bd, [x, y + 0.8, z], { scale: [2.6, 1.8, 2.2], cast: false });
  }

  // ---- the ramp down from the saucer's hatch (a sloping plank; steps underneath to walk up) ----
  {
    const len = Math.hypot(ramp.z1 - ramp.z0, ramp.y0), ang = Math.atan2(ramp.y0, ramp.z1 - ramp.z0);
    add(g, new THREE.BoxGeometry(ramp.w, 0.08, len + 0.2), 0xb9bccf, [0, ramp.y0 / 2 - 0.04, (ramp.z0 + ramp.z1) / 2], { rot: [ang, 0, 0] });
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.08, 0.14, len + 0.2), RIMC, [s * (ramp.w / 2), ramp.y0 / 2 + 0.02, (ramp.z0 + ramp.z1) / 2], { rot: [ang, 0, 0] });
    for (let i = 0; i < ramp.n; i++) {
      const z0 = ramp.z0 + ((ramp.z1 - ramp.z0) * i) / ramp.n, z1 = ramp.z0 + ((ramp.z1 - ramp.z0) * (i + 1)) / ramp.n;
      const mid = (z0 + z1) / 2, top = (ramp.y0 * (ramp.z1 - mid)) / (ramp.z1 - ramp.z0);
      C.box(-ramp.w / 2, z0, ramp.w / 2, z1, top);
    }
    for (const s of [-1, 1]) C.box(s * ramp.w / 2 - 0.05, ramp.z0, s * ramp.w / 2 + 0.05, ramp.z1 - 0.8, 1.6, false); // (handrails: no falling off the side)
  }
  // The saucer, standing on its legs (its lights chase round: see the chapter).
  const { root: saucer, lights, glow } = saucerModel({ legs: true, door: true });
  saucer.position.y = -SAUCER.legY;
  const rimTop = -SAUCER.legY + SAUCER.rimY + 0.07, domeTop = -SAUCER.legY + 1.18 + SAUCER.domeR;
  C.circle(0, 0, SAUCER.R + 0.05, rimTop);
  C.circle(0, 0, 2.3, -SAUCER.legY + 1.12);
  C.circle(0, 0, 1.25, domeTop);
  saucer.traverse((o) => { if (o.isMesh && o.geometry.type === 'LatheGeometry') o.userData.occluder = true; });

  // ---- the sky: stars, a ringed planet, two moons, and home ----
  const sky = new THREE.Group();
  const dome = spaceDome();
  sky.add(dome);
  const big = skyBody(30, 0xf2b08a, 0xe07a8a, { bands: 9 });
  big.position.set(-95, 62, -70);
  const ring = new THREE.Mesh(new THREE.RingGeometry(40, 58, 96), new THREE.MeshBasicMaterial({ color: 0xf6dcc0, transparent: true, opacity: 0.75, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  ring.position.copy(big.position);
  ring.rotation.set(-1.2, 0.35, 0.3);
  const home = skyBody(6.5, 0x4f8fd8, 0x6fbf6a, { land: true });
  home.position.set(18, 48, 128);
  const moonA = skyBody(5, 0xe8e2f0, 0xc8c0dc, { bands: 3 });
  moonA.position.set(110, 70, 30);
  const moonB = skyBody(3, 0xb8f0e0, 0x8ad0c8, { bands: 2 });
  moonB.position.set(70, 95, -60);
  for (const m of [big, ring, home, moonA, moonB]) { m.renderOrder = -1; sky.add(m); }
  dome.renderOrder = -2;

  const occluders = collectOccluders(g);
  occluders.boxes.push(...collectOccluders(saucer).boxes.map((b) => b.translate(new THREE.Vector3(ox, 0, oz))));
  const scene = new THREE.Scene();
  scene.add(mergeStatic(g));
  scene.add(sky);
  const dyn = new THREE.Group();
  dyn.position.set(ox, 0, oz);
  scene.add(dyn);
  dyn.add(saucer);
  const world = {
    group: g, colliders: col, water: [], gardens: [], beds: [], bins: [],
    bounds: R(-SIZE, -SIZE, SIZE, SIZE),
    heightAt,
    occluders,
    camera: { distMax: 13 },
    W, R, C,
  };
  return { scene, world, dyn, sky, dome, saucer: { root: saucer, lights, glow }, home };
}
