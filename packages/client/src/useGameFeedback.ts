import { useEffect, useRef, useState } from "react";
import { blip, buzz } from "./feedback";
import { GameParticipation } from "./gameParticipation";
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
  const prevGuessed = useRef<string[] | null>(null);
  const participation = useRef(new GameParticipation());
  const priorScores = useRef<Record<string, number>>({});
  const lastLine = useRef("");
  const aside = (lines: string[]) => {
    const line = pick(lines.filter((value) => value !== lastLine.current));
    lastLine.current = line;
    return line;
  };
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
      showToast(
        aside([
          "Your turn. Make it vaguely recognizable.",
          "Your turn. A line is a start.",
          "Your turn. Artistic credentials unchecked.",
        ]),
      );
      blip([523, 784], muted);
      buzz([18, 60, 18]);
    }
  }, [canDraw, game?.phase]);

  useEffect(() => {
    if (!game) return;
    const cur = game.guessedIds;
    const prev = prevGuessed.current;
    const fresh = prev ? cur.filter((id) => !prev.includes(id)) : [];
    const previousScore = you ? (priorScores.current[you.id] ?? 0) : 0;
    priorScores.current = game?.scores ?? {};
    prevGuessed.current = cur;
    if (fresh.length === 0) return;
    if (you && fresh.includes(you.id)) {
      setBurstKey((k) => k + 1);
      blip([659, 880, 1175], muted);
      buzz([12, 40, 12, 40, 30]);
      const gain = you ? (game?.scores[you.id] ?? 0) - previousScore : 0;
      showToast(
        `Correct.${gain > 0 ? ` +${gain} points.` : ""} Suspiciously good.`,
        2400,
      );
    } else {
      blip([880], muted);
      buzz(12);
    }
  }, [game?.guessedIds]);

  useEffect(() => {
    const isParticipant =
      !!you &&
      ranked.some((player) => player.id === you.id && !player.spectator);
    const countGame = participation.current.observe(phase, isParticipant);
    if (phase !== "ended") setWinConfetti(0);
    if (!countGame) return;
    const scores = ranked
      .map((player) => game?.scores[player.id] ?? 0)
      .sort((a, b) => b - a);
    const close =
      scores.length > 1 &&
      scores[0]! > scores[1]! &&
      scores[0]! - scores[1]! <= 50;
    const won = didWin(ranked, game?.scores ?? {}, you?.id ?? null);
    const streak = bumpStreak(won);
    if (won) {
      setWinConfetti(Math.min(12 + streak * 2, 24));
      blip([523, 659, 784, 1047], muted);
      buzz([25, 50, 25, 50, 90]);
      showToast(
        close
          ? "A close finish. Nobody was worried, obviously."
          : streak > 1
            ? `${streak} wins in a row. Very casual.`
            : aside(WIN_LINES),
        2000,
      );
    } else {
      setWinConfetti(0);
      blip([330, 247], muted);
      buzz(140);
      showToast(
        close ? "A close finish. Emotionally, a draw." : aside(LOSS_LINES),
        2000,
      );
    }
  }, [phase]);

  return { burstKey, winConfetti };
}
