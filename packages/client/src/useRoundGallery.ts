import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { DrawOp } from "@iguess/shared";
import type { useGameSocket } from "./useWebSocket";
import { isAI } from "./roomView";
import { thumbnailOf } from "./canvasExport";
import type { GalleryShot } from "./EndScreen";

type Socket = ReturnType<typeof useGameSocket>;
type Props = Pick<Socket, "turnEnd" | "game" | "log"> & {
  phase: string;
  aiGuessedRight: boolean;
  hasAI: boolean;
  canvasElRef: MutableRefObject<HTMLCanvasElement | null>;
  roundOps: MutableRefObject<DrawOp[]>;
};
export function useRoundGallery({
  turnEnd,
  game,
  phase,
  log,
  aiGuessedRight,
  hasAI,
  canvasElRef,
  roundOps,
}: Props) {
  const [botGuess, setBotGuess] = useState<string | null>(null);
  const [blankRounds, setBlankRounds] = useState(0);
  const [gallery, setGallery] = useState<GalleryShot[]>([]);
  // `botGuess` clears itself after a few seconds, so by the end of a turn it is usually empty.
  // Keep the last actual guess; post-round commentary is not a verdict on the drawing.
  const lastGuess = useRef<{ guess: string | null; right: boolean }>({
    guess: null,
    right: false,
  });
  const latestAi = log
    .filter((line) => isAI(line.from?.id) && line.isGuess)
    .at(-1);
  useEffect(() => {
    const latest = latestAi?.text ?? null;
    setBotGuess(latest);
    if (latest) lastGuess.current = { guess: latest, right: aiGuessedRight };
    else if (aiGuessedRight)
      lastGuess.current = { ...lastGuess.current, right: true };
    const timer = setTimeout(() => setBotGuess(null), 4200);
    return () => clearTimeout(timer);
  }, [latestAi]);
  useEffect(() => {
    if (aiGuessedRight)
      lastGuess.current = { ...lastGuess.current, right: true };
  }, [aiGuessedRight]);
  // Grab the picture now, before the next turn wipes the board.
  useEffect(() => {
    if (!turnEnd) return;
    const el = canvasElRef.current;
    if (!el) return;
    const png = thumbnailOf(el);
    if (!png) {
      setBlankRounds((value) => value + 1);
      lastGuess.current = { guess: null, right: false };
      return;
    }
    const { guess, right } = lastGuess.current;
    // Keep the strokes as well as the picture: one is for sharing, one is for the replay.
    setGallery((g) => [
      ...g,
      {
        word: turnEnd.word,
        png,
        guess,
        right,
        aiParticipated: hasAI && !isAI(game?.drawerId),
        drawerId: game?.drawerId ?? null,
        ops: roundOps.current.slice(),
        aspectRatio: el.width / el.height,
      },
    ]);
    lastGuess.current = { guess: null, right: false };
  }, [turnEnd?.at]);

  // A turn-end snapshot still carries the old turn index; reset only on a new game.
  const wasLive = useRef(false);
  useEffect(() => {
    const live = phase === "choosing" || phase === "playing";
    if (live && !wasLive.current) {
      setGallery([]);
      setBlankRounds(0);
    }
    wasLive.current = live || phase === "intermission";
  }, [phase]);

  return { gallery, botGuess, blankRounds };
}
