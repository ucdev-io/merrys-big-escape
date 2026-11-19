/**
 * The web demo (`npm run demo`): plain files on a static host, no game server. Everything a dog
 * on its own can do still works (the game already copes without a server: progress stays in this
 * browser, heists, the beach, farm and den keep their own little referees). The demo just doesn't
 * try to reach a server, and leaves out the bits that are about packs on the home Wi-Fi.
 */
export const DEMO = import.meta.env.MODE === 'demo';
