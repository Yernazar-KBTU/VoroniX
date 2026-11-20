// A quiet starfield behind the landing page. Stars twinkle, and each one drifts
// at its own depth while the page scrolls, so the background has some parallax.
// It stops while the tab is hidden and stays still for people who ask for less motion.
const TAU = Math.PI * 2;
const COLORS = ["#ffffff", "#d7d9ff", "#b9b3ff", "#ffffff", "#ffd5b8"];

export function startSky(canvas) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, stars = [], raf = 0, last = 0;

  function seed() {
    const count = Math.round(Math.min(150, Math.max(46, (W * H) / 9500)));
    stars = Array.from({ length: count }, () => {
      const z = Math.random(); // 0 is far away, 1 is close
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.35 + z * 1.15,
        a: 0.25 + z * 0.65,
        depth: 0.015 + z * 0.16,
        speed: 0.6 + Math.random() * 1.8,
        phase: Math.random() * TAU,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        spark: z > 0.9 && Math.random() < 0.55,
      };
    });
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(performance.now());
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const time = t / 1000;
    for (const s of stars) {
      const y = (((s.y - scrollY * s.depth) % H) + H) % H;
      const twinkle = still ? 1 : 0.62 + 0.38 * Math.sin(time * s.speed + s.phase);
      ctx.globalAlpha = s.a * twinkle;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, TAU);
      ctx.fill();
      if (s.spark) {
        // a four-point sparkle on the closest stars
        const len = s.r * 5.5;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(s.x - len, y);
        ctx.lineTo(s.x + len, y);
        ctx.moveTo(s.x, y - len);
        ctx.lineTo(s.x, y + len);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < 40) return; // about 25 frames a second is plenty for twinkling
    last = t;
    draw(t);
  }

  function run() {
    if (!raf && !still && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function halt() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => (document.hidden ? halt() : run()));
  resize();
  run();
}
