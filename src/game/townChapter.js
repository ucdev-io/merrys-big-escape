import * as THREE from 'three';
import { Particles } from '../fx/particles.js';
import { ScentTrail } from '../systems/scentTrail.js';
import { sfx } from '../core/audio.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { TOWN, PLACE_EMOJI, randomSeed } from '../world/town/generator.js';
import { BREEDS } from '../entities/breeds.js';
import { RemoteDogs } from '../net/remoteDogs.js';
import { NetClient } from '../net/client.js';
import { showLobby } from '../ui/lobby.js';

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
  constructor({ scene, world, player, hud, input, follow, pipeline, net = null, welcome = null }) {
    Object.assign(this, { scene, world, player, hud, input, follow, pipeline, net });
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

    this.remotes = new RemoteDogs(scene, hud, () => this.player.pos);
    this.packBadge = document.createElement('button');
    this.packBadge.className = 'pill pack-badge hidden';
    hud.root.querySelector('.top-right').prepend(this.packBadge);

    hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    this.player.frozen = true;
    if (welcome) { this.joinPack(welcome); this.begin(); } // arrived via a ?room= link
    else this.showLobby();
  }

  // ---------- lobby & packs ----------

  profile() { return loadSave().profile ?? { breed: this.player.breedKey, name: BREEDS[this.player.breedKey].dogName }; }

  showLobby() {
    // Frame the dog on the left of the screen while choosing.
    this.follow.manualHold = 1e9;
    this.follow.yaw = this.player.heading + Math.PI * 0.62;
    this.follow.distance = 3.2;
    const remember = (c) => writeSave({ profile: c });
    const lobby = showLobby({
      hud: this.hud,
      profile: this.profile(),
      townName: this.layout.name,
      onBreed: (k) => { if (k !== this.player.breedKey) this.player.setBreed(k); },
      onSolo: (c) => { remember(c); lobby.close(); this.begin(); },
      onHost: async (c) => {
        remember(c);
        lobby.setBusy(true);
        try {
          const net = this.net ?? new NetClient();
          const w = await net.enter('create', { seed: this.layout.seed, name: c.name, breed: c.breed, discovered: this.state.discovered });
          this.net = net;
          lobby.close();
          this.joinPack(w);
          this.hud.showCard(`
            <h1>Your pack code: ${w.code}</h1>
            <p>On another phone or computer on the same Wi-Fi, open<br><b>${location.host}</b><br>then type <b>${w.code}</b> and press <b>Join a pack</b>.</p>`,
            [['Let\u2019s go! 🐾', () => { this.hud.hideCard(); this.begin(); }]]);
        } catch (e) { lobby.setBusy(false); lobby.setError(e.message); }
      },
      onJoin: async (c, code) => {
        remember(c);
        lobby.setBusy(true);
        try {
          const net = this.net ?? new NetClient();
          const w = await net.enter('join', { code, name: c.name, breed: c.breed });
          if (w.seed !== this.layout.seed) {
            // Their town is different: reload into it (we'll rejoin straight away).
            writeSave({ chapter: 'town', town: { seed: w.seed, discovered: w.shared.discovered } });
            location.href = `${location.pathname}?room=${encodeURIComponent(w.code)}`;
            return;
          }
          this.net = net;
          lobby.close();
          this.joinPack(w);
          this.begin();
        } catch (e) { lobby.setBusy(false); lobby.setError(e.message); }
      },
      onNewTown: () => { writeSave({ chapter: 'town', town: { seed: randomSeed(), discovered: [] } }); location.reload(); },
      onGarden: () => { writeSave({ chapter: 'yard' }); location.href = location.pathname; },
    });
    this.lobby = lobby;
  }

  begin() {
    this.follow.manualHold = 0;
    this.follow.distance = 7;
    this.follow.yaw = this.player.heading + Math.PI;
    this.player.frozen = false;
    this.lobby = null;
  }

  /** Wire up a pack from the server's welcome message. */
  joinPack(w) {
    const net = this.net;
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(w.code)}`);
    // Shared adventure: the pack's progress is everyone's progress.
    for (const id of w.shared.discovered) if (!this.state.discovered.includes(id)) this.state.discovered.push(id);
    this.hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    w.players.forEach((p) => this.remotes.add(p));
    // Spread arrivals out a little so we don't all stand in one spot.
    this.player.pos.x += (Math.random() - 0.5) * 2.5;
    this.player.pos.z += (Math.random() - 0.5) * 2.5;

    net.on('join', (m) => {
      this.remotes.add(m.p);
      this.hud.showToastRaw(BREEDS[m.p.breed]?.emoji ?? '🐕', 'A new dog joined the pack!', '');
      this.hud.toast.querySelector('.t-blurb').textContent = `Say hello to ${m.p.name}!`;
      this.updateBadge();
    });
    net.on('leave', (m) => { this.remotes.remove(m.id); this.updateBadge(); });
    net.on('ss', (m) => this.remotes.onStates(m.p, net.id));
    net.on('act', (m) => this.remotes.onAct(m.id, m.a));
    net.on('ev', (m) => { this.pending?.delete(m.ev.id); this.applyEvent(m.ev, m.by === net.id ? null : m.name); });
    net.on('close', () => {
      this.remotes.clear();
      this.net = null;
      this.updateBadge();
      this.hud.showToastRaw('📡', 'Lost the pack!', 'The connection dropped — you can keep playing on your own.');
    });
    this.updateBadge();
    this.packBadge.onclick = () => {
      const code = this.net?.code ?? '';
      const names = [...this.remotes.dogs.values()].map((r) => `${BREEDS[r.breed]?.emoji ?? '🐕'} ${r.name}`);
      this.hud.showCard(`<h1>Pack ${code}</h1><p>Friends join at <b>${location.host}</b> with code <b>${code}</b></p><p class="pack-list"></p>`, [['OK', () => this.hud.hideCard()]]);
      this.hud.card.querySelector('.pack-list').textContent = ['You', ...names].join(' · ');
    };
  }

  updateBadge() {
    if (!this.net) { this.packBadge.classList.add('hidden'); return; }
    this.packBadge.classList.remove('hidden');
    this.packBadge.textContent = `🐾 ${this.net.code} · ${this.remotes.dogs.size + 1} dogs`;
  }

  // ---------- state & events (multiplayer-friendly) ----------

  /** Local player did something that changes the shared adventure. */
  dispatch(ev) {
    if (this.net) {
      if (this.pending?.has(ev.id)) return;
      (this.pending ??= new Set()).add(ev.id);
      this.net.event(ev); // the server echoes it to everyone (including us) → applyEvent
    } else this.applyEvent(ev, null);
  }

  /** @param byName  another dog's name if they did it, null if it was me */
  applyEvent(ev, byName) {
    if (ev.type === 'discover' && !this.state.discovered.includes(ev.id)) {
      this.state.discovered.push(ev.id);
      writeSave({ chapter: 'town', town: { ...this.state } });
      this.onDiscovered(ev.id, byName);
    }
  }

  placeList() {
    return this.places.map((p) => ({ ...p, emoji: PLACE_EMOJI[p.type], blurb: BLURBS[p.type], found: this.state.discovered.includes(p.id) }));
  }

  // ---------- flow ----------

  isTouch() { return document.body.classList.contains('touch-mode'); }

  refreshObjective() {
    const n = this.state.discovered.length, total = this.places.length;
    const hint = this.isTouch() ? 'Hold <b>👃 Sniff</b> to smell the way' : 'Hold <b>Space</b> to smell the way';
    if (n < total) this.hud.setObjective(`Explore ${this.layout.name}! Places found <b>${n}/${total}</b>`, hint);
    else this.hud.setObjective(`You know every corner of ${this.layout.name}! 🎉`, 'New friends are coming soon…');
  }

  onDiscovered(id, byName) {
    const p = this.places.find((q) => q.id === id);
    if (!p) return;
    sfx.found();
    this.hud.showToastRaw(PLACE_EMOJI[p.type], `${byName ? '<span class="who"></span> found' : 'Discovered:'} <b>${p.name}</b>!`, BLURBS[p.type]);
    if (byName) this.hud.toast.querySelector('.who').textContent = byName;
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

    if (this.net) {
      const flags = (input.sniff && canAct ? 1 : 0) | (P.digTimer > 0 ? 2 : 0);
      this.net.sendState(dt, pos, P.heading, P.speed, flags);
    }
    this.remotes.update(dt);

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
      this.net?.act('dig');
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
      sfx.bark(P.dog.breed.bark);
      this.net?.act('bark');
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
