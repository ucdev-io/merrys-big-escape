// 🏕️ The den in the Woods, built by every dog in a town together. The server keeps how many sticks are in
// it with the town's save (server/rooms.js); playing without a server, the device keeps its own count.
// Shared by the server and the game, so: no three.js in here.

export const DEN_DONE = 12;                              // sticks for a finished den
export const DEN_STAGES = [3, 8, 12, 16, 20, 25, 30];    // something new to see at each of these
export const DEN_FULL = 30;                              // the grandest den there is; after that…
export const DEN_MAX = 40;                               // …sticks go on the woodpile, up to this many
export const STICK_GAP_MS = 1500;                        // (one stick per dog this often, at most)

/** A den count from anywhere (a save, a message): a whole number from 0 to DEN_MAX. */
export const cleanDen = (n) => Math.max(0, Math.min(DEN_MAX, Math.floor(Number(n) || 0)));

/** The newest milestone reached with n sticks (0 for none yet). */
export const denStage = (n) => DEN_STAGES.filter((s) => n >= s).pop() ?? 0;
