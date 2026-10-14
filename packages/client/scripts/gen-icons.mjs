// Rasterize public/icon.svg into the PNG sizes iOS, Android, and PWA installs
// expect. Output PNGs are committed; re-run with
// `pnpm --filter @iguess/client gen:icons` after editing the SVG.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const pub = resolve(import.meta.dirname, "..", "public");
const svg = readFileSync(resolve(pub, "icon.svg"), "utf8");
// iOS (apple-touch-icon) and Android (maskable) apply their own rounded mask and turn any
// transparency black, so those must be full-bleed opaque squares — drop the corner radius. The
// browser icons keep the rounded look.
const fullBleedSvg = svg.replace('rx="120"', 'rx="0"');

const targets = [
  ["favicon-32.png", 32, svg],
  ["apple-touch-icon.png", 180, fullBleedSvg],
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, fullBleedSvg],
];

for (const [name, size, source] of targets) {
  const png = new Resvg(source, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  writeFileSync(resolve(pub, name), png);
  console.log(
    `wrote ${name} (${size}x${size}, ${png.length.toLocaleString()} bytes)`,
  );
}
