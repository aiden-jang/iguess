import type { TeamScore } from "@iguess/shared";

export function teamOutcome({ human, ai }: TeamScore): string {
  if (human === ai) return "It’s a tie.";
  return human > ai ? "Humans win." : "AI wins.";
}

export function teamScoreLine({ human, ai }: TeamScore): string {
  return `Humans ${human} · AI ${ai}`;
}
