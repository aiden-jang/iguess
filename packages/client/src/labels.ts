export type InviteResult = "sharing" | "failed" | "copied" | "shared" | null;

export function chatPlaceholder(drawingNow: boolean, inGame: boolean): string {
  if (drawingNow) return "Draw on the canvas. No hints in chat.";
  return inGame ? "Your guess…" : "Say something…";
}

// "connecting…" only before the first connection ever lands, so a slow first load doesn't
// accuse the network of dropping something it never had.
export function connectionLabel(
  connected: boolean,
  everConnected: boolean,
): string {
  if (connected) return "Connected";
  return everConnected ? "Reconnecting…" : "connecting…";
}

export function inviteLabel(result: InviteResult): string {
  if (result === "sharing") return "Opening sharing…";
  if (result === "failed") return "Try again";
  if (result === "shared") return "Invite shared ✓";
  if (result === "copied") return "Link copied ✓";
  return "Invite friends";
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
  if (youAreWatching)
    return "You’re watching. Join the next game when a seat opens.";
  if (!soloWaiting) {
    const watchers = watchingCount ? ` · ${watchingCount} watching` : "";
    return `Lobby · ${readyCount}/${humanCount} ready${watchers}`;
  }
  if (isAIMode) return "It’s you vs the AI. Start game when you’re ready.";
  return "Classic needs someone to guess. Invite a friend to start.";
}

export interface BoardState {
  canDraw: boolean;
  youAreWatching: boolean;
  phase: string;
  isDrawer: boolean;
  drawerName: string;
  drawerIsAI: boolean;
}

// Always say WHY the board is dead, or it just looks broken. There is deliberately no lobby or
// results case: anyone not watching can draw in those phases, so the board is alive and silent.
export function boardHint(s: BoardState): string | null {
  if (s.canDraw) return null;
  if (s.phase === "intermission") return "Round complete. Next turn coming up.";
  if (s.youAreWatching) return "you're watching this one";
  if (s.phase === "choosing") {
    return s.isDrawer
      ? "Pick a word to start drawing"
      : `${s.drawerName} is picking a word`;
  }
  return s.drawerIsAI ? "The AI is drawing" : `${s.drawerName} is drawing`;
}
