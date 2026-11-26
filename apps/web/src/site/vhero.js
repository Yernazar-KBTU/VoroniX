// Video hero: play the short laptop shot once, then hand over to the real
// dashboard. The sharp screenshot starts where the laptop screen is at the end
// of the film (centred, large) and glides into its place next to the offer.
export function initVideoHero() {
  const hero = document.querySelector(".vhero");
  if (!hero) return;
  const video = hero.querySelector(".vh-video");
  const shot = hero.querySelector(".vh-shot");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !video) return hero.classList.add("done");

  hero.classList.add("playing");
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    // FLIP: measure the final place, start from the size of the screen in the last frame
    const end = shot.getBoundingClientRect();
    const box = hero.getBoundingClientRect();
    const w = Math.min(box.width * 0.86, (box.height - 40) * 1.6 * 0.86);
    const s = w / end.width;
    const x = box.left + (box.width - w) / 2 - end.left;
    const y = box.top + (box.height - end.height * s) / 2 - end.top;
    shot.style.transition = "none";
    shot.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    shot.style.opacity = "0";
    shot.getBoundingClientRect();
    hero.classList.remove("playing");
    hero.classList.add("done");
    shot.style.transition = "opacity .5s ease, transform 1.15s cubic-bezier(.65,0,.25,1) .35s";
    shot.style.opacity = "1";
    shot.style.transform = "none";
  }
  video.addEventListener("ended", finish);
  video.addEventListener("error", finish);
  // stop a few frames early so the hand-over starts from a still screen
  video.addEventListener("timeupdate", () => { if (video.duration && video.currentTime > video.duration - 0.12) finish(); });
  const p = video.play();
  if (p && p.catch) p.catch(finish); // autoplay blocked: show the final state
  setTimeout(finish, 9000);
}
