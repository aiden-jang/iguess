import {
  SETTINGS_LIMITS,
  TEAM_TURN_POINTS,
  type RoomSettings,
  type GameModeName,
} from "@iguess/shared";
import type { GameMode } from "./modes/GameMode.ts";
import type { AIGuess } from "./services/aiWorkerClient.ts";
import { ClassicMode } from "./modes/ClassicMode.ts";
import { AIGuesserMode } from "./modes/AIGuesserMode.ts";
import { AIDrawerMode } from "./modes/AIDrawerMode.ts";
import { TeamBattleMode } from "./modes/TeamBattleMode.ts";
import { DuelMode } from "./modes/DuelMode.ts";
export const MODE_LABELS: Record<GameModeName, string> = {
  classic: "Classic",
  ai: "AI Guesser",
  "ai-drawer": "AI Drawer",
  "team-battle": "Team Battle",
  duel: "You vs AI",
  relay: "Drawing Relay",
};
export function normalizeMode(name: string | null): GameModeName {
  return name && Object.hasOwn(MODE_LABELS, name)
    ? (name as GameModeName)
    : "classic";
}
export function createMode(
  name: Exclude<GameModeName, "relay">,
  requestGuess: () => Promise<AIGuess>,
): GameMode {
  switch (name) {
    case "ai":
      return new AIGuesserMode(requestGuess);
    case "ai-drawer":
      return new AIDrawerMode();
    case "team-battle":
      return new TeamBattleMode(requestGuess);
    case "duel":
      return new DuelMode(requestGuess);
    default:
      return new ClassicMode();
  }
}

export function settingsForMode(
  settings: RoomSettings,
  mode: GameModeName,
): RoomSettings {
  const max = SETTINGS_LIMITS.rounds.max * TEAM_TURN_POINTS;
  return mode === "team-battle" && settings.scoreTarget > max
    ? { ...settings, scoreTarget: max }
    : settings;
}
