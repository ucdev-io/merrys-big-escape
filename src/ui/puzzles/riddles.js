import { sfx } from '../../core/audio.js';
import { buzz } from '../../core/haptics.js';
import { PuzzleSession, solved, prizeLine, howLine } from './puzzle.js';

/**
 * ❓ Pickles' riddles: five riddles a go, three answers to pick from. Pickles is the quizmaster (she thinks
 * she's terribly clever). Fewer wrong is better; every round finished counts as a solved puzzle.
 */
const ROUND = 5;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// [question, the answer, two that aren't]
export const RIDDLES = [
  ['I have bark, but I’m not a dog. I have branches, but I’m not a bank. What am I?', '🌳 A tree', ['🐶 A puppy', '🚗 A car']],
  ['The more of me you make, the more you leave behind. What am I?', '🐾 Footprints', ['🦴 Bones', '🍪 Biscuits']],
  ['I go up and down your street every morning with a bag full of letters. Who am I?', '📮 The postman', ['🦆 A duck', '🐈 Pickles']],
  ['I’m round, I bounce, and every dog in town wants me. What am I?', '🎾 A tennis ball', ['🍕 A pizza', '🌙 The moon']],
  ['What gets wetter the more it dries?', '🧺 A towel', ['💧 A puddle', '🐟 A fish']],
  ['I have lots of keys, but I can’t open a single door. What am I?', '🎹 A piano', ['🔑 A keyring', '🚪 A door']],
  ['What can you catch, but not throw?', '🤧 A cold', ['⚾ A ball', '🐟 A fish']],
  ['I’m full of holes, but I still hold water. What am I?', '🧽 A sponge', ['🪣 A bucket', '🧀 Some cheese']],
  ['Which month do dogs bark the least in?', '📅 February (it’s the shortest!)', ['☀️ August', '🎄 December']],
  ['What has a head and a tail, but no body?', '🪙 A coin', ['🐍 A snake', '🐕 A dog']],
  ['I fly without wings and cry without eyes. What am I?', '☁️ A cloud', ['🐦 A pigeon', '🪁 A kite']],
  ['What do you call a dog who does magic tricks?', '🎩 A Labracadabrador', ['🐩 A poodle-doodle', '🪄 A wizard woof']],
  ['Why did the dog sit in the shade?', '🌭 So it wasn’t a hot dog', ['😴 It was sleepy', '🎾 It lost its ball']],
  ['What has one eye, but can’t see a thing?', '🪡 A needle', ['🐙 An octopus', '🦉 An owl']],
  ['What goes up and up, but never comes down?', '🎂 How old you are', ['🎈 A balloon', '🐿️ A squirrel']],
  ['What has hands, but can’t clap?', '🕰️ A clock', ['🧤 A glove', '🐒 A monkey']],
  ['What kind of dog loves bath time?', '🛁 A shampoodle', ['🌭 A hot dog', '⚓ A sea dog']],
  ['What room has no doors, no windows and no floor?', '🍄 A mushroom', ['🛁 A bathroom', '🏠 A kennel']],
  ['Which dog always knows what time it is?', '⌚ A watchdog', ['🌭 A sausage dog', '🐕 A lapdog']],
  ['What has lots of teeth, but never bites?', '🪮 A comb', ['🦈 A shark', '🐊 A crocodile']],
  ['What runs but never walks, and has a bed but never sleeps?', '🏞️ A river', ['🐕 A dog', '🛏️ A bed']],
  ['What do you call a dog who’s fast asleep?', '🚜 A bull-dozer', ['🍽️ A nap-kin', '🧸 A teddy']],
  ['What starts with T, ends with T, and has T in it?', '🫖 A teapot', ['⛺ A tent', '🍞 Some toast']],
  ['What has four wheels and flies?', '🗑️ A rubbish lorry', ['✈️ An aeroplane', '🦆 A duck']],
  ['I’m light as a feather, but even the strongest dog can’t hold me for long. What am I?', '💨 Your breath', ['🪶 A feather', '🫧 A bubble']],
  ['What has a bottom at the top?', '🦵 Your legs', ['🧢 A cap', '🎩 A top hat']],
  ['What do cats eat for breakfast?', '🐭 Mice Krispies', ['🥣 Cornflakes', '🍳 Eggs']],
  ['What’s black and white and red all over?', '📰 A newspaper (read all over!)', ['🐼 A panda', '🦓 A zebra']],
];

const SAYS = {
  start: ['Right, dog. Five riddles. Use that brain of yours. If you can find it.', 'Riddle time! Try to keep up.', 'I’ve got five riddles. You’ve got one brain. Good luck.'],
  right: ['Hmph. Correct.', 'Lucky guess.', 'Yes. Fine. Well done. Moving on.', 'Correct! …Did someone tell you?'],
  wrong: ['Wrong! It was {answer}. Obviously.', 'Nope! {answer}. Everyone knows that.', 'Ha! It was {answer}. Next!'],
  done: ['Not bad. For a dog.', 'Hmph. You’re cleverer than you smell.', 'That’ll do. Same time tomorrow?'],
  perfect: ['All five?! Who’s been helping you? …Fine. Impressive.', 'Five out of five. I am NOT impressed. (I am a bit.)'],
};

/** Open a round of riddles in the card. ctx: { hud, player }. */
export function openRiddles(ctx, { onEnd = null } = {}) {
  const S = new PuzzleSession(ctx, { onEnd });
  play(S);
  return S;
}

function play(S) {
  const round = shuffle(RIDDLES.slice()).slice(0, ROUND);
  let k = 0, wrong = 0;
  const ask = (line) => {
    const [q, answer, others] = round[k];
    const opts = shuffle([answer, ...others]);
    const page = S.show(`<h1>❓ Riddle ${k + 1} of ${ROUND}</h1>
      <p class="pm-cat"><span class="pm-who">🐈 Pickles:</span> “${esc(line ?? q)}”</p>
      ${line ? `<p class="rd-q">${esc(q)}</p>` : ''}
      <div class="rd-opts">${opts.map((o, i) => `<button class="rd-opt" data-i="${i}">${esc(o)}</button>`).join('')}</div>
      <p class="rd-say small"></p>`, [['Close', () => S.close()]]);
    let answered = false;
    page.querySelector('.rd-opts').onclick = (e) => {
      const b = e.target.closest('.rd-opt');
      if (!b || answered || S.over) return;
      answered = true;
      const got = opts[Number(b.dataset.i)] === answer;
      page.querySelectorAll('.rd-opt').forEach((x, i) => { x.classList.toggle('right', opts[i] === answer); x.disabled = true; });
      if (!got) { b.classList.add('wrong'); wrong++; sfx.plip?.(); } else { sfx.pop?.(); buzz(15); }
      page.querySelector('.rd-say').textContent = `🐈 “${pick(got ? SAYS.right : SAYS.wrong).replace('{answer}', answer.replace(/^\S+\s/, '').replace(/^(A|An|The|Your|Some|How) /, (m) => m.toLowerCase()))}”`;
      const next = document.createElement('button');
      next.className = 'pill big rd-next';
      next.textContent = k + 1 < ROUND ? 'Next riddle ▶' : 'How did I do? ▶';
      next.onclick = () => { if (S.over) return; k++; if (k < ROUND) ask(null); else finish(S, wrong); };
      page.querySelector('.rd-say').after(next);
    };
  };
  sfx.meow?.();
  ask(pick(SAYS.start)); // (the first: Pickles says hello, with the question underneath)
}

function finish(S, wrong) {
  if (S.over) return;
  const right = ROUND - wrong;
  const r = solved('riddles', 'riddles', wrong);
  const line = wrong === 0 ? pick(SAYS.perfect) : pick(SAYS.done);
  S.show(`<h1>❓ ${right} out of ${ROUND}!</h1>
    <p>${howLine(r, (n) => `${ROUND - n} out of ${ROUND}`)}</p>
    <p class="pm-cat"><span class="pm-who">🐈 Pickles:</span> “${esc(line)}”</p>${prizeLine(r.prize, r.unlocked)}`,
  [['🔁 More riddles!', () => play(S)], ['Close', () => S.close()]]);
}
