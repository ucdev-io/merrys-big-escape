// Tiny "2.5D" collision world on the XZ plane: circles and axis-aligned boxes, each with a top
// height. Below the top it's a wall; at or above the top it's something to stand on — unless
// stand is false (fences and hedges: jump over them, but there's no standing on top).
export class Colliders {
  constructor() { this.circles = []; this.boxes = []; }
  circle(x, z, r, top = Infinity, stand = true) { const c = { x, z, r, top, stand }; this.circles.push(c); return c; }
  box(x0, z0, x1, z1, top = Infinity, stand = true) {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), top, stand };
    this.boxes.push(b);
    return b;
  }

  /**
   * Push a circle (p.x, p.z, radius r) out of everything taller than it can step onto. Mutates p.
   * stepUp: things no higher than feet + stepUp are walked onto instead of bumped into.
   */
  resolve(p, r, stepUp = 0.02) {
    const feet = (p.y ?? 0) + stepUp + 0.01; // tolerance so 0.6 + 0.3 counts as 0.9
    for (const c of this.circles) {
      if (feet >= c.top) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-6) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
    for (const b of this.boxes) {
      if (feet >= b.top) continue;
      const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-6) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
        else { // centre inside the box: push out along the shallowest axis
          const pens = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z];
          const i = pens.indexOf(Math.min(...pens));
          if (i === 0) p.x = b.x0 - r; else if (i === 1) p.x = b.x1 + r; else if (i === 2) p.z = b.z0 - r; else p.z = b.z1 + r;
        }
      }
    }
  }

  /**
   * Height of the highest surface under (x, z) that a dog with feet at `feet` can stand on
   * (anything no higher than feet + stepUp). `extra` adds moving platforms, e.g. other dogs' backs.
   */
  surfaceAt(x, z, feet, stepUp = 0.3, extra = null, margin = 0.16, base = 0) {
    // margin: paws reach a little past the dog's centre, so landing on an edge counts.
    // base: the ground itself (below 0 in deep water, where a dog floats instead of standing).
    let best = base;
    const lim = feet + stepUp + 0.01, m = margin;
    for (const c of this.circles) {
      if (c.top === Infinity || c.stand === false || c.top > lim || c.top <= best) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + m) ** 2) best = c.top;
    }
    for (const b of this.boxes) {
      if (b.top === Infinity || b.stand === false || b.top > lim || b.top <= best) continue;
      if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) best = b.top;
    }
    if (extra) for (const c of extra) {
      if (c.top > lim || c.top <= best) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + m) ** 2) best = c.top;
    }
    return best;
  }
}
