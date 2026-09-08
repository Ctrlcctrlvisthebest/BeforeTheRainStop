import test from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { clientBoundary } from "../scripts/client-boundary";

test("real browser builds allow shared formatting and reject server moderation modules", async () => {
  const compile = (entry: string) =>
    build({
      configFile: false,
      logLevel: "silent",
      publicDir: false,
      plugins: [clientBoundary()],
      build: {
        write: false,
        rolldownOptions: {
          input: fileURLToPath(new URL(entry, import.meta.url)),
        },
      },
    });
  await compile("../src/player-name.ts");
  for (const entry of ["../server/name-policy.ts", "../server/name-terms.ts"])
    await assert.rejects(
      compile(entry),
      /Server-only modules cannot be imported into the browser/,
    );
});
