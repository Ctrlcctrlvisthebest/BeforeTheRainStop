import { completeExtraLevel } from "./chapter-journeys";
import {
  newGame,
  stepGame,
  idleInput,
  type Game,
  type Input,
} from "../src/game";
export function completeLevel(
  level: number,
  observe?: (g: Game) => void,
  beforeStep?: (g: Game, input: Input) => void,
) {
  if (level >= 4) return completeExtraLevel(level, observe, beforeStep);
  const g = newGame(1, level);
  const b = g.players[0];
  function tick(i: Partial<Input> = {}, n = 1) {
    for (let j = 0; j < n; j++) {
      const input = { ...idleInput(), ...i };
      beforeStep?.(g, input);
      stepGame(g, { 0: input });
      observe?.(g);
    }
  }
  function state(label: string) {
    if (process.env.JOURNEY_TRACE)
      console.log(level + 1, label, {
        x: b.x,
        y: b.y,
        z: b.z,
        wet: b.wetness,
        heat: b.heat,
        deaths: b.deaths,
        keys: g.keys,
      });
  }
  function move(target: number, jump = false, max = 400) {
    const a = g.view === 0 ? "x" : "z",
      d = g.view === 0 ? 1 : -1;
    const sign = Math.sign(target - b[a]);
    let n = 0;
    while (g.status !== "won" && (target - b[a]) * sign > 0.09 && n++ < max)
      tick({ axis: sign * d, jump });
    tick({}, 8);
    state("move " + target);
    if (n >= max)
      throw Error(
        `stuck moving to ${target}: ${JSON.stringify({ x: b.x, y: b.y, z: b.z, deaths: b.deaths })}`,
      );
  }
  function turn() {
    tick({ turn: true });
    tick({}, 55);
    state("turn");
  }
  function waitGround(max = 300) {
    let i = 0;
    while (!b.grounded && i++ < max) tick();
    tick({}, 4);
    state("land");
  }
  if (level === 1) {
    move(3.4);
    tick({ fold: true }, 130);
    tick({}, 8);
    move(8);
  } else {
    move(3.8);
    move(level === 3 ? 7 : 7.5, true);
  }
  waitGround();
  if (level === 1) {
    move(8);
    move(9, true);
    waitGround();
    move(11.25, true);
    waitGround();
    move(11);
    turn();
    move(-1.3);
    move(-3.8, true);
    waitGround();
    move(-7);
    turn();
  } else if (level === 2) {
    move(8.3);
    let i = 0;
    while (b.y < 4.6 && i++ < 300) tick();
    state("windup");
    move(11, true);
    waitGround();
    turn();
    move(-7, true);
    turn();
    move(16, true);
    waitGround();
    tick({}, 165);
  } else {
    move(10.9, level === 3);
    waitGround();
    turn();
    if (level === 3) {
      move(-2.6);
      tick({ fold: true }, 130);
      tick({}, 8);
      move(-8);
    } else {
      move(-1.3);
      move(-3.8, true);
      waitGround();
      move(-7);
    }
    turn();
  }
  if (level === 0 || level === 1 || level === 3) {
    move(12.25);
    move(14.7, true);
    waitGround();
  }
  if (level === 3) {
    move(15);
    tick({}, 80);
    move(16);
    move(17, true);
    waitGround();
    move(19, true);
    waitGround();
  }
  if (level === 1) {
    move(16);
    tick({ shelter: true }, 250);
  }
  move(20.6);
  move(26, true);
  waitGround();
  if (level === 2) move(29);
  else if (level === 3) {
    move(27);
    tick({ repair: true }, 130);
    move(25.7);
    tick({ shelter: true }, 250);
    move(28);
    move(31, true);
  } else move(29);
  waitGround();
  state("done");
  if (g.status !== "won") throw Error("not won");
  return g;
}
