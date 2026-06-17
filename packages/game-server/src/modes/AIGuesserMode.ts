import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode, WORDS } from "./ClassicMode.ts";

const AI_ID = "ai-guesser";
const AI_NAME = "🤖 AI";

// AI-as-competing-guesser. Humans take turns drawing (the AI never draws);
// the AI joins as a virtual participant and guesses alongside humans, flowing
// through the exact same scoring + turn-end machinery.
//
// M4: the guess is STUBBED on a timer with a random chance of being right.
// M5 replaces `produceGuess` with a real call to the vision AI worker.
export class AIGuesserMode extends ClassicMode {
  override readonly id = "ai-guesser";

  private aiTimer: ReturnType<typeof setTimeout> | null = null;

  override configure(
    humans: PlayerRef[],
    ctx: EngineContext
  ): { totalTurns: number } {
    // Only humans draw, so draw rotation = humans.
    this.drawOrder = humans.map((h) => h.id);
    // Inject the AI as a virtual participant (guesser + scoreboard entry).
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return { totalTurns: this.drawOrder.length };
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnStart(turn, ctx); // deliver word to the human drawer
    this.scheduleAIGuess(turn, ctx);
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.clearAITimer();
  }

  // ----- AI behaviour (stub) -----

  private scheduleAIGuess(turn: TurnContext, ctx: EngineContext): void {
    this.clearAITimer();
    // Guess somewhere between 6 and 18 seconds in — feels like "thinking".
    const delay = 6_000 + Math.floor(Math.random() * 12_000);
    this.aiTimer = setTimeout(() => {
      // Bail if the turn moved on or the AI somehow already guessed.
      if (ctx.currentWord() !== turn.word || ctx.hasGuessed(AI_ID)) return;
      const guess = this.produceGuess(turn.word);
      ctx.broadcast({ type: "chat", from: { id: AI_ID, name: AI_NAME }, text: guess });
      if (guess.toLowerCase() === turn.word.toLowerCase()) {
        this.acceptGuess(AI_ID, ctx);
      }
    }, delay);
  }

  // STUB: 50% right, else a random wrong word. M5 swaps this for a real
  // vision-model call against the current canvas snapshot.
  private produceGuess(word: string): string {
    if (Math.random() < 0.5) return word;
    const wrong = WORDS.filter((w) => w !== word);
    return wrong[Math.floor(Math.random() * wrong.length)];
  }

  private clearAITimer(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }
}
