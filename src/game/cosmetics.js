// Things to wear, unlocked by levelling up. slot: collar | neck (bandana) | hat
export const COSMETICS = [
  { id: 'collar-red', slot: 'collar', name: 'Red collar', emoji: '🔴', color: 0xd9534f, level: 2 },
  { id: 'bandana-blue', slot: 'neck', name: 'Blue bandana', emoji: '🔷', color: 0x5b86c4, level: 3 },
  { id: 'hat-party', slot: 'hat', name: 'Party hat', emoji: '🥳', color: 0xf2a0b4, level: 4 },
  { id: 'collar-gold', slot: 'collar', name: 'Gold collar', emoji: '🟡', color: 0xe0b04a, level: 5 },
  { id: 'bandana-red', slot: 'neck', name: 'Red bandana', emoji: '🔺', color: 0xd9534f, level: 6 },
  { id: 'hat-cap', slot: 'hat', name: 'Baseball cap', emoji: '🧢', color: 0x5b86c4, level: 7 },
  { id: 'collar-green', slot: 'collar', name: 'Green collar', emoji: '🟢', color: 0x6f9a52, level: 8 },
  { id: 'bandana-purple', slot: 'neck', name: 'Purple bandana', emoji: '🟣', color: 0x8e6fb0, level: 9 },
  { id: 'hat-crown', slot: 'hat', name: 'Crown', emoji: '👑', color: 0xf2c14e, level: 10 },
  { id: 'hat-flowers', slot: 'hat', name: 'Flower crown', emoji: '🌸', color: 0x7fae64, level: 12 },
  { id: 'collar-pink', slot: 'collar', name: 'Pink collar', emoji: '🩷', color: 0xf2a0b4, level: 14 },
  { id: 'hat-wizard', slot: 'hat', name: 'Wizard hat', emoji: '🧙', color: 0x5a4a9e, level: 18 },
];
export const COSMETIC = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const SLOTS = { collar: 'Collar', neck: 'Bandana', hat: 'Hat' };

export const TITLES = [
  [1, 'Pup'], [3, 'Good Dog'], [5, 'Clever Dog'], [8, 'Brave Dog'], [10, 'Top Dog'],
  [15, 'Super Sniffer'], [20, 'Neighbourhood Legend'], [30, 'Legendary Hound'],
];
export const titleFor = (level) => TITLES.filter(([l]) => level >= l).pop()[1];
