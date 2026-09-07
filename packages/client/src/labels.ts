export type InviteResult = "copied" | "shared" | null;

export function chatPlaceholder(drawingNow: boolean, inGame: boolean): string {
  if (drawingNow) return "eyes on the canvas, picasso ✋";
  return inGame ? "guess it bestie… (?word calls the AI)" : "say something fr";
}

// "connecting…" only before the first connection ever lands, so a slow first load doesn't
// accuse the network of dropping something it never had.
export function connectionLabel(connected: boolean, everConnected: boolean): string {
  if (connected) return "we're so back";
  return everConnected ? "hang on…" : "connecting…";
}

export function inviteLabel(result: InviteResult): string {
  if (result === "shared") return "✅ invite sent";
  if (result === "copied") return "✅ copied, go spam it";
  return "🔗 invite the squad";
}

export interface LobbyCounts {
  youAreWatching: boolean;
  soloWaiting: boolean;
  isAIMode: boolean;
  readyCount: number;
  humanCount: number;
  watchingCount: number;
}

// Always say why the lobby is idle. "Waiting" with no reason reads as broken.
export function lobbyStatus({
  youAreWatching,
  soloWaiting,
  isAIMode,
  readyCount,
  humanCount,
  watchingCount,
}: LobbyCounts): string {
  if (youAreWatching) return "room's full, so you're watching. you're in the next game.";
  if (!soloWaiting) {
    const watchers = watchingCount ? ` · ${watchingCount} watching` : "";
    return `lowkey waiting · ${readyCount}/${humanCount} ready${watchers}`;
  }
  if (isAIMode) return "it's you vs the 🤖 AI. hit send it whenever you're ready.";
  return "just you so far. classic needs someone to guess, so hit 🔗 invite the squad.";
}
