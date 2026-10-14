import type { ModeSnapshot, GuessProgress } from "./modeState.ts";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";
import { AI_NAME, createCommentary } from "../ai/persona.ts";
import type { AiSkill, RoomSettings } from "@iguess/shared";

const AI_ID = "ai-guesser";

export class AIGuesserMode extends ClassicMode {
  private guessProgress: GuessProgress = {
    attempts: 0,
    notifiedDown: false,
    seenOps: 0,
  };
  override readonly id = "ai-guesser";

  // The AI is the other player, so one human is enough to start (you vs the AI).
  override readonly minHumans = 1;

  private stop: (() => void) | null = null;

  // The request seam keeps provider I/O outside the game rules.
  constructor(private requestGuess?: () => Promise<AIGuess>) {
    super();
  }

  private skill: AiSkill = "normal";
  private comment = createCommentary();
  private visionUnavailable = false;

  override useSettings(settings: RoomSettings): void {
    super.useSettings(settings);
    this.skill = settings.aiSkill;
  }

  override configure(
    humans: PlayerRef[],
    ctx: EngineContext,
  ): { totalTurns: number; turnsPerRound?: number } {
    this.drawOrder = humans.map((h) => h.id); // only humans draw
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return {
      totalTurns: this.drawOrder.length * this.rounds,
      turnsPerRound: this.drawOrder.length,
    };
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    this.guessProgress = { attempts: 0, notifiedDown: false, seenOps: 0 };
    this.bets.clear();
    this.onTurnResume(turn, ctx);
  }
  override onTurnResume(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnResume(turn, ctx); // deliver word to the human drawer
    this.stop?.();
    this.visionUnavailable = this.guessProgress.notifiedDown;
    this.stop = startGuessLoop(turn, ctx, {
      aiId: AI_ID,
      aiName: AI_NAME,
      skill: this.skill,
      progress: this.guessProgress,
      onSaid: (g) => this.settleBets(g, ctx),
      requestGuess: this.requestGuess,
      onCorrect: () => this.acceptGuess(AI_ID, ctx),
      onUnavailable: () => {
        this.visionUnavailable = true;
        ctx.broadcast({
          type: "system",
          text: "🤖 the AI can't see the canvas right now. carry on without it.",
        });
      },
    });
  }

  override snapshot(): ModeSnapshot {
    return { ...super.snapshot(), guessProgress: this.guessProgress };
  }
  override restore(saved: ModeSnapshot) {
    super.restore(saved);
    if (saved.guessProgress !== undefined)
      this.guessProgress = saved.guessProgress;
  }
  dispose() {
    this.stop?.();
    this.stop = null;
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.stop?.();
    this.stop = null;
    ctx.broadcast({
      type: "chat",
      from: { id: AI_ID, name: AI_NAME },
      text: this.comment(
        turn.word,
        ctx.hasGuessed(AI_ID),
        this.visionUnavailable,
      ),
    });
  }
}
