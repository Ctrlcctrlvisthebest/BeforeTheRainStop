import {
  newGame,
  stepGame,
  idleInput,
  platformAt,
  type Input,
  type Game,
} from "../src/game";
import { completeStormLevel } from "./storm-journeys";
export function completeExtraLevel(
  level: number,
  observe?: (g: Game) => void,
  beforeStep?: (g: Game, input: Input) => void,
) {
  if (level >= 9) return completeStormLevel(level, observe, beforeStep);
  const g = newGame(1, level),
    b = g.players[0];
  const state = () => ({
    x: +b.x.toFixed(2),
    y: +b.y.toFixed(2),
    z: +b.z.toFixed(2),
    wet: Math.round(b.wetness),
    heat: Math.round(b.heat),
    cp: b.checkpoint,
    keys: g.keys,
    ground: b.grounded,
    support: b.support,
    time: +g.time.toFixed(1),
  });
  const trace = (label: string) => {
    if (process.env.JOURNEY_TRACE) console.log(level + 1, label, state());
  };
  const tick = (input: Partial<Input> = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      const controls = { ...idleInput(), ...input };
      beforeStep?.(g, controls);
      stepGame(g, { 0: controls });
      observe?.(g);
      if (b.deaths)
        throw Error(
          `chapter ${level + 1}: ${b.lastFailure} ${JSON.stringify(state())}`,
        );
    }
  };
  const move = (target: number, jump = false, max = 400) => {
    const axis = g.view === 0 ? "x" : "z",
      sign = Math.sign(target - b[axis]);
    let n = 0;
    while (g.status !== "won" && (target - b[axis]) * sign > 0.09 && n++ < max)
      tick({ axis: sign * (g.view === 0 ? 1 : -1), jump });
    tick({}, 8);
    trace("move " + target);
    if (n >= max) throw Error("stuck " + JSON.stringify(state()));
  };
  const land = () => {
    let n = 0;
    while (!b.grounded && n++ < 300) tick();
    tick({}, 4);
    trace("land");
    if (n >= 300) throw Error("cannot land " + JSON.stringify(state()));
  };
  const turn = () => {
    tick({ turn: true });
    tick({}, 55);
    trace("turn");
  };
  // Cross a moving ferry with ordinary movement. Ride it through its key, then jump off.
  const ferry = (index: number, keyX: number, bank: number) => {
    const platform = gLevel().platforms[index];
    let n = 0;
    while (platformAt(platform, g.motionTime).x - b.x > 4.4 && n++ < 420)
      tick();
    tick({ axis: 1, jump: true });
    n = 0;
    while (b.support !== index && n++ < 160) {
      const delta = platformAt(platform, g.motionTime).x - b.x;
      tick({ axis: Math.abs(delta) < 0.25 ? 0 : Math.sign(delta), jump: true });
    }
    if (n >= 160) throw Error("missed landing " + JSON.stringify(state()));
    tick();
    trace("ferry landing");
    n = 0;
    while (
      !g.keys.includes(gLevel().keys.findIndex((k) => k.x === keyX)) &&
      n++ < 420
    )
      tick();
    trace("ride");
    if (n >= 420) throw Error("missed ferry key " + JSON.stringify(state()));
    while (bank - b.x > 4.4) tick();
    move(bank, true);
    land();
  };
  function gLevel() {
    return LEVELS[level];
  }
  if (level === 4) {
    move(3.8);
    move(8, true);
    land();
    turn();
    move(6);
    turn();
    move(12);
    tick({}, 70);
    move(13.7);
    move(15, true);
    land();
    move(17, true);
    land();
    move(19, true);
    land();
    turn();
    move(-2);
    tick({}, 80);
    turn();
    move(19.9);
    move(23, true);
    land();
    tick({}, 90);
    move(26);
    move(24);
    tick({ shelter: true }, 250);
    move(30, true);
  } else if (level === 5) {
    move(3.8);
    ferry(2, 8.5, 14);
    tick({}, 80);
    move(16);
    let n = 0;
    while (b.y < 4.2 && n++ < 300) tick();
    trace("wind");
    move(18, true);
    turn();
    move(-7);
    land();
    turn();
    move(21);
    tick({}, 100);
    move(23.6);
    ferry(7, 28, 34.5);
    move(36.5);
  } else if (level === 6) {
    move(3.8);
    move(8, true);
    land();
    turn();
    move(6);
    turn();
    move(11);
    tick({}, 70);
    move(13.4);
    tick({ fold: true }, 130);
    tick({}, 8);
    move(20);
    tick({}, 90);
    move(20.1);
    move(23, true);
    land();
    turn();
    move(12);
    turn();
    move(22);
    move(16.9, true);
    land();
    tick({}, 110);
    move(16.6);
    move(15.4, true);
    land();
    move(13.3, true);
    land();
    move(12, true);
    land();
    tick({ shelter: true }, 250);
    move(9.5);
  } else if (level === 8) {
    move(3.8);
    move(8.5, true);
    land();
    move(9);
    tick({}, 50);
    move(10);
    turn();
    move(-2);
    move(-6, true);
    land();
    move(-8);
    tick({}, 100);
    turn();
    move(11.4);
    move(14, true);
    land();
    move(18, true);
    land();
    move(22, true);
    land();
    move(26, true);
    land();
    tick({}, 100);
    move(31);
  } else if (level === 7) {
    move(3.8);
    move(7.5, true);
    move(9);
    let n = 0;
    while (b.y < 4.8 && n++ < 300) tick();
    move(12, true);
    turn();
    move(-6);
    land();
    tick({}, 100);
    move(-8);
    turn();
    move(3.7);
    move(0, true);
    land();
    tick({}, 80);
    turn();
    move(-16);
    land();
    turn();
    move(7);
    tick({}, 100);
    move(10.2);
    ferry(8, 14, 18.2);
    tick({}, 100);
    tick({ shelter: true }, 250);
    move(19.3);
    move(22.5, true);
  }
  trace("done");
  if (g.status !== "won") throw Error("not won " + JSON.stringify(state()));
  return g;
}
import { LEVELS } from "../src/game";
