import type { GamePhase, RoomSettings } from "@iguess/shared";
import type { PlayerRef } from "./modes/GameMode.ts";
import type { ModeSnapshot } from "./modes/modeState.ts";
export interface EngineSnapshot {
  phase: GamePhase;
  turnIndex: number;
  totalTurns: number;
  turnsPerRound: number;
  turnMs: number;
  settings: RoomSettings;
  drawerId: string | null;
  word: string | null;
  guessed: string[];
  scores: Record<string, number>;
  roster: PlayerRef[];
  revealed: number[];
  pendingChoices: string[] | null;
  skipsUsed: string[];
  deadlines: Record<string, number>;
  savedAt: number;
  mode: ModeSnapshot;
}
