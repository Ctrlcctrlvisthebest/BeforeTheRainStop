import { LEVELS, type Game } from "./game";
import { CAMPAIGN_VERSION } from "./campaign-version";

export function hasAllStars(level: number, stars: readonly number[]): boolean {
  const map = LEVELS[level];
  return (
    !!map &&
    stars.length === map.stars.length &&
    map.stars.every((_, id) => stars.includes(id))
  );
}
export function rankedClear(game: Game): boolean {
  return (
    game.rulesVersion === CAMPAIGN_VERSION &&
    game.status === "won" &&
    hasAllStars(game.level, game.stars)
  );
}
