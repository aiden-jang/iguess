import type { ServerMessage, DrawOp } from "@iguess/shared";
import type { EngineContext, PlayerRef } from "./modes/GameMode.ts";
// Room I/O is injected so game rules stay independent of WebSockets.
export interface EngineDeps {
  broadcast: (msg: ServerMessage) => void;
  sendToPlayer: (playerId: string, msg: ServerMessage) => void;
  clearCanvas: () => void | Promise<void>;
  drawOp: (op: DrawOp) => void | Promise<void>;
  getName: (playerId: string) => string;
  canvasOpCount: () => number;
  addVirtualPlayer: (p: PlayerRef) => void;
  removeVirtualPlayer: (id: string) => void;
}

export interface ContextState {
  roster: Map<string, PlayerRef>;
  scoreboard: Record<string, number>;
  guessed: Set<string>;
  drawerId: string | null;
  word: string | null;
  revealed: Set<number>;
  turnEndsAt: number | null;
  turnMs: number;
}
export function createEngineContext(
  state: () => ContextState,
  deps: EngineDeps,
  sync: () => void,
  endTurn: () => void,
): EngineContext {
  return {
    participants: () => [...state().roster.values()],
    getName: (id) => state().roster.get(id)?.name ?? deps.getName(id),
    broadcast: (msg) => deps.broadcast(msg),
    sendToPlayer: (id, msg) => deps.sendToPlayer(id, msg),
    clearCanvas: () => void deps.clearCanvas(),
    draw: (op) => void deps.drawOp(op),
    awardPoints: (id, pts) => {
      state().scoreboard[id] = (state().scoreboard[id] ?? 0) + pts;
    },
    scores: () => state().scoreboard,
    markGuessed: (id) => state().guessed.add(id),
    guessedIds: () => [...state().guessed],
    hasGuessed: (id) => state().guessed.has(id),
    addParticipant: (p) => {
      state().roster.set(p.id, p);
      if (state().scoreboard[p.id] === undefined) state().scoreboard[p.id] = 0;
      if (p.isAI) deps.addVirtualPlayer(p);
    },
    removeParticipant: (id) => {
      const p = state().roster.get(id);
      state().roster.delete(id);
      if (p?.isAI) deps.removeVirtualPlayer(id);
    },
    currentDrawerId: () => state().drawerId,
    currentWord: () => state().word,
    hintsRevealed: () => state().revealed.size,
    canvasOpCount: () => deps.canvasOpCount(),
    turnFractionRemaining: () => {
      const deadline = state().turnEndsAt;
      if (!deadline) return 0;
      return Math.max(0, Math.min(1, (deadline - Date.now()) / state().turnMs));
    },
    syncState: () => sync(),
    endTurn: () => endTurn(),
  };
}
