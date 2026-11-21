import { COSMETICS, COSMETIC, titleFor } from './cosmetics.js';
import { xpForLevel, levelForXp } from './levels.js';
import { getJson, postJson } from '../net/api.js';
import { loadSave, writeSave } from '../core/save.js';

export { xpForLevel };

/*
 * Your dog's progress: stars (XP), level, stats and outfit — and which saved dog you are.
 *
 * It lives in this browser, and when the game server is there it's also saved on it (a "profile",
 * see server/store.js), so the dog's stars follow it to any phone, tablet or computer at home.
 * Changes go up as *amounts earned since the last sync* (never totals, so two devices can't
 * overwrite each other), in numbered batches: if the page closes halfway through sending one,
 * it's sent again next time and the server only counts it once.
 */
const KEY = 'merry.progress.v1';
const blankLook = () => ({ collar: null, neck: null, hat: null });
const emptyBatch = () => ({ xp: 0, stats: {} });
const isEmpty = (b) => !b.xp && !Object.keys(b.stats).length && !b.look && !b.name && !b.breed && !b.yardDone;
const batchId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

class Progress {
  constructor() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* private mode etc. */ }
    this.id = d.id ?? null;                  // saved dog on the game server (null: this device only)
    this.xp = d.xp ?? 0;
    this.stats = d.stats ?? {};
    this.look = d.look ?? blankLook();
    this.pending = d.pending ?? emptyBatch(); // earned since the last sync
    this.inflight = d.inflight ?? null;       // a batch on its way to the server
    this.listeners = new Set();
    this.statListeners = new Set(); // (key, n): something was just done here (not totals from the server)
    this.retry = 2000;
    // Leaving or hiding the page: send what's waiting straight away.
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ id: this.id, xp: this.xp, stats: this.stats, look: this.look, pending: this.pending, inflight: this.inflight }));
    } catch { /* ignore */ }
  }

  get level() { return levelForXp(this.xp); }
  get title() { return titleFor(this.level); }
  /** 0..1 progress through the current level. */
  get levelProgress() {
    const l = this.level, a = xpForLevel(l), b = xpForLevel(l + 1);
    return (this.xp - a) / (b - a);
  }
  get toNext() { return xpForLevel(this.level + 1) - this.xp; }

  isUnlocked(id) {
    const c = COSMETIC[id];
    return !!c && c.level <= this.level && (!c.friend || (this.stats[c.friend] ?? 0) >= c.jobs);
  }

  /** Add XP. Tells listeners { amount, reason, levelUp: newLevel|null, unlocked: [cosmetics] }. */
  award(amount, reason) {
    if (!amount) return;
    amount = Math.round(amount);
    const before = this.level;
    this.xp += amount;
    this.pending.xp += amount;
    this.changed();
    this.tell({ amount, reason, ...this.levelChange(before) });
  }

  stat(key, n = 1) {
    this.stats[key] = (this.stats[key] ?? 0) + n;
    this.pending.stats[key] = (this.pending.stats[key] ?? 0) + n;
    this.changed();
    for (const fn of this.statListeners) fn(key, n);
  }

  /** stat(), and which things to wear that just won (cosmetics unlocked by this stat): [cosmetic]. */
  statWon(key, n = 1) {
    const prizes = COSMETICS.filter((c) => c.friend === key), had = prizes.filter((c) => this.isUnlocked(c.id));
    this.stat(key, n);
    return prizes.filter((c) => !had.includes(c) && this.isUnlocked(c.id));
  }

  /** Hear about each stat as it's earned on this device: fn(key, n). Returns "stop listening". */
  onStat(fn) { this.statListeners.add(fn); return () => this.statListeners.delete(fn); }

  equip(slot, id) {
    if (id && !this.isUnlocked(id)) return;
    this.look = { ...this.look, [slot]: id };
    this.pending.look = this.look;
    this.changed();
    this.tell({ look: this.look });
  }

  /** The dog's name or breed changed (picked in the lobby). */
  setDog({ name, breed }) {
    if (name) this.pending.name = name;
    if (breed) this.pending.breed = breed;
    this.dog = { name: name ?? this.dog?.name, breed: breed ?? this.dog?.breed };
    this.changed();
  }

  /** This dog has escaped a garden (so on any device it can go straight to the neighbourhood). */
  escapedGarden() {
    this.pending.yardDone = true;
    this.changed();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  tell(e) { for (const fn of this.listeners) fn(e); }
  levelChange(before) {
    const after = this.level;
    return { levelUp: after > before ? after : null, unlocked: after > before ? COSMETICS.filter((c) => c.level > before && c.level <= after) : [] };
  }

  // ---------- the game server ----------

  /**
   * Play as a saved dog (id), or a brand-new one ({ breed, name }). A new dog on a device that
   * earned stars before dogs were saved on the server brings those along. Without a server this
   * quietly does nothing and the game carries on with this device's own progress.
   */
  async useDog({ id = null, breed, name }) {
    try {
      if (id) {
        if (id !== this.id) {
          this.flush(); // anything the previous dog earned goes to the previous dog
          const { profile } = await postJson('/api/profile', { action: 'get', id });
          this.adopt(profile);
        }
        if (breed !== this.dog?.breed || name !== this.dog?.name) this.setDog({ breed, name });
      } else {
        this.flush();
        const from = this.id ? null : { xp: this.xp, stats: this.stats, look: this.look, yardDone: !!(loadSave().yardDone || loadSave().escaped) };
        const { profile } = await postJson('/api/profile', { action: 'create', breed, name, from });
        this.adopt(profile);
      }
    } catch { /* no game server: this device only */ }
  }

  /** On start-up: catch up with anything this dog earned on other devices. */
  async refresh() {
    if (!this.id) return;
    try {
      const { profile } = await postJson('/api/profile', { action: 'get', id: this.id });
      this.adopt(profile, { quiet: true });
      this.sync();
    } catch (e) {
      if (e.status === 404) this.forget(); // that dog isn't saved on this server (any more)
    }
  }

  /** Become this saved dog: its totals from the server, plus anything not sent yet. */
  adopt(profile, { quiet = false } = {}) {
    const before = this.level;
    if (profile.id !== this.id) { this.pending = emptyBatch(); this.inflight = null; }
    this.id = profile.id;
    const unsent = [this.pending, this.inflight].filter(Boolean);
    this.xp = profile.xp + unsent.reduce((s, b) => s + (b.xp || 0), 0);
    this.stats = { ...profile.stats };
    for (const b of unsent) for (const [k, v] of Object.entries(b.stats ?? {})) this.stats[k] = (this.stats[k] ?? 0) + v;
    this.look = this.pending.look ?? this.inflight?.look ?? profile.look ?? blankLook();
    if (profile.yardDone) writeSave({ yardDone: true });
    this.dog = { breed: this.pending.breed ?? profile.breed, name: this.pending.name ?? profile.name };
    writeSave({ profile: this.dog });
    this.save();
    const change = this.levelChange(before);
    this.tell({ look: this.look, synced: true, ...(quiet ? {} : change) });
  }

  /** The server doesn't know this dog: carry on as this device's own (it can be saved again later). */
  forget() {
    this.id = null;
    this.pending = emptyBatch();
    this.inflight = null;
    this.save();
  }

  changed() {
    this.save();
    if (!this.id) return;
    clearTimeout(this.syncT);
    this.syncT = setTimeout(() => this.sync(), 1500);
  }

  /** Send what's been earned since last time (one batch at a time). */
  async sync() {
    if (!this.id || this.syncing) return;
    if (!this.inflight) {
      if (isEmpty(this.pending)) return;
      this.inflight = { sid: batchId(), ...this.pending };
      this.pending = emptyBatch();
      this.save();
    }
    this.syncing = true;
    try {
      const { profile } = await postJson('/api/profile', { action: 'sync', id: this.id, ...this.inflight });
      this.inflight = null;
      this.retry = 2000;
      this.adopt(profile, { quiet: true });
    } catch (e) {
      if (e.status === 404) this.forget();
      else { clearTimeout(this.syncT); this.syncT = setTimeout(() => this.sync(), this.retry); this.retry = Math.min(60000, this.retry * 2); }
    } finally {
      this.syncing = false;
    }
    if (this.id && !isEmpty(this.pending)) this.changed();
  }

  /** The page is being hidden or closed: send everything now (it may not get a reply). */
  flush() {
    if (!this.id) return;
    clearTimeout(this.syncT);
    if (!this.inflight) {
      if (isEmpty(this.pending)) return;
      this.inflight = { sid: batchId(), ...this.pending };
      this.pending = emptyBatch();
      this.save();
    }
    const batch = this.inflight, id = this.id;
    postJson('/api/profile', { action: 'sync', id, ...batch }, { keepalive: true })
      .then(({ profile }) => { if (this.inflight === batch) { this.inflight = null; this.adopt(profile, { quiet: true }); } })
      .catch(() => { /* still saved here as `inflight`: sent again next time, and only counted once */ });
  }
}

export const progress = new Progress();

/** Saved dogs on the game server (null if there isn't one). */
export async function savedDogs() {
  try { return (await getJson('/api/profiles')).profiles ?? []; } catch { return null; }
}
