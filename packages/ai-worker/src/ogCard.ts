import { rasterize } from "./rasterize.ts";
import interFont from "./fonts/inter-latin.woff2";

// A link preview naming the actual room, instead of the same picture for every invite. It lives
// in this worker because this is the one with the SVG-to-PNG converter already in it.

const W = 1200;
const H = 630;

// Room codes are tame, but this draws whatever it is given, so escape it anyway.
function esc(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c]!,
  );
}

export function ogSvg(room: string, mode: string): string {
  const codeSize = Math.min(66, Math.floor(1000 / Math.max(1, room.length)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f2f2e9"/>
  <path d="M64 106h1072" stroke="#cdd2c5"/>
  <text x="64" y="78" font-family="Inter, sans-serif" font-size="32" font-weight="bold" fill="#202522">iguess</text>
  <text x="64" y="218" font-family="Inter, sans-serif" font-size="56" font-weight="bold" letter-spacing="-3" fill="#202522">Your people are in here.</text>
  <text x="64" y="270" font-family="Inter, sans-serif" font-size="24" fill="#65705e">Artistic credentials remain optional.</text>
  <rect x="64" y="320" width="1072" height="155" fill="#d8ed79"/>
  <text x="88" y="355" font-family="Inter, sans-serif" font-size="14" fill="#202522">ROOM / ${esc(mode)}</text>
  <text x="88" y="435" font-family="Inter, sans-serif" font-size="${codeSize}" font-weight="bold" fill="#202522">${esc(room)}</text>
  <text x="64" y="562" font-family="Inter, sans-serif" font-size="24" fill="#65705e">Draw badly. Guess wildly.</text>
  <g transform="translate(1062 512)"><path d="M0 0Q28-7 57 2L60 50Q28 63-4 49Z" fill="#d8ed79"/><path d="m13 17 1 3m28-3-1 3m-24 17 25-1" stroke="#202522" stroke-width="3" stroke-linecap="round" fill="none"/></g>
</svg>`;
}

export async function ogPng(room: string, mode: string): Promise<Uint8Array> {
  return rasterize(ogSvg(room, mode), {
    fitTo: { mode: "width", value: W },
    font: {
      fontBuffers: [new Uint8Array(interFont)],
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
  });
}
