import * as THREE from 'three';
import { ITEMS } from '../entities/items.js';
import { BREEDS } from '../entities/breeds.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { loadSave, writeSave } from '../core/save.js';
import { showLobby } from '../ui/lobby.js';
import { packPath } from '../net/links.js';
import { DogActions } from '../systems/dogActions.js';
import { DigSpots } from './yard/digSpots.js';
import { Sprinkler } from './yard/sprinkler.js';
import { Pickles } from './yard/pickles.js';
import { escapeCutscene } from './yard/escape.js';
import { progress } from './progress.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Each treasure has a few possible hiding places, so the garden isn't identical every time.
const SPOTS = {
  duck: [V(-5.3, 0, 3.3), V(-7.8, 0, 6.6), V(1.2, 0, 5.4)],
  sock: [V(-4.1, 0, -3.92)], // hanging on the washing line — too high to reach from the ground!
  biscuit: [V(5.5, 0, 3.9), V(8.4, 0, 1.2), V(5.8, 0, -2.6)],
};
const pickSpot = (k) => pick(SPOTS[k]);
const TREASURES = [
  { key: 'duck', pos: pickSpot('duck'), need: 5 },
  { key: 'sock', pos: pickSpot('sock'), need: 5, reach: 0.85 },
  { key: 'biscuit', pos: pickSpot('biscuit'), need: 6 },
];
const TUNNEL = { key: 'tunnel', pos: V(-1.4, 0, 7.55), need: 14 };
const OUTSIDE = V(-1.4, 0, 9.3);

/** Chapter 1: escape your own back garden (any breed), with Pickles heckling from the fence. */
export class YardChapter {
  constructor({ scene, world, player, hud, input, follow, pipeline }) {
    Object.assign(this, { scene, world, player, hud, input, follow, pipeline });
    const save = loadSave();
    this.found = save.found ?? [];
    this.escaped = !!save.escaped;
    this.time = 0;
    this.cutscene = null;
    this.started = false;

    this.actions = new DogActions({
      scene, hud, input, player, pipeline, world,
      dogName: () => this.dogName, breedName: () => BREEDS[this.player.breedKey].breed,
    });
    this.actions.onMischief = () => this.pickles.say('mischief', { cooldown: 25 });
    this.actions.onScatter = () => this.pickles.say('pigeons', { cooldown: 20 });
    this.spots = new DigSpots(scene, [...TREASURES, TUNNEL], this.found, this.actions);
    this.pickles = new Pickles(scene, hud, () => ({ name: this.dogName, breed: BREEDS[this.player.breedKey].breed, breedKey: this.player.breedKey }));
    this.sprinkler = new Sprinkler(scene, world, V(3.2, 0, -4.6));
    this.gnome = world.props.gnome;
    this.gnomeTip = 0;

    this.refreshObjective();
    hud.setFound(this.found, TREASURES.length);
    this.player.frozen = true;
    if (this.escaped) this.showEscapedCard();
    else this.showIntro();
  }

  // ---------- flow ----------

  isTouch() { return document.body.classList.contains('touch-mode'); }

  get dogName() { return loadSave().profile?.name ?? BREEDS[this.player.breedKey].dogName; }

  /** "Who's escaping today?" — pick a dog over the live garden, then the controls card. */
  showIntro() {
    const pack = loadSave().pendingPack;
    this.follow.manualHold = 1e9;
    this.follow.yaw = this.player.heading + Math.PI * 0.62;
    this.follow.distance = 3.2;
    const prev = loadSave().profile ?? { breed: this.player.breedKey, name: BREEDS[this.player.breedKey].dogName };
    const lobby = showLobby({
      hud: this.hud,
      profile: prev,
      garden: true,
      title: 'Who’s escaping today?',
      subtitle: pack ? `Escape your garden, then you’ll join pack <b>${pack}</b>!` : 'Every dog starts in their own back garden…',
      current: progress.id,
      onBreed: (k) => { if (k !== this.player.breedKey) this.player.setBreed(k); },
      onLook: (look) => this.player.setLook(look),
      onSolo: async (c) => {
        lobby.setBusy(true);
        await progress.useDog(c); // a saved dog (stars, outfit and all), or a brand-new one
        writeSave({ profile: { breed: c.breed, name: c.name } });
        this.player.setLook(progress.look);
        lobby.close();
        this.showControls();
      },
    });
  }

  showControls() {
    this.follow.manualHold = 0;
    this.follow.distance = 7;
    this.follow.yaw = this.player.heading + Math.PI;
    const name = this.dogName;
    const firstTime = !loadSave().seenControls;
    writeSave({ seenControls: true });
    const keys = !firstTime ? 'Controls are in <b>☰ → How to play</b>.' : this.isTouch()
      ? 'Drag on the left to walk · 🦘 to jump · Hold 👃 to sniff · Tap 🐾 to dig · 🗣️ to woof · 💨 for zoomies'
      : '<b>WASD</b> walk · <b>Space</b> jump · hold <b>Shift</b> for zoomies · hold <b>F</b> to sniff · <b>E</b> dig · <b>Q</b> woof';
    this.hud.showCard(`
      <h1 class="who"></h1>
      <p><span class="who2"></span> is bored of the back garden.<br>There must be a way out… and that nose knows it!</p>
      <p class="keys">${keys}</p>`,
      [['Let’s go! 🐾', () => this.start()]]);
    this.hud.card.querySelector('.who').textContent = `${name}'s Big Escape`;
    this.hud.card.querySelector('.who2').textContent = name;
  }

  start() {
    this.hud.hideCard();
    this.player.frozen = false;
    this.started = true;
    if (!this.found.length) {
      this.pickles.say('intro', { force: true });
      sfx.meow();
      this.later(3.8, () => this.pickles.say('intro2', { force: true }));
    }
  }

  treasuresFound() { return this.found.filter((k) => k !== 'tunnel').length; }

  refreshObjective() {
    const n = this.treasuresFound();
    if (n < TREASURES.length) {
      this.hud.setObjective(`Sniff out buried treasure! <b>${n}/${TREASURES.length}</b>`, 'Sniffing shows a golden trail to the nearest treasure.', { icon: '🦴', short: `${n}/${TREASURES.length}` });
    } else if (!this.found.includes('tunnel')) {
      const t = this.spots.get('tunnel');
      this.hud.setObjective(t.revealed ? 'Dig a tunnel under the fence! Dig dig dig!' : 'Something smells like <b>freedom</b>… sniff out the soft spot by the fence!', '', { icon: '🕳️', short: '!' });
    } else {
      this.hud.setObjective('You escaped! 🎉', '', { icon: '🎉' });
    }
  }

  later(t, fn) { (this.timers ??= []).push({ t, fn }); }

  // ---------- per frame ----------

  update(dt) {
    this.time += dt;
    const P = this.player, pos = P.pos;
    if (this.timers) this.timers = this.timers.filter((tm) => ((tm.t -= dt) > 0 ? true : (tm.fn(), false)));
    if (this.cutscene) this.cutscene(dt);
    const canAct = this.started && !P.frozen;

    // Dig spots: revealed by sniffing, dug by digging, or (the sock) reached by climbing.
    const active = this.spots.active(this.treasuresFound(), TREASURES.length);
    const st = this.spots.update(dt, active, pos, canAct && this.input.sniff, this.time);
    if (st.revealedTunnel) this.refreshObjective();
    if (st.reached) this.complete(st.reached);
    if (st.prompt) {
      this.stuckT = (this.stuckT ?? 0) + dt;
      if (this.stuckT > 6 && !this.saidSockHint) { this.saidSockHint = true; this.pickles.say('sockHint', { force: true, dur: 4 }); }
    }
    if (!canAct) this.hud.setPrompt('');
    else if (st.prompt) this.hud.setPrompt(st.prompt);
    else if (st.near) {
      const n = st.near;
      const bar = n.need > 6 ? '  ' + '▮'.repeat(Math.round((n.progress / n.need) * 10)).padEnd(10, '▯') : '';
      this.hud.setPrompt((this.isTouch() ? 'Tap 🐾 to dig!' : 'Press E to dig!') + bar);
    } else this.hud.setPrompt('');

    // Sniff / dig / bark / splash / mischief — shared with the neighbourhood.
    this.actions.update(dt, {
      canAct,
      goal: st.nearest?.pos ?? null,
      onDig: () => this.digSpot(st.near),
      onBark: () => this.reactToBark(),
    });
    if (canAct) this.pickles.sniffing(this.actions.sniffHeld);
    if (P.leftWater) this.later(0.6, () => { if (this.pickles.say('wet', { cooldown: 30 })) this.pickles.laugh(1); });

    // The sprinkler gag.
    if (this.sprinkler.update(dt, pos, this.started)) {
      this.later(1.0, () => this.actions.waterFx.shake(P.dog, P.pos));
      this.later(1.3, () => { this.pickles.say('soggy', { force: true, dur: 3 }); this.pickles.laugh(2); sfx.meow(); progress.award(5, 'Soggy doggy!'); });
    }
    this.updateGnome(dt);
    this.pickles.update(dt, P, { talk: this.started && !this.cutscene && !P.frozen });
    this.updatePopping(dt);
  }

  /** A dig press: true if it went into a dig spot (otherwise it's just lawn mischief). */
  digSpot(near) {
    if (!near) {
      if (Math.random() < 0.4) this.pickles.say('dig', { cooldown: 25 });
      return false;
    }
    this.actions.dirtBurst(near.pos, 8);
    near.progress++;
    this.hud.float(pick(['dig!', 'scratch!', 'dig dig!']), near.pos.clone().add(V(0, 0.5, 0)), 'dig');
    if (near.key === 'tunnel') {
      if (near.progress === 2) this.pickles.say('tunnelStart', { force: true, dur: 3 });
      if (near.progress === Math.floor(near.need / 2)) this.pickles.say('tunnelHalf', { force: true, dur: 3 });
    }
    if (near.progress >= near.need) this.complete(near);
    return true;
  }

  complete(s) {
    this.spots.finish(s);
    this.found.push(s.key);
    writeSave({ found: this.found, escaped: false });
    this.hud.setFound(this.found, TREASURES.length);
    if (s.key === 'tunnel') { this.startEscape(s); return; }

    progress.stat('treasures');
    progress.award(20, `${ITEMS[s.key].name}!`);
    const obj = ITEMS[s.key].build();
    obj.position.copy(s.pos);
    if (s.hang) this.hud.float('YOINK!', V(s.pos.x, 1.6, s.pos.z));
    this.scene.add(obj);
    this.popping = { obj, t: 0, stinky: !!obj.userData.stinky };
    sfx.found();
    buzz([25, 40, 25]);
    if (s.key === 'duck') this.later(0.5, () => sfx.squeak());
    this.player.happy = 1;
    this.later(2.5, () => (this.player.happy = 0.5));
    this.actions.sparkle(s.pos.clone().add(V(0, 0.3, 0)), 18);
    this.later(0.8, () => this.hud.showToast(s.key));
    this.refreshObjective();

    // Pickles has opinions.
    this.later(2.2, () => { this.pickles.say(s.key, { force: true }); this.pickles.hopOn(); });
    if (this.treasuresFound() === TREASURES.length) {
      this.later(6.2, () => { this.pickles.say('hint', { force: true, dur: 5 }); this.pickles.hopTo(0); });
    }
    this.pickles.idleT = Math.max(this.pickles.idleT, 12);
  }

  updatePopping(dt) {
    const p = this.popping;
    if (!p) return;
    p.t += dt;
    const k = Math.min(1, p.t / 0.9);
    p.obj.position.y = Math.sin(k * Math.PI * 0.85) * 0.9 + 0.05;
    p.obj.rotation.y += dt * 8;
    if (p.t > 1.4) {
      const s = Math.max(0, 1 - (p.t - 1.4) / 0.3);
      p.obj.scale.setScalar(s * 1.5);
      if (s <= 0) { this.scene.remove(p.obj); this.popping = null; }
    } else p.obj.scale.setScalar(1.5);
    if (p.stinky && Math.random() < dt * 20) this.actions.smellPuff(p.obj.position.clone().setY(0), 0x9ab86a);
  }

  reactToBark() {
    const pos = this.player.pos;
    if (this.pickles.cat.root.position.distanceTo(pos) < 5) {
      this.pickles.startle();
      this.pickles.say('barkAt', { cooldown: 4, dur: 2.2 });
      this.pickles.idleT = Math.max(this.pickles.idleT, 10);
    }
    if (this.gnome.position.distanceTo(pos) < 3.5 && this.gnomeTip <= 0) {
      this.gnomeTip = 4.5;
      this.later(0.45, () => sfx.bonk());
      this.later(1.0, () => { this.pickles.say('gnome', { force: true, dur: 2.5 }); this.pickles.laugh(1.5); progress.award(5, 'Timber!'); });
    }
  }

  updateGnome(dt) {
    const g = this.gnome;
    g.userData.baseRot ??= g.rotation.clone();
    this.gnomeTip = Math.max(0, this.gnomeTip - dt);
    const tip = this.gnomeTip > 0.8 ? 1 : this.gnomeTip / 0.8;
    const target = -1.45 * tip;
    g.userData.tilt = (g.userData.tilt ?? 0) + (target - (g.userData.tilt ?? 0)) * (1 - Math.exp(-dt * (tip > 0.5 ? 9 : 3)));
    g.rotation.x = g.userData.baseRot.x + g.userData.tilt;
    g.position.y = Math.abs(Math.sin(g.userData.tilt)) * 0.12;
  }

  // ---------- the great escape ----------

  startEscape(s) {
    this.cutscene = escapeCutscene({
      player: this.player, follow: this.follow, hud: this.hud, actions: this.actions, spot: s, outside: OUTSIDE,
      onFree: () => { this.pickles.say('escaped', { force: true, dur: 4 }); sfx.meow(); },
      onDone: () => {
        this.cutscene = null;
        if (!this.escaped) progress.award(50, 'Escaped!');
        progress.escapedGarden();
        this.escaped = true;
        writeSave({ found: this.found, escaped: true, yardDone: true });
        this.refreshObjective();
        this.showEscapedCard();
      },
    });
  }

  showEscapedCard() {
    this.player.frozen = true;
    const pack = loadSave().pendingPack;
    const go = pack
      ? [`Join pack ${pack} →`, () => { writeSave({ chapter: 'town', pendingPack: null }); location.href = packPath(pack); }]
      : ['Into the neighbourhood →', () => { writeSave({ chapter: 'town' }); location.href = '/?town'; }];
    this.hud.showCard(`
      <h1 class="who"></h1>
      <p>With a squeaky duck, a smelly sock, an ancient biscuit<br>and a very muddy nose, <span class="who2"></span> is free!</p>
      <p>Beyond the fence lies <b>the Neighbourhood</b> — your friends, new smells, new adventures…</p>`,
      [go, ['Play the garden again', () => { writeSave({ found: [], escaped: false, chapter: 'yard' }); location.href = '/'; }]]);
    this.hud.card.querySelector('.who').textContent = `${this.dogName} escaped! 🎉`;
    this.hud.card.querySelector('.who2').textContent = this.dogName;
  }
}
