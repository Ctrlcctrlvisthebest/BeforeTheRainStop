import test from "node:test";
import assert from "node:assert/strict";
import { api, Connection, validSession } from "../src/api";
import { idleInput, type Inputs } from "../src/game";
import { makeRoom, publicRoom, type PublicRoom } from "../src/room";
import type { RoomServerMessage } from "../src/room-protocol";
import { rankingRequest, RankingError } from "../src/ranking-client";

const session = {
  code: "ABCDEFGH",
  token: "12345678-1234-1234-1234-123456789abc",
  slot: 0,
};
const stateMessage = {
  type: "state",
  room: publicRoom(makeRoom(session.code, 2, 0, "纸鹤", session.token, 1000)),
  inputs: { 0: idleInput() },
} satisfies RoomServerMessage;
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
test("late callbacks from a closed connection cannot change a new room or send input", (t) => {
  const { connection, socket, states, statuses, errors } = connectedSocket(t);
  const callbacks = {
    open: socket.onopen!,
    message: socket.onmessage!,
    close: socket.onclose!,
    error: socket.onerror!,
  };
  callbacks.open();
  assert.equal(JSON.parse(socket.sent[0]).type, "hello");
  callbacks.message({ data: JSON.stringify(stateMessage) });
  assert.equal(states.length, 1);
  connection.close();
  callbacks.open();
  callbacks.message({ data: JSON.stringify(stateMessage) });
  callbacks.message({ data: "bad-json" });
  callbacks.close({ code: 1008 });
  callbacks.error();
  connection.input("old-game", idleInput());
  assert.equal(states.length, 1);
  assert.deepEqual(statuses, [true]);
  assert.deepEqual(errors, []);
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.onmessage, null);
});

function connectedSocket(
  t: test.TestContext,
  receive?: (room: PublicRoom, inputs: Inputs) => void,
) {
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
  const states: { room: PublicRoom; inputs: Inputs }[] = [];
  const statuses: boolean[] = [];
  const errors: string[] = [];
  const connection = new Connection(
    session,
    (room, inputs) => {
      states.push({ room, inputs });
      receive?.(room, inputs);
    },
    (online) => statuses.push(online),
    (error) => errors.push(error),
  );
  t.after(() => {
    connection.close();
    globalThis.WebSocket = previousSocket;
    if (previousLocation)
      Object.defineProperty(globalThis, "location", previousLocation);
    else Reflect.deleteProperty(globalThis, "location");
  });
  return {
    connection,
    socket: Socket.instances.at(-1)!,
    states,
    statuses,
    errors,
  };
}

test("state, error and pong messages follow the room service contract", (t) => {
  const { socket, states, statuses, errors } = connectedSocket(t);
  socket.onmessage!({ data: JSON.stringify(stateMessage) });
  assert.deepEqual(states, [
    { room: stateMessage.room, inputs: stateMessage.inputs },
  ]);
  assert.deepEqual(statuses, [true]);
  socket.onmessage!({
    data: JSON.stringify({ type: "error", error: "房间已过期" }),
  });
  socket.onmessage!({ data: JSON.stringify({ type: "pong", t: 1000 }) });
  assert.deepEqual(errors, ["房间已过期"]);
  assert.equal(states.length, 1);
});

test("invalid JSON and messages missing mandatory fields never supply default inputs", (t) => {
  const { socket, states, statuses, errors } = connectedSocket(t);
  const invalid = [
    "bad-json",
    JSON.stringify(null),
    JSON.stringify([]),
    JSON.stringify({ type: "state", room: stateMessage.room }),
    JSON.stringify({ type: "state", room: stateMessage.room, inputs: null }),
    JSON.stringify({ type: "state", room: stateMessage.room, inputs: [] }),
    JSON.stringify({ type: "state", inputs: stateMessage.inputs }),
    JSON.stringify({ type: "error" }),
    JSON.stringify({ type: "error", error: 100 }),
    JSON.stringify({ type: "unexpected" }),
  ];
  for (const data of invalid) socket.onmessage!({ data });
  assert.deepEqual(
    errors,
    invalid.map(() => "收到无效的同步消息"),
  );
  assert.deepEqual(states, []);
  assert.deepEqual(statuses, []);
});

test("a consumer failure propagates its original error instead of reporting invalid JSON", (t) => {
  const failure = new Error("state consumer failed");
  const { socket, errors } = connectedSocket(t, () => {
    throw failure;
  });
  assert.throws(
    () => socket.onmessage!({ data: JSON.stringify(stateMessage) }),
    (error: unknown) => error === failure,
  );
  assert.deepEqual(errors, []);
});

test("reconnection ignores callbacks from the replaced socket and restarts input sequencing", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { connection, socket, states, statuses, errors } = connectedSocket(t);
  socket.onopen!();
  connection.input("game", idleInput());
  const lateMessage = socket.onmessage!;
  socket.onclose!({ code: 1006 });
  t.mock.timers.tick(500);
  const replacement = Socket.instances.at(-1)!;
  assert.notStrictEqual(replacement, socket);
  lateMessage({ data: JSON.stringify(stateMessage) });
  assert.deepEqual(states, []);
  replacement.onopen!();
  replacement.onmessage!({ data: JSON.stringify(stateMessage) });
  connection.input("game", idleInput());
  assert.equal(JSON.parse(replacement.sent[0]).type, "hello");
  assert.equal(JSON.parse(replacement.sent[1]).seq, 1);
  assert.equal(states.length, 1);
  assert.deepEqual(statuses, [false, true]);
  assert.deepEqual(errors, []);
});

test("room entry endpoints return their required seat and token fields", async () => {
  const original = globalThis.fetch;
  const entry = {
    room: stateMessage.room,
    token: session.token,
    slot: session.slot,
  };
  globalThis.fetch = async () => Response.json(entry);
  try {
    const created = await api("/rooms", {
      capacity: 2,
      level: 0,
      name: "纸鹤",
      playerToken: session.token,
    });
    const joined = await api(`/rooms/${session.code}/join`, {
      name: "纸鹤",
      playerToken: session.token,
    });
    const token: string = created.token;
    const slot: number = joined.slot;
    assert.equal(token, session.token);
    assert.equal(slot, session.slot);
    assert.deepEqual(created, entry);
    assert.deepEqual(joined, entry);
  } finally {
    globalThis.fetch = original;
  }
});

test("room HTTP errors retain their service message and malformed JSON retains its parsing error", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ error: "房间不存在或已过期" }, { status: 404 });
    await assert.rejects(api(`/rooms/${session.code}`), {
      message: "房间不存在或已过期",
    });
    globalThis.fetch = async () =>
      new Response("invalid-json", { status: 503 });
    await assert.rejects(api(`/rooms/${session.code}`), SyntaxError);
  } finally {
    globalThis.fetch = original;
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
