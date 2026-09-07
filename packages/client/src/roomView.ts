import type { GamePhase, PlayerInfo, PublicGameState } from "@iguess/shared";

/** The server seats the AI as a virtual player, and its ids carry this prefix. */
export const isAI = (id?: string | null): boolean => !!id && id.startsWith("ai-");

export interface RoomView {
  phase: GamePhase | "lobby";
  isDrawer: boolean;
  youAreHost: boolean;
  humans: PlayerInfo[];
  watching: PlayerInfo[];
  youAreWatching: boolean;
  readyCount: number;
  youAreReady: boolean;
  canDraw: boolean;
  drawingNow: boolean;
  inGame: boolean;
  ranked: PlayerInfo[];
  hasAI: boolean;
  aiGuessedRight: boolean;
  soloWaiting: boolean;
}

export function roomView(
  game: PublicGameState | null,
  players: PlayerInfo[],
  you: PlayerInfo | null,
): RoomView {
  const phase = game?.phase ?? "lobby";
  const isDrawer = !!game && game.drawerId === you?.id;
  const humans = players.filter((p) => !isAI(p.id) && !p.spectator);
  const watching = players.filter((p) => p.spectator);
  const youAreWatching = watching.some((p) => p.id === you?.id);
  const hasAI = players.some((p) => isAI(p.id));
  return {
    phase,
    isDrawer,
    youAreHost: players.some((p) => p.id === you?.id && p.isHost),
    humans,
    watching,
    youAreWatching,
    readyCount: humans.filter((p) => p.ready).length,
    youAreReady: humans.some((p) => p.id === you?.id && p.ready),
    canDraw:
      (phase === "playing" && isDrawer) ||
      ((phase === "lobby" || phase === "ended") && !youAreWatching),
    // Not the same as canDraw. Everyone can scribble in the lobby, but only the person drawing
    // in a live round is told to stop typing. Using canDraw here silenced the whole lobby.
    drawingNow: phase === "playing" && isDrawer,
    inGame: phase === "playing" || phase === "intermission",
    ranked: [...players].sort((a, b) => (game?.scores[b.id] ?? 0) - (game?.scores[a.id] ?? 0)),
    hasAI,
    aiGuessedRight: hasAI && (game?.guessedIds ?? []).some((id) => isAI(id)),
    soloWaiting: !hasAI && players.filter((p) => !isAI(p.id)).length <= 1,
  };
}
