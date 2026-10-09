import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === ".DS_Store") await rm(path, { force: true });
    else if (entry.isDirectory()) await clean(path);
  }
}
const output = process.argv[2] ?? "dist";
if (!["dist", "dist-toy", "dist-itch"].includes(output))
  throw new Error("Unknown build directory");
const directory = fileURLToPath(new URL(`../${output}`, import.meta.url));
await clean(directory);
// The 512px icon is a Toy publication cover, not a referenced web asset.
// Keep its source in public/ for uploads, without copying it to every game ZIP.
await rm(join(directory, "icons/icon-512.png"), { force: true });
if (output === "dist-toy")
  await rm(join(directory, "favicon.ico"), { force: true });
