import type { DrawOp, Point } from "@iguess/shared";
import { humanize, type Rng } from "./humanize.ts";

// Stored as lists of strokes so they can be revealed gradually, in 0..1 coordinates like
// everywhere else. A real generator drops in behind AIDrawerMode's `requestDrawing` without
// touching anything here.

let idCounter = 0;
const nextId = () => `ai-draw-${Date.now()}-${idCounter++}`;

function stroke(points: Point[], color = "#222", width = 4): DrawOp[] {
  if (points.length === 0) return [];
  const strokeId = nextId();
  const [first, ...rest] = points;
  const ops: DrawOp[] = [{ kind: "start", strokeId, color, width, point: first }];
  if (rest.length) ops.push({ kind: "move", strokeId, points: rest });
  ops.push({ kind: "end", strokeId });
  return ops;
}

function circle(cx: number, cy: number, r: number, color = "#222", width = 4, seg = 28): DrawOp[] {
  const pts: Point[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, color = "#222", width = 4): DrawOp[] {
  const pts: Point[] = [];
  const seg = Math.max(4, Math.round((Math.abs(a1 - a0) / (Math.PI * 2)) * 28));
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

function oval(cx: number, cy: number, rx: number, ry: number, color = "#222", width = 4): DrawOp[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

function rect(x0: number, y0: number, x1: number, y1: number, color = "#222", width = 4): DrawOp[] {
  return stroke(
    [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }],
    color,
    width
  );
}

function line(x0: number, y0: number, x1: number, y1: number, color = "#222", width = 4): DrawOp[] {
  return stroke([{ x: x0, y: y0 }, { x: x1, y: y1 }], color, width);
}

function starPath(cx: number, cy: number, outer: number, inner: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5; // 36° steps, start at top
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

export const DOODLES: Record<string, () => DrawOp[][]> = {
  house: () => [
    stroke([
      { x: 0.35, y: 0.6 }, { x: 0.65, y: 0.6 }, { x: 0.65, y: 0.85 },
      { x: 0.35, y: 0.85 }, { x: 0.35, y: 0.6 },
    ]),
    stroke([{ x: 0.3, y: 0.6 }, { x: 0.5, y: 0.42 }, { x: 0.7, y: 0.6 }]),
    stroke([
      { x: 0.46, y: 0.85 }, { x: 0.46, y: 0.72 },
      { x: 0.54, y: 0.72 }, { x: 0.54, y: 0.85 },
    ]),
  ],
  tree: () => [
    stroke([
      { x: 0.47, y: 0.85 }, { x: 0.47, y: 0.62 },
      { x: 0.53, y: 0.62 }, { x: 0.53, y: 0.85 },
    ]),
    circle(0.5, 0.44, 0.16),
  ],
  star: () => [stroke([...starPath(0.5, 0.5, 0.26, 0.11)])],
  smiley: () => [
    circle(0.5, 0.5, 0.28),
    circle(0.41, 0.43, 0.025),
    circle(0.59, 0.43, 0.025),
    stroke([
      { x: 0.38, y: 0.58 }, { x: 0.44, y: 0.66 },
      { x: 0.56, y: 0.66 }, { x: 0.62, y: 0.58 },
    ]),
  ],
  cat: () => [
    circle(0.5, 0.55, 0.22),
    stroke([{ x: 0.34, y: 0.4 }, { x: 0.3, y: 0.22 }, { x: 0.46, y: 0.36 }]),
    stroke([{ x: 0.66, y: 0.4 }, { x: 0.7, y: 0.22 }, { x: 0.54, y: 0.36 }]),
    stroke([{ x: 0.44, y: 0.52 }, { x: 0.46, y: 0.52 }]),
    stroke([{ x: 0.54, y: 0.52 }, { x: 0.56, y: 0.52 }]),
    stroke([{ x: 0.3, y: 0.6 }, { x: 0.18, y: 0.57 }]),
    stroke([{ x: 0.3, y: 0.63 }, { x: 0.18, y: 0.64 }]),
    stroke([{ x: 0.7, y: 0.6 }, { x: 0.82, y: 0.57 }]),
    stroke([{ x: 0.7, y: 0.63 }, { x: 0.82, y: 0.64 }]),
  ],
  sun: () => {
    const rays: DrawOp[][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      rays.push(stroke([{ x: 0.5 + 0.19 * c, y: 0.5 + 0.19 * s }, { x: 0.5 + 0.32 * c, y: 0.5 + 0.32 * s }]));
    }
    return [circle(0.5, 0.5, 0.15), ...rays];
  },
  flower: () => {
    // One wavy ring, not five circles. Five circles look like a bunch of grapes.
    const ring: Point[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
      const r = 0.09 + 0.08 * Math.abs(Math.cos((5 * a) / 2));
      ring.push({ x: 0.5 + r * Math.cos(a), y: 0.38 + r * Math.sin(a) });
    }
    return [
      stroke(ring),
      circle(0.5, 0.38, 0.05),
      stroke([{ x: 0.5, y: 0.44 }, { x: 0.51, y: 0.84 }]),
      stroke([{ x: 0.51, y: 0.66 }, { x: 0.66, y: 0.58 }, { x: 0.62, y: 0.7 }, { x: 0.51, y: 0.66 }]),
    ];
  },
  heart: () => [
    stroke([
      { x: 0.5, y: 0.74 }, { x: 0.32, y: 0.55 }, { x: 0.3, y: 0.42 }, { x: 0.38, y: 0.36 },
      { x: 0.5, y: 0.44 }, { x: 0.62, y: 0.36 }, { x: 0.7, y: 0.42 }, { x: 0.68, y: 0.55 },
      { x: 0.5, y: 0.74 },
    ]),
  ],
  fish: () => [
    stroke([
      { x: 0.3, y: 0.5 }, { x: 0.44, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.68, y: 0.5 },
      { x: 0.6, y: 0.6 }, { x: 0.44, y: 0.6 }, { x: 0.3, y: 0.5 },
    ]),
    stroke([{ x: 0.68, y: 0.5 }, { x: 0.8, y: 0.42 }, { x: 0.8, y: 0.58 }, { x: 0.68, y: 0.5 }]),
    circle(0.4, 0.47, 0.014),
  ],
  cloud: () => [
    // One bumpy outline. Overlapping circles just look like overlapping circles.
    stroke([
      { x: 0.28, y: 0.62 }, { x: 0.24, y: 0.55 }, { x: 0.28, y: 0.47 }, { x: 0.36, y: 0.45 },
      { x: 0.38, y: 0.37 }, { x: 0.48, y: 0.33 }, { x: 0.57, y: 0.36 }, { x: 0.62, y: 0.42 },
      { x: 0.71, y: 0.43 }, { x: 0.77, y: 0.5 }, { x: 0.75, y: 0.58 }, { x: 0.68, y: 0.62 },
      { x: 0.28, y: 0.62 },
    ]),
  ],
  boat: () => [
    stroke([{ x: 0.32, y: 0.62 }, { x: 0.68, y: 0.62 }, { x: 0.6, y: 0.74 }, { x: 0.4, y: 0.74 }, { x: 0.32, y: 0.62 }]),
    stroke([{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.32 }]),
    stroke([{ x: 0.5, y: 0.34 }, { x: 0.5, y: 0.58 }, { x: 0.66, y: 0.58 }, { x: 0.5, y: 0.34 }]),
  ],
  mushroom: () => [
    stroke([
      { x: 0.32, y: 0.5 }, { x: 0.36, y: 0.4 }, { x: 0.5, y: 0.36 }, { x: 0.64, y: 0.4 },
      { x: 0.68, y: 0.5 }, { x: 0.32, y: 0.5 },
    ]),
    stroke([{ x: 0.44, y: 0.5 }, { x: 0.44, y: 0.66 }, { x: 0.56, y: 0.66 }, { x: 0.56, y: 0.5 }]),
  ],
  apple: () => [
    arc(0.5, 0.56, 0.2, -Math.PI * 0.9, Math.PI * 0.9),
    stroke([{ x: 0.5, y: 0.38 }, { x: 0.52, y: 0.26 }]),
    stroke([{ x: 0.52, y: 0.3 }, { x: 0.66, y: 0.24 }, { x: 0.56, y: 0.34 }]),
  ],
  moon: () => [
    stroke([
      { x: 0.6, y: 0.22 }, { x: 0.42, y: 0.3 }, { x: 0.36, y: 0.5 }, { x: 0.42, y: 0.7 },
      { x: 0.6, y: 0.78 }, { x: 0.5, y: 0.66 }, { x: 0.48, y: 0.5 }, { x: 0.5, y: 0.34 },
      { x: 0.6, y: 0.22 },
    ]),
  ],
  key: () => [
    circle(0.34, 0.5, 0.11),
    line(0.45, 0.5, 0.74, 0.5),
    line(0.66, 0.5, 0.66, 0.6),
    line(0.72, 0.5, 0.72, 0.58),
  ],
  cup: () => [
    stroke([{ x: 0.34, y: 0.38 }, { x: 0.4, y: 0.68 }, { x: 0.6, y: 0.68 }, { x: 0.66, y: 0.38 }, { x: 0.34, y: 0.38 }]),
    arc(0.68, 0.48, 0.08, -Math.PI / 2, Math.PI / 2),
    line(0.32, 0.72, 0.68, 0.72),
  ],
  door: () => [rect(0.36, 0.22, 0.64, 0.82), circle(0.59, 0.55, 0.02)],
  eye: () => [
    stroke([{ x: 0.26, y: 0.5 }, { x: 0.4, y: 0.38 }, { x: 0.6, y: 0.38 }, { x: 0.74, y: 0.5 }]),
    stroke([{ x: 0.26, y: 0.5 }, { x: 0.4, y: 0.62 }, { x: 0.6, y: 0.62 }, { x: 0.74, y: 0.5 }]),
    circle(0.5, 0.5, 0.08),
    circle(0.5, 0.5, 0.03),
  ],
  flag: () => [
    line(0.32, 0.2, 0.32, 0.84),
    stroke([{ x: 0.32, y: 0.24 }, { x: 0.7, y: 0.32 }, { x: 0.32, y: 0.46 }]),
  ],
  hat: () => [
    // A cap, not a top hat. The peak sticking out to one side is what stops it looking
    // like a plain box.
    arc(0.46, 0.58, 0.22, Math.PI, Math.PI * 2),
    stroke([{ x: 0.24, y: 0.58 }, { x: 0.68, y: 0.58 }]),
    stroke([{ x: 0.68, y: 0.57 }, { x: 0.82, y: 0.6 }, { x: 0.8, y: 0.66 }, { x: 0.66, y: 0.63 }]),
    line(0.46, 0.36, 0.46, 0.58),
  ],
  ladder: () => [
    line(0.38, 0.16, 0.38, 0.84),
    line(0.62, 0.16, 0.62, 0.84),
    line(0.38, 0.3, 0.62, 0.3),
    line(0.38, 0.45, 0.62, 0.45),
    line(0.38, 0.6, 0.62, 0.6),
    line(0.38, 0.75, 0.62, 0.75),
  ],
  ghost: () => [
    stroke([
      { x: 0.32, y: 0.78 }, { x: 0.32, y: 0.46 }, { x: 0.38, y: 0.28 }, { x: 0.5, y: 0.24 },
      { x: 0.62, y: 0.28 }, { x: 0.68, y: 0.46 }, { x: 0.68, y: 0.78 }, { x: 0.6, y: 0.7 },
      { x: 0.5, y: 0.78 }, { x: 0.4, y: 0.7 }, { x: 0.32, y: 0.78 },
    ]),
    circle(0.44, 0.44, 0.025),
    circle(0.57, 0.44, 0.025),
  ],
  snowman: () => [
    circle(0.5, 0.72, 0.16),
    circle(0.5, 0.48, 0.12),
    circle(0.5, 0.3, 0.09),
    circle(0.47, 0.28, 0.015),
    circle(0.53, 0.28, 0.015),
    line(0.38, 0.46, 0.22, 0.36),
    line(0.62, 0.46, 0.78, 0.36),
  ],
  candle: () => [
    rect(0.42, 0.4, 0.58, 0.82),
    line(0.5, 0.4, 0.5, 0.34),
    stroke([{ x: 0.5, y: 0.34 }, { x: 0.44, y: 0.26 }, { x: 0.5, y: 0.16 }, { x: 0.56, y: 0.26 }, { x: 0.5, y: 0.34 }]),
  ],
  clock: () => [
    circle(0.5, 0.5, 0.26),
    line(0.5, 0.5, 0.5, 0.32),
    line(0.5, 0.5, 0.64, 0.56),
    circle(0.5, 0.5, 0.018),
  ],
  book: () => [
    stroke([{ x: 0.26, y: 0.32 }, { x: 0.5, y: 0.38 }, { x: 0.74, y: 0.32 }]),
    stroke([{ x: 0.26, y: 0.32 }, { x: 0.26, y: 0.68 }, { x: 0.5, y: 0.74 }]),
    stroke([{ x: 0.74, y: 0.32 }, { x: 0.74, y: 0.68 }, { x: 0.5, y: 0.74 }]),
    line(0.5, 0.38, 0.5, 0.74),
  ],
  bell: () => [
    stroke([
      { x: 0.3, y: 0.68 }, { x: 0.34, y: 0.44 }, { x: 0.44, y: 0.3 }, { x: 0.56, y: 0.3 },
      { x: 0.66, y: 0.44 }, { x: 0.7, y: 0.68 }, { x: 0.3, y: 0.68 },
    ]),
    line(0.5, 0.3, 0.5, 0.24),
    circle(0.5, 0.74, 0.035),
  ],
  bone: () => [
    line(0.34, 0.46, 0.66, 0.46),
    line(0.34, 0.56, 0.66, 0.56),
    circle(0.29, 0.44, 0.055),
    circle(0.29, 0.57, 0.055),
    circle(0.71, 0.44, 0.055),
    circle(0.71, 0.57, 0.055),
  ],
  box: () => [
    rect(0.3, 0.42, 0.66, 0.76),
    stroke([{ x: 0.3, y: 0.42 }, { x: 0.42, y: 0.28 }, { x: 0.78, y: 0.28 }, { x: 0.66, y: 0.42 }]),
    line(0.66, 0.42, 0.78, 0.28),
    line(0.66, 0.76, 0.78, 0.62),
    line(0.78, 0.28, 0.78, 0.62),
  ],
  egg: () => [
    stroke([
      { x: 0.5, y: 0.22 }, { x: 0.64, y: 0.38 }, { x: 0.68, y: 0.58 }, { x: 0.6, y: 0.74 },
      { x: 0.5, y: 0.78 }, { x: 0.4, y: 0.74 }, { x: 0.32, y: 0.58 }, { x: 0.36, y: 0.38 },
      { x: 0.5, y: 0.22 },
    ]),
  ],
  kite: () => [
    stroke([{ x: 0.5, y: 0.16 }, { x: 0.7, y: 0.42 }, { x: 0.5, y: 0.7 }, { x: 0.3, y: 0.42 }, { x: 0.5, y: 0.16 }]),
    line(0.5, 0.16, 0.5, 0.7),
    line(0.3, 0.42, 0.7, 0.42),
    stroke([{ x: 0.5, y: 0.7 }, { x: 0.56, y: 0.78 }, { x: 0.44, y: 0.84 }, { x: 0.54, y: 0.9 }]),
  ],
  lamp: () => [
    stroke([{ x: 0.36, y: 0.44 }, { x: 0.44, y: 0.24 }, { x: 0.56, y: 0.24 }, { x: 0.64, y: 0.44 }, { x: 0.36, y: 0.44 }]),
    line(0.5, 0.44, 0.5, 0.76),
    line(0.36, 0.78, 0.64, 0.78),
  ],
  leaf: () => [
    stroke([{ x: 0.28, y: 0.74 }, { x: 0.3, y: 0.48 }, { x: 0.46, y: 0.28 }, { x: 0.7, y: 0.24 }]),
    stroke([{ x: 0.7, y: 0.24 }, { x: 0.66, y: 0.48 }, { x: 0.5, y: 0.66 }, { x: 0.28, y: 0.74 }]),
    line(0.28, 0.74, 0.66, 0.32),
    line(0.42, 0.6, 0.4, 0.44),
    line(0.55, 0.5, 0.52, 0.36),
  ],
  pencil: () => [
    stroke([{ x: 0.24, y: 0.7 }, { x: 0.62, y: 0.32 }, { x: 0.72, y: 0.42 }, { x: 0.34, y: 0.8 }, { x: 0.24, y: 0.7 }]),
    line(0.62, 0.32, 0.72, 0.42),
    stroke([{ x: 0.24, y: 0.7 }, { x: 0.2, y: 0.84 }, { x: 0.34, y: 0.8 }]),
  ],
  ring: () => [
    circle(0.5, 0.6, 0.18),
    stroke([{ x: 0.44, y: 0.38 }, { x: 0.5, y: 0.26 }, { x: 0.56, y: 0.38 }, { x: 0.5, y: 0.44 }, { x: 0.44, y: 0.38 }]),
  ],
  spoon: () => [
    oval(0.5, 0.32, 0.09, 0.12),
    stroke([{ x: 0.46, y: 0.43 }, { x: 0.46, y: 0.82 }]),
    stroke([{ x: 0.54, y: 0.43 }, { x: 0.54, y: 0.82 }]),
    line(0.46, 0.82, 0.54, 0.82),
  ],
  tent: () => [
    stroke([{ x: 0.2, y: 0.74 }, { x: 0.5, y: 0.24 }, { x: 0.8, y: 0.74 }, { x: 0.2, y: 0.74 }]),
    stroke([{ x: 0.5, y: 0.24 }, { x: 0.42, y: 0.74 }]),
    stroke([{ x: 0.5, y: 0.24 }, { x: 0.58, y: 0.74 }]),
  ],
  umbrella: () => [
    arc(0.5, 0.52, 0.28, Math.PI, Math.PI * 2),
    stroke([{ x: 0.22, y: 0.52 }, { x: 0.36, y: 0.6 }, { x: 0.5, y: 0.52 }, { x: 0.64, y: 0.6 }, { x: 0.78, y: 0.52 }]),
    line(0.5, 0.52, 0.5, 0.78),
    arc(0.43, 0.78, 0.07, 0, Math.PI),
  ],
  crown: () => [
    stroke([
      { x: 0.26, y: 0.66 }, { x: 0.26, y: 0.34 }, { x: 0.38, y: 0.5 }, { x: 0.5, y: 0.3 },
      { x: 0.62, y: 0.5 }, { x: 0.74, y: 0.34 }, { x: 0.74, y: 0.66 }, { x: 0.26, y: 0.66 },
    ]),
    line(0.26, 0.58, 0.74, 0.58),
  ],
  anchor: () => [
    circle(0.5, 0.26, 0.06),
    line(0.5, 0.32, 0.5, 0.76),
    line(0.34, 0.42, 0.66, 0.42),
    arc(0.5, 0.56, 0.22, Math.PI * 0.15, Math.PI * 0.85),
  ],
};

export const DOODLE_WORDS = Object.keys(DOODLES);

// What the AI actually draws: the stored shape, redrawn by a shaky hand.
export function doodleFor(word: string, rng?: Rng): DrawOp[][] {
  const strokes = DOODLES[word]?.();
  return strokes ? humanize(strokes, rng) : [];
}
