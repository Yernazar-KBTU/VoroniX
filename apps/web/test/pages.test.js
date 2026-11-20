// The public pages (landing, Terms, Privacy) have to keep working under the
// server's Content-Security-Policy, and under the browser-only demo build.
// CSP: script-src 'self' (no inline scripts, no inline handlers); pictures,
// scripts, styles and fonts only from this site and Google Fonts.
// Demo build (vite.config.js): it rewrites a fixed set of link forms, so a link
// written any other way would break on static hosting without anyone noticing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAGES = ["index", "terms", "privacy"];
const html = Object.fromEntries(PAGES.map((page) => [page, readFileSync(new URL(`../${page}.html`, import.meta.url), "utf8")]));
const values = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1]);

for (const page of PAGES) {
  describe(`${page}.html`, () => {
    it("has no inline scripts and no inline event handlers", () => {
      expect(html[page]).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
      expect(html[page]).not.toMatch(/\son[a-z]+\s*=/i);
    });

    it("loads resources only from this site or Google Fonts", () => {
      const loaded = values(html[page], /<(?:script|link|img|source|iframe|video|audio)\b[^>]*?\s(?:src|href)="([^"]*)"/gi);
      expect(loaded.length).toBeGreaterThan(0);
      for (const url of loaded) {
        expect(url, url).toMatch(/^(?:\/(?!\/)|#|https:\/\/fonts\.googleapis\.com(?:\/|$)|https:\/\/fonts\.gstatic\.com(?:\/|$))/);
      }
    });

    it("writes site links in the forms the demo build rewrites", () => {
      const links = values(html[page], /\shref="(\/[^"]*)"/g).filter((href) => !href.startsWith("//"));
      expect(links.length).toBeGreaterThan(0);
      for (const href of links) {
        expect(href, href).toMatch(/^\/(?:$|#|app(?:[#?/]|$)|terms$|privacy$|favicon\.svg$)/);
      }
    });
  });
}

describe("page anchors", () => {
  const ids = new Set(values(html.index, /\sid="([^"]+)"/g));

  it("every #link on the landing page points at an element of it", () => {
    for (const anchor of new Set(values(html.index, /\shref="#([^"]+)"/g))) {
      expect(ids.has(anchor), `#${anchor}`).toBe(true);
    }
  });

  it("every /#link from Terms and Privacy points at an element of the landing page", () => {
    for (const page of ["terms", "privacy"]) {
      for (const anchor of new Set(values(html[page], /\shref="\/#([^"]+)"/g))) {
        expect(ids.has(anchor), `${page}: /#${anchor}`).toBe(true);
      }
    }
  });
});
