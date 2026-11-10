import type { DrawOp, GameModeName, RoomSettings } from "@iguess/shared";
import type { EngineSnapshot } from "./engineState.ts";
import type { RosterSnapshot } from "./roomRoster.ts";
import type { RelaySnapshot } from "./relayAssignments.ts";
import type { SessionRecord } from "./reconnectSessions.ts";
import type { GallerySnapshot } from "./roomGallery.ts";
export interface RoomSnapshot {
  version: 1;
  roomId: string;
  mode: GameModeName;
  settings: RoomSettings;
  roster: RosterSnapshot;
  sessions: SessionRecord[];
  strokes: DrawOp[];
  strokeOwners?: [string, string][];
  engine: EngineSnapshot | null;
  relay?: RelaySnapshot;
  gallery?: GallerySnapshot;
  aiCallCount: number;
  saidAiIsBlind: boolean;
  reportedEnd: boolean;
  recentWords: string[];
}
