// Keyboard input (touch controls plug into the same state in a later phase).
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.touchMove = { x: 0, y: 0 };
    this.touchButtons = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  /** Movement intent: x = right, y = forward, length ≤ 1. */
  move() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    x += this.touchMove.x; y += this.touchMove.y;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
  get sniff() { return this.down('KeyF') || this.touchButtons.has('sniff'); }
  get jump() { return this.hit('Space') || this.touchButtons.has('jump!'); }
  get sprint() { return this.down('ShiftLeft', 'ShiftRight') || this.touchButtons.has('zoom') || this.touchButtons.has('zoom-stick'); }
  get dig() { return this.hit('KeyE') || this.touchButtons.has('dig!'); }
  get bark() { return this.hit('KeyQ') || this.touchButtons.has('bark!'); }
  endFrame() {
    this.pressed.clear();
    for (const b of [...this.touchButtons]) if (b.endsWith('!')) this.touchButtons.delete(b);
  }
}
