// Thank-yous for everyone whose work is in the game: shown on Merry's page (the last stop, "Thanks & credits")
// and listed in public/sfx/CREDITS.md.

/**
 * The recorded sounds (public/sfx), all CC0 from freesound.org: free for anyone to use, no credit needed, but they
 * deserve a thank-you. [file, what it's for, the recording's title, its freesound id, who recorded it]
 */
export const SOUNDS = [
  ['bark-big-1', 'woofs', "Single Dog Bark", 277058, 'kwahmah_02'],
  ['bark-big-2', 'woofs', "Barking 1", 420450, 'Mrthenoronha'],
  ['bark-mid', 'woofs', "Single bark of a dog", 535457, 'exe2be'],
  ['bark-small-1', 'woofs', "Single Dog Bark (King Charles Spaniel)", 502655, 'JovianSounds'],
  ['bark-small-2', 'woofs', "rose_bark", 100032, 'nfrae'],
  ['bark-tiny', 'woofs', "Tiny Dog Bark", 813120, 'qubodup'],
  ['howl', 'the howl', "Puppy (8)", 728029, 'johnnypanic'],
  ['dig-1', 'digging', "Digging in wet course sand (2)", 651293, 'f3bbbo'],
  ['dig-2', 'digging', "Dig wet sand-04", 349459, 'RUncELL'],
  ['scratch', 'digging', "dog - scratch at door - front 02", 398728, 'Anthousai'],
  ['shake', 'the shake', "Dog shake", 505822, 'jedg'],
  ['puddle-1', 'puddles', "Splash", 398032, 'swordofkings128'],
  ['puddle-2', 'puddles', "Tiny Splash", 321490, 'dslrguide'],
  ['splash-1', 'big splashes', "Watersplash", 469608, 'Sheyvan'],
  ['splash-2', 'big splashes', "Big Splash", 316744, 'Bird_man'],
  ['chomp-1', 'snacks', "dog - eat - treat - grab", 398730, 'Anthousai'],
  ['chomp-2', 'snacks', "Crunch", 348112, 'LilMati'],
  ['chomp-3', 'snacks', "Crunch", 528962, 'steenish'],
  ['chomp-4', 'snacks', "carrotnom", 106392, 'j1987'],
  ['squeak-1', 'squeaky toys', "*squeak*", 722772, 'Froey_'],
  ['squeak-2', 'squeaky toys', "Squeaky Toy #1", 468443, 'Breviceps'],
  ['wave', 'waves', "Water wave Beach Field-recording 200815_0036", 530699, 'szegvari'],
  ['gull-1', 'gulls', "Seagull single call", 263786, 'steaq'],
  ['gull-2', 'gulls', "Seagull trill and whine", 75195, 'nigelcoop'],
];

export const soundPage = (id, by) => `https://freesound.org/people/${by}/sounds/${id}/`;

/** Code and fonts: [name, link, licence]. */
export const TOOLS = [
  ['three.js', 'https://threejs.org', 'MIT'],
  ['Vite', 'https://vite.dev', 'MIT'],
  ['Patrick Hand, a font by Patrick Wagesreiter', 'https://fonts.google.com/specimen/Patrick+Hand', 'SIL Open Font Licence'],
  ['ws', 'https://github.com/websockets/ws', 'MIT'],
  ['node-qrcode', 'https://github.com/soldair/node-qrcode', 'MIT'],
  ['lil-gui', 'https://lil-gui.georgealways.com', 'MIT'],
];
