import type { DrawOp, Point } from "@iguess/shared";
import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { doodleFor } from "../doodles.ts";

// Every doodle is stretched or squeezed to take about this long, so a one-stroke heart and a
// nine-stroke cat give guessers the same amount of time to watch.
const TARGET_MS = 13_000;
const MIN_TICK_MS = 45;
const MAX_TICK_MS = 200;
const PAUSE_TICKS = 4; // beat between strokes, where a person lifts the pen

export interface DrawLoopOpts {
  requestDrawing?: (word: string) => Promise<DrawOp[][]>;
  tickMs?: number;
}

// One tick's worth of ops. Empty = the pen is lifted between strokes.
type Step = DrawOp[];

// Whole strokes appearing at once read as a file being replayed. Dripping points out at a
// hand's pace, with a beat between strokes, reads as someone drawing.
function toSteps(strokes: DrawOp[][]): Step[] {
  const steps: Step[] = [];
  for (const ops of strokes) {
    const start = ops.find((o) => o.kind === "start");
    if (!start || start.kind !== "start") continue;
    const rest: Point[] = ops.flatMap((o) => (o.kind === "move" ? o.points : []));
    // Per stroke, not per tick: a confident line and a careful one in the same drawing.
    const perTick = 2 + Math.floor(Math.random() * 3);
    steps.push([start]);
    for (let i = 0; i < rest.length; i += perTick) {
      steps.push([
        { kind: "move", strokeId: start.strokeId, points: rest.slice(i, i + perTick) },
      ]);
    }
    steps.push([{ kind: "end", strokeId: start.strokeId }]);
    for (let i = 0; i < PAUSE_TICKS; i++) steps.push([]);
  }
  return steps;
}

// Reveal the AI's drawing progressively via ctx.draw. Returns a stop
// fn the caller MUST invoke on turn end.
export function startDrawLoop(
  turn: TurnContext,
  ctx: EngineContext,
  opts: DrawLoopOpts = {}
): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (interval) { clearInterval(interval); interval = null; }
  };

  const getDrawing = async (): Promise<DrawOp[][]> => {
    if (opts.requestDrawing) {
      try {
        const d = await opts.requestDrawing(turn.word);
        if (d?.length) return d;
      } catch {
        // fall through to the library
      }
    }
    return doodleFor(turn.word);
  };

  void (async () => {
    const steps = toSteps(await getDrawing());
    if (ctx.currentWord() !== turn.word) return; // turn outlived a slow generator
    let i = 0;
    const tick = () => {
      if (ctx.currentWord() !== turn.word || i >= steps.length) { stop(); return; }
      for (const op of steps[i]!) ctx.draw(op);
      i++;
    };
    tick();
    const paced = Math.round(TARGET_MS / Math.max(1, steps.length));
    const tickMs = opts.tickMs ?? Math.min(MAX_TICK_MS, Math.max(MIN_TICK_MS, paced));
    interval = setInterval(tick, tickMs);
  })();

  return stop;
}
