import {
  LEVELS,
  idleInput,
  newGame,
  platformAt,
  stepGame,
  activeHazard,
  type Game,
  type Input,
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
) {
  const g = newGame(1, level),
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
  const tick = (partial: Partial<Input> = {}, frames = 1) => {
    for (let i = 0; i < frames; i++) {
      const input = { ...idleInput(), ...partial };
      beforeStep?.(g, input);
      stepGame(g, { 0: input });
      observe?.(g);
      if (p.deaths)
        throw new Error(`chapter ${level + 1} ${p.lastFailure}: ${detail()}`);
    }
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
  tick({}, startDelay);
  for (const [index, s] of GUIDE_ROUTES[level].entries()) {
    stage = `${index} ${s.kind}`;
    if (s.kind === "key" && g.keys.includes(s.id!)) continue;
    if (g.view !== s.view) {
      tick({ turn: true });
      tick({}, 55);
    }
    const axis = g.view === 0 ? "x" : "z";
    if (s.kind === "wind") {
      move(s.from![axis]);
      until(() => p.y > s.target.y + 0.9);
      move(s.target[axis], true);
      land();
    } else if (s.kind === "bridge") {
      const c = CROSSINGS[level];
      move(bankPoint(c, c.near)[axis]);
      tick({ fold: true }, 130);
      tick({}, 8);
      move(s.target[axis]);
      if (!g.bridgeLatched) throw new Error("unlatched bridge");
    } else if (s.kind === "ferry") {
      const platform = l.platforms[s.id!],
        sign = Math.sign(s.target[axis] - p[axis]);
      // Board only while the ferry is approaching; wait under paper if needed.
      until(
        () =>
          Math.abs(platformAt(platform, g.motionTime)[axis] - p[axis]) < 3.5,
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
      until(
        () => s.requiredKey === undefined || g.keys.includes(s.requiredKey),
        () => ({ shelter: true }),
      );
      until(
        () => Math.abs(s.target[axis] - p[axis]) < 4.3,
        () => ({ shelter: true }),
      );
      tick();
      move(s.target[axis], true);
      land();
    } else if (s.kind === "pads") {
      move(s.target[axis]);
      tick({ shelter: true }, 250);
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
