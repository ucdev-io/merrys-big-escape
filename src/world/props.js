import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../render/watercolorMaterial.js';
import { PALETTE } from '../render/palette.js';
import { fbm3 } from '../core/rng.js';

export function shadowed(o, cast = true) {
  o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } });
  return o;
}

export function mesh(geo, color, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], matOpts) {
  const m = new THREE.Mesh(geo, paint(color, matOpts));
  m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

const blobCache = new Map();
/** A soft, lumpy sphere — leaves, bushes, clouds of foliage. */
export function blobGeometry(seed = 0, bump = 0.28, detail = 3) {
  const key = `${seed}|${bump}|${detail}`;
  if (blobCache.has(key)) return blobCache.get(key);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm3(v.x * 1.3 + seed * 7.1, v.y * 1.3, v.z * 1.3 + seed * 3.3, 3);
    v.multiplyScalar(1 + (n - 0.5) * 2 * bump);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  blobCache.set(key, g);
  return g;
}

export function tree(x, z, s = 1, rng, col, { detail = 3, blobs } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const bend = rng.float(-0.25, 0.25);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(bend * 0.3, 1.0 * s, 0), new THREE.Vector3(bend, 2.0 * s, bend * 0.4),
  ]);
  const trunk = new THREE.TubeGeometry(curve, 12, 0.16 * s, 10, false);
  mesh(trunk, PALETTE.bark, g).userData.solid = true;
  mesh(new THREE.SphereGeometry(0.2 * s, 12, 8), PALETTE.bark, g, [0, 0.02, 0], [0, 0, 0], [1.2, 0.4, 1.2]);
  // branches
  for (let i = 0; i < 2; i++) {
    const a = rng.float(0, Math.PI * 2);
    const bc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bend * 0.6, 1.5 * s, 0),
      new THREE.Vector3(bend * 0.6 + Math.cos(a) * 0.6 * s, 2.1 * s, Math.sin(a) * 0.6 * s),
    ]);
    mesh(new THREE.TubeGeometry(bc, 6, 0.06 * s, 6, false), PALETTE.bark, g);
  }
  const leafCols = [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafLight];
  const n = blobs ?? rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.float(0, 0.6);
    const r = i === 0 ? 0 : rng.float(0.5, 0.85) * s;
    const sz = (i === 0 ? 1.05 : rng.float(0.6, 0.85)) * s;
    const leaf = mesh(blobGeometry(rng.int(0, 40), 0.3, detail), rng.pick(leafCols), g,
      [bend + Math.cos(a) * r, (2.5 + rng.float(-0.25, 0.35)) * s, bend * 0.4 + Math.sin(a) * r], [rng.float(0, 3), rng.float(0, 3), 0], [sz, sz * 0.85, sz]);
    leaf.userData.foliage = true;
  }
  col?.circle(x, z, 0.3 * s);
  return g;
}

export function bush(x, z, s = 1, rng, col, color, detail = 3) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const cols = [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafLight];
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const sz = s * rng.float(0.4, 0.6);
    mesh(blobGeometry(rng.int(0, 40), 0.3, detail), color ?? rng.pick(cols), g,
      [rng.float(-0.35, 0.35) * s, sz * 0.75, rng.float(-0.35, 0.35) * s], [rng.float(0, 3), rng.float(0, 3), 0], [sz, sz * 0.8, sz]);
  }
  col?.circle(x, z, 0.55 * s);
  return g;
}

/** Picket fence from (x0,z0) to (x1,z1). Returns a group. */
export function picketFence(x0, z0, x1, z1, col, { color = PALETTE.fenceWhite, height = 1.0, gap = 0.22, simple = false } = {}) {
  const g = new THREE.Group();
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  g.position.set(x0, 0, z0);
  g.rotation.y = ang;
  const n = Math.floor(len / gap);
  // simple: plain boxes (12 triangles instead of ~200) for big towns.
  const picketGeo = simple ? new THREE.BoxGeometry(0.13, height, 0.04) : new RoundedBoxGeometry(0.13, height, 0.04, 2, 0.02);
  const pickets = new THREE.InstancedMesh(picketGeo, paint(color), n);
  const tipGeo = new THREE.ConeGeometry(0.075, 0.12, 4, 1);
  tipGeo.rotateY(Math.PI / 4);
  tipGeo.scale(1.25, 1, 0.38);
  tipGeo.translate(0, 0.06, 0);
  const tips = new THREE.InstancedMesh(tipGeo, paint(color), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const up = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const z = (i + 0.5) * (len / n);
    const h = height * (0.96 + 0.08 * Math.sin(i * 1.7));
    const tilt = Math.sin(i * 2.3) * 0.025;
    q.setFromEuler(e.set(0, Math.PI / 2, tilt));
    up.set(0, 1, 0).applyQuaternion(q);
    m.compose(up.clone().multiplyScalar(h / 2).add(new THREE.Vector3(0, 0, z)), q, new THREE.Vector3(1, h / height, 1));
    pickets.setMatrixAt(i, m);
    m.compose(up.clone().multiplyScalar(h).add(new THREE.Vector3(0, 0, z)), q, new THREE.Vector3(1, 1, 1));
    tips.setMatrixAt(i, m);
  }
  g.add(shadowed(pickets), shadowed(tips));
  for (const y of [0.3, height * 0.75]) {
    mesh(simple ? new THREE.BoxGeometry(0.05, 0.08, len) : new RoundedBoxGeometry(0.05, 0.08, len, 1, 0.02), PALETTE.wood, g, [-0.05, y, len / 2]);
  }
  col?.box(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12);
  return g;
}

function gableRoof(w, d, h, overhang, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0);
  shape.lineTo(0, h);
  shape.lineTo(w / 2 + overhang, 0);
  shape.lineTo(-w / 2 - overhang, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 1 });
  geo.translate(0, 0, -(d + overhang * 2) / 2);
  return new THREE.Mesh(geo, paint(color));
}

/** A cosy house. Front faces +Z. */
export function house(x, z, rotY, rng, col, { w = 6, d = 5, h = 3.2, wall = PALETTE.wall, roof = PALETTE.roof, door = PALETTE.door } = {}) {
  const g = new THREE.Group();
  g.userData.occluder = true;
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  mesh(new RoundedBoxGeometry(w, h, d, 2, 0.12), wall, g, [0, h / 2, 0]);
  const r = gableRoof(w, d, h * 0.55, 0.35, roof);
  r.position.y = h;
  g.add(r);
  mesh(new RoundedBoxGeometry(0.6, 1.2, 0.6, 1, 0.08), PALETTE.brick, g, [w * 0.25, h + h * 0.45, -d * 0.15]);
  // door + step
  mesh(new RoundedBoxGeometry(0.95, 1.9, 0.12, 1, 0.05), door, g, [0, 0.95, d / 2 + 0.03]);
  mesh(new THREE.SphereGeometry(0.045, 10, 8), 0xe8c66a, g, [0.32, 0.95, d / 2 + 0.11]);
  mesh(new RoundedBoxGeometry(1.4, 0.16, 0.6, 1, 0.05), PALETTE.path, g, [0, 0.08, d / 2 + 0.3]);
  // windows
  const win = (wx, wy, wz, ry) => {
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz); wg.rotation.y = ry;
    mesh(new RoundedBoxGeometry(1.0, 0.95, 0.1, 1, 0.04), PALETTE.fenceWhite, wg);
    mesh(new RoundedBoxGeometry(0.82, 0.78, 0.06, 1, 0.02), PALETTE.windowBlue, wg, [0, 0, 0.04]);
    mesh(new THREE.BoxGeometry(0.05, 0.78, 0.04), PALETTE.fenceWhite, wg, [0, 0, 0.08]);
    mesh(new THREE.BoxGeometry(0.82, 0.05, 0.04), PALETTE.fenceWhite, wg, [0, 0, 0.08]);
    mesh(new RoundedBoxGeometry(1.15, 0.18, 0.3, 1, 0.05), rng.pick(PALETTE.flowers), wg, [0, -0.55, 0.15]); // flower box
    g.add(wg);
  };
  win(-w * 0.3, h * 0.55, d / 2 + 0.02, 0);
  win(w * 0.3, h * 0.55, d / 2 + 0.02, 0);
  win(-w * 0.3, h * 0.55, -d / 2 - 0.02, Math.PI);
  win(w * 0.3, h * 0.55, -d / 2 - 0.02, Math.PI);
  if (col) {
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    col.box(x - hw, z - hd, x + hw, z + hd);
  }
  return g;
}

export function shed(x, z, rotY, col) {
  const g = new THREE.Group();
  g.userData.occluder = true;
  g.position.set(x, 0, z); g.rotation.y = rotY;
  mesh(new RoundedBoxGeometry(2.4, 2.0, 1.8, 2, 0.06), PALETTE.wood, g, [0, 1.0, 0]);
  for (let i = -5; i <= 5; i++) mesh(new THREE.BoxGeometry(0.03, 1.9, 0.02), PALETTE.woodDark, g, [i * 0.21, 1.0, 0.91]);
  const r = gableRoof(2.4, 1.8, 0.8, 0.2, PALETTE.leafDark);
  r.position.y = 2.0; g.add(r);
  mesh(new RoundedBoxGeometry(0.8, 1.5, 0.06, 2, 0.03), PALETTE.woodDark, g, [0.4, 0.78, 0.93]);
  if (col) col.box(x - 1.3, z - 1.1, x + 1.3, z + 1.1);
  return g;
}

export function gnome(x, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  mesh(new THREE.SphereGeometry(0.16, 20, 14), PALETTE.gnomeBody, g, [0, 0.18, 0], [0, 0, 0], [1, 1.15, 0.95]);
  mesh(new THREE.SphereGeometry(0.1, 18, 12), PALETTE.skin, g, [0, 0.4, 0.02]);
  mesh(new THREE.ConeGeometry(0.11, 0.22, 16, 1), 0xffffff, g, [0, 0.31, 0.08], [0.4, 0, 0]);
  mesh(new THREE.SphereGeometry(0.03, 10, 8), 0xe89a8a, g, [0, 0.4, 0.12]);
  mesh(new THREE.ConeGeometry(0.11, 0.32, 18, 1), PALETTE.gnomeHat, g, [0, 0.6, -0.02], [-0.25, 0, 0]);
  return g;
}

export function paddlingPool(x, z, col) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(new THREE.TorusGeometry(1.0, 0.16, 14, 40), PALETTE.poolRim, g, [0, 0.16, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.TorusGeometry(1.0, 0.1, 10, 40), 0xf2f0e6, g, [0, 0.38, 0], [Math.PI / 2, 0, 0]);
  const water = mesh(new THREE.CircleGeometry(1.0, 40), PALETTE.water, g, [0, 0.26, 0], [-Math.PI / 2, 0, 0]);
  water.castShadow = false;
  // a rubber ball floating
  mesh(new THREE.SphereGeometry(0.14, 16, 12), 0xf2a0b4, g, [0.35, 0.3, -0.2]);
  col?.circle(x, z, 1.15);
  return g;
}

export function washingLine(x0, z0, x1, z1, rng) {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.0, 10);
  mesh(postGeo, PALETTE.woodDark, g, [x0, 1.0, z0]);
  mesh(postGeo, PALETTE.woodDark, g, [x1, 1.0, z1]);
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, 1.9 - Math.sin(t * Math.PI) * 0.18, z0 + (z1 - z0) * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  mesh(new THREE.TubeGeometry(curve, 30, 0.012, 5, false), 0xe8e2d4, g);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const items = [0.18, 0.35, 0.55, 0.78];
  items.forEach((t, i) => {
    const p = curve.getPointAt(t);
    const w = rng.float(0.35, 0.6), h = rng.float(0.4, 0.65);
    const cloth = new THREE.PlaneGeometry(w, h, 6, 6);
    const pp = cloth.attributes.position;
    for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.sin(pp.getX(k) * 6 + i) * 0.03);
    cloth.computeVertexNormals();
    const m = mesh(cloth, PALETTE.laundry[i % PALETTE.laundry.length], g, [p.x, p.y - h / 2, p.z], [0, ang + Math.PI / 2, 0], [1, 1, 1], { side: THREE.DoubleSide });
    m.userData.sway = i;
  });
  g.userData.curve = curve;
  return g;
}

export function flowerBed(x, z, w, d, rng, col) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const soil = mesh(blobGeometry(3, 0.08, 3), PALETTE.soil, g, [0, -0.02, 0], [0, 0, 0], [w / 2, 0.12, d / 2]);
  soil.castShadow = false;
  const n = Math.floor(w * d * 7);
  const stem = new THREE.CylinderGeometry(0.012, 0.015, 1, 3);
  const head = new THREE.IcosahedronGeometry(1, 0);
  const stems = new THREE.InstancedMesh(stem, paint(PALETTE.leafDark), n);
  const heads = new THREE.InstancedMesh(head, paint(0xffffff), n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const fx = rng.float(-0.45, 0.45) * w, fz = rng.float(-0.45, 0.45) * d;
    const h = rng.float(0.25, 0.55);
    m.makeScale(1, h, 1).setPosition(fx, h / 2, fz);
    stems.setMatrixAt(i, m);
    const s = rng.float(0.05, 0.085);
    m.makeScale(s, s * 0.7, s).setPosition(fx, h, fz);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, c.set(rng.pick(PALETTE.flowers)));
  }
  g.add(shadowed(stems), shadowed(heads));
  col?.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  return g;
}

export function steppingStones(points, rng) {
  const g = new THREE.Group();
  for (const [x, z] of points) {
    const s = rng.float(0.28, 0.4);
    const m = mesh(blobGeometry(rng.int(0, 20), 0.15, 1), PALETTE.path, g, [x, 0.0, z], [0, rng.float(0, 3), 0], [s, 0.06, s * rng.float(0.8, 1.1)]);
    m.castShadow = false;
  }
  return g;
}

/** Thousands of grass tufts in one draw call. `accept(x,z)` filters placement. */
export function grassTufts(count, area, rng, accept = () => true) {
  const blade = new THREE.ConeGeometry(0.014, 0.13, 3, 1);
  blade.translate(0, 0.065, 0);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const b = blade.clone();
    b.rotateZ((i - 1) * 0.35);
    b.rotateY(i * 2.1);
    parts.push(b);
  }
  const geo = mergeGeos(parts);
  const im = new THREE.InstancedMesh(geo, paint(0xffffff), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), e = new THREE.Euler();
  const cols = [PALETTE.grass, PALETTE.grassLight, 0x8fb565];
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 5) {
    tries++;
    const x = rng.float(area[0], area[2]), z = rng.float(area[1], area[3]);
    if (!accept(x, z)) continue;
    const s = rng.float(0.6, 1.3);
    q.setFromEuler(e.set(rng.float(-0.15, 0.15), rng.float(0, 6.28), rng.float(-0.15, 0.15)));
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * rng.float(0.7, 1.3), s));
    im.setMatrixAt(placed, m);
    im.setColorAt(placed, c.set(rng.pick(cols)));
    placed++;
  }
  im.count = placed;
  im.castShadow = false;
  im.receiveShadow = true;
  return im;
}

function mergeGeos(geos) {
  const pos = [], nor = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array);
    nor.push(...ng.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** A soft watercolor sky dome: warm horizon, blue top, drifting cloud washes. */
export function skyDome(radius = 160) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x8fb8d8) },
      uHorizon: { value: new THREE.Color(0xf3e6cf) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon; uniform float uTime;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.1; a*=.5; } return v; }
      void main() {
        float y = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.55, y));
        vec2 p = vDir.xz / (vDir.y + 0.25) * 1.6 + vec2(uTime * 0.01, 0.0);
        float cl = smoothstep(0.5, 0.75, fbm(p));
        c = mix(c, vec3(1.0, 0.98, 0.95), cl * 0.75 * smoothstep(0.02, 0.2, y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}
