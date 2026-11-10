import type { DrawOp, Point } from "./events.ts";

export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 600;
export const RELAY_BOARD_WIDTH = 900;

export interface BrushStroke {
  last: Point;
  mid: Point;
  color: string;
  width: number;
  erase: boolean;
}
export function startStroke(
  op: Extract<DrawOp, { kind: "start" }>,
): BrushStroke {
  return {
    last: op.point,
    mid: op.point,
    color: op.color,
    width: op.width,
    erase: op.erase === true,
  };
}

/** Both renderers use the same midpoint smoothing and pressure segments. */
export function strokePaths(
  stroke: BrushStroke,
  op: Extract<DrawOp, { kind: "move" }>,
  width: number,
  height: number,
): { d: string; width: number }[] {
  if (!op.points.length) return [];
  const point = (p: Point) => `${p.x * width} ${p.y * height}`;
  let prev = stroke.last;
  let mid = stroke.mid;
  let path = `M${point(mid)}`;
  const paths: { d: string; width: number }[] = [];
  if (
    op.points.length === 1 &&
    op.points[0]!.x === prev.x &&
    op.points[0]!.y === prev.y &&
    prev.x === mid.x &&
    prev.y === mid.y
  )
    return [
      {
        d: `${path}L${prev.x * width + 0.001} ${prev.y * height}`,
        width: op.widths?.[0] ?? stroke.width,
      },
    ];
  for (const [i, p] of op.points.entries()) {
    const next = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
    const curve = `Q${point(prev)} ${point(next)}`;
    if (op.widths) {
      paths.push({
        d: `M${point(mid)}${curve}L${point(p)}`,
        width: op.widths[i] ?? stroke.width,
      });
    } else path += curve;
    mid = next;
    prev = p;
  }
  if (!op.widths)
    paths.push({ d: `${path}L${point(prev)}`, width: stroke.width });
  stroke.last = prev;
  stroke.mid = mid;
  return paths;
}
