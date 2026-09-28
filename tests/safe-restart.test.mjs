import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import { SafeRestartButton } from "./src/safe-restart";
      function App() {
        const [needs, setNeeds] = useState(true), [run, setRun] = useState("a"), [count, setCount] = useState(0);
        return <><SafeRestartButton id="restart" language="zh" needsConfirmation={needs} scopeKey={run}
          onConfirm={() => setCount(v => v + 1)}>重开</SafeRestartButton>
          <button id="new-run" onClick={() => setRun("b")}>New run</button>
          <button id="fresh" onClick={() => setNeeds(false)}>Fresh</button>
          <output>{count}</output></>;
      }
      createRoot(document.getElementById("root")).render(<App/>);
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
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function page() {
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  let now = 0;
  Object.defineProperty(w.performance, "now", { value: () => now });
  w.eval(bundle.outputFiles[0].text);
  await settle();
  return {
    w,
    advance: (value) => {
      now += value;
    },
    click: async (id = "restart") => {
      w.document.getElementById(id).click();
      await settle();
    },
    count: () => w.document.querySelector("output").textContent,
    close: () => w.close(),
  };
}

test("a progressed run requires a deliberate second activation; rapid double taps do not erase it", async () => {
  const p = await page();
  try {
    await p.click();
    assert.equal(p.count(), "0");
    assert.match(
      p.w.document.getElementById("restart").textContent,
      /再点重开/,
    );
    p.advance(100);
    await p.click();
    assert.equal(p.count(), "0");
    p.advance(300);
    await p.click();
    assert.equal(p.count(), "1");
    assert.equal(p.w.document.getElementById("restart").textContent, "重开");
  } finally {
    p.close();
  }
});

test("confirmation expires and does not leak across game runs or focus loss", async () => {
  const p = await page();
  try {
    await p.click();
    p.advance(4100);
    await p.click();
    assert.equal(p.count(), "0");
    await p.click("new-run");
    p.advance(500);
    await p.click();
    assert.equal(p.count(), "0");
    p.w.dispatchEvent(new p.w.Event("blur"));
    await settle();
    p.advance(500);
    await p.click();
    assert.equal(p.count(), "0");
  } finally {
    p.close();
  }
});

test("a fresh run can restart immediately", async () => {
  const p = await page();
  try {
    await p.click("fresh");
    await p.click();
    assert.equal(p.count(), "1");
  } finally {
    p.close();
  }
});
