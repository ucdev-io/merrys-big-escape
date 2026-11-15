// Stars (XP) → levels. Plain maths, shared by the game and the server.

/** Total XP needed to reach a level: 40, 120, 240, 400, 600… (each level a bit longer). */
export const xpForLevel = (level) => 20 * level * (level - 1);

export function levelForXp(xp) {
  let l = 1;
  while (xp >= xpForLevel(l + 1)) l++;
  return l;
}
