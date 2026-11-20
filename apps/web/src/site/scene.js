// Scroll behaviour of the landing page: sections fade in as they come into view,
// the hero sky reacts to how far the page has scrolled (--p, from 0 to 1), the
// product preview rises into place (--r), and glass cards get a soft spotlight.
export function initScene() {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = document.querySelector(".nav");
  const hero = document.querySelector(".hero");
  const stage = document.querySelector(".stage");
  const rise = document.querySelector("[data-rise]");

  const items = document.querySelectorAll(".rv");
  if (still || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((el) => io.observe(el));
  }

  let queued = false;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  function update() {
    queued = false;
    const y = scrollY;
    nav?.classList.toggle("scrolled", y > 24);
    if (hero && stage) {
      // pinned on desktop: progress runs over the pinned distance; on phones over the hero itself
      // with reduced motion the hero stays still: no pinning, no scroll-linked fade or zoom (see site.css)
      const pinned = hero.offsetHeight - stage.offsetHeight;
      hero.style.setProperty("--p", (still ? 0 : clamp(y / (pinned > 40 ? pinned : hero.offsetHeight * 0.85))).toFixed(3));
    }
    if (rise) {
      const top = rise.getBoundingClientRect().top;
      rise.style.setProperty("--r", (still ? 1 : clamp((innerHeight - top) / (innerHeight * 0.62))).toFixed(3));
    }
  }
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  update();

  if (matchMedia("(hover: hover)").matches) {
    document.addEventListener(
      "pointermove",
      (e) => {
        const card = e.target.closest?.(".gcard");
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - box.left}px`);
        card.style.setProperty("--my", `${e.clientY - box.top}px`);
      },
      { passive: true },
    );
  }
}
