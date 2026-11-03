import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Four pages: the landing page (/), the CRM (/app), Terms and Privacy.
const PAGES = ["index", "app", "terms", "privacy"];
const html = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

/** The same clean addresses in development as the API server serves: /app, /terms, /privacy. */
const cleanUrls = {
  name: "clean-urls",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = req.url.split("?");
      const page = /^\/(app|terms|privacy)\/?$/.exec(path)?.[1];
      if (page) req.url = `/${page}.html${query ? `?${query}` : ""}`;
      next();
    });
  },
};

export default defineConfig({
  appType: "mpa",
  plugins: [cleanUrls],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p, html(p)])) },
  },
});
