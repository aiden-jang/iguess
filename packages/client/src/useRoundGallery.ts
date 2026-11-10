import { useEffect, useState } from "react";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@iguess/shared/strokePath";
import type { useGameSocket } from "./useWebSocket";
import { isAI } from "./roomView";
import { thumbnailOf } from "./canvasExport";
import { newStrokeStates, paintOp } from "./paint";
import type { GalleryShot } from "./EndScreen";

type Socket = ReturnType<typeof useGameSocket>;
const empty = { gallery: [], blankRounds: 0 };

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

  const [results, setResults] = useState<{
    source: typeof resultTurns;
    gallery: GalleryShot[];
    blankRounds: number;
  }>();
  useEffect(() => {
    if (galleryStatus === "loading") return;
    const turns = Object.values(resultTurns);
    const gallery: GalleryShot[] = [];
    let blankRounds = 0;
    const canvas = document.createElement("canvas");
    canvas.width = BOARD_WIDTH;
    canvas.height = BOARD_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let index = 0;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout>;
    const renderNext = () => {
      const turn = turns[index++];
      if (!ctx || !turn) {
        setResults({ source: resultTurns, gallery, blankRounds });
        return;
      }
      const states = newStrokeStates();
      paintOp(ctx, { kind: "reset" }, states, BOARD_WIDTH, BOARD_HEIGHT);
      for (const op of turn.ops)
        paintOp(ctx, op, states, BOARD_WIDTH, BOARD_HEIGHT);
      const png = thumbnailOf(canvas);
      if (png)
        gallery.push({ ...turn, png, aspectRatio: BOARD_WIDTH / BOARD_HEIGHT });
      else blankRounds++;
      // Yield to input and painting between drawings.
      frame = requestAnimationFrame(() => {
        timer = setTimeout(renderNext, 0);
      });
    };
    renderNext();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [galleryStatus, resultTurns]);

  const ready = results?.source === resultTurns;
  return { ...(ready ? results : empty), ready, botGuess };
}
