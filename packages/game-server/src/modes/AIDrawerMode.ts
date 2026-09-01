import type { DrawOp } from "@iguess/shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";
import type { WordMemory } from "../wordMemory.ts";
import { AI_NAME } from "../ai/persona.ts";

const AI_ID = "ai-drawer";

export class AIDrawerMode extends ClassicMode {
  override readonly id = "ai-drawer";

  override readonly minHumans = 1;

  private stop: (() => void) | null = null;
  // Doodles already drawn this game, so it doesn't repeat itself.
  private usedDoodles = new Set<string>();
  private wordMemory?: WordMemory;

  override useWordMemory(memory: WordMemory): void {
    this.wordMemory = memory;
  }

  constructor(private requestDrawing?: (word: string) => Promise<DrawOp[][]>) {
    super();
  }

  override configure(_humans: PlayerRef[], ctx: EngineContext): { totalTurns: number } {
    this.drawOrder = [AI_ID]; // only the AI ever draws
    this.usedDoodles.clear();
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return { totalTurns: this.rounds };
  }

  override pickDrawer(): string {
    return AI_ID;
  }

  // Only words there is a doodle for. Start the pool over once every one has been used.
  override pickWord(): string {
    if (this.usedDoodles.size >= DOODLE_WORDS.length) this.usedDoodles.clear();
    const avoid = new Set([...this.usedDoodles, ...(this.wordMemory?.avoidFor(DOODLE_WORDS) ?? [])]);
    let pool = DOODLE_WORDS.filter((w) => !avoid.has(w));
    if (pool.length === 0) pool = DOODLE_WORDS.filter((w) => !this.usedDoodles.has(w));
    const word = pool[Math.floor(Math.random() * pool.length)]!;
    this.usedDoodles.add(word);
    this.wordMemory?.remember(word);
    return word;
  }

  // Returning null skips the choosing step, because there is no human to choose.
  override pickWordChoices(): string[] | null {
    return null;
  }

  override canDraw(): boolean {
    return false; // no human draws; AI strokes arrive via ctx.draw, not sockets
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    // Deliberately does not call super. That sends the word to the drawer, and here the
    // drawer is the AI, so it would be handing the answer to nobody who should have it.
    this.stop?.();
    this.stop = startDrawLoop(turn, ctx, { requestDrawing: this.requestDrawing });
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.stop?.();
    this.stop = null;
  }
}
