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
