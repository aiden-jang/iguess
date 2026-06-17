import type { ServerMessage, PublicGameState, GamePhase } from "shared";
import type { GameMode, EngineContext, PlayerRef, TurnContext } from "./modes/GameMode.ts";

const TURN_MS = 60_000;
const INTERMISSION_MS = 5_000;

// Transport-facing dependencies, injected by the WS layer. The engine never
// imports ws or redis — it only knows these verbs.
export interface EngineDeps {
  broadcast: (msg: ServerMessage) => void;
  sendToPlayer: (playerId: string, msg: ServerMessage) => void;
  clearCanvas: () => void | Promise<void>;
  getName: (playerId: string) => string;
  // Reflect a virtual participant (AI) into room presence so it appears in
  // the roster/scoreboard like any other player.
  addVirtualPlayer: (p: PlayerRef) => void;
  removeVirtualPlayer: (id: string) => void;
}

// The engine owns the game *timeline* and shared bookkeeping. All
// game-specific decisions are delegated to the injected GameMode.
export class GameEngine {
  private phase: GamePhase = "lobby";
  private turnIndex = 0;
  private totalTurns = 0;
  private drawerId: string | null = null;
  private word: string | null = null;
  private turnEndsAt: number | null = null;
  private guessed = new Set<string>();
  private scoreboard: Record<string, number> = {};
  private roster = new Map<string, PlayerRef>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: EngineDeps, private mode: GameMode) {}

  get currentPhase() {
    return this.phase;
  }

  canDraw(playerId: string): boolean {
    return this.mode.canDraw(playerId, this.ctx);
  }

  handleChat(playerId: string, text: string): boolean {
    return this.mode.onChat(playerId, text, this.ctx);
  }

  sendStateTo(playerId: string) {
    this.deps.sendToPlayer(playerId, {
      type: "game_state",
      state: this.publicState(),
    });
  }

  startGame(humanIds: string[]) {
    if (this.phase === "playing" || this.phase === "intermission") return;
    if (humanIds.length < 2) {
      this.deps.broadcast({
        type: "system",
        text: "Need at least 2 players to start.",
      });
      return;
    }

    // Reset and seed the roster with the human players.
    this.roster.clear();
    for (const id of humanIds) {
      this.roster.set(id, { id, name: this.deps.getName(id) });
    }

    // Let the mode configure the game (and add virtual players like the AI).
    const { totalTurns } = this.mode.configure(
      humanIds.map((id) => this.roster.get(id)!),
      this.ctx
    );

    this.totalTurns = totalTurns;
    this.turnIndex = 0;
    this.scoreboard = Object.fromEntries(
      [...this.roster.keys()].map((id) => [id, 0])
    );
    this.startTurn();
  }

  onPlayerLeave(playerId: string) {
    if (this.phase !== "playing") return;
    if (playerId === this.drawerId) {
      this.deps.broadcast({
        type: "system",
        text: "The drawer left — ending the turn.",
      });
      this.endTurn();
    }
  }

  // ----- Turn lifecycle -----

  private startTurn() {
    const drawerId = this.mode.pickDrawer(this.turnIndex, this.ctx);
    const word = this.mode.pickWord(this.ctx);

    this.phase = "playing";
    this.drawerId = drawerId;
    this.word = word;
    this.turnEndsAt = Date.now() + TURN_MS;
    this.guessed.clear();

    void this.deps.clearCanvas();
    this.deps.broadcast({
      type: "system",
      text: `${this.deps.getName(drawerId)} is drawing!`,
    });

    const turn: TurnContext = { turnIndex: this.turnIndex, drawerId, word };
    this.mode.onTurnStart(turn, this.ctx);
    this.broadcastState();

    this.timer = setTimeout(() => this.endTurn(), TURN_MS);
  }

  private endTurn() {
    if (this.phase !== "playing") return; // guard against double-end
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const word = this.word ?? "";
    const turn: TurnContext = {
      turnIndex: this.turnIndex,
      drawerId: this.drawerId ?? "",
      word,
    };

    this.phase = "intermission";
    this.turnEndsAt = null;
    this.deps.broadcast({ type: "turn_end", word, scores: this.scoreboard });
    this.mode.onTurnEnd(turn, this.ctx);
    this.broadcastState();

    this.turnIndex += 1;
    if (this.turnIndex >= this.totalTurns) {
      setTimeout(() => {
        this.phase = "ended";
        this.drawerId = null;
        this.word = null;
        this.mode.onGameEnd?.(this.ctx);
        this.broadcastState();
      }, INTERMISSION_MS);
    } else {
      setTimeout(() => this.startTurn(), INTERMISSION_MS);
    }
  }

  private broadcastState() {
    this.deps.broadcast({ type: "game_state", state: this.publicState() });
  }

  private publicState(): PublicGameState {
    return {
      phase: this.phase,
      drawerId: this.drawerId,
      turnIndex: this.turnIndex,
      totalTurns: this.totalTurns,
      turnEndsAt: this.turnEndsAt,
      wordLength: this.word?.length ?? 0,
      scores: this.scoreboard,
      guessedIds: [...this.guessed],
    };
  }

  // The narrow handle handed to the mode. Bound once; reads live engine state.
  private ctx: EngineContext = {
    participants: () => [...this.roster.values()],
    getName: (id) => this.roster.get(id)?.name ?? this.deps.getName(id),
    broadcast: (msg) => this.deps.broadcast(msg),
    sendToPlayer: (id, msg) => this.deps.sendToPlayer(id, msg),
    clearCanvas: () => void this.deps.clearCanvas(),
    awardPoints: (id, pts) => {
      this.scoreboard[id] = (this.scoreboard[id] ?? 0) + pts;
    },
    scores: () => this.scoreboard,
    markGuessed: (id) => this.guessed.add(id),
    guessedIds: () => [...this.guessed],
    hasGuessed: (id) => this.guessed.has(id),
    addParticipant: (p) => {
      this.roster.set(p.id, p);
      if (this.scoreboard[p.id] === undefined) this.scoreboard[p.id] = 0;
      if (p.isAI) this.deps.addVirtualPlayer(p);
    },
    removeParticipant: (id) => {
      const p = this.roster.get(id);
      this.roster.delete(id);
      if (p?.isAI) this.deps.removeVirtualPlayer(id);
    },
    currentDrawerId: () => this.drawerId,
    currentWord: () => this.word,
    turnFractionRemaining: () => {
      if (!this.turnEndsAt) return 0;
      return Math.max(0, Math.min(1, (this.turnEndsAt - Date.now()) / TURN_MS));
    },
    syncState: () => this.broadcastState(),
    endTurn: () => this.endTurn(),
  };
}
