import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../../render/watercolorMaterial.js';
import { blocked } from '../../world/spots.js';
import { saucerModel, beamModel } from '../../entities/saucer.js';

/*
 * 🛸 Up over the Farm's crop field, a flying saucer hovers, its lights twinkling round, and underneath it a crop
 * circle has appeared in the field. Stand in the middle and 🐾: a beam of light, and up she goes (to Planet Boing:
 * trips/ufo/). She comes back down the same beam. The crops leave the circle flat (see farm/crops.js).
 */

export const HOVER = 7.5; // how high it hovers (low enough to catch your eye from across the farm)

/**
 * Where the crop circle is, in a town's Farm (the built area): towards the back of the crop field, past the
 * scarecrow. { u, v, r } in the farm's own frame and { x, z } in the world's; null if there's no farm.
 */
export function ufoSpot(area) {
  const d = area?.layout, F = d?.cropField;
  if (!F || !area.W) return null;
  const r = 5.2, u = (F.u0 + F.u1) / 2;
  for (const dv of [9, 12, 15, 7]) {
    const v = F.v1 - dv;
    if (v - r < d.scarecrow.v + 3) continue;
    const [x, z] = area.W(u, v);
    return { u, v, r, x, z };
  }
  const v = (F.v0 + F.v1) / 2 + 10, [x, z] = area.W(u, v);
  return { u, v, r, x, z };
}

/** The flattened pattern: a big disc, a ring round it, and three little circles on spokes. */
function circleGeometry(r) {
  const parts = [], flat = (g) => { g.rotateX(-Math.PI / 2); parts.push(g); };
  flat(new THREE.CircleGeometry(r * 0.38, 40));
  flat(new THREE.RingGeometry(r * 0.6, r * 0.7, 56));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const c = new THREE.CircleGeometry(r * 0.12, 20);
    c.translate(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 0);
    flat(c);
    const s = new THREE.PlaneGeometry(r * 0.06, r * 0.22);
    s.rotateZ(a - Math.PI / 2);
    s.translate(Math.cos(a) * r * 0.77, Math.sin(a) * r * 0.77, 0);
    flat(s);
  }
  return mergeGeometries(parts);
}

export class UfoSite {
  constructor(parent, area, world) {
    const s = ufoSpot(area);
    this.spot = s;
    if (!s) return;
    this.group = new THREE.Group();
    this.group.position.set(s.x, 0, s.z);
    parent.add(this.group);
    const circle = new THREE.Mesh(circleGeometry(s.r), paint(0xe8d39a));
    circle.position.y = 0.045; // (just over the furrows' ridges)
    circle.receiveShadow = true;
    this.group.add(circle);
    const { root, lights } = saucerModel();
    this.saucer = root;
    this.lights = lights;
    root.position.y = HOVER;
    this.group.add(root);
    this.beamMesh = beamModel(HOVER);
    this.beamMesh.position.y = HOVER + 0.02;
    this.beamMesh.visible = false;
    this.group.add(this.beamMesh);
    this.beamT = 0;
    this.t = Math.random() * 10;
    // (A clear spot to come back down to: the middle, or a step out if something's ever put there.)
    this.out = { x: s.x, z: s.z, face: 0 };
    if (blocked(world, s.x, s.z, 0.4)) this.out = { x: s.x + 1.5, z: s.z, face: 0 };
  }

  /** The beam on for `secs` (up she goes, or down she comes). */
  beam(secs) { this.beamT = Math.max(this.beamT, secs); }

  update(dt, pos) {
    if (!this.spot) return;
    this.t += dt;
    const near = (pos.x - this.spot.x) ** 2 + (pos.z - this.spot.z) ** 2 < 120 * 120;
    this.group.visible = near;
    if (!near) return;
    const S = this.saucer, t = this.t;
    S.position.y = HOVER + Math.sin(t * 1.1) * 0.35;
    S.rotation.z = Math.sin(t * 0.7) * 0.04;
    S.rotation.x = Math.cos(t * 0.6) * 0.04;
    this.lights.rotation.y = t * 0.9;
    this.beamT = Math.max(0, this.beamT - dt);
    const on = this.beamT > 0;
    this.beamMesh.visible = on;
    if (on) {
      this.beamMesh.position.y = S.position.y + 0.02;
      this.beamMesh.scale.y = S.position.y / HOVER;
      this.beamMesh.material.opacity = 0.32 * Math.min(1, this.beamT / 0.4) * (0.85 + 0.15 * Math.sin(t * 20));
    }
  }
}
