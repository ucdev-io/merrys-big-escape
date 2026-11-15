import * as THREE from 'three';
import { Dog } from '../entities/dog.js';
import { BREEDS } from '../entities/breeds.js';
import { CARRYABLES } from '../entities/carryables.js';
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
    if (p.look) dog.setLook(p.look);
    this.scene.add(dog.root);
    dog.root.visible = false; // until the first position arrives
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.textContent = `${BREEDS[p.breed]?.emoji ?? '🐕'} ${p.name}${p.level ? ` \u00b7 ⭐${p.level}` : ''}`; // textContent: names are untrusted
    this.hud.root.appendChild(tag);
    this.dogs.set(p.id, { ...p, dog, tag, buf: [], heading: 0, digT: 0 });
    if (p.carry) this.setCarry(p.id, p.carry);
  }

  /** Another dog picked something up (or put it down). */
  setCarry(id, kind) {
    const r = this.dogs.get(id), def = CARRYABLES[kind];
    if (!r) return;
    r.dog.hold(def ? def.build() : null, def?.hold);
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
    for (const [id, x, z, h, v, f, y = 0] of list) {
      if (id === myId) continue;
      const r = this.dogs.get(id);
      if (!r) continue;
      r.buf.push({ t: now, x, z, h, v, f, y });
      if (r.buf.length > 20) r.buf.shift();
    }
  }

  onAct(id, a, m = {}) {
    const r = this.dogs.get(id);
    if (!r) return;
    if (a === 'emote') {
      r.dog.emote(m.e);
      const d = this.getListener().distanceTo(r.dog.root.position);
      if (m.e === 'howl' && d < 40) sfx.howl?.(r.dog.breed.bark, Math.max(0.15, 1 - d / 40));
      return;
    }
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

  /** Another dog changed outfit or levelled up. */
  setLook(id, look, level) {
    const r = this.dogs.get(id);
    if (!r) return;
    r.dog.setLook(look ?? {});
    if (level) { r.level = level; r.tag.textContent = `${BREEDS[r.breed]?.emoji ?? '🐕'} ${r.name} \u00b7 ⭐${level}`; }
  }

  /** Each standing dog's back is a little platform another dog can hop onto. */
  platforms() {
    const out = [];
    for (const r of this.dogs.values()) {
      if (!r.dog.root.visible) continue;
      const p = r.dog.root.position, s = r.dog.breed.size;
      out.push({ x: p.x, z: p.z, r: 0.32 * s, top: p.y + (r.dog.bodyY + 0.08) * s });
    }
    return out;
  }

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
      root.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      const h = a.h + wrap(c.h - a.h) * k;
      const turn = wrap(h - r.heading) / Math.max(dt, 1e-3);
      r.heading = h;
      root.rotation.y = h;
      r.digT = Math.max(0, r.digT - dt);
      if (c.v > 0.6 && (r.dog.emoteT ?? 0) > 0.25) r.dog.stopEmote(); // they've walked off
      r.dog.update(dt, { speed: a.v + (c.v - a.v) * k, turnRate: turn, sniff: !!(c.f & 1), dig: r.digT > 0 || !!(c.f & 2), happy: c.v > 2.8 ? 1 : 0.6, air: c.f & 4 ? 1 : 0, vy: (c.y - a.y) * 8, swim: c.f & 16 ? 1 : 0 });
      // Splash when they hit the water; little rings while they paddle about.
      const inW = !!(c.f & 8);
      if (inW && !r.inW) this.onSplash?.(root.position, Math.min(1.2, (c.v + 1) / 3));
      if (inW) { r.ringT = (r.ringT ?? 0) - dt; if (r.ringT <= 0) { r.ringT = c.v > 0.3 ? 0.4 : 0.9; this.onRipple?.(root.position); } }
      if (!inW && r.inW) r.shakeIn = 0.5;
      if (r.shakeIn > 0 && !inW) { r.shakeIn -= dt; if (r.shakeIn <= 0) this.onShake?.(r.dog, root.position); }
      r.inW = inW;

      // Name tag floats above the dog.
      const s = this.hud.project(root.position.clone().add(new THREE.Vector3(0, 0.9 * r.dog.breed.size, 0)));
      r.tag.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      r.tag.style.opacity = s.behind ? 0 : 1;
    }
  }
}
