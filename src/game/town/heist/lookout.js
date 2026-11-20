import * as THREE from 'three';

const GRACE = 0.35;  // seconds into a look before they've turned round and can actually see you
const SHOW = 30;     // how near you need to be to see what they're up to (metres)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3();

/** Arms at work, w seconds in: [right x, right z, left x, left z]. */
function workPose(work, w) {
  if (work === 'knead') return [-1.15 + Math.sin(w * 7) * 0.3, 0.3, -1.15 - Math.sin(w * 7) * 0.3, -0.3];
  if (work === 'crank') return [-1.0 + Math.sin(w * 6) * 0.45, -0.25 + Math.cos(w * 6) * 0.3, -0.5, -0.25];
  if (work === 'flip') return [-1.1 - Math.max(0, Math.sin(w * 4)) * 0.9, 0.2, -0.3, 0.2];
  return [-0.4 + Math.sin(w * 2.5) * 0.25, 0.1, -1.2, 0.12]; // chatting, waving the other hand about
}

/**
 * A grown-up keeping an eye on the goodies (the baker on her stall…). The HeistRoom decides what
 * they're doing; this shows it, so kids can read it at a glance:
 *   🎵 busy, back turned · ❗ about to look round (the warning beat) · 👀 watching · ❓ distracted
 * They turn to face whatever they're looking at, and each job has its own busy pose.
 *
 * faces: { busy, look } headings (radians). zone: { x, z, r }, where they can see you from.
 * work: 'knead' | 'crank' | 'flip' | 'chat' (what their arms do while busy); lookWork: the same while
 * watching (the BBQ cook flips burgers while he watches the grill), or hands on hips.
 */
export class Lookout {
  constructor({ hud, person, pos, faces, zone, work = 'knead', lookWork = null, marks = {}, head = 2.2, cls = '' }) {
    Object.assign(this, { hud, person, faces, zone, work, lookWork, headY: head, cls });
    this.pos = person.root.position.copy(pos);
    person.root.rotation.y = faces.busy;
    this.marks = { busy: '🎵', warn: '❗', look: '👀', door: '❓', ...marks };
    this.s = 'busy';
    this.t = 0;      // seconds in this state
    this.left = 5;   // seconds until the next (as far as we know)
    this.by = null;  // who distracted them
    this.shoutT = 0; // "Oi!": arms up
    this.bubbleAt = () => this.top(0.7); // (one anchor, so a new line replaces the last; above the sign)
    this.mark = document.createElement('div');
    this.mark.className = `lookout busy ${cls}`;
    this.mark.textContent = this.marks.busy;
    hud.root.appendChild(this.mark);
  }

  setState(s, ms = 0, by = null, fresh = true) {
    if (s !== this.s) this.t = fresh ? 0 : GRACE; // (joining part-way through a look: they've already turned)
    this.s = s;
    this.left = ms / 1000;
    this.by = by;
    this.mark.className = `lookout ${s} ${this.cls}`;
    this.mark.textContent = this.marks[s] ?? '';
  }

  /** Turned round and watching right now? */
  get watching() { return this.s === 'look' && this.t >= GRACE; }
  /** Close enough to the goodies to be seen? */
  inZone(p) { return Math.hypot(p.x - this.zone.x, p.z - this.zone.z) < this.zone.r; }
  /** Just above their head (for bubbles and the sign). */
  top(dy = 0) { return this.pos.clone().add(_v.set(0, this.headY + dy, 0)); }

  shout() { this.shoutT = 1.1; }

  /** target: where to look when distracted (the barking dog), or null. near: the player's position. */
  update(dt, target, near) {
    this.t += dt;
    this.left -= dt;
    this.shoutT = Math.max(0, this.shoutT - dt);
    const P = this.person, root = P.root;
    let want = this.faces.busy;
    if (this.s === 'look' || this.shoutT > 0) want = this.faces.look;
    else if (this.s === 'door' && target) want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    root.rotation.y += wrap(want - root.rotation.y) * (1 - Math.exp(-dt * 11));
    P.update(dt, 0);
    this.pose(dt);
    // The sign over their head (only when you're near enough to care).
    const d = near ? Math.hypot(near.x - this.pos.x, near.z - this.pos.z) : Infinity;
    const s = this.hud.project(this.top(0.25));
    const show = d < SHOW && !s.behind;
    this.mark.style.opacity = show ? Math.min(1, (SHOW - d) / 6) : 0;
    // (Kept below the top of the screen, so it's never lost when you're right up close.)
    if (show) this.mark.style.transform = `translate(${s.x}px, ${Math.max(s.y, 118)}px) translate(-50%, -100%)`;
  }

  /** Arms and head for what they're doing (eased, on top of Person's own idle sway). */
  pose(dt) {
    const P = this.person, t = this.t;
    const aim = this.armsFor(t); // [right x, right z, left x, left z]
    const k = 1 - Math.exp(-dt * 14);
    this.ap ??= [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) this.ap[i] += (aim[i] - this.ap[i]) * k;
    const [R, L] = P.arms;
    R.rotation.x = this.ap[0]; R.rotation.z = this.ap[1];
    L.rotation.x = this.ap[2]; L.rotation.z = this.ap[3];
    // The warning beat: they stop and glance over their shoulder before turning round.
    if (this.s === 'warn') P.head.rotation.y = THREE.MathUtils.clamp(wrap(this.faces.look - P.root.rotation.y), -1.3, 1.3) * Math.min(1, t / 0.3);
  }

  armsFor(t) {
    if (this.shoutT > 0) { const w = Math.sin(t * 22) * 0.25; return [-0.3, -2.5 + w, -0.3, 2.5 - w]; } // "Oi!" — both arms up
    if (this.s === 'look') return this.lookWork ? workPose(this.lookWork, t) : [0.25, -0.65, 0.25, 0.65]; // (hands on hips, watching)
    if (this.s === 'door') return [-2.3 + Math.sin(t * 9) * 0.3, -0.3, 0.2, 0.6];                          // "Who's that?!"
    return workPose(this.work, this.s === 'warn' ? 0 : t); // (they freeze for the warning beat)
  }

  dispose() { this.mark.remove(); this.person.root.removeFromParent(); }
}
