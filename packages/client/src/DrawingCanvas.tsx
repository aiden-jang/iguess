import { useCanvasPointer } from "./useCanvasPointer";
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

  const pointer = useCanvasPointer({
    canvas: canvasRef,
    canDraw,
    brush: { color, width, erasing, filling },
    apply: applyOp,
    send: sendDraw,
    cursor: onCursor,
    backlog: socketBacklog,
  });

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
        {...pointer}
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
