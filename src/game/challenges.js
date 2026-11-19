// Games and challenges, shared by the game and the server (which keeps score and the pack records).
//
//   rank   how results compare on the 🏆 pack records: 'score' (most), 'time' (quickest) or 'team'
//          (most, then quickest: one entry for the whole pack). None: no records (every race goes
//          somewhere different).
//   board  'all' = one board for every neighbourhood; 'town' = each neighbourhood has its own (its
//          own course, or its own pond).
//   min    dogs needed to play (everything else works on your own too).
export const CHALLENGES = {
  race: { emoji: '🏁', name: 'Race', blurb: 'First to the flag wins!', solo: 'Beat your best time', secs: 120 },
  dash: { emoji: '⚡', name: 'Zoomies Dash', blurb: 'Zoom through every hoop, in order.', solo: 'Beat the clock', secs: 150, rank: 'time', board: 'town', hoops: 8 },
  bones: { emoji: '🦴', name: 'Bone Rush', blurb: 'Grab the most bones in 2 minutes.', solo: 'How many can you get?', secs: 120, rank: 'score', unit: 'bones', board: 'all', count: 24 },
  pigeons: { emoji: '🐦', name: 'Pigeon Panic', blurb: 'Scare the most pigeons into the air.', solo: 'How many can you scare?', secs: 90, rank: 'score', unit: 'pigeons', board: 'all' },
  ducks: { emoji: '🦆', name: 'Duck Round-Up', blurb: 'Team up to herd the ducks into the pond.', solo: 'Can you do it on your own?', secs: 180, rank: 'team', unit: 'ducks', board: 'town', coop: true, count: 6 },
  tag: { emoji: '🐾', name: 'Tag', blurb: 'Tag someone to pass on the red ring.', solo: 'Needs a friend', secs: 90, rank: 'score', unit: 'tags', board: 'all', min: 2 },
};
export const CHALLENGE_IDS = Object.keys(CHALLENGES);

/** Which records board a result goes on. */
export const boardKey = (kind, town) => (CHALLENGES[kind]?.board === 'town' ? `${kind}:${town}` : kind);

/** Is result a better than b? ({ score } / { ms } / { score, ms }) */
export function better(kind, a, b) {
  if (!b) return true;
  const r = CHALLENGES[kind]?.rank;
  if (r === 'time') return a.ms < b.ms;
  if (r === 'team') return a.score > b.score || (a.score === b.score && a.ms < b.ms);
  return a.score > b.score;
}

/** A result as words: "18 bones", "1:23.4", "6 ducks in 1:42". */
export function scoreText(kind, e) {
  const C = CHALLENGES[kind];
  const time = (ms) => { const s = ms / 1000; return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`; };
  if (C?.rank === 'time') return time(e.ms);
  if (C?.rank === 'team') return e.score >= (C.count ?? 0) ? `all ${e.score} in ${time(e.ms)}` : `${e.score} ${C.unit}`;
  return `${e.score} ${e.score === 1 ? C?.unit.replace(/s$/, '') : C?.unit}`;
}
