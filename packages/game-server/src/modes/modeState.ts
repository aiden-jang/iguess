import type { DrawOp } from "@iguess/shared";
export interface DrawProgress {
  steps?: DrawOp[][];
  index: number;
  tickMs?: number;
}
export interface GuessProgress {
  attempts: number;
  notifiedDown: boolean;
  seenOps: number;
}
export interface ModeSnapshot {
  drawOrder: string[];
  usedWords: string[];
  bets: [string, string][];
  humans?: string[];
  aiDrawsThisTurn?: boolean;
  usedDoodles?: string[];
  roundDecided?: boolean;
  wins?: { human: number; ai: number };
  drawProgress?: DrawProgress;
  guessProgress?: GuessProgress;
}
