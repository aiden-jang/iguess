import type { DrawOp, Point } from "@iguess/shared";

// Tolerance is generous because strokes are antialiased: an exact match would stop at the
// soft edge of a line and leave a halo of unfilled pixels around everything.
const FILL_TOLERANCE = 60;

/** Scanline flood fill from a normalized point. Operates on the backing store, not CSS pixels. */
function floodFill(ctx: CanvasRenderingContext2D, at: Point, hex: string): void {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return;
  const sx = Math.min(w - 1, Math.max(0, Math.round(at.x * w)));
  const sy = Math.min(h - 1, Math.max(0, Math.round(at.y * h)));

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const at4 = (x: number, y: number) => (y * w + x) * 4;
  const start = at4(sx, sy);
  const target = [px[start]!, px[start + 1]!, px[start + 2]!, px[start + 3]!];

  const fill = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ];
  const same = (a: number[], b: number[]) =>
    Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!) + Math.abs(a[3]! - b[3]!) <
    FILL_TOLERANCE;
  if (same(target, fill)) return; // already this colour: filling would spin over the whole region

  const matches = (i: number) => same([px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!], target);
  const paint = (i: number) => {
    px[i] = fill[0]!;
    px[i + 1] = fill[1]!;
    px[i + 2] = fill[2]!;
    px[i + 3] = 255;
  };

  // Scanline rather than per-pixel recursion: a full-canvas fill is ~2M pixels, and a
  // four-way stack blows both the call stack and the frame budget.
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x0, y] = stack.pop()!;
    let x = x0;
    while (x > 0 && matches(at4(x - 1, y))) x--;
    let spanAbove = false;
    let spanBelow = false;
    for (; x < w && matches(at4(x, y)); x++) {
      paint(at4(x, y));
      const above = y > 0 && matches(at4(x, y - 1));
      if (above && !spanAbove) stack.push([x, y - 1]);
      spanAbove = above;
      const below = y < h - 1 && matches(at4(x, y + 1));
      if (below && !spanBelow) stack.push([x, y + 1]);
      spanBelow = below;
    }
  }
  // putImageData ignores the DPR transform, so write at device pixels and let the existing
  // transform keep applying to everything drawn afterwards.
  ctx.putImageData(img, 0, 0);
}

interface StrokeState {
  last: Point;
  erase: boolean;
  // Midpoint the last drawn curve ended on. The smoothing anchors here, not on `last`.
  mid: Point;
  color: string;
  width: number;
}

/** Per-stroke state the incremental renderer carries between ops. */
export interface StrokeStates {
  map: Map<string, StrokeState>;
}

export function newStrokeStates(): StrokeStates {
  return { map: new Map() };
}

/**
 * Paint one op. Pure rendering, no recording, so it is shared by the live board, remote
 * replay, a resize re-render, and the end-of-game replay of a finished round.
 */
export function paintOp(
  ctx: CanvasRenderingContext2D,
  op: DrawOp | { kind: "reset" },
  s: StrokeStates,
  W: number,
  H: number
): void {
  const strokes = s.map;
    switch (op.kind) {
      case "reset":
      case "clear":
        ctx.clearRect(0, 0, W, H);
        strokes.clear();
        break;
      case "start":
        strokes.set(op.strokeId, {
          last: op.point,
          mid: op.point,
          color: op.color,
          width: op.width,
          erase: op.erase === true,
        });
        break;
      case "move": {
        const s = strokes.get(op.strokeId);
        if (!s) return;
        // destination-out cuts ink back out to transparency. Painting white would leave white
        // pixels that the fill tool reads as a distinct region.
        ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Curve through the midpoints instead of joining raw samples: a fast stroke samples
        // sparsely, and straight segments between those samples look visibly polygonal.
        // Each chunk redraws from the last midpoint, so the half-segment overlap is repainted
        // in the same colour and never shows.
        let prev = s.last;
        let mid = s.mid;
        // lineWidth applies to a whole path, so a tapering stroke needs one path per segment.
        // Uniform strokes stay a single path.
        if (op.widths) {
          op.points.forEach((p, i) => {
            const next = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
            ctx.lineWidth = op.widths![i] ?? s.width;
            ctx.beginPath();
            ctx.moveTo(mid.x * W, mid.y * H);
            ctx.quadraticCurveTo(prev.x * W, prev.y * H, next.x * W, next.y * H);
            ctx.lineTo(p.x * W, p.y * H);
            ctx.stroke();
            mid = next;
            prev = p;
          });
        } else {
          ctx.beginPath();
          ctx.moveTo(s.mid.x * W, s.mid.y * H);
          for (const p of op.points) {
            mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
            ctx.quadraticCurveTo(prev.x * W, prev.y * H, mid.x * W, mid.y * H);
            prev = p;
          }
          // The final sample has no successor yet, so run to it straight; the next chunk
          // replaces this tip with the real curve.
          ctx.lineTo(prev.x * W, prev.y * H);
          ctx.stroke();
        }
        s.last = prev;
        s.mid = mid;
        break;
      }
      case "fill": {
        floodFill(ctx, op.point, op.color);
        break;
      }
      case "end":
        strokes.delete(op.strokeId);
        ctx.globalCompositeOperation = "source-over";
        break;
      case "undo":
        // Handled in applyOp by rebuilding the log; nothing to paint directly.
        break;
    }
}
