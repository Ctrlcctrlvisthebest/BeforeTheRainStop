import type { Bird, Game } from "./game";
export type CollectibleKind = "keys" | "stars";
export function initializeCollectibles(g: Game): void {
  // Existing rooms had no ownership records; retain their old collected items as saved.
  g.savedKeys ??= [...g.keys];
  g.savedStars ??= [...g.stars];
  for (const p of g.players) {
    p.carriedKeys ??= [];
    p.carriedStars ??= [];
    p.lastDropped ??= 0;
    p.lastBanked ??= 0;
    p.bankedUntil ??= 0;
  }
}
export function collect(
  g: Game,
  p: Bird,
  kind: CollectibleKind,
  id: number,
): void {
  if (g[kind].includes(id)) return;
  g[kind].push(id);
  (kind === "keys" ? p.carriedKeys : p.carriedStars).push(id);
}
export function bankCollectibles(g: Game, p: Bird): void {
  const count = p.carriedKeys.length + p.carriedStars.length;
  if (!count) return;
  g.savedKeys = [...new Set([...g.savedKeys, ...p.carriedKeys])];
  g.savedStars = [...new Set([...g.savedStars, ...p.carriedStars])];
  p.carriedKeys = [];
  p.carriedStars = [];
  p.lastBanked = count;
  p.bankedUntil = g.time + 3;
}
export function dropCollectibles(g: Game, p: Bird): void {
  p.lastDropped = p.carriedKeys.length + p.carriedStars.length;
  p.carriedKeys = [];
  p.carriedStars = [];
  p.bankedUntil = 0;
  g.keys = [
    ...new Set([...g.savedKeys, ...g.players.flatMap((q) => q.carriedKeys)]),
  ];
  g.stars = [
    ...new Set([...g.savedStars, ...g.players.flatMap((q) => q.carriedStars)]),
  ];
}
