import { useEffect, useRef } from "react";
import type { DrawOp } from "@iguess/shared";
import { paintOp, newStrokeStates } from "./paint";

// Replaying the round is nearly free: the ops are already on the client for the resize
// re-render, and watching a drawing appear is the most shareable moment the game produces.
const STEP_MS = 22;
const OPS_PER_STEP = 2;

export function Replay({ ops, size = 260 }: { ops: DrawOp[]; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let i = 0;
    let states = newStrokeStates();
    const tick = () => {
      if (i >= ops.length) {
        // Loop, so a card left on screen keeps drawing itself.
        i = 0;
        states = newStrokeStates();
        paintOp(ctx, { kind: "reset" }, states, size, size);
        return;
      }
      for (let n = 0; n < OPS_PER_STEP && i < ops.length; n++, i++) {
        paintOp(ctx, ops[i]!, states, size, size);
      }
    };
    paintOp(ctx, { kind: "reset" }, states, size, size);
    const id = setInterval(tick, STEP_MS);
    return () => clearInterval(id);
  }, [ops, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, background: "#fff", borderRadius: 10, display: "block" }}
    />
  );
}
