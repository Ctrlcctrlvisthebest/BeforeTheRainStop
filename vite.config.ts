import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  base: "./",
  // Toy serves the game below /toy/<slug>/. Keep its artifact separate from
  // the GitHub Pages / Worker build; the map editor stays on its own page there.
  plugins:
    mode === "toy"
      ? [
          {
            name: "toy-system-fonts",
            enforce: "pre",
            transformIndexHtml(html) {
              // Toy accepts PNG favicons but rejects .ico anywhere in the archive.
              return html.replace(
                /<link\b(?=[^>]*\bhref=["'][^"']*favicon\.ico["'])[^>]*>/gi,
                "",
              );
            },
            transform(code, id) {
              if (!id.endsWith(".css")) return;
              // The menu must not wait on Google Fonts in Bilibili's webview.
              return {
                code: code.replace(
                  /^@import url\("https:\/\/fonts\.googleapis\.com\/[^"\n]+"\);\s*/gm,
                  "",
                ),
                map: null,
              };
            },
          },
        ]
      : [],
  build: {
    outDir: mode === "toy" ? "dist-toy" : "dist",
    rolldownOptions: {
      input:
        mode === "toy"
          ? "index.html"
          : { game: "index.html", editor: "editor.html" },
    },
  },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8788", ws: true } } },
}));
