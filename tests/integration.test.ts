import { CAMPAIGN_VERSION } from "../src/campaign-version";
import test from "node:test";
import assert from "node:assert/strict";
import { idleInput, MAX_FOLDS } from "../src/game";
import type { PublicRoom } from "../src/room";
const base = process.env.TEST_SERVER ?? "http://127.0.0.1:8788";
async function post(path: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(base + "/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        body && typeof body === "object"
          ? { ...body, rulesVersion: CAMPAIGN_VERSION }
          : body,
      ),
    });
    const d = (await r.json()) as any;
    // The suite creates twelve rooms; respect the service's ten-per-minute limit.
    if (r.status === 429 && path === "/rooms" && attempt < 6) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      continue;
    }
    assert.ok(r.ok, JSON.stringify(d));
    return d;
  }
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
  ws.onopen = () =>
    ws.send(
      JSON.stringify({ version: CAMPAIGN_VERSION, type: "hello", token }),
    );
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
for (const transport of ["http", "websocket"] as const)
  test(`${transport} leave revokes the open socket before a replacement takes that seat`, async () => {
    const created = await post("/rooms", {
      capacity: 2,
      level: 0,
      name: "host",
    });
    const joined = await post(`/rooms/${created.room.code}/join`, {
      name: "departing",
    });
    const host = peer(created.room.code, created.token),
      old = peer(created.room.code, joined.token);
    let replacement: ReturnType<typeof peer> | undefined;
    try {
      await until(
        () => !!host.room?.players.every((p) => p.online),
        "both seats connected",
      );
      if (transport === "http") {
        const response = await fetch(
          `${base}/api/rooms/${created.room.code}/command`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${joined.token}`,
            },
            body: JSON.stringify({
              type: "leave",
              rulesVersion: CAMPAIGN_VERSION,
            }),
          },
        );
        assert.equal(response.status, 200);
      } else
        old.ws.send(
          JSON.stringify({
            version: CAMPAIGN_VERSION,
            type: "command",
            command: { type: "leave" },
          }),
        );
      await until(
        () =>
          old.ws.readyState === WebSocket.CLOSED &&
          host.room?.players.length === 1,
        "departing socket revoked",
      );
      const next = await post(`/rooms/${created.room.code}/join`, {
        name: "replacement",
      });
      assert.equal(next.slot, joined.slot);
      replacement = peer(created.room.code, next.token);
      await until(
        () => !!host.room?.players.every((p) => p.online),
        "replacement connected",
      );
      const rejected = await fetch(
        `${base}/api/rooms/${created.room.code}/command`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${joined.token}`,
          },
          body: JSON.stringify({
            type: "leave",
            rulesVersion: CAMPAIGN_VERSION,
          }),
        },
      );
      assert.equal(rejected.status, 401);
      replacement.ws.send("[]");
      await until(
        () => replacement!.errors.includes("消息格式无效"),
        "array message rejected",
      );
      host.ws.send(
        JSON.stringify({
          version: CAMPAIGN_VERSION,
          type: "command",
          command: { type: "start" },
        }),
      );
      await until(
        () => !!replacement!.room?.game,
        "replacement can start normally",
      );
      assert.equal(
        replacement.room!.players.find((p) => p.slot === next.slot)!.online,
        true,
      );
      const x = replacement.room!.game!.players[next.slot].x;
      replacement.ws.send(
        JSON.stringify({
          version: CAMPAIGN_VERSION,
          type: "input",
          gameId: replacement.room!.game!.id,
          seq: 1,
          input: { ...idleInput(), axis: 1 },
        }),
      );
      await until(
        () => replacement!.room!.game!.players[next.slot].x > x + 0.3,
        "replacement owns movement",
      );
      assert.deepEqual(host.errors, []);
    } finally {
      host.ws.close();
      old.ws.close();
      replacement?.ws.close();
    }
  });
for (const [n, level] of [
  [2, 0],
  [3, 0],
  [6, 0],
  [2, 8],
  [3, 10],
  [6, 11],
  [2, 12],
  [3, 14],
  [6, 16],
])
  test(`${n} real WebSockets, chapter ${level + 1}: shared state, seat ownership, turn sync and reconnect`, async () => {
    const created = await post("/rooms", {
      capacity: n,
      level,
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
        JSON.stringify({
          version: CAMPAIGN_VERSION,
          type: "command",
          command: { type: "start" },
        }),
      );
      await until(
        () => peers.every((p) => p.room?.game?.status === "playing"),
        "start",
      );
      const id = peers[0].room!.game!.id;
      peers[0].ws.send(
        JSON.stringify({
          version: CAMPAIGN_VERSION,
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
          version: CAMPAIGN_VERSION,
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
          version: CAMPAIGN_VERSION,
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
          version: CAMPAIGN_VERSION,
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
            version: CAMPAIGN_VERSION,
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
          version: CAMPAIGN_VERSION,
          type: "input",
          gameId: id,
          seq: ++peers[1].seq,
          input: { ...idleInput(), turn: true },
        }),
      );
      await until(() => peers.every((p) => p.room!.game!.view === 1), "turn");
      peers[1].ws.send(
        JSON.stringify({
          version: CAMPAIGN_VERSION,
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
        JSON.stringify({
          version: CAMPAIGN_VERSION,
          type: "command",
          command: { type: "start" },
        }),
      );
      await until(
        () => peers.every((p) => !!p.room?.game),
        "bridge chapter started",
      );
      const send = (id: number, input: ReturnType<typeof idleInput>) =>
        peers[id].ws.send(
          JSON.stringify({
            version: CAMPAIGN_VERSION,
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
      ).catch((error) => {
        const g = peers[0].room!.game!;
        throw Error(
          `${error}; ${JSON.stringify({ charge: g.bridgeCharge, players: g.players.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, bridge: p.bridgeDock, deaths: p.deaths })) })}`,
        );
      });
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
        JSON.stringify({
          version: CAMPAIGN_VERSION,
          type: "command",
          command: { type: "start" },
        }),
      );
      await until(() => peers.every((p) => !!p.room?.game), "fire scene ready");
      const send = (input: ReturnType<typeof idleInput>) =>
        peers[0].ws.send(
          JSON.stringify({
            version: CAMPAIGN_VERSION,
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

for (const capacity of [2, 3, 6])
  test(`${capacity} real WebSockets: new chapter pickups roll back, reappear and save at the next rack`, async () => {
    const created = await post("/rooms", {
        capacity,
        level: 4,
        name: "checkpoint host",
      }),
      sessions = [created];
    for (let i = 1; i < capacity; i++)
      sessions.push(
        await post(`/rooms/${created.room.code}/join`, {
          name: `traveler ${i}`,
        }),
      );
    const peers = sessions.map((s) => peer(created.room.code, s.token));
    try {
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "connect new chapter",
      );
      peers[0].ws.send(
        JSON.stringify({
          version: CAMPAIGN_VERSION,
          type: "command",
          command: { type: "start" },
        }),
      );
      await until(
        () => peers.every((p) => p.room?.game?.status === "playing"),
        "start new chapter",
      );
      const game = () => peers[0].room!.game!,
        bird = () => game().players[0];
      const send = (input: Partial<ReturnType<typeof idleInput>> = {}) =>
        peers[0].ws.send(
          JSON.stringify({
            version: CAMPAIGN_VERSION,
            type: "input",
            gameId: game().id,
            seq: ++peers[0].seq,
            input: { ...idleInput(), ...input },
          }),
        );
      const settle = async () => {
        send();
        await new Promise((r) => setTimeout(r, 200));
      };
      const move = async (target: number, jump = false) => {
        const axis = game().view === 0 ? "x" : "z",
          dir = Math.sign(target - bird()[axis]);
        send({ axis: dir * (game().view === 0 ? 1 : -1), jump });
        await until(
          () => dir * (target - bird()[axis]) < 0.2,
          `reach ${axis} ${target}`,
        );
        await settle();
      };
      const turn = async () => {
        const view = game().view;
        send({ turn: true });
        await until(
          () => peers.every((p) => p.room!.game!.view !== view),
          "shared turn",
        );
        await settle();
        await new Promise((r) => setTimeout(r, 700));
      };
      await move(3.8);
      await move(8, true);
      await until(
        () => bird().grounded && bird().checkpoint === 0,
        "first rack",
      );
      await turn();
      await move(3.5);
      await until(
        () =>
          peers.every((p) => p.room!.game!.players[0].carriedKeys.includes(0)),
        "carried key on every client",
      );
      assert.ok(peers.every((p) => !p.room!.game!.savedKeys.includes(0)));
      const deaths = bird().deaths;
      send({ reset: true });
      await until(
        () =>
          peers.every((p) => p.room!.game!.players[0].deaths === deaths + 1),
        "carrier returned",
      );
      await settle();
      assert.ok(
        peers.every((p) => !p.room!.game!.keys.includes(0)),
        "key visible again to the entire room",
      );
      assert.ok(
        peers.every((p) =>
          p.room!.game!.players.slice(1).every((q) => q.deaths === 0),
        ),
      );
      await move(3.5);
      await until(() => bird().carriedKeys.includes(0), "recollect");
      await move(6);
      await turn();
      await move(12);
      await until(
        () =>
          peers.every(
            (p) =>
              p.room!.game!.savedKeys.includes(0) &&
              p.room!.game!.players[0].carriedKeys.length === 0,
          ),
        "saved at next rack",
      );
      send({ reset: true });
      await until(() => bird().deaths === deaths + 2, "return after saving");
      await settle();
      assert.ok(
        peers.every((p) => p.room!.game!.keys.includes(0)),
        "saved key remains",
      );
      peers[capacity - 1].ws.close();
      await until(
        () => !peers[0].room!.players[capacity - 1].online,
        "disconnect",
      );
      peers[capacity - 1] = peer(
        created.room.code,
        sessions[capacity - 1].token,
      );
      await until(
        () => peers.every((p) => p.room?.players.every((q) => q.online)),
        "reconnect with saved key",
      );
      assert.deepEqual(peers[capacity - 1].room!.game!.savedKeys, [0]);
      assert.ok(peers.every((p) => p.errors.length === 0));
    } finally {
      peers.forEach((p) => p.ws.close());
    }
  });

test("quick restart synchronizes a fresh run and drops held inputs and stale commands", async () => {
  const created = await post("/rooms", {
    capacity: 2,
    level: 0,
    name: "restart host",
  });
  const joined = await post(`/rooms/${created.room.code}/join`, {
    name: "restart peer",
  });
  const host = peer(created.room.code, created.token);
  const guest = peer(created.room.code, joined.token);
  try {
    await until(
      () => !!host.room?.players.every((p) => p.online),
      "restart peers online",
    );
    host.ws.send(
      JSON.stringify({
        version: CAMPAIGN_VERSION,
        type: "command",
        command: { type: "start" },
      }),
    );
    await until(
      () => !!host.room?.game && !!guest.room?.game,
      "restart game started",
    );
    const oldId = host.room!.game!.id;
    host.ws.send(
      JSON.stringify({
        version: CAMPAIGN_VERSION,
        type: "input",
        gameId: oldId,
        seq: ++host.seq,
        input: { ...idleInput(), axis: 1, jump: true },
      }),
    );
    await until(
      () => host.room!.game!.players[0].x > 0,
      "held input moves before restart",
    );
    host.ws.send(
      JSON.stringify({
        version: CAMPAIGN_VERSION,
        type: "command",
        command: { type: "restart", gameId: oldId, next: false },
      }),
    );
    await until(
      () => guest.room!.votes.length === 1,
      "first restart vote visible",
    );
    assert.equal(guest.room!.game!.id, oldId);
    assert.ok(guest.room!.game!.time > 0);
    guest.ws.send(
      JSON.stringify({
        version: CAMPAIGN_VERSION,
        type: "command",
        command: { type: "restart", gameId: oldId, next: false },
      }),
    );
    await until(
      () =>
        host.room!.game!.id !== oldId &&
        host.room!.game!.id === guest.room!.game!.id,
      "fresh game synchronized",
    );
    const id = host.room!.game!.id;
    for (const client of [host, guest]) {
      const g = client.room!.game!;
      assert.equal(g.level, 0);
      assert.ok(g.time < 0.5);
      assert.deepEqual(g.keys, []);
      assert.deepEqual(g.stars, []);
      assert.deepEqual(g.savedKeys, []);
      assert.deepEqual(g.savedStars, []);
      assert.equal(g.players[0].checkpoint, -1);
      assert.equal(g.players[0].x, -1);
      assert.equal(g.players[0].y, 0);
    }
    host.ws.send(
      JSON.stringify({
        version: CAMPAIGN_VERSION,
        type: "command",
        command: { type: "restart", gameId: oldId, next: false },
      }),
    );
    host.ws.send(
      JSON.stringify({
        version: CAMPAIGN_VERSION,
        type: "input",
        gameId: oldId,
        seq: ++host.seq,
        input: { ...idleInput(), axis: 1 },
      }),
    );
    await until(
      () => host.errors.includes("关卡已经更新"),
      "old restart rejected",
    );
    await until(
      () => host.room!.game!.time > 0.5,
      "fresh run advances without old movement",
    );
    assert.equal(host.room!.game!.id, id);
    assert.equal(host.room!.game!.players[0].x, -1);
    assert.deepEqual(host.room!.votes, []);
  } finally {
    host.ws.close();
    guest.ws.close();
  }
});
