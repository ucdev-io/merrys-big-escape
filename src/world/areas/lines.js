// Little helpers for lines on the ground (lanes, paths, streams) in an area's (u, v) frame. Plain maths.

/** A smooth (Catmull-Rom) line through pts, as points about `step` apart. */
export function spline(pts, step = 0.5) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** Shortest distance from (u, v) to a polyline. */
export function distTo(poly, u, v) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / l2)) : 0;
    const d = Math.hypot(u - ax - dx * t, v - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

/** The point `t` (0..1) of the way along a polyline, by length. */
export function along(poly, t) {
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) total += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
  let left = total * t;
  for (let i = 0; i < poly.length - 1; i++) {
    const l = Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
    if (left <= l && l > 0) return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * (left / l), poly[i][1] + (poly[i + 1][1] - poly[i][1]) * (left / l)];
    left -= l;
  }
  return poly[poly.length - 1].slice();
}

