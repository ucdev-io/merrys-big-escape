/**
 * One season's things to do (see ./parts.js): built when the season starts, cleared away when it
 * ends. Scenery added with add() goes when it goes; so do colliders added with circle()/box().
 * A part can have: update(dt, frame), onDig(nose) → true if it used the 🐾, onBark(pos), prompt,
 * pawAct, heightAt(x, z) (ground the dogs stand on), toy(msg, mine), adopt(toys) (a pack's).
 */
export class SeasonPart {
  constructor(S) {
    this.S = S;
    this.objects = [];
    this.cols = [];
  }

  get world() { return this.S.world; }
  get player() { return this.S.player; }
  get hud() { return this.S.hud; }
  get town() { return this.S.chapter === 'town'; }

  add(obj, parent = this.S.scene) { parent.add(obj); this.objects.push(obj); return obj; }

  /** A collider for as long as this season lasts. */
  circle(x, z, r, top = Infinity, stand = true) { const c = this.world.colliders.circle(x, z, r, top, stand); this.cols.push(c); return c; }
  box(x0, z0, x1, z1, top = Infinity, stand = true) { const b = this.world.colliders.box(x0, z0, x1, z1, top, stand); this.cols.push(b); return b; }

  /** A seasonal toy changed (from the pack, or our own room). */
  toy() {}
  adopt() {}
  update() {}

  dispose() {
    for (const o of this.objects) o.removeFromParent();
    const C = this.world.colliders, gone = new Set(this.cols);
    C.circles = C.circles.filter((c) => !gone.has(c));
    C.boxes = C.boxes.filter((b) => !gone.has(b));
    this.objects = [];
    this.cols = [];
  }
}
