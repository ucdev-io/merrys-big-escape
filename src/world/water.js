// Where the water is.
//   pond: an ellipse with a shelving beach — you wade in, then it gets deep enough to swim.
//   pool: the garden paddling pool — shallow, for splashing about in.
// zones: [{ kind: 'pond', x, z, rx, rz, surface } | { kind: 'pool', x, z, r, surface }]

const BEACH = 0.22; // how much of the pond's radius is the shelving bit near the edge

/** @returns {{ zone, depth: number (0 at the edge → 1 deep), surface: number, wade: boolean } | null} */
export function waterAt(zones, x, z) {
  if (!zones) return null;
  for (const w of zones) {
    if (w.kind === 'pond') {
      const e = Math.hypot((x - w.x) / w.rx, (z - w.z) / w.rz);
      if (e < 1) return { zone: w, depth: Math.min(1, (1 - e) / BEACH), surface: w.surface, wade: false };
    } else if (Math.hypot(x - w.x, z - w.z) < w.r) {
      return { zone: w, depth: 1, surface: w.surface, wade: true };
    }
  }
  return null;
}
