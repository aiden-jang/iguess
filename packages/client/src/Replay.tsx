import { useEffect, useRef } from "react";
import type { DrawOp } from "@iguess/shared";
import { paintOp, newStrokeStates } from "./paint";

const STEP_MS = 22;
const OPS_PER_STEP = 2;

export function Replay({
  ops,
  size = 260,
  aspectRatio = 1,
}: {
  ops: DrawOp[];
  size?: number;
  aspectRatio?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio =
      Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
    const width = ratio < 1 ? size * ratio : size;
    const height = ratio > 1 ? size / ratio : size;
    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      ((size - width) * dpr) / 2,
      ((size - height) * dpr) / 2,
    );

    let i = 0;
    let states = newStrokeStates();
    const tick = () => {
      if (i >= ops.length) {
        // Loop, so a card left on screen keeps redrawing itself.
        i = 0;
        states = newStrokeStates();
        paintOp(ctx, { kind: "reset" }, states, width, height);
        return;
      }
      for (let n = 0; n < OPS_PER_STEP && i < ops.length; n++, i++) {
        paintOp(ctx, ops[i]!, states, width, height);
      }
    };
    paintOp(ctx, { kind: "reset" }, states, width, height);
    const id = setInterval(tick, STEP_MS);
    return () => clearInterval(id);
  }, [ops, size, aspectRatio]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Animated replay of the drawing"
      style={{
        width: "100%",
        aspectRatio: "1",
        height: "auto",
        background: "#fff",
        borderRadius: 10,
        display: "block",
      }}
    />
  );
}
