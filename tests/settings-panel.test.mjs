import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

const bundle = await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import { SettingsPanel } from "./src/settings-panel";
      import { RainSelect } from "./src/rain-select";
      function App() {
        const [open, setOpen] = useState(false);
        const [value, setValue] = useState("standard");
        return <main className="app">
          <button id="open" onClick={() => setOpen(true)}>设置</button>
          <SettingsPanel open={open} language="zh" onClose={() => setOpen(false)}>
            <audio id="music" />
            <RainSelect label="字号" value={value} onChange={setValue}
              options={[{value: "standard", label: "标准"}, {value: "largest", label: "特大"}]} />
            <fieldset disabled><button>禁用项</button></fieldset>
            <button id="last">其他选项</button>
          </SettingsPanel>
        </main>;
      }
      createRoot(document.getElementById("root")).render(<App />);
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"' },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

async function page() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
    pretendToBeVisual: true,
    runScripts: "outside-only",
    virtualConsole,
  });
  const w = dom.window;
  w.document.body.style.overflow = "clip";
  let escapedToGame = 0;
  w.addEventListener("keydown", (event) => {
    if (event.key === "Escape") escapedToGame++;
  });
  w.eval(bundle.outputFiles[0].text);
  const deadline = Date.now() + 2000;
  while (!w.document.getElementById("open")) {
    if (Date.now() > deadline) {
      w.close();
      assert.fail("Settings test did not mount");
    }
    await settle();
  }
  const key = (target, key, shiftKey = false) => {
    const event = new w.KeyboardEvent("keydown", {
      key,
      code: key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };
  return {
    w,
    key,
    errors,
    scrim: () => w.document.querySelector(".settings-scrim"),
    closeButton: () => w.document.querySelector(".settings-close"),
    escapedToGame: () => escapedToGame,
    open: async () => {
      const opener = w.document.getElementById("open");
      opener.focus();
      opener.click();
      await settle();
    },
    close: () => w.close(),
  };
}

test("settings trap focus, close on Escape and restore focus and scrolling", async () => {
  const p = await page();
  const d = p.w.document;
  try {
    assert.equal(p.scrim().hidden, true);
    assert.equal(d.body.style.overflow, "clip");
    await p.open();
    assert.equal(p.scrim().hidden, false);
    assert.equal(d.body.style.overflow, "hidden");
    assert.ok(d.activeElement === p.closeButton(), "opening focuses close");
    const last = d.getElementById("last");
    assert.equal(p.key(p.closeButton(), "Tab", true).defaultPrevented, true);
    assert.ok(
      d.activeElement === last,
      "reverse Tab wraps to the last control",
    );
    assert.equal(p.key(last, "Tab").defaultPrevented, true);
    assert.ok(d.activeElement === p.closeButton(), "Tab wraps to close");
    d.getElementById("open").focus();
    assert.ok(
      d.activeElement === p.closeButton(),
      "background focus stays out",
    );
    p.key(p.closeButton(), "Escape");
    await settle();
    assert.equal(p.scrim().hidden, true);
    assert.equal(d.body.style.overflow, "clip");
    assert.ok(
      d.activeElement === d.getElementById("open"),
      "closing restores opener",
    );
    assert.equal(p.escapedToGame(), 0);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("a selector handles Escape before settings and the game", async () => {
  const p = await page();
  try {
    await p.open();
    const selector = p.w.document.querySelector('[role="combobox"]');
    selector.click();
    await settle();
    assert.equal(selector.getAttribute("aria-expanded"), "true");
    p.key(selector, "Escape");
    await settle();
    assert.equal(selector.getAttribute("aria-expanded"), "false");
    assert.equal(p.scrim().hidden, false);
    assert.equal(p.escapedToGame(), 0);
    p.closeButton().click();
    await settle();
    assert.equal(p.scrim().hidden, true);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("closing hides settings without replacing media or resetting its children", async () => {
  const p = await page();
  const d = p.w.document;
  try {
    const media = d.getElementById("music");
    await p.open();
    d.querySelector('[role="combobox"]').click();
    await settle();
    [...d.querySelectorAll('[role="option"]')]
      .find((option) => option.textContent.includes("特大"))
      .click();
    await settle();
    d.querySelector(".settings-content").click();
    await settle();
    assert.equal(p.scrim().hidden, false, "content clicks do not dismiss");
    p.scrim().click();
    await settle();
    assert.equal(p.scrim().hidden, true);
    assert.ok(d.getElementById("music") === media, "closing preserves media");
    assert.equal(media.isConnected, true);
    await p.open();
    assert.ok(d.getElementById("music") === media, "reopening preserves media");
    assert.match(d.querySelector('[role="combobox"]').textContent, /特大/);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
