import type { Point } from "./events.ts";

const TOLERANCE = 60;
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Scanline fill compares alpha too, so erased pixels remain a connected transparent region. */
export function floodFill(image: PixelImage, at: Point, hex: string): void {
  const { width: w, height: h, data: px } = image;
  if (!w || !h) return;
  const sx = Math.min(w - 1, Math.max(0, Math.round(at.x * w)));
  const sy = Math.min(h - 1, Math.max(0, Math.round(at.y * h)));
  const offset = (x: number, y: number) => (y * w + x) * 4;
  const start = offset(sx, sy);
  const target = [px[start]!, px[start + 1]!, px[start + 2]!, px[start + 3]!];
  const color =
    hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const fill = [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
    255,
  ];
  const same = (r: number, g: number, b: number, a: number, other: number[]) =>
    Math.abs(r - other[0]!) +
      Math.abs(g - other[1]!) +
      Math.abs(b - other[2]!) +
      Math.abs(a - other[3]!) <
    TOLERANCE;
  if (same(target[0]!, target[1]!, target[2]!, target[3]!, fill)) return;
  const matches = (i: number) =>
    same(px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!, target);
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x0, y] = stack.pop()!;
    let x = x0;
    while (x > 0 && matches(offset(x - 1, y))) x--;
    let aboveSpan = false;
    let belowSpan = false;
    for (; x < w && matches(offset(x, y)); x++) {
      const i = offset(x, y);
      px[i] = fill[0]!;
      px[i + 1] = fill[1]!;
      px[i + 2] = fill[2]!;
      px[i + 3] = 255;
      const above = y > 0 && matches(offset(x, y - 1));
      if (above && !aboveSpan) stack.push([x, y - 1]);
      aboveSpan = above;
      const below = y < h - 1 && matches(offset(x, y + 1));
      if (below && !belowSpan) stack.push([x, y + 1]);
      belowSpan = below;
    }
  }
}
