import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';

// A link preview naming the actual room, instead of the same picture for every invite. It lives
// in this worker because this is the one with the SVG-to-PNG converter already in it.

const W = 1200;
const H = 630;

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(resvgWasm);
  return wasmReady;
}

// Room codes are tame, but this draws whatever it is given, so escape it anyway.
function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!
  );
}

export function ogSvg(room: string, mode: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a855f7"/>
      <stop offset="0.55" stop-color="#f472b6"/>
      <stop offset="1" stop-color="#fb923c"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b0a12"/>
  <circle cx="${W - 120}" cy="-80" r="340" fill="url(#g)" opacity="0.22"/>
  <text x="80" y="150" font-family="Verdana, DejaVu Sans, sans-serif" font-size="64" font-weight="bold" fill="url(#g)">iguess</text>
  <text x="80" y="210" font-family="Verdana, DejaVu Sans, sans-serif" font-size="30" fill="#a39bb8">draw bad, win anyway. race the AI.</text>
  <text x="80" y="360" font-family="Verdana, DejaVu Sans, sans-serif" font-size="34" fill="#a39bb8">room</text>
  <text x="80" y="440" font-family="Verdana, DejaVu Sans, sans-serif" font-size="72" font-weight="bold" fill="#f1edf7">${esc(room)}</text>
  <text x="80" y="530" font-family="Verdana, DejaVu Sans, sans-serif" font-size="32" fill="#a39bb8">${esc(mode)}</text>
</svg>`;
}

export async function ogPng(room: string, mode: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(ogSvg(room, mode), { fitTo: { mode: 'width', value: W } });
  return resvg.render().asPng();
}
