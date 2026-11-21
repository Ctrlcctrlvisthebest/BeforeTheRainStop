import type { Bird, Input } from "../src/game";
import type { RainDifficulty } from "../src/rain-difficulty";

/** Save paper during dry stops; unfold for exposed waits before the paper is soaked. */
export function shelterWhileWaiting(
  bird: Bird,
  input: Input,
  difficulty: RainDifficulty,
): Input {
  if (
    difficulty === "hard" &&
    bird.grounded &&
    !bird.folded &&
    (bird.sheltering || (bird.wetness >= 30 && bird.rainCover === "rain")) &&
    input.axis === 0 &&
    !input.jump &&
    !input.fold &&
    !input.repair
  )
    return { ...input, shelter: true };
  return input;
}
