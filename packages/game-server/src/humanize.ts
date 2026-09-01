import type { DrawOp, Point } from "@iguess/shared";

export type Rng = () => number;

// The stored doodles are exact, so without this every "cat" the AI draws is the same picture
// down to the pixel. This adds a shaky hand: slightly off aim, wobbly lines, overshot corners.

const WOBBLE = 0.006; // peak sideways waver, in canvas fractions
const MAX_SEG = 0.02; // straight lines carry no wobble until they have points to wobble

function clamp01(n: number): number {
  return n < 0.02 ? 0.02 : n > 0.98 ? 0.98 : n;
}

// A long line is only two points, so wobbling those just tilts it. Add points first.
function densify(points: Point[]): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / MAX_SEG));
    for (let s = 1; s <= steps; s++) {
      out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  return out;
}

// Two overlapping waves, not random noise. Random noise buzzes; this wanders like a wrist.
function makeWaver(rng: Rng): (t: number) => number {
  const f1 = 4 + rng() * 5;
  const f2 = 11 + rng() * 9;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  return (t) => Math.sin(t * f1 + p1) * 0.65 + Math.sin(t * f2 + p2) * 0.35;
}

// People overshoot the corner they were aiming for. Scale it to the stroke: a fixed amount
// turns a smiley's tiny eye into a letter "a".
function overshoot(points: Point[], rng: Rng): Point[] {
  if (points.length < 2) return points;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return points;
  const extra = Math.min((0.4 + rng() * 1.6) * MAX_SEG, total * 0.05);
  return [...points, { x: last.x + (dx / len) * extra, y: last.y + (dy / len) * extra }];
}

function transformStroke(points: Point[], rng: Rng, g: Global): Point[] {
  const dense = overshoot(densify(points), rng);
  const waver = makeWaver(rng);
  // Each stroke lands slightly off, like a hand that has already moved on.
  const ox = (rng() - 0.5) * 0.014;
  const oy = (rng() - 0.5) * 0.014;
  const amp = WOBBLE * (0.6 + rng() * 0.9);

  return dense.map((p, i) => {
    const t = dense.length > 1 ? i / (dense.length - 1) : 0;
    const nxt = dense[Math.min(i + 1, dense.length - 1)]!;
    const prv = dense[Math.max(i - 1, 0)]!;
    const tx = nxt.x - prv.x;
    const ty = nxt.y - prv.y;
    const tl = Math.hypot(tx, ty) || 1;
    // Push sideways to the direction of travel, so the line waves rather than stretches.
    const w = waver(t) * amp;
    let x = p.x + (-ty / tl) * w + ox;
    let y = p.y + (tx / tl) * w + oy;

    // Tilt the whole thing last, so the picture leans as one rather than falling apart.
    const rx = x - 0.5;
    const ry = y - 0.5;
    x = 0.5 + (rx * g.cos - ry * g.sin) * g.scale + g.dx;
    y = 0.5 + (rx * g.sin + ry * g.cos) * g.scale + g.dy;
    return { x: clamp01(x), y: clamp01(y) };
  });
}

interface Global {
  cos: number;
  sin: number;
  scale: number;
  dx: number;
  dy: number;
}

function pointsOf(ops: DrawOp[]): Point[] {
  const pts: Point[] = [];
  for (const op of ops) {
    if (op.kind === "start") pts.push(op.point);
    else if (op.kind === "move") pts.push(...op.points);
  }
  return pts;
}

// Stroke ids and their order are kept exactly as they were.
export function humanize(strokes: DrawOp[][], rng: Rng = Math.random): DrawOp[][] {
  const angle = (rng() - 0.5) * 0.14; // about +/- 4 degrees
  const g: Global = {
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    scale: 0.92 + rng() * 0.16,
    dx: (rng() - 0.5) * 0.05,
    dy: (rng() - 0.5) * 0.05,
  };

  return strokes.map((ops) => {
    const start = ops.find((o) => o.kind === "start");
    if (!start || start.kind !== "start") return ops;
    const moved = transformStroke(pointsOf(ops), rng, g);
    if (moved.length === 0) return ops;
    const [first, ...rest] = moved;
    const width = Math.max(2, Math.round(start.width + (rng() - 0.5) * 2.4));
    const out: DrawOp[] = [
      { kind: "start", strokeId: start.strokeId, color: start.color, width, point: first! },
    ];
    if (rest.length) out.push({ kind: "move", strokeId: start.strokeId, points: rest });
    out.push({ kind: "end", strokeId: start.strokeId });
    return out;
  });
}
