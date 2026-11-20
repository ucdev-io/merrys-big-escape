import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const FREE = { pitchMin: 0.15, pitchMax: 1.2, distMin: 2.5, distMax: 14 };
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
    this._hit = new THREE.Vector3();
    this.manualHold = 0;        // seconds left before auto-follow resumes after a drag
    // How far you can look up/down and zoom out (a trip can change these: the sewer keeps you looking down into it).
    this.limits = { ...FREE };
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
      this.pitch = clamp(this.pitch + (e.clientY - ly) * 0.004, this.limits.pitchMin, this.limits.pitchMax);
      lx = e.clientX; ly = e.clientY;
      this.manualHold = 2.5;
    });
    dom.addEventListener('wheel', (e) => {
      this.distance = clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), this.limits.distMin, this.limits.distMax);
    }, { passive: true });
  }

  /** Look around by dragging (touch): yaw left/right, pitch up/down. */
  orbitBy(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.004, this.limits.pitchMin, this.limits.pitchMax);
    this.manualHold = 2.5;
  }
  zoomBy(f) { this.distance = clamp(this.distance * f, this.limits.distMin, this.limits.distMax); }

  /** Look-around limits ({ pitchMin, pitchMax, distMin, distMax }, any left out are the usual ones); null for the usual. */
  setLimits(l = null) {
    this.limits = { ...FREE, ...(l ?? {}) };
    this.pitch = clamp(this.pitch, this.limits.pitchMin, this.limits.pitchMax);
    this.distance = clamp(this.distance, this.limits.distMin, this.limits.distMax);
  }

  /**
   * @param solid    buildings/sheds: the camera slides in front of these.
   * @param foliage  tree canopies: the camera dips underneath these.
   */
  setOccluders({ boxes = [], spheres = [] } = {}) {
    this.occluders = boxes;   // THREE.Box3[] — buildings, trunks
    this.foliage = spheres;   // THREE.Sphere[] — tree canopies
  }

  _dirFor(pitch, out) {
    return out.set(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch)).normalize();
  }

  _blocked(look, pitch, spheres, far) {
    const ray = this.ray.ray;
    ray.set(look, this._dirFor(pitch, this._probe));
    for (const s of spheres) {
      if (ray.intersectSphere(s, this._hit) && this._hit.distanceTo(look) < far) return true;
    }
    return false;
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
        if (Math.abs(f.center.x - look.x) < reach && Math.abs(f.center.z - look.z) < reach) near.push(f);
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
      const ray = this.ray.ray;
      ray.set(look, dir);
      let best = Infinity;
      const reach = this.distance + 2;
      for (const b of this.occluders) {
        if (b.max.x < look.x - reach || b.min.x > look.x + reach || b.max.z < look.z - reach || b.min.z > look.z + reach) continue;
        if (b.containsPoint(look)) continue;
        if (ray.intersectBox(b, this._hit)) best = Math.min(best, this._hit.distanceTo(look));
      }
      if (best < this.distance) want = Math.max(1.4, best - 0.35);
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
