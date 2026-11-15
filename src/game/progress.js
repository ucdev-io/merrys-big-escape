import { COSMETICS, COSMETIC, titleFor } from './cosmetics.js';

// Your dog's progress on this device: stars (XP), level, stats and outfit.
// (Step 2 of the roadmap will also keep this on the game server so it follows you around.)

const KEY = 'merry.progress.v1';

/** Total XP needed to reach a level: 40, 120, 240, 400, 600… (each level a bit longer). */
export const xpForLevel = (level) => 20 * level * (level - 1);

class Progress {
  constructor() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* private mode etc. */ }
    this.xp = d.xp ?? 0;
    this.stats = d.stats ?? {};
    this.look = d.look ?? { collar: null, neck: null, hat: null };
    this.listeners = new Set();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ xp: this.xp, stats: this.stats, look: this.look })); } catch { /* ignore */ }
  }

  get level() { let l = 1; while (this.xp >= xpForLevel(l + 1)) l++; return l; }
  get title() { return titleFor(this.level); }
  /** 0..1 progress through the current level. */
  get levelProgress() {
    const l = this.level, a = xpForLevel(l), b = xpForLevel(l + 1);
    return (this.xp - a) / (b - a);
  }
  get toNext() { return xpForLevel(this.level + 1) - this.xp; }

  isUnlocked(id) { return (COSMETIC[id]?.level ?? 999) <= this.level; }

  /** Add XP. Tells listeners { amount, reason, levelUp: newLevel|null, unlocked: [cosmetics] }. */
  award(amount, reason) {
    if (!amount) return;
    const before = this.level;
    this.xp += Math.round(amount);
    const after = this.level;
    const unlocked = after > before ? COSMETICS.filter((c) => c.level > before && c.level <= after) : [];
    this.save();
    for (const fn of this.listeners) fn({ amount, reason, levelUp: after > before ? after : null, unlocked });
  }

  stat(key, n = 1) { this.stats[key] = (this.stats[key] ?? 0) + n; this.save(); }

  equip(slot, id) {
    if (id && !this.isUnlocked(id)) return;
    this.look = { ...this.look, [slot]: id };
    this.save();
    for (const fn of this.listeners) fn({ look: this.look });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const progress = new Progress();
