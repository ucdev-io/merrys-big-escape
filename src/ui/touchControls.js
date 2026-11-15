// On-screen joystick + buttons for phones and tablets. Feeds the same Input object as the keyboard.
export function createTouchControls(input) {
  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.className = 'touch';
  wrap.innerHTML = `
    <div class="stick"><div class="knob"></div></div>
    <div class="buttons">
      <button data-b="jump!" class="jump"><span>🦘</span>Jump</button>
      <button data-b="sniff" data-hold="1"><span>👃</span>Sniff</button>
      <button data-b="dig!"><span>🐾</span>Dig</button>
      <button data-b="bark!"><span>🗣️</span>Woof</button>
      <button data-b="zoom" data-hold="1"><span>💨</span>Zoom</button>
    </div>`;
  hud.appendChild(wrap);

  const show = () => document.body.classList.add('touch-mode');
  if (matchMedia('(pointer: coarse)').matches) show();
  window.addEventListener('touchstart', show, { once: true, passive: true });

  // Joystick: appears wherever the thumb lands on the left side of the screen.
  const stick = wrap.querySelector('.stick'), knob = wrap.querySelector('.knob');
  let stickId = null, cx = 0, cy = 0;
  const R = 55;
  const canvas = document.getElementById('game');
  const onDown = (e) => {
    if (e.pointerType === 'mouse' || stickId !== null || e.clientX > window.innerWidth * 0.55) return;
    stickId = e.pointerId; cx = e.clientX; cy = e.clientY;
    stick.style.left = `${cx}px`; stick.style.top = `${cy}px`;
    stick.classList.add('active');
    move(e);
  };
  const move = (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.touchMove.x = dx / R;
    input.touchMove.y = -dy / R;
    // Push the stick all the way out to start zoomies.
    if (l > R * 1.6) input.touchButtons.add('zoom-stick'); else input.touchButtons.delete('zoom-stick');
  };
  const up = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    input.touchMove.x = input.touchMove.y = 0;
    input.touchButtons.delete('zoom-stick');
    knob.style.transform = '';
    stick.classList.remove('active');
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  for (const b of wrap.querySelectorAll('button')) {
    const name = b.dataset.b, hold = !!b.dataset.hold;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('down');
      input.touchButtons.add(name);
      b.setPointerCapture(e.pointerId);
    });
    const release = () => { b.classList.remove('down'); if (hold) input.touchButtons.delete(name); };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
