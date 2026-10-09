import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { flushSync } from "react-dom";
      import { useState } from "react";
      import { TeamControls } from "./src/team-controls";
      function App() {
        const [room, setRoom] = useState(window.initialRoom);
        window.updateRoom = setRoom;
        return <TeamControls room={room} slot={1} connected={true} language="zh"
          send={command => window.commands.push(command)} />;
      }
      const root = createRoot(document.getElementById("root"));
      flushSync(() => root.render(<App/>));
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
async function page() {
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  let elapsed = 0;
  let nextTimer = 0;
  const timers = new Map();
  w.setInterval = (callback) => {
    const id = ++nextTimer;
    timers.set(id, callback);
    return id;
  };
  w.clearInterval = (id) => timers.delete(id);
  Object.defineProperty(w.performance, "now", { value: () => elapsed });
  // The user's clock intentionally differs greatly from the server's clock.
  w.initialRoom = {
    phase: "game",
    game: { id: "current" },
    serverTime: 1000000,
    players: [
      { slot: 0, name: "Host", online: false, lastSeen: 1000000 },
      { slot: 1, name: "Guest", online: true, lastSeen: 1000000 },
    ],
    regroupVotes: [0, 1, 1],
  };
  w.commands = [];
  w.eval(bundle.outputFiles[0].text);
  await settle();
  return {
    w,
    tick: async (ms) => {
      elapsed += ms;
      for (const callback of timers.values()) callback();
      await settle();
    },
    text: () => w.document.body.textContent,
    close: () => w.close(),
  };
}

test("team panel counts only online consent and displays a clock-skew-safe live reconnection countdown", async () => {
  const p = await page();
  try {
    assert.match(p.text(), /1 \/ 1 人同意/);
    assert.doesNotMatch(p.text(), /2 \/ 1/);
    assert.match(p.text(), /等待同伴重连：15 秒；结束后自动回候场/);
    await p.tick(1500);
    assert.match(p.text(), /等待同伴重连：14 秒/);
    await p.tick(13501);
    assert.match(p.text(), /同伴已同意，正在回候场/);
    const cancel = [...p.w.document.querySelectorAll("button")].find(
      (button) => button.textContent === "撤回我的同意",
    );
    cancel.click();
    assert.deepEqual(JSON.parse(JSON.stringify(p.w.commands)), [
      { type: "cancel-regroup", gameId: "current" },
    ]);
  } finally {
    p.close();
  }
});

test("returning teammates and withdrawn votes update the panel without stale unanimous status", async () => {
  const p = await page();
  try {
    p.w.updateRoom({
      ...p.w.initialRoom,
      serverTime: 1000500,
      players: p.w.initialRoom.players.map((player) => ({
        ...player,
        online: true,
      })),
      regroupVotes: [1],
    });
    await settle();
    assert.match(p.text(), /1 \/ 2 人同意/);
    assert.doesNotMatch(p.text(), /等待同伴重连|正在回候场/);
    p.w.updateRoom({
      ...p.w.initialRoom,
      serverTime: 1000600,
      regroupVotes: [],
    });
    await settle();
    assert.match(p.text(), /0 \/ 1 人同意/);
    assert.match(p.text(), /重新组队/);
    const status = [...p.w.document.querySelectorAll('[role="status"]')]
      .map((node) => node.textContent)
      .join(" ");
    assert.doesNotMatch(status, /结束后自动回候场|正在回候场/);
  } finally {
    p.close();
  }
});
