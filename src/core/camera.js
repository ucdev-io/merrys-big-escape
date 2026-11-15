import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Storybook follow camera.
 * - Lazily swings round behind Merry while she moves (pauses after you drag to look around).
 * - Never lets a building hide her: if something is in the way, the camera slides in front of it.
 * Drag to orbit, wheel to zoom.
 */
export class FollowCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.yaw = Math.PI + 0.45;
    this.pitch = 0.5;
    this.distance = 7;          // what the player asked for
    this.actualDistance = 7;    // after pulling in for obstacles
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.occluders = [];
    this.foliage = [];
    this.effPitch = this.pitch;  // pitch after dipping under leaves
    this._probe = new THREE.Vector3();
    this._near = [];
    this.manualHold = 0;        // seconds left before auto-follow resumes after a drag
    this.ray = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this._eye = new THREE.Vector3();

    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return; // touch drags belong to the joystick
      dragging = true; lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointerup', () => (dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw -= (e.clientX - lx) * 0.005;
      this.pitch = clamp(this.pitch + (e.clientY - ly) * 0.004, 0.15, 1.2);
      lx = e.clientX; ly = e.clientY;
      this.manualHold = 2.5;
    });
    dom.addEventListener('wheel', (e) => {
      this.distance = clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), 2.5, 14);
    }, { passive: true });
  }

  /**
   * @param solid    buildings/sheds: the camera slides in front of these.
   * @param foliage  tree canopies: the camera dips underneath these.
   */
  setOccluders(solid, foliage = []) {
    this.occluders = solid;
    this.foliage = foliage.map((m) => {
      m.updateWorldMatrix(true, false);
      return { m, p: m.getWorldPosition(new THREE.Vector3()) };
    });
  }

  _dirFor(pitch, out) {
    return out.set(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch)).normalize();
  }

  _blocked(look, pitch, list, far) {
    this.ray.set(look, this._dirFor(pitch, this._probe));
    this.ray.far = far;
    return this.ray.intersectObjects(list, false).length > 0;
  }

  snap(pos) { this.target.copy(pos); this.smoothTarget.copy(pos); }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} pos  dog position
   * @param {number} heading     dog facing (radians, 0 = +Z)
   * @param {number} speed       dog speed (m/s)
   */
  update(dt, pos, heading = 0, speed = 0) {
    this.target.copy(pos);
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-dt * 5));

    // Auto-follow: drift behind Merry while she moves. Weaker when she runs at the camera,
    // so it doesn't spin round wildly.
    this.manualHold = Math.max(0, this.manualHold - dt);
    if (this.manualHold === 0 && speed > 0.3) {
      const behind = heading + Math.PI;
      const diff = wrap(behind - this.yaw);
      const facing = THREE.MathUtils.smoothstep(Math.cos(diff), -0.4, 0.6);
      const rate = clamp(speed / 4, 0.25, 1) * (0.25 + 0.75 * facing) * 1.6;
      this.yaw += diff * (1 - Math.exp(-dt * rate));
    }

    // Look-at point (Merry's head height) and the ideal camera direction.
    const look = this._eye.set(this.smoothTarget.x, this.smoothTarget.y + 0.45, this.smoothTarget.z);

    // Leaves in the way? Find the highest clear angle below the chosen one and dip down to it.
    let targetPitch = this.pitch;
    if (this.foliage.length) {
      const near = this._near;
      near.length = 0;
      const reach = this.distance + 4;
      for (const f of this.foliage) {
        if (Math.abs(f.p.x - look.x) < reach && Math.abs(f.p.z - look.z) < reach) near.push(f.m);
      }
      if (near.length && this._blocked(look, this.pitch, near, this.distance)) {
        targetPitch = 0.06;
        for (let p = this.pitch - 0.08; p > 0.06; p -= 0.08) {
          if (!this._blocked(look, p, near, this.distance)) { targetPitch = p; break; }
        }
      }
    }
    // Dip quickly, rise back slowly once clear.
    const pk = targetPitch < this.effPitch ? 5 : 1.5;
    this.effPitch += (targetPitch - this.effPitch) * (1 - Math.exp(-dt * pk));
    const dir = this._dirFor(this.effPitch, this._dir);

    // Occlusion: cast from Merry toward the camera; if a building is in the way, come in front of it.
    let want = this.distance;
    if (this.occluders.length) {
      this.ray.set(look, dir);
      this.ray.far = this.distance;
      const hit = this.ray.intersectObjects(this.occluders, true)[0];
      if (hit) want = Math.max(1.4, hit.distance - 0.35);
    }
    // Pull in quickly, ease back out gently.
    const k = want < this.actualDistance ? 14 : 2.5;
    this.actualDistance += (want - this.actualDistance) * (1 - Math.exp(-dt * k));

    const c = this.camera, d = this.actualDistance;
    c.position.copy(look).addScaledVector(dir, d);
    c.position.y -= 0.15;
    c.lookAt(look);
  }
}
