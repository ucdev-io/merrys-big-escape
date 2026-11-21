import * as THREE from 'three';
import { Dog } from '../entities/dog.js';
import { BREEDS } from '../entities/breeds.js';
import { CARRYABLES } from '../entities/carryables.js';
import { sfx } from '../core/audio.js';

const DELAY = 150; // ms behind real time, so we can smoothly interpolate between snapshots
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const _up = new THREE.Vector3();

/** A friend's name tag: breed emoji and name, then their level, smaller (as text: names are untrusted). */
function nameTag(r) {
  const lv = document.createElement('small');
  lv.textContent = r.level ? ` ⭐${r.level}` : '';
  r.tag.replaceChildren(document.createTextNode(`${BREEDS[r.breed]?.emoji ?? '🐕'} ${r.name}`), lv);
}

/** Other players' dogs: models, smoothing, name tags, and their barks. */
export class RemoteDogs {
  constructor(scene, hud, getListener) {
    this.scene = scene;
    this.hud = hud;
    this.getListener = getListener; // → my dog's position, for distance-based volume
    this.dogs = new Map();
    this.rides = null; // (friends riding cars: see rideCars.js, set up by the town)
  }

  add(p) {
    if (this.dogs.has(p.id)) return;
    const dog = new Dog(p.breed);
    if (p.look) dog.setLook(p.look);
    this.scene.add(dog.root);
    dog.root.visible = false; // until the first position arrives
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    this.hud.root.appendChild(tag);
    const r = { ...p, dog, tag, buf: [], heading: 0, digT: 0 };
    nameTag(r);
    this.dogs.set(p.id, r);
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
    this.rides?.drop(id);
    r.dog.root.removeFromParent(); // (from wherever she is: the town, or a trip's own scene)
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
      this.onBark?.(r.dog.root.position); // (an owl in the wood might hear it)
    } else if (a === 'dig') r.digT = 0.35;
    else if (a === 'shake') r.dog.shake();
  }

  get(id) { return this.dogs.get(id); }

  /** Another dog changed outfit or levelled up. */
  setLook(id, look, level) {
    const r = this.dogs.get(id);
    if (!r) return;
    r.dog.setLook(look ?? {});
    if (level) { r.level = level; nameTag(r); }
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

  /** Every dog back in the town's scene (before a trip's scene is thrown away: they'd go with it). */
  home() {
    for (const r of this.dogs.values()) if (r.dog.root.parent !== this.scene) this.scene.add(r.dog.root);
    this.myTrip = 0;
  }

  /**
   * where: { trip, scene, chapter } while I'm off on a trip myself: friends on the same trip are drawn there (in its
   * scene), everyone else is hidden, and the trip's chapter can dress a friend who's on one of its rides
   * (chapter.remoteRide(r, ride): ride 0 when they're off it, or gone).
   */
  update(dt, where = null) {
    const renderT = performance.now() - DELAY, myTrip = where?.trip ?? 0, scene = where?.scene ?? this.scene, chap = where?.chapter ?? null;
    if (myTrip !== (this.myTrip ?? 0)) {
      this.myTrip = myTrip;
      const here = myTrip ? [...this.dogs.values()].filter((r) => (r.away ?? 0) === myTrip) : [];
      if (here.length) this.onFriendsHere?.(here); // (already there when she arrives)
    }
    // (Where your own dog is on screen: a friend's name tag over it goes see-through.)
    const mine = this.hud.dogAnchor ? this.hud.project(this.hud.dogAnchor()) : null, cam = this.hud.camera.position;
    for (const r of this.dogs.values()) {
      const b = r.buf;
      if (!b.length) continue;
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= renderT && b[i + 1].t >= renderT) { a = b[i]; c = b[i + 1]; break; }
      const k = c.t > a.t ? THREE.MathUtils.clamp((renderT - a.t) / (c.t - a.t), 0, 1) : 1;
      const root = r.dog.root;
      // Away on a trip (down a drain…): no dog to see here until they're back.
      const away = (c.f >> 8) & 15, ride = myTrip ? (c.f >> 12) & 15 : 0;
      if (away !== (r.away ?? 0)) { const was = r.away ?? 0; r.away = away; this.onAway?.(r, away, was, myTrip); }
      if (away !== myTrip) { // (somewhere else: in town while I'm on a trip, or on another trip)
        root.visible = false; r.tag.style.opacity = 0;
        if (!myTrip) this.rides?.update(dt, r.id, root.position, { grounded: false }); // (and any car she was on drives off)
        if (r.ride) { r.ride = 0; chap?.remoteRide?.(r, 0); }
        continue;
      }
      if (root.parent !== scene) scene.add(root);
      root.visible = true;
      root.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      // On top of one of their own cars (we've none of those here: every game drives its own)? One of ours, under them.
      if (!myTrip) this.rides?.update(dt, r.id, root.position, { grounded: !(c.f & 4), own: c.v, other: !!(c.f & (8 | 32)) });
      const h = a.h + wrap(c.h - a.h) * k;
      const turn = wrap(h - r.heading) / Math.max(dt, 1e-3);
      r.heading = h;
      root.rotation.y = h;
      r.digT = Math.max(0, r.digT - dt);
      if (ride) { // (sat on one of the trip's rides: sitting still, and the trip draws what they're sat on)
        if (r.dog.emoteKind === 'sit' && (r.dog.emoteT ?? 0) > 0.3) r.dog.emoteT = Math.max(r.dog.emoteT, 1.5); else r.dog.emote('sit');
      } else if (c.v > 0.6 && (r.dog.emoteT ?? 0) > 0.25) r.dog.stopEmote(); // they've walked off
      if (ride !== (r.ride ?? 0) || ride) { r.ride = ride; chap?.remoteRide?.(r, ride); }
      r.dog.update(dt, { speed: a.v + (c.v - a.v) * k, turnRate: turn, sniff: !!(c.f & 1), dig: r.digT > 0 || !!(c.f & 2), happy: c.v > 2.8 ? 1 : 0.6, air: c.f & 4 ? 1 : 0, vy: (c.y - a.y) * 8, swim: c.f & 16 ? 1 : 0 });
      // Splash when they hit the water; little rings while they paddle about.
      const inW = !!(c.f & 8) && !myTrip; // (the splashes are the town's: not on a trip)
      if (inW && !r.inW) this.onSplash?.(root.position, Math.min(1.2, (c.v + 1) / 3));
      if (inW) { r.ringT = (r.ringT ?? 0) - dt; if (r.ringT <= 0) { r.ringT = c.v > 0.3 ? 0.4 : 0.9; this.onRipple?.(root.position); } }
      if (!inW && r.inW) r.shakeIn = 0.5;
      if (r.shakeIn > 0 && !inW) { r.shakeIn -= dt; if (r.shakeIn <= 0) this.onShake?.(r.dog, root.position); }
      r.inW = inW;
      const mud = (c.f >> 6) & 3; // how muddy they are (the Woods; 32 is a sledge)
      if (mud !== (r.mud ?? 0)) { r.mud = mud; this.onMud?.(r.dog, mud); }

      // Name tag floats above the dog: smaller further away, and see-through when it's in the way of your own dog.
      const s = this.hud.project(_up.copy(root.position).setY(root.position.y + 0.9 * r.dog.breed.size));
      const far = THREE.MathUtils.clamp(1.15 - cam.distanceTo(root.position) / 40, 0.7, 1);
      const over = mine && !mine.behind && Math.abs(s.x - mine.x) < 80 && s.y > mine.y - 70 && s.y < mine.y + 60;
      r.tag.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${far.toFixed(2)})`;
      r.tag.style.opacity = s.behind ? 0 : over ? 0.22 : 0.9;
    }
    if (!myTrip) this.rides?.tick(dt, this.dogs);
  }
}
