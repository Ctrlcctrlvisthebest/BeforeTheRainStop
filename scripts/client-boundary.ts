import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin } from "vite";

const serverDirectory = normalizePath(
  fileURLToPath(new URL("../server/", import.meta.url)),
);

// Fail before tree shaking: a future UI import must not ship server policy or data.
export function clientBoundary(): Plugin {
  return {
    name: "server-only-boundary",
    enforce: "pre",
    transform(_code, id) {
      if (normalizePath(id).startsWith(serverDirectory))
        this.error("Server-only modules cannot be imported into the browser.");
    },
  };
}
