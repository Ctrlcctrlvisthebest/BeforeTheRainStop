import test from "node:test";
import assert from "node:assert/strict";
import { idleInput, MAX_FOLDS } from "../src/game";
import type { PublicRoom } from "../src/room";
const base = process.env.TEST_SERVER ?? "http://127.0.0.1:8788";
async function post(path: string, body: unknown) {
  const r = await fetch(base + "/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await r.json()) as any;
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
async function until(check: () => boolean, label: string) {
  const end = Date.now() + 7000;
  while (!check()) {
    if (Date.now() > end) throw Error("timeout " + label);
    await new Promise((r) => setTimeout(r, 25));
  }
}
function peer(code: string, token: string) {
  const ws = new WebSocket(
    base.replace(/^http/, "ws") + "/api/rooms/" + code + "/ws",
  );
  const p = {
    ws,
    room: null as PublicRoom | null,
    states: new Map<number, string>(),
    errors: [] as string[],
    seq: 0,
  };
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token }));
  ws.onmessage = (e) => {
    const d = JSON.parse(String(e.data));
    if (d.type === "state") {
      p.room = d.room;
      if (d.room.game)
        p.states.set(d.room.game.tick, JSON.stringify(d.room.game));
    }
    if (d.type === "error") p.errors.push(d.error);
  };
  return p;
}
for (const n of [2, 3, 6])
  test(`${n} real WebSockets: shared state, seat ownership, turn sync and reconnect`, async () => {
    const created = await post("/rooms", {
      capacity: n,
      level: 0,
      name: "host",
    });
    const sessions = [created];
    for (let i = 1; i < n; i++)
      sessions.push(
        await post(`/rooms/${created.room.code}/join`, {
          name: `player ${i + 1}`,
        }),
      );
    const peers = sessions.map((s) => peer(created.room.code, s.token));
    try {
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "connect",
      );
      peers[0].ws.send(
        JSON.stringify({ type: "command", command: { type: "start" } }),
      );
      await until(
        () => peers.every((p) => p.room?.game?.status === "playing"),
        "start",
      );
      const id = peers[0].room!.game!.id;
      peers[0].ws.send(
        JSON.stringify({
          type: "input",
          gameId: id,
          seq: ++peers[0].seq,
          slot: 1,
          input: { ...idleInput(), axis: 1, slot: 1 },
        }),
      );
      await until(() => peers[0].room!.game!.players[0].x > 0, "movement");
      peers[0].ws.send(
        JSON.stringify({
          type: "input",
          gameId: id,
          seq: ++peers[0].seq,
          input: idleInput(),
        }),
      );
      assert.equal(peers[0].room!.game!.players[1].x, -0.25);
      const common = [...peers[0].states.keys()]
        .filter((t) => peers.every((p) => p.states.has(t)))
        .at(-1)!;
      assert.ok(common > 0);
      assert.ok(
        peers.every(
          (p) => p.states.get(common) === peers[0].states.get(common),
        ),
      );
      peers[0].ws.send(
        JSON.stringify({
          type: "input",
          gameId: id,
          seq: ++peers[0].seq,
          input: { ...idleInput(), shelter: true },
        }),
      );
      await until(
        () => peers.every((p) => p.room!.game!.players[0].sheltering),
        "shelter stance",
      );
      assert.ok(peers.every((p) => p.room!.game!.players[0].wetness === 0));
      assert.ok(
        peers.every(
          (p) => p.room!.game!.players[0].foldsLeft === MAX_FOLDS - 1,
        ),
      );
      peers[0].ws.send(
        JSON.stringify({
          type: "input",
          gameId: id,
          seq: ++peers[0].seq,
          input: idleInput(),
        }),
      );
      await until(
        () => peers.every((p) => !p.room!.game!.players[0].sheltering),
        "release shelter",
      );
      const sendGuest = (input: ReturnType<typeof idleInput>) =>
        peers[1].ws.send(
          JSON.stringify({
            type: "input",
            gameId: id,
            seq: ++peers[1].seq,
            input,
          }),
        );
      sendGuest({ ...idleInput(), fold: true });
      await until(
        () =>
          peers.every(
            (p) => p.room!.game!.players[1].foldsLeft === MAX_FOLDS - 1,
          ),
        "fold durability",
      );
      sendGuest({ ...idleInput(), repair: true });
      await until(
        () => peers.every((p) => p.room!.game!.players[1].repairProgress > 0),
        "repair begins",
      );
      await until(
        () =>
          peers.every((p) => p.room!.game!.players[1].foldsLeft === MAX_FOLDS),
        "repair synchronized",
      );
      sendGuest(idleInput());
      peers[1].ws.send(
        JSON.stringify({
          type: "input",
          gameId: id,
          seq: ++peers[1].seq,
          input: { ...idleInput(), turn: true },
        }),
      );
      await until(() => peers.every((p) => p.room!.game!.view === 1), "turn");
      peers[1].ws.send(
        JSON.stringify({
          type: "input",
          gameId: id,
          seq: ++peers[1].seq,
          input: idleInput(),
        }),
      );
      peers[n - 1].ws.close();
      await until(
        () => peers[0].room!.players[n - 1].online === false,
        "disconnect",
      );
      const paused = peers[0].room!.game!.tick;
      await new Promise((r) => setTimeout(r, 180));
      assert.equal(peers[0].room!.game!.tick, paused);
      const reconnect = peer(created.room.code, sessions[n - 1].token);
      peers[n - 1] = reconnect;
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "reconnect",
      );
      await until(() => peers[0].room!.game!.tick > paused, "resume");
      assert.equal(reconnect.room!.game!.id, id);
      assert.ok(peers.every((p) => p.errors.length === 0));
    } finally {
      peers.forEach((p) => p.ws.close());
    }
  });

for (const capacity of [2, 3, 6])
  test(`${capacity} real WebSockets: cross paper, latch deck, recover the holder`, async () => {
    const created = await post("/rooms", {
      capacity,
      level: 1,
      name: "bridge host",
    });
    const sessions = [created];
    for (let i = 1; i < capacity; i++)
      sessions.push(
        await post(`/rooms/${created.room.code}/join`, {
          name: `crossing ${i}`,
        }),
      );
    const peers = sessions.map((s) => peer(created.room.code, s.token));
    try {
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "bridge party ready",
      );
      peers[0].ws.send(
        JSON.stringify({ type: "command", command: { type: "start" } }),
      );
      await until(
        () => peers.every((p) => !!p.room?.game),
        "bridge chapter started",
      );
      const send = (id: number, input: ReturnType<typeof idleInput>) =>
        peers[id].ws.send(
          JSON.stringify({
            type: "input",
            gameId: peers[id].room!.game!.id,
            seq: ++peers[id].seq,
            input,
          }),
        );
      send(0, { ...idleInput(), axis: 1 });
      await until(
        () => peers[0].room!.game!.players[0].x >= 3.1,
        "holder reaches socket",
      );
      send(0, { ...idleInput(), fold: true });
      await until(
        () => peers.every((p) => p.room!.game!.players[0].bridgeDock),
        "paper bridge deployed",
      );
      send(1, { ...idleInput(), axis: 1 });
      await until(
        () => peers[1].room!.game!.players[1].x >= 6.65,
        "receiver crosses",
      );
      send(1, idleInput());
      await until(
        () => peers.every((p) => p.room!.game!.bridgeLatched),
        "wooden deck synchronized",
      );
      assert.ok(peers.every((p) => p.room!.game!.bridgeCrossed.includes(1)));
      for (let id = 0; id < capacity; id++)
        if (id !== 1) send(id, { ...idleInput(), axis: 1 });
      await until(
        () => peers[0].room!.game!.players.every((p) => p.x > 6.5),
        "everyone including holder crosses",
      );
      for (let id = 0; id < capacity; id++) send(id, idleInput());
      assert.ok(
        peers.every(
          (p) =>
            p.errors.length === 0 &&
            p.room!.game!.players.every((b) => b.deaths === 0),
        ),
      );
      const common = [...peers[0].states.keys()]
        .filter((t) => peers.every((p) => p.states.has(t)))
        .at(-1)!;
      assert.ok(
        peers.every(
          (p) => p.states.get(common) === peers[0].states.get(common),
        ),
        "clients agree on the repaired deck",
      );
    } finally {
      peers.forEach((p) => p.ws.close());
    }
  });

for (const capacity of [2, 3, 6])
  test(`${capacity} real WebSockets: heat warning, disconnect pause and brittle failure synchronize`, async () => {
    const created = await post("/rooms", {
      capacity,
      level: 0,
      name: "fire test",
    });
    const sessions = [created];
    for (let i = 1; i < capacity; i++)
      sessions.push(
        await post(`/rooms/${created.room.code}/join`, {
          name: `fire observer ${i}`,
        }),
      );
    const peers = sessions.map((s) => peer(created.room.code, s.token));
    try {
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "fire party ready",
      );
      peers[0].ws.send(
        JSON.stringify({ type: "command", command: { type: "start" } }),
      );
      await until(() => peers.every((p) => !!p.room?.game), "fire scene ready");
      const send = (input: ReturnType<typeof idleInput>) =>
        peers[0].ws.send(
          JSON.stringify({
            type: "input",
            gameId: peers[0].room!.game!.id,
            seq: ++peers[0].seq,
            input,
          }),
        );
      send({ ...idleInput(), axis: -1 });
      await until(
        () => peers[0].room!.game!.players[0].x < -1.35,
        "approach starting fire",
      );
      send(idleInput());
      await until(
        () => peers.every((p) => p.room!.game!.players[0].heat >= 66),
        "heat warning synchronized",
      );
      peers[capacity - 1].ws.close();
      await until(
        () => peers[0].room!.players[capacity - 1].online === false,
        "fire simulation paused",
      );
      const heat = peers[0].room!.game!.players[0].heat;
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(peers[0].room!.game!.players[0].heat, heat);
      peers[capacity - 1] = peer(
        created.room.code,
        sessions[capacity - 1].token,
      );
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "fire observer reconnects",
      );
      await until(
        () =>
          peers.every(
            (p) => p.room!.game!.players[0].lastFailure === "brittle",
          ),
        "brittle failure synchronized",
      );
      assert.ok(
        peers.every(
          (p) =>
            p.room!.game!.players[0].deaths === 1 &&
            p.room!.game!.players[0].heat === 0,
        ),
      );
      assert.ok(
        peers.every((p) =>
          p.room!.game!.players.slice(1).every((q) => q.deaths === 0),
        ),
      );
      assert.ok(peers.every((p) => p.errors.length === 0));
    } finally {
      peers.forEach((p) => p.ws.close());
    }
  });
