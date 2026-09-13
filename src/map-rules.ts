import type { Platform } from "./game";
import type { MapFile } from "./map-format";

export const MAX_PLATFORM_SPAN = 9;
export const MIN_INTERACTIVE_CHAPTER = 11;
// Narrow seams that can be walked across are still one continuous surface.
export const MIN_WALK_BREAK = 0.8;
const EPSILON = 1e-6;
export interface GroundRun {
  axis: "x" | "z";
  y: number;
  lane: number;
  start: number;
  end: number;
  platforms: number[];
}

/** Sweep every cross-section of the fixed floor union, including overlaps and
 * T-junctions. Bounding the entire connected component would reject short turns.
 * Raised steps are separate landings. Kind labels do not bypass the rule:
 * wall, roof and rail tops are physical surfaces too. Moving decks are checked
 * individually, because their temporary docking does not create a fixed road. */
export function oversizedGroundRuns(
  platforms: readonly Platform[],
): GroundRun[] {
  const floors = platforms
    .map((p, id) => ({ ...p, id }))
    .filter((p) => !p.motion);
  const runs = new Map<string, GroundRun>();
  for (const y of new Set(floors.map((p) => p.y))) {
    const layer = floors.filter((p) => Math.abs(p.y - y) < 0.12);
    for (const axis of ["x", "z"] as const) {
      const other = axis === "x" ? "z" : "x";
      const size = axis === "x" ? "w" : "d";
      const depth = axis === "x" ? "d" : "w";
      const edges = [
        ...new Set(
          layer.flatMap((p) => [
            p[other] - p[depth] / 2,
            p[other] + p[depth] / 2,
          ]),
        ),
      ].sort((a, b) => a - b);
      for (let i = 1; i < edges.length; i++) {
        if (edges[i] - edges[i - 1] < EPSILON) continue;
        const lane = (edges[i] + edges[i - 1]) / 2;
        const intervals = layer
          .filter((p) => Math.abs(p[other] - lane) < p[depth] / 2)
          .map((p) => ({
            start: p[axis] - p[size] / 2,
            end: p[axis] + p[size] / 2,
            id: p.id,
          }))
          .sort((a, b) => a.start - b.start);
        let run: GroundRun | undefined;
        const save = () => {
          if (run && run.end - run.start > MAX_PLATFORM_SPAN + EPSILON) {
            const key = `${axis}:${y}:${run.start}:${run.end}:${run.platforms.slice().sort((a, b) => a - b)}`;
            if (!runs.has(key)) runs.set(key, run);
          }
        };
        for (const interval of intervals) {
          if (!run || interval.start - run.end >= MIN_WALK_BREAK - EPSILON) {
            save();
            run = {
              axis,
              y,
              lane,
              start: interval.start,
              end: interval.end,
              platforms: [interval.id],
            };
          } else {
            run.end = Math.max(run.end, interval.end);
            run.platforms.push(interval.id);
          }
        }
        save();
      }
    }
  }
  return [...runs.values()];
}

export interface InteractiveModule {
  kind: "ferry" | "wind" | "bridge" | "pads";
  id: number;
}
/** Count distinct physical mechanisms used by the route, never visits, two
 * plates controlling one gate, duplicated geometry or decorative unused props. */
export function interactiveModules(map: MapFile): InteractiveModule[] {
  const modules = new Map<string, InteractiveModule>();
  for (const step of map.route) {
    if (step.kind === "ferry") {
      const p = map.level.platforms[step.id!];
      if (p?.motion && p.motion.range > 0)
        modules.set(
          `ferry:${p.x}:${p.y}:${p.z}:${p.w}:${p.d}:${p.motion.axis}:${p.motion.range}:${p.motion.period}`,
          { kind: "ferry", id: step.id! },
        );
    } else if (step.kind === "wind" && step.from) {
      const from = step.from;
      const id = map.level.winds.findIndex(
        (w) =>
          Math.abs(from.x - w.x) <= w.w / 2 &&
          Math.abs(from.z - w.z) <= w.d / 2 &&
          from.y >= w.y - 0.12 &&
          from.y <= w.y + w.height &&
          step.target.y >= from.y + 0.5 &&
          step.target.y < w.y + w.height,
      );
      if (id >= 0) {
        const w = map.level.winds[id];
        modules.set(`wind:${w.x}:${w.y}:${w.z}:${w.w}:${w.d}:${w.height}`, {
          kind: "wind",
          id,
        });
      }
    } else if (step.kind === "bridge" && map.crossing) {
      const c = map.crossing;
      const far = c[c.axis] - c.near * (c.span / 2 + 0.5);
      if (
        Math.abs(step.target[c.axis] - far) < 0.6 &&
        Math.abs(step.target.y - c.y) < 0.12
      )
        modules.set("bridge", { kind: "bridge", id: 0 });
    } else if (
      step.kind === "pads" &&
      map.level.gate &&
      map.level.pads.length
    ) {
      if (
        map.level.pads.some(
          (p) =>
            Math.hypot(p.x - step.target.x, p.z - step.target.z) < 0.6 &&
            Math.abs(p.y - step.target.y) < 0.12,
        )
      )
        modules.set("pads", { kind: "pads", id: 0 });
    }
  }
  return [...modules.values()];
}
