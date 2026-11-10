import type { PlayerInfo } from "./events.ts";

export type GamePhase =
  "lobby" | "choosing" | "playing" | "intermission" | "ended";

export interface TeamScore {
  human: number;
  ai: number;
}

// Safe to send to everyone. The secret word goes to the drawer alone in `your_word`.
export interface PublicGameState {
  phase: GamePhase;
  drawerId: string | null;
  turnIndex: number;
  totalTurns: number;
  round: number;
  totalRounds: number;
  turnEndsAt: number | null;
  serverNow?: number;
  wordLength: number;
  hint: string;
  scores: Record<string, number>;
  guessedIds: string[];
  resultPlayers?: PlayerInfo[];
  teamScore?: TeamScore;
}
