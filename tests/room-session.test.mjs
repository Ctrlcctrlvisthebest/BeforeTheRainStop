import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

// Exercise the real hook, storage and session validation. Transport delivery
// follows Connection's public contract: closing retires all socket callbacks.
const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import { useRoomSession } from "./src/room-session";
      import { newGame, idleInput } from "./src/game";
      window.newGame = newGame;
      window.idleInput = idleInput;
      function App() {
        const [initialCode, setInitialCode] = useState(window.initialCode);
        const [label, setLabel] = useState("initial");
        window.setInitialCode = setInitialCode;
        window.setCallbacksLabel = setLabel;
        const session = useRoomSession({
          initialCode,
          onEnter: () => {
            window.events.push({ type: "enter", label });
            window.onEnter?.();
          },
          onRoom: room => window.events.push({ type: "room", label, room }),
          onError: message => window.events.push({ type: "error", label, message }),
        });
        window.roomSession = session;
        return <output>{session.session?.code ?? "no-seat"}:{String(session.connected)}</output>;
      }
      window.reactRoot = createRoot(document.getElementById("root"));
      window.reactRoot.render(<App />);
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: {
    "import.meta.env": "{}",
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      name: "room-session-transport",
      setup(b) {
        b.onResolve({ filter: /^\.\/api$/ }, () => ({
          path: "api",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          resolveDir: fileURLToPath(new URL("../", import.meta.url)),
          contents: `
          export { validSession } from "./src/api";
          export function api(path, body, token) {
            let request;
            const pending = new Promise((resolve, reject) => {
              request = { path, body, token, resolve, reject };
              window.requests.push(request);
            });
            // Observe the final chain so a later catch cannot hide a consumer
            // failure from the regression. Preserve native Promise behavior.
            const then = pending.then.bind(pending);
            pending.then = (...handlers) => {
              const chain = then(...handlers);
              request.chain = chain;
              const catchFailure = chain.catch.bind(chain);
              chain.catch = handler => {
                request.chain = catchFailure(handler);
                return request.chain;
              };
              return chain;
            };
            return pending;
          }
          export class Connection {
            constructor(seat, state, status, error) {
              this.seat = seat;
              this.state = state;
              this.status = status;
              this.error = error;
              this.closed = false;
              this.sent = [];
              window.connections.push(this);
            }
            deliver(room, inputs) {
              if (this.closed) return;
              this.status(true);
              this.state(room, inputs);
            }
            fail(message) {
              if (!this.closed) this.error(message);
            }
            input(gameId, input) {
              if (!this.closed) this.sent.push({ gameId, input });
            }
            command(value) {
              if (!this.closed) this.sent.push(value);
            }
            close() { this.closed = true; }
          }
        `,
        }));
      },
    },
  ],
});

const SESSION_KEY = "rain-action-session-v2";
const seatA = {
  code: "ABCDEFGH",
  token: "12345678-1234-1234-1234-123456789abc",
  slot: 0,
};
const seatB = {
  code: "JKLMNPQR",
  token: "456789ab-4567-4567-4567-456789abcdef",
  slot: 1,
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const plain = (value) => JSON.parse(JSON.stringify(value));

async function page({ saved = null, initialCode = "" } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.initialCode = initialCode;
  w.events = [];
  w.requests = [];
  w.connections = [];
  let now = 0;
  w.performance.now = () => now;
  if (saved) w.sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  w.eval(bundle.outputFiles[0].text);
  const deadline = Date.now() + 2000;
  while (!w.roomSession) {
    if (Date.now() > deadline) {
      w.close();
      assert.fail("Room session failed to mount: " + errors.join("; "));
    }
    await settle();
  }
  await settle();
  return {
    w,
    errors,
    session: () => w.roomSession,
    stored: () => JSON.parse(w.sessionStorage.getItem(SESSION_KEY)),
    tick: (value) => {
      now = value;
    },
    change: async (action) => {
      action(w.roomSession);
      await settle();
    },
    close: () => {
      w.reactRoot.unmount();
      w.close();
    },
  };
}

function roomFor(w, seat, { phase = "lobby", revision = 0, tick = 0 } = {}) {
  const game = phase === "game" ? w.newGame(2, 0, "run") : null;
  if (game) {
    game.tick = tick;
    game.time = tick / 60;
  }
  return {
    version: 2,
    code: seat.code,
    capacity: 2,
    host: 0,
    level: 0,
    players: [{ slot: seat.slot, name: "纸鹤", online: true, lastSeen: 1000 }],
    phase,
    game,
    revision,
    expiresAt: 1000000,
    votes: [],
    voteNext: null,
    regroupVotes: [],
    serverTime: 1000,
  };
}

test("starting another entry, clearing or entering a new seat cancels pending restoration", async () => {
  for (const action of ["beginEntry", "clear", "enter"])
    for (const outcome of ["resolve", "reject"]) {
      const p = await page({ saved: seatA });
      try {
        assert.equal(p.w.requests.length, 1);
        await p.change((session) =>
          action === "enter" ? session.enter(seatB) : session[action](),
        );
        const request = p.w.requests[0];
        if (outcome === "resolve")
          request.resolve({ room: roomFor(p.w, seatA) });
        else request.reject(new p.w.Error("saved room expired"));
        await settle();
        const expected = action === "enter" ? seatB : null;
        assert.deepEqual(
          plain(p.session().session),
          expected,
          `${action}/${outcome}`,
        );
        assert.deepEqual(plain(p.session().currentSession.current), expected);
        assert.deepEqual(p.stored(), action === "enter" ? seatB : seatA);
        assert.equal(p.w.connections.length, action === "enter" ? 1 : 0);
        assert.equal(
          p.w.events.filter((event) => event.type === "error").length,
          0,
        );
        assert.deepEqual(p.errors, []);
      } finally {
        p.close();
      }
    }
});

test("a current restoration failure reports the real error and expires only its saved seat", async () => {
  const p = await page({ saved: seatA });
  try {
    p.w.requests[0].reject(new p.w.Error("房间不存在或已过期"));
    await settle();
    assert.equal(p.stored(), null);
    assert.equal(p.session().session, null);
    assert.deepEqual(plain(p.w.events), [
      { type: "error", label: "initial", message: "房间不存在或已过期" },
    ]);
    assert.equal(p.w.connections.length, 0);
  } finally {
    p.close();
  }
});

test("restoration preserves an entry callback failure instead of swallowing or classifying it as HTTP failure", async () => {
  const p = await page({ saved: seatA });
  try {
    const failure = new p.w.Error("entry callback failed");
    p.w.onEnter = () => {
      throw failure;
    };
    const request = p.w.requests[0];
    const chain = request.chain;
    // This test owns the rejected business chain; keep Node's global rejection
    // handling separate from the production hook's HTTP failure handling.
    void chain.catch(() => {});
    request.resolve({ room: roomFor(p.w, seatA) });
    await assert.rejects(
      async () => await chain,
      (error) => error === failure,
    );
    await settle();
    assert.deepEqual(p.stored(), seatA);
    assert.deepEqual(plain(p.session().currentSession.current), seatA);
    assert.equal(p.w.connections.length, 0);
    assert.deepEqual(plain(p.w.events), [{ type: "enter", label: "initial" }]);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("suspension resumes the same seat while retired sockets cannot replace the current room", async () => {
  const p = await page();
  try {
    await p.change((session) => session.enter(seatA));
    const first = p.w.connections[0];
    const roomA = roomFor(p.w, seatA, { phase: "game" });
    await p.change(() => first.deliver(roomA, { 0: p.w.idleInput() }));
    assert.equal(p.session().connected, true);
    await p.change((session) => session.suspend());
    assert.equal(first.closed, true);
    assert.equal(p.session().connected, false);
    assert.deepEqual(plain(p.session().session), seatA);
    assert.deepEqual(p.stored(), seatA);
    await p.change((session) => session.resume());
    const resumed = p.w.connections.at(-1);
    assert.deepEqual(plain(resumed.seat), seatA);
    await p.change(() => resumed.deliver(roomA, {}));
    await p.change((session) => session.enter(seatB));
    assert.equal(resumed.closed, true);
    const current = p.w.connections.at(-1);
    const roomB = roomFor(p.w, seatB, { phase: "game" });
    await p.change(() => current.deliver(roomB, { 1: p.w.idleInput() }));
    await p.change(() => {
      first.deliver(roomA, {});
      resumed.deliver(roomA, {});
    });
    assert.strictEqual(p.session().currentRoom.current, roomB);
    assert.deepEqual(plain(p.session().currentSession.current), seatB);
    assert.deepEqual(p.stored(), seatB);
    assert.equal(p.session().connected, true);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("clear retains the reconnect cache; leaving removes it and sends a lobby command only", async () => {
  const p = await page();
  try {
    await p.change((session) => session.enter(seatA));
    const active = p.w.connections.at(-1);
    await p.change(() =>
      active.deliver(roomFor(p.w, seatA), { 0: p.w.idleInput() }),
    );
    await p.change((session) => session.clear());
    assert.equal(active.closed, true);
    assert.equal(p.session().session, null);
    assert.equal(p.session().room, null);
    assert.equal(p.session().currentRoom.current, null);
    assert.deepEqual(plain(p.session().inputs.current), {});
    assert.deepEqual(p.stored(), seatA);
    assert.equal(p.w.requests.length, 0);
    await p.change((session) => session.enter(seatA));
    await p.change(() =>
      p.w.connections.at(-1).deliver(roomFor(p.w, seatA), {}),
    );
    await p.change((session) => session.leave());
    assert.equal(p.stored(), null);
    assert.equal(p.w.requests.length, 1);
    assert.equal(p.w.requests[0].path, `/rooms/${seatA.code}/command`);
    assert.equal(p.w.requests[0].token, seatA.token);
    assert.deepEqual(plain(p.w.requests[0].body), { type: "leave" });
    p.w.requests[0].resolve({ room: roomFor(p.w, seatA) });
    await p.change((session) => session.enter(seatB));
    await p.change(() =>
      p.w.connections
        .at(-1)
        .deliver(roomFor(p.w, seatB, { phase: "game" }), {}),
    );
    await p.change((session) => session.leave());
    assert.equal(
      p.w.requests.length,
      1,
      "a game keeps its seat on the server for reconnection",
    );
    assert.equal(p.session().session, null);
    assert.equal(p.stored(), null);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("authoritative snapshots update time and inputs without capturing obsolete render callbacks", async () => {
  const p = await page();
  try {
    const enter = p.session().enter;
    p.w.setCallbacksLabel("latest");
    await settle();
    await p.change(() => enter(seatA));
    const socket = p.w.connections.at(-1);
    const first = roomFor(p.w, seatA, { phase: "game", revision: 1, tick: 1 });
    const inputs = { 0: { ...p.w.idleInput(), axis: 1 } };
    p.tick(100);
    await p.change(() => socket.deliver(first, inputs));
    assert.strictEqual(p.session().room, first);
    assert.strictEqual(p.session().inputs.current, inputs);
    assert.equal(p.session().snapshotTime.current, 100);
    p.w.setCallbacksLabel("newest");
    await settle();
    const next = roomFor(p.w, seatA, { phase: "game", revision: 1, tick: 2 });
    const released = { 0: p.w.idleInput() };
    p.tick(180);
    await p.change(() => socket.deliver(next, released));
    assert.strictEqual(p.session().currentRoom.current, next);
    assert.strictEqual(p.session().inputs.current, released);
    assert.equal(p.session().snapshotTime.current, 180);
    const refreshed = roomFor(p.w, seatA, {
      phase: "game",
      revision: 2,
      tick: 3,
    });
    p.tick(220);
    await p.change((session) => session.refresh(refreshed));
    assert.strictEqual(p.session().room, refreshed);
    assert.strictEqual(
      p.session().inputs.current,
      released,
      "HTTP refresh preserves current socket inputs",
    );
    assert.equal(p.session().snapshotTime.current, 220);
    socket.fail("网络中断");
    assert.deepEqual(
      plain(p.w.events).map(({ type, label }) => ({ type, label })),
      [
        { type: "enter", label: "latest" },
        { type: "room", label: "latest" },
        { type: "room", label: "newest" },
        { type: "room", label: "newest" },
        { type: "error", label: "newest" },
      ],
    );
    assert.equal(
      p.w.connections.length,
      1,
      "new UI callbacks reuse the current connection",
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("changing the requested room or unmounting prevents an old restore from opening a connection", async () => {
  for (const change of ["code", "unmount"]) {
    const p = await page({ saved: seatA });
    try {
      if (change === "code")
        await p.change(() => p.w.setInitialCode(seatB.code));
      else p.w.reactRoot.unmount();
      p.w.requests[0].resolve({ room: roomFor(p.w, seatA) });
      await settle();
      assert.equal(p.w.connections.length, 0);
      assert.deepEqual(plain(p.w.events), []);
      assert.deepEqual(p.stored(), seatA);
      assert.deepEqual(p.errors, []);
    } finally {
      p.close();
    }
  }
});
