import { useEffect, useRef } from "react";
import type { DrawOp, Point } from "@iguess/shared";
import { dropStroke } from "@iguess/shared/strokeLog";
import { paintOp, newStrokeStates } from "./paint";

interface Props {
  sendDraw: (op: DrawOp) => void;
  subscribeDraw: (fn: (op: DrawOp | { kind: "reset" }) => void) => () => void;
  color: string;
  width: number;
  erasing: boolean;
  filling: boolean;
  onCursor?: (p: Point | null) => void;
  peerCursor?: Point | null;
  opsRef?: React.MutableRefObject<DrawOp[]>;
  socketBacklog?: () => number;
  canDraw: boolean;
  onCanvas?: (el: HTMLCanvasElement | null) => void;
}

export function DrawingCanvas({
  sendDraw,
  subscribeDraw,
  color,
  width,
  erasing,
  filling,
  onCursor,
  peerCursor,
  opsRef,
  socketBacklog,
  canDraw,
  onCanvas,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokes = useRef(newStrokeStates());
  const dims = useRef({ w: 0, h: 0 });
  // Resizing a canvas wipes it, so keep every stroke and paint them all again afterwards.
  const opLog = useRef<DrawOp[]>([]);

  const brush = useRef({ color, width, erasing, filling });
  brush.current = { color, width, erasing, filling };

  function render(op: DrawOp | { kind: "reset" }) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    paintOp(ctx, op, strokes.current, dims.current.w, dims.current.h);
  }

  function applyOp(op: DrawOp | { kind: "reset" }) {
    if (op.kind === "reset" || op.kind === "clear") {
      opLog.current = [];
    } else if (op.kind === "undo") {
      if (!op.strokeId) return;
      opLog.current = dropStroke(opLog.current, op.strokeId);
      render({ kind: "reset" });
      for (const o of opLog.current) render(o);
      if (opsRef) opsRef.current = opLog.current;
      return;
    } else {
      opLog.current.push(op);
    }
    if (opsRef) opsRef.current = opLog.current;
    render(op);
  }

  // Match the canvas to the screen's pixel density so it looks sharp, then repaint everything,
  // because changing a canvas's size erases it.
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

  const drawing = useRef(false);
  const strokeId = useRef<string | null>(null);
  const buffer = useRef<Point[]>([]);
  const widthBuffer = useRef<number[]>([]);
  const lastSample = useRef<Point | null>(null);
  const rafPending = useRef(false);

  // Round hard. Full precision is about 18 characters per number, sent constantly to everyone
  // in the room, and a thousandth of a canvas is smaller than one pixel anyway.
  function toNorm(e: React.PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000,
      y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000,
    };
  }

  // A stylus reports real pressure. A mouse always says 0.5 and a finger usually says 0, so
  // those fall back to speed: move fast, get a thinner line, like a real pen.
  function widthAt(e: React.PointerEvent, p: Point): number {
    const base = brush.current.width;
    const usable =
      e.pointerType === "pen" && e.pressure > 0 && e.pressure !== 0.5;
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

  // A stroke message a frame is fine on wifi and far too many on a bad link. When the socket
  // is already backed up, hold the points and send one larger message later — the drawing is
  // identical either way, and the alternative is a queue that never drains.
  const BACKLOG_BYTES = 24_000;
  const MAX_HELD_POINTS = 240;

  function flush() {
    rafPending.current = false;
    if (!strokeId.current || buffer.current.length === 0) return;
    if (
      socketBacklog &&
      socketBacklog() > BACKLOG_BYTES &&
      buffer.current.length < MAX_HELD_POINTS
    ) {
      rafPending.current = true;
      requestAnimationFrame(flush);
      return;
    }
    const points = buffer.current;
    const widths = widthBuffer.current;
    buffer.current = [];
    widthBuffer.current = [];
    const varies = widths.some((w) => w !== widths[0]);
    const op: DrawOp = varies
      ? { kind: "move", strokeId: strokeId.current, points, widths }
      : { kind: "move", strokeId: strokeId.current, points };
    applyOp(op);
    sendDraw(op);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canDraw) return;
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
    if (canDraw) onCursor?.(toNorm(e));
    if (!drawing.current) return;
    const p = toNorm(e);
    buffer.current.push(p);
    widthBuffer.current.push(widthAt(e, p));
    if (!rafPending.current) {
      rafPending.current = true;
      requestAnimationFrame(flush);
    }
  }

  function onPointerLeave() {
    if (canDraw) onCursor?.(null);
    onPointerUp();
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
    <>
      {peerCursor && !canDraw && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `${peerCursor.x * 100}%`,
            top: `${peerCursor.y * 100}%`,
            width: 10,
            height: 10,
            marginLeft: -5,
            marginTop: -5,
            borderRadius: "50%",
            border: "2px solid var(--accent)",
            background: "var(--accent-2)",
            pointerEvents: "none",
            transition: "left .07s linear, top .07s linear",
            zIndex: 2,
          }}
        />
      )}
      <canvas
        role="img"
        aria-label={
          canDraw
            ? "Drawing canvas. Use the drawing tools to sketch."
            : "Live drawing to guess"
        }
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        tabIndex={canDraw ? 0 : -1}
        style={{
          width: "100%",
          height: "100%",
          border: "1px solid #d6d1c2",
          borderRadius: 12,
          // Only capture touch while it's your turn to draw; otherwise let a guesser scroll the page
          // past the canvas instead of trapping their finger on a dead surface.
          touchAction: canDraw ? "none" : "auto",
          cursor: canDraw ? brushCursor : "not-allowed",
          background: "white",
        }}
      />
    </>
  );
}
