import { readFileSync } from "node:fs";
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

/**
 * `vite build --mode demo`: a browser-only copy of the site for static hosting.
 * src/demo/demo-api.js answers the /api calls from saved data (DEMO_DATA, or
 * src/demo/demo-data.json), and links point at the .html files.
 */
function demoSite() {
  const relative = (s) =>
    s
      .replaceAll('href="/app', 'href="app.html')
      .replaceAll('href="/terms"', 'href="terms.html"')
      .replaceAll('href="/privacy"', 'href="privacy.html"')
      .replaceAll('href="/#', 'href="index.html#')
      .replaceAll('href="/"', 'href="index.html"')
      .replaceAll('href="/favicon.svg"', 'href="favicon.svg"')
      // The minifier may write these strings with backticks.
      .replace(/(["`])\/app(#signin)?\1/g, "$1app.html$2$1")
      .replaceAll("`/app${", "`app.html${");
  return {
    name: "voronix-demo",
    transformIndexHtml: {
      order: "post",
      handler: (page) => relative(page).replace("<head>", '<head>\n  <script src="./demo-api.js"></script>'),
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) if (file.type === "chunk") file.code = relative(file.code);
      const data = process.env.DEMO_DATA ?? fileURLToPath(new URL("./src/demo/demo-data.json", import.meta.url));
      this.emitFile({ type: "asset", fileName: "demo-api.js", source: readFileSync(new URL("./src/demo/demo-api.js", import.meta.url), "utf8") });
      this.emitFile({ type: "asset", fileName: "demo-data.json", source: readFileSync(data, "utf8") });
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    appType: "mpa",
    base: demo ? "./" : "/",
    plugins: demo ? [cleanUrls, demoSite()] : [cleanUrls],
    server: {
      port: 5173,
      proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
    },
    build: {
      outDir: demo ? "dist-demo" : "dist",
      emptyOutDir: true,
      sourcemap: !demo,
      rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p, html(p)])) },
    },
  };
});
