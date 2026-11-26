// The VoroniX mark: an X inside an open ring, crossed by a thin orbit line,
// in the Ocean gradient. Used on the sign-in page and in the menu;
// public/favicon.svg and the landing pages use the same picture.
import markUrl from "./logo-mark.png?inline";

export function logoMark(size = 36) {
  return `<img class="vx-mark" src="${markUrl}" width="${size}" height="${size}" alt="" aria-hidden="true">`;
}
export const logo = (size = 36) => `<span class="vx-logo">${logoMark(size)}<span class="vx-word">Voroni<b>X</b></span></span>`;
