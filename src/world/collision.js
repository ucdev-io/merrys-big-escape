// Tiny 2D collision world on the XZ plane: circles and axis-aligned boxes.
export class Colliders {
  constructor() { this.circles = []; this.boxes = []; }
  circle(x, z, r) { this.circles.push({ x, z, r }); }
  box(x0, z0, x1, z1) { this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); }
  /** Push a circle (p.x, p.z, radius r) out of everything. Mutates p. */
  resolve(p, r) {
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-6) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
    for (const b of this.boxes) {
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
}
