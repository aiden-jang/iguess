import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@iguess/shared/strokePath";
import type { useGameSocket } from "./useWebSocket";
import { isAI } from "./roomView";
import { thumbnailOf } from "./canvasExport";
import { newStrokeStates, paintOp } from "./paint";
import type { GalleryShot } from "./EndScreen";

type Socket = ReturnType<typeof useGameSocket>;
type Turn = Socket["resultTurns"][number];
const empty = new Map<Turn, GalleryShot | null>();

export function useRoundGallery({
  resultTurns,
  galleryStatus,
  log,
}: Pick<Socket, "resultTurns" | "galleryStatus" | "log">) {
  const [botGuess, setBotGuess] = useState<string | null>(null);
  const latestAi = log
    .filter((line) => isAI(line.from?.id) && line.isGuess)
    .at(-1);
  useEffect(() => {
    setBotGuess(latestAi?.text ?? null);
    const timer = setTimeout(() => setBotGuess(null), 4200);
    return () => clearTimeout(timer);
  }, [latestAi]);

  const turns = useMemo(() => Object.entries(resultTurns), [resultTurns]);
  const [rendered, setRendered] = useState(empty);
  const board = useRef<CanvasRenderingContext2D | null>(null);
  useEffect(() => {
    if (!turns.length) {
      if (rendered.size) setRendered(empty);
      return;
    }
    const next = turns.find(([, turn]) => !rendered.has(turn));
    if (!next) return;
    const [index, turn] = next;
    const frame = requestAnimationFrame(() => {
      if (!board.current) {
        const canvas = document.createElement("canvas");
        canvas.width = BOARD_WIDTH;
        canvas.height = BOARD_HEIGHT;
        board.current = canvas.getContext("2d", { willReadFrequently: true });
      }
      const ctx = board.current;
      let shot: GalleryShot | null = null;
      if (ctx) {
        const states = newStrokeStates();
        paintOp(ctx, { kind: "reset" }, states, BOARD_WIDTH, BOARD_HEIGHT);
        for (const op of turn.ops)
          paintOp(ctx, op, states, BOARD_WIDTH, BOARD_HEIGHT);
        const png = thumbnailOf(ctx.canvas);
        if (png)
          shot = {
            ...turn,
            index,
            png,
            aspectRatio: BOARD_WIDTH / BOARD_HEIGHT,
          };
      }
      setRendered((previous) => new Map(previous).set(turn, shot));
    });
    return () => cancelAnimationFrame(frame);
  }, [rendered, turns]);

  const results = useMemo(() => {
    const gallery: GalleryShot[] = [];
    let blankRounds = 0;
    for (const [, turn] of turns) {
      const shot = rendered.get(turn);
      if (shot) gallery.push(shot);
      else if (shot === null) blankRounds++;
    }
    return { gallery, blankRounds };
  }, [rendered, turns]);
  const ready =
    galleryStatus !== "loading" &&
    results.gallery.length + results.blankRounds === turns.length;
  return { ...results, ready, botGuess };
}
