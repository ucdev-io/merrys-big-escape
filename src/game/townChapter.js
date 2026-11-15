import * as THREE from 'three';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { TOWN, PLACE_EMOJI, randomSeed } from '../world/town/generator.js';
import { BREEDS } from '../entities/breeds.js';
import { RemoteDogs } from '../net/remoteDogs.js';
import { showLobby } from '../ui/lobby.js';
import { packPath } from '../net/links.js';
import { waterAt } from '../world/water.js';
import { DogActions } from '../systems/dogActions.js';
import { GoldenBones } from './town/bones.js';
import { Pack } from './town/pack.js';
import { progress } from './progress.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const BLURBS = {
  park: 'Swings, slides and a very suspicious lawnmower.',
  pond: 'It smells VERY ducky round here.',
  bakery: 'Sausages and warm bread. This must be heaven.',
  alley: 'Bins. Glorious, stinky bins.',
};

/**
 * Chapter 2: the procedurally generated neighbourhood, shared with friends on the same Wi-Fi.
 * Shared-adventure changes go through dispatch(event) so the pack server can relay them.
 */
export class TownChapter {
  constructor({ scene, world, player, hud, input, follow, pipeline, net = null, welcome = null, prefillCode = null }) {
    Object.assign(this, { scene, world, player, hud, input, follow, pipeline, prefillCode });
    this.layout = world.layout;
    const save = loadSave();
    const same = save.town?.seed === this.layout.seed;
    this.state = { seed: this.layout.seed, discovered: same ? save.town.discovered ?? [] : [], bones: same ? save.town.bones ?? [] : [] };
    this.places = this.layout.places.filter((p) => p.type !== 'home');
    this.time = 0;

    this.compass = document.createElement('div');
    this.compass.className = 'compass hidden';
    this.compass.innerHTML = '<div class="arrow">➤</div><div class="label"></div>';
    hud.root.appendChild(this.compass);

    this.actions = new DogActions({
      scene, hud, input, player, pipeline, world,
      dogName: () => this.profile().name, breedName: () => BREEDS[this.player.breedKey].breed,
      onAct: (a, extra) => this.pack.act(a, extra),
    });
    this.bones = new GoldenBones(scene, world.bones ?? [], this.state.bones);

    // Other players' dogs (paddling, splashing and shaking too).
    this.remotes = new RemoteDogs(scene, hud, () => this.player.pos);
    const fx = this.actions.waterFx;
    const surfaceAt = (p) => waterAt(world.water, p.x, p.z)?.surface ?? 0.075;
    this.remotes.onSplash = (p, power) => fx.splash(p, surfaceAt(p), power, false);
    this.remotes.onRipple = (p) => fx.ring(p, surfaceAt(p), 0.6);
    this.remotes.onShake = (dog, p) => fx.shake(dog, p, false);

    this.pack = new Pack({
      hud, remotes: this.remotes,
      me: () => ({ name: this.profile().name, breed: this.player.breedKey, level: progress.level, look: progress.look }),
      seed: () => this.layout.seed,
      progress: () => ({ discovered: this.state.discovered, bones: this.state.bones }),
      onWelcome: (w, { rejoin }) => this.onWelcome(w, rejoin),
      onEvent: (ev, byName) => this.applyEvent(ev, byName),
      onMischief: (m) => (m.a === 'scatter' ? this.actions.remoteScatter(m.id, m.x) : this.actions.mischief.remote(m)),
    });

    progress.on((e) => { if (e.look || e.levelUp) this.pack.sendLook(); }); // friends see your outfit & level
    this.goHome(0);
    hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    this.player.frozen = true;
    if (welcome) { this.pack.attach(net, welcome); this.begin(); } // arrived via a pack link
    else this.showLobby();
  }

  // ---------- lobby & pack ----------

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
      onSolo: (c) => { remember(c); lobby.close(); this.begin(); this.pack.open(); },
      onJoin: async (c, code) => {
        remember(c);
        lobby.setBusy(true);
        try {
          const { net, welcome } = await this.pack.join(code);
          if (welcome.seed !== this.layout.seed) {
            // Their town is different: reload into it (we'll rejoin straight away).
            writeSave({ chapter: 'town', town: { seed: welcome.seed, discovered: welcome.shared.discovered } });
            location.href = packPath(welcome.code);
            return;
          }
          lobby.close();
          this.pack.attach(net, welcome);
          this.begin();
        } catch (e) { lobby.setBusy(false); lobby.setError(e.message); }
      },
      onNewTown: () => { writeSave({ chapter: 'town', town: { seed: randomSeed(), discovered: [] } }); location.reload(); },
      onGarden: () => { writeSave({ chapter: 'yard' }); location.href = '/'; },
    });
    if (this.prefillCode) lobby.prefill(this.prefillCode);
  }

  begin() {
    this.follow.manualHold = 0;
    this.follow.distance = 7;
    this.follow.yaw = this.player.heading + Math.PI;
    this.player.frozen = false;
    this.pack.watchOthers();
  }

  /** Joined a pack: the pack's progress becomes ours (shared adventure). */
  onWelcome(w, rejoin) {
    for (const id of w.shared.discovered) if (!this.state.discovered.includes(id)) this.state.discovered.push(id);
    for (const id of w.shared.bones ?? []) if (!this.state.bones.includes(id)) { this.state.bones.push(id); this.bones.hide(id); }
    this.hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    if (!rejoin) this.goHome(w.slot ?? 0);
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

  // ---------- shared adventure (multiplayer-friendly) ----------

  /** Local player did something that changes the shared adventure. */
  dispatch(ev) {
    if (!this.pack.dispatch(ev)) this.applyEvent(ev, null); // in a pack, the server echoes it back
  }

  /** @param byName  another dog's name if they did it, null if it was me */
  applyEvent(ev, byName) {
    if (ev.type === 'bone' && !this.state.bones.includes(ev.id)) {
      this.state.bones.push(ev.id);
      writeSave({ chapter: 'town', town: { ...this.state } });
      this.onBone(ev.id, byName);
    } else if (ev.type === 'discover' && !this.state.discovered.includes(ev.id)) {
      this.state.discovered.push(ev.id);
      writeSave({ chapter: 'town', town: { ...this.state } });
      this.onDiscovered(ev.id, byName);
    }
  }

  placeList() {
    return this.places.map((p) => ({ ...p, emoji: PLACE_EMOJI[p.type], blurb: BLURBS[p.type], found: this.state.discovered.includes(p.id) }));
  }

  refreshObjective() {
    const n = this.state.discovered.length, total = this.places.length;
    const nb = this.state.bones.length, tb = this.bones?.count ?? 0;
    const bones = tb ? `✨🦴 Golden bones found: <b>${nb}/${tb}</b>` : '';
    if (n < total) this.hud.setObjective(`Explore ${this.layout.name}! Places found <b>${n}/${total}</b>`, bones, { icon: '🗺️', short: `${n}/${total}` });
    else this.hud.setObjective(`You know every corner of ${this.layout.name}! 🎉`, nb < tb ? `Can you reach all the golden bones? ${nb}/${tb} 🦘` : 'New friends are coming soon…', { icon: '🦴', short: `${nb}/${tb}` });
  }

  onBone(id, byName) {
    this.bones.hide(id);
    if (byName) progress.award(5, 'Team bonus!');
    else { progress.stat('bones'); progress.award(25, 'Golden bone!'); }
    sfx.found();
    buzz([25, 40, 25]);
    const n = this.state.bones.length, t = this.bones.count;
    this.hud.showToastRaw('✨🦴', `${byName ? '<span class="who"></span> found' : 'You found'} a golden bone!`, `${n} of ${t} golden bones${n === t ? ' — every single one! 🎉' : ''}`);
    if (byName) this.hud.toast.querySelector('.who').textContent = byName;
    this.refreshObjective();
  }

  onDiscovered(id, byName) {
    const p = this.places.find((q) => q.id === id);
    if (!p) return;
    if (byName) progress.award(5, 'Team bonus!');
    else { progress.stat('places'); progress.award(30, 'New place!'); }
    sfx.found();
    buzz([25, 40, 25]);
    this.hud.showToastRaw(PLACE_EMOJI[p.type], `${byName ? '<span class="who"></span> found' : 'Discovered:'} <b>${p.name}</b>!`, BLURBS[p.type]);
    if (byName) this.hud.toast.querySelector('.who').textContent = byName;
    this.hud.setPlaces?.(this.placeList());
    this.player.happy = 1;
    setTimeout(() => (this.player.happy = 0.5), 2500);
    this.actions.sparkle(this.player.pos.clone().add(V(0, 0.8, 0)), 24);
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
    const P = this.player, pos = P.pos;
    const canAct = !P.frozen;

    this.pack.sendState(dt, P, canAct && this.input.sniff);
    this.remotes.update(dt);
    P.platforms = this.remotes.platforms(); // other dogs' backs: the co-op boost!

    // Golden bones.
    const b = this.bones.update(dt, this.time, pos, this.actions.glow);
    if (b.reached) this.dispatch({ type: 'bone', id: b.reached });
    if (canAct) this.hud.setPrompt(b.hint);

    // Discover places by walking into them.
    for (const p of this.places) {
      if (!this.state.discovered.includes(p.id) && Math.abs(pos.x - p.x) < TOWN.BLOCK / 2 && Math.abs(pos.z - p.z) < TOWN.BLOCK / 2) {
        this.dispatch({ type: 'discover', id: p.id });
      }
    }

    // Sniff (trail to the nearest undiscovered place), dig, bark, splash, mischief.
    const next = this.nextPlace();
    this.actions.update(dt, { canAct, goal: next ? V(next.place.x, 0, next.place.z) : null });

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
  }
}
