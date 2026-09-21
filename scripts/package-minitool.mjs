import { readFile, readdir, stat, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

export async function auditPackage(directory, silent = false) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(path.relative(directory, full));
    }
  }
  await walk(directory);
  const fail = (message) => {
    throw new Error(`${directory}: ${message}`);
  };
  if (
    !files.includes("index.html") ||
    files.filter((f) => f.endsWith(".html")).length !== 1
  )
    fail("one root index.html required");
  const extensions = /\.(html|css|js|png|jpe?g|gif|webp|svg|woff2?|json)$/i;
  for (const file of files)
    if (
      !extensions.test(file) &&
      (silent || !/^audio\/(lantern-walk|rain-wishes)\.m4a$/.test(file))
    )
      fail(`unsupported file ${file}`);
  const html = await readFile(path.join(directory, "index.html"), "utf8");
  if (
    /type=["']module|<script[^>]*>\s*[^<\s]|\son\w+=|<(?:base|iframe|object)\b|http-equiv=["']Content-Security-Policy/i.test(
      html,
    )
  )
    fail("invalid entry markup");
  const script = await readFile(path.join(directory, "app.js"), "utf8");
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /new\s+(?:WebSocket|EventSource|RTCPeerConnection|Worker|SharedWorker)\b/,
    /\beval\s*\(/,
    /new\s+Function\b/,
    /WebAssembly\./,
    /navigator\.(?:clipboard|geolocation|serviceWorker|connection|bluetooth|usb|serial|hid)\b/,
    /\b(?:requestFullscreen|webkitRequestFullscreen)\s*\(/,
    /window\.(?:open|prompt)\s*\(/,
    /\bimport\s*\(/,
  ];
  for (const pattern of forbidden)
    if (pattern.test(script)) fail(`prohibited API: ${pattern}`);
  if (
    /before-the-rain-rooms|workers\.dev|\/api\/rooms|\/api\/leaderboard/.test(
      script,
    )
  )
    fail("server implementation leaked into offline build");
  const css = await readFile(path.join(directory, "app.css"), "utf8");
  for (const content of [html, css]) {
    if (
      /(?:src|href)=["'](?:https?:|\/)|url\(["']?(?:https?:|\/)|@import/i.test(
        content,
      )
    )
      fail("external or absolute resource");
  }
  for (const match of [
    ...html.matchAll(/(?:src|href)=["']\.\/([^"']+)/g),
    ...css.matchAll(/url\(["']?\.\/([^"')]+)/g),
  ])
    if (!files.includes(match[1])) fail(`missing resource ${match[1]}`);
  const sizes = await Promise.all(
    files.map(async (file) => ({
      file,
      bytes: (await stat(path.join(directory, file))).size,
    })),
  );
  if (
    sizes.some(
      (f) => /\.(js|css|html|json)$/.test(f.file) && f.bytes > 2 * 1024 * 1024,
    )
  )
    fail("unexpectedly large text asset");
  if (!silent)
    console.log(
      "Music archive retained by request. Xiaohongshu has confirmed m4a is rejected; upload the no-music ZIP.",
    );
  return sizes;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  await mkdir("releases", { recursive: true });
  for (const silent of [false, true]) {
    const directory = path.resolve(
      silent ? "dist-minitool-silent" : "dist-minitool",
    );
    const sizes = await auditPackage(directory, silent);
    const zip = path.resolve(
      `releases/before-the-rain-xhs-solo-${version}${silent ? "-no-music" : ""}.zip`,
    );
    // Python standard library writes exactly the validated files, no outer folder.
    execFileSync("python3", [
      "-c",
      "import json,sys,zipfile,pathlib; root=pathlib.Path(sys.argv[1]); files=json.loads(sys.argv[3]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=9); [z.write(root/f,f) for f in files]; z.close()",
      directory,
      zip,
      JSON.stringify(sizes.map((f) => f.file).sort()),
    ]);
    const bytes = (await stat(zip)).size;
    if (bytes > 10 * 1024 * 1024) throw new Error("ZIP exceeds 10 MiB");
    console.log(
      `${zip}: ${(bytes / 1024 / 1024).toFixed(2)} MiB; ${sizes.length} files; ${(sizes.reduce((s, f) => s + f.bytes, 0) / 1024 / 1024).toFixed(2)} MiB unpacked`,
    );
  }
}
