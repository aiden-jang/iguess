import type { ModeSnapshot } from "./modeState.ts";
import type { ServerMessage, DrawOp, RoomSettings } from "@iguess/shared";
import type { WordMemory } from "../wordMemory.ts";

export interface PlayerRef {
  id: string;
  name: string;
  isAI?: boolean;
}

export interface TurnContext {
  turnIndex: number;
  drawerId: string;
  word: string;
}

// Everything a mode is allowed to do to the engine. Modes never touch sockets, which is
// what lets you add a mode without changing the engine.
export interface EngineContext {
  participants(): PlayerRef[];
  getName(id: string): string;

  broadcast(msg: ServerMessage): void;
  sendToPlayer(id: string, msg: ServerMessage): void;
  clearCanvas(): void;

  // For strokes the MODE makes, like the AI drawing. Saved and sent on, so someone joining
  // late still sees them.
  draw(op: DrawOp): void;

  awardPoints(id: string, points: number): void;
  scores(): Record<string, number>;

  // Who has finished this turn, usually by guessing right. The engine keeps the list; the
  // mode decides who goes on it.
  markGuessed(id: string): void;
  guessedIds(): string[];
  hasGuessed(id: string): boolean;

  addParticipant(p: PlayerRef): void;
  removeParticipant(id: string): void;

  currentDrawerId(): string | null;
  currentWord(): string | null;

  // 1 at the start of the turn, 0 at the end. This is how speed scoring works.
  turnFractionRemaining(): number;

  // Letters given away so far this turn, so a mode can pay more for guessing without them.
  hintsRevealed(): number;

  // How much is on the canvas. A jump means a lot was just drawn.
  canvasOpCount(): number;

  syncState(): void;

  endTurn(): void;
}

export interface GameMode {
  useWordMemory?(memory: WordMemory): void;

  // Applied before configure(). A mode that ignores this keeps its own defaults.
  useSettings?(settings: RoomSettings): void;

  snapshot(): ModeSnapshot;
  restore(saved: ModeSnapshot): void;
  dispose?(): void;
  onTurnResume?(turn: TurnContext, ctx: EngineContext): void;

  readonly id: string;

  // Classic needs 2, because somebody has to guess. AI modes need only 1: the AI is the
  // other player.
  readonly minHumans: number;

  // Add any AI players here. Return how many turns the game runs, and how many turns make
  // up one round if that isn't the whole game.
  configure(
    humans: PlayerRef[],
    ctx: EngineContext,
  ): { totalTurns: number; turnsPerRound?: number };

  pickDrawer(turnIndex: number, ctx: EngineContext): string;

  pickWord(ctx: EngineContext): string;

  // Return 2 or more words to make the drawer choose one. Return null or nothing to skip
  // straight to pickWord, which is what the AI drawer does.
  pickWordChoices?(ctx: EngineContext): string[] | null;

  onTurnStart(turn: TurnContext, ctx: EngineContext): void;

  // Return true if you used the message as game input, which also stops it appearing in
  // chat. A correct guess must never be echoed to the room.
  onChat(playerId: string, text: string, ctx: EngineContext): boolean;

  canDraw(playerId: string, ctx: EngineContext): boolean;

  onTurnEnd(turn: TurnContext, ctx: EngineContext): void;

  onGameEnd?(ctx: EngineContext): void;

  // Take them out of the drawing order here, or a later turn hands the pen to someone who
  // has gone and the whole turn is blank.
  onPlayerLeave?(playerId: string, ctx: EngineContext): void;
}
