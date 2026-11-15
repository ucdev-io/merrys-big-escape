import * as THREE from 'three';
import { paint } from '../render/watercolorMaterial.js';
import { blobGeometry, mesh } from '../world/props.js';
import { Particles } from '../fx/particles.js';
import { Cat } from '../entities/cat.js';
import { ITEMS } from '../entities/items.js';
import { sfx } from '../core/audio.js';
import { buzz } from '../core/haptics.js';
import { loadSave, writeSave, clearSave } from '../core/save.js';
import { BREEDS } from '../entities/breeds.js';
import { showLobby } from '../ui/lobby.js';
import { packPath } from '../net/links.js';
import { Mischief } from '../systems/mischief.js';
import { WaterFx } from '../systems/waterFx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z); // distance on the ground, ignoring jumps
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Each treasure has a few possible hiding places, so the garden isn't identical every time.
const SPOTS = {
  duck: [V(-5.3, 0, 3.3), V(-7.8, 0, 6.6), V(1.2, 0, 5.4)],
  sock: [V(-4.1, 0, -3.92)], // hanging on the washing line — too high to reach from the ground!
  biscuit: [V(5.5, 0, 3.9), V(8.4, 0, 1.2), V(5.8, 0, -2.6)],
};
const pickSpot = (k) => SPOTS[k][Math.floor(Math.random() * SPOTS[k].length)];
const TREASURES = [
  { key: 'duck', pos: pickSpot('duck'), need: 5 },
  { key: 'sock', pos: pickSpot('sock'), need: 5, reach: 0.85 },
  { key: 'biscuit', pos: pickSpot('biscuit'), need: 6 },
];
const TUNNEL = { key: 'tunnel', pos: V(-1.4, 0, 7.55), need: 14 };
const OUTSIDE = V(-1.4, 0, 9.3);

const CAT_SPOTS = [
  { pos: V(2.5, 1.05, 8.0), yaw: Math.PI },
  { pos: V(10.0, 1.05, 1.5), yaw: -Math.PI / 2 },
  { pos: V(-6.0, 1.05, 8.0), yaw: Math.PI },
  { pos: V(-10.0, 1.05, -3.0), yaw: Math.PI / 2 },
];

const LINES = {
  intro: ['Ha! Stuck in the garden <i>again</i>, {name}?', 'Everyone knows dogs can’t escape. Meow.'],
  idle: [
    'Is that a nose or a carrot?',
    'I can see the WHOLE neighbourhood from up here.',
    'Brrr! Are you shivering again?',
    'Dogs. So much running. So little thinking.',
    'Try using that enormous nose of yours.',
    'I’m not watching you. I’m watching a leaf.',
  ],
  duck: 'A squeaky duck? How… babyish.',
  sock: 'EW! That sock smells worse than you!',
  sockHint: 'Can\u2019t reach? Try jumping off that crate, genius.',
  pool: 'EW! Wet dog! Shake over THERE, please!',
  biscuit: 'An ancient biscuit. Lovely. Can I go back to sleep now?',
  hint: '…psst. The soil by the fence near that silly gnome smells VERY soft.',
  barkAt: ['HISSSS! Rude!', 'MY EARS!', 'Bark at the gnome, not at me!'],
  soggy: 'HA HA! Soggy doggy!',
  gnome: 'You scared Gerald!',
  nothing: 'Digging for worms? Yum.',
  tunnelStart: 'Wait… what are you doing down there?',
  tunnelHalf: 'No. No no no. Dogs can’t escape!',
  escaped: 'HEY! Wait for meeee!',
};

export class YardChapter {
  constructor({ scene, world, player, hud, input, follow, pipeline }) {
    Object.assign(this, { scene, world, player, hud, input, follow, pipeline });
    const save = loadSave();
    this.found = save.found ?? [];
    this.escaped = !!save.escaped;
    this.time = 0;
    this.sniffAmt = 0;
    this.sniffSfxT = 0;
    this.barkCD = 0;
    this.idleTalkT = 14;
    this.cutscene = null;
    this.started = false;

    // Particles: dirt clods, water, glowing scent beads, smell puffs.
    this.dirt = new Particles(scene, { max: 260, shadows: true });
    this.water = new Particles(scene, { max: 300 });
    this.glow = new Particles(scene, { max: 220, emissive: true });

    // Scent trail beads.
    this.beadCount = 42;
    this.beads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), paint(0xffffff, { emissive: 0x6a4a20 }), this.beadCount);
    this.beads.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < this.beadCount; i++) this.beads.setColorAt(i, c.set(i % 3 ? 0xf6c25a : 0xf29ab0));
    scene.add(this.beads);

    // Dig spots.
    this.spots = [...TREASURES, TUNNEL].map((d) => this.makeSpot(d));
    for (const s of this.spots) if (this.found.includes(s.key)) this.finishSpot(s, true);

    // Pickles the cat.
    this.cat = new Cat();
    this.catSpot = 0;
    this.cat.root.position.copy(CAT_SPOTS[0].pos);
    this.cat.root.rotation.y = CAT_SPOTS[0].yaw;
    scene.add(this.cat.root);
    this.catAnchor = () => this.cat.bubbleAnchor(new THREE.Vector3());
    this.merryAnchor = () => this.player.pos.clone().add(V(0, 1.0, 0));

    this.mischief = new Mischief({
      scene, hud, gardens: world.gardens, beds: world.beds, dirt: this.dirt, glow: this.glow,
      dogName: () => this.dogName, breedName: () => BREEDS[this.player.breedKey].breed,
    });
    this.mischief.onChange = (n) => { hud.setMischief(n); this.hud.float('😈 +1', this.merryAnchor(), 'dig'); };
    this.waterFx = new WaterFx(scene, hud);
    this.buildSprinkler(V(3.2, 0, -4.6));
    this.gnome = world.props.gnome;
    this.gnomeTip = 0;

    this.refreshObjective();
    hud.setFound(this.found, TREASURES.length);
    this.player.frozen = true;
    if (this.escaped) this.showEscapedCard();
    else this.showIntro();
  }

  // ---------- setup helpers ----------

  makeSpot(d) {
    const g = new THREE.Group();
    g.position.copy(d.pos);
    this.scene.add(g);
    const mound = mesh(blobGeometry(5, 0.25, 2), 0x9a7356, g, [0, 0, 0], [0, Math.random() * 3, 0], [0.38, 0.1, 0.32]);
    mound.castShadow = false;
    const hole = mesh(new THREE.CircleGeometry(0.3, 20), 0x4a3426, g, [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
    hole.castShadow = false;
    const pile = mesh(blobGeometry(9, 0.3, 2), 0x8a6346, g, [0.45, 0, 0.1], [0, 0, 0], [0.3, 0.14, 0.25]);
    g.visible = false;
    mound.scale.multiplyScalar(0.001);
    let hang = null;
    if (d.reach) {
      // Pegged to the washing line, swaying. Visible from the start — the trick is getting up there.
      hang = ITEMS[d.key].build();
      hang.position.set(d.pos.x, 1.38, d.pos.z);
      hang.rotation.z = Math.PI;
      hang.scale.setScalar(1.3);
      this.scene.add(hang);
      mound.visible = hole.visible = pile.visible = false;
    }
    return { ...d, group: g, mound, hole, pile, hang, revealed: !!d.reach, reveal: 0, progress: 0, done: false };
  }

  finishSpot(s, silent) {
    s.done = true;
    if (s.reach) { if (s.hang) s.hang.visible = false; return; }
    s.revealed = true;
    s.reveal = 1;
    s.group.visible = true;
    s.hole.visible = true;
    s.hole.scale.setScalar(s.key === 'tunnel' ? 1.3 : 1);
    s.mound.visible = false;
    s.pile.visible = true;
  }

  buildSprinkler(pos) {
    const g = new THREE.Group();
    g.position.copy(pos);
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 18), 0x6f9a52, g, [0, 0.03, 0]);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), 0x9aa3a8, g, [0, 0.15, 0]);
    const head = new THREE.Group();
    head.position.y = 0.27;
    g.add(head);
    mesh(new THREE.CapsuleGeometry(0.025, 0.24, 4, 8), 0xd9534f, head, [0, 0, 0], [0, 0, Math.PI / 2]);
    // Hose snaking off to the house.
    const pts = [V(0, 0.03, 0), V(0.6, 0.03, -0.5), V(0.2, 0.03, -1.4), V(0.9, 0.03, -2.4), V(0.5, 0.03, -3.4)];
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 6, false), 0x6f9a52, g);
    this.scene.add(g);
    this.world.colliders.circle(pos.x, pos.z, 0.2);
    this.sprinkler = { pos, head, on: 0, cd: 0, soaked: false };
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
      title: 'Who\u2019s escaping today?',
      subtitle: pack ? `Escape your garden, then you\u2019ll join pack <b>${pack}</b>!` : 'Every dog starts in their own back garden\u2026',
      onBreed: (k) => { if (k !== this.player.breedKey) this.player.setBreed(k); },
      onSolo: (c) => { writeSave({ profile: c }); lobby.close(); this.showControls(); },
    });
  }

  showControls() {
    this.follow.manualHold = 0;
    this.follow.distance = 7;
    this.follow.yaw = this.player.heading + Math.PI;
    const name = this.dogName;
    const firstTime = !loadSave().seenControls;
    writeSave({ seenControls: true });
    const keys = !firstTime ? 'Controls are in <b>☰ \u2192 How to play</b>.' : this.isTouch()
      ? 'Drag on the left to walk · 🦘 to jump · Hold 👃 to sniff · Tap 🐾 to dig · 🗣️ to woof · 💨 for zoomies'
      : '<b>WASD</b> walk · <b>Space</b> jump · hold <b>Shift</b> for zoomies · hold <b>F</b> to sniff · <b>E</b> dig · <b>Q</b> woof';
    this.hud.showCard(`
      <h1 class="who"></h1>
      <p><span class="who2"></span> is bored of the back garden.<br>There must be a way out\u2026 and that nose knows it!</p>
      <p class="keys">${keys}</p>`,
      [['Let\u2019s go! 🐾', () => this.start()]]);
    this.hud.card.querySelector('.who').textContent = `${name}'s Big Escape`;
    this.hud.card.querySelector('.who2').textContent = name;
  }

  start() {
    this.hud.hideCard();
    this.player.frozen = false;
    this.started = true;
    if (!this.found.length) {
      this.hud.say(LINES.intro[0].replace('{name}', escapeHtml(this.dogName)), this.catAnchor, 3.5);
      sfx.meow();
      this.later(3.8, () => this.hud.say(LINES.intro[1], this.catAnchor, 3.5));
    }
  }

  refreshObjective() {
    const n = this.found.filter((k) => k !== 'tunnel').length;
    if (n < TREASURES.length) {
      this.hud.setObjective(`Sniff out buried treasure! <b>${n}/${TREASURES.length}</b>`, 'Sniffing shows a golden trail to the nearest treasure.', { icon: '🦴', short: `${n}/${TREASURES.length}` });
    } else if (!this.found.includes('tunnel')) {
      const t = this.spots.find((s) => s.key === 'tunnel');
      this.hud.setObjective(t.revealed ? 'Dig a tunnel under the fence! Dig dig dig!' : 'Something smells like <b>freedom</b>… sniff out the soft spot by the fence!', '', { icon: '🕳️', short: '!' });
    } else {
      this.hud.setObjective('You escaped! 🎉', '', { icon: '🎉' });
    }
  }

  activeSpots() {
    const n = this.found.filter((k) => k !== 'tunnel').length;
    return this.spots.filter((s) => !s.done && (s.key === 'tunnel' ? n >= TREASURES.length : true));
  }

  later(t, fn) { (this.timers ??= []).push({ t, fn }); }

  // ---------- per frame ----------

  update(dt) {
    this.time += dt;
    const t = this.time;
    const P = this.player;
    const pos = P.pos;
    const input = this.input;

    if (this.timers) this.timers = this.timers.filter((tm) => ((tm.t -= dt) > 0 ? true : (tm.fn(), false)));
    if (this.cutscene) this.cutscene(dt);

    const canAct = this.started && !P.frozen;

    // ---- Sniffing
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
    const active = this.activeSpots();
    let nearest = null, nd = Infinity;
    for (const s of active) { const d = hd(s.pos, pos); if (d < nd) { nd = d; nearest = s; } }
    this.updateTrail(dt, nose, nearest);

    // Reveal spots by sniffing near them.
    this.reachPrompt = null;
    for (const s of active) {
      const d = hd(s.pos, pos);
      if (s.reach) {
        s.hang.rotation.x = Math.sin(this.time * 1.7) * 0.12;
        if (Math.random() < dt * 2) this.smellPuff(V(s.pos.x, 1.1, s.pos.z), 0x9ab86a);
        if (d < 0.8 && pos.y >= s.reach - 0.01) { this.complete(s); continue; }
        if (d < 1.3 && pos.y < s.reach) {
          this.reachPrompt = 'Too high! Find something to jump up on 📦';
          this.stuckT = (this.stuckT ?? 0) + dt;
          if (this.stuckT > 6 && !this.saidSockHint) { this.saidSockHint = true; this.hud.say(LINES.sockHint, this.catAnchor, 4); }
        }
        continue;
      }
      if (!s.revealed && sniffing && d < 5) {
        s.revealed = true;
        s.group.visible = true;
        sfx.pop();
        this.hud.float('!', s.pos.clone().add(V(0, 0.6, 0)), 'dig');
        if (s.key === 'tunnel') this.refreshObjective();
      }
      if (s.revealed) {
        s.reveal = Math.min(1, s.reveal + dt * 2);
        const k = Math.max(0.001, s.reveal) * (1 + (s.progress / s.need) * 0.4);
        s.mound.scale.set(0.38 * k, 0.1 * k, 0.32 * k);
        s.pile.scale.set(0.3, 0.14, 0.25).multiplyScalar(Math.max(0.001, s.progress / s.need));
        s.pile.visible = s.progress > 0;
        s.hole.visible = s.progress > 0;
        s.hole.scale.setScalar(Math.max(0.01, (s.progress / s.need) * (s.key === 'tunnel' ? 1.3 : 0.9)));
        if (Math.random() < dt * 2.2) this.smellPuff(s.pos, s.key === 'sock' ? 0x9ab86a : 0xd9b98a);
      } else if (d < 6 && Math.random() < dt * 0.8) {
        this.smellPuff(s.pos, 0xd9b98a);
      }
    }

    // ---- Dig prompt + digging
    const near = active.find((s) => !s.reach && s.revealed && hd(s.pos, pos) < 1.05 && pos.y < 0.3);
    if (canAct && this.reachPrompt) this.hud.setPrompt(this.reachPrompt);
    else if (canAct && near) {
      const bar = near.need > 6 ? '  ' + '▮'.repeat(Math.round((near.progress / near.need) * 10)).padEnd(10, '▯') : '';
      this.hud.setPrompt((this.isTouch() ? 'Tap 🐾 to dig!' : 'Press E to dig!') + bar);
    } else this.hud.setPrompt('');

    if (canAct && input.dig) {
      P.digTimer = 0.35;
      sfx.dig();
      const at = near ? near.pos : nose.clone().setY(0);
      this.dirtBurst(at, near ? 8 : 4);
      if (near) {
        near.progress++;
        this.hud.float(pick(['dig!', 'scratch!', 'dig dig!']), at.clone().add(V(0, 0.5, 0)), 'dig');
        if (near.key === 'tunnel') {
          if (near.progress === 2) this.hud.say(LINES.tunnelStart, this.catAnchor, 3);
          if (near.progress === Math.floor(near.need / 2)) this.hud.say(LINES.tunnelHalf, this.catAnchor, 3);
        }
        if (near.progress >= near.need) this.complete(near);
      } else {
        this.mischief.dig(nose.clone().setY(0));
      }
      if (!near && !this.saidNothing && Math.random() < 0.5) {
        this.saidNothing = true;
        this.hud.say(LINES.nothing, this.catAnchor, 2.5);
      }
    }

    // ---- Barking
    this.barkCD -= dt;
    if (canAct && input.bark && this.barkCD <= 0) {
      this.barkCD = 0.5;
      P.dog.bark();
      sfx.bark(P.dog.breed.bark);
      this.hud.float('WOOF!', this.merryAnchor());
      this.reactToBark();
    }

    if (canAct) this.mischief.update(dt, P);
    this.waterFx.update(dt, P.dog, { pos: P.pos, heading: P.heading, speed: P.speed, inWater: P.inWater, swim: P.swim, surface: P.waterSurface, enteredSpeed: P.enteredSpeed, leftWater: P.leftWater });
    if (P.leftWater && !this.saidPool) { this.saidPool = true; this.later(0.6, () => { this.hud.say(LINES.pool, this.catAnchor, 3); this.cat.laugh = 1; }); }
    this.updateSprinkler(dt);
    this.updateGnome(dt);

    // ---- Pickles
    this.cat.update(dt, pos);
    this.idleTalkT -= dt;
    if (this.started && this.idleTalkT <= 0 && !this.cutscene && !P.frozen) {
      this.hud.say(pick(LINES.idle), this.catAnchor, 3.5);
      this.idleTalkT = rand(20, 30);
    }

    // ---- Items popping out of the ground
    if (this.popping) {
      const p = this.popping;
      p.t += dt;
      const k = Math.min(1, p.t / 0.9);
      p.obj.position.y = Math.sin(k * Math.PI * 0.85) * 0.9 + 0.05;
      p.obj.rotation.y += dt * 8;
      if (p.t > 1.4) {
        const s = Math.max(0, 1 - (p.t - 1.4) / 0.3);
        p.obj.scale.setScalar(s * 1.5);
        if (s <= 0) { this.scene.remove(p.obj); this.popping = null; }
      } else p.obj.scale.setScalar(1.5);
      if (p.stinky && Math.random() < dt * 20) this.smellPuff(p.obj.position.clone().setY(0), 0x9ab86a);
    }

    this.dirt.update(dt);
    this.water.update(dt);
    this.glow.update(dt);
    this.hud.setStamina(P.stamina, P.speed > 3);
  }

  updateTrail(dt, nose, target) {
    const amt = this.sniffAmt;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    if (!target || amt < 0.02) { this.beads.count = 0; return; }
    this.beads.count = this.beadCount;
    const goal = target.pos.clone().setY(0.15);
    const dir = goal.clone().sub(nose);
    const len = dir.length();
    const maxLen = 9;
    if (len > maxLen) goal.copy(nose).addScaledVector(dir.normalize(), maxLen);
    const side = V(-(goal.z - nose.z), 0, goal.x - nose.x).normalize();
    const mid = nose.clone().lerp(goal, 0.5).addScaledVector(side, Math.sin(this.time * 0.7) * 0.5).add(V(0, 0.5, 0));
    const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < this.beadCount; i++) {
      const u = (i / this.beadCount + this.time * 0.3) % 1;
      a.copy(nose).lerp(mid, u);
      b.copy(mid).lerp(goal, u);
      p.copy(a).lerp(b, u);
      p.addScaledVector(side, Math.sin(u * 14 + this.time * 3 + i) * 0.07);
      p.y += Math.sin(u * 9 + this.time * 2) * 0.05;
      const sz = 0.07 * amt * Math.sqrt(Math.sin(u * Math.PI)) * (0.8 + 0.3 * Math.sin(this.time * 6 + i));
      m.compose(p, q, s.set(sz, sz, sz));
      this.beads.setMatrixAt(i, m);
    }
    this.beads.instanceMatrix.needsUpdate = true;
  }

  smellPuff(at, color) {
    this.glow.spawn({
      pos: at.clone().add(V(rand(-0.15, 0.15), 0.1, rand(-0.15, 0.15))),
      vel: V(rand(-0.1, 0.1), rand(0.35, 0.6), rand(-0.1, 0.1)),
      life: 1.6, size: 0.05, grow: 1.2, color, drag: 0.5,
    });
  }

  dirtBurst(at, n) {
    const back = V(-Math.sin(this.player.heading), 0, -Math.cos(this.player.heading));
    this.dirt.burst(n, () => ({
      pos: at.clone().add(V(rand(-0.1, 0.1), 0.05, rand(-0.1, 0.1))),
      vel: back.clone().multiplyScalar(rand(1, 2.5)).add(V(rand(-0.8, 0.8), rand(1.8, 3.2), rand(-0.8, 0.8))),
      life: rand(0.8, 1.3), size: rand(0.025, 0.05), gravity: 9, floor: 0.02,
      color: pick([0x9a7356, 0x7a5236, 0xb08a68]),
    }));
  }

  complete(s) {
    this.finishSpot(s);
    this.found.push(s.key);
    writeSave({ found: this.found, escaped: false });
    this.hud.setFound(this.found, TREASURES.length);
    if (s.key === 'tunnel') { this.startEscape(s); return; }

    const def = ITEMS[s.key];
    const obj = def.build();
    obj.position.copy(s.pos);
    if (s.hang) { s.hang.visible = false; this.hud.float('YOINK!', V(s.pos.x, 1.6, s.pos.z)); }
    this.scene.add(obj);
    this.popping = { obj, t: 0, stinky: !!obj.userData.stinky };
    sfx.found();
    buzz([25, 40, 25]);
    if (s.key === 'duck') this.later(0.5, () => sfx.squeak());
    this.player.happy = 1;
    this.later(2.5, () => (this.player.happy = 0.5));
    this.glow.burst(18, () => ({
      pos: s.pos.clone().add(V(0, 0.3, 0)),
      vel: V(rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5)),
      life: 1.2, size: 0.04, gravity: 3, color: pick([0xf6d06a, 0xf2a0b4, 0xb69be0]),
    }));
    this.later(0.8, () => this.hud.showToast(s.key));
    this.refreshObjective();

    // Pickles has opinions.
    this.later(2.2, () => {
      this.hud.say(LINES[s.key], this.catAnchor, 3.5);
      this.catHop();
    });
    if (this.found.filter((k) => k !== 'tunnel').length === TREASURES.length) {
      this.later(6.2, () => {
        this.hud.say(LINES.hint, this.catAnchor, 5);
        this.catHopTo(0);
      });
    }
    this.idleTalkT = Math.max(this.idleTalkT, 12);
  }

  catHop() { this.catHopTo((this.catSpot + 1) % CAT_SPOTS.length); }
  catHopTo(i) {
    if (i === this.catSpot) return;
    this.catSpot = i;
    this.cat.hopTo(CAT_SPOTS[i].pos, CAT_SPOTS[i].yaw);
  }

  reactToBark() {
    const pos = this.player.pos;
    const catD = this.cat.root.position.distanceTo(pos);
    if (catD < 5) {
      this.cat.startle = 1;
      sfx.hiss();
      this.hud.say(pick(LINES.barkAt), this.catAnchor, 2.2);
      this.idleTalkT = Math.max(this.idleTalkT, 10);
    }
    if (this.gnome.position.distanceTo(pos) < 3.5 && this.gnomeTip <= 0) {
      this.gnomeTip = 4.5;
      this.later(0.45, () => sfx.bonk());
      this.later(1.0, () => { this.hud.say(LINES.gnome, this.catAnchor, 2.5); this.cat.laugh = 1.5; });
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

  updateSprinkler(dt) {
    const sp = this.sprinkler, pos = this.player.pos;
    sp.cd -= dt;
    const d = Math.hypot(pos.x - sp.pos.x, pos.z - sp.pos.z);
    if (this.started && sp.on <= 0 && sp.cd <= 0 && d < 1.8) {
      sp.on = 3.5; sp.cd = 12; sp.soaked = false;
      sfx.splash();
    }
    if (sp.on > 0) {
      sp.on -= dt;
      sp.head.rotation.y += dt * 9;
      for (let k = 0; k < 2; k++) {
        const a = sp.head.rotation.y + k * Math.PI;
        const dir = V(Math.cos(a), 0, -Math.sin(a));
        for (let j = 0; j < 3; j++) {
          this.water.spawn({
            pos: sp.pos.clone().add(V(0, 0.3, 0)),
            vel: dir.clone().multiplyScalar(rand(1.5, 3.2)).add(V(0, rand(2.5, 3.6), 0)),
            life: 1.0, size: rand(0.02, 0.035), gravity: 9, floor: 0.02, color: pick([0x8fc4d8, 0xbfe0ec, 0xffffff]),
          });
        }
      }
      if (!sp.soaked && d < 2.6) {
        sp.soaked = true;
        this.later(1.0, () => {
          this.player.dog.shake();
          sfx.shake();
          for (let i = 0; i < 30; i++) {
            this.water.spawn({
              pos: this.player.pos.clone().add(V(rand(-0.2, 0.2), rand(0.35, 0.6), rand(-0.3, 0.3))),
              vel: V(rand(-2.5, 2.5), rand(0.5, 2), rand(-2.5, 2.5)),
              life: 0.8, size: 0.022, gravity: 8, floor: 0.02, color: 0xbfe0ec,
            });
          }
        });
        this.later(1.3, () => { this.hud.say(LINES.soggy, this.catAnchor, 3); this.cat.laugh = 2; sfx.meow(); });
      }
    }
  }

  // ---------- the great escape ----------

  startEscape(s) {
    const P = this.player;
    P.frozen = true;
    this.hud.setPrompt('');
    sfx.tunnel();
    let t = 0, stage = 0;
    P.lockY = true;
    const dog = P.dog.root;
    const startY = dog.position.y;
    P.heading = 0; // face the fence
    this.cutscene = (dt) => {
      t += dt;
      if (stage === 0) {
        // Dive head first into the hole.
        const k = Math.min(1, t / 0.9);
        dog.position.y = startY - k * 0.9;
        P.dog.body.rotation.x = 0.9 * Math.sin(k * Math.PI * 0.5);
        if (Math.random() < 0.5) this.dirtBurst(s.pos, 2);
        if (k >= 1) { stage = 1; t = 0; }
      } else if (stage === 1) {
        if (t > 0.9) {
          // Pop out on the other side.
          P.ignoreBounds = true;
          P.pos.set(OUTSIDE.x, -0.9, OUTSIDE.z);
          this.follow.yaw = Math.PI * 0.85;
          stage = 2; t = 0;
          sfx.pop();
          this.dirtBurst(OUTSIDE, 20);
        }
      } else if (stage === 2) {
        const k = Math.min(1, t / 0.5);
        dog.position.y = -0.9 + k * 0.9;
        P.dog.body.rotation.x = -0.4 * (1 - k);
        if (k >= 1) {
          stage = 3; t = 0;
          P.happy = 1;
          P.dog.shake();
          sfx.shake();
          this.hud.float('FREEDOM!', this.merryAnchor());
          this.hud.say(LINES.escaped, this.catAnchor, 4);
          sfx.meow();
        }
      } else if (stage === 3 && t > 1.6) {
        stage = 4; t = 0;
        P.scripted = { target: V(OUTSIDE.x + 2, 0, OUTSIDE.z + 7), run: true };
        sfx.hooray();
      } else if (stage === 4 && t > 2.2) {
        this.cutscene = null;
        P.scripted = null;
        this.escaped = true;
        writeSave({ found: this.found, escaped: true, yardDone: true });
        this.refreshObjective();
        this.showEscapedCard();
      }
    };
  }

  showEscapedCard() {
    this.player.frozen = true;
    const pack = loadSave().pendingPack;
    const go = pack
      ? [`Join pack ${pack} \u2192`, () => { writeSave({ chapter: 'town', pendingPack: null }); location.href = packPath(pack); }]
      : ['Into the neighbourhood \u2192', () => { writeSave({ chapter: 'town' }); location.href = '/?town'; }];
    this.hud.showCard(`
      <h1 class="who"></h1>
      <p>With a squeaky duck, a smelly sock, an ancient biscuit<br>and a very muddy nose, <span class="who2"></span> is free!</p>
      <p>Beyond the fence lies <b>the Neighbourhood</b> \u2014 your friends, new smells, new adventures\u2026</p>`,
      [go, ['Play the garden again', () => { writeSave({ found: [], escaped: false, chapter: 'yard' }); location.href = '/'; }]]);
    this.hud.card.querySelector('.who').textContent = `${this.dogName} escaped! 🎉`;
    this.hud.card.querySelector('.who2').textContent = this.dogName;
  }
}

