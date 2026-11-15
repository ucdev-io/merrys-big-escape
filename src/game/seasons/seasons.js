import { SeasonRoom, SEASON_INFO, WEATHER_INFO, WEATHER, resolveSeason } from '../seasonRules.js';
import { season, localSeason } from '../season.js';
import { SeasonLook } from '../../render/seasonLook.js';
import { seasonUniforms } from '../../render/watercolorMaterial.js';
import { WeatherFx, LEAF_COLORS } from '../../fx/weatherFx.js';
import { PawPrints } from '../../fx/pawPrints.js';
import { getSettings, setSetting } from '../../core/settings.js';
import { music } from '../../core/music.js';
import { LineBag } from '../dialogue.js';
import { WEATHER_SAY, SEASON_SAY } from '../lines/seasons.js';
import { showSeasonCard } from '../../ui/seasonCard.js';
import { groundY, pick } from './common.js';
import { Puddles } from './puddles.js';
import { PARTS } from './parts.js';
import './jobs.js'; // (the seasons' jobs for the 📋 board: presents, runaway umbrellas…)

const LOCAL = 0; // our own id in a SeasonRoom of our own (no pack server)

/**
 * 🍂❄️🌸☀️ The seasons and the weather, for a chapter (the town, or the garden).
 *
 * The season comes from the pack (whoever opened it picks), or — on your own — from the ☰ Season
 * setting ('Auto' follows the real UK calendar). The weather and the shared seasonal toys (snowmen,
 * leaf piles) are run by a SeasonRoom (../seasonRules.js): the pack server's, or our own. The look is
 * painted in (render/seasonLook.js), and each season brings its own things to do (./parts.js).
 *
 * Hooks for the chapter: update(dt, { canAct, barked }), onDig(nose) → true if it used the 🐾,
 * onBark(pos), prompt / pawAct (for the HUD), handle(msg) (the pack's 'season' messages),
 * adopt(state) (a pack's welcome), showCard() (☰ → Seasons).
 */
export class Seasons {
  constructor(o) {
    Object.assign(this, o); // scene, world, player, hud, input, actions, pipeline, chapter ('town' | 'yard'), seed, pack?, remotes?, traffic?, heists?, friends?, follow?
    this.camera = o.camera ?? o.hud.camera;
    this.mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.look = new SeasonLook({ scene: this.scene, pipeline: this.pipeline, sky: this.scene.getObjectByName('sky') });
    this.fx = new WeatherFx(this.scene, { mobile: this.mobile });
    this.prints = new PawPrints(this.scene, { max: this.mobile ? 220 : 340 });
    this.puddles = new Puddles(this);
    this.parts = null;
    this.bags = {};
    this.host = LOCAL;
    this.hostName = '';
    // How high the ground is (the frozen pond, a sledging hill): the player stands on it.
    const prev = this.world.heightAt;
    this.world.heightAt = (x, z) => Math.max(prev?.(x, z) ?? 0, this.parts?.heightAt?.(x, z) ?? 0);
    this.reset(o.welcome?.season ?? null, true);
  }

  me() { return this.pack?.net?.id ?? LOCAL; }
  line(key, list) { this.bags[key] ??= new LineBag(list); return this.bags[key].next(); }

  // ---------- the SeasonRoom: ours, or the pack's ----------

  /**
   * On our own (or we've just lost the pack): a SeasonRoom of our own, carrying on as we were.
   * state: start from this ({ season, festive, weather? }: a pack's, if we arrived through a link).
   */
  reset(state = null, first = false) {
    const now = performance.now();
    this.online = false;
    this.room = new SeasonRoom(now, state ?? (first ? localSeason() : { season: season.name, festive: season.festive }));
    this.room.join(LOCAL, 'you');
    const w = state?.weather ?? (first ? null : { kind: season.weather, ms: 60000 }); // (a shower carries on)
    if (w && w.kind in WEATHER[this.room.season]) this.room.spell = { kind: w.kind, until: now + Math.max(5000, w.ms ?? 60000) };
    this.adopt(this.room.snapshot(now), first);
  }

  send(msg) {
    if (this.pack?.net) this.pack.sendSeason?.(msg);
    else this.deliver(this.room.message(LOCAL, msg, performance.now()));
  }

  deliver(list) { for (const { to, msg } of list) if (to === 'all' || to === LOCAL) this.handle(msg); }

  /** A message from the SeasonRoom (the pack server's, or ours). */
  handle(m) {
    if (!m) return;
    switch (m.a) {
      case 'state':
        if (this.pack?.net && this.room) { this.online = true; this.room = null; }
        return this.adopt(m);
      case 'weather': return this.setWeather(m.kind, m.why);
      case 'toy': return this.parts?.toy?.(m, m.by === this.me());
      case 'host': this.host = m.host; this.hostName = m.hostName ?? ''; return undefined;
      case 'nope': return this.hud.showToastRaw('🌦️', 'Not your pack’s season to pick!', `${m.hostName || 'Whoever opened the pack'} picks it here.`, { tip: true });
    }
    return undefined;
  }

  /** The whole state: from a pack's welcome, a season change, or our own room. */
  adopt(s, first = false) {
    if (!s) return;
    if (s.host !== undefined) { this.host = s.host; this.hostName = s.hostName ?? ''; }
    this.apply({ season: s.season, festive: s.festive }, { first, why: s.why });
    if (s.weather) this.setWeather(s.weather.kind, first ? 'first' : 'join');
    this.parts?.adopt?.(s.toys ?? []);
  }

  /** Into a season (building its things), with a toast to say so. */
  apply({ season: name, festive }, { first = false, why = null } = {}) {
    const change = season.set({ season: name, festive: festive ?? null });
    if (this.parts && !change.season && !change.festive) return;
    this.parts?.dispose();
    this.parts = null;
    const Part = PARTS[season.name];
    this.parts = Part ? new Part(this) : null;
    this.look.set(season.name, null);
    if (first) this.look.snap();
    if (!first && (change.season || change.festive)) {
      const [head, blurb] = SEASON_SAY[season.christmas ? 'christmas' : season.name];
      this.hud.showToastRaw(SEASON_INFO[season.name].emoji, head, why === 'set' && this.pack?.net && this.host !== this.me() ? `${this.hostName || 'Your pack'} changed the season. ${blurb}` : blurb);
    }
  }

  setWeather(kind, why = null) {
    if (!WEATHER_INFO[kind]) return;
    const was = season.weather, change = season.set({ weather: kind });
    this.look.set(null, kind);
    if (!change.weather || why === 'first' || why === 'join') return;
    let say = WEATHER_SAY[kind];
    if (kind === 'clear') {
      say = was === 'showers' ? WEATHER_SAY.clearAfterRain : was === 'snow' ? WEATHER_SAY.clearAfterSnow : WEATHER_SAY.clearAfterWind;
      if (was === 'showers') this.fx.showRainbow();
    }
    const [emoji, head, blurb] = pick(say);
    this.hud.showToastRaw(emoji, head, blurb);
  }

  // ---------- picking a season (☰ → Seasons) ----------

  /** The season setting changed: 'auto' or a season. In a pack only the season picker can change it for everyone. */
  choose(choice) {
    setSetting('season', choice);
    const want = resolveSeason(choice);
    if (this.pack?.net && this.host !== this.me()) { this.handle({ a: 'nope', hostName: this.hostName }); return; }
    this.send({ a: 'set', ...want });
  }

  /** The season picker asks for some weather. */
  wish(kind) {
    if (this.pack?.net && this.host !== this.me()) { this.handle({ a: 'nope', hostName: this.hostName }); return; }
    this.send({ a: 'weather', kind });
  }

  showCard() {
    showSeasonCard(this.hud, {
      season: season.name, festive: season.festive, weather: season.weather, choice: getSettings().season ?? 'auto',
      picker: !this.pack?.net || this.host === this.me() ? null : this.hostName || 'Whoever opened the pack',
      onPick: (c) => this.choose(c), onWeather: (k) => this.wish(k),
    });
  }

  // ---------- per frame ----------

  /** How high the visible ground is at (x, z) (for prints and things set down on it). */
  surfaceY(x, z) {
    const h = this.parts?.heightAt?.(x, z) ?? 0;
    return h > 0.02 ? h + 0.02 : groundY(this.world, x, z);
  }

  update(dt, f = {}) {
    if (!this.pack?.net && this.online) this.reset(); // lost the pack: carry on with a season of our own
    if (this.room) this.deliver(this.room.tick(performance.now()));
    this.look.update(dt);
    const w = season.weather, name = season.name;
    this.fx.update(dt, this.camera, {
      rain: w === 'showers' ? 1 : 0,
      snow: w === 'snow' ? 1 : name === 'winter' ? 0.05 : 0,   // (a few flakes drift about all winter)
      leaves: w === 'windy' ? 1 : name === 'autumn' ? 0.15 : name === 'spring' ? 0.08 : 0,
      wind: w === 'windy' ? 1 : w === 'showers' ? 0.3 : w === 'snow' ? 0.15 : 0,
    }, LEAF_COLORS[name]);
    // Paw prints in the snow, behind every dog.
    const snowy = seasonUniforms.uSnow.value > 0.45, P = this.player, surf = (x, z) => this.surfaceY(x, z);
    this.prints.follow('me', P.pos, P.heading, P.dog.breed.size, snowy && P.grounded && !P.inWater && !P.sledging, surf);
    for (const r of this.remotes?.dogs.values() ?? []) {
      const last = r.buf?.[r.buf.length - 1];
      this.prints.follow(r.id, r.dog.root.position, r.dog.root.rotation.y, r.dog.breed.size, snowy && r.dog.root.visible && !!last && !(last.f & (4 | 8 | 32)), surf);
    }
    this.prints.update(dt);
    this.puddles.update(dt, f);
    this.parts?.update(dt, f);
    // Fewer birds in the rain and in winter; no frogs on a frozen pond.
    music.setAmbient({ birds: (name === 'winter' ? 0.3 : 1) * (w === 'showers' ? 0.25 : w === 'snow' ? 0.4 : 1) });
    if (name === 'winter') music.setAmbient({ frogs: 0 });
    // The grass that follows the dog about pokes up through the snow (just).
    const grass = this.world.grass?.mesh;
    if (grass) grass.scale.y = 1 - Math.min(1, seasonUniforms.uSnow.value) * 0.55;
  }

  onDig(nose) { return !!this.parts?.onDig?.(nose); }
  onBark(pos) { this.parts?.onBark?.(pos); }
  get prompt() { return this.parts?.prompt ?? this.puddles.prompt ?? null; }
  get pawAct() { return this.parts?.pawAct ?? null; }

  dispose() {
    this.parts?.dispose();
    this.fx.dispose();
    this.prints.dispose();
    this.puddles.dispose();
    this.look.restore();
  }
}
