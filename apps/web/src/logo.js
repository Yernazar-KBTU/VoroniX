// The VoroniX mark: a "V" drawn as two strokes meeting at a point, with a spark
// for the AI that works inside the CRM. Used on the sign-in page, header and favicon.
let n = 0;
export function logoMark(size = 36) {
  const id = `vxg${++n}`;
  return `<svg class="vx-mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#22c3e6"/></linearGradient></defs>
  <rect width="48" height="48" rx="13" fill="url(#${id})"/>
  <path d="M13 15 L24 35 L35 15" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M35 6.5 l1.4 3.1 3.1 1.4 -3.1 1.4 -1.4 3.1 -1.4 -3.1 -3.1 -1.4 3.1 -1.4z" fill="#fff"/>
</svg>`;
}
export const logo = (size = 36) => `<span class="vx-logo">${logoMark(size)}<span class="vx-word">Voroni<b>X</b></span></span>`;
