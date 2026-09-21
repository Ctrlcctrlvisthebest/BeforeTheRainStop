import test from "node:test";
import assert from "node:assert/strict";
import { Connection, validSession } from "../src/api";
import { idleInput } from "../src/game";
import { rankingRequest, RankingError } from "../src/ranking-client";

const session = {
  code: "ABCDEFGH",
  token: "12345678-1234-1234-1234-123456789abc",
  slot: 0,
};
test("restored sessions require bounded slots, room codes and actual string tokens", () => {
  assert.equal(validSession(session), true);
  for (const value of [
    null,
    [],
    {},
    { ...session, token: {} },
    { ...session, slot: -1 },
    { ...session, slot: 6 },
    { ...session, slot: 0.5 },
    { ...session, code: "../../bad" },
  ])
    assert.equal(validSession(value), false);
});

class Socket {
  static instances: Socket[] = [];
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Socket.instances.push(this);
  }
  send(message: string) {
    this.sent.push(message);
  }
  close() {
    this.readyState = 3;
  }
}
test("late callbacks from a closed connection cannot change a new room or send input", () => {
  const previousSocket = globalThis.WebSocket;
  const previousLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "http://localhost" },
  });
  let connection: Connection | undefined;
  const statuses: boolean[] = [],
    errors: string[] = [];
  let states = 0;
  try {
    connection = new Connection(
      session,
      () => states++,
      (status) => statuses.push(status),
      (error) => errors.push(error),
    );
    const socket = Socket.instances.at(-1)!;
    const callbacks = {
      open: socket.onopen!,
      message: socket.onmessage!,
      close: socket.onclose!,
      error: socket.onerror!,
    };
    callbacks.open();
    assert.equal(JSON.parse(socket.sent[0]).type, "hello");
    callbacks.message({ data: JSON.stringify({ type: "state", room: {} }) });
    assert.equal(states, 1);
    connection.close();
    callbacks.open();
    callbacks.message({ data: JSON.stringify({ type: "state", room: {} }) });
    callbacks.message({ data: "bad-json" });
    callbacks.close({ code: 1008 });
    callbacks.error();
    connection.input("old-game", idleInput());
    assert.equal(states, 1);
    assert.deepEqual(statuses, [true]);
    assert.deepEqual(errors, []);
    assert.equal(socket.sent.length, 1);
    assert.equal(socket.onmessage, null);
  } finally {
    connection?.close();
    globalThis.WebSocket = previousSocket;
    if (previousLocation)
      Object.defineProperty(globalThis, "location", previousLocation);
    else Reflect.deleteProperty(globalThis, "location");
  }
});

test("leaderboard responses reject malformed rows before reaching the interface", async () => {
  const original = globalThis.fetch;
  const entry = {
    id: "run",
    names: ["旅人"],
    timeMs: 12345,
    achievedAt: 100,
  };
  const board = { level: 0, mode: 1, entries: [entry] };
  try {
    for (const malformed of [
      null,
      [],
      {},
      { ...board, level: -1 },
      { ...board, mode: 4 },
      { ...board, entries: null },
      { ...board, entries: {} },
      { ...board, entries: [null] },
      { ...board, entries: [{ ...entry, id: {} }] },
      { ...board, entries: [{ ...entry, names: "旅人" }] },
      { ...board, entries: [{ ...entry, names: [{}] }] },
      { ...board, entries: [{ ...entry, timeMs: "12345" }] },
      { ...board, entries: [{ ...entry, timeMs: -1 }] },
      { ...board, entries: [{ ...entry, achievedAt: null }] },
    ]) {
      globalThis.fetch = async () => Response.json(malformed);
      await assert.rejects(rankingRequest("?level=0&mode=1"));
    }
    for (const valid of [board, { ...board, entries: [] }]) {
      globalThis.fetch = async () => Response.json(valid);
      assert.deepEqual(await rankingRequest("?level=0&mode=1"), valid);
    }
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(
      rankingRequest("?level=0&mode=1"),
      (error: unknown) => error instanceof RankingError && error.status === 503,
    );
  } finally {
    globalThis.fetch = original;
  }
});
