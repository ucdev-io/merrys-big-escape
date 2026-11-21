import { sfx } from '../../core/audio.js';
import { PuzzleSession, solved, prizeLine, howLine, PUZZLES } from './puzzle.js';
import { awardMedal, medalLine } from '../../game/medals.js';

/*
 * 🕹️ Arcade games in the puzzle card: a little canvas game, drawn at 480 × 360 (and scaled to fit, sharp on
 * any screen), with a 3-2-1 start, touch and mouse (tap, drag) and the keyboard. Points: more is better.
 * A game: { info, init(g), step(g, dt) → true when it's over, draw(g, c), down?(g, x, y), move?(g, x, y),
 * key?(g, code, down), tick?(g, dt) (every frame, even after the end: things still falling…) }. g.score is the
 * points; g.t the time since the start.
 */
export const AW = 480, AH = 360;

export function openArcade(ctx, id, game, { onEnd = null } = {}) {
  const S = new PuzzleSession(ctx, { onEnd });
  run(S, id, game);
  return S;
}

function run(S, id, game) {
  const P = PUZZLES[id];
  const page = S.show(`<h1>${P.emoji} ${P.name}</h1>
    <div class="ar-wrap"><canvas class="ar-canvas" width="${AW}" height="${AH}"></canvas></div>
    <p class="small ar-info">${game.info}</p>`, [['Close', () => S.close()]]);
  const cv = page.querySelector('.ar-canvas'), c = cv.getContext('2d');
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const fit = () => { const w = cv.clientWidth || AW; cv.width = Math.round(w * dpr); cv.height = Math.round((w * AH / AW) * dpr); };
  fit();
  const g = { score: 0, t: 0, over: false, said: null, saidT: 0 };
  g.say = (text, secs = 1.2) => { g.said = text; g.saidT = secs; };
  game.init(g);
  let start = 3.2, last = performance.now(), live = true;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * AW, ((e.clientY - b.top) / b.height) * AH]; };
  cv.onpointerdown = (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); if (start <= 0 && !g.over) game.down?.(g, ...at(e)); };
  cv.onpointermove = (e) => { if (start <= 0 && !g.over) game.move?.(g, ...at(e)); };
  const keys = (down) => (e) => {
    if (!live) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    if (start <= 0 && !g.over && !(down && e.repeat)) game.key?.(g, e.code, down);
  };
  const kd = keys(true), ku = keys(false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('resize', fit);
  const stop = () => { live = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', fit); };
  const frame = (now) => {
    if (S.over || !cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (start > 0) {
      const was = Math.ceil(start);
      start -= dt;
      if (Math.ceil(start) !== was && start > 0) sfx.plip?.();
      if (start <= 0) sfx.pop?.();
    }
    if (start <= 0) game.tick?.(g, dt);
    if (start <= 0 && !g.over) {
      g.t += dt;
      g.saidT -= dt;
      if (game.step(g, dt)) { g.over = true; setTimeout(() => { stop(); finish(S, id, game, g.score); }, 900); }
    }
    c.setTransform(cv.width / AW, 0, 0, cv.height / AH, 0, 0);
    game.draw(g, c);
    // Over the top: the score, a word from the game, the count-in.
    c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#3b2b25'; c.font = 'bold 22px "Patrick Hand", "Comic Sans MS", sans-serif';
    c.fillText(`⭐ ${g.score}`, 12, 8);
    if (game.left) { c.textAlign = 'right'; c.fillText(`⏱️ ${Math.max(0, Math.ceil(game.left(g)))}`, AW - 12, 8); }
    if (g.said && g.saidT > 0) { c.textAlign = 'center'; c.font = 'bold 26px "Patrick Hand", "Comic Sans MS", sans-serif'; outline(c, g.said, AW / 2, 46); }
    if (start > 0) { c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 90px "Patrick Hand", "Comic Sans MS", sans-serif'; outline(c, start > 0.5 ? String(Math.ceil(start - 0.2)) : 'Go!', AW / 2, AH / 2); }
    if (g.over) { c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 60px "Patrick Hand", "Comic Sans MS", sans-serif'; outline(c, game.end?.(g) ?? 'Time!', AW / 2, AH / 2); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Big friendly words: dark ink with a pale edge, readable on anything. */
function outline(c, text, x, y) {
  c.lineWidth = 6; c.strokeStyle = '#fffaf0'; c.lineJoin = 'round';
  c.strokeText(text, x, y);
  c.fillStyle = '#3b2b25';
  c.fillText(text, x, y);
}

function finish(S, id, game, score) {
  if (S.over) return;
  const r = solved(id, id, score);
  const P = PUZZLES[id], medal = medalLine(`arcade:${id}`, awardMedal(`arcade:${id}`, { score }));
  S.show(`<h1>${P.emoji} ${score} point${score === 1 ? '' : 's'}!</h1>
    <p>${howLine(r, (n) => `${n} point${n === 1 ? '' : 's'}`)}</p>${medal}${prizeLine(r.prize, r.unlocked)}`,
  [['🔁 Again!', () => run(S, id, game)], ['Close', () => S.close()]]);
}
