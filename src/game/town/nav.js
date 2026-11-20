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
const MAX_OPEN = 9000;     // give up on a path after this many cells (and just head straight for it)

export class Nav {
  /** rect: { x0, z0, x1, z1 } to cover. keepOut: rects nobody follows you into (your own garden). */
  constructor(world, rect, keepOut = []) {
    this.x0 = rect.x0; this.z0 = rect.z0;
    this.w = Math.ceil((rect.x1 - rect.x0) / CELL); this.h = Math.ceil((rect.z1 - rect.z0) / CELL);
    const n = this.w * this.h;
    this.f = new Uint8Array(n);
    const R = 0.32; // (his radius: cells this close to a wall are walls too)
    const mark = (x0, z0, x1, z1, flag) => {
      const i0 = Math.max(0, Math.floor((x0 - this.x0) / CELL)), i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((z0 - this.z0) / CELL)), j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / CELL));
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

  /** Can he walk here? (Off the grid counts as yes: out of town, nothing's marked.) */
  walkable(x, z) { const c = this.cell(x, z); return c < 0 || !(this.f[c] & WALK); }

  /** Is the straight line a → b clear of `flag` (WALK: nothing in the way; VIEW: nothing to block the view)? */
  clear(ax, az, bx, bz, flag = WALK) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (CELL * 0.5)));
    for (let k = 1; k < n; k++) {
      const c = this.cell(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      if (c >= 0 && this.f[c] & flag) return false;
    }
    return true;
  }
  sees(ax, az, bx, bz) { return this.clear(ax, az, bx, bz, VIEW); }

  /** The nearest walkable cell to (x, z), within `r` metres (null if there isn't one). */
  nearestFree(x, z, r = 12) {
    const c0 = this.cell(x, z);
    if (c0 < 0 || this.free(c0)) return { x, z };
    const ci = c0 % this.w, cj = Math.floor(c0 / this.w), R = Math.ceil(r / CELL);
    let best = null, bd = Infinity;
    for (let ring = 1; ring <= R && !best; ring++) {
      for (let dj = -ring; dj <= ring; dj++) for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h || (this.f[j * this.w + i] & WALK)) continue;
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
  path(ax, az, bx, bz) {
    const s = this.cell(ax, az), t = this.cell(bx, bz);
    if (s < 0 || t < 0) return null;
    if (this.clear(ax, az, bx, bz)) return [{ x: bx, z: bz }];
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
