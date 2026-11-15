// Where the water is.
//   pond: an ellipse with a shelving beach — you wade in, then it gets deep enough to swim.
//   pool: the garden paddling pool — shallow, for splashing about in.
//   stream: a winding line `w` metres either side of its points (the Woods): shelving banks, deep in the middle.
// zones: [{ kind: 'pond', x, z, rx, rz, surface } | { kind: 'pool', x, z, r, surface } | { kind: 'stream', pts: [[x, z]…], w, surface, box }]

const BEACH = 0.22; // how much of the pond's radius is the shelving bit near the edge
const BANK = 0.55;  // how much of a stream's half-width is the shelving bit

/** How far (x, z) is from a stream's middle (Infinity if it's nowhere near). */
function streamDist(w, x, z) {
  const b = w.box;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return Infinity;
  let best = Infinity;
  const p = w.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** @returns {{ zone, depth: number (0 at the edge → 1 deep), surface: number, wade: boolean } | null} */
export function waterAt(zones, x, z) {
  if (!zones) return null;
  for (const w of zones) {
    if (w.kind === 'pond') {
      const e = Math.hypot((x - w.x) / w.rx, (z - w.z) / w.rz);
      if (e < 1) return { zone: w, depth: Math.min(1, (1 - e) / BEACH), surface: w.surface, wade: false };
    } else if (w.kind === 'stream') {
      const d = streamDist(w, x, z);
      if (d < w.w) return { zone: w, depth: Math.min(1, (w.w - d) / (w.w * BANK)), surface: w.surface, wade: false };
    } else if (Math.hypot(x - w.x, z - w.z) < w.r) {
      return { zone: w, depth: 1, surface: w.surface, wade: true };
    }
  }
  return null;
}
