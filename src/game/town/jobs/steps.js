import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { Cat } from '../../../entities/cat.js';
import { Chicken } from '../../../entities/chicken.js';
import { footballMesh } from '../../../entities/jobItems.js';
import { bakedMesh, profileTube } from '../../../entities/shapes.js';
import { PALETTE } from '../../../render/palette.js';
import { sfx } from '../../../core/audio.js';
import { fsfx } from '../../../core/friendSounds.js';
import { buzz } from '../../../core/haptics.js';
import { blocked } from '../../../world/spots.js';
import { PICKLES_JOB, HERD, HIGH_HINT } from '../../lines/jobs.js';

/*
 * How the thing in a job gets found — one "step" per way (see `step` in ./types.js). Each step can have:
 *   start(run)  update(run, dt, player, ctx) → 'done' (herding finishes itself)  bark(run, player)
 *   target(run) → { pos, emoji, compass? }   objective(run) → { title, sub }   hint(run, player, ctx)
 *   cleanup(run)   carries: false (nothing to carry home: herding)
 * Once there's a thing to carry (run.item), the run itself handles taking it home (./board.js).
 * ctx: { sniffing, nose, others (other dogs' positions) }.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const BIN_TOP = 1.04;

/** A point a few metres off the real spot, for compasses that shouldn't give the game away. */
function fuzz(spot, id, r = 4.5) {
  const q = new RNG(`fuzz:${id}`), a = q.float(0, Math.PI * 2), d = q.float(r * 0.5, r);
  return V(spot.x + Math.cos(a) * d, 0, spot.z + Math.sin(a) * d);
}

/** Things that were up high (or on a bin) fall to the ground: balloons drift, everything else drops. */
function fall(r, dt) {
  const f = r.falling, it = r.item;
  if (!f || !it) return;
  if (f.slow) it.pos.y -= dt * 0.8;
  else { f.vy -= 11 * dt; it.pos.y += f.vy * dt; it.obj.rotation.x += dt * 5; }
  if (it.pos.y <= 0.02) {
    it.pos.y = 0.02;
    it.obj.rotation.x = 0;
    r.falling = null;
    sfx.boink?.();
    r.rt.onChange();
  }
}

const say = (r, emoji, list, vars, at, dur = 3) => r.rt.hud.say(`${emoji} ${r.rt.line(list, vars)}`, at, dur);

// ---------------------------------------------------------------------------------------------
/** Out in the open (twinkling): grab it. */
const lying = {
  start(r) { r.item = r.rt.carry.add(r.spec.item, r.spec.spot.x, r.spec.spot.z, { job: 'board' }); },
};

/** Tucked away out of sight: only a sniffing nose finds it. */
const hidden = {
  start(r) { r.hidden = true; r.fuzz = fuzz(r.spec.spot, r.spec.id); },
  update(r, dt, P, ctx) {
    if (!r.hidden) return;
    const s = r.spec.spot, d = Math.hypot(ctx.nose.x - s.x, ctx.nose.z - s.z);
    if (ctx.sniffing && d < 12 && Math.random() < dt * 4) r.rt.actions.smellPuff(V(s.x, 0.05, s.z), 0xb6e07a);
    if (ctx.sniffing && d < 1.7) {
      r.hidden = false;
      r.item = r.rt.carry.add(r.spec.item, s.x, s.z, { job: 'board' });
      r.item.hop = 1; // pops out of its hiding place
      sfx.found?.(); buzz(20);
      r.rt.hud.float(`${r.def.emoji} Found it!`, r.rt.anchor(), 'xp');
    }
  },
  target(r) { return r.hidden ? { pos: V(r.spec.spot.x, 0, r.spec.spot.z), emoji: '👃', compass: r.fuzz } : null; },
  objective(r) { return r.hidden ? { title: `Sniff out ${r.person.whose} ${r.def.emoji} ${r.def.name}`, sub: `It’s hidden ${r.spec.whereName}. Hold 👃 Sniff to find it!` } : null; },
  hint(r, P, ctx) { return r.hidden && !ctx.sniffing && flat(P.pos, r.spec.spot) < 6 ? 'It’s round here somewhere… hold 👃 Sniff!' : null; },
};

/** Buried: sniff out the little mound, then dig dig dig. */
const buried = {
  start(r) { r.item = r.rt.carry.add(r.spec.item, r.spec.spot.x, r.spec.spot.z, { buried: 3, job: 'board' }); r.fuzz = fuzz(r.spec.spot, r.spec.id, 3.5); },
  target(r) { return r.item.buried > 0 ? { pos: r.item.pos, emoji: '🕳️', compass: r.fuzz } : null; },
  objective(r) { return r.item.buried > 0 ? { title: `Dig up ${r.person.whose} ${r.def.emoji} ${r.def.name}`, sub: `It’s buried ${r.spec.whereName}. Sniff out the spot, then dig 🐾` } : null; },
};

// ---------------------------------------------------------------------------------------------
/** A string dangling from something stuck up high, down to where a jumping dog can grab it. */
function stringMesh(from, to) {
  const mid = from.clone().lerp(to, 0.5).add(V(0.06, 0, 0.04));
  const pts = [from, from.clone().lerp(mid, 0.5).add(V(0, -0.05, 0)), mid, to].map((p) => p.toArray());
  return bakedMesh([[profileTube(pts, () => 0.0045, 24, 5), 0xf3ead6]]);
}

/** A little branch reaching out from a trunk (for hats and frisbees caught in a tree). */
function twigMesh(from, to) {
  return bakedMesh([[profileTube([from.toArray(), from.clone().lerp(to, 0.6).add(V(0, 0.06, 0)).toArray(), to.toArray()], (t) => 0.035 - t * 0.022, 12, 7), PALETTE.bark]]);
}

/** Stuck up high: a big jump (or a friend's back, for team jobs) grabs it and down it comes. */
const stuck = {
  start(r) {
    const p = r.spec.perch, kind = r.spec.item;
    const g = new THREE.Group();
    const top = V(p.top.x, p.top.y, p.top.z), reach = V(p.reach.x, p.reachY, p.reach.z);
    const holder = new THREE.Group();
    holder.position.copy(top);
    holder.rotation.y = p.face;
    g.add(holder);
    const model = r.def.build();
    holder.add(model);
    if (kind === 'kite') { model.rotation.set(Math.PI / 2 - (p.kind === 'roof' ? -0.08 : 0.35), 0, 0.3); g.add(stringMesh(top.clone().add(V(0, -0.02, 0)), reach)); }
    else if (kind === 'balloon') { holder.position.y -= 0.66; g.add(stringMesh(holder.position.clone(), reach)); }
    else {
      model.rotation.set(kind === 'scarf' ? 0 : 0.55, 0, kind === 'scarf' ? Math.PI / 2 - 0.15 : 0.3);
      if (p.twig) g.add(twigMesh(V(p.twig.x, top.y + 0.2, p.twig.z), top.clone().add(V(0, 0.04, 0))));
    }
    r.rt.scene.add(g);
    r.stuck = { g, holder, top, reach, t: Math.random() * 6 };
  },
  update(r, dt, P) {
    const st = r.stuck;
    if (st) {
      st.t += dt;
      st.holder.rotation.z = Math.sin(st.t * 2.2) * 0.06; // fluttering in the breeze
      const d = flat(P.pos, st.reach);
      st.ok = P.pos.y >= r.spec.perch.need && (!r.T.team || P.onFriend);
      st.near = d < 2;
      if (d < 0.85 && st.ok) {
        st.g.removeFromParent();
        r.stuck = null;
        const land = r.rt.jw.clear(st.reach.x, st.reach.z, 0.2) ? st.reach : P.pos;
        r.item = r.rt.carry.add(r.spec.item, land.x, land.z, { job: 'board' });
        r.item.pos.y = ['kite', 'balloon'].includes(r.spec.item) ? st.top.y - (r.spec.item === 'balloon' ? 0.66 : 0) : st.reach.y;
        r.falling = { vy: 1, slow: r.spec.item === 'balloon' };
        sfx.pop?.(); buzz([20, 30, 20]);
        r.rt.hud.float(`${r.def.emoji} Got it!`, r.rt.anchor(), 'xp');
        r.rt.actions.sparkle(st.reach.clone(), 16);
      }
    }
    fall(r, dt);
  },
  target(r) { return r.stuck ? { pos: r.stuck.reach, emoji: r.def.emoji } : null; },
  objective(r) {
    if (!r.stuck) return null;
    return { title: `Get ${r.person.whose} ${r.def.emoji} ${r.def.name} down!`, sub: `It’s stuck ${r.spec.whereName}. ${r.T.team ? 'Stand on a friend’s back, then jump 🐾🐾' : 'Double-tap jump for a BIG jump 🦘'}` };
  },
  hint(r) { const st = r.stuck; return st?.near && !st.ok ? HIGH_HINT[r.T.team ? 'team' : 'solo'] : null; },
  cleanup(r) { r.stuck?.g.removeFromParent(); },
};

// ---------------------------------------------------------------------------------------------
/** Where the borrowed thing sits: on the bin lid, between Pickles's front paws. */
function placeProp(r) {
  const c = r.cat.root, a = c.rotation.y;
  r.prop.position.set(c.position.x + Math.sin(a) * 0.17, c.position.y + 0.01, c.position.z + Math.cos(a) * 0.17);
  r.prop.rotation.y = a;
}

/** Pickles on a bin with someone's things. Woof at her (once or twice) and she drops them. */
const pickles = {
  start(r) {
    const bin = r.rt.world.bins.find((b) => b.id === r.spec.bin) ?? r.rt.world.bins[0];
    r.bin = bin;
    r.cat = new Cat();
    r.cat.root.position.set(bin.x, BIN_TOP, bin.z);
    r.cat.root.rotation.y = Math.atan2(r.rt.jw.board.x - bin.x, r.rt.jw.board.z - bin.z);
    r.rt.scene.add(r.cat.root);
    r.barks = r.spec.barks ?? 1;
    r.tauntT = 0;
    r.prop = r.def.build();
    r.rt.scene.add(r.prop);
    placeProp(r);
  },
  update(r, dt, P) {
    fall(r, dt);
    const cat = r.cat;
    if (!cat) return;
    cat.update(dt, P.pos);
    if (r.prop) { r.prop.visible = !cat.hop; if (!cat.hop) placeProp(r); }
    const d = flat(P.pos, cat.root.position);
    r.tauntT -= dt;
    if (!r.dropped) {
      if (d < 9 && r.tauntT <= 0) { r.tauntT = 7; cat.laugh = 1; say(r, '🐈', PICKLES_JOB.taunt, { item: r.def.name }, () => cat.bubbleAnchor(V()), 2.8); }
      if (r.bin?.tipped && !cat.hop) drop(r, P); // somebody knocked her bin over!
      return;
    }
    // Off she goes: two hops away, then she's gone (cats).
    if (cat.hop) return;
    const L = r.leaving;
    if (L.stage === 0) { L.stage = 1; cat.hopTo(cat.root.position.clone().add(L.dir.clone().multiplyScalar(1.8)), cat.root.rotation.y); }
    else { L.t += dt; cat.root.scale.setScalar(Math.max(0.01, 1 - L.t * 2)); if (L.t > 0.5) { cat.root.removeFromParent(); r.cat = null; } }
  },
  bark(r, P) {
    const cat = r.cat;
    if (!cat || r.dropped || cat.hop || flat(P.pos, cat.root.position) > 6.5) return;
    cat.startle = 1;
    if (r.barks > 1) {
      const next = r.rt.world.bins.find((b) => b !== r.bin && !b.tipped && flat(b, cat.root.position) > 2.5 && flat(b, cat.root.position) < 9);
      if (next) {
        r.barks--;
        r.bin = next;
        r.moved = true;
        cat.hopTo(V(next.x, BIN_TOP, next.z), Math.atan2(P.pos.x - next.x, P.pos.z - next.z));
        fsfx.hmph();
        say(r, '🐈', PICKLES_JOB.dodge, {}, () => cat.bubbleAnchor(V()), 2.2);
        return;
      }
    }
    drop(r, P);
  },
  target(r) { return r.cat && !r.dropped ? { pos: r.cat.root.position, emoji: '🐈' } : null; },
  objective(r) { return r.dropped ? null : { title: `Get ${r.person.whose} ${r.def.emoji} ${r.def.name} back from Pickles!`, sub: `She’s on a bin ${r.moved ? 'nearby' : r.spec.whereName}. Woof at her! 🗣️` }; },
  hint(r, P) { return r.cat && !r.dropped && flat(P.pos, r.cat.root.position) < 6 ? 'Woof at Pickles! 🗣️' : null; },
  cleanup(r) { r.cat?.root.removeFromParent(); r.prop?.removeFromParent(); },
};

function drop(r, P) {
  r.dropped = true;
  const cat = r.cat, at = cat.root.position;
  const toDog = V(P.pos.x - at.x, 0, P.pos.z - at.z);
  if (toDog.lengthSq() < 1e-4) toDog.set(0, 0, 1);
  toDog.normalize();
  const land = r.rt.jw.clear(at.x + toDog.x * 0.9, at.z + toDog.z * 0.9, 0.15) ? { x: at.x + toDog.x * 0.9, z: at.z + toDog.z * 0.9 } : { x: P.pos.x, z: P.pos.z };
  r.item = r.rt.carry.add(r.spec.item, land.x, land.z, { job: 'board' });
  r.item.pos.y = BIN_TOP;
  r.falling = { vy: 1.5 };
  r.prop?.removeFromParent();
  r.prop = null;
  fsfx.hmph(); sfx.meow?.();
  say(r, '🐈', PICKLES_JOB.drop, { item: r.def.name }, () => cat.bubbleAnchor(V()), 3);
  // She hops down on the far side and slinks off.
  const away = toDog.clone().negate();
  r.leaving = { stage: 0, t: 0, dir: away };
  cat.hopTo(V(at.x + away.x * 1.3, 0, at.z + away.z * 1.3), Math.atan2(away.x, away.z));
}

// ---------------------------------------------------------------------------------------------
/** A delivery waiting somewhere (by the postman, at the bakery, on a doorstep): pick it up. */
const pickup = {
  start(r) {
    let at = r.spec.spot;
    if (r.spec.from === 'postman') {
      const pm = r.rt.jw.live.postman?.();
      at = pm ? r.rt.jw.spotNear(new RNG(`post:${r.spec.id}`), pm.x, pm.z, 0.9, 2.5) ?? { x: pm.x, z: pm.z } : { x: r.rt.jw.board.x + 1, z: r.rt.jw.board.z };
    }
    r.item = r.rt.carry.add(r.spec.item, at.x, at.z, { job: 'board' });
    const f = r.rt.jw.people[r.spec.from];
    r.fromName = r.spec.from === 'postman' ? 'next to the postman' : r.spec.from === 'paperboy' ? 'by the board' : r.spec.from === 'baker' ? 'at the bakery'
      : r.spec.from === 'tree' ? r.rt.world.seasonal?.tree?.name ?? 'under the big tree in the park' : `on ${f.whose} doorstep (number ${f.number})`;
  },
  update(r) { if (r.holding) r.picked = true; },
  objective(r) {
    if (r.holding) return null;
    const to = r.person.number ? `${r.person.name} at number ${r.person.number}` : r.person.name;
    return { title: `Pick up the ${r.def.emoji} ${r.def.name}`, sub: r.picked ? 'You dropped it! Grab it again 🐾' : `It’s ${r.fromName}. It’s for ${to}.` };
  },
};

// ---------------------------------------------------------------------------------------------
const SCARE = 3.4, FLEE = 2.25, AMBLE = 0.35;

/**
 * Walk (dx, dz)-wards at `speed`, staying out of the water and in town. Something in the way (a bin, a
 * lamppost)? Veer round it — the side that's clear, keeping the way she was going if she can.
 */
function move(r, c, dx, dz, speed, dt, pad = 0.25) {
  const w = r.rt.world, n = Math.hypot(dx, dz) || 1, k = 1 - Math.exp(-dt * 6);
  c.vx += ((dx / n) * speed - c.vx) * k;
  c.vz += ((dz / n) * speed - c.vz) * k;
  const sp = Math.hypot(c.vx, c.vz);
  let moved = false;
  if (sp > 1e-4) {
    c.side ??= 1;
    for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const t = a * c.side, cs = Math.cos(t), sn = Math.sin(t);
      const vx = c.vx * cs - c.vz * sn, vz = c.vx * sn + c.vz * cs;
      const nx = c.pos.x + vx * dt, nz = c.pos.z + vz * dt;
      if (blocked(w, nx, nz, pad)) continue;
      c.pos.x = nx; c.pos.z = nz;
      if (a) { c.vx = vx; c.vz = vz; if (a < 0) c.side = -c.side; } // (and keep going round that side)
      moved = true;
      break;
    }
  }
  if (!moved && sp > 1e-4) { c.wander += Math.PI * (0.5 + Math.random()); c.vx *= -0.3; c.vz *= -0.3; }
  const b = w.bounds;
  if (b) { c.pos.x = Math.min(b.x1 - 2, Math.max(b.x0 + 2, c.pos.x)); c.pos.z = Math.min(b.z1 - 2, Math.max(b.z0 + 2, c.pos.z)); }
  c.speed = Math.hypot(c.vx, c.vz);
}

/** A runaway hen: she scurries away from dogs, so come at her from the far side and walk her home. */
function henStep(r, dt, P, ctx) {
  const c = r.c, hen = r.hen;
  let fx = 0, fz = 0;
  for (const d of [P.pos, ...ctx.others]) {
    const dx = c.pos.x - d.x, dz = c.pos.z - d.z, dd = Math.hypot(dx, dz);
    if (dd < SCARE && dd > 1e-3) { const w = (SCARE - dd) / SCARE; fx += (dx / dd) * w; fz += (dz / dd) * w; }
  }
  c.panic = Math.max(0, c.panic - dt);
  c.cluckT -= dt;
  if (fx || fz || c.panic > 0) {
    if (!fx && !fz) { fx = c.vx; fz = c.vz; }
    if (c.cluckT <= 0) {
      c.cluckT = 1.6 + Math.random() * 1.5;
      const near = flat(P.pos, c.pos);
      if (near < 16) { fsfx.cluck(Math.max(0.3, 1 - near / 16)); if (Math.random() < 0.4) r.rt.hud.float(r.rt.line(HERD.bwak), c.pos.clone().add(V(0, 0.55, 0)), 'sniff'); }
      if (Math.random() < 0.3) hen.fluster();
    }
    move(r, c, fx, fz, FLEE * Math.min(1.15, 0.6 + Math.hypot(fx, fz)) * (c.panic > 0 ? 1.3 : 1), dt);
  } else {
    c.pause -= dt;
    if (c.pause > 0) move(r, c, c.vx || 1, c.vz, 0, dt); // pecking about
    else {
      c.wander += (Math.random() - 0.5) * dt * 2.5;
      move(r, c, Math.sin(c.wander), Math.cos(c.wander), AMBLE, dt);
      if (Math.random() < dt * 0.25) c.pause = 1.5 + Math.random() * 2;
    }
  }
  if (c.speed > 0.05) hen.root.rotation.y = Math.atan2(c.vx, c.vz);
}

/** Bump a football with your nose: it rolls off the way you pushed it, and bounces off walls. */
function nudge(c, dog, vel, kicked) {
  if ((dog.y ?? 0) > 0.6) return kicked; // (a dog jumping over it doesn't touch it)
  const dx = c.pos.x - dog.x, dz = c.pos.z - dog.z, d = Math.hypot(dx, dz), R = 0.45;
  if (d >= R || d < 1e-4) return kicked;
  const nx = dx / d, nz = dz / d;
  c.pos.x = dog.x + nx * R; c.pos.z = dog.z + nz * R;
  const push = Math.max(1.7, (vel ? Math.max(0, vel.x * nx + vel.y * nz) : 0) * 1.35), cur = c.vx * nx + c.vz * nz;
  if (cur < push) { c.vx += nx * (push - cur); c.vz += nz * (push - cur); return kicked || push - cur > 0.9; }
  return kicked;
}

function ballStep(r, dt, P, ctx) {
  const c = r.c, w = r.rt.world;
  let kicked = nudge(c, P.pos, P.vel, false);
  for (const o of ctx.others) kicked = nudge(c, o, null, kicked);
  if (kicked && (c.kickT ?? 0) <= 0) { fsfx.kick(); c.kickT = 0.25; }
  c.kickT = (c.kickT ?? 0) - dt;
  const nx = c.pos.x + c.vx * dt, nz = c.pos.z + c.vz * dt, pad = 0.12;
  if (!blocked(w, nx, nz, pad)) { c.pos.x = nx; c.pos.z = nz; }
  else if (!blocked(w, nx, c.pos.z, pad)) { c.pos.x = nx; c.vz *= -0.6; }
  else if (!blocked(w, c.pos.x, nz, pad)) { c.pos.z = nz; c.vx *= -0.6; }
  else { c.vx *= -0.5; c.vz *= -0.5; }
  const f = Math.exp(-dt * 0.9);
  c.vx *= f; c.vz *= f;
  const b = w.bounds;
  if (b) { c.pos.x = Math.min(b.x1 - 2, Math.max(b.x0 + 2, c.pos.x)); c.pos.z = Math.min(b.z1 - 2, Math.max(b.z0 + 2, c.pos.z)); }
  c.speed = Math.hypot(c.vx, c.vz);
}

/** A runaway (a hen, or a football) to get home to its gate. Nothing to carry. */
const herd = {
  carries: false,
  start(r) {
    const s = r.spec, hen = r.T.critter === 'hen';
    r.home = r.person.gate.clone();
    r.c = { pos: V(s.spot.x, 0, s.spot.z), vx: 0, vz: 0, speed: 0, wander: Math.random() * 6, panic: 0, pause: 0, cluckT: 0 };
    if (hen) { r.hen = new Chicken(s.look); r.model = r.hen.root; }
    else { r.model = footballMesh(); r.model.position.y = 0.15; } // (resting on the grass)
    r.model.position.x = s.spot.x;
    r.model.position.z = s.spot.z;
    r.rt.scene.add(r.model);
  },
  update(r, dt, P, ctx) {
    const c = r.c, hen = r.hen;
    if (r.homeT !== undefined) { // home! In through the gate to the doorstep, then off to bed
      r.homeT -= dt;
      const to = r.person.step, dx = to.x - c.pos.x, dz = to.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.1) { const s = Math.min(d, dt * 2); c.pos.x += (dx / d) * s; c.pos.z += (dz / d) * s; c.speed = 2; if (hen) hen.root.rotation.y = Math.atan2(dx, dz); }
      else c.speed = 0;
      if (r.homeT < 0.4) r.model.scale.setScalar(Math.max(0.01, r.homeT / 0.4));
    } else if (hen) henStep(r, dt, P, ctx);
    else ballStep(r, dt, P, ctx);
    r.model.position.x = c.pos.x;
    r.model.position.z = c.pos.z;
    if (hen) hen.update(dt, { moving: Math.min(1, c.speed / 1.6) });
    else if (c.speed > 0.01) r.model.rotateOnWorldAxis(V(c.vz, 0, -c.vx).normalize(), (c.speed * dt) / 0.11);
    if (r.homeT === undefined && flat(c.pos, r.home) < 2) {
      r.homeT = 1.6;
      r.c.vx = r.c.vz = 0;
      sfx.found?.(); buzz([20, 30]);
      if (hen) { fsfx.cluck(); hen.fluster(); r.rt.hud.float(r.rt.line(HERD.home), c.pos.clone().add(V(0, 0.6, 0)), 'xp'); }
      else { fsfx.kick(); r.rt.hud.float('GOAL! ⚽', c.pos.clone().add(V(0, 0.5, 0)), 'xp'); }
      r.rt.actions.sparkle(c.pos.clone().add(V(0, 0.3, 0)), 20);
    }
    if (r.homeT !== undefined && r.homeT <= 0) return 'done';
  },
  bark(r, P) {
    if (!r.hen || r.homeT !== undefined || flat(P.pos, r.c.pos) > 7) return;
    r.hen.fluster();
    r.c.panic = 1.2;
    fsfx.cluck();
    r.rt.hud.float(r.rt.line(HERD.bwak), r.c.pos.clone().add(V(0, 0.55, 0)), 'sniff');
  },
  target(r) { return { pos: r.c.pos, emoji: r.hen ? '🐔' : '⚽' }; },
  objective(r) {
    const n = r.person.number;
    return r.hen
      ? { title: `Shoo ${r.spec.hen} 🐔 home to number ${n}!`, sub: 'Hens run away from dogs: get behind her and walk her to the glowing paw prints.' }
      : { title: `Nudge the ⚽ football home to number ${n}!`, sub: 'Bump it with your nose, then chase it to the glowing paw prints.' };
  },
  cleanup(r) { r.model?.removeFromParent(); },
};

export const STEPS = { lying, hidden, buried, stuck, pickles, pickup, herd };
