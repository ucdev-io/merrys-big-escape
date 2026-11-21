import { BURIED, CAPSULES } from './lines/buried.js';
import { TREASURES, BOTTLES } from './lines/beach.js';

/*
 * 🎒 The treasure box: every kind of thing this device has dug up, and the notes it's read. Shown in the
 * Sniff Book (🎒 Treasures) and on the treasure shelf in your own garden (town/shelf.js).
 *   buried   kinds of buried treasure (lines/buried.js): kept under the key the buried treasure always used
 *   beach    kinds of beach find (lines/beach.js)
 *   notes    'capsule:<i>' (a time capsule's note) and 'bottle:<i>' (a message in a bottle)
 */
const KEYS = { buried: 'merry.buried.v1', beach: 'merry.beach.v1', notes: 'merry.notes.v1' };

/** Every buried kind once, in the place it's first listed (a bone turns up everywhere: it's a town find). */
export const BURIED_PLACES = (() => {
  const seen = new Set(), out = [];
  for (const [place, list] of Object.entries(BURIED)) {
    const kinds = list.filter((t) => !seen.has(t.id));
    kinds.forEach((t) => seen.add(t.id));
    out.push({ place, kinds });
  }
  return out;
})();
export const BEACH_KINDS = TREASURES;
export const NOTES = [
  ...CAPSULES.map((text, i) => ({ id: `capsule:${i}`, emoji: '⏳', from: 'A time capsule', text })),
  ...BOTTLES.map((text, i) => ({ id: `bottle:${i}`, emoji: '🍾', from: 'A message in a bottle', text })),
];

const sets = {};
const read = (kind) => {
  if (!sets[kind]) { try { sets[kind] = new Set(JSON.parse(localStorage.getItem(KEYS[kind]) ?? '[]')); } catch { sets[kind] = new Set(); } }
  return sets[kind];
};
const listeners = new Set();

export const collection = {
  has: (kind, id) => read(kind).has(id),
  count: (kind) => read(kind).size,
  /** Found one: true if it's new. */
  add(kind, id) {
    const s = read(kind);
    if (s.has(id)) return false;
    s.add(id);
    try { localStorage.setItem(KEYS[kind], JSON.stringify([...s])); } catch { /* private mode */ }
    for (const fn of listeners) fn(kind, id);
    return true;
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  /** A note to read ('capsule' or 'bottle', from its list): one not read yet if there is one (else from the bag). Kept as read. */
  note(prefix, list, bag) {
    const unread = list.map((t, i) => i).filter((i) => !read('notes').has(`${prefix}:${i}`));
    const text = unread.length ? list[unread[Math.floor(Math.random() * unread.length)]] : bag.next();
    this.add('notes', `${prefix}:${list.indexOf(text)}`);
    return text;
  },
  /** Treasures found / to find, all told (buried kinds + beach kinds). */
  totals() {
    const buried = BURIED_PLACES.flatMap((p) => p.kinds), got = buried.filter((t) => read('buried').has(t.id)).length + BEACH_KINDS.filter((t) => read('beach').has(t.id)).length;
    return { got, all: buried.length + BEACH_KINDS.length };
  },
};

/**
 * 🐾 Friends met, for the Sniff Book: whoever you've helped (or played with) so far, by the stats the game keeps
 * anyway. any: met once any of these stats is above 0; count (or the first of any) says how many times.
 */
export const FRIENDS = [
  { any: ['gus'], emoji: '🐶', name: 'Gus', blurb: 'An old basset hound in the park who keeps losing things.', hint: 'Somebody in the park keeps losing things…', times: 'Helped' },
  { any: ['duchess'], emoji: '🦆', name: 'Duchess', blurb: 'The grandest duck on the pond, with ducklings that wander off.', hint: 'Somebody at the pond is in a flap…', times: 'Helped' },
  { any: ['helped'], emoji: '📋', name: 'The neighbours', blurb: 'Jobs from the Lost & Found board by your gate.', hint: 'There’s a board by your garden gate…', times: 'Jobs done:' },
  { any: ['squirrels'], emoji: '🐿️', name: 'Nut & Meg', blurb: 'Squirrel twins who love hide-and-seek up the park trees.', hint: 'Something rustles up in the park trees…', times: 'Found' },
  { any: ['pepper'], emoji: '🦔', name: 'Pepper', blurb: 'A slow little hedgehog who loves the flowerbeds.', hint: 'A prickly somebody in the park wants a walk…', times: 'Walked' },
  { any: ['puzzles'], emoji: '🐱', name: 'Pickles', blurb: 'The cat on your garden fence, full of puzzles and cheek.', hint: 'Somebody sits on your garden fence…', times: 'Puzzles:' },
  { any: ['heists'], emoji: '🥐', name: 'The baker', blurb: 'She keeps an eye on her stall. Mostly.', hint: 'Something smells delicious on bakery street…', times: 'Heists:' },
  { any: ['warden', 'escapes'], emoji: '🚐', name: 'Doug the dog warden', blurb: 'He comes when the naughty meter fills up. Run!', hint: 'Be very, very naughty and somebody comes…', times: 'Got away' },
  { any: ['badger'], emoji: '🦡', name: 'Brock', blurb: 'A sleepy badger in the woods.', hint: 'Somebody snores in the woods…', times: 'Helped' },
  { any: ['sandy'], emoji: '🛟', name: 'Sandy', blurb: 'The lifeguard at the beach, with her tall chair and whistle.', hint: 'Somebody at the beach could use a hand…', times: 'Helped' },
  { any: ['farmer'], emoji: '👒', name: 'Farmer Mabel', blurb: 'She runs the farm, with her hens, pigs and sheep.', hint: 'Somebody at the farm has jobs to do…', times: 'Helped' },
  { any: ['flock'], emoji: '🐑', name: 'The sheep', blurb: 'They wander. You round them up. Everybody’s happy.', hint: 'Woolly somebodies at the farm need rounding up…', times: 'Rounded up' },
  { any: ['nibbles', 'ducks', 'sluice'], emoji: '🐀', name: 'Nibbles', blurb: 'Runs the Lost Property office down in the sewers.', hint: 'Somebody lives down the drain…', times: 'Lost things back:' },
  { any: ['blips', 'saucer', 'sparks'], emoji: '👽', name: 'Zib & the Blips', blurb: 'Bouncy aliens on Planet Boing.', hint: 'Look up over the farm one day…', times: 'Blips found:' },
  { any: ['captain', 'luggage', 'whiskers', 'fetch', 'dolphins'], emoji: '⚓', name: 'Captain Poppy’s crew', blurb: 'Everybody on the Sunny Dolphin: the captain, Mrs Pemberton, Grandad Ted, Admiral Whiskers…', hint: 'A big ship sails from the beach jetty…', times: 'Lost things found:', count: 'luggage' },
  { any: ['freed', 'escapes'], emoji: '🏠', name: 'The dogs at Sunny Paws', blurb: 'Dogs waiting in the pound, hoping somebody lets them out.', hint: 'Doug takes naughty dogs somewhere…', times: 'Set free:', count: 'freed' },
  { any: ['agility', 'tricks', 'seek', 'catches', 'rosettes'], emoji: '🏆', name: 'The Big Dog Show', blurb: 'The judge, Ruby and her frisbees, and dogs from all over town.', hint: 'Something’s on at the showground… (a day out by bus)', times: 'Rosettes:', count: 'rosettes' },
  { any: ['dogsmet'], emoji: '🐕', name: 'Dogs out for a walk', blurb: 'The dogs being walked round the blocks.', hint: 'Dogs walk round the town with their people…', times: 'Said hello' },
];
