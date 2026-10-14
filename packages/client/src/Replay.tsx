import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawOp } from "@iguess/shared";
import { paintOp, newStrokeStates } from "./paint";
import { Icon } from "./Icon";
export function Replay({
  ops,
  size = 260,
  aspectRatio = 1,
}: {
  ops: DrawOp[];
  size?: number;
  aspectRatio?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef<{
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    index: number;
    states: ReturnType<typeof newStrokeStates>;
  } | null>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const reset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError(true);
      return;
    }
    const ratio =
      Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
    const width = ratio < 1 ? size * ratio : size,
      height = ratio > 1 ? size / ratio : size;
    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      ((size - width) * dpr) / 2,
      ((size - height) * dpr) / 2,
    );
    const states = newStrokeStates();
    paintOp(ctx, { kind: "reset" }, states, width, height);
    frame.current = { ctx, width, height, index: 0, states };
    setProgress(0);
    setPlaying(ops.length > 0);
    setError(false);
  }, [ops, size, aspectRatio]);
  useEffect(reset, [reset]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = frame.current;
      if (!current) return;
      for (
        let count = 0;
        count < 2 && current.index < ops.length;
        count++, current.index++
      )
        paintOp(
          current.ctx,
          ops[current.index]!,
          current.states,
          current.width,
          current.height,
        );
      setProgress(current.index);
      if (current.index >= ops.length) setPlaying(false);
    }, 22);
    return () => clearInterval(timer);
  }, [playing, ops]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  return (
    <div className="drawing-replay">
      {error ? (
        <p role="alert">Replay is unavailable. Return to the still image.</p>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Animated replay of the drawing"
          />
          <div className="replay-controls">
            <button
              type="button"
              onClick={() => {
                if (progress >= ops.length) reset();
                else setPlaying((value) => !value);
              }}
            >
              <Icon name={playing ? "pause" : "play"} />
              {playing ? "Pause" : "Play"}
            </button>
            <progress
              max={Math.max(1, ops.length)}
              value={progress}
              aria-label="Replay progress"
            />
            <button type="button" onClick={reset} aria-label="Restart replay">
              <Icon name="restart" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
