import { build } from "esbuild";
import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
const out = "work/minitool/qa";
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["tests/minitool/harness.ts"],
  outfile: `${out}/harness.js`,
  bundle: true,
  format: "iife",
  target: "chrome61",
  define: {
    "import.meta.env.VITE_MINITOOL": '"true"',
    "process.env.NODE_ENV": '"production"',
  },
});
await writeFile(
  `${out}/index.html`,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#2b3b4d;color:#ddd;font:14px sans-serif}header{padding:8px;height:100px}canvas{position:absolute;top:116px;left:0;width:100vw;height:calc(100vh - 116px)}button,select{font:inherit;padding:8px;margin:3px}output{display:block}</style></head><body><header><label>关卡<select></select></label><button id="turn">转面</button><button id="loss">模拟显卡丢失</button><button id="sweep">检查40关</button><output>就绪</output><a href="./app/">正式包</a> · <a href="./legacy/">旧 API 环境</a> · <a href="./nogpu/">无 WebGL 环境</a></header><canvas></canvas><script src="./harness.js"></script></body></html>`,
);
const html = await readFile("dist-minitool/index.html", "utf8");
for (const name of ["app", "legacy", "nogpu"]) {
  await cp("dist-minitool", `${out}/${name}`, { recursive: true });
  if (name === "app") continue;
  await writeFile(
    `${out}/${name}/index.html`,
    html.replace(
      '<script src="./app.js">',
      '<script src="./prelude.js"></script><script src="./app.js">',
    ),
  );
  const legacy = `delete window.structuredClone; delete window.ResizeObserver; delete Object.hasOwn; delete Object.fromEntries; delete Array.prototype.flatMap; delete Array.prototype.at; delete window.globalThis; Object.defineProperty(crypto,'randomUUID',{value:undefined,writable:true}); var nativeMedia=window.matchMedia.bind(window); window.matchMedia=function(query){var m=nativeMedia(query);m.addEventListener=undefined;m.removeEventListener=undefined;return m;};`;
  const noGpu = `var nativeContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,opts){return type==='webgl'||type==='webgl2'?null:nativeContext.call(this,type,opts);};`;
  await writeFile(
    `${out}/${name}/prelude.js`,
    name === "legacy" ? legacy : noGpu,
  );
}
console.log(out);
