/*
 * 🌌 The sky behind Dog Star: Canis Major, the Big Dog, drawn from where its stars really are (right ascension
 * and declination, squashed flat). Each wave you clear lights one more of them, and the tenth is Sirius itself:
 * the Dog Star, the brightest star in the night sky. Light it and the Big Dog is whole.
 *
 * x: east to the left, as on a star map; y: north up. In degrees across the sky, roughly, centred on the dog.
 */
export const STARS = [
  { id: 'furud', name: 'Furud', x: 7.35, y: 30.06, mag: 3.0 },
  { id: 'adhara', name: 'Adhara', x: -1.53, y: 28.97, mag: 1.5 },
  { id: 'aludra', name: 'Aludra', x: -7.45, y: 29.3, mag: 2.45 },
  { id: 'wezen', name: 'Wezen', x: -3.8, y: 26.39, mag: 1.83 },
  { id: 'omicron', name: 'Omicron', x: -2.55, y: 23.83, mag: 3.0 },
  { id: 'mirzam', name: 'Mirzam', x: 6.8, y: 17.96, mag: 1.98 },
  { id: 'theta', name: 'Theta', x: -0.51, y: 12.04, mag: 4.1 },
  { id: 'muliphein', name: 'Muliphein', x: -2.74, y: 15.63, mag: 4.1 },
  { id: 'iota', name: 'Iota', x: -0.95, y: 17.05, mag: 4.4 },
  { id: 'sirius', name: 'Sirius', x: 1.6, y: 16.72, mag: -1.46 }, // (last of all: the Dog Star)
];
/** The stick-figure dog: nose and head up top, Mirzam a front paw, Wezen the hips, Aludra the tail. */
export const LINES = [
  ['theta', 'iota'], ['muliphein', 'iota'], ['theta', 'muliphein'], ['iota', 'sirius'], ['sirius', 'mirzam'],
  ['sirius', 'omicron'], ['omicron', 'wezen'], ['wezen', 'aludra'], ['wezen', 'adhara'], ['adhara', 'furud'],
];
export const SIRIUS = STARS.length;

const byId = Object.fromEntries(STARS.map((s, i) => [s.id, i]));
export const LINE_IDX = LINES.map(([a, b]) => [byId[a], byId[b]]);

/** Where each star goes on a field W × H (world units): the dog fills the middle, a little smaller on a narrow screen. */
export function placeStars(W, H) {
  const xs = STARS.map((s) => s.x), ys = STARS.map((s) => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((W * 0.62) / (x1 - x0), (H * 0.62) / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return STARS.map((s) => ({ ...s, px: W / 2 + (s.x - cx) * k, py: H / 2 + (s.y - cy) * k }));
}

/** Plain twinkly stars, three layers deep (the far ones drift least as you fly). */
export function makeStarfield(W, H, n = 140) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const depth = i % 3; // 0 far … 2 near
    out.push({ x: Math.random() * W, y: Math.random() * H, depth, size: 0.6 + depth * 0.45 + Math.random() * 0.4, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 2 });
  }
  return out;
}
