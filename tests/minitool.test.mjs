import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { auditPackage } from "../scripts/package-minitool.mjs";

const bundle = await build({
  stdin: {
    contents: `import './src/minitool/compat'; import './src/main'; import {LEVELS} from './src/game'; window.testLevels=LEVELS;`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  target: "chrome61",
  loader: { ".css": "empty" },
  define: {
    "import.meta.env.VITE_MINITOOL": '"true"',
    "import.meta.env.BASE_URL": '"./"',
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      name: "solo-test",
      setup(b) {
        b.onResolve(
          {
            filter: /^\.\/(api|ranking-client|ranking-ui|player-name|replay)$/,
          },
          () => ({ path: path.resolve("src/minitool/no-network.ts") }),
        );
        b.onResolve({ filter: /^\.\/audio$/ }, () => ({
          path: path.resolve("src/minitool/silent-audio.ts"),
        }));
        b.onResolve({ filter: /^\.\/scene-loader$/ }, () => ({
          path: "scene",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: `export const warmScene=()=>{}; export const loadScene=async()=>({PaperScene:class{render(g){window.testGame=g;window.testFrames=(window.testFrames||0)+1;}dispose(){}}});`,
        }));
      },
    },
  ],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
async function page() {
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (e) => errors.push(String(e)));
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    {
      url: "http://localhost/?room=ABCDEFGH",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: vc,
    },
  );
  const w = dom.window;
  w.matchMedia = () => ({
    matches: true,
    addListener() {},
    removeListener() {},
  });
  w.scrollTo = () => {};
  w.fetch = () => {
    throw new Error("network forbidden");
  };
  w.WebSocket = class {
    constructor() {
      throw new Error("socket forbidden");
    }
  };
  w.eval(
    "delete window.structuredClone;delete window.ResizeObserver;delete window.globalThis;delete Object.fromEntries;delete Object.hasOwn;delete Array.prototype.flatMap;delete Array.prototype.at;",
  );
  Object.defineProperty(w.crypto, "randomUUID", {
    value: undefined,
    writable: true,
  });
  w.localStorage.setItem(
    "rain-action-session-v2",
    JSON.stringify({
      code: "ABCDEFGH",
      token: "11111111-1111-4111-8111-111111111111",
      slot: 1,
    }),
  );
  let now = 0,
    next = 0;
  const frames = new Map();
  w.performance.now = () => now;
  w.requestAnimationFrame = (fn) => {
    frames.set(++next, fn);
    return next;
  };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  async function tick(count = 10) {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(now));
      await settle();
    }
  }
  w.eval(bundle.outputFiles[0].text);
  await settle();
  return { w, errors, tick, close: () => w.close() };
}

test("offline menu excludes online entry points and restores legacy built-ins", async () => {
  const p = await page();
  try {
    const d = p.w.document;
    assert.equal(d.querySelectorAll(".menu select option").length, 40);
    for (const selector of [
      ".modes",
      ".join",
      ".leaderboard",
      'input[placeholder="旅人"]',
    ])
      assert.equal(d.querySelector(selector), null);
    assert.match(
      d.querySelector(".journey-records").textContent,
      /本地通关记录/,
    );
    assert.equal(typeof p.w.structuredClone, "function");
    assert.equal(typeof p.w.ResizeObserver, "function");
    assert.equal(typeof p.w.crypto.randomUUID, "function");
    assert.equal(p.w.structuredClone({ a: Infinity }).a, Infinity);
    d.querySelector(".menu .primary").click();
    await p.tick();
    assert.equal(p.w.testGame.mode, 1);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
test("solo pickup, all-star completion and local record never submit a score", async () => {
  const p = await page();
  try {
    const { w } = p,
      d = w.document;
    d.querySelector(".menu .primary").click();
    await p.tick();
    const game = w.testGame,
      level = w.testLevels[0];
    Object.assign(game.players[0], level.keys[0], { y: 0 });
    await p.tick();
    assert.equal(game.keys.length, 1);
    assert.match(d.querySelector(".stats").textContent, /1\/1/);
    for (const star of level.stars) {
      Object.assign(game.players[0], star, { vy: 0 });
      await p.tick(2);
    }
    Object.assign(game.players[0], level.exit, { vy: 0 });
    await p.tick();
    assert.equal(game.status, "won");
    assert.equal(game.stars.length, level.stars.length);
    assert.ok(d.querySelector(".finish-record"));
    assert.equal(d.querySelector(".ranking-upload"), null);
    assert.equal(d.querySelector(".leaderboard"), null);
    assert.match(d.querySelector(".win").textContent, /首次通关记录/);
    assert.ok(
      [...Array(w.localStorage.length)].some((_, i) =>
        w.localStorage.key(i).startsWith("rain-best-times-"),
      ),
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
test("backgrounding stops simulation and resume does not retain movement", async () => {
  const p = await page();
  try {
    const { w } = p;
    w.document.querySelector(".menu .primary").click();
    await p.tick();
    w.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight" }),
    );
    await p.tick(2);
    const time = w.testGame.time;
    Object.defineProperty(w.document, "hidden", {
      value: true,
      configurable: true,
    });
    w.document.dispatchEvent(new w.Event("visibilitychange"));
    await p.tick(15);
    assert.equal(w.testGame.time, time);
    Object.defineProperty(w.document, "hidden", {
      value: false,
      configurable: true,
    });
    w.document.dispatchEvent(new w.Event("visibilitychange"));
    await p.tick();
    const x = w.testGame.players[0].x;
    await p.tick();
    assert.equal(w.testGame.players[0].x, x);
    assert.ok(w.testGame.time > time);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
test("production offline packages contain no online implementation or forbidden runtime APIs", async () => {
  for (const silent of [false, true]) {
    const directory = silent ? "dist-minitool-silent" : "dist-minitool";
    const files = await auditPackage(directory, silent);
    assert.equal(
      files.filter((f) => f.file.endsWith(".m4a")).length,
      silent ? 0 : 2,
    );
    const meta = JSON.parse(
      await readFile(`work/minitool/${silent ? "silent-" : ""}metafile.json`),
    );
    assert.ok(
      !Object.keys(meta.inputs).some((f) =>
        /^src\/(api|ranking-client|ranking-ui|room|player-name|replay)\./.test(
          f,
        ),
      ),
    );
  }
});
