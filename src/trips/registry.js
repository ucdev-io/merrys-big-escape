/*
 * 🧳 Trips: little places of their own, away from the town (down a drain, into the dog pound…). Each is
 * loaded only when a dog first goes there (its own small download), built into a scene of its own while
 * the town waits, paused, and thrown away again on the way back. See ./manager.js.
 *
 * n: the trip's number (1–15), which friends' devices are told while a dog is away on it (and which sets
 * where it's built: far off, so nothing in town ever thinks the dog is nearby). load(): the trip's module.
 */
export const TRIPS = {
  box: { n: 1, emoji: '📦', name: 'The Test Box', load: () => import('./box/index.js'), test: true },
  sewer: { n: 2, emoji: '🕳️', name: 'The Sewers', load: () => import('./sewer/index.js'), away: 'went down a drain!' },
  pound: { n: 3, emoji: '🚐', name: 'Sunny Paws', load: () => import('./pound/index.js'), away: 'got scooped up by the dog warden!' },
  ufo: { n: 4, emoji: '🛸', name: 'Planet Boing', load: () => import('./ufo/index.js'), away: 'got beamed up by a flying saucer!' },
  cruise: { n: 6, emoji: '🚢', name: 'The Sunny Dolphin', load: () => import('./cruise/index.js'), away: 'sailed off on a cruise ship!' },
};

/** The trip with this number (from a friend's state), or null. */
export const tripByN = (n) => Object.entries(TRIPS).find(([, t]) => t.n === n)?.[1] ?? null;

/** Where a trip is built: its own patch of the world, a long way from the town (x 1300, 1600…). */
export const tripOrigin = (n) => ({ x: 1000 + 300 * n, z: 0 });
