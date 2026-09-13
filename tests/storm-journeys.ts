import {
  LEVELS,
  idleInput,
  newGame,
  platformAt,
  stepGame,
  activeHazard,
  type Game,
  type Input,
  type Mode,
} from "../src/game";
import { GUIDE_ROUTES } from "../src/guide";
import { bankPoint, CROSSINGS } from "../src/bridges";

// Follow the exported map's public instructions with ordinary controls. This
// catches missing landings, uncollectable ferry keys and misleading route points.
export function completeStormLevel(
  level: number,
  observe?: (g: Game) => void,
  beforeStep?: (g: Game, input: Input) => void,
  startDelay = 0,
  mode: Mode = 1,
) {
  const g = newGame(mode, level),
    p = g.players[0],
    l = LEVELS[level];
  let stage = "spawn";
  const detail = () =>
    JSON.stringify({
      stage,
      x: p.x,
      y: p.y,
      z: p.z,
      wet: p.wetness,
      heat: p.heat,
      checkpoint: p.checkpoint,
      support: p.support,
      time: g.time,
      keys: g.keys,
    });
  const tick = (
    partial: Partial<Input> = {},
    frames = 1,
    perPlayer?: (slot: number) => Partial<Input>,
  ) => {
    for (let i = 0; i < frames; i++) {
      const input = { ...idleInput(), ...partial };
      beforeStep?.(g, input);
      stepGame(
        g,
        Object.fromEntries(
          g.players.map((q) => [
            q.id,
            perPlayer ? { ...idleInput(), ...perPlayer(q.id) } : input,
          ]),
        ),
      );
      observe?.(g);
      const failed = g.players.find((q) => q.deaths);
      if (failed)
        throw new Error(
          `chapter ${level + 1}, slot ${failed.id} ${failed.lastFailure}: ${detail()}`,
        );
    }
  };
  const steer = (slot: number, target: number, axis: "x" | "z") => ({
    axis:
      Math.max(-1, Math.min(1, ((target - g.players[slot][axis]) * 3) / 5.3)) *
      (g.view === 0 ? 1 : -1),
  });
  const gather = (target: number, axis: "x" | "z") => {
    for (let i = 0; i < 360; i++)
      tick({}, 1, (slot) => steer(slot, target, axis));
    if (g.players.some((q) => Math.abs(q[axis] - target) > 0.01))
      throw new Error("group cannot gather " + detail());
  };
  const until = (
    done: () => boolean,
    input: () => Partial<Input> = () => ({}),
    limit = 900,
  ) => {
    for (let i = 0; i < limit; i++) {
      if (done() || g.status === "won") return;
      tick(input());
    }
    throw new Error(`chapter ${level + 1} timeout: ${detail()}`);
  };
  const land = () => {
    until(() => p.grounded);
    tick({}, 4);
  };
  const move = (target: number, jump = false) => {
    const axis = g.view === 0 ? "x" : "z",
      sign = Math.sign(target - p[axis]);
    const other = axis === "x" ? "z" : "x";
    const fires = l.hazards.filter(
      (fire) =>
        !jump &&
        fire.period &&
        Math.abs(fire[other] - p[other]) <
          (axis === "x" ? fire.d : fire.w) / 2 + 0.3 &&
        (fire[axis] - p[axis]) * sign > 0 &&
        (target - fire[axis]) * sign > 0,
    );
    // Observe each pulse and wait for a whole crossing window. No physics state
    // is changed; low roofs require walking through during the extinguished phase.
    if (fires.length)
      until(
        () =>
          fires.every((fire) => {
            const arrival = Math.abs(fire[axis] - p[axis]) / 5.3 + 0.1;
            return [-0.3, 0, 0.3].every(
              (offset) => !activeHazard(fire.period, g.time + arrival + offset),
            );
          }),
        () => ({ shelter: true }),
      );
    until(
      () => (target - p[axis]) * sign <= 0.09,
      () => ({ axis: sign * (g.view === 0 ? 1 : -1), jump }),
      400,
    );
    tick({}, 8);
  };
  if (mode > 1) gather(l.spawn.x, "x");
  tick({}, startDelay);
  for (const [index, s] of GUIDE_ROUTES[level].entries()) {
    stage = `${index} ${s.kind}`;
    if (s.kind === "key" && g.keys.includes(s.id!)) continue;
    if (g.view !== s.view) {
      tick({ turn: true });
      tick({}, 55);
    }
    const axis = g.view === 0 ? "x" : "z";
    if (s.kind === "jump" && s.via) {
      move(s.via[axis], true);
      tick({ turn: true, jump: true });
      tick({ jump: true }, 22);
      if (p.grounded)
        throw new Error("midair turn unexpectedly found a floor " + detail());
      move(s.target[g.view === 0 ? "x" : "z"], true);
      land();
    } else if (s.kind === "wind") {
      move(s.from![axis]);
      until(() => p.y > s.target.y + 0.9);
      move(s.target[axis], true);
      land();
    } else if (s.kind === "bridge") {
      const c = CROSSINGS[level];
      move(bankPoint(c, c.near)[axis]);
      if (mode === 1) {
        tick({ fold: true }, 130);
        tick({}, 8);
        move(s.target[axis]);
      } else {
        for (let i = 0; !g.bridgeLatched && i < 500; i++)
          tick({}, 1, (slot) =>
            slot === 0 ? { fold: true } : steer(slot, s.target[axis], axis),
          );
        tick({}, 8);
        gather(s.target[axis], axis);
      }
      if (!g.bridgeLatched) throw new Error("unlatched bridge");
    } else if (s.kind === "ferry") {
      const platform = l.platforms[s.id!],
        sign = Math.sign(s.target[axis] - p[axis]),
        other = axis === "x" ? "z" : "x",
        transverse = platform.motion!.axis !== axis;
      // A deck-to-deck transfer already lands us on the next ferry.
      if (p.support !== s.id) {
        // Board only while the ferry is approaching; wait under paper if needed.
        until(
          () =>
            Math.abs(platformAt(platform, g.motionTime)[axis] - p[axis]) <
              3.5 &&
            Math.abs(
              platformAt(platform, g.motionTime + 0.9)[other] - p[other],
            ) < 0.6,
          () => ({ shelter: true }),
        );
        tick({ axis: sign * (g.view === 0 ? 1 : -1), jump: true });
        until(
          () => p.support === s.id,
          () => {
            const delta = platformAt(platform, g.motionTime)[axis] - p[axis];
            return {
              axis:
                Math.abs(delta) < 0.22
                  ? 0
                  : Math.sign(delta) * (g.view === 0 ? 1 : -1),
              jump: true,
            };
          },
          240,
        );
        tick();
      }
      const pickup =
        s.requiredKey === undefined ? undefined : l.keys[s.requiredKey];
      if (pickup && pickup.y > platform.y + 1.8) {
        until(
          () => Math.abs(pickup[axis] - p[axis]) < 1.3,
          () => ({ shelter: true }),
        );
        until(
          () => g.keys.includes(s.requiredKey!),
          () => ({
            axis:
              Math.abs(pickup[axis] - p[axis]) < 0.2
                ? 0
                : Math.sign(pickup[axis] - p[axis]) * (g.view === 0 ? 1 : -1),
            jump: true,
          }),
        );
        until(
          () => p.support === s.id,
          () => ({
            axis:
              Math.abs(platformAt(platform, g.motionTime)[axis] - p[axis]) < 0.2
                ? 0
                : Math.sign(
                    platformAt(platform, g.motionTime)[axis] - p[axis],
                  ) * (g.view === 0 ? 1 : -1),
            jump: true,
          }),
        );
        tick();
      }
      until(
        () => s.requiredKey === undefined || g.keys.includes(s.requiredKey),
        () => ({ shelter: true }),
      );
      if (s.landingId !== undefined) {
        const destination = l.platforms[s.landingId];
        until(
          () =>
            Math.abs(platformAt(destination, g.motionTime)[axis] - p[axis]) <
              3.2 &&
            Math.abs(
              platformAt(destination, g.motionTime + 0.7)[other] - p[other],
            ) < 0.35,
          () => ({ shelter: true }),
          1800,
        );
        tick({ jump: true });
        until(
          () => p.support === s.landingId && p.grounded,
          () => {
            const delta = platformAt(destination, g.motionTime)[axis] - p[axis];
            return {
              axis:
                Math.abs(delta) < 0.15
                  ? 0
                  : Math.sign(delta) * (g.view === 0 ? 1 : -1),
              jump: true,
            };
          },
          240,
        );
        tick({}, 4);
        continue;
      }
      until(
        () =>
          Math.abs(s.target[axis] - p[axis]) < (transverse ? 5.4 : 4.3) &&
          Math.abs(s.target[other] - p[other]) < 0.3,
        () => ({ shelter: true }),
      );
      tick();
      move(s.target[axis], true);
      land();
    } else if (s.kind === "pads") {
      move(s.target[axis]);
      if (mode === 1) tick({ shelter: true }, 250);
      else {
        // Each teammate walks to a real plate; no position or gate state is injected.
        const padAxis = l.pads[0].x !== l.pads[1].x ? "x" : "z";
        if (padAxis !== axis)
          throw new Error("gate approach must align with its plates");
        for (let i = 0; i < 400; i++)
          tick({}, 1, (slot) =>
            slot === 0
              ? { shelter: true }
              : Math.abs(g.players[slot][axis] - l.pads[1][axis]) < 0.1
                ? { shelter: true }
                : steer(slot, l.pads[1][axis], axis),
          );
        gather(p[axis], axis);
      }
      if (!g.gateOpen) throw new Error("gate did not open " + detail());
    } else {
      move(s.target[axis], s.kind === "jump");
      if (s.kind === "jump") land();
      if (s.kind === "rack") tick({}, 100);
    }
  }
  if (g.status !== "won") throw new Error("not won " + detail());
  return g;
}
