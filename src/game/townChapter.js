import * as THREE from 'three';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { TOWN, PLACE_EMOJI, randomSeed } from '../world/town/generator.js';
import { BREEDS } from '../entities/breeds.js';
import { RemoteDogs } from '../net/remoteDogs.js';
import { showLobby } from '../ui/lobby.js';
import { packPath, HOME } from '../net/links.js';
import { waterAt } from '../world/water.js';
import { DogActions } from '../systems/dogActions.js';
import { GoldenBones } from './town/bones.js';
import { Pack } from './town/pack.js';
import { progress } from './progress.js';
import { Smells } from './town/smells.js';
import { Traffic } from '../systems/traffic.js';
import { Friends } from './town/friends.js';
import { NutAndMeg } from './town/squirrels.js';
import { Pepper } from './town/pepper.js';
import { TownLife } from './town/life.js';
import { TownGames } from './town/games.js';
import { Heists } from './town/heists.js';
import { Seasons } from './seasons/seasons.js';
import { showRecords } from '../ui/records.js';
import { music } from '../core/music.js';
import { AREA_BLURBS, inRect } from '../world/areas/areas.js';
import { Woods } from './town/woods/index.js';
import { Farm } from './town/farm/index.js';
import { Mud } from './town/mud.js';
import { Beach } from './town/beach/index.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const BLURBS = {
  park: 'Swings, slides and a very suspicious lawnmower.',
  pond: 'It smells VERY ducky round here.',
  bakery: 'Sausages and warm bread. This must be heaven.',
  alley: 'Bins. Glorious, stinky bins.',
  ...AREA_BLURBS, // (the Woods…)
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
    this.state = { seed: this.layout.seed, discovered: same ? save.town.discovered ?? [] : [], bones: same ? save.town.bones ?? [] : [], den: same ? save.town.den ?? 0 : 0 };
    this.places = this.layout.places.filter((p) => p.type !== 'home');
    this.time = 0;

    this.compass = document.createElement('div');
    this.compass.className = 'compass hidden';
    this.compass.innerHTML = '<div class="arrow">➤</div><div class="label"></div>';
    hud.topLeft.appendChild(this.compass); // (with the goal: see the HUD's top left)

    this.actions = new DogActions({
      scene, hud, input, player, pipeline, world,
      dogName: () => this.profile().name, breedName: () => BREEDS[this.player.breedKey].breed,
      onAct: (a, extra) => this.pack.act(a, extra),
    });
    this.bones = new GoldenBones(scene, world.bones ?? [], this.state.bones);
    globalThis.__mark?.('setup: dog actions, bones');
    // Things to sniff out all over town, and cars pottering round the streets.
    this.smells = new Smells(world, this.layout.seed);
    globalThis.__mark?.('setup: smells');
    this.traffic = new Traffic(scene, { seed: this.layout.seed, hud, avoid: world.spawn });
    globalThis.__mark?.('setup: traffic');
    // Friends who need a hand: Gus in the park, Duchess at the pond, and the Lost & Found board.
    this.friends = new Friends({
      scene, world, hud, actions: this.actions, player, seed: this.layout.seed, dogName: () => this.profile().name,
      others: () => [...this.remotes.dogs.values()].filter((r) => r.dog.root.visible).map((r) => r.dog.root.position), // (friends' dogs, for team jobs)
      postman: () => this.life.postman.p.root.position,
      busy: () => !this.hud.card.classList.contains('hidden') || !!this.games?.active,
    });
    this.friends.onChange = () => this.refreshObjective();
    this.actions.onMischief = () => this.friends.onMischief();
    // More friends in the park: Nut & Meg, squirrel twins who love hide-and-seek, and Pepper the
    // hedgehog, who'd love a walk to the flowerbeds if it weren't for the robot lawnmower.
    const friendly = { scene, world, hud, player, actions: this.actions, friends: this.friends, seed: this.layout.seed, dogName: () => this.profile().name };
    this.friends.add(new NutAndMeg(friendly));
    this.friends.add(new Pepper(friendly));
    globalThis.__mark?.('setup: friends');
    this.actions.onCarry = (kind) => { this.pack.sendCarry(kind); this.refreshObjective(); };
    // People out and about (the postman, dog walkers), and ice creams from the van.
    this.life = new TownLife({ scene, world, hud, player, seed: this.layout.seed, dogName: () => this.profile().name });
    globalThis.__mark?.('setup: town life');
    this.traffic.onServe = (at) => this.actions.snacks.drop('icecream', at.x, at.z);
    this.pond = world.water?.find((w) => w.kind === 'pond');

    // Other players' dogs (paddling, splashing and shaking too).
    this.remotes = new RemoteDogs(scene, hud, () => this.player.pos);
    const fx = this.actions.waterFx;
    const surfaceAt = (p) => waterAt(world.water, p.x, p.z)?.surface ?? 0.075;
    this.remotes.onSplash = (p, power) => fx.splash(p, surfaceAt(p), power, false);
    this.remotes.onRipple = (p) => fx.ring(p, surfaceAt(p), 0.6);
    this.remotes.onShake = (dog, p) => fx.shake(dog, p, false);

    this.pack = new Pack({
      hud, remotes: this.remotes,
      me: () => ({ name: this.profile().name, breed: this.player.breedKey, level: progress.level, look: progress.look, profile: progress.id }),
      seed: () => this.layout.seed,
      progress: () => ({ discovered: this.state.discovered, bones: this.state.bones, den: this.state.den }),
      onWelcome: (w, { rejoin }) => this.onWelcome(w, rejoin),
      onEvent: (ev, byName) => this.applyEvent(ev, byName),
      onMischief: (m) => (m.a === 'scatter' ? this.actions.remoteScatter(m.id, m.x) : this.actions.mischief.remote(m)),
    });
    globalThis.__mark?.('setup: friends\u2019 dogs, pack');

    // Games and challenges (from the 👥 card), and the 🏆 family records.
    const records = (focus = null) => showRecords(hud, { town: this.layout.seed, townName: this.layout.name, profile: progress.id, focus });
    this.games = new TownGames({
      scene, world, hud, player, pack: this.pack, remotes: this.remotes, layout: this.layout,
      anchor: () => this.actions.anchor(), glow: () => this.actions.glow, pigeons: () => this.actions.pigeons,
      teleport: (x, z, face) => this.teleport(x, z, face), showRecords: records,
    });
    this.pack.onGame = (m) => this.games.handle(m);
    this.pack.onStartGame = (kind) => this.games.start(kind);
    this.pack.onRecords = records;
    this.actions.onScatter = (flock, n) => this.games.onScatter(n);
    globalThis.__mark?.('setup: games');
    // Heists: cheeky food raids on the bakery street, on your own or as a team.
    this.heists = new Heists({ scene, world, hud, player, actions: this.actions, pack: this.pack, remotes: this.remotes, dogName: () => this.profile().name });
    this.pack.onHeist = (m) => this.heists.handle(m);
    globalThis.__mark?.('setup: heists');
    // 🍂❄️🌸☀️ Seasons and weather (the pack's, or the calendar's): snow, falling leaves, showers, and things to do in each.
    this.seasons = new Seasons({
      scene, world, player, hud, input, actions: this.actions, pipeline, follow, chapter: 'town', seed: this.layout.seed, welcome,
      pack: this.pack, remotes: this.remotes, traffic: this.traffic, heists: this.heists, friends: this.friends,
    });
    this.pack.onSeason = (m) => this.seasons.handle(m);
    hud.onSeasons = () => this.seasons.showCard();
    globalThis.__mark?.('setup: seasons');
    // 🌲 The Woods, out past the edge of town: the owl, Brock the badger, big sticks for the den, mud.
    const woods = world.areas?.find((a) => a.kind === 'woods');
    if (woods) {
      this.woods = new Woods({
        scene, world, area: woods, hud, player, input, actions: this.actions, friends: this.friends, pack: this.pack, remotes: this.remotes,
        dogName: () => this.profile().name, den: this.state.den, onDen: (n) => { this.state.den = n; writeSave({ chapter: 'town', town: { ...this.state } }); },
        look: this.seasons.look, // (the fog under the trees)
      });
      this.woods.camera = follow.camera; // (to skip drawing the wood when it's lost in the fog)
      this.pack.onWoods = (m) => this.woods.handle(m);
    }
    globalThis.__mark?.('setup: woods');
    // 🏖️ The Beach, out past another edge of town: waves, sandcastles, rock pools, seagulls and Sandy the lifeguard.
    const beach = world.areas?.find((a) => a.kind === 'beach');
    if (beach) {
      this.beach = new Beach({
        scene, world, area: beach, hud, player, input, actions: this.actions, friends: this.friends, pack: this.pack, remotes: this.remotes,
        dogName: () => this.profile().name, look: this.seasons.look, camera: follow.camera,
      });
      this.pack.onBeach = (m) => this.beach.handle(m);
    }
    globalThis.__mark?.('setup: beach');
    // 🚜 The Farm, out past another edge: Farmer Mabel and her jobs, the sheep (one flock for the whole pack:
    // round them into the pen together; the town keeps count), hens, pigs in the mud, hay to climb.
    const farm = world.areas?.find((a) => a.kind === 'farm');
    if (farm) {
      this.state.farm = same ? save.town.farm ?? 0 : 0;
      this.farm = new Farm({
        scene, world, area: farm, hud, player, input, actions: this.actions, friends: this.friends, pack: this.pack, remotes: this.remotes,
        dogName: () => this.profile().name, pens: this.state.farm, onPens: (n) => { this.state.farm = n; writeSave({ chapter: 'town', town: { ...this.state } }); },
      });
      this.farm.camera = follow.camera; // (to skip drawing the farm when it's lost in the fog)
      this.pack.onFarm = (m) => this.farm.handle(m);
    }
    globalThis.__mark?.('setup: farm');
    // 🟤 Mud, from any area's muddy patches (the wood's, the farm's…): one coat of it per dog, friends see it,
    // a splash in water washes it off. (Prints sit on the ground you see.)
    const mudZones = (world.areas ?? []).flatMap((a) => a.mud ?? []);
    if (mudZones.length) {
      this.mud = new Mud({ scene, hud, player, actions: this.actions, zones: mudZones, surfaceY: (x, z) => this.seasons.surfaceY(x, z) });
      const onMud = this.remotes.onMud;
      this.remotes.onMud = (dog, level) => { onMud?.(dog, level); this.mud.setRemote(dog, level); };
    }
    progress.on((e) => { if (e.look || e.levelUp) this.pack.sendLook(); }); // friends see your outfit & level
    this.goHome(0);
    hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    this.player.frozen = true;
    if (welcome) { this.pack.attach(net, welcome); this.begin(); } // arrived via a pack link
    else this.showLobby();
    globalThis.__mark?.('setup: mud, lobby');
  }

  // ---------- lobby & pack ----------

  profile() { return loadSave().profile ?? { breed: this.player.breedKey, name: BREEDS[this.player.breedKey].dogName }; }

  showLobby() {
    // Frame the dog on the left of the screen while choosing.
    this.follow.manualHold = 1e9;
    this.follow.yaw = this.player.heading + Math.PI * 0.62;
    this.follow.distance = 3.2;
    // Become the chosen dog: a saved one (stars, outfit and all), or a brand-new one.
    const remember = async (c) => {
      await progress.useDog(c);
      writeSave({ profile: { breed: c.breed, name: c.name } });
      this.player.setLook(progress.look);
    };
    const lobby = showLobby({
      hud: this.hud,
      profile: this.profile(),
      current: progress.id,
      seed: this.layout.seed,
      townName: this.layout.name,
      onBreed: (k) => { if (k !== this.player.breedKey) this.player.setBreed(k); },
      onLook: (look) => this.player.setLook(look),
      onSolo: async (c) => { lobby.setBusy(true); await remember(c); lobby.close(); this.begin(); this.pack.open(); },
      onJoin: async (c, code) => {
        lobby.setBusy(true);
        await remember(c);
        try {
          const { net, welcome } = await this.pack.join(code);
          if (welcome.seed !== this.layout.seed) {
            // Their town is different: reload into it (we'll rejoin straight away).
            writeSave({ chapter: 'town', town: { seed: welcome.seed, discovered: welcome.shared.discovered } });
            net.close();
            setTimeout(() => (location.href = packPath(welcome.code)), 120);
            return;
          }
          lobby.close();
          this.pack.attach(net, welcome);
          this.begin();
        } catch (e) { lobby.setBusy(false); lobby.setError(e.message); }
      },
      onNewTown: () => { writeSave({ chapter: 'town', town: { seed: randomSeed(), discovered: [] } }); location.reload(); },
      onGarden: () => { writeSave({ chapter: 'yard' }); location.href = HOME; },
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
    if (w.season) this.seasons?.handle(w.season); // (the pack's season and weather)
    for (const id of w.shared.discovered) if (!this.state.discovered.includes(id)) this.state.discovered.push(id);
    for (const id of w.shared.bones ?? []) if (!this.state.bones.includes(id)) { this.state.bones.push(id); this.bones.hide(id); }
    if (w.shared.den !== undefined) this.woods?.setDen(w.shared.den, { quiet: true }); // (the pack's den, built by everyone)
    if (w.beach) this.beach?.adopt(w.beach); // (the pack's sandcastles)
    this.hud.setPlaces?.(this.placeList());
    this.refreshObjective();
    if (!rejoin) this.goHome(w.slot ?? 0);
  }

  /** Put this dog at its own garden gate, beside the tunnel it dug to get out. */
  /** Pop the dog somewhere (a start line, say), facing `face`. */
  teleport(x, z, face) {
    const P = this.player;
    P.pos.set(x, 0, z);
    P.vel.set(0, 0);
    P.vy = 0;
    P.heading = face;
    P.object.rotation.y = face;
    this.follow.snap(P.pos);
    this.follow.yaw = face + Math.PI;
  }

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
    const job = this.friends?.objective();
    if (job) { this.hud.setObjective(job.title, job.sub, { icon: job.icon, short: job.icon }); return; }
    const nb = this.state.bones.length, tb = this.bones?.count ?? 0;
    const bones = tb ? `✨🦴 Golden bones found: <b>${nb}/${tb}</b>` : '';
    if (n < total) this.hud.setObjective(`Explore ${this.layout.name}! Places found <b>${n}/${total}</b>`, bones, { icon: '🗺️', short: `${n}/${total}` });
    else this.hud.setObjective(`You know every corner of ${this.layout.name}! 🎉`, nb < tb ? `Can you reach all the golden bones? ${nb}/${tb} 🦘` : 'Friends in the park and at the pond could use a hand — and the 📋 board by your gate has jobs!', { icon: '🦴', short: `${nb}/${tb}` });
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
          <p>There’s lots more to do: <b>friends</b> in the park and at the pond, jobs on the <b>📋 board</b> by your gate, and cheeky <b>🥐 heists</b> on the bakery street…</p>`,
          [['Keep exploring', () => this.hud.hideCard()], ['🎲 Try a new town', () => { writeSave({ town: { seed: randomSeed(), discovered: [] } }); location.reload(); }],
            ['Start over', () => { clearSave(); location.reload(); }]]);
      }, 2500);
    }
  }

  /** Sniffed something out: what it is, and a star or few. */
  onSmell({ emoji, name, line, xp, at }) {
    progress.stat('smells');
    progress.award(xp, name);
    sfx.sniff();
    sfx.pop?.();
    this.actions.sparkle(at.clone().setY(0.3), 10);
    this.hud.say(`${emoji} ${line}`, () => this.actions.anchor().add(V(0, 0.3, 0)), 3.2);
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
    const b = this.bones.update(dt, this.time, pos, this.actions.glow, { onFriend: P.onFriend });
    if (b.reached) this.dispatch({ type: 'bone', id: b.reached });
    // What 🐾 would do here (grab, drop, dig something up) — that comes first in the prompt.
    const paw = canAct ? this.actions.carry.hint(this.actions.nose()) : null;
    this.hud.setPawAction(paw?.act === 'dig' ? 'dig' : paw?.act ?? this.beach?.pawAct ?? this.seasons.pawAct ?? 'dig');
    if (canAct) this.hud.setPrompt(this.heists.prompt ?? paw?.text ?? b.hint ?? this.friends.hint ?? this.woods?.hint ?? this.beach?.hint ?? this.seasons.prompt);
    this.friends.update(dt, P, canAct, { sniffing: canAct && this.input.sniff, nose: this.actions.nose() });

    // Discover places by walking into them (an area's place: by going in past its gate).
    for (const p of this.places) {
      const r = p.rect, inside = r ? pos.x > r.x0 && pos.x < r.x1 && pos.z > r.z0 && pos.z < r.z1 : Math.abs(pos.x - p.x) < TOWN.BLOCK / 2 && Math.abs(pos.z - p.z) < TOWN.BLOCK / 2;
      if (!this.state.discovered.includes(p.id) && inside) {
        this.dispatch({ type: 'discover', id: p.id });
      }
    }

    // Sniffing: the trail leads to the closest smell (or, if there's nothing to sniff round here,
    // the next place to discover). Then dig, bark, splash, mischief.
    const found = this.smells.update(dt, { nose: this.actions.nose(), sniffing: canAct && this.input.sniff, glow: this.actions.glow, myName: this.profile().name });
    if (found) this.onSmell(found);
    // (A job's target counts too — Gus's slipper, a lost duckling… — and wins when it's near.)
    const smell = this.smells.nearest(pos, 30), job = this.friends.target();
    const ds = smell ? Math.hypot(smell.x - pos.x, smell.z - pos.z) : Infinity;
    const dj = job ? Math.hypot(job.pos.x - pos.x, job.pos.z - pos.z) : Infinity;
    const next = this.nextPlace();
    const goal = job && (dj <= ds || dj < 18 || !smell) ? job.pos : smell ? smell.pos : next ? V(next.place.x, 0, next.place.z) : null;
    const acted = this.actions.update(dt, { canAct, goal, onBark: () => { this.friends.onBark(pos); this.seasons.onBark(pos); }, onDig: (n) => this.beach?.onDig(n) || this.seasons.onDig(n) });
    this.life.update(dt, { barked: acted.barked, canAct });
    this.heists.update(dt, { canAct, barked: acted.barked });
    if (this.woods) { if (acted.barked) this.woods.onBark(pos); this.woods.update(dt, { canAct }); }
    if (this.beach) { if (acted.barked) this.beach.onBark(pos); this.beach.update(dt, { canAct }); }
    this.farm?.update(dt, { canAct, barked: acted.barked });
    this.mud?.update(dt, canAct);
    if (this.pond) { // frogs croak as you get near the pond
      const dp = Math.hypot((pos.x - this.pond.x) / (this.pond.rx + 8), (pos.z - this.pond.z) / (this.pond.rz + 8));
      music.setAmbient({ frogs: THREE.MathUtils.clamp(1.6 - dp * 1.6, 0, 1) });
    }
    this.seasons.update(dt, { canAct, barked: acted.barked }); // (after the frogs: a frozen pond hushes them)
    // 🎵 Each area has its own tune: through its gate and the music changes (on the beat), and back again
    // on the way out (a few steps out, so it doesn't flick between the two at the gate).
    const here = (this.world.areas ?? []).find((a) => inRect(a.rect, pos.x, pos.z, this.musicPlace === a.kind ? 3 : 0));
    if ((here?.kind ?? 'town') !== this.musicPlace) { this.musicPlace = here?.kind ?? 'town'; music.setPlace(this.musicPlace); }

    // Cars: they stop and honk for dogs in the road, and only ever give a gentle bonk.
    const others = [...this.remotes.dogs.values()].filter((r) => r.dog.root.visible).map((r) => r.dog.root.position);
    if (this.traffic.update(dt, P, others).bonked) this.hud.float('Bonk! 💫', this.actions.anchor());

    // Compass: toward a game's next target, home with loot, whatever the current job needs, a BBQ party, or the next place to discover.
    // (A job can point the compass somewhere else — near, not on, something to sniff out — or hide it.)
    const race = this.games.update(dt), loot = this.heists.target() ?? this.woods?.target(), bbq = this.heists.partyTarget(); // (loot: carrying something home to the stash, or a big stick to the den)
    const jc = job && job.compass !== false ? job.compass ?? job.pos : null;
    const aim = race ? { x: race.pos.x, z: race.pos.z, label: race.label ?? race.emoji } : loot ? { x: loot.pos.x, z: loot.pos.z, label: loot.label }
      : job ? jc && { x: jc.x, z: jc.z, label: job.label ?? job.emoji } : bbq ? { x: bbq.pos.x, z: bbq.pos.z, label: bbq.label }
      : next ? { x: next.place.x, z: next.place.z, label: `${PLACE_EMOJI[next.place.type]} ???` } : null;
    const covered = !this.hud.card.classList.contains('hidden') || !this.hud.book.classList.contains('hidden'); // (on a phone it sits over a card)
    if (aim && canAct && !covered) {
      const yaw = this.follow.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      const dx = aim.x - pos.x, dz = aim.z - pos.z;
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      if (this.compass.classList.contains('hidden')) this.compass.classList.remove('hidden');
      this.compass.firstChild.style.transform = `rotate(${(ang - Math.PI / 2).toFixed(2)}rad)`;
      const label = `${aim.label} · ${Math.round(Math.hypot(dx, dz))}m`;
      if (label !== this.compassLabel) { this.compassLabel = label; this.compass.lastChild.innerHTML = label; } // (only when it changes: new words mean the page lays itself out again)
    } else if (!this.compass.classList.contains('hidden')) this.compass.classList.add('hidden');
  }
}
