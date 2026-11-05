import type { DrawOp, GameModeName, RoomSettings } from "@iguess/shared";
import type { EngineSnapshot } from "./engineState.ts";
import type { RosterSnapshot } from "./roomRoster.ts";
import type { RelaySnapshot } from "./relayAssignments.ts";
import type { SessionRecord } from "./reconnectSessions.ts";
export interface RoomSnapshot {
  version: 1;
  roomId: string;
  mode: GameModeName;
  settings: RoomSettings;
  roster: RosterSnapshot;
  sessions: SessionRecord[];
  strokes: DrawOp[];
  engine: EngineSnapshot | null;
  relay?: RelaySnapshot;
  aiCallCount: number;
  saidAiIsBlind: boolean;
  reportedEnd: boolean;
  recentWords: string[];
}
