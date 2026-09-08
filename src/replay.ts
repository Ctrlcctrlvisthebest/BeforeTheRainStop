import { idleInput, newGame, stepGame, type Game, type Input } from "./game";

export const MAX_REPLAY_TICKS = 60 * 60 * 2 * 60;
export const MAX_REPLAY_SEGMENTS = 32768;
export type Replay = [mask: number, frames: number][];
const flags = ["jump", "fold", "turn", "reset", "shelter", "repair"] as const;
export function inputMask(input: Input) {
  return flags.reduce(
    (mask, field, i) => mask | (Number(input[field]) << (i + 2)),
    input.axis + 1,
  );
}
export function maskInput(mask: number): Input {
  const input = idleInput();
  input.axis = (mask & 3) - 1;
  flags.forEach((field, i) => (input[field] = !!(mask & (1 << (i + 2)))));
  return input;
}
export class ReplayRecorder {
  private id = "";
  private ticks = 0;
  private entries: Replay = [];
  private exhausted = false;
  record(game: Game, input: Input) {
    if (game.id !== this.id) {
      this.id = game.id;
      this.ticks = 0;
      this.entries = [];
      this.exhausted = false;
    }
    if (game.status !== "playing" || this.exhausted) return;
    if (game.tick !== this.ticks || this.ticks >= MAX_REPLAY_TICKS) {
      this.exhausted = true;
      return;
    }
    const mask = inputMask(input);
    const last = this.entries.at(-1);
    if (last?.[0] === mask) last[1]++;
    else {
      if (this.entries.length >= MAX_REPLAY_SEGMENTS) {
        this.exhausted = true;
        return;
      }
      this.entries.push([mask, 1]);
    }
    this.ticks++;
  }
  snapshot(game: Game): Replay | null {
    return !this.exhausted &&
      game.id === this.id &&
      game.tick === this.ticks &&
      game.status === "won"
      ? this.entries.map(([mask, frames]) => [mask, frames])
      : null;
  }
}
export function verifyReplay(level: number, value: unknown): Game {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_REPLAY_SEGMENTS
  )
    throw new Error("通关过程无效");
  let total = 0;
  for (const part of value) {
    if (
      !Array.isArray(part) ||
      part.length !== 2 ||
      !Number.isInteger(part[0]) ||
      part[0] < 0 ||
      part[0] > 255 ||
      (part[0] & 3) === 3 ||
      !Number.isSafeInteger(part[1]) ||
      part[1] < 1
    )
      throw new Error("通关过程无效");
    total += part[1];
    if (total > MAX_REPLAY_TICKS) throw new Error("通关过程过长");
  }
  const game = newGame(1, level);
  for (const [mask, frames] of value as Replay) {
    const inputs = { 0: maskInput(mask) };
    for (let i = 0; i < frames; i++) {
      if (game.status === "won") throw new Error("通关过程包含多余操作");
      stepGame(game, inputs);
    }
  }
  if (game.status !== "won") throw new Error("尚未完成本关");
  return game;
}
