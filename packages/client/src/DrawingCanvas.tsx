import { useEffect, useRef } from "react";
import type { DrawOp, Point } from "@iguess/shared";
import { dropStroke } from "@iguess/shared/strokeLog";

interface Props {
  sendDraw: (op: DrawOp) => void;
  subscribeDraw: (fn: (op: DrawOp | { kind: "reset" }) => void) => () => void;
  color: string;
  width: number;
  erasing: boolean;
  filling: boolean;
  canDraw: boolean; // only the current drawer may paint
  // Hands the underlying <canvas> element up so the parent can snapshot it.
  onCanvas?: (el: HTMLCanvasElement | null) => void;
}

// Per-stroke render state, keyed by strokeId, so interleaved remote strokes
// each remember their own last point + style during replay.
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

export function DrawingCanvas({
  sendDraw,
  subscribeDraw,
  color,
  width,
  erasing,
  filling,
  canDraw,
  onCanvas,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokes = useRef<Map<string, StrokeState>>(new Map());
  // CSS-pixel size (the drawing context is transformed by devicePixelRatio, so all coordinate math
  // stays in logical pixels regardless of screen density).
  const dims = useRef({ w: 0, h: 0 });
  // Every op this round, so we can re-render after a resize (resizing a canvas clears its buffer).
  // Cleared on clear/reset. Bounded by a single round's drawing.
  const opLog = useRef<DrawOp[]>([]);

  // Latest brush settings, read at pointer-down time without re-subscribing.
  const brush = useRef({ color, width, erasing, filling });
  brush.current = { color, width, erasing, filling };

  // Paint one op. Pure rendering — no recording — so it's reused for live draws, remote replay,
  // and re-rendering the whole log after a resize.
  function render(op: DrawOp | { kind: "reset" }) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const W = dims.current.w;
    const H = dims.current.h;

    switch (op.kind) {
      case "reset":
      case "clear":
        ctx.clearRect(0, 0, W, H);
        strokes.current.clear();
        break;
      case "start":
        strokes.current.set(op.strokeId, {
          last: op.point,
          mid: op.point,
          color: op.color,
          width: op.width,
          erase: op.erase === true,
        });
        break;
      case "move": {
        const s = strokes.current.get(op.strokeId);
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
        strokes.current.delete(op.strokeId);
        ctx.globalCompositeOperation = "source-over";
        break;
      case "undo":
        // Handled in applyOp by rebuilding the log; nothing to paint directly.
        break;
    }
  }

  // Record then render, so the op-log can rebuild the canvas after a resize.
  function applyOp(op: DrawOp | { kind: "reset" }) {
    if (op.kind === "reset" || op.kind === "clear") {
      opLog.current = [];
    } else if (op.kind === "undo") {
      // The server names the stroke it dropped; drop the same one here and repaint from the
      // remaining log, rather than being shipped the whole canvas back.
      if (!op.strokeId) return;
      opLog.current = dropStroke(opLog.current, op.strokeId);
      render({ kind: "reset" });
      for (const o of opLog.current) render(o);
      return;
    } else {
      opLog.current.push(op);
    }
    render(op);
  }

  // Size the backing store to the displayed size × devicePixelRatio (crisp on retina/phones),
  // transform to logical pixels so coord math is unchanged, then re-render the round's op-log
  // (a canvas resize wipes its buffer). Runs on mount and on every layout/rotation change.
  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    dims.current = { w: rect.width, h: rect.height };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in logical pixels
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const op of opLog.current) render(op);
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    resizeCanvas();
    onCanvas?.(canvas);

    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(canvas);
    const unsub = subscribeDraw(applyOp);
    return () => {
      ro.disconnect();
      unsub();
      onCanvas?.(null);
    };
  }, [subscribeDraw]);

  // ----- Local drawing -----
  const drawing = useRef(false);
  const strokeId = useRef<string | null>(null);
  const buffer = useRef<Point[]>([]);
  const widthBuffer = useRef<number[]>([]);
  const lastSample = useRef<Point | null>(null);
  const rafPending = useRef(false);

  // Rounded to 3 decimals: full doubles serialize to ~18 characters each and stream at
  // pointer rate to every player in the room. 1/1000 of a canvas is well under one pixel.
  function toNorm(e: React.PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000,
      y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000,
    };
  }

  // Ink width for one sample. A stylus reports real pressure; a mouse always reports 0.5 and
  // touch usually reports 0, so those fall back to speed — fast strokes thin out, like a pen.
  function widthAt(e: React.PointerEvent, p: Point): number {
    const base = brush.current.width;
    const usable = e.pointerType === "pen" && e.pressure > 0 && e.pressure !== 0.5;
    let scale: number;
    if (usable) {
      scale = 0.45 + e.pressure * 1.1;
    } else {
      const prev = lastSample.current;
      const speed = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
      scale = 1.15 - Math.min(0.6, speed * 12);
    }
    lastSample.current = p;
    return Math.round(Math.max(1, base * scale) * 10) / 10;
  }

  // Coalesce buffered points into one "move" op per animation frame. This
  // caps message rate (~60/s) instead of firing on every pointermove event.
  function flush() {
    rafPending.current = false;
    if (!strokeId.current || buffer.current.length === 0) return;
    const points = buffer.current;
    const widths = widthBuffer.current;
    buffer.current = [];
    widthBuffer.current = [];
    // A stroke of one uniform width sends no widths at all.
    const varies = widths.some((w) => w !== widths[0]);
    const op: DrawOp = varies
      ? { kind: "move", strokeId: strokeId.current, points, widths }
      : { kind: "move", strokeId: strokeId.current, points };
    applyOp(op); // local immediate render
    sendDraw(op); // relay to others
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canDraw) return; // not your turn
    if (brush.current.filling) {
      const op: DrawOp = {
        kind: "fill",
        strokeId: Math.random().toString(36).slice(2, 10),
        color: brush.current.color,
        point: toNorm(e),
      };
      applyOp(op);
      sendDraw(op);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokeId.current = Math.random().toString(36).slice(2, 10);
    const point = toNorm(e);
    lastSample.current = point;
    const op: DrawOp = {
      kind: "start",
      strokeId: strokeId.current,
      color: brush.current.color,
      width: brush.current.width,
      erase: brush.current.erasing,
      point,
    };
    applyOp(op);
    sendDraw(op);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = toNorm(e);
    buffer.current.push(p);
    widthBuffer.current.push(widthAt(e, p));
    if (!rafPending.current) {
      rafPending.current = true;
      requestAnimationFrame(flush);
    }
  }

  function onPointerUp() {
    if (!drawing.current) return;
    flush(); // emit any trailing buffered points
    drawing.current = false;
    if (strokeId.current) {
      const op: DrawOp = { kind: "end", strokeId: strokeId.current };
      applyOp(op);
      sendDraw(op);
      strokeId.current = null;
    }
  }

  // A cursor that IS the brush: a circle the exact diameter of the stroke (lineWidth is in CSS px,
  // same units), tinted the brush color so you can see size + color before you draw. Hotspot centered.
  const d = Math.max(6, Math.min(width, 48));
  const s = d + 4;
  const half = s / 2;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'>` +
    `<circle cx='${half}' cy='${half}' r='${d / 2}' fill='${erasing ? "#ffffff" : color}' ` +
    `fill-opacity='${erasing ? 0.15 : 0.35}' ` +
    `stroke='black' stroke-opacity='0.55' stroke-width='1.5'/></svg>`;
  const brushCursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${half} ${half}, crosshair`;

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        width: "100%",
        height: "100%",
        border: "1px solid #ccc",
        borderRadius: 4,
        // Only capture touch while it's your turn to draw; otherwise let a guesser scroll the page
        // past the canvas instead of trapping their finger on a dead surface.
        touchAction: canDraw ? "none" : "auto",
        cursor: canDraw ? brushCursor : "not-allowed",
        background: "white",
      }}
    />
  );
}
