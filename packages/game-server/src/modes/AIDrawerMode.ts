import type { DrawOp } from "shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { DOODLES, DOODLE_WORDS } from "../doodles.ts";

const AI_ID = "ai-drawer";
const AI_NAME = "🤖 AI";
const REVEAL_MS = 1_500; // cadence at which the next stroke appears
const TOTAL_ROUNDS = 3;

// AI-as-drawer. The AI joins as the sole drawer; humans race to guess. It
// produces strokes through ctx.draw (the seam added for this mode), revealing
// them one at a time so it looks like it's drawing live. Guessing, scoring,
// and rotation are inherited unchanged from ClassicMode.
export class AIDrawerMode extends ClassicMode {
  override readonly id = "ai-drawer";

  private revealTimer: ReturnType<typeof setInterval> | null = null;

  // Optional injected generator (a future model). Falls back to the curated
  // doodle library. Kept out of the mode so it stays free of HTTP/Redis.
  constructor(private requestDrawing?: (word: string) => Promise<DrawOp[][]>) {
    super();
  }

  override configure(_humans: PlayerRef[], ctx: EngineContext): { totalTurns: number } {
    this.drawOrder = [AI_ID]; // only the AI ever draws
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return { totalTurns: TOTAL_ROUNDS };
  }

  override pickDrawer(): string {
    return AI_ID;
  }

  // Only choose words we can actually draw.
  override pickWord(): string {
    return DOODLE_WORDS[Math.floor(Math.random() * DOODLE_WORDS.length)];
  }

  override canDraw(): boolean {
    return false; // no human draws; AI strokes arrive via ctx.draw, not sockets
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    // Deliberately do NOT call super.onTurnStart(): that delivers the secret
    // word to the drawer. Here the drawer is the AI and no human may see it.
    void this.beginDrawing(turn, ctx);
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.clearReveal();
  }

  // ----- Progressive drawing -----

  private async beginDrawing(turn: TurnContext, ctx: EngineContext): Promise<void> {
    this.clearReveal();
    const strokes = await this.getDrawing(turn.word);
    // The await may have outlived the turn (e.g. a slow generator).
    if (ctx.currentWord() !== turn.word) return;

    let i = 0;
    const revealNext = () => {
      if (ctx.currentWord() !== turn.word || i >= strokes.length) {
        this.clearReveal();
        return;
      }
      for (const op of strokes[i]) ctx.draw(op);
      i++;
    };
    revealNext(); // first stroke immediately
    this.revealTimer = setInterval(revealNext, REVEAL_MS);
  }

  private async getDrawing(word: string): Promise<DrawOp[][]> {
    if (this.requestDrawing) {
      try {
        const d = await this.requestDrawing(word);
        if (d?.length) return d;
      } catch {
        // fall through to the library
      }
    }
    return DOODLES[word]?.() ?? [];
  }

  private clearReveal(): void {
    if (this.revealTimer) {
      clearInterval(this.revealTimer);
      this.revealTimer = null;
    }
  }
}
