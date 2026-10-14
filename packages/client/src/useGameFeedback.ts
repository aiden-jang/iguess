import { useEffect, useRef, useState } from "react";
import { blip, buzz } from "./feedback";
import { bumpStreak, didWin } from "./playerStats";
import type { PlayerInfo } from "@iguess/shared";
import type { useGameSocket } from "./useWebSocket";
const WIN_LINES = [
  "First place. Act natural.",
  "An extremely official victory.",
  "A small, highly specific victory.",
  "Frame it. Or don’t.",
];
const LOSS_LINES = [
  "A strong concept. Execution pending.",
  "An excellent time to blame the pen.",
  "The next one is definitely the one.",
  "We can pretend that was practice.",
];
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

type Props = {
  canDraw: boolean;
  game: ReturnType<typeof useGameSocket>["game"];
  phase: string;
  ranked: PlayerInfo[];
  you: ReturnType<typeof useGameSocket>["you"];
  muted: boolean;
  showToast: (message: string, duration?: number) => void;
};
export function useGameFeedback({
  canDraw,
  game,
  phase,
  ranked,
  you,
  muted,
  showToast,
}: Props) {
  const [burstKey, setBurstKey] = useState(0);
  const [winConfetti, setWinConfetti] = useState(0);
  const prevGuessed = useRef<string[]>([]);
  useEffect(() => {
    document.title =
      canDraw && phase === "playing"
        ? "Your turn · iguess"
        : phase === "playing" || phase === "intermission"
          ? "Playing · iguess"
          : "iguess · Drawing game";
    return () => {
      document.title = "iguess · Drawing game";
    };
  }, [canDraw, phase]);
  useEffect(() => {
    if (canDraw && game?.phase === "playing") {
      showToast("Your turn. Make it vaguely recognizable.");
      blip([523, 784], muted);
      buzz([18, 60, 18]);
    }
  }, [canDraw, game?.phase]);

  useEffect(() => {
    const cur = game?.guessedIds ?? [];
    const prev = prevGuessed.current;
    const fresh = cur.filter((id) => !prev.includes(id));
    prevGuessed.current = cur;
    if (fresh.length === 0) return;
    if (you && fresh.includes(you.id)) {
      setBurstKey((k) => k + 1);
      blip([659, 880, 1175], muted);
      buzz([12, 40, 12, 40, 30]);
      showToast("Correct. Suspiciously good.", 2400);
    } else {
      blip([880], muted);
      buzz(12);
    }
  }, [game?.guessedIds]);

  useEffect(() => {
    if (phase !== "ended") {
      setWinConfetti(0);
      return;
    }
    const won = didWin(ranked, game?.scores ?? {}, you?.id ?? null);
    const streak = bumpStreak(won);
    if (won) {
      setWinConfetti(Math.min(12 + streak * 2, 24));
      blip([523, 659, 784, 1047], muted);
      buzz([25, 50, 25, 50, 90]);
      showToast(
        streak > 1 ? `${streak} wins in a row. Very casual.` : pick(WIN_LINES),
        2000,
      );
    } else {
      setWinConfetti(0);
      blip([330, 247], muted);
      buzz(140);
      showToast(pick(LOSS_LINES), 2000);
    }
  }, [phase]);

  return { burstKey, winConfetti };
}
