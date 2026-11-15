// Things to wear, unlocked by levelling up. slot: collar | neck (bandana) | hat
// boost: extra ⚡ speed / 💨 zoomies points while it's worn (see stats.js).
export const COSMETICS = [
  { id: 'collar-red', slot: 'collar', name: 'Red collar', emoji: '🔴', color: 0xd9534f, level: 2, boost: { speed: 1 } },
  { id: 'bandana-blue', slot: 'neck', name: 'Blue bandana', emoji: '🔷', color: 0x5b86c4, level: 3, boost: { zoomies: 1 } },
  { id: 'hat-party', slot: 'hat', name: 'Party hat', emoji: '🥳', color: 0xf2a0b4, level: 4, boost: { speed: 1, zoomies: 1 } },
  { id: 'collar-gold', slot: 'collar', name: 'Gold collar', emoji: '🟡', color: 0xe0b04a, level: 5, boost: { speed: 2 } },
  { id: 'bandana-red', slot: 'neck', name: 'Red bandana', emoji: '🔺', color: 0xd9534f, level: 6, boost: { zoomies: 2 } },
  { id: 'hat-cap', slot: 'hat', name: 'Baseball cap', emoji: '🧢', color: 0x5b86c4, level: 7, boost: { speed: 2 } },
  { id: 'collar-green', slot: 'collar', name: 'Green collar', emoji: '🟢', color: 0x6f9a52, level: 8, boost: { speed: 1, zoomies: 2 } },
  { id: 'bandana-purple', slot: 'neck', name: 'Purple bandana', emoji: '🟣', color: 0x8e6fb0, level: 9, boost: { zoomies: 3 } },
  { id: 'hat-crown', slot: 'hat', name: 'Crown', emoji: '👑', color: 0xf2c14e, level: 10, boost: { speed: 3 } },
  { id: 'hat-flowers', slot: 'hat', name: 'Flower crown', emoji: '🌸', color: 0x7fae64, level: 12, boost: { zoomies: 3 } },
  { id: 'collar-pink', slot: 'collar', name: 'Pink collar', emoji: '🩷', color: 0xf2a0b4, level: 14, boost: { speed: 3, zoomies: 1 } },
  { id: 'hat-wizard', slot: 'hat', name: 'Wizard hat', emoji: '🧙', color: 0x5a4a9e, level: 18, boost: { speed: 3, zoomies: 3 } },
];
// Thank-you presents from friends: friend = which friend (a stat counting jobs done for them), jobs = how many.
COSMETICS.push(
  { id: 'hat-flatcap', slot: 'hat', name: 'Gus’s flat cap', emoji: '🧢', color: 0x8a7a62, level: 1, friend: 'gus', jobs: 3, boost: { zoomies: 2 } },
  { id: 'neck-bowtie', slot: 'neck', name: 'Duchess’s bow tie', emoji: '🎀', color: 0x5b86c4, level: 1, friend: 'duchess', jobs: 3, style: 'bowtie', boost: { speed: 2 } },
  { id: 'collar-star', slot: 'collar', name: 'Good Neighbour collar', emoji: '⭐', color: 0x4aa3a0, level: 1, friend: 'helped', jobs: 5, boost: { speed: 1, zoomies: 1 } },
);
// For lots of jobs from the 📋 Lost & Found board (see game/town/jobs/): the postman's own cap.
COSMETICS.push(
  { id: 'hat-postie', slot: 'hat', name: 'Postie’s cap', emoji: '📮', color: 0x2f3a52, level: 1, friend: 'helped', jobs: 12, boost: { speed: 2, zoomies: 1 } },
);
// Thank-you presents from the park friends (hint: how to earn one, for the wardrobe).
COSMETICS.push(
  { id: 'hat-acorn', slot: 'hat', name: 'Acorn cap', emoji: '🌰', color: 0x8a5a32, level: 1, friend: 'squirrels', jobs: 3, hint: 'Find Nut & Meg 3 times', boost: { speed: 1, zoomies: 2 } },
  { id: 'neck-daisies', slot: 'neck', name: 'Pepper’s daisy chain', emoji: '🌼', color: 0xfbf7ee, level: 1, friend: 'pepper', jobs: 3, style: 'daisies', hint: 'Walk Pepper to the flowers 3 times', boost: { speed: 1, zoomies: 2 } },
);
// Prizes from games and challenges (hint: how to win one, for the wardrobe).
COSMETICS.push(
  { id: 'collar-champion', slot: 'collar', name: 'Champion collar', emoji: '🏅', color: 0x7a4fb0, level: 1, friend: 'wins', jobs: 5, hint: 'Win 5 games', boost: { speed: 2, zoomies: 1 } },
  { id: 'bandana-gold', slot: 'neck', name: 'Record breaker bandana', emoji: '🏆', color: 0xe8b830, level: 1, friend: 'records', jobs: 1, hint: 'Set a family record', boost: { speed: 1, zoomies: 2 } },
);
// Prizes for cheeky heists (the heists stat: treats pinched and got safely home).
COSMETICS.push(
  { id: 'hat-mask', slot: 'hat', name: 'Robber’s mask', emoji: '🦝', color: 0x2b2b38, level: 1, friend: 'heists', jobs: 5, hint: 'Pull off 5 heists', style: 'mask', boost: { speed: 2, zoomies: 1 } },
);
// 🍂❄️🌸 Seasonal prizes (stats: snowmen built, leaf piles leapt into, conkers found, eggs sniffed out).
COSMETICS.push(
  { id: 'hat-bobble', slot: 'hat', name: 'Bobble hat', emoji: '❄️', color: 0xd9534f, level: 1, friend: 'snowmen', jobs: 3, hint: 'Build 3 snowmen (winter)', boost: { speed: 1, zoomies: 2 } },
  { id: 'hat-leaves', slot: 'hat', name: 'Autumn leaf crown', emoji: '🍂', color: 0xd9893c, level: 1, friend: 'leaves', jobs: 10, hint: 'Leap into 10 leaf piles (autumn)', boost: { speed: 2, zoomies: 1 } },
  { id: 'collar-conker', slot: 'collar', name: 'Conker collar', emoji: '🌰', color: 0x6b3417, level: 1, friend: 'conkers', jobs: 20, hint: 'Find 20 conkers (autumn)', boost: { speed: 2 } },
  { id: 'hat-bunny', slot: 'hat', name: 'Bunny ears', emoji: '🐰', color: 0xf7f3ea, level: 1, friend: 'eggs', jobs: 6, hint: 'Sniff out 6 eggs (spring)', boost: { zoomies: 3 } },
);
export const FRIEND_NAMES = { gus: 'Gus', duchess: 'Duchess', helped: 'the neighbours' };
export const COSMETIC = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const SLOTS = { collar: 'Collar', neck: 'Bandana', hat: 'Hat' };

export const TITLES = [
  [1, 'Pup'], [3, 'Good Dog'], [5, 'Clever Dog'], [8, 'Brave Dog'], [10, 'Top Dog'],
  [15, 'Super Sniffer'], [20, 'Neighbourhood Legend'], [30, 'Legendary Hound'],
];
export const titleFor = (level) => TITLES.filter(([l]) => level >= l).pop()[1];
