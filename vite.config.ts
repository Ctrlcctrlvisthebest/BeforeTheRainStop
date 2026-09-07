import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: { input: { game: "index.html", editor: "editor.html" } },
  },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8788", ws: true } } },
});
