import type { ServerMessage } from "shared";

// A participant in a game — a human (backed by a socket) or a virtual player
// such as the AI. The engine treats them uniformly for turn order + scoring.
export interface PlayerRef {
  id: string;
  name: string;
  isAI?: boolean;
}

// Context for the current turn, handed to per-turn mode hooks.
export interface TurnContext {
  turnIndex: number;
  drawerId: string;
  word: string;
}

// The narrow surface a mode is allowed to use on the engine. The mode never
// sees sockets or Redis — only these verbs. This is what keeps modes
// swappable and the engine stable.
export interface EngineContext {
  participants(): PlayerRef[];
  getName(id: string): string;

  broadcast(msg: ServerMessage): void;
  sendToPlayer(id: string, msg: ServerMessage): void;
  clearCanvas(): void;

  // Score ledger.
  awardPoints(id: string, points: number): void;
  scores(): Record<string, number>;

  // Per-turn "who has completed their objective" set (e.g. guessed correctly).
  // The engine owns the set for state-broadcasting; the mode decides WHEN to
  // mark and when the turn should end.
  markGuessed(id: string): void;
  guessedIds(): string[];
  hasGuessed(id: string): boolean;

  // Roster mutation — how a mode injects/removes virtual players like the AI.
  addParticipant(p: PlayerRef): void;
  removeParticipant(id: string): void;

  currentDrawerId(): string | null;
  currentWord(): string | null;

  // Fraction (0..1) of the turn timer remaining — used for speed scoring.
  turnFractionRemaining(): number;

  // Re-broadcast public game state (call after mutating scores/guessed).
  syncState(): void;

  // Ask the engine to end the current turn now (e.g. everyone guessed).
  endTurn(): void;
}

// The strategy a game mode implements. The engine drives the timeline and
// calls these hooks; the mode supplies all the game-specific decisions.
export interface GameMode {
  readonly id: string;

  // Called once at game start with the human players. Mode may add virtual
  // participants (AI) via ctx here. Returns how many turns the game runs.
  configure(humans: PlayerRef[], ctx: EngineContext): { totalTurns: number };

  // Who draws on a given turn.
  pickDrawer(turnIndex: number, ctx: EngineContext): string;

  // The prompt/word for the turn.
  pickWord(ctx: EngineContext): string;

  // Turn just began (drawer/word set, canvas cleared). Typically the mode
  // delivers the secret word to whoever is allowed to know it.
  onTurnStart(turn: TurnContext, ctx: EngineContext): void;

  // A chat line arrived. Return true if it was consumed as game input (e.g.
  // a correct guess) and must NOT be broadcast as plain chat; false otherwise.
  onChat(playerId: string, text: string, ctx: EngineContext): boolean;

  // May this player draw right now?
  canDraw(playerId: string, ctx: EngineContext): boolean;

  // Turn is ending — clean up any mode timers, award turn-end bonuses, etc.
  onTurnEnd(turn: TurnContext, ctx: EngineContext): void;

  // Optional: game fully over.
  onGameEnd?(ctx: EngineContext): void;
}
