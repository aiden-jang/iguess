import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode, WORDS } from "./ClassicMode.ts";

const AI_ID = "ai-guesser";
const AI_NAME = "🤖 AI";

const FIRST_GUESS_MS = 8_000; // let the drawer get something on the canvas
const GUESS_INTERVAL_MS = 10_000; // re-guess cadence
const MAX_GUESSES = 4; // cost cap per turn

// AI-as-competing-guesser. The AI joins as a virtual participant and guesses
// alongside humans through the same scoring path. It guesses on an interval
// off live canvas snapshots (see requestGuess), capped to control API cost.
export class AIGuesserMode extends ClassicMode {
  override readonly id = "ai-guesser";

  private firstTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  // requestGuess renders the current canvas and asks the vision model.
  // Injected so the mode stays free of HTTP/Redis. Optional: without it we
  // fall back to a random stub (useful in tests).
  constructor(private requestGuess?: () => Promise<string>) {
    super();
  }

  override configure(
    humans: PlayerRef[],
    ctx: EngineContext
  ): { totalTurns: number } {
    this.drawOrder = humans.map((h) => h.id); // only humans draw
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return { totalTurns: this.drawOrder.length };
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnStart(turn, ctx); // deliver word to human drawer
    this.scheduleGuessing(turn, ctx);
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.clearTimers();
  }

  // ----- AI guessing loop -----

  private scheduleGuessing(turn: TurnContext, ctx: EngineContext): void {
    this.clearTimers();
    let attempts = 0;

    const attempt = async () => {
      // Stop if the turn moved on or the AI already nailed it.
      if (ctx.currentWord() !== turn.word || ctx.hasGuessed(AI_ID)) {
        this.clearTimers();
        return;
      }
      if (attempts >= MAX_GUESSES) {
        this.clearTimers();
        return;
      }
      attempts++;

      const guess = await this.getGuess(turn.word);
      // Re-check after the await — the turn may have ended meanwhile.
      if (!guess || ctx.currentWord() !== turn.word || ctx.hasGuessed(AI_ID)) {
        return;
      }

      ctx.broadcast({
        type: "chat",
        from: { id: AI_ID, name: AI_NAME },
        text: guess,
      });
      if (this.matches(guess, turn.word)) {
        this.clearTimers();
        this.acceptGuess(AI_ID, ctx);
      }
    };

    this.firstTimer = setTimeout(() => {
      void attempt();
      this.interval = setInterval(() => void attempt(), GUESS_INTERVAL_MS);
    }, FIRST_GUESS_MS);
  }

  private async getGuess(word: string): Promise<string> {
    if (this.requestGuess) {
      try {
        return await this.requestGuess();
      } catch {
        return "";
      }
    }
    // Fallback stub for tests / no worker: 50% correct, else a random word.
    if (Math.random() < 0.5) return word;
    const wrong = WORDS.filter((w) => w !== word);
    return wrong[Math.floor(Math.random() * wrong.length)];
  }

  // Lenient match: a vision model says "elephant", "an elephant", etc.
  private matches(guess: string, word: string): boolean {
    const g = guess.toLowerCase();
    const w = word.toLowerCase();
    if (g === w) return true;
    return g.split(/\W+/).includes(w) || g.includes(w);
  }

  private clearTimers(): void {
    if (this.firstTimer) {
      clearTimeout(this.firstTimer);
      this.firstTimer = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
