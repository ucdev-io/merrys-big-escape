import * as THREE from 'three';
import { Dog } from '../entities/dog.js';
import { BREEDS } from '../entities/breeds.js';
import { sfx } from '../core/audio.js';

const DELAY = 150; // ms behind real time, so we can smoothly interpolate between snapshots
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Other players' dogs: models, smoothing, name tags, and their barks. */
export class RemoteDogs {
  constructor(scene, hud, getListener) {
    this.scene = scene;
    this.hud = hud;
    this.getListener = getListener; // → my dog's position, for distance-based volume
    this.dogs = new Map();
  }

  add(p) {
    if (this.dogs.has(p.id)) return;
    const dog = new Dog(p.breed);
    this.scene.add(dog.root);
    dog.root.visible = false; // until the first position arrives
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.textContent = `${BREEDS[p.breed]?.emoji ?? '🐕'} ${p.name}`; // textContent: names are untrusted
    this.hud.root.appendChild(tag);
    this.dogs.set(p.id, { ...p, dog, tag, buf: [], heading: 0, digT: 0 });
  }

  remove(id) {
    const r = this.dogs.get(id);
    if (!r) return;
    this.scene.remove(r.dog.root);
    r.tag.remove();
    this.dogs.delete(id);
  }

  clear() { for (const id of [...this.dogs.keys()]) this.remove(id); }

  onStates(list, myId) {
    const now = performance.now();
    for (const [id, x, z, h, v, f] of list) {
      if (id === myId) continue;
      const r = this.dogs.get(id);
      if (!r) continue;
      r.buf.push({ t: now, x, z, h, v, f });
      if (r.buf.length > 20) r.buf.shift();
    }
  }

  onAct(id, a) {
    const r = this.dogs.get(id);
    if (!r) return;
    const anchor = r.dog.root.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    if (a === 'bark') {
      r.dog.bark();
      const d = this.getListener().distanceTo(r.dog.root.position);
      if (d < 40) sfx.bark(r.dog.breed.bark, Math.max(0.15, 1 - d / 40));
      this.hud.float('WOOF!', anchor);
    } else if (a === 'dig') r.digT = 0.35;
    else if (a === 'shake') r.dog.shake();
  }

  get(id) { return this.dogs.get(id); }

  update(dt) {
    const renderT = performance.now() - DELAY;
    for (const r of this.dogs.values()) {
      const b = r.buf;
      if (!b.length) continue;
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= renderT && b[i + 1].t >= renderT) { a = b[i]; c = b[i + 1]; break; }
      const k = c.t > a.t ? THREE.MathUtils.clamp((renderT - a.t) / (c.t - a.t), 0, 1) : 1;
      const root = r.dog.root;
      root.visible = true;
      root.position.set(a.x + (c.x - a.x) * k, 0, a.z + (c.z - a.z) * k);
      const h = a.h + wrap(c.h - a.h) * k;
      const turn = wrap(h - r.heading) / Math.max(dt, 1e-3);
      r.heading = h;
      root.rotation.y = h;
      r.digT = Math.max(0, r.digT - dt);
      r.dog.update(dt, { speed: a.v + (c.v - a.v) * k, turnRate: turn, sniff: !!(c.f & 1), dig: r.digT > 0 || !!(c.f & 2), happy: c.v > 2.8 ? 1 : 0.6 });

      // Name tag floats above the dog.
      const s = this.hud.project(root.position.clone().add(new THREE.Vector3(0, 0.9 * r.dog.breed.size, 0)));
      r.tag.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      r.tag.style.opacity = s.behind ? 0 : 1;
    }
  }
}
