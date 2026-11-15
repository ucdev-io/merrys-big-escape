// Bits and pieces shared by the games and challenges (see ../games.js).

export const ord = (n) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
export const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const medal = (i) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;

/** A dog's name for this game: "You", or whoever it was (remembered, even if they've gone home). */
export const nameOf = (ctx, g, id) => (id === ctx.me() ? 'You' : g.names[id] ?? 'A dog');

/** "You 7 · Rex 9 · Kiko 4" (best first, the top three, always including you). */
export function scoreLine(ctx, g, scores, emoji) {
  const me = ctx.me(), all = new Set([me, ...Object.keys(scores).map(Number)]);
  const rows = [...all].map((id) => [id, scores[id] ?? 0]).sort((a, b) => b[1] - a[1]);
  if (rows.length === 1) return `${emoji} ${rows[0][1]}`;
  const top = rows.slice(0, 3);
  if (!top.some(([id]) => id === me)) top[2] = rows.find(([id]) => id === me);
  return `${emoji} ${top.map(([id, n]) => `${nameOf(ctx, g, id)} ${n}`).join(' · ')}`;
}

/**
 * Results for a most-wins game: { html, mine (my score), won }. Winning means beating everyone else
 * outright, with friends playing (on your own, the family records say how you did).
 */
export function scoreResults(ctx, g, scores, unit, none) {
  const me = ctx.me();
  const ids = new Set([me, ...Object.keys(g.names).map(Number), ...Object.keys(scores).map(Number)]);
  const rows = [...ids].map((id) => [id, scores[id] ?? 0]).sort((a, b) => b[1] - a[1]);
  const html = rows.some(([, n]) => n > 0)
    ? `<ol class="results">${rows.map(([id, n], i) => `<li>${medal(i)} ${esc(nameOf(ctx, g, id))} · ${n} ${unit}</li>`).join('')}</ol>`
    : `<p>${none}</p>`;
  const mine = scores[me] ?? 0, best = Math.max(0, ...rows.filter(([id]) => id !== me).map(([, n]) => n));
  return { html, mine, won: rows.length > 1 && mine > best };
}

/** Is (x, z) inside something solid (a wall, fence, tree…)? Unlike blocked(), water is fine: for ducks. */
export function solid(world, x, z, pad = 0.25) {
  const col = world.colliders;
  for (const c of col.circles) if (c.top > 0.25 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  for (const b of col.boxes) if (b.top > 0.25 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  return false;
}

/** The other dogs in the pack (that are visible), as { id, x, z }. */
export function otherDogs(ctx) {
  return [...ctx.remotes.dogs.values()].filter((r) => r.dog.root.visible).map((r) => ({ id: r.id, x: r.dog.root.position.x, z: r.dog.root.position.z }));
}
