import { LEVELS, type Game } from "./game";

export type GameCue = "bridge-ready" | "gate-open" | "exit-open";

/** Observe authoritative snapshots, never the locally predicted scene. A new
 * run/rejoin only establishes a baseline, so an already-open gate stays quiet. */
export function createGameAudioEvents() {
  let previous:
    | {
        id: string;
        level: number;
        bridge: boolean;
        gate: boolean;
        exit: boolean;
      }
    | undefined;
  return {
    observe(game: Game): GameCue[] {
      const keyCount = LEVELS[game.level]?.keys.length ?? 0;
      const next = {
        id: game.id,
        level: game.level,
        bridge: !!game.bridgeLatched,
        gate: !!game.gateOpen,
        exit: keyCount > 0 && game.keys.length >= keyCount,
      };
      const cues: GameCue[] = [];
      if (previous?.id === next.id && previous.level === next.level) {
        if (!previous.bridge && next.bridge) cues.push("bridge-ready");
        // The gate opens when the stone-plate hold completes: one sound for
        // this event, rather than separate plate and gate sounds overlapping.
        if (!previous.gate && next.gate) cues.push("gate-open");
        if (!previous.exit && next.exit) cues.push("exit-open");
      }
      previous = next;
      return cues;
    },
  };
}
