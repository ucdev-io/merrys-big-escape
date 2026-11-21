import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mesh } from '../../world/props.js';
import { neighbourSeeds, townName } from '../../world/town/generator.js';
import { townSave, setTown, visitedTowns, firstTown } from '../../core/save.js';
import { HOME } from '../../net/links.js';
import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { progress } from '../progress.js';
import { TRIPS } from '../../trips/registry.js';

/*
 * 🚌 The bus stop, on the one edge of town with nothing out past it (world.busStop: see
 * world/town/builders.js). 🐾 or a woof there brings up the timetable: the three towns the bus goes to
 * from here (always the same three for a town), back to the last town you were in, back to your very first
 * town, and every other town you've been to, each with how many of its places you've found. Pick one and
 * the bus pulls in, on you hop, off it goes, and the next town loads (each town keeps its own finds: see
 * core/save.js). You get off at that town's bus stop.
 *
 * In a pack, the bus takes just you (your friends stay in this town): it asks first.
 *
 * Days out: the bus also goes to Wagtail Wonderland, the theme park (a trip: trips/fair/), and the Big Dog Show
 * (trips/show/). Those rides don't load another town: onTrip(id, paper) takes over at the end of one, and
 * dropOff() brings her back to the stop.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RIDE = 'merry.bus';        // (sessionStorage: on the bus to { seed, name, fresh } while the next town loads)
const TIP = 'merry.tips.bus';    // (the bus stop's been pointed out on this device)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ease = (k) => k * k * (3 - 2 * k);
const DAYS_OUT = [['fair', '🎢 Rides!'], ['show', '🏵️ Rosettes!']]; // (trips the bus goes to: their emoji and name come from the registry)

/** A red single-decker bus, facing +z, its door on the left (+x) at the front. */
function busModel() {
  const g = new THREE.Group();
  const RB = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, r);
  mesh(RB(2.4, 2.5, 9.2, 0.3), 0xc94a3a, g, [0, 1.6, 0]);
  mesh(RB(2.44, 0.45, 9.24, 0.15), 0xf1e8d8, g, [0, 2.1, 0]);                 // the cream band
  for (let i = 0; i < 6; i++) mesh(RB(0.06, 0.75, 1.1, 0.04), 0x9ab8cf, g, [1.21, 2.0, -3.4 + i * 1.3]);   // windows
  for (let i = 0; i < 6; i++) mesh(RB(0.06, 0.75, 1.1, 0.04), 0x9ab8cf, g, [-1.21, 2.0, -3.4 + i * 1.3]);
  mesh(RB(2.1, 0.9, 0.06, 0.05), 0x9ab8cf, g, [0, 2.0, 4.6], [-0.08, 0, 0]);   // windscreen
  mesh(RB(1.6, 0.3, 0.06, 0.04), 0x2b2b2b, g, [0, 2.65, 4.62]);                 // the destination board
  const door = new THREE.Group();
  door.position.set(1.22, 0, 3.4);
  g.add(door);
  for (const s of [-0.3, 0.3]) mesh(RB(0.05, 2.0, 0.58, 0.03), 0xd8e4ea, door, [0, 1.25, s]);
  for (const sx of [-1.05, 1.05]) for (const sz of [-3.0, 3.0]) mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 16), 0x2b2b2b, g, [sx, 0.48, sz], [0, 0, Math.PI / 2]);
  g.userData.door = door;
  return g;
}

export class BusStop {
  /**
   * @param o.stop     world.busStop
   * @param o.seed     this town's seed; o.name its name
   * @param o.blocked  () → why the bus can't be caught just now (Pepper's on a walk…), or null
   * @param o.friends  () → how many friends are here (in a pack)
   */
  constructor({ scene, hud, player, follow, actions, stop, seed, name, blocked, friends, prefetch }) {
    Object.assign(this, { scene, hud, player, follow, actions, stop, seed, name, blocked, friends, prefetch });
    this.bus = null;
    this.anim = null;
    this.hint = null;
    this.places = 0;
    // Just arrived by bus? (The ride's note, left by the last town.)
    try {
      const r = JSON.parse(sessionStorage.getItem(RIDE) ?? 'null');
      if (r?.seed === seed) this.arrived = r;
      sessionStorage.removeItem(RIDE);
    } catch { /* private mode */ }
  }

  near(pos, r = 2.6) { const s = this.stop; return !!s && (Math.hypot(pos.x - s.out.x, pos.z - s.out.z) < r || Math.hypot(pos.x - s.x, pos.z - s.z) < r); }

  /** What the prompt says here (and 🐾's label), or null. */
  prompt(pos) { return this.stop && !this.anim && this.near(pos) ? { text: '🚌 The bus stop! 🐾 for the timetable', paw: 'bus' } : null; }

  /** 🐾 or a woof at the stop: the timetable (true if it was ours). */
  onDig(pos) { if (this.anim || !this.near(pos)) return false; this.timetable(); return true; }
  onBark(pos) { if (!this.anim && this.near(pos)) this.timetable(); }

  /** Where the bus goes: [{ seed, name, tag, found }] in sections. */
  stops() {
    const visited = visitedTowns(), bySeed = new Map(visited.map((t) => [t.seed, t]));
    const row = (seed, tag) => ({ seed, name: townName(seed), tag, been: bySeed.has(seed), found: (bySeed.get(seed)?.discovered ?? []).length });
    const used = new Set([this.seed]);
    const take = (seed, tag) => { if (!seed || used.has(seed)) return null; used.add(seed); return row(seed, tag); };
    const next = neighbourSeeds(this.seed, 3).map((s) => take(s, 'next')).filter(Boolean);
    const back = take(visited.find((t) => t.seed !== this.seed)?.seed, 'back');
    const first = take(firstTown(), 'first');
    const others = visited.map((t) => take(t.seed, 'been')).filter(Boolean).slice(0, 6);
    return { next, back, first, others };
  }

  timetable() {
    const why = this.blocked?.();
    if (why) { this.hud.float(why, this.actions.anchor()); this.hud.showToastRaw('🚌', why, '', { tip: true }); return; }
    const { next, back, first, others } = this.stops(), total = this.places;
    const line = (t) => `<div class="bus-row"><span class="bus-name">${t.tag === 'first' ? '🏡' : t.tag === 'back' ? '↩️' : '🏘️'} ${esc(t.name)}</span>
      <span class="bus-meta">${t.been ? `🗺️ ${t.found}/${total}` : '✨ New!'}</span><button class="pill bus-go" data-town="${esc(t.seed)}">🚌 Go</button></div>`;
    const section = (title, list) => (list.length ? `<h3>${title}</h3>${list.map(line).join('')}` : '');
    const days = this.onTrip ? `<h3>Days out</h3>${DAYS_OUT.map(([id, meta]) => `<div class="bus-row"><span class="bus-name">${TRIPS[id].emoji} ${TRIPS[id].name}</span><span class="bus-meta">${meta}</span><button class="pill bus-go" data-trip="${id}">🚌 Go</button></div>`).join('')}` : '';
    this.hud.showCard(`<h1>🚌 All aboard!</h1><p class="bus-sub">Buses from <b>${esc(this.name)}</b>. Every town keeps its own finds.</p>
      <div class="bus-list">${days}${section('Next stops', next)}${section('Back to', [back, first].filter(Boolean))}${section('Towns you’ve been to', others)}</div>`,
    [['Not today', () => this.hud.hideCard()]]);
    for (const b of this.hud.card.querySelectorAll('[data-town]')) b.onclick = () => this.choose(b.dataset.town);
    for (const b of this.hud.card.querySelectorAll('[data-trip]')) b.onclick = () => this.chooseTrip(b.dataset.trip);
  }

  /** A town picked: in a pack, check first (the bus only takes you). */
  choose(seed) {
    const n = this.friends?.() ?? 0, name = townName(seed);
    if (!n) { this.hud.hideCard(); this.ride(seed); return; }
    this.hud.showCard(`<h1>🚌 Off to ${esc(name)}?</h1><p class="bus-sub">Your pack stays here in <b>${esc(this.name)}</b>. (The bus can bring you back any time.)</p>`, [
      ['🚌 Hop on', () => { this.hud.hideCard(); this.ride(seed); }],
      ['Stay with my pack', () => this.hud.hideCard()],
    ]);
  }

  /** A day out picked (the theme park, the dog show): in a pack, check first, as for a town. */
  chooseTrip(id) {
    const n = this.friends?.() ?? 0;
    if (!n) { this.hud.hideCard(); this.ride(null, id); return; }
    this.hud.showCard(`<h1>🚌 Off to ${TRIPS[id]?.name ?? 'a day out'}?</h1><p class="bus-sub">Your pack stays here in <b>${esc(this.name)}</b>. (The bus brings you back to this stop.)</p>`, [
      ['🚌 Hop on', () => { this.hud.hideCard(); this.ride(null, id); }],
      ['Stay with my pack', () => this.hud.hideCard()],
    ]);
  }

  /** The bus pulls in, on she hops, and off it goes (and then the next town, or a day out: `trip`). */
  ride(seed, trip = null) {
    const S = this.stop, P = this.player, fresh = !!seed && !townSave(seed).discovered && !visitedTowns().some((t) => t.seed === seed);
    this.bus = this.bus ?? busModel();
    const al = V(S.along[0], 0, S.along[1]);
    this.bus.rotation.y = Math.atan2(al.x, al.z);
    this.scene.add(this.bus);
    P.frozen = true;
    P.vel.set(0, 0);
    this.hud.setPrompt('');
    sfx.honk?.(0.7);
    if (trip) this.prefetch?.(trip); // (a day out: start fetching it now, so it's there by the end of the ride)
    this.anim = { kind: 'go', t: 0, seed, trip, fresh, from: P.pos.clone() };
    this.place(-38);
  }

  /** Where she gets off at this stop: { x, z, face } (looking along the road the way the bus goes). */
  outSpot() {
    const S = this.stop;
    return S ? { x: S.out.x, z: S.out.z, face: Math.atan2(S.along[0], S.along[1]) } : null;
  }

  /** Back from a day out: she's at the stop, and the bus pulls away. */
  dropOff() {
    const S = this.stop;
    if (!S) return;
    this.bus = this.bus ?? busModel();
    this.bus.rotation.y = Math.atan2(S.along[0], S.along[1]);
    this.scene.add(this.bus);
    this.place(0);
    this.anim = { kind: 'away', t: 0 };
  }

  /** The bus at s metres along the road from the stop (its door level with the stop at 0). */
  place(s) {
    const S = this.stop, al = V(S.along[0], 0, S.along[1]);
    this.bus.position.set(S.road.x, 0, S.road.z).addScaledVector(al, s - 3.4); // (the door's 3.4 m forward of its middle)
  }

  /** Just off the bus in a new town: she's at the stop, and it pulls away. */
  arrive() {
    const r = this.arrived;
    this.arrived = null;
    if (!r || !this.stop) return false;
    const S = this.stop, P = this.player, al = V(S.along[0], 0, S.along[1]);
    // Off she gets, looking along the road the way the bus goes (the camera behind her, clear of the shelter).
    const face = Math.atan2(al.x, al.z);
    P.pos.set(S.out.x, 0, S.out.z);
    P.heading = face;
    P.object.rotation.y = face;
    this.follow.snap(P.pos);
    this.follow.yaw = face + Math.PI;
    this.bus = this.bus ?? busModel();
    this.bus.rotation.y = Math.atan2(al.x, al.z);
    this.scene.add(this.bus);
    this.place(0);
    this.anim = { kind: 'away', t: 0 };
    setTimeout(() => this.hud.showToastRaw('🚌', `Welcome to ${r.name}!`, r.fresh ? 'A whole new town to explore. Sniff out its places!' : 'Back again! Your finds here are just as you left them.'), 2200); // (after any pack news)
    if (r.fresh) { progress.stat('towns'); progress.award(15, 'New town!'); }
    return true;
  }

  update(dt) {
    const P = this.player, a = this.anim;
    // The first time she's near it: what it's for.
    if (this.stop && !a && this.near(P.pos, 8)) {
      let told = true;
      try { told = !!localStorage.getItem(TIP); if (!told) localStorage.setItem(TIP, '1'); } catch { /* private mode */ }
      if (!told) this.hud.showToastRaw('🚌', 'A bus stop!', 'Buses go to other towns, each with places of its own to find. 🐾 at the stop for the timetable.');
    }
    if (!a) return;
    a.t += dt;
    if (a.kind === 'go') {
      if (a.t < 3.2) this.place(-38 * (1 - ease(Math.min(1, a.t / 3.2)))); // pulling in, slowing down
      else if (a.t < 4.2) { // the door: on she hops
        const k = Math.min(1, (a.t - 3.2) / 0.7), door = this.bus.userData.door.getWorldPosition(V(0, 0, 0));
        if (!a.hop) { a.hop = true; sfx.boing?.(); buzz(15); }
        P.pos.lerpVectors(a.from, door, k);
        P.pos.y = Math.sin(k * Math.PI) * 0.6 + k * 0.35;
        P.heading = Math.atan2(door.x - a.from.x, door.z - a.from.z);
        P.object.rotation.y = P.heading;
        if (k >= 1) P.object.visible = false;
      } else { // and off it goes
        const k = a.t - 4.2;
        this.place(1.2 * k * k);
        P.pos.copy(this.bus.userData.door.getWorldPosition(V(0, 0, 0))).setY(1.4); // (the camera follows the bus)
        if (k > 0.8 && !a.fade) { a.fade = document.createElement('div'); a.fade.className = 'travel-fade'; this.hud.root.prepend(a.fade); sfx.honk?.(0.4); }
        if (a.fade) a.fade.style.opacity = Math.min(1, (k - 0.8) / 1.2).toFixed(2);
        if (k > 2.2 && !a.gone && a.trip) { // (a day out: the trip takes over from here, behind the paper)
          a.gone = true;
          this.anim = null;
          this.bus.removeFromParent();
          this.onTrip(a.trip, a.fade);
        } else if (k > 2.2 && !a.gone) {
          a.gone = true;
          try { sessionStorage.setItem(RIDE, JSON.stringify({ seed: a.seed, name: townName(a.seed), fresh: a.fresh })); } catch { /* private mode */ }
          setTown(a.seed);
          location.href = `${HOME}?town`; // (the next town: built fresh, like coming back to the game)
        }
      }
    } else if (a.kind === 'away') { // dropped off: it pulls away
      if (a.t > 1.2) { const k = a.t - 1.2; this.place(1.2 * k * k); }
      if (a.t > 6) { this.bus.removeFromParent(); this.anim = null; }
    }
  }
}

/** The loading note while a town's built, if we're arriving by bus (see main.js). */
export function busArrivalNote() {
  try { const r = JSON.parse(sessionStorage.getItem(RIDE) ?? 'null'); return r?.name ? `🚌 Arriving in ${r.name}…` : null; } catch { return null; }
}
