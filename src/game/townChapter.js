import * as THREE from 'three';
import { Particles } from '../fx/particles.js';
import { ScentTrail } from '../systems/scentTrail.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { TOWN, PLACE_EMOJI, randomSeed } from '../world/town/generator.js';
import { BREEDS } from '../entities/breeds.js';
import { RemoteDogs } from '../net/remoteDogs.js';
import { NetClient } from '../net/client.js';
import { showLobby } from '../ui/lobby.js';
import { paint } from '../render/watercolorMaterial.js';
import { Mischief } from '../systems/mischief.js';
import { WaterFx } from '../systems/waterFx.js';
import { waterAt } from '../world/water.js';
import { packLink, packPath, fillShareBox } from '../net/links.js';
import { watchPacks, renderPackRows } from '../net/packs.js';
import { townName } from '../world/town/generator.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
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
  constructor({ scene, world, player, hud, input, follow, pipeline, net = null, welcome = null, prefillCode = null }) {
    this.prefillCode = prefillCode;
    Object.assign(this, { scene, world, player, hud, input, follow, pipeline, net });
    this.layout = world.layout;
    const save = loadSave();
    const same = save.town?.seed === this.layout.seed;
    this.state = { seed: this.layout.seed, discovered: same ? save.town.discovered ?? [] : [], bones: same ? save.town.bones ?? [] : [] };
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
    this.waterFx = new WaterFx(scene, hud);
    const surfaceAt = (p) => waterAt(world.water, p.x, p.z)?.surface ?? 0.075;
    this.remotes.onSplash = (p, power) => this.waterFx.splash(p, surfaceAt(p), power, false);
    this.remotes.onRipple = (p) => this.waterFx.ring(p, surfaceAt(p), 0.6);
    this.remotes.onShake = (dog, p) => this.waterFx.shake(dog, p, false);
    this.buildBones();
    this.mischief = new Mischief({
      scene, hud, gardens: world.gardens, beds: world.beds, bins: world.bins, dirt: this.dirt, glow: this.glow,
      dogName: () => this.profile().name, breedName: () => BREEDS[this.player.breedKey].breed,
      onAct: (m) => this.net?.act(m.a, m),
    });
    this.mischief.onChange = (n) => { hud.setMischief(n); this.hud.float('😈 +1', this.merryAnchor(), 'dig'); };
    this.goHome(0);
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
      onSolo: (c) => { remember(c); lobby.close(); this.begin(); this.openNeighbourhood(c); },
      onJoin: async (c, code) => {
        remember(c);
        lobby.setBusy(true);
        try {
          const net = this.net ?? new NetClient();
          const w = await net.enter('join', { code, name: c.name, breed: c.breed });
          if (w.seed !== this.layout.seed) {
            // Their town is different: reload into it (we'll rejoin straight away).
            writeSave({ chapter: 'town', town: { seed: w.seed, discovered: w.shared.discovered } });
            location.href = packPath(w.code);
            return;
          }
          this.net = net;
          lobby.close();
          this.joinPack(w);
          this.begin();
        } catch (e) { lobby.setBusy(false); lobby.setError(e.message); }
      },
      onNewTown: () => { writeSave({ chapter: 'town', town: { seed: randomSeed(), discovered: [] } }); location.reload(); },
      onGarden: () => { writeSave({ chapter: 'yard' }); location.href = '/'; },
    });
    if (this.prefillCode) lobby.prefill(this.prefillCode);
    this.lobby = lobby;
  }

  /**
   * Everyone's neighbourhood is open to friends on the same Wi-Fi automatically — they see it in
   * their "Friends playing now" list. If there's no game server, you simply play on your own.
   */
  async openNeighbourhood(c) {
    if (this.net) return;
    try {
      const net = new NetClient();
      const w = await net.enter('create', { seed: this.layout.seed, name: c.name, breed: c.breed, discovered: this.state.discovered, bones: this.state.bones });
      this.net = net;
      this.joinPack(w, { rejoin: true }); // you're already at your gate; don't teleport
      this.hud.showToastRaw('🏘️', 'Your neighbourhood is open!', 'Friends on this Wi-Fi can join you from their menu.');
    } catch { /* no server: solo play */ }
  }

  /** While playing, mention when a friend starts playing somewhere else. */
  watchOtherPacks() {
    if (this.stopWatch) return;
    let seen = null;
    this.stopWatch = watchPacks((list) => {
      if (!list) return;
      const others = list.filter((p) => p.code !== this.net?.code);
      if (seen) {
        for (const p of others) {
          if (seen.has(p.code)) continue;
          this.hud.showToastRaw('🐾', '', '');
          this.hud.toast.querySelector('.t-head').textContent = `${p.host} is playing in ${townName(p.seed)}!`;
          this.hud.toast.querySelector('.t-blurb').textContent = 'Tap 👥 at the top to go and join them.';
        }
      }
      seen = new Set(others.map((p) => p.code));
    }, 5000);
  }

  begin() {
    this.follow.manualHold = 0;
    this.follow.distance = 7;
    this.follow.yaw = this.player.heading + Math.PI;
    this.player.frozen = false;
    this.lobby = null;
    this.watchOtherPacks();
  }

  /** Wire up a pack from the server's welcome message. */
  joinPack(w, { rejoin = false } = {}) {
    this.packCode = w.code;
    const net = this.net;
    history.replaceState(null, '', packPath(w.code));
    // Shared adventure: the pack's progress is everyone's progress.
    for (const id of w.shared.discovered) if (!this.state.discovered.includes(id)) this.state.discovered.push(id);
    for (const id of w.shared.bones ?? []) if (!this.state.bones.includes(id)) { this.state.bones.push(id); this.hideBone(id); }
    this.hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    // Our own old connection may linger on the server for a few seconds after a reconnect: ignore it.
    w.players.filter((p) => !this.oldIds?.has(p.id)).forEach((p) => this.remotes.add(p));
    if (!rejoin) this.goHome(w.slot ?? 0);

    net.on('join', (m) => {
      this.remotes.add(m.p);
      this.hud.showToastRaw(BREEDS[m.p.breed]?.emoji ?? '🐕', 'A new dog joined the pack!', '');
      this.hud.toast.querySelector('.t-blurb').textContent = `Say hello to ${m.p.name}!`;
      this.updateBadge();
    });
    net.on('leave', (m) => { this.remotes.remove(m.id); this.updateBadge(); });
    net.on('ss', (m) => this.remotes.onStates(m.p, net.id));
    net.on('act', (m) => (['tip', 'hole', 'trample'].includes(m.a) ? this.mischief.remote(m) : this.remotes.onAct(m.id, m.a)));
    net.on('ev', (m) => { this.pending?.delete(`${m.ev.type}:${m.ev.id}`); this.applyEvent(m.ev, m.by === net.id ? null : m.name); });
    net.on('close', () => this.onNetClosed());
    this.updateBadge();
    this.packBadge.onclick = () => this.showPackCard();
  }

  /** Who's here, other neighbourhoods to hop over to, and (tucked away) a link for new phones. */
  async showPackCard() {
    const code = this.net?.code ?? '';
    const names = [...this.remotes.dogs.values()].map((r) => `${BREEDS[r.breed]?.emoji ?? '🐕'} ${r.name}`);
    this.hud.showCard(`
      <h1>👥 Your pack</h1>
      <p class="pack-list"></p>
      <h3>Other neighbourhoods</h3>
      <div class="list others"><p class="none">No one else is playing right now.</p></div>
      <details class="newphone"><summary>📱 Get the game on another phone or tablet</summary>
        <p>Friends on this Wi-Fi just open the game and tap you in <b>Friends playing now</b>. New phones can scan this:</p>
        <div class="invite"></div></details>`, [['OK', () => this.hud.hideCard()]]);
    const card = this.hud.card;
    card.querySelector('.pack-list').textContent = ['You', ...names].join(' · ') + (code ? `  (pack ${code})` : '');
    const others = card.querySelector('.others');
    const stop = watchPacks((list) => {
      if (card.classList.contains('hidden') || !card.contains(others)) { stop(); return; }
      const n = renderPackRows(others, list, { exclude: code, onJoin: (p) => { location.href = packPath(p.code); } });
      if (!n) others.innerHTML = '<p class="none">No one else is playing right now.</p>';
    });
    card.querySelector('details').addEventListener('toggle', async (e) => {
      if (e.target.open && !e.target.dataset.ready) {
        e.target.dataset.ready = '1';
        await fillShareBox(card.querySelector('.invite'), code ? await packLink(code) : location.origin, { text: 'Come and play Merry\u2019s Big Escape!' });
      }
    });
  }

  // ---------- golden bones ----------

  buildBones() {

    this.bones = (this.world.bones ?? []).map((b) => {
      const g = new THREE.Group();
      const gold = paint(0xf2c14e, { emissive: 0x6a4a10 });
      const add = (geom, pos, rot) => { const m = new THREE.Mesh(geom, gold); m.position.set(...pos); if (rot) m.rotation.set(...rot); g.add(m); };
      add(new THREE.CapsuleGeometry(0.04, 0.2, 4, 10), [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const x of [-1, 1]) for (const z of [-1, 1]) add(new THREE.SphereGeometry(0.05, 12, 8), [x * 0.14, 0, z * 0.04]);
      if (b.friend) {
        // Pink paw-print halo: "you'll need a friend for this one".
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 28), paint(0xf2a0b4, { emissive: 0x5a2030 }));
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
      g.position.set(b.x, b.y, b.z);
      this.scene.add(g);
      return { ...b, mesh: g, got: this.state.bones.includes(b.id) };
    });
    this.bones.forEach((b) => (b.mesh.visible = !b.got));

  }

  hideBone(id) { const b = this.bones?.find((q) => q.id === id); if (b) { b.got = true; b.mesh.visible = false; } }

  updateBones(dt) {
    const P = this.player, pos = P.pos;
    let hint = null;
    for (const b of this.bones) {
      if (b.got) continue;
      b.mesh.rotation.y += dt * 2;
      b.mesh.position.y = b.y + Math.sin(this.time * 2.5 + b.x) * 0.05;
      if (Math.random() < dt * 1.5) this.glow.spawn({ pos: b.mesh.position.clone(), vel: V(rand(-0.2, 0.2), rand(0.3, 0.6), rand(-0.2, 0.2)), life: 0.9, size: 0.03, color: 0xf6d06a });
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      if (d < 0.6 && pos.y >= b.need) { this.hideBone(b.id); this.dispatch({ type: 'bone', id: b.id }); continue; }
      if (d < 1.4 && pos.y < b.need) hint = b.friend ? 'Too high! Stand on a friend\u2019s back 🐾🐾' : 'Too high! Find a way up 🦘';
    }
    if (!P.frozen) this.hud.setPrompt(hint);
  }

  onBone(id, byName) {
    this.hideBone(id);
    sfx.found();
    buzz([25, 40, 25]);
    const n = this.state.bones.length, t = this.bones.length;
    this.hud.showToastRaw('✨🦴', `${byName ? '<span class="who"></span> found' : 'You found'} a golden bone!`, `${n} of ${t} golden bones${n === t ? ' \u2014 every single one! 🎉' : ''}`);
    if (byName) this.hud.toast.querySelector('.who').textContent = byName;
    this.refreshObjective();
  }

  /** Put this dog at its own garden gate, beside the tunnel it dug to get out. */
  goHome(slot) {
    const homes = this.world.homes;
    if (!homes?.length) return;
    const h = homes[slot % homes.length];
    for (const g of this.world.gardens ?? []) g.own = false;
    if (h.garden) h.garden.own = true; // your own family is less cross
    this.player.pos.copy(h.pos);
    this.player.heading = h.face;
    this.player.object.rotation.y = h.face;
    this.follow.snap(this.player.pos);
    this.follow.yaw = h.face + Math.PI;
    if (slot > 0) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), this.holeMat ??= new THREE.MeshBasicMaterial({ color: 0x4a3426 }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(h.pos.x - Math.sin(h.face) * 0.6, 0.06, h.pos.z - Math.cos(h.face) * 0.6);
      this.scene.add(hole);
    }
  }

  /** Phone slept or Wi-Fi blipped: keep playing, and quietly get back into the pack. */
  onNetClosed() {
    if (this.reconnecting || !this.packCode) return;
    (this.oldIds ??= new Set()).add(this.net?.id);
    this.remotes.clear();
    this.net = null;
    this.updateBadge();
    this.reconnecting = true;
    this.hud.showToastRaw('📡', 'Reconnecting to the pack\u2026', 'Hang on a sec!');
    this.tryRejoin(0);
  }

  async tryRejoin(attempt) {
    if (document.hidden) { // wait until they're looking at the game again
      document.addEventListener('visibilitychange', () => this.tryRejoin(attempt), { once: true });
      return;
    }
    const code = this.packCode, me = { name: this.profile().name, breed: this.player.breedKey };
    try {
      const net = new NetClient();
      let w;
      try { w = await net.enter('join', { code, ...me }); }
      catch (e) {
        if (!/No pack/.test(e.message)) throw e;
        // Everyone's phone slept and the pack closed: open it again with the same code and progress.
        w = await net.enter('create', { code, seed: this.layout.seed, ...me, discovered: this.state.discovered, bones: this.state.bones });
      }
      this.net = net;
      this.reconnecting = false;
      this.joinPack(w, { rejoin: true });
      this.hud.showToastRaw('🐾', 'Back with the pack!', '');
    } catch {
      if (attempt >= 5) {
        this.reconnecting = false;
        this.hud.showToastRaw('📡', 'Lost the pack!', 'Couldn\u2019t reconnect \u2014 you can keep playing on your own.');
        return;
      }
      setTimeout(() => this.tryRejoin(attempt + 1), 1000 * 2 ** attempt);
    }
  }

  updateBadge() {
    if (!this.net) { this.packBadge.classList.add('hidden'); return; }
    this.packBadge.classList.remove('hidden');
    const n = this.remotes.dogs.size + 1;
    this.packBadge.textContent = n === 1 ? '👥 Just you' : `👥 ${n} dogs`;
    this.packBadge.title = `Pack ${this.net.code}`;
  }

  // ---------- state & events (multiplayer-friendly) ----------

  /** Local player did something that changes the shared adventure. */
  dispatch(ev) {
    if (this.net) {
      const key = `${ev.type}:${ev.id}`;
      if (this.pending?.has(key)) return;
      (this.pending ??= new Set()).add(key);
      this.net.event(ev); // the server echoes it to everyone (including us) → applyEvent
    } else this.applyEvent(ev, null);
  }

  /** @param byName  another dog's name if they did it, null if it was me */
  applyEvent(ev, byName) {
    if (ev.type === 'bone' && !this.state.bones.includes(ev.id)) {
      this.state.bones.push(ev.id);
      writeSave({ chapter: 'town', town: { ...this.state } });
      this.onBone(ev.id, byName);
      return;
    }
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
    const nb = this.state.bones.length, tb = this.world.bones?.length ?? 0;
    const bones = tb ? `✨🦴 Golden bones found: <b>${nb}/${tb}</b>` : '';
    if (n < total) this.hud.setObjective(`Explore ${this.layout.name}! Places found <b>${n}/${total}</b>`, bones, { icon: '🗺️', short: `${n}/${total}` });
    else this.hud.setObjective(`You know every corner of ${this.layout.name}! 🎉`, nb < tb ? `Can you reach all the golden bones? ${nb}/${tb} 🦘` : 'New friends are coming soon\u2026', { icon: '🦴', short: `${nb}/${tb}` });
  }

  onDiscovered(id, byName) {
    const p = this.places.find((q) => q.id === id);
    if (!p) return;
    sfx.found();
    buzz([25, 40, 25]);
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
          <p>${escapeHtml(this.profile().name)} has sniffed every corner of ${this.layout.name}.</p>
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
      const flags = (input.sniff && canAct ? 1 : 0) | (P.digTimer > 0 ? 2 : 0) | (P.grounded ? 0 : 4) | (P.inWater ? 8 : 0) | (P.swim > 0.5 ? 16 : 0);
      this.net.sendState(dt, pos, P.heading, P.speed, flags);
    }
    this.remotes.update(dt);
    // Other dogs' backs are something to stand on — the co-op boost!
    P.platforms = this.remotes.platforms();
    this.updateBones(dt);
    this.waterFx.update(dt, P.dog, { pos: P.pos, heading: P.heading, speed: P.speed, inWater: P.inWater, swim: P.swim, surface: P.waterSurface, enteredSpeed: P.enteredSpeed, leftWater: P.leftWater });
    if (canAct) this.mischief.update(dt, P);

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
      this.mischief.dig(nose.clone().setY(0));
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
      this.mischief.barkAt(pos);
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
