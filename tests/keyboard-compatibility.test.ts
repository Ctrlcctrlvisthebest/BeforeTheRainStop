import test from "node:test";
import assert from "node:assert/strict";
import {
  bindGameKeyboard,
  gameKeyCode,
  KeyboardInput,
} from "../src/keyboard-input";
import { MAX_FOLDS, newGame, stepGame } from "../src/game";
import { bankPoint, CROSSINGS } from "../src/bridges";

function withKeyboard(
  run: (
    keyboard: KeyboardInput,
    key: (
      type: string,
      data: KeyboardEventInit & { keyCode?: number },
    ) => Event,
    target: EventTarget,
  ) => void,
) {
  const previous = ["window", "document"].map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: target,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: new EventTarget(),
  });
  const keyboard = new KeyboardInput();
  const unbind = bindGameKeyboard(keyboard, {
    enabled: () => true,
    escape() {},
  });
  const key = (
    type: string,
    data: KeyboardEventInit & { keyCode?: number },
  ) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      code: "",
      key: "",
      location: 0,
      repeat: false,
      shiftKey: false,
      ...data,
    });
    target.dispatchEvent(event);
    return event;
  };
  try {
    run(keyboard, key, target);
  } finally {
    unbind();
    ["window", "document"].forEach((name, i) => {
      if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

test("keyboard fallback keeps physical layouts and supports missing codes, locations and legacy events", () => {
  for (const [event, expected] of [
    [{ code: "KeyQ", key: "a" }, "KeyQ"],
    [{ code: "", key: "B" }, "KeyB"],
    [{ code: "Unidentified", key: "Shift", location: 2 }, "ShiftRight"],
    [{ code: "Shift", key: "Shift", location: 1 }, "ShiftLeft"],
    [{ key: "Shift" }, "Shift"],
    [{ key: "Unidentified", keyCode: 16 }, "Shift"],
    [{ keyCode: 66 }, "KeyB"],
    [{ key: " " }, "Space"],
    [{ key: "Esc" }, "Escape"],
    [{ keyCode: 39 }, "ArrowRight"],
    [{ code: "Numpad1", key: "b" }, "Numpad1"],
  ] as const)
    assert.equal(gameKeyCode(event as unknown as KeyboardEvent), expected);
});

for (const data of [
  { code: "ShiftLeft", key: "Shift", shiftKey: true },
  { key: "Shift", shiftKey: true },
  { code: "Unidentified", key: "Shift", location: 2, shiftKey: true },
  { keyCode: 16, shiftKey: true },
  { code: "KeyB", key: "b" },
  { key: "B" },
])
  test(`${JSON.stringify(data)} lowers the bridge with one continuous hold`, () => {
    withKeyboard((keyboard, key) => {
      const game = newGame(1, 1),
        player = game.players[0];
      Object.assign(player, bankPoint(CROSSINGS[1], CROSSINGS[1].near));
      assert.equal(key("keydown", data).defaultPrevented, true);
      for (let i = 0; i < 125; i++) {
        if (i % 10 === 0) key("keydown", { ...data, repeat: true });
        stepGame(game, { 0: keyboard.read((i * 1000) / 60) });
      }
      assert.equal(game.bridgeLatched, true);
      assert.equal(player.foldsLeft, MAX_FOLDS - 1);
      key("keyup", { ...data, shiftKey: false });
      assert.equal(keyboard.read(2100).fold, false);
      stepGame(game, { 0: keyboard.read(2100) });
      assert.equal(player.bridgeDock, false);
    });
  });

test("two Shift keys and B remain independent; an anonymous Shift release does not leave folding stuck", () => {
  withKeyboard((keyboard, key) => {
    key("keydown", { code: "ShiftLeft", shiftKey: true });
    key("keydown", { code: "ShiftRight", shiftKey: true });
    key("keyup", { code: "ShiftLeft", shiftKey: true });
    assert.equal(keyboard.read(0).fold, true);
    key("keyup", { key: "Shift", shiftKey: false });
    assert.equal(keyboard.read(0).fold, false);
    key("keydown", { code: "KeyB" });
    key("keydown", { key: "Shift", shiftKey: true });
    key("keyup", { key: "Shift", shiftKey: false });
    assert.equal(keyboard.read(0).fold, true);
    key("keyup", { code: "KeyB" });
    assert.equal(keyboard.read(0).fold, false);
  });
});

test("B does not steal browser shortcuts or revive a hold after focus loss", () => {
  withKeyboard((keyboard, key, target) => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"])
      assert.equal(
        key("keydown", { key: "b", [modifier]: true }).defaultPrevented,
        false,
      );
    assert.equal(keyboard.read(0).fold, false);
    key("keydown", { key: "b" });
    target.dispatchEvent(new Event("blur"));
    key("keydown", { key: "b", repeat: true });
    assert.equal(keyboard.read(0).fold, false);
    key("keyup", { key: "b" });
    key("keydown", { key: "b" });
    assert.equal(keyboard.read(0).fold, true);
  });
});
