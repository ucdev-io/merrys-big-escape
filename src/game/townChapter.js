import * as THREE from 'three';
import { Particles } from '../fx/particles.js';
import { ScentTrail } from '../systems/scentTrail.js';
import { sfx } from '../core/audio.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { TOWN, PLACE_EMOJI, randomSeed } from '../world/town/generator.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BLURBS = {
  park: 'Swings, slides and a very suspicious lawnmower.',
  pond: 'It smells VERY ducky round here.',
  bakery: 'Sausages and warm bread. This must be heaven.',
  alley: 'Bins. Glorious, stinky bins.',
};

/**
 * Chapter 2: exploring the procedurally generated neighbourhood.
 * All game-state changes go through dispatch(event) so a multiplayer server can relay them later.
 */
export class TownChapter {
  constructor({ scene, world, player, hud, input, follow, pipeline }) {
    Object.assign(this, { scene, world, player, hud, input, follow, pipeline });
    this.layout = world.layout;
    const save = loadSave();
    this.state = { seed: this.layout.seed, discovered: save.town?.seed === this.layout.seed ? save.town.discovered ?? [] : [] };
    this.places = this.layout.places.filter((p) => p.type !== 'home');
    this.time = 0;
    this.sniffAmt = 0;
    this.sniffSfxT = 0;
    this.barkCD = 0;

    this.trail = new ScentTrail(scene);
    this.dirt = new Particles(scene, { max: 200, shadows: true });
    this.glow = new Particles(scene, { max: 150, emissive: true });
    this.merryAnchor = () => this.player.pos.clone().add(V(0, 1.0, 0));

    this.compass = document.createElement('div');
    this.compass.className = 'compass hidden';
    this.compass.innerHTML = '<div class="arrow">➤</div><div class="label"></div>';
    hud.root.appendChild(this.compass);

    hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    this.player.frozen = true;
    this.showWelcome();
  }

  // ---------- state & events (multiplayer-friendly) ----------

  dispatch(ev) {
    if (ev.type === 'discover' && !this.state.discovered.includes(ev.id)) {
      this.state.discovered.push(ev.id);
      writeSave({ chapter: 'town', town: { ...this.state } });
      this.onDiscovered(ev.id);
    }
  }

  placeList() {
    return this.places.map((p) => ({ ...p, emoji: PLACE_EMOJI[p.type], blurb: BLURBS[p.type], found: this.state.discovered.includes(p.id) }));
  }

  // ---------- flow ----------

  isTouch() { return document.body.classList.contains('touch-mode'); }

  showWelcome() {
    this.hud.showCard(`
      <h1>Welcome to ${this.layout.name}!</h1>
      <p>Merry is out of the garden and the whole neighbourhood is waiting.<br>Follow your nose and find all the best places!</p>
      <p class="keys">Town code: <b>${this.layout.seed}</b> — the same code always makes the same town.</p>`,
      [
        ['Explore! 🐾', () => { this.hud.hideCard(); this.player.frozen = false; }],
        ['🎲 New town', () => { writeSave({ chapter: 'town', town: { seed: randomSeed(), discovered: [] } }); location.reload(); }],
        ['Back to the garden', () => { writeSave({ chapter: 'yard' }); location.reload(); }],
      ]);
  }

  refreshObjective() {
    const n = this.state.discovered.length, total = this.places.length;
    const hint = this.isTouch() ? 'Hold <b>👃 Sniff</b> to smell the way' : 'Hold <b>Space</b> to smell the way';
    if (n < total) this.hud.setObjective(`Explore ${this.layout.name}! Places found <b>${n}/${total}</b>`, hint);
    else this.hud.setObjective(`You know every corner of ${this.layout.name}! 🎉`, 'New friends are coming soon…');
  }

  onDiscovered(id) {
    const p = this.places.find((q) => q.id === id);
    sfx.found();
    this.hud.showToastRaw(PLACE_EMOJI[p.type], `Discovered: <b>${p.name}</b>!`, BLURBS[p.type]);
    this.hud.setPlaces?.(this.placeList());
    this.player.happy = 1;
    setTimeout(() => (this.player.happy = 0.5), 2500);
    this.glow.burst(24, () => ({
      pos: this.player.pos.clone().add(V(0, 0.8, 0)),
      vel: V(rand(-2, 2), rand(1.5, 3.5), rand(-2, 2)),
      life: 1.3, size: 0.05, gravity: 3, color: pick([0xf6d06a, 0xf2a0b4, 0xb69be0, 0x8fc4d8]),
    }));
    this.refreshObjective();
    if (this.state.discovered.length === this.places.length) {
      setTimeout(() => {
        sfx.hooray();
        this.hud.showCard(`
          <h1>Top explorer! 🗺️</h1>
          <p>Merry has sniffed every corner of ${this.layout.name}.</p>
          <p>Next time: <b>new friends</b> — a grumpy cat, a worried duck, a sleepy old basset hound and more…</p>`,
          [['Keep exploring', () => this.hud.hideCard()], ['🎲 Try a new town', () => { writeSave({ town: { seed: randomSeed(), discovered: [] } }); location.reload(); }],
            ['Start over', () => { clearSave(); location.reload(); }]]);
      }, 2500);
    }
  }

  nextPlace() {
    let best = null, bd = Infinity;
    for (const p of this.places) {
      if (this.state.discovered.includes(p.id)) continue;
      const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { place: best, dist: bd } : null;
  }

  // ---------- per frame ----------

  update(dt) {
    this.time += dt;
    const P = this.player, pos = P.pos, input = this.input;
    const canAct = !P.frozen;

    // Discover places by walking into them.
    for (const p of this.places) {
      if (!this.state.discovered.includes(p.id) && Math.abs(pos.x - p.x) < TOWN.BLOCK / 2 && Math.abs(pos.z - p.z) < TOWN.BLOCK / 2) {
        this.dispatch({ type: 'discover', id: p.id });
      }
    }

    // Sniffing → sepia vision + scent trail toward the nearest undiscovered place.
    const sniffing = canAct && input.sniff;
    this.sniffAmt += ((sniffing ? 1 : 0) - this.sniffAmt) * (1 - Math.exp(-dt * 6));
    this.pipeline.sniff = this.sniffAmt;
    this.sniffSfxT -= dt;
    if (sniffing && this.sniffSfxT <= 0) {
      sfx.sniff();
      this.hud.float(pick(['sniff sniff', 'snf snf', 'sniiiff']), this.merryAnchor(), 'sniff');
      this.sniffSfxT = 1.3;
    }
    const nose = pos.clone().add(V(Math.sin(P.heading) * 0.42, 0.3, Math.cos(P.heading) * 0.42));
    const next = this.nextPlace();
    this.trail.update(dt, this.sniffAmt, nose, next ? V(next.place.x, 0, next.place.z) : null);

    // Dig anywhere (nothing to find yet — friends' treasures come later).
    if (canAct && input.dig) {
      P.digTimer = 0.35;
      sfx.dig();
      const back = V(-Math.sin(P.heading), 0, -Math.cos(P.heading));
      this.dirt.burst(5, () => ({
        pos: nose.clone().setY(0.08),
        vel: back.clone().multiplyScalar(rand(1, 2.5)).add(V(rand(-0.8, 0.8), rand(1.8, 3.2), rand(-0.8, 0.8))),
        life: rand(0.8, 1.3), size: rand(0.025, 0.05), gravity: 9, floor: 0.06, color: pick([0x9a7356, 0x7a5236, 0xb08a68]),
      }));
    }

    // Bark.
    this.barkCD -= dt;
    if (canAct && input.bark && this.barkCD <= 0) {
      this.barkCD = 0.5;
      P.dog.bark();
      sfx.bark();
      this.hud.float('WOOF!', this.merryAnchor());
    }

    // Compass toward the next place.
    if (next && canAct) {
      const yaw = this.follow.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      const dx = next.place.x - pos.x, dz = next.place.z - pos.z;
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      this.compass.classList.remove('hidden');
      this.compass.firstChild.style.transform = `rotate(${ang - Math.PI / 2}rad)`;
      this.compass.lastChild.innerHTML = `${PLACE_EMOJI[next.place.type]} ??? · ${Math.round(next.dist)}m`;
    } else this.compass.classList.add('hidden');

    this.dirt.update(dt);
    this.glow.update(dt);
    this.hud.setStamina(P.stamina, P.speed > 3);
  }
}
