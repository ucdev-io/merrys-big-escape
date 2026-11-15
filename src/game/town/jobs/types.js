// The kinds of job the 📋 Lost & Found board hands out. Each is a small row of data; the board mixes
// one with a person (who), a thing, a place (where) and maybe a twist, so there's always another job.
// To add a kind: a row here, its sentences in ../../lines/jobs.js (SAY), and (only if it needs a new
// way of finding the thing) a step in ./steps.js.
//
//   step    how the thing is found: lying (out in the open), hidden (sniff it out), buried (sniff, then
//           dig), stuck (up high: jump, or stand on a friend), pickles (woof at the cat), pickup (a
//           delivery waiting somewhere), herd (a runaway to shoo home: no carrying)
//   stars   base reward (distance and twists add more)      level  how tricky (1–3 paws)
//   givers  who asks: house (grown-ups), kid, gus, duchess, baker
//   items   what it could be, per kind of giver (keys from carryables.js / jobItems.js)
//   wheres  where it could be: park, pond, bakery, alley, garden (someone's), street (a pavement), bins
//   twists  which twists suit it (see TWISTS in lines/jobs.js)   team  only with a friend in the pack
//   weight  how often it comes up

export const JOB_TYPES = {
  fetch: {
    emoji: '🔎', step: 'lying', stars: 12, level: 1, weight: 4,
    givers: { house: 6, kid: 4, gus: 1, duchess: 1, baker: 1 },
    items: {
      house: ['slipper', 'sock', 'hat', 'scarf', 'keys', 'teddy', 'newspaper', 'glove'], kid: ['ball', 'frisbee', 'teddy', 'car', 'duck', 'boat', 'squeaky', 'kite'],
      gus: ['slipper', 'stick', 'ball', 'squeaky'], duchess: ['hat', 'scarf'], baker: ['glove', 'keys'],
    },
    wheres: ['park', 'pond', 'bakery', 'alley', 'garden', 'street'],
    twists: ['quiet', 'timer', 'dry', 'clean', 'friend'],
  },
  sniff: {
    emoji: '👃', step: 'hidden', stars: 16, level: 2, weight: 3,
    givers: { house: 5, kid: 4, gus: 1, duchess: 1 },
    items: { house: ['keys', 'sock', 'slipper', 'glove', 'letter'], kid: ['car', 'duck', 'squeaky', 'ball', 'teddy'], gus: ['squeaky', 'slipper'], duchess: ['scarf'] },
    wheres: ['park', 'pond', 'garden', 'alley', 'bakery'],
    twists: ['quiet', 'timer', 'dry', 'clean', 'friend'],
  },
  dig: {
    emoji: '🕳️', step: 'buried', stars: 18, level: 2, weight: 3,
    givers: { house: 4, kid: 4, gus: 2 },
    items: { house: ['keys', 'sock', 'slipper'], kid: ['car', 'duck', 'ball', 'squeaky', 'teddy'], gus: ['bone', 'squeaky', 'ball'] },
    wheres: ['park', 'pond', 'garden'],
    twists: ['quiet', 'timer', 'clean', 'friend'],
  },
  deliver: {
    emoji: '📦', step: 'pickup', stars: 14, level: 1, weight: 3,
    // (who: the person it's for; the board picks who it's from: the postman, the paper boy, the baker or a neighbour)
    givers: { house: 6, kid: 2, gus: 1, duchess: 1 },
    items: { house: ['parcel', 'letter', 'cake', 'newspaper'], kid: ['parcel', 'letter', 'cake'], gus: ['letter', 'cake'], duchess: ['letter', 'parcel'] },
    wheres: [],
    twists: ['quiet', 'timer', 'dry', 'clean', 'friend'],
  },
  high: {
    emoji: '🪁', step: 'stuck', stars: 20, level: 2, weight: 3, reach: 1.0,
    givers: { house: 5, kid: 5, duchess: 1 },
    items: { house: ['hat', 'scarf', 'balloon', 'kite'], kid: ['kite', 'balloon', 'frisbee'], duchess: ['hat', 'scarf'] },
    perches: ['roof', 'lamppost', 'tree'],
    twists: ['quiet', 'timer', 'clean', 'friend'],
  },
  boost: {
    emoji: '🐾', step: 'stuck', stars: 32, level: 3, weight: 3, reach: 1.25, team: true,
    givers: { house: 5, kid: 5, duchess: 1 },
    items: { house: ['hat', 'scarf', 'balloon', 'kite'], kid: ['kite', 'balloon', 'frisbee'], duchess: ['hat', 'scarf'] },
    perches: ['roof', 'lamppost', 'tree'],
    twists: ['quiet', 'timer'],
  },
  herd: {
    emoji: '🐔', step: 'herd', critter: 'hen', stars: 22, level: 3, weight: 2,
    givers: { house: 1 },
    wheres: ['street', 'park', 'garden'],
    twists: ['quiet', 'timer', 'clean', 'friend'],
  },
  football: {
    emoji: '⚽', step: 'herd', critter: 'ball', stars: 18, level: 2, weight: 2,
    givers: { kid: 1 },
    wheres: ['street', 'park'],
    twists: ['quiet', 'timer', 'clean', 'friend'],
  },
  pickles: {
    emoji: '🐈', step: 'pickles', stars: 18, level: 2, weight: 2,
    givers: { house: 6, kid: 3, gus: 1, baker: 1 },
    items: { house: ['wool', 'sock', 'slipper', 'scarf', 'hat', 'keys'], kid: ['teddy', 'sock', 'duck', 'squeaky'], gus: ['slipper', 'squeaky'], baker: ['glove'] },
    wheres: ['bins'],
    twists: ['timer', 'clean', 'friend'],
  },
};

/** Paws for how tricky a job is (shown on the board). */
export const PAWS = ['', '🐾', '🐾🐾', '🐾🐾🐾'];
