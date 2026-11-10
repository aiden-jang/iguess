import { useCanvasPointer } from "./useCanvasPointer";
import { useEffect, useRef, type CSSProperties } from "react";
import type { DrawOp, Point } from "@iguess/shared";
import { dropStroke } from "@iguess/shared/strokeLog";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@iguess/shared/strokePath";
import { hasVisibleInk } from "./canvasExport";
import { brushCursor } from "./brushStyle";
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
  boardWidth?: number;
  optimistic?: boolean;
  onInkChange?: (hasInk: boolean) => void;
  socketBacklog?: () => number;
  label?: string;
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
  boardWidth = BOARD_WIDTH,
  optimistic = true,
  onInkChange,
  socketBacklog,
  label,
  canDraw,
  onCanvas,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokes = useRef(newStrokeStates());
  const inkFrame = useRef(0);
  const inkListener = useRef(onInkChange);
  inkListener.current = onInkChange;
  const opLog = useRef<DrawOp[]>([]);

  function render(op: DrawOp | { kind: "reset" }) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    paintOp(ctx, op, strokes.current, boardWidth, BOARD_HEIGHT);
  }

  function applyOp(op: DrawOp | { kind: "reset" }) {
    if (op.kind === "reset" || op.kind === "clear") {
      opLog.current = [];
    } else if (op.kind === "undo") {
      if (!op.strokeId) return;
      opLog.current = dropStroke(opLog.current, op.strokeId);
      render({ kind: "reset" });
      for (const o of opLog.current) render(o);
    } else {
      opLog.current.push(op);
    }
    if (op.kind !== "undo") render(op);
    if (
      inkListener.current &&
      !inkFrame.current &&
      op.kind !== "start" &&
      op.kind !== "move"
    )
      inkFrame.current = requestAnimationFrame(() => {
        inkFrame.current = 0;
        if (ctxRef.current)
          inkListener.current?.(
            hasVisibleInk(ctxRef.current, boardWidth, BOARD_HEIGHT),
          );
      });
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    ctxRef.current = canvas.getContext("2d", { willReadFrequently: true });
    onCanvas?.(canvas);
    const unsub = subscribeDraw(applyOp);
    return () => {
      unsub();
      cancelAnimationFrame(inkFrame.current);
      inkFrame.current = 0;
      onCanvas?.(null);
    };
  }, [subscribeDraw, boardWidth]);

  const pointer = useCanvasPointer({
    canvas: canvasRef,
    canDraw,
    brush: { color, width, erasing, filling },
    apply: optimistic ? applyOp : () => {},
    send: sendDraw,
    cursor: onCursor,
    backlog: socketBacklog,
  });

  return (
    <div
      className="drawing-surface"
      style={{ "--board-ratio": boardWidth / BOARD_HEIGHT } as CSSProperties}
    >
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
          label ??
          (canDraw
            ? "Drawing canvas. Use the drawing tools to sketch."
            : "Live drawing to guess")
        }
        ref={canvasRef}
        width={boardWidth}
        height={BOARD_HEIGHT}
        {...pointer}
        tabIndex={canDraw ? 0 : -1}
        style={{
          width: "100%",
          height: "100%",
          border: "1px solid #d6d1c2",
          borderRadius: 12,
          touchAction: canDraw ? "none" : "auto",
          cursor: canDraw ? brushCursor(width, color, erasing) : "default",
          background: "white",
        }}
      />
    </div>
  );
}
