import * as THREE from 'three';
import { sfx } from '../../core/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * The great escape: dive into the tunnel, pop up on the other side of the fence, shake off the
 * mud and gallop away. Returns a per-frame function; calls onDone() at the end.
 */
export function escapeCutscene({ player: P, follow, hud, actions, spot, outside, onFree, onDone }) {
  P.frozen = true;
  P.lockY = true;
  hud.setPrompt('');
  sfx.tunnel();
  let t = 0, stage = 0;
  const dog = P.dog.root;
  const startY = dog.position.y;
  P.heading = 0; // face the fence
  return (dt) => {
    t += dt;
    if (stage === 0) {
      // Dive head first into the hole.
      const k = Math.min(1, t / 0.9);
      dog.position.y = startY - k * 0.9;
      P.dog.body.rotation.x = 0.9 * Math.sin(k * Math.PI * 0.5);
      if (Math.random() < 0.5) actions.dirtBurst(spot.pos, 2);
      if (k >= 1) { stage = 1; t = 0; }
    } else if (stage === 1) {
      if (t > 0.9) {
        // Pop out on the other side.
        P.ignoreBounds = true;
        P.pos.set(outside.x, -0.9, outside.z);
        follow.yaw = Math.PI * 0.85;
        stage = 2; t = 0;
        sfx.pop();
        actions.dirtBurst(outside, 20);
      }
    } else if (stage === 2) {
      const k = Math.min(1, t / 0.5);
      dog.position.y = -0.9 + k * 0.9;
      P.dog.body.rotation.x = -0.4 * (1 - k);
      if (k >= 1) {
        stage = 3; t = 0;
        P.happy = 1;
        P.dog.shake();
        sfx.shake();
        hud.float('FREEDOM!', actions.anchor());
        onFree?.();
      }
    } else if (stage === 3 && t > 1.6) {
      stage = 4; t = 0;
      P.scripted = { target: V(outside.x + 2, 0, outside.z + 7), run: true };
      sfx.hooray();
    } else if (stage === 4 && t > 2.2) {
      P.scripted = null;
      onDone();
    }
  };
}
