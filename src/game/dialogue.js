// Tiny dialogue engine: big pools of lines that never repeat until they've all been used,
// templates that fill in names/breeds/random silly words, and cooldowns per situation so
// characters chat often but never spam.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Hands out items in a shuffled order; reshuffles when empty, never the same one twice in a row. */
export class LineBag {
  constructor(items) { this.items = items.slice(); this.queue = []; this.last = null; }
  next() {
    if (!this.items.length) return null;
    if (!this.queue.length) {
      this.queue = this.items.slice();
      for (let i = this.queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]; }
      if (this.queue.length > 1 && this.queue[this.queue.length - 1] === this.last) this.queue.unshift(this.queue.pop());
    }
    this.last = this.queue.pop();
    return this.last;
  }
}

/**
 * Fill a template. {name} {breed} {Breed} come from vars (HTML-escaped: names are typed by players);
 * {word} picks from words[word] (e.g. {thing}, {smell}). Functions are called with vars.
 */
export function fill(line, vars = {}, words = {}) {
  if (typeof line === 'function') line = line(vars);
  return line.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'breed') return esc(String(vars.breed ?? 'dog').toLowerCase());
    if (k === 'Breed') return esc(vars.breed ?? 'Dog');
    if (vars[k] !== undefined) return esc(vars[k]);
    if (words[k]) return pickOne(words[k]);
    return m;
  });
}

/**
 * A character's voice. pools: { situation: [lines…] }, words: { slot: [words…] }.
 * say() returns a filled line, or null if that situation (or the voice as a whole) is cooling down.
 */
export class Voice {
  constructor(pools, words = {}, { gap = 5 } = {}) {
    this.bags = Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, new LineBag(v)]));
    this.words = words;
    this.gap = gap;
    this.cool = {};
    this.lastAt = -Infinity;
  }

  has(situation) { return !!this.bags[situation]; }

  /** @param opts.cooldown seconds before this situation may speak again; opts.force ignores cooldowns */
  say(situation, vars = {}, { cooldown = 0, force = false, now = performance.now() / 1000 } = {}) {
    const bag = this.bags[situation];
    if (!bag) return null;
    if (!force && (now - this.lastAt < this.gap || (this.cool[situation] ?? 0) > now)) return null;
    this.cool[situation] = now + cooldown;
    this.lastAt = now;
    return fill(bag.next(), vars, this.words);
  }
}
