import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  MODES,
  idleInput,
  newGame,
  stepGame,
  type Mode,
} from "../src/game";
import {
  LocalRecords,
  RECORDS_KEY,
  bestTimeFor,
  formatTime,
} from "../src/records";
import { completeLevel } from "./journey";

function withStorage(
  run: (disk: Map<string, string>, writes: () => number) => void,
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const disk = new Map<string, string>();
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => disk.get(key) ?? null,
      setItem(key: string, value: string) {
        writes++;
        disk.set(key, value);
      },
    },
  });
  try {
    run(disk, () => writes);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}
function finish(seconds: number, level = 0, mode: Mode = 1) {
  const game = newGame(mode, level, crypto.randomUUID());
  game.status = "won";
  game.time = seconds;
  return game;
}

test("first completion persists; only a strictly faster run replaces it", () =>
  withStorage((_disk, writes) => {
    const records = new LocalRecords();
    const first = finish(65.432);
    const result = records.record(first)!;
    assert.equal(result.timeMs, 65432);
    assert.equal(result.previousMs, undefined);
    assert.equal(result.improved, true);
    assert.equal(result.persisted, true);
    assert.equal(
      records.record(first),
      null,
      "duplicate snapshots do not repeat the result",
    );
    assert.equal(writes(), 1);
    assert.equal(records.record(finish(80))!.improved, false);
    assert.equal(records.record(finish(65.432))!.improved, false);
    assert.equal(writes(), 1, "ties and slower runs do not write storage");
    const faster = records.record(finish(65.416))!;
    assert.equal(faster.previousMs, 65432);
    assert.equal(faster.bestMs, 65416);
    assert.equal(faster.improved, true);
    assert.equal(writes(), 2);
    assert.equal(
      bestTimeFor(new LocalRecords().times, 0, 1),
      65416,
      "refresh restores the best",
    );
  }));

test("all chapters and player counts have independent records", () =>
  withStorage(() => {
    const records = new LocalRecords();
    for (const mode of MODES)
      for (let level = 0; level < LEVELS.length; level++)
        records.record(finish(60 + level + mode, level, mode));
    const loaded = new LocalRecords();
    assert.equal(
      Object.keys(loaded.times).length,
      LEVELS.length * MODES.length,
    );
    for (const mode of MODES)
      for (let level = 0; level < LEVELS.length; level++)
        assert.equal(
          bestTimeFor(loaded.times, level, mode),
          (60 + level + mode) * 1000,
        );
  }));

test("real journeys record only the final win and use the existing simulation clock", () =>
  withStorage((_disk, writes) => {
    const records = new LocalRecords();
    for (let level = 0; level < LEVELS.length; level++) {
      let completions = 0;
      const game = completeLevel(level, (g) => {
        const result = records.record(g);
        if (g.status === "playing") assert.equal(result, null);
        if (result) completions++;
      });
      assert.equal(completions, 1);
      assert.equal(
        bestTimeFor(records.times, level, 1),
        Math.round(game.time * 1000),
      );
      const frozen = game.time;
      stepGame(game, {});
      assert.equal(game.time, frozen, "results-screen time is not added");
      assert.equal(records.record(game), null);
    }
    assert.equal(writes(), LEVELS.length);
  }));

test("deaths and checkpoint returns keep elapsed time; full restart starts at zero", () =>
  withStorage(() => {
    const game = newGame(1);
    for (let n = 0; n < 120; n++) stepGame(game, {});
    Object.assign(game.players[0], { x: 100, y: -8 });
    stepGame(game, {});
    assert.equal(game.players[0].deaths, 1);
    assert.ok(game.time > 2);
    stepGame(game, { 0: { ...idleInput(), reset: true } });
    assert.equal(game.players[0].deaths, 2);
    assert.ok(game.time > 2);
    assert.equal(new LocalRecords().record(game), null);
    assert.equal(newGame(1).time, 0);
  }));

test("one arrived teammate is not a team completion", () =>
  withStorage((_disk, writes) => {
    const records = new LocalRecords();
    const game = newGame(2);
    game.keys = game.savedKeys = [0];
    Object.assign(game.players[0], LEVELS[0].exit);
    stepGame(game, {});
    assert.equal(game.players[0].arrived, true);
    assert.equal(records.record(game), null);
    Object.assign(game.players[1], LEVELS[0].exit);
    stepGame(game, {});
    assert.equal(records.record(game)?.persisted, true);
    assert.equal(bestTimeFor(records.times, 0, 1), undefined);
    assert.equal(writes(), 1);
  }));

test("a stale tab preserves faster bests and other chapters saved by another tab", () =>
  withStorage(() => {
    const oldTab = new LocalRecords();
    const otherTab = new LocalRecords();
    otherTab.record(finish(30));
    otherTab.record(finish(90, 1, 6));
    assert.equal(oldTab.record(finish(40))!.improved, false);
    oldTab.record(finish(20, 2));
    const loaded = new LocalRecords();
    assert.equal(bestTimeFor(loaded.times, 0, 1), 30000);
    assert.equal(bestTimeFor(loaded.times, 1, 6), 90000);
    assert.equal(bestTimeFor(loaded.times, 2, 1), 20000);
  }));

test("corrupt records, invalid durations, and non-game chapter slots cannot poison bests", () =>
  withStorage((disk, writes) => {
    for (const raw of ["broken-json", "null", "[]", '"string"', "1"]) {
      disk.set(RECORDS_KEY, raw);
      assert.deepEqual(new LocalRecords().times, {});
    }
    disk.set(
      RECORDS_KEY,
      JSON.stringify({
        [`1:${LEVELS[0].name}`]: 1000,
        [`2:${LEVELS[0].name}`]: "1000",
        [`3:${LEVELS[0].name}`]: -1,
        [`6:${LEVELS[0].name}`]: 0,
        "1:unknown-map": 10,
      }),
    );
    const records = new LocalRecords();
    assert.equal(Object.keys(records.times).length, 1);
    for (const seconds of [0, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER])
      assert.equal(records.record(finish(seconds)), null);
    for (const level of [-1, 0.5, LEVELS.length, Infinity])
      assert.equal(records.record({ ...finish(1), level }), null);
    assert.equal(records.record({ ...finish(1), mode: 4 as Mode }), null);
    assert.equal(writes(), 0);
  }));

test("blocked storage keeps in-memory bests and reports that they were not saved", () =>
  withStorage(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    const records = new LocalRecords();
    assert.equal(records.record(finish(30))!.persisted, false);
    const slower = records.record(finish(40))!;
    assert.equal(slower.bestMs, 30000);
    assert.equal(slower.improved, false);
    assert.equal(slower.persisted, false);
  }));

test("a write quota failure retains the previous saved best", () =>
  withStorage((disk) => {
    new LocalRecords().record(finish(30));
    const original = disk.get(RECORDS_KEY);
    localStorage.setItem = () => {
      throw new Error("quota");
    };
    const result = new LocalRecords().record(finish(20))!;
    assert.equal(result.bestMs, 20000);
    assert.equal(result.persisted, false);
    assert.equal(disk.get(RECORDS_KEY), original);
  }));

test("time display rounds to one decimal and carries into the next minute", () => {
  assert.equal(formatTime(0), "00:00.0");
  assert.equal(formatTime(59949), "00:59.9");
  assert.equal(formatTime(59950), "01:00.0");
  assert.equal(formatTime(59999), "01:00.0");
  assert.equal(formatTime(60000), "01:00.0");
  assert.equal(formatTime(65416), "01:05.4");
  assert.equal(formatTime(65450), "01:05.5");
  assert.equal(formatTime(3600000), "60:00.0");
  assert.equal(formatTime(NaN), "—");
});
