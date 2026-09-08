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
if (!["dist", "dist-toy"].includes(output))
  throw new Error("Unknown build directory");
const directory = fileURLToPath(new URL(`../${output}`, import.meta.url));
await clean(directory);
if (output === "dist-toy")
  await rm(join(directory, "favicon.ico"), { force: true });
