import { build, transform as transformJs } from "esbuild";
import { transform } from "lightningcss";
import postcss from "postcss";
import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import path from "node:path";

const silent = process.argv.includes("--silent");
const out = path.resolve(silent ? "dist-minitool-silent" : "dist-minitool");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Function-level layout fallbacks before lowering selectors, colors and inset.
export function compatibleCss(source) {
  const tree = postcss.parse(source);
  tree.walkAtRules("import", (rule) => rule.remove());
  tree.walkDecls((decl) => {
    decl.value = decl.value
      .replace(/url\(["']?\//g, 'url("./')
      .replace(/100dvh/g, "var(--app-height, 100vh)")
      .replace(/(\d+)dvh/g, "$1vh");
    if (decl.prop === "gap") decl.cloneBefore({ prop: "grid-gap" });
    const clamp = decl.value.match(/^clamp\(([^,]+),\s*([^,]+),\s*([^,]+)\)$/);
    if (clamp) {
      if (decl.prop.startsWith("--")) {
        // Preserve the original clamp in modern containers. An unsupported
        // function in a custom property needs a feature-gated fallback.
        const fallback = postcss.atRule({
          name: "supports",
          params: "not (width: clamp(1px, 2vw, 3px))",
        });
        const rule = postcss.rule({ selector: decl.parent.selector });
        rule.append(decl.clone({ value: clamp[2] }));
        fallback.append(rule);
        decl.parent.after(fallback);
      } else decl.cloneBefore({ value: clamp[2] });
    }
    const min = decl.value.match(/^min\(([^,]+),\s*(.+)\)$/);
    if (min && ["width", "height"].includes(decl.prop)) {
      decl.cloneBefore({ value: min[1] });
      decl.cloneBefore({ prop: `max-${decl.prop}`, value: min[2] });
    } else if (min && decl.prop === "max-width")
      decl.cloneBefore({ value: min[2] });
  });
  return transform({
    filename: "style.css",
    code: Buffer.from(tree.toString()),
    targets: { chrome: 61 << 16 },
    minify: true,
  }).code;
}

const result = await build({
  entryPoints: ["src/minitool/entry.ts"],
  outdir: out,
  entryNames: "app",
  bundle: true,
  format: "iife",
  target: ["chrome61"],
  splitting: false,
  minify: true,
  legalComments: "none",
  metafile: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.VITE_MINITOOL": '"true"',
    "import.meta.env.BASE_URL": '"./"',
    // React's resource scheduling can probe the Network Information API. It is
    // unavailable in this container, so use React's built-in unknown-bandwidth path.
    "navigator.connection": "undefined",
  },
  plugins: [
    {
      name: "offline-boundary",
      setup(build) {
        build.onResolve({ filter: /^\.\/scene-loader$/ }, () => ({
          path: path.resolve("src/minitool/scene-loader.ts"),
        }));
        build.onResolve(
          {
            filter: /^\.\/(api|ranking-client|ranking-ui|player-name|replay)$/,
          },
          () => ({ path: path.resolve("src/minitool/no-network.ts") }),
        );
        if (silent)
          build.onResolve({ filter: /^\.\/audio$/ }, () => ({
            path: path.resolve("src/minitool/silent-audio.ts"),
          }));
        build.onLoad({ filter: /\.css$/ }, async (args) => ({
          contents: "",
          loader: "css",
        }));
      },
    },
  ],
});
// A second minification pass removes branches whose imported build flag became
// literal only after linking (including the unused invitation clipboard code).
const linked = await readFile(path.join(out, "app.js"), "utf8");
await writeFile(
  path.join(out, "app.js"),
  (
    await transformJs(linked, {
      minify: true,
      target: "chrome61",
      legalComments: "none",
    })
  ).code,
);
const css = await Promise.all(
  ["style", "mobile", "play-layout", "rain-ui", "minitool/compat"].map((name) =>
    readFile(`src/${name}.css`, "utf8"),
  ),
);
await writeFile(path.join(out, "app.css"), compatibleCss(css.join("\n")));
await cp("public/menu-scene.webp", path.join(out, "menu-scene.webp"));
await cp("public/paper-grain.svg", path.join(out, "paper-grain.svg"));
const licenses = {};
for (const name of ["react", "react-dom", "three"]) {
  licenses[name] = await readFile(`node_modules/${name}/LICENSE`, "utf8");
}
await writeFile(
  path.join(out, "licenses.json"),
  JSON.stringify(licenses, null, 2),
);
if (!silent)
  await cp("public/audio", path.join(out, "audio"), { recursive: true });
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html>
<html lang="zh-CN" translate="no" class="notranslate"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#2b3b4d"><meta name="google" content="notranslate">
<title>雨停之前 · 单人版</title><link rel="stylesheet" href="./app.css">
</head><body><div id="root" translate="no" class="notranslate"></div><script src="./app.js"></script></body></html>`,
);
await mkdir("work/minitool", { recursive: true });
await writeFile(
  `work/minitool/${silent ? "silent-" : ""}metafile.json`,
  JSON.stringify(result.metafile, null, 2),
);
console.log(`Built ${out}`);
