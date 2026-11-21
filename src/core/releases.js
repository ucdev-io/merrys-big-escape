/*
 * 🗒️ Merry's Big Escape is in beta: what's new in each version, newest first. The game's title screen (and ☰ → ✨
 * What's new) and Merry's page (site/) both show the latest version, when it came out, and what's in it.
 *
 * A new version: add it at the top (version, date as YYYY-MM-DD, a title, a few short lines a kid can read) and set
 * package.json's "version" to match.
 */

export const CHANNEL = 'Beta';
export const COMING = 'More trips, towns and surprises are on the way!';

export const RELEASES = [
  {
    version: '0.7.0', date: '2026-11-21', title: 'Better together',
    notes: [
      '👥 Go on trips with friends on the same Wi-Fi: see each other down the drain, on Planet Boing, at Wagtail Wonderland and on the Sunny Dolphin. Tap 👥 to follow a friend who’s off on a trip.',
      '✨ Find things together: star-sparks, the Blip kids, Nibbles’ lost things, Captain Poppy’s hat and the ship’s cat count for everyone on the trip.',
      '🎢 Ride with friends: they sit in their own car on the rollercoaster and the dodgems (bump them!), and the carousel and big wheel line up for everyone.',
      '🧹 Little fixes: a clearer arrival in the sewers, the 🐾 button doesn’t say Dig on rides, and coming back from the ship lands you on the jetty, not in the sea.',
    ],
  },
  {
    version: '0.6.0', date: '2026-11-21', title: 'Days out',
    notes: [
      '🎡 Catch the bus to Wagtail Wonderland, the theme park! Ride the Wiggly Woof rollercoaster, the carousel, the big wheel and the helter-skelter, and drive the dodgems. Five rides wins the 🎈 funfair balloon.',
      '🚢 A jetty at the beach: hop in the little boat out to the Sunny Dolphin, a cruise ship! Find Captain Poppy’s hat (for a ⚓ captain’s hat of your own), cannonball into the pool, play fetch, find the ship’s cat and woof at the dolphins.',
    ],
  },
  {
    version: '0.5.0', date: '2026-11-20', title: 'Beam me up!',
    notes: [
      '🛸 A flying saucer hovers over the Farm’s field, with a crop circle underneath. Stand in the middle and up you go… to Planet Boing!',
      '🌙 On Planet Boing everything’s floaty: super-high jumps and bouncy mushrooms. Find five star-sparks to fly Zib’s saucer home (and win the 👽 Space boppers), play hide-and-seek with the Blip kids, and keep Zob’s moon-ball up.',
      '🔦 Bring Nibbles 3 lost things in the sewers for his lantern. It glows, and lights your way down there.',
      '🧱 Prettier sewers: bricks, roots, puddles, sunbeams under the drains and twinkly water.',
      '🔕 Town news waits while you’re off on a trip, and pops up when you’re back.',
      '🚗 Riding on a car? Your friends now see you on a car too, not floating in the air.',
    ],
  },
  {
    version: '0.4.0', date: '2026-11-20', title: 'All aboard!',
    notes: [
      '🚌 A bus stop on the edge of town: catch the bus to other towns, each with its own places to find (and back again any time).',
      '🐈 Pickles has six new games for you, one more each time you finish a puzzle: riddles, catch the treats, a sliding postcard, whack-a-gnome, spot the difference and bone stack!',
    ],
  },
  {
    version: '0.3.4', date: '2026-11-20', title: 'Unstuck',
    notes: [
      '🚐 Doug finds his way back to his van (no more walking into corners after he gives up).',
      '⚽ A football wedged in a corner pops back out after a few nudges, so the job can always be finished.',
    ],
  },
  {
    version: '0.3.3', date: '2026-11-20', title: 'Tidying up',
    notes: [
      '🚐 Doug comes for you even in the middle of a job for a neighbour (and if he catches you, you drop what you’re carrying).',
      '🕳️ The drain says why you can’t go down just now (Pepper can’t come too!), and it’s easier to reach.',
      '🌳 No more trees in the road at the edge of town, and a pavement along the far side of the outer road.',
      '🐈 Pickles sits properly on the fence, and the park paths meet the pavement neatly.',
      '🖌️ A sharper picture on computers (it’s painted bigger, then shrunk to fit).',
      '📱 No more “Oops, something went wrong” about a ResizeObserver on phones (it was harmless).',
    ],
  },
  {
    version: '0.3.2', date: '2026-11-20', title: 'Dig it!',
    notes: [
      '🦴 Lots more buried treasure: sniff out spots in gardens, the park, the woods and the farm, then dig! Bones, marbles, toy soldiers, truffles… and the odd time capsule.',
      '🚗 Hop up onto a car’s bonnet (and on up to the roof) for a ride round town.',
      '🚐 Doug won’t give up while he can see you: get out of sight (zoomies!) to lose him. The pond won’t save you!',
      '😈 Pinching treats from the bakery and the butcher, and chasing the postman, fill the naughty meter too.',
      '🐈 Woof at Pickles for a game of Paw Match (no more pop-ups just from walking past).',
    ],
  },
  {
    version: '0.3.1', date: '2026-11-20', title: 'Wanted!',
    notes: [
      '😈 The naughty meter: every bit of mischief fills it, and it calms down if you behave. Fill it up and… here comes Doug!',
    ],
  },
  {
    version: '0.3.0', date: '2026-11-20', title: 'The great escape',
    notes: [
      '🚐 Doug the dog warden turns up when there’s been too much mischief. Run for it!',
      '🏠 Caught? Sneak out of the Sunny Paws rescue centre, and free the other dogs on your way.',
    ],
  },
  {
    version: '0.2.0', date: '2026-11-20', title: 'Down the drain',
    notes: [
      '🕳️ The sewers: help Nibbles the rat, rescue rubber ducks, and open a shortcut to the beach.',
      '🐾 Dig a tunnel to anywhere in your Sniff Book.',
      '🎮 Challenges on your own: Bone Rush, Zoomies Dash, Pigeon Panic and more.',
      '🧩 Puzzles: Pickles’ Paw Match and postcard jigsaws.',
    ],
  },
  {
    version: '0.1.0', date: '2026-11-19', title: 'First steps',
    notes: ['🌐 The first web demo: the garden, the town, the woods, the farm and the beach.'],
  },
];

export const LATEST = RELEASES[0];
export const VERSION = LATEST.version;
export const UPDATED = LATEST.date;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-11-20' → '20 Nov 2026' (the same everywhere, whatever the time zone). */
export function niceDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Beta 0.3.0 · updated 20 Nov 2026" */
export const versionLine = () => `${CHANNEL} ${VERSION} · updated ${niceDate(UPDATED)}`;

/** The What's new card: the newest few versions and what's coming. */
export function whatsNewHtml(n = 2) {
  return `<h1>✨ What’s new</h1>
    <p class="news-ver">${versionLine()}</p>
    ${RELEASES.slice(0, n).map((r) => `<div class="news"><h3>${r.version} · ${r.title} <small>${niceDate(r.date)}</small></h3><ul>${r.notes.map((t) => `<li>${t}</li>`).join('')}</ul></div>`).join('')}
    <p class="news-coming">🐾 ${COMING}</p>`;
}

// Has this device seen the newest version's notes yet? (A ✨ New! on the title screen until it has.)
const SEEN = 'merry.news.v1';
export function newsUnseen() { try { return localStorage.getItem(SEEN) !== VERSION; } catch { return false; } }
export function markNewsSeen() { try { localStorage.setItem(SEEN, VERSION); } catch { /* private mode */ } }
