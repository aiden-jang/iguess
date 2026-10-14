import type { DrawOp } from "@iguess/shared";
import { dropStroke } from "@iguess/shared/strokeLog";
import { floodFill, type PixelImage } from "@iguess/shared/floodFill";
import {
  startStroke,
  strokePaths,
  type BrushStroke,
} from "@iguess/shared/strokePath";
import { base64, encodePng } from "./png.ts";

export const WIDTH = 800;
export const HEIGHT = 600;
type PixelRenderer = (svg: string) => Promise<PixelImage>;
const wrap = (ink: string, white = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${white ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>` : ""}${ink}</svg>`;
const color = (value: string) =>
  /^(#[\da-f]{3}|#[\da-f]{6})$/i.test(value) ? value : "#000000";

export async function opsToSvg(
  ops: DrawOp[],
  render: PixelRenderer,
): Promise<string> {
  let retained: DrawOp[] = [];
  for (const op of ops) {
    if (op.kind === "clear") retained = [];
    else if (op.kind === "undo") {
      if (op.strokeId) retained = dropStroke(retained, op.strokeId);
    } else retained.push(op);
  }
  const strokes = new Map<string, BrushStroke>();
  let ink = "";
  let eraser = "";
  let maskId = 0;
  const flushEraser = () => {
    if (!eraser) return;
    const id = `erase-${maskId++}`;
    ink = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>${eraser}</mask></defs><g mask="url(#${id})">${ink}</g>`;
    eraser = "";
  };
  for (const op of retained) {
    if (op.kind === "start") strokes.set(op.strokeId, startStroke(op));
    else if (op.kind === "end") strokes.delete(op.strokeId);
    else if (op.kind === "move") {
      const stroke = strokes.get(op.strokeId);
      if (!stroke) continue;
      if (!stroke.erase) flushEraser();
      for (const path of strokePaths(stroke, op, WIDTH, HEIGHT)) {
        const svg = `<path d="${path.d}" fill="none" stroke="${stroke.erase ? "black" : color(stroke.color)}" stroke-width="${Math.max(0.1, Math.min(80, path.width))}" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (stroke.erase) eraser += svg;
        else ink += svg;
      }
    } else if (op.kind === "fill") {
      flushEraser();
      // Fill transparent pixels before adding the white export background, as the live board does.
      const pixels = await render(wrap(ink));
      floodFill(pixels, op.point, color(op.color));
      const png = base64(await encodePng(pixels));
      ink = `<image width="${WIDTH}" height="${HEIGHT}" href="data:image/png;base64,${png}"/>`;
    }
  }
  flushEraser();
  return wrap(ink, true);
}
