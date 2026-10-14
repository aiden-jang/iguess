import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { DrawOp, Point } from "@iguess/shared";
import { floodFill } from "@iguess/shared/floodFill";
import { opsToSvg } from "./strokeSvg.ts";

before(async () => {
  const require = createRequire(import.meta.url);
  await initWasm(
    await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
  );
});
async function pixels(svg: string) {
  const renderer = new Resvg(svg);
  try {
    const image = renderer.render();
    try {
      return {
        width: image.width,
        height: image.height,
        data: image.pixels.slice(),
      };
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}
async function drawing(ops: DrawOp[]) {
  return pixels(await opsToSvg(ops, pixels));
}
function pixel(
  image: Awaited<ReturnType<typeof pixels>>,
  x: number,
  y: number,
) {
  return [
    ...image.data.slice(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4,
    ),
  ];
}
function line(
  id: string,
  points: Point[],
  width = 6,
  color = "#000000",
  erase = false,
  widths?: number[],
): DrawOp[] {
  return [
    { kind: "start", strokeId: id, point: points[0]!, width, color, erase },
    { kind: "move", strokeId: id, points: points.slice(1), widths },
    { kind: "end", strokeId: id },
  ];
}
const horizontal = [
  { x: 0.1, y: 0.5 },
  { x: 0.9, y: 0.5 },
];
const vertical = [
  { x: 0.5, y: 0 },
  { x: 0.5, y: 1 },
];
const fill = (id: string, color: string, x = 0.5, y = 0.5): DrawOp => ({
  kind: "fill",
  strokeId: id,
  color,
  point: { x, y },
});

test("renders an opaque white export for an empty log", async () => {
  assert.deepEqual(pixel(await drawing([]), 400, 300), [255, 255, 255, 255]);
});
test("renders the same midpoint curves used on the live canvas", async () => {
  const svg = await opsToSvg(line("s", horizontal, 4, "#ff0000"), pixels);
  assert.match(svg, /d="M80 300Q80 300 400 300L720 300"/);
  assert.deepEqual(pixel(await pixels(svg), 400, 300), [255, 0, 0, 255]);
});
test("drops malicious color markup and bounds stroke widths", async () => {
  const svg = await opsToSvg(
    line("s", horizontal, 200, '"/><script>x</script>'),
    pixels,
  );
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /stroke="#000000"/);
  assert.match(svg, /stroke-width="80"/);
});
test("clear discards earlier strokes and fills", async () => {
  const image = await drawing([
    ...line("s", horizontal),
    fill("f", "#ff0000"),
    { kind: "clear" },
  ]);
  assert.deepEqual(pixel(image, 400, 300), [255, 255, 255, 255]);
});
test("an unfinished stroke is visible before its end event", async () => {
  assert.deepEqual(
    pixel(await drawing(line("s", horizontal).slice(0, -1)), 400, 300),
    [0, 0, 0, 255],
  );
});
test("fills a transparent board before adding the export background", async () => {
  const image = await drawing([fill("f", "#f00")]);
  assert.deepEqual(pixel(image, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(image, 799, 599), [255, 0, 0, 255]);
});
test("a fill stays inside the drawn boundary", async () => {
  const boundary = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
    { x: 0.2, y: 0.2 },
  ];
  const image = await drawing([
    ...line("border", boundary, 12),
    fill("inside", "#ff0000"),
  ]);
  assert.deepEqual(pixel(image, 400, 300), [255, 0, 0, 255]);
  assert.deepEqual(pixel(image, 20, 20), [255, 255, 255, 255]);
});
test("eraser removes filled ink and allows the transparent cut to be filled again", async () => {
  const image = await drawing([
    fill("blue", "#0000ff"),
    ...line("erase", vertical, 40, "#000000", true),
    fill("green", "#00ff00"),
  ]);
  assert.deepEqual(pixel(image, 400, 300), [0, 255, 0, 255]);
  assert.deepEqual(pixel(image, 200, 300), [0, 0, 255, 255]);
});
test("new pen strokes paint over a previous erasure", async () => {
  const image = await drawing([
    fill("blue", "#0000ff"),
    ...line("erase", vertical, 40, "#000000", true),
    ...line("red", horizontal, 12, "#ff0000"),
  ]);
  assert.deepEqual(pixel(image, 400, 300), [255, 0, 0, 255]);
  assert.deepEqual(pixel(image, 400, 100), [255, 255, 255, 255]);
});
test("pressure widths survive the vision conversion", async () => {
  const image = await drawing(
    line(
      "pressure",
      [
        { x: 0.1, y: 0.5 },
        { x: 0.3, y: 0.5 },
        { x: 0.7, y: 0.5 },
      ],
      6,
      "#000000",
      false,
      [2, 30],
    ),
  );
  assert.deepEqual(pixel(image, 500, 310), [0, 0, 0, 255]);
  assert.deepEqual(pixel(image, 110, 310), [255, 255, 255, 255]);
});
test("draw order follows move events rather than stroke-end order", async () => {
  const red = line("red", horizontal, 20, "#ff0000");
  const blue = line("blue", vertical, 20, "#0000ff");
  const image = await drawing([...red.slice(0, -1), ...blue, red[2]!]);
  assert.deepEqual(pixel(image, 400, 300), [0, 0, 255, 255]);
});
test("undo removes a fill without deleting the retained drawing", async () => {
  const image = await drawing([
    ...line("s", horizontal),
    fill("f", "#ff0000", 0, 0),
    { kind: "undo", strokeId: "f" },
  ]);
  assert.deepEqual(pixel(image, 400, 300), [0, 0, 0, 255]);
  assert.deepEqual(pixel(image, 20, 20), [255, 255, 255, 255]);
});
test("shared scanline fill clamps border coordinates and preserves a contrasting barrier", () => {
  const data = new Uint8ClampedArray(5 * 4);
  data.set([0, 0, 0, 255], 2 * 4);
  const image = { width: 5, height: 1, data };
  floodFill(image, { x: 1, y: 1 }, "#f00");
  assert.deepEqual([...data.slice(16, 20)], [255, 0, 0, 255]);
  assert.deepEqual([...data.slice(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...data.slice(8, 12)], [0, 0, 0, 255]);
});
