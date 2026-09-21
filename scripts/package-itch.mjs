import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve("dist-itch");
const licenses = {};
for (const name of ["react", "react-dom", "three"])
  licenses[name] = await readFile(`node_modules/${name}/LICENSE`, "utf8");
await writeFile(
  path.join(root, "licenses.json"),
  JSON.stringify(licenses, null, 2),
);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push(path.relative(root, full));
  }
}
await walk(root);
if (!files.includes("index.html") || files.includes("editor.html"))
  throw new Error("Expected one game entry, without the map editor");
if (files.length > 1000 || files.some((file) => file.length > 240))
  throw new Error("itch.io file count or path limit exceeded");
let total = 0;
for (const file of files) {
  const bytes = (await stat(path.join(root, file))).size;
  total += bytes;
  if (bytes > 200 * 1024 * 1024) throw new Error(`Asset too large: ${file}`);
  if (file.endsWith(".html") || file.endsWith(".css")) {
    const text = await readFile(path.join(root, file), "utf8");
    for (const match of text.matchAll(
      /(?:src|href)=["']([^"']+)["']|url\(["']?([^"')]+)["']?\)/g,
    )) {
      const ref = match[1] ?? match[2];
      if (/^(?:https:|data:|#)/.test(ref)) continue;
      if (/^(?:\/|http:)/.test(ref))
        throw new Error(`Non-relative asset: ${ref}`);
      const asset = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), ref.split(/[?#]/)[0]),
      );
      if (!files.includes(asset))
        throw new Error(`Missing asset: ${file} -> ${ref}`);
    }
  }
}
if (total > 500 * 1024 * 1024)
  throw new Error("Unpacked archive exceeds itch.io limit");
for (const name of ["lantern-walk", "rain-wishes"]) {
  const rel = `audio/${name}.m4a`;
  if (
    !(await readFile(path.join(root, rel))).equals(
      await readFile(`public/${rel}`),
    )
  )
    throw new Error(`BGM differs from original: ${name}`);
}
const version = JSON.parse(await readFile("package.json", "utf8")).version;
await mkdir("releases", { recursive: true });
const zip = path.resolve(`releases/before-the-rain-itch-${version}.zip`);
execFileSync("python3", [
  "-c",
  "import json,sys,zipfile,pathlib; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=9); [z.write(root/f,f) for f in json.loads(sys.argv[3])]; z.close()",
  root,
  zip,
  JSON.stringify(files.sort()),
]);
console.log(
  `${zip}: ${((await stat(zip)).size / 1024 / 1024).toFixed(2)} MiB, ${files.length} files; original UI and both BGM retained`,
);
