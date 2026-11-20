import { sfx } from '../../core/audio.js';
import { fsfx } from '../../core/friendSounds.js';
import { buzz } from '../../core/haptics.js';
import { PuzzleSession, puzzleSave, solved, prizeLine } from './puzzle.js';

/**
 * 🐾 Pickles' Paw Match: a memory game of smells. Twelve cards face down, two of each smell: turn over two
 * at a time to find the pairs. Pickles (the smug ginger cat) watches, and has opinions. Fewer goes is better.
 */
const SMELLS = [
  ['🧀', 'cheese'], ['🦴', 'bone'], ['🌸', 'flowers'], ['🍕', 'pizza'], ['🐟', 'fish'], ['🧦', 'sock'],
  ['🌭', 'sausage'], ['🍪', 'biscuit'], ['🥕', 'carrot'], ['🍓', 'strawberry'], ['🧼', 'soap'], ['🌲', 'pine tree'],
];
const PAIRS = 6;

// Pickles' running commentary (she's a cat: she's not going to be nice about it).
const SAYS = {
  start: ['Six smells, two of each. Even a dog can manage that. Probably.', 'Let’s see that famous nose, then.', 'I’ll be timing you. Well, counting. Same thing.'],
  miss: ['Nope.', 'Pfft. Not even close.', 'Are you sniffing with your eyes shut?', 'That’s two different smells, dog.', 'Hmm. No.', 'Try remembering. It helps.'],
  match: ['Hmph. Lucky.', 'Fine. That one counts.', 'Beginner’s luck.', 'Even a dog finds a bone now and then.'],
  done: ['…Alright. That was actually quite good. For a dog.', 'Hmph. I suppose that’ll do.', 'Don’t let it go to your head.'],
  best: ['WHAT. How did you— never mind. Well done. Ugh.', 'Fine! A new best. I wasn’t watching anyway.'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Open the game in the card. ctx: { hud, player }; opts.onEnd: when the puzzle's put away. */
export function openPawMatch(ctx, { onEnd = null } = {}) {
  const S = new PuzzleSession(ctx, { onEnd });
  play(S);
  return S;
}

function play(S) {
  const smells = shuffle(SMELLS.slice()).slice(0, PAIRS);
  const deck = shuffle([...smells, ...smells].map(([emoji, name], i) => ({ i, emoji, name, up: false, done: false })));
  const best = puzzleSave.best('pawmatch');
  const page = S.show(`<h1>🐾 Paw Match</h1>
    <p class="pm-cat"><span class="pm-who">🐈 Pickles:</span> <span class="pm-say"></span></p>
    <div class="pm-grid">${deck.map((c, k) => `<button class="pm-card" data-k="${k}" aria-label="A card"><span class="pm-back">👃</span><span class="pm-face">${c.emoji}<small>${c.name}</small></span></button>`).join('')}</div>
    <p class="pm-moves small">Goes: <b>0</b>${best ? ` · your best: ${best}` : ''}</p>`, [['Close', () => S.close()]]);
  const say = (line) => { page.querySelector('.pm-say').textContent = `“${line}”`; };
  say(pick(SAYS.start));
  sfx.meow?.();
  const buttons = [...page.querySelectorAll('.pm-card')];
  let first = null, busy = false, moves = 0, found = 0, misses = 0;
  const show = (k, up) => { deck[k].up = up; buttons[k].classList.toggle('up', up); };
  page.querySelector('.pm-grid').onclick = (e) => {
    const b = e.target.closest('.pm-card');
    if (!b || busy || S.over) return;
    const k = Number(b.dataset.k), c = deck[k];
    if (c.up || c.done) return;
    show(k, true);
    sfx.plip?.();
    if (first === null) { first = k; return; }
    // The second card of the go.
    moves++;
    page.querySelector('.pm-moves b').textContent = moves;
    const a = deck[first];
    if (a.emoji === c.emoji) {
      a.done = c.done = true;
      buttons[first].classList.add('done');
      b.classList.add('done');
      first = null;
      found++;
      sfx.pop?.();
      buzz(20);
      if (found >= PAIRS) { setTimeout(() => finish(S, moves), 650); return; }
      if (Math.random() < 0.5) say(pick(SAYS.match));
    } else {
      busy = true;
      misses++;
      if (misses % 2 === 1) { say(pick(SAYS.miss)); fsfx.hmph?.(0.6); }
      const k0 = first;
      first = null;
      setTimeout(() => { if (S.over) return; show(k0, false); show(k, false); busy = false; }, 850);
    }
  };
}

function finish(S, moves) {
  if (S.over) return;
  const r = solved('pawmatch', 'pawmatch', moves);
  const line = r.newBest && r.prev !== null ? pick(SAYS.best) : pick(SAYS.done);
  const how = r.newBest
    ? r.prev !== null ? `🎉 A new best! (It was ${r.prev}.)` : 'Your first go: now try to beat it!'
    : `Your best is ${r.best} goes.`;
  S.show(`<h1>🐾 All ${PAIRS} pairs!</h1><p>You did it in <b>${moves}</b> goes. ${how}</p>
    <p class="pm-cat"><span class="pm-who">🐈 Pickles:</span> “${line}”</p>${prizeLine(r.prize)}`,
  [['🔁 Again!', () => play(S)], ['Close', () => S.close()]]);
}
