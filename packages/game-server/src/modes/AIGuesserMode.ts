import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";
import { AI_NAME, aiComment } from "../ai/persona.ts";
import type { AiSkill, RoomSettings } from "@iguess/shared";

const AI_ID = "ai-guesser";

// AI-as-competing-guesser. The AI joins as a virtual participant and guesses
// alongside humans through the same scoring path. The actual guessing loop
// lives in the shared aiGuessLoop helper, composed here.
export class AIGuesserMode extends ClassicMode {
  override readonly id = "ai-guesser";

  // The AI is the other player, so one human is enough to start (you vs the AI).
  override readonly minHumans = 1;

  private stop: (() => void) | null = null;

  // requestGuess renders the canvas and asks the vision model. Injected so
  // the mode stays free of HTTP/Redis. Optional → random stub in tests.
  constructor(private requestGuess?: () => Promise<AIGuess>) {
    super();
  }

  private skill: AiSkill = "normal";

  override useSettings(settings: RoomSettings): void {
    super.useSettings(settings);
    this.skill = settings.aiSkill;
  }

  override configure(
    humans: PlayerRef[],
    ctx: EngineContext
  ): { totalTurns: number; turnsPerRound?: number } {
    this.drawOrder = humans.map((h) => h.id); // only humans draw
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return {
      totalTurns: this.drawOrder.length * this.rounds,
      turnsPerRound: this.drawOrder.length,
    };
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnStart(turn, ctx); // deliver word to the human drawer
    this.stop?.();
    this.stop = startGuessLoop(turn, ctx, {
      aiId: AI_ID,
      aiName: AI_NAME,
      skill: this.skill,
      requestGuess: this.requestGuess,
      onCorrect: () => this.acceptGuess(AI_ID, ctx),
      onUnavailable: () =>
        ctx.broadcast({
          type: "system",
          text: "🤖 the AI can't see the canvas right now. carry on without it.",
        }),
    });
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.stop?.();
    this.stop = null;
    // The most interesting thing in the room had nothing to say about the round it just played.
    ctx.broadcast({
      type: "chat",
      from: { id: AI_ID, name: AI_NAME },
      text: aiComment(turn.word, ctx.hasGuessed(AI_ID)),
    });
  }
}
