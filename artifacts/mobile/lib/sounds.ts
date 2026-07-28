// Tiny bundled feedback sound effects (success ding / gentle miss) used by
// pronunciation practice. Fire-and-forget: playback failures are silently
// ignored (haptics already give feedback), and each play uses a fresh player
// that is released when the clip ends.
import { createAudioPlayer } from "expo-audio";

/* eslint-disable @typescript-eslint/no-require-imports */
const SOURCES = {
  ding: require("../assets/sounds/ding.wav"),
  miss: require("../assets/sounds/miss.wav"),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export type SoundEffect = keyof typeof SOURCES;

export function playEffect(effect: SoundEffect): void {
  try {
    const player = createAudioPlayer(SOURCES[effect]);
    let started = false;
    player.addListener("playbackStatusUpdate", (status) => {
      if (status.playing) started = true;
      const done =
        status.didJustFinish ||
        (started && !status.playing && !status.isBuffering) ||
        (started && !status.isLoaded);
      if (done) {
        try {
          player.remove();
        } catch {
          // already released
        }
      }
    });
    player.play();
  } catch {
    // Sound is a nicety — never let it break the flow.
  }
}
