import type { DrawOp, Point } from "@iguess/shared";
let idCounter = 0;
const nextId = () => `ai-draw-${Date.now()}-${idCounter++}`;

export function stroke(points: Point[], color = "#222", width = 4): DrawOp[] {
  if (points.length === 0) return [];
  const strokeId = nextId();
  const [first, ...rest] = points;
  const ops: DrawOp[] = [
    { kind: "start", strokeId, color, width, point: first },
  ];
  if (rest.length) ops.push({ kind: "move", strokeId, points: rest });
  ops.push({ kind: "end", strokeId });
  return ops;
}

export function circle(
  cx: number,
  cy: number,
  r: number,
  color = "#222",
  width = 4,
  seg = 28,
): DrawOp[] {
  const pts: Point[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

export function arc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  color = "#222",
  width = 4,
): DrawOp[] {
  const pts: Point[] = [];
  const seg = Math.max(4, Math.round((Math.abs(a1 - a0) / (Math.PI * 2)) * 28));
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

export function oval(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color = "#222",
  width = 4,
): DrawOp[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

export function rect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color = "#222",
  width = 4,
): DrawOp[] {
  return stroke(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
      { x: x0, y: y0 },
    ],
    color,
    width,
  );
}

export function line(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color = "#222",
  width = 4,
): DrawOp[] {
  return stroke(
    [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ],
    color,
    width,
  );
}

export function starPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5; // 36° steps, start at top
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}
