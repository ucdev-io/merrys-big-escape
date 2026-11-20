import { RNG } from '../../core/rng.js';
import { planAreas, AREA_EMOJI } from '../areas/areas.js';

// ---- Fun shareable seeds like "SOGGY-WAFFLE-42" -------------------------------------------
const ADJ = ['SOGGY', 'WIGGLY', 'FLUFFY', 'BOUNCY', 'SNIFFY', 'MUDDY', 'SLEEPY', 'GIGGLY', 'CRUNCHY', 'SQUISHY', 'ZOOMY', 'WAGGY', 'SNOOZY', 'FUZZY', 'JOLLY', 'PUDDLY'];
const NOUN = ['WAFFLE', 'BISCUIT', 'NOODLE', 'PUDDLE', 'SAUSAGE', 'TEAPOT', 'MUFFIN', 'PICKLE', 'CRUMPET', 'SOCK', 'PEBBLE', 'BUTTON', 'TURNIP', 'DUMPLING', 'WELLY', 'TEACAKE'];

export function randomSeed() {
  const r = () => Math.floor(Math.random() * 1e9);
  return `${ADJ[r() % ADJ.length]}-${NOUN[r() % NOUN.length]}-${10 + (r() % 90)}`;
}

/** 🚌 The towns the bus goes to from this one: always the same few for a town (its own dice). */
export function neighbourSeeds(seed, n = 3) {
  const rng = new RNG(`bus:${seed}`), out = [];
  while (out.length < n) {
    const s = `${rng.pick(ADJ)}-${rng.pick(NOUN)}-${rng.int(10, 99)}`;
    if (s !== seed && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Turn a seed into a friendly town name: "SOGGY-WAFFLE-42" → "Soggy Waffleton". */
export function townName(seed) {
  const [a = 'Sunny', b = 'Bark'] = seed.split('-');
  const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();
  const ends = ['ton', ' Green', ' Bottom', 'ford', ' on Sea', 'bury'];
  return `${cap(a)} ${cap(b)}${ends[new RNG(seed).int(0, ends.length - 1)]}`;
}

// ---- Layout -----------------------------------------------------------------------------
export const TOWN = {
  N: 4,          // blocks per side
  BLOCK: 30,     // block size (m)
  ROAD: 10,      // road + pavements between blocks (m)
};
TOWN.SIZE = TOWN.N * TOWN.BLOCK + (TOWN.N + 1) * TOWN.ROAD;

const PLACE_NAMES = {
  park: ['Wiggleton Park', 'Puddleford Park', 'Squirrel Park', 'Bouncy Meadow'],
  pond: ['Quackers Pond', 'Splashy Pond', 'Lily Pad Lake', 'Duckweed Pond'],
  bakery: ['Crumbs Street', 'Sausage Row', 'Biscuit Lane', 'Muffin Parade'],
  alley: ['Whiffy Alley', 'Pong Passage', 'Stinky Lane', 'Bin Bag Alley'],
  home: ['Home'],
};
export const PLACE_EMOJI = { park: '🌳', pond: '🦆', bakery: '🥐', alley: '🗑️', home: '🏡', ...AREA_EMOJI };

/** Block centre in world coordinates. */
export function blockCenter(i, j) {
  const s = -TOWN.SIZE / 2 + TOWN.ROAD + TOWN.BLOCK / 2;
  return { x: s + i * (TOWN.BLOCK + TOWN.ROAD), z: s + j * (TOWN.BLOCK + TOWN.ROAD) };
}

/**
 * Pure, deterministic description of a town. Same seed → same town on every device,
 * so multiplayer only needs to share the seed.
 */
export function generateTown(seed) {
  const rng = new RNG(`town:${seed}`);
  const { N } = TOWN;

  // Home sits in one of the four middle blocks; special places go elsewhere.
  const middle = [[1, 1], [1, 2], [2, 1], [2, 2]];
  const [hi, hj] = rng.pick(middle);
  const others = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!(i === hi && j === hj)) others.push([i, j]);
  rng.shuffle(others);

  const blocks = [];
  const add = (i, j, type) => {
    const c = blockCenter(i, j);
    blocks.push({ id: `b${i}${j}`, i, j, x: c.x, z: c.z, type, seed: `${seed}:${i},${j}` });
  };
  add(hi, hj, 'home');
  ['park', 'pond', 'bakery', 'alley'].forEach((type, k) => add(...others[k], type));
  others.slice(4).forEach(([i, j]) => add(i, j, 'houses'));

  // Places to discover (and later: where friends live).
  const places = blocks
    .filter((b) => b.type !== 'houses')
    .map((b) => ({ id: b.type, type: b.type, name: rng.pick(PLACE_NAMES[b.type]), x: b.x, z: b.z, block: b.id }));

  // Merry's house: which corner lot of the home block, and which road it faces.
  const home = blocks.find((b) => b.type === 'home');
  home.homeLot = { qx: rng.pick([-1, 1]), qz: rng.pick([-1, 1]), faceX: rng.chance(0.5) };

  // Out beyond the edge of town: the Woods (see ../areas/). They have their own dice, so nothing above moves.
  const areas = planAreas(seed, townName(seed));
  places.push(...areas.map((a) => a.place));

  return { seed, name: townName(seed), blocks, places, areas };
}
