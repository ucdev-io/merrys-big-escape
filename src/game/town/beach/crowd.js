import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { Person } from '../../../entities/person.js';
import { bake, SPHERE } from '../../../entities/shapes.js';
import { paint } from '../../../render/watercolorMaterial.js';
import { mergeStatic } from '../../../world/merge.js';
import { deckchair } from '../../../world/areas/beachBuild.js';
import { beachBallGeometry } from '../../../entities/beachItems.js';
import { season } from '../../season.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SKINS = [0xf2d3b8, 0xe0b48e, 0xc68e64, 0x9a6440, 0x6e4630];
const HAIRS = [0x3b2b25, 0x6b4a32, 0xc89a5a, 0x2a2224, 0xa8a49e, 0xd8b070];
const SUMMERY = [0xf2a0b4, 0x8fc4d8, 0xf6d06a, 0x9fd6b0, 0xf08a6a, 0xffffff, 0xb69be0];
const WOOLLY = [0x8a3a3a, 0x3f5a7a, 0x5a6b45, 0x7a5a8a, 0x4a4a52];

/**
 * 👨‍👩‍👧 People at the beach, through the seasons: a busy summer beach (families picnicking, parasols,
 * windbreaks and deckchairs, someone queuing at the kiosk); a few folk in jumpers in spring and autumn;
 * and in winter an empty, windswept beach — the kiosk shut, one hardy pair with a flask — plus, at
 * Christmas, somebody braving a Christmas dip in a Santa hat. When it rains, everyone hurries off.
 * Each season's lot is built when it's first needed and baked into a few meshes (mergeStatic).
 */
export class Crowd {
  constructor(B) {
    this.B = B;
    this.groups = {};
    this.mode = null;
    this.rain = null;
    this.t = 0;
  }

  /** Someone sat at this picnic right now? (for "Oi! My chips!") */
  peopleAt(p) {
    const i = this.B.area.picnics.findIndex((q) => q.pos.distanceTo(p.pos) < 0.5);
    const g = this.groups[`${this.mode}People`];
    return !!g?.visible && (this.seated?.[this.mode] ?? []).includes(i);
  }

  person(rng, { shirt, trousers, cap = null, kid = false, pose = 'sit', at, face, y = 0, legs = true }) {
    const p = new Person({ shirt, trousers, skin: rng.pick(SKINS), hair: rng.pick(HAIRS), cap });
    const r = p.root;
    if (!legs) for (const l of p.legs) l.traverse((m) => { m.visible = false; }); // (hidden behind something: not baked in)
    r.position.copy(at).setY(y);
    r.rotation.y = face;
    if (kid) r.scale.setScalar(0.62);
    if (pose === 'sit' || pose === 'chair') {
      const low = pose === 'sit' ? 0.72 : 0.42;
      p.body.position.y = -low;
      for (const l of p.legs) l.rotation.x = pose === 'sit' ? -1.45 : -1.15;
      p.arms[0].rotation.set(-0.45, 0, 0.25); p.arms[1].rotation.set(-0.45, 0, -0.25);
    } else if (pose === 'wave') { // (in the sea, arms up: "Whoooo! Brrr!")
      p.arms[0].rotation.set(0, 0, -2.6); p.arms[1].rotation.set(0, 0, 2.6);
    } else if (pose === 'read') {
      p.body.position.y = -0.42;
      for (const l of p.legs) l.rotation.x = -1.15;
      p.arms[0].rotation.set(-1.1, 0, 0.35); p.arms[1].rotation.set(-1.1, 0, -0.35);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.01), paint(0xf4efe2));
      paper.position.set(0, 1.12, 0.42); paper.rotation.x = -0.3;
      p.body.add(paper);
    }
    for (const g of [...p.legs, ...p.arms, p.head]) g.userData.noMerge = false; // (they sit still: limbs and all bake in with the rest of the crowd)
    return r;
  }

  /** A striped parasol. */
  parasol(g, at, colA) {
    const s = new THREE.Group();
    s.position.copy(at);
    s.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), paint(0xf1e8d8)));
    s.children[0].position.y = 1.05;
    s.children[0].rotation.z = 0.12;
    const top = bake([{ geo: new THREE.ConeGeometry(1.15, 0.38, 16, 1, true), pos: [0, 0, 0], colors: (i, v) => (Math.floor(((Math.atan2(v.z, v.x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 0xfaf6ec : colA) }]);
    const m = new THREE.Mesh(top, paint(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    m.position.set(0.13, 2.08, 0);
    m.rotation.z = 0.12;
    s.add(m);
    g.add(s);
  }

  /** A stripy windbreak, zigzagging round a spot. */
  windbreak(g, at, face, colA) {
    const w = new THREE.Group();
    w.position.copy(at); w.rotation.y = face;
    for (let i = 0; i < 4; i++) {
      const x = -1.5 + i, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), paint(0x9b7452));
      pole.position.set(x, 0.55, (i % 2) * 0.35 - 1.2);
      w.add(pole);
      if (i < 3) { // (the stripy cloth zigzags between the poles)
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.85, 0.02), paint(i % 2 ? 0xf7f3ea : colA));
        panel.position.set(x + 0.5, 0.55, 0.175 - 1.2);
        panel.rotation.y = i % 2 ? 0.33 : -0.33;
        w.add(panel);
      }
    }
    g.add(w);
  }

  towel(g, at, face, col) {
    const t = new THREE.Mesh(bake([{ geo: new THREE.BoxGeometry(0.75, 0.012, 1.6), pos: [0, 0.006, 0], colors: (i, v) => (Math.floor((v.z + 0.8) * 5) % 2 ? 0xfaf6ec : col) }]), paint(0xffffff, { vertexColors: true }));
    t.position.copy(at); t.rotation.y = face;
    t.castShadow = false;
    g.add(t);
  }

  /** Build one season's lot: { people, props } groups (merged). */
  build(mode) {
    const B = this.B, A = B.area, rng = new RNG(`beach-crowd:${mode}:${A.layout.seed}`);
    const people = new THREE.Group(), props = new THREE.Group();
    people.userData.season = 'none'; // (people stay as they are; their things get snow and rain)
    props.userData.season = 'world';
    const seated = [];
    const sea = A.plan.turn; // (facing out to sea)
    const off = (p, u, v) => { const c = Math.cos(p.face), s = Math.sin(p.face); return V(p.pos.x + c * u + s * v, 0, p.pos.z - s * u + c * v); };
    const dress = () => (mode === 'winter' || mode === 'xmas' ? { shirt: rng.pick(WOOLLY), trousers: 0x3f3a44, cap: { color: rng.pick([0xd9534f, 0x5b86c4, 0xf2c94e]) } } : mode === 'mild' ? { shirt: rng.pick([...WOOLLY, 0x8fc4d8]), trousers: rng.pick([0x4a4a52, 0x6b5a48]) } : { shirt: rng.pick(SUMMERY), trousers: rng.pick([0x5b86c4, 0xf6efe0, 0x4a4a52, 0xe8c08a]) });
    const family = (i, n, kid) => {
      const p = A.picnics[i];
      if (!p) return;
      seated.push(i);
      for (let k = 0; k < n; k++) people.add(this.person(rng, { ...dress(), at: off(p, -0.5 + k * 0.55, -0.55 + (k % 2) * 0.25), face: p.face + Math.PI * 0.05 * (k - 1) }));
      if (kid) people.add(this.person(rng, { ...dress(), kid: true, at: off(p, 0.35, 0.55), face: p.face + Math.PI }));
    };
    const keeper = () => { // (in the hatch, behind the counter: no legs needed)
      people.add(this.person(rng, { shirt: 0xf2a7b8, trousers: 0xf7f3ea, at: A.kiosk.keeper, face: A.kiosk.face, pose: 'stand', legs: false }));
    };
    const C = A.crowd;
    if (mode === 'summer') {
      family(0, 2, true); family(1, 2, false); family(2, 3, true);
      keeper();
      people.add(this.person(rng, { ...dress(), kid: true, at: A.kiosk.counter.clone().add(V(Math.sin(sea) * 0.5, 0, Math.cos(sea) * 0.5)), face: sea + Math.PI, pose: 'stand' })); // (queueing for an ice cream)
      if (C[0]) { this.parasol(props, C[0].pos, 0xd9534f); this.towel(props, off(C[0], 0.5, 0.2), C[0].face, 0x8fc4d8); people.add(this.person(rng, { ...dress(), at: off(C[0], -0.3, 0), face: C[0].face })); }
      if (C[1]) { this.windbreak(props, C[1].pos, C[1].face, 0x5b86c4); for (const s of [-0.5, 0.5]) { props.add(deckchair(off(C[1], s, 0).x, off(C[1], s, 0).z, C[1].face, [0x5b86c4, 0xfaf6ec])); people.add(this.person(rng, { ...dress(), pose: 'chair', at: off(C[1], s, -0.05), face: C[1].face })); } }
      if (C[2]) { this.parasol(props, C[2].pos, 0x6fae8f); people.add(this.person(rng, { ...dress(), at: off(C[2], -0.4, 0.3), face: C[2].face })); people.add(this.person(rng, { ...dress(), kid: true, at: off(C[2], 0.6, 0.6), face: C[2].face + 2 })); }
      if (C[3]) { this.towel(props, C[3].pos, C[3].face, 0xf6d06a); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 18), paint(0xf2a0b4)); ring.position.copy(off(C[3], 0.8, 0.6)).setY(0.12); ring.rotation.x = Math.PI / 2; props.add(ring); const ball = new THREE.Mesh(beachBallGeometry(), paint(0xffffff, { vertexColors: true })); ball.position.copy(off(C[3], -0.9, -0.4)); props.add(ball); }
      if (C[4]) { const p = C[4]; props.add(deckchair(p.pos.x, p.pos.z, p.face, [0xd9534f, 0xfaf6ec])); people.add(this.person(rng, { ...dress(), pose: 'read', at: p.pos.clone().add(V(Math.sin(p.face) * -0.05, 0, Math.cos(p.face) * -0.05)), face: p.face })); }
    } else if (mode === 'mild') {
      family(0, 2, false); family(1, 2, false);
      keeper();
      if (C[1]) { this.windbreak(props, C[1].pos, C[1].face, 0x6fae8f); props.add(deckchair(C[1].pos.x, C[1].pos.z, C[1].face, [0x6fae8f, 0xfaf6ec])); people.add(this.person(rng, { ...dress(), pose: 'chair', at: C[1].pos, face: C[1].face })); }
      if (C[4]) { props.add(deckchair(C[4].pos.x, C[4].pos.z, C[4].face, [0xd9534f, 0xfaf6ec])); people.add(this.person(rng, { ...dress(), pose: 'read', at: C[4].pos, face: C[4].face })); }
    } else { // winter: the kiosk's shut, and one hardy pair in hats, with a flask
      family(0, 2, false);
      const p = A.picnics[0];
      if (p) { const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10), paint(0x5b86c4)); flask.position.copy(off(p, 0.1, 0.1)).setY(0.13); props.add(flask); }
      const k = A.kiosk, s = Math.sin(k.face), c = Math.cos(k.face);
      const shutter = bake([{ geo: new THREE.BoxGeometry(1.95, 1.0, 0.04), colors: (i, v) => (Math.floor((v.y + 0.5) * 9) % 2 ? 0xd8d2c8 : 0xc4bdb2) }]);
      const sh = new THREE.Mesh(shutter, paint(0xffffff, { vertexColors: true }));
      sh.position.set(k.pos.x + s * 1.23, 1.45, k.pos.z + c * 1.23); sh.rotation.y = k.face;
      props.add(sh);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.03), paint(0xf6efe0));
      sign.position.set(k.pos.x + s * 1.27, 1.2, k.pos.z + c * 1.27); sign.rotation.set(0, k.face, 0.08);
      props.add(sign);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), paint(0xd9534f));
      dot.position.set(k.pos.x + s * 1.3, 1.22, k.pos.z + c * 1.3);
      props.add(dot);
    }
    const out = { people: mergeStatic(people), props: mergeStatic(props) };
    for (const g of Object.values(out)) { g.visible = false; B.scene.add(g); }
    (this.seated ??= {})[mode] = seated;
    if (mode === 'xmas' || mode === 'winter') { // a Christmas dip (only at Christmas)
      const dip = new THREE.Group();
      dip.userData.season = 'none';
      const at = A.at(A.layout.gateU + (A.layout.side > 0 ? -9 : 9), A.shore + 3.2);
      dip.add(this.person(rng, { shirt: 0xd9534f, trousers: 0xd9534f, at, face: sea + Math.PI, pose: 'wave', y: -0.85 })); // (waist-deep)
      const hat = bake([[new THREE.ConeGeometry(0.13, 0.3, 12), 0xd9534f, [0, 0.16, 0], [0, 0, -0.3]], [new THREE.TorusGeometry(0.12, 0.035, 6, 14), 0xf7f3ea, [0, 0.02, 0], [Math.PI / 2, 0, 0]], [SPHERE, 0xf7f3ea, [0.09, 0.29, 0], [0, 0, 0], [0.045, 0.045, 0.045]]]);
      const h = new THREE.Mesh(hat, paint(0xffffff, { vertexColors: true }));
      h.position.copy(at).setY(-0.85 + 1.74);
      dip.add(h);
      out.dip = mergeStatic(dip);
      out.dip.visible = false;
      B.scene.add(out.dip);
    }
    this.groups[`${mode}People`] = out.people;
    this.groups[`${mode}Props`] = out.props;
    if (out.dip) this.groups.dip = out.dip;
  }

  update(dt) {
    this.t += dt;
    const mode = season.is('winter') ? 'winter' : season.is('summer') ? 'summer' : 'mild', rain = season.weather === 'showers';
    if (mode !== this.mode || rain !== this.rain) {
      if (!this.groups[`${mode}People`]) this.build(mode);
      for (const [k, g] of Object.entries(this.groups)) g.visible = k === `${mode}Props` || (k === `${mode}People` && (!rain || mode === 'winter'));
      this.mode = mode;
      this.rain = rain;
    }
    const dip = this.groups.dip;
    if (dip) { dip.visible = mode === 'winter' && season.christmas; if (dip.visible) dip.position.y = Math.sin(this.t * 1.3) * 0.05; }
  }

  dispose() { for (const g of Object.values(this.groups)) g.removeFromParent(); }
}
