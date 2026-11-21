import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { Leaderboard } from "./src/ranking-ui";
      const root = createRoot(document.getElementById("root"));
      window.show = (rainDifficulty) => root.render(<Leaderboard level={0} mode={1} rainDifficulty={rainDifficulty} language="zh" />);
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function page() {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const w = dom.window;
  w.AbortSignal = AbortSignal;
  w.AbortController = AbortController;
  const requests = [];
  w.fetch = (url, options) =>
    new Promise((resolve) => requests.push({ url, options, resolve }));
  w.eval(bundle.outputFiles[0].text);
  const show = async (difficulty) => {
    w.show(difficulty);
    const expected = `rainDifficulty=${difficulty}`;
    const deadline = Date.now() + 2000;
    while (!requests.at(-1)?.url.includes(expected)) {
      assert.ok(
        Date.now() < deadline,
        `No leaderboard query for ${difficulty}`,
      );
      await settle();
    }
    await settle();
  };
  await show("normal");
  return {
    w,
    requests,
    errors,
    show,
    text: () => w.document.querySelector(".leaderboard").textContent,
    resolve: async (index, name) => {
      const request = requests[index];
      request.resolve(
        Response.json({
          level: 0,
          mode: 1,
          rainDifficulty: new URL(
            request.url,
            w.location.origin,
          ).searchParams.get("rainDifficulty"),
          entries: [
            { id: name, names: [name], timeMs: 12000, achievedAt: 100 },
          ],
        }),
      );
      await settle();
    },
    close: () => w.close(),
  };
}

test("switching rain difficulty queries its board and clears the previous difficulty's entries", async () => {
  const p = await page();
  try {
    await p.resolve(0, "Normal player");
    assert.match(p.text(), /普通/);
    assert.match(p.text(), /Normal player/);
    await p.show("easy");
    assert.equal(p.requests[0].options.signal.aborted, true);
    assert.doesNotMatch(p.text(), /Normal player/);
    assert.match(p.text(), /简单/);
    await p.resolve(1, "Easy player");
    assert.match(p.text(), /Easy player/);
    await p.show("hard");
    assert.doesNotMatch(p.text(), /Easy player/);
    assert.match(p.text(), /困难/);
    await p.resolve(2, "Hard player");
    assert.match(p.text(), /Hard player/);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("an older board response cannot replace the selected difficulty's leaderboard", async () => {
  const p = await page();
  try {
    await p.show("easy");
    await p.resolve(1, "Selected easy player");
    await p.resolve(0, "Late normal player");
    assert.match(p.text(), /Selected easy player/);
    assert.doesNotMatch(p.text(), /Late normal player/);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
