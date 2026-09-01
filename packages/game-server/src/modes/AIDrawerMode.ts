import type { DrawOp } from "@iguess/shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";
import type { WordMemory } from "../wordMemory.ts";
import { AI_NAME } from "../ai/persona.ts";

const AI_ID = "ai-drawer";


// AI-as-drawer. The AI is the sole drawer; humans race to guess. Drawing is
// produced through the shared aiDrawLoop helper (via ctx.draw). Guessing,
// scoring, and rotation are inherited unchanged from ClassicMode.
export class AIDrawerMode extends ClassicMode {
  override readonly id = "ai-drawer";

  // The AI draws, so one human (the guesser) is enough to start.
  override readonly minHumans = 1;

  private stop: (() => void) | null = null;
  // Doodle words already drawn this game, so consecutive turns don't repeat one. Reset per game.
  private usedDoodles = new Set<string>();
  private wordMemory?: WordMemory;

  override useWordMemory(memory: WordMemory): void {
    this.wordMemory = memory;
  }

  // Optional injected generator (a future model). Falls back to the doodle
  // library inside the draw loop.
  constructor(private requestDrawing?: (word: string) => Promise<DrawOp[][]>) {
    super();
  }

  override configure(_humans: PlayerRef[], ctx: EngineContext): { totalTurns: number } {
    this.drawOrder = [AI_ID]; // only the AI ever draws
    this.usedDoodles.clear();
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    // One turn per round: the AI is the only one who ever draws.
    return { totalTurns: this.rounds };
  }

  override pickDrawer(): string {
    return AI_ID;
  }

  // Only choose words we can actually draw — and not one already drawn this game, so you're not
  // guessing the same doodle turn after turn. When the pool is exhausted, start it over.
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

  // The AI drawer picks its own word — no human "choosing" phase. Returning
  // null keeps the engine on the direct pickWord path.
  override pickWordChoices(): string[] | null {
    return null;
  }

  override canDraw(): boolean {
    return false; // no human draws; AI strokes arrive via ctx.draw, not sockets
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    // Deliberately do NOT call super.onTurnStart(): that delivers the secret
    // word to the drawer. Here the drawer is the AI and no human may see it.
    this.stop?.();
    this.stop = startDrawLoop(turn, ctx, { requestDrawing: this.requestDrawing });
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.stop?.();
    this.stop = null;
  }
}
