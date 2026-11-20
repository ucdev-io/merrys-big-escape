import { waterAt } from '../../world/water.js';

/*
 * 🧭 Finding the way round town on foot, for grown-ups (Doug the dog warden): a coarse grid over the
 * town, with walls, hedges, fences, buildings and water marked off (a dog hops a hedge; a grown-up walks
 * round to the gate). Paths by A*, straightened out wherever there's a clear line. And sight lines:
 * buildings and tall walls block the view, hedges and fences don't.
 *
 * Built once, the first time it's needed (a few milliseconds): the town's colliders don't move.
 */

const CELL = 0.6;          // metres per cell
const WALK = 1, VIEW = 2;  // cell flags: can't walk here · can't see through here
const STEP = 0.36;         // (a grown-up steps over anything lower than this)
const TALL = 1.7;          // (and can't see past anything taller)
const MAX_OPEN = 20000;    // give up on a path after this many cells (and just head straight for it)

export class Nav {
  /** rect: { x0, z0, x1, z1 } to cover. keepOut: rects nobody follows you into (your own garden). */
  constructor(world, rect, keepOut = []) {
    this.x0 = rect.x0; this.z0 = rect.z0;
    this.w = Math.ceil((rect.x1 - rect.x0) / CELL); this.h = Math.ceil((rect.z1 - rect.z0) / CELL);
    const n = this.w * this.h;
    this.f = new Uint8Array(n);
    const R = 0.32; // (his radius: cells this close to a wall are walls too)
    // (A cell's marked when its middle is inside: narrow gaps — a garden gate, a gap in a hedge — stay open,
    // as they are to his feet. Anything thinner than a cell still gets at least the cells it crosses.)
    const mark = (x0, z0, x1, z1, flag) => {
      let i0 = Math.ceil((x0 - this.x0) / CELL - 0.5), i1 = Math.floor((x1 - this.x0) / CELL - 0.5);
      let j0 = Math.ceil((z0 - this.z0) / CELL - 0.5), j1 = Math.floor((z1 - this.z0) / CELL - 0.5);
      if (i1 < i0) i0 = i1 = Math.floor(((x0 + x1) / 2 - this.x0) / CELL);
      if (j1 < j0) j0 = j1 = Math.floor(((z0 + z1) / 2 - this.z0) / CELL);
      i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(this.w - 1, i1); j1 = Math.min(this.h - 1, j1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.f[j * this.w + i] |= flag;
    };
    const C = world.colliders;
    for (const b of C.boxes) {
      if (b.top < STEP) continue;
      mark(b.x0 - R, b.z0 - R, b.x1 + R, b.z1 + R, WALK);
      if (b.top >= TALL) mark(b.x0, b.z0, b.x1, b.z1, VIEW);
    }
    for (const c of C.circles) {
      if (c.top < STEP) continue;
      const r = c.r + R;
      const i0 = Math.floor((c.x - r - this.x0) / CELL), i1 = Math.floor((c.x + r - this.x0) / CELL);
      const j0 = Math.floor((c.z - r - this.z0) / CELL), j1 = Math.floor((c.z + r - this.z0) / CELL);
      for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
        const x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) this.f[j * this.w + i] |= WALK;
      }
    }
    for (const k of keepOut) if (k) mark(k.x0, k.z0, k.x1, k.z1, WALK);
    if (world.water?.length) {
      for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
        if (waterAt(world.water, this.x0 + (i + 0.5) * CELL, this.z0 + (j + 0.5) * CELL)) this.f[j * this.w + i] |= WALK; // (he is NOT getting his boots wet)
      }
    }
    // Which cells join up with the streets (the biggest stretch of walkable cells all joined together)?
    // Some gardens are pockets only a dog can get into (over the fence): never somewhere for him to aim for.
    this.region = new Int32Array(n).fill(-1);
    let label = 0, best = -1, bestN = 0;
    const stack = [];
    for (let c0 = 0; c0 < n; c0++) {
      if (this.region[c0] >= 0 || (this.f[c0] & WALK)) continue;
      let size = 0;
      stack.push(c0); this.region[c0] = label;
      while (stack.length) {
        const c = stack.pop(), i = c % this.w, j = (c - i) / this.w;
        size++;
        if (i > 0 && this.region[c - 1] < 0 && !(this.f[c - 1] & WALK)) { this.region[c - 1] = label; stack.push(c - 1); }
        if (i < this.w - 1 && this.region[c + 1] < 0 && !(this.f[c + 1] & WALK)) { this.region[c + 1] = label; stack.push(c + 1); }
        if (j > 0 && this.region[c - this.w] < 0 && !(this.f[c - this.w] & WALK)) { this.region[c - this.w] = label; stack.push(c - this.w); }
        if (j < this.h - 1 && this.region[c + this.w] < 0 && !(this.f[c + this.w] & WALK)) { this.region[c + this.w] = label; stack.push(c + this.w); }
      }
      if (size > bestN) { bestN = size; best = label; }
      label++;
    }
    this.main = best;
    // A* scratch space (reused: no garbage).
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.shut = new Uint32Array(n);
    this.gen = 0;
    this.heap = new Int32Array(n);
    this.hf = new Float32Array(n);
  }

  cell(x, z) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }
  centre(c) { return { x: this.x0 + ((c % this.w) + 0.5) * CELL, z: this.z0 + (Math.floor(c / this.w) + 0.5) * CELL }; }
  free(c) { return c >= 0 && !(this.f[c] & WALK); }
  /** Walkable and joined up with the streets. */
  reach(c) { return c >= 0 && this.region[c] === this.main; }

  /** Can he walk here? (Off the grid counts as yes: out of town, nothing's marked.) */
  walkable(x, z) { const c = this.cell(x, z); return c < 0 || !(this.f[c] & WALK); }

  /**
   * Is the straight line a → b clear of `flag` (WALK: nothing in the way; VIEW: nothing to block the view)?
   * Walking, it's checked across his width too (either side of the line), so a shortcut never grazes a corner.
   */
  clear(ax, az, bx, bz, flag = WALK) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (CELL * 0.5)));
    const side = flag === WALK && d > 1e-6 ? 0.24 / d : 0, px = -(bz - az) * side, pz = (bx - ax) * side;
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      for (const s of side ? [0, 1, -1] : [0]) {
        const c = this.cell(x + px * s, z + pz * s);
        if (c >= 0 && this.f[c] & flag) return false;
      }
    }
    return true;
  }
  sees(ax, az, bx, bz) { return this.clear(ax, az, bx, bz, VIEW); }

  /** The nearest walkable cell to (x, z) that joins up with the streets, within `r` metres (null if none). */
  nearestFree(x, z, r = 12) {
    if (this.cell(x, z) < 0) { // (off the edge of the grid: the nearest point on it)
      x = Math.min(this.x0 + this.w * CELL - 0.01, Math.max(this.x0 + 0.01, x));
      z = Math.min(this.z0 + this.h * CELL - 0.01, Math.max(this.z0 + 0.01, z));
    }
    const c0 = this.cell(x, z);
    if (this.reach(c0)) return { x, z };
    const ci = c0 % this.w, cj = Math.floor(c0 / this.w), R = Math.ceil(r / CELL);
    let best = null, bd = Infinity;
    for (let ring = 1; ring <= R && !best; ring++) {
      for (let dj = -ring; dj <= ring; dj++) for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h || !this.reach(j * this.w + i)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = j * this.w + i; }
      }
    }
    return best === null ? null : this.centre(best);
  }

  /**
   * A path from a to b: a short list of points to walk to in turn (corners only: the straight bits are
   * straightened out). Null if there's no way there (then: head straight for it, and slide along walls).
   */
  path(ax, az, bx, bz, { careful = false } = {}) {
    let s = this.cell(ax, az);
    const t = this.cell(bx, bz);
    if (s < 0 || t < 0) return null;
    if (!this.reach(s)) { // (in a pocket, or wedged in a hedge: back out to the streets first, then on from there)
      const out = this.nearestFree(ax, az, 6);
      if (!out) return null;
      const rest = this.path(out.x, out.z, bx, bz, { careful });
      return rest ? [out, ...rest] : [out];
    }
    if (!careful && this.clear(ax, az, bx, bz)) return [{ x: bx, z: bz }];
    const W = this.w, g = this.g, from = this.from, seen = this.seen, shut = this.shut, heap = this.heap, hf = this.hf;
    const gen = ++this.gen;
    const ti = t % W, tj = Math.floor(t / W);
    const est = (c) => { const di = Math.abs((c % W) - ti), dj = Math.abs(Math.floor(c / W) - tj); return (Math.max(di, dj) + 0.414 * Math.min(di, dj)) * CELL; };
    let size = 0;
    const push = (c, f) => { let k = size++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; heap[k] = heap[p]; hf[k] = hf[p]; k = p; } heap[k] = c; hf[k] = f; };
    const pop = () => {
      const top = heap[0], lc = heap[--size], lf = hf[size];
      let k = 0;
      for (;;) { let m = 2 * k + 1; if (m >= size) break; if (m + 1 < size && hf[m + 1] < hf[m]) m++; if (hf[m] >= lf) break; heap[k] = heap[m]; hf[k] = hf[m]; k = m; }
      heap[k] = lc; hf[k] = lf;
      return top;
    };
    g[s] = 0; seen[s] = gen; from[s] = -1;
    push(s, est(s));
    let found = false, opened = 0;
    while (size > 0 && opened++ < MAX_OPEN) {
      const c = pop();
      if (shut[c] === gen) continue;
      shut[c] = gen;
      if (c === t) { found = true; break; }
      const ci = c % W, cj = Math.floor(c / W);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= this.h) continue;
        const nc = j * W + i;
        if ((this.f[nc] & WALK) && nc !== t) continue;
        if (di && dj && ((this.f[cj * W + i] & WALK) || (this.f[j * W + ci] & WALK))) continue; // (no cutting corners)
        const ng = g[c] + (di && dj ? 1.414 : 1) * CELL;
        if (seen[nc] === gen && ng >= g[nc]) continue;
        seen[nc] = gen; g[nc] = ng; from[nc] = c;
        push(nc, ng + est(nc));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    // Straighten it out: from each corner, on to the furthest point in plain sight.
    const pts = cells.map((c) => this.centre(c));
    pts[pts.length - 1] = { x: bx, z: bz };
    if (careful) return pts.slice(1); // (every cell's middle, one after another)
    const out = [];
    let at = { x: ax, z: az }, k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (this.clear(at.x, at.z, pts[m].x, pts[m].z)) { far = m; break; }
      out.push(pts[far]);
      at = pts[far];
      k = far;
    }
    return out.length ? out : [{ x: bx, z: bz }];
  }
}
