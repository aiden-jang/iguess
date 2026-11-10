import { useEffect, useRef, useState } from "react";
import type { DrawOp } from "@iguess/shared";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@iguess/shared/strokePath";
import { paintOp, newStrokeStates } from "./paint";
import { Icon } from "./Icon";

export function Replay({
  ops,
  aspectRatio = BOARD_WIDTH / BOARD_HEIGHT,
}: {
  ops: DrawOp[];
  size?: number;
  aspectRatio?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const frame = useRef({ index: 0, states: newStrokeStates() });
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(ops.length > 1000 ? 4 : 1);
  const [error, setError] = useState(false);
  const width = Math.round(BOARD_HEIGHT * aspectRatio);

  function seek(index: number) {
    const ctx = canvasRef.current?.getContext("2d", {
      willReadFrequently: true,
    });
    if (!ctx) return false;
    const current = frame.current;
    if (index < current.index) {
      paintOp(ctx, { kind: "reset" }, current.states, width, BOARD_HEIGHT);
      current.index = 0;
    }
    while (current.index < index)
      paintOp(ctx, ops[current.index++]!, current.states, width, BOARD_HEIGHT);
    setProgress(index);
    return true;
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d", {
      willReadFrequently: true,
    });
    if (!ctx) {
      setError(true);
      return;
    }
    ctx.clearRect(0, 0, width, BOARD_HEIGHT);
    frame.current = { index: 0, states: newStrokeStates() };
    setProgress(0);
    setPlaying(ops.length > 0);
    pauseRef.current?.focus({ preventScroll: true });
  }, [ops, width]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = Math.min(ops.length, frame.current.index + 2 * speed);
      if (!seek(next) || next >= ops.length) setPlaying(false);
    }, 22);
    return () => clearInterval(timer);
  }, [playing, ops, speed, width]);

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
            width={width}
            height={BOARD_HEIGHT}
            role="img"
            aria-label="Animated replay of the drawing"
          />
          <div className="replay-controls">
            <button
              ref={pauseRef}
              type="button"
              onClick={() => {
                if (progress >= ops.length) {
                  seek(0);
                  setPlaying(true);
                } else setPlaying((value) => !value);
              }}
            >
              <Icon name={playing ? "pause" : "play"} />
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(1, ops.length)}
              value={progress}
              aria-label="Replay position"
              aria-valuetext={`${Math.round((progress / Math.max(1, ops.length)) * 100)}% complete`}
              onChange={(event) => {
                setPlaying(false);
                seek(Number(event.target.value));
              }}
            />
            <label>
              <span className="sr-only">Replay speed</span>
              <select
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                {[1, 2, 4, 8].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                seek(0);
                setPlaying(true);
              }}
              aria-label="Restart replay"
            >
              <Icon name="restart" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
