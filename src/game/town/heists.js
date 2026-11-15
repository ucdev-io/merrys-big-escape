import * as THREE from 'three';
import { HeistRoom, BAKERY_IDS, lootKind } from '../heistRules.js';
import { Lookout } from './heist/lookout.js';
import { baker as bakerPerson } from './heist/people.js';
import { SausageHeist } from './heist/butcher.js';
import { BbqParty } from './heist/party.js';
import { dogBowl, PILE } from './heist/models.js';
import { heistSfx } from './heist/sounds.js';
import { treatGeometry, treatMaterial, treatMesh, TREATS } from '../../entities/treats.js';
import { LineBag } from '../dialogue.js';
import { BAKER, GETAWAY, SNEAKY, OOPS } from '../lines/heists.js';
import { progress } from '../progress.js';
import { COSMETICS } from '../cosmetics.js';
import { buzz } from '../../core/haptics.js';
import { sfx } from '../../core/audio.js';
import { blocked } from '../../world/spots.js';
import { season } from '../season.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LOCAL = 0;  // our dog's id in a HeistRoom of our own (no pack server)
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const inRect = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), UP = V(0, 1, 0), ONE = V(1, 1, 1), NONE = V(0, 0, 0);

/**
 * 🥐🌭 Heists: cheeky food raids, on your own or as a team.
 *   The baker on the bakery street keeps glancing round (watch the sign over her head): grab a treat
 *   off her stall while her back's turned and run it home to your garden. Caught red-pawed? "Oi!
 *   Shoo!" and it goes back on the tray. A woof at her door makes her turn to see who's there, so one
 *   dog can distract her while another sneaks in.
 *   The butcher next door has a long string of sausages on a rail (heist/butcher.js): run off with
 *   it, and maybe a tug of war.
 *
 * Who's looking and who has which treat is decided by a HeistRoom (../heistRules.js): the pack
 * server's when you're in a pack, or our own when you're not. Treats are carried like anything else
 * (systems/carry.js): we just watch what's in the dog's mouth and tell the room.
 */
export class Heists {
  constructor({ scene, world, hud, player, actions, pack, remotes, dogName }) {
    Object.assign(this, { scene, world, hud, player, actions, pack, remotes, dogName });
    this.carry = actions.carry;
    this.data = world.heist;
    this.items = new Map();  // loot id → its carry item (item.loot: what it is, where its home is…)
    this.lookouts = {};
    this.bags = {};
    this.flyers = [];
    this.pile = [];
    this.prompt = null;      // for the HUD's prompt line (null: nothing to say)
    this.online = false;     // following the pack server's HeistRoom (rather than our own)
    this.lastHeld = null;
    if (!this.data?.bakery) return;
    this.buildBakery();
    if (this.data.butcher) this.sausages = new SausageHeist(this, this.data.butcher);
    this.party = new BbqParty(this);
    this.reset();
  }

  me() { return this.pack.net?.id ?? LOCAL; }
  /** A line from a no-repeats bag, with {treat}, {name}… filled in. */
  line(key, list, vars = {}) {
    this.bags[key] ??= new LineBag(list);
    return this.bags[key].next().replace(/\{(\w+)\}/g, (m, k) => esc(({ name: this.dogName(), ...vars })[k] ?? m));
  }
  say(L, text, dur = 2.8, cls = '') { this.hud.say(text, L.bubbleAt, dur, `heist ${cls}`); }
  near(L, r) { return flat(this.player.pos, L.pos) < r; }
  /** In our own garden (where loot gets banked)? */
  inHome(P) { return !!this.stashGarden && inRect(P, this.stashGarden.rect); }

  // ---------- building ----------

  buildBakery() {
    const B = this.data.bakery, person = bakerPerson();
    this.scene.add(person.root);
    this.lookouts.baker = new Lookout({ hud: this.hud, person, pos: B.baker, faces: { busy: B.busy, look: B.look }, zone: B.zone, work: 'knead' });
    const stall = V(B.zone.x, 0, B.zone.z);
    this.lookouts.baker.site = {
      door: B.door, lines: BAKER, whom: 'the baker', goods: () => stall,
      prompts: { busy: '🤫 Her back’s turned… grab a treat! 🐾', warn: '❗ She’s about to look round!', look: '👀 She’s watching! Wait for it…', door: '❓ She’s distracted… quick, grab one! 🐾', woof: '🗣️ Woof at the door to distract the baker!' },
    };
    // Each tray of treats is one instanced mesh (two draw calls for twelve treats); the treat you
    // grab is its own mesh, which carry.js puts in your mouth.
    this.trays = {};
    const count = {};
    for (const id of BAKERY_IDS) count[lootKind(id)] = (count[lootKind(id)] ?? 0) + 1;
    for (const [kind, n] of Object.entries(count)) {
      const m = new THREE.InstancedMesh(treatGeometry(kind), treatMaterial(), n);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.trays[kind] = { mesh: m, n: 0 };
    }
    BAKERY_IDS.forEach((id, i) => {
      const s = B.slots[i], kind = lootKind(id), tray = this.trays[kind];
      const it = this.carry.add(kind, s.x, s.z);
      it.obj.visible = false;
      it.loot = { id, kind, lookout: 'baker', home: V(s.x, s.y, s.z), rot: s.ry + (kind === 'croissant' ? (i % 2 ? 0.25 : -0.2) : i * 1.7), mesh: tray.mesh, index: tray.n++, state: 'home', by: null, pending: false };
      this.items.set(id, it);
      this.place(it, 'home');
    });
    for (const { mesh } of Object.values(this.trays)) mesh.computeBoundingSphere();
  }

  /** Your stash bowl, just inside your own garden gate (it moves if you get a different house in a pack). */
  stash() {
    const g = this.world.gardens?.find((q) => q.own);
    if (!g) return null;
    if (g !== this.stashGarden) {
      this.stashGarden = g;
      const h = this.world.homes.find((q) => q.garden === g) ?? this.world.homes[0];
      const f = V(Math.sin(h.face), 0, Math.cos(h.face)), side = V(f.z, 0, -f.x);
      let at = h.pos.clone().addScaledVector(f, -2.2);
      for (const [a, b] of [[-2.2, 1.1], [-2.2, -1.1], [-3.2, 1.6], [-3.2, -1.6], [-2.2, 0]]) {
        const p = h.pos.clone().addScaledVector(f, a).addScaledVector(side, b);
        if (!blocked(this.world, p.x, p.z, 0.5) && inRect(p, g.rect)) { at = p; break; }
      }
      this.bowl ??= dogBowl();
      this.bowl.position.set(at.x, 0.02, at.z);
      this.bowl.rotation.y = h.face + Math.PI;
      if (!this.bowl.parent) this.scene.add(this.bowl);
      for (const m of this.pile) this.bowl.add(m);
    }
    return this.bowl.position;
  }

  // ---------- the HeistRoom: ours, or the pack's ----------

  /** Playing without the pack server (or we just lost it): a HeistRoom of our own. */
  reset() {
    this.online = false;
    this.room = new HeistRoom(performance.now(), { season: season.name });
    this.adopt(this.room.snapshot(performance.now()));
  }

  send(msg) {
    if (this.pack.net) this.pack.sendHeist(msg);
    else this.deliver(this.room.message(LOCAL, msg, performance.now()));
  }

  deliver(list) { for (const { to, msg } of list) if (to === 'all' || to === LOCAL) this.handle(msg); }

  /** A message from the HeistRoom (the pack server's, or ours). */
  handle(m) {
    if (!this.data?.bakery) return;
    switch (m.a) {
      case 'state': if (this.pack.net) { this.online = true; this.room = null; } return this.adopt(m);
      case 'npc': return this.onNpc(m);
      case 'wise': { const L = this.lookouts[m.npc]; if (L && this.near(L, 22)) this.say(L, this.line(`${m.npc}-wise`, L.site.lines.wise)); return; }
      case 'loot': return this.onLoot(m);
      case 'nope': { const it = this.items.get(m.id); if (!it) return; this.place(it, m.s, m.by, m.x, m.z); this.hud.float('Too slow!', this.actions.anchor()); return; }
      case 'restock': return this.onRestock(m);
      case 'links': return this.sausages?.onLinks(m);
      case 'tug': return this.sausages?.onTug(m);
      case 'party': return this.party.onParty(m);
    }
  }

  /** Everything as the room has it right now (we've just arrived, or changed rooms). */
  adopt(m) {
    if (this.carry.held?.loot) { this.carry.remove(this.carry.held); this.lastHeld = this.carry.held; }
    this.party.onParty({ n: m.party?.n ?? null }); // (first: is there a grill to put things on?)
    for (const [id, n] of Object.entries(m.npcs ?? {})) this.lookouts[id]?.setState(n.s, n.ms, n.by, false);
    const where = new Map((m.loot ?? []).map(([id, s, by, x, z]) => [id, { s, by, x, z }]));
    for (const [id, it] of this.items) { const w = where.get(id); this.place(it, w?.s ?? 'home', w?.by ?? null, w?.x, w?.z); }
    this.sausages?.adopt(m.links);
  }

  onNpc(m) {
    const L = this.lookouts[m.id];
    if (!L) return;
    const was = L.s;
    L.setState(m.s, m.ms, m.by);
    const lines = L.site.lines, near = this.near(L, 16);
    if (m.s === 'warn' && near) { heistSfx.hmm(); this.hud.float(this.line(`${m.id}-warn`, lines.warn), L.top(0.2), 'sniff'); }
    else if (m.s === 'look' && near) {
      if (this.missing(m.id) && !L.noticed) { L.noticed = true; this.say(L, `😮 ${this.line(`${m.id}-missing`, lines.missing)}`, 3); }
      else if (Math.random() < 0.35) this.say(L, this.line(`${m.id}-look`, lines.look), 2.4);
    } else if (m.s === 'door' && this.near(L, 26)) { const [face, cls] = L.site.doorMood ?? ['😠', 'angry']; this.say(L, `${face} ${this.line(`${m.id}-door`, lines.door)}`, 3, cls); }
    else if (m.s === 'busy' && was === 'look' && near && Math.random() < 0.3) this.say(L, this.line(`${m.id}-hum`, lines.hum), 2.4);
  }

  /** Has something gone from under this grown-up's nose? */
  missing(id) {
    if (id === 'butcher') return this.sausages?.state.at !== 'hook';
    return [...this.items.values()].some((it) => it.loot.lookout === id && it.loot.state !== 'home');
  }

  onLoot(m) {
    const it = this.items.get(m.id);
    if (!it) return;
    const me = this.me(), L = this.lookouts[it.loot.lookout];
    if (m.s === 'home' && m.why === 'caught' && L) { // "Oi! Shoo!" (and back it goes, through the air)
      L.shout();
      const mouth = m.by === me ? this.player.dog.mouth : this.remotes.get(m.by)?.dog.mouth;
      if (mouth) {
        it.loot.flying = true;
        this.fly(it.loot.kind, mouth.getWorldPosition(new THREE.Vector3()), it.loot.home, 0.6, () => { it.loot.flying = false; if (it.loot.state === 'home') this.showOnTray(it, true); });
      }
      if (this.near(L, 30)) { this.say(L, `😠 ${this.line(`${it.loot.lookout}-caught`, L.site.lines.caught, { treat: TREATS[it.loot.kind].name })}`, 3, 'angry'); sfx.shout?.(); }
      if (m.by === me) { heistSfx.wahwah(); buzz([60, 40, 60]); this.hud.float(this.line('oops', OOPS), this.actions.anchor()); }
    }
    if (m.s === 'gone' && m.why === 'bank') {
      const T = TREATS[it.loot.kind];
      if (m.by === me) this.banked(it);
      else this.othersHeist(m.by, T.emoji, `a ${T.name}`);
      if (m.helper === me && m.by !== me) this.teamHeist(m.by, L?.site.whom ?? 'them', `the ${T.name}`);
    }
    this.place(it, m.s, m.by, m.x, m.z);
  }

  onRestock(m) {
    for (const id of m.ids ?? []) { const it = this.items.get(id); if (it) this.place(it, 'home'); }
    const L = this.lookouts[m.npc];
    if (!L) return;
    L.noticed = false;
    if (this.near(L, 24)) { heistSfx.ding(); this.say(L, `😊 ${this.line(`${m.npc}-restock`, L.site.lines.restock)}`, 3); }
  }

  // ---------- treats ----------

  /** Show (or hide) a treat in its place on the tray. */
  showOnTray(it, on) {
    const L = it.loot;
    L.mesh.setMatrixAt(L.index, _m.compose(L.home, _q.setFromAxisAngle(UP, L.rot), on ? ONE : NONE));
    L.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Put a treat where the room says it is: on its tray, in someone's mouth, on the ground, or gone. */
  place(it, s, by = null, x = 0, z = 0) {
    if (s === 'home' && it.loot.lookout === 'cook' && !this.party?.on) s = 'gone'; // (no party, no grill)
    const L = it.loot, mine = s === 'held' && by === this.me();
    if (this.carry.held === it && !mine) { this.carry.remove(it); this.lastHeld = this.carry.held; } // (taken off us)
    const listed = this.carry.items.includes(it), obj = it.obj;
    const list = (on) => {
      if (on && !listed) this.carry.items.push(it);
      if (!on && listed) this.carry.items.splice(this.carry.items.indexOf(it), 1);
      if (on && obj.parent !== this.scene) this.scene.add(obj);
      if (!on && obj.parent === this.scene) this.scene.remove(obj);
    };
    L.state = s; L.by = by; L.pending = false;
    if (s === 'home') {
      list(true);
      obj.position.copy(L.home); obj.rotation.set(0, L.rot, 0); obj.scale.setScalar(1);
      obj.visible = false; // (the tray shows it)
    } else if (s === 'ground') {
      list(true);
      if (by !== this.me() || obj.parent !== this.scene) { obj.position.set(x, 0.02, z); obj.scale.setScalar(1); }
      obj.visible = true;
    } else if (mine && this.carry.held === it) obj.visible = true;
    else list(false); // in another dog's mouth (they'll show it), or gone
    this.showOnTray(it, s === 'home' && !L.flying);
  }

  /** Did our dog just grab or drop something (🐾, or a woof)? Tell the room. */
  watchMouth() {
    const held = this.carry.held, last = this.lastHeld;
    if (held === last) return;
    this.lastHeld = held;
    if (held?.links || last?.links) this.sausages?.watch(held, last);
    if (last?.loot && this.carry.items.includes(last)) {
      last.loot.state = 'ground';
      this.send({ a: 'drop', id: last.loot.id, x: last.obj.position.x, z: last.obj.position.z });
    }
    if (held?.loot) {
      const L = held.loot, who = this.lookouts[L.lookout];
      this.showOnTray(held, false);
      held.obj.visible = true;
      L.state = 'held'; L.by = this.me();
      this.send({ a: 'grab', id: L.id });
      if (who && !(who.watching && who.inZone(this.player.pos))) {
        heistSfx.sneak();
        this.hud.float(this.line('sneaky', SNEAKY), this.actions.anchor(), 'sniff');
        if (L.lookout === 'cook') this.party.cheer();
      }
    }
  }

  /** Holding a treat where a grown-up can see it? Caught! Home in our own garden? Got away with it! */
  checkHeld() {
    const P = this.player.pos;
    this.sausages?.check(P);
    const it = this.carry.held, L = it?.loot;
    if (!L || L.pending) return;
    const who = this.lookouts[L.lookout];
    if (who?.watching && who.inZone(P)) { L.pending = true; this.send({ a: 'caught', id: L.id }); return; }
    if (this.inHome(P)) { L.pending = true; this.send({ a: 'bank', id: L.id }); }
  }

  // ---------- rewards ----------

  /** We got a treat home: into the bowl it goes, with stars (and, after a few, a robber's mask). */
  banked(it) {
    const kind = it.loot.kind, T = TREATS[kind], to = this.stash();
    if (to) this.fly(kind, it.obj.getWorldPosition(new THREE.Vector3()), to.clone().setY(0.12), 1.4, (m) => this.addToPile(m));
    this.reward(15, 'Cheeky heist!', T.emoji, `Got away with the ${T.name}!`, this.line(`get-${kind}`, GETAWAY[kind] ?? GETAWAY.croissant));
  }

  /** Stars, the heists stat, a happy dog… */
  reward(xp, reason, emoji, head, blurb) {
    const before = progress.stats.heists ?? 0;
    progress.stat('heists');
    progress.award(xp, reason);
    heistSfx.getaway();
    buzz([25, 40, 25]);
    this.player.happy = 1;
    setTimeout(() => (this.player.happy = 0.5), 2000);
    this.actions.sparkle(this.player.pos.clone().add(V(0, 0.8, 0)), 22);
    this.hud.showToastRaw(emoji, head, blurb);
    this.prizes(before);
  }

  /** We kept a grown-up busy while a friend got away with something. Team heist! */
  teamHeist(by, whom, what) {
    const before = progress.stats.heists ?? 0;
    progress.stat('heists');
    progress.award(10, 'Team heist!');
    heistSfx.getaway();
    const who = this.remotes.get(by)?.name ?? 'Your friend';
    this.hud.showToastRaw('🤝', 'Team heist!', '');
    this.hud.toast.querySelector('.t-blurb').textContent = `You kept ${whom} busy while ${who} got away with ${what}!`;
    this.prizes(before);
  }

  othersHeist(by, emoji, what) {
    const r = this.remotes.get(by);
    if (!r) return;
    this.hud.showToastRaw(emoji, '', 'Cheeky!');
    this.hud.toast.querySelector('.t-head').textContent = `${r.name} got away with ${what}!`;
  }

  prizes(before) {
    const now = progress.stats.heists ?? 0;
    for (const c of COSMETICS) {
      if (c.friend !== 'heists' || before >= c.jobs || now < c.jobs) continue;
      setTimeout(() => { sfx.hooray?.(); this.hud.showToastRaw(c.emoji, `New: ${c.name}!`, 'For a very sneaky dog. Wear it from ☰ → My dog → Dress up.'); }, 2600);
    }
  }

  /** A treat sails through the air (into the stash bowl, or back onto the tray), arcing `hop` high. */
  fly(kind, from, to, hop, land) {
    const m = treatMesh(kind);
    m.position.copy(from);
    this.scene.add(m);
    this.flyers.push({ m, from: from.clone(), to: to.clone(), hop, land, t: 0 });
  }

  updateFlyers(dt) {
    this.flyers = this.flyers.filter((f) => {
      f.t += dt / 0.7;
      const k = Math.min(1, f.t);
      f.m.position.lerpVectors(f.from, f.to, k);
      f.m.position.y += Math.sin(k * Math.PI) * f.hop;
      f.m.rotation.y += dt * 8;
      if (k < 1) return true;
      f.m.removeFromParent();
      f.land?.(f.m);
      return false;
    });
  }

  /** Into the bowl it goes (the eight most recent, anyway). */
  addToPile(m) {
    m.position.set(...PILE[this.pile.length % PILE.length]);
    m.scale.setScalar(1.35);
    m.rotation.set(0, Math.random() * 6, 0);
    this.bowl.add(m);
    this.pile.push(m);
    if (this.pile.length > PILE.length) this.pile.shift().removeFromParent();
    sfx.boink?.();
  }

  // ---------- per frame ----------

  /** @returns nothing; read .prompt and target() afterwards. */
  update(dt, { canAct = true, barked = false } = {}) {
    if (!this.data?.bakery) return;
    if (!this.pack.net && this.online) this.reset(); // lost the pack: carry on with heists of our own
    if (this.room && this.room.season !== season.name) this.room.setSeason(season.name); // (summer: more BBQs)
    if (this.room) this.deliver(this.room.tick(performance.now()));
    const P = this.player.pos;
    this.stash();
    for (const [id, L] of Object.entries(this.lookouts)) {
      const target = L.s === 'door' ? (L.by === this.me() ? P : this.remotes.get(L.by)?.dog.root.position ?? L.site.door) : null;
      L.update(dt, target, P);
      if (canAct && barked && flat(P, L.site.door) < 2.6) this.send({ a: 'distract', npc: id }); // woof at the door!
    }
    this.sausages?.update(dt, P, canAct);
    this.party.update(dt);
    this.updateFlyers(dt);
    if (!canAct) { this.prompt = null; return; }
    this.watchMouth();
    this.checkHeld();
    this.prompt = this.promptFor(P);
  }

  promptFor(P) {
    const it = this.carry.held;
    if (it?.links) return this.sausages.prompt(P);
    if (it?.loot) {
      const L = this.lookouts[it.loot.lookout];
      if (L?.inZone(P)) return L.s === 'look' ? '👀 Uh-oh…' : L.s === 'warn' ? '❗ Quick! Run for it!' : '🏃 Leg it! Get it home!';
      return `🏠 Run the ${it.def.name} home to your garden!`;
    }
    if (it) return null;
    for (const L of Object.values(this.lookouts)) {
      const site = L.site, goods = site.goods();
      if (flat(P, site.door) < 2.4 && (L.s === 'look' || L.s === 'warn')) return site.prompts.woof;
      if (goods && flat(P, goods) < 3) return site.prompts[L.s] ?? null;
    }
    return null;
  }

  /** For the compass: carrying loot? Home to the stash! { pos, label } or null. */
  target() {
    const it = this.carry.held;
    if (!(it?.loot || it?.links) || !this.bowl) return null;
    return { pos: this.bowl.position, label: '🏠 Stash' };
  }

  /** For the compass, when nothing more important's going on: a BBQ party. */
  partyTarget() { return this.party?.target() ?? null; }
}
