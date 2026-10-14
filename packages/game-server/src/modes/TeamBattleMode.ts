import type { ModeSnapshot, DrawProgress, GuessProgress } from "./modeState.ts";
import type { DrawOp } from "@iguess/shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";
import { randomWord } from "@iguess/shared/words";
import { normalizeGuess } from "../text.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";
import { AI_NAME } from "../ai/persona.ts";
import type { AiSkill, RoomSettings } from "@iguess/shared";

const AI_ID = "ai-team";

type Team = "human" | "ai";

// A race: one drawing, and the first correct guess wins the round for that side. Team scores
// travel as chat messages on purpose, rather than being added to the shared game state, because
// no other mode has teams.
export class TeamBattleMode extends ClassicMode {
  private drawProgress: DrawProgress = { index: 0 };
  private guessProgress: GuessProgress = {
    attempts: 0,
    notifiedDown: false,
    seenOps: 0,
  };
  override readonly id = "team-battle";

  override readonly minHumans = 1;

  private humans: string[] = [];
  private aiDrawsThisTurn = false;
  private roundDecided = false;
  private wins: Record<Team, number> = { human: 0, ai: 0 };
  private stopLoop: (() => void) | null = null;

  constructor(
    private requestGuess?: () => Promise<AIGuess>,
    private requestDrawing?: (word: string) => Promise<DrawOp[][]>,
  ) {
    super();
  }

  private skill: AiSkill = "normal";

  override useSettings(settings: RoomSettings): void {
    super.useSettings(settings);
    this.skill = settings.aiSkill;
  }

  override configure(
    humans: PlayerRef[],
    ctx: EngineContext,
  ): { totalTurns: number; turnsPerRound: number } {
    this.humans = humans.map((h) => h.id);
    this.wins = { human: 0, ai: 0 };
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    // A round is one human draw plus one AI draw, so the round count is doubled to get turns.
    return { totalTurns: this.rounds * 2, turnsPerRound: 2 };
  }

  private isAITurn(turnIndex: number): boolean {
    return turnIndex % 2 === 1; // odd rounds: AI draws
  }

  override pickDrawer(turnIndex: number): string {
    this.aiDrawsThisTurn = this.isAITurn(turnIndex);
    if (this.aiDrawsThisTurn) return AI_ID;
    return this.humans[Math.floor(turnIndex / 2) % this.humans.length];
  }

  override pickWord(): string {
    return this.aiDrawsThisTurn
      ? DOODLE_WORDS[Math.floor(Math.random() * DOODLE_WORDS.length)]
      : randomWord();
  }

  // Only a human chooses. Return null on AI turns to skip the choosing step entirely.
  override pickWordChoices(ctx: EngineContext): string[] | null {
    return this.aiDrawsThisTurn ? null : super.pickWordChoices(ctx);
  }

  override canDraw(playerId: string, ctx: EngineContext): boolean {
    return !this.aiDrawsThisTurn && playerId === ctx.currentDrawerId();
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    this.drawProgress = { index: 0 };
    this.guessProgress = { attempts: 0, notifiedDown: false, seenOps: 0 };
    this.bets.clear();
    this.roundDecided = false;
    this.onTurnResume(turn, ctx);
  }
  override onTurnResume(turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();

    if (this.aiDrawsThisTurn) {
      ctx.broadcast({
        type: "system",
        text: `Round ${turn.turnIndex + 1}: 🤖 Team AI is drawing. Team Human, guess!`,
      });
      this.stopLoop = startDrawLoop(turn, ctx, {
        requestDrawing: this.requestDrawing,
        progress: this.drawProgress,
      });
    } else {
      ctx.broadcast({
        type: "system",
        text: `Round ${turn.turnIndex + 1}: Team Human is drawing. 🤖 AI is racing you to guess!`,
      });
      super.onTurnResume(turn, ctx); // deliver the secret word to the human drawer
      this.stopLoop = startGuessLoop(turn, ctx, {
        aiId: AI_ID,
        aiName: AI_NAME,
        skill: this.skill,
        progress: this.guessProgress,
        onSaid: (g) => this.settleBets(g, ctx),
        requestGuess: this.requestGuess,
        onCorrect: () => this.winRound("ai", AI_ID, ctx),
        onUnavailable: () =>
          ctx.broadcast({
            type: "system",
            text: "🤖 Team AI can't see the canvas right now. this round's on the house, Team Human.",
          }),
      });
    }
  }

  override onChat(playerId: string, text: string, ctx: EngineContext): boolean {
    const word = ctx.currentWord();
    if (!word) return false; // not a live turn → normal chat
    if (playerId === ctx.currentDrawerId()) return true; // hide drawer chat
    if (this.takeCall(playerId, text, ctx)) return true;
    if (this.roundDecided) return false; // round already won → let chat through
    // A sentence containing the word does NOT win. They have to actually type the word.
    if (normalizeGuess(text) === normalizeGuess(word)) {
      this.winRound("human", playerId, ctx);
      return true;
    }
    return false; // wrong guess → shows as normal chat
  }

  private winRound(team: Team, byId: string, ctx: EngineContext): void {
    if (this.roundDecided) return; // first correct guess only
    this.roundDecided = true;
    this.stopLoop?.();
    this.stopLoop = null;

    const word = ctx.currentWord() ?? "";
    this.wins[team] += 1;
    ctx.awardPoints(byId, 100); // individual scoreboard still moves
    ctx.markGuessed(byId);

    const label = team === "ai" ? "🤖 Team AI" : "Team Human";
    ctx.broadcast({
      type: "system",
      text: `${label} wins the round! (${ctx.getName(byId)} got "${word}"). Humans ${this.wins.human} : ${this.wins.ai} AI`,
    });
    ctx.syncState();
    ctx.endTurn();
  }

  override snapshot(): ModeSnapshot {
    return {
      ...super.snapshot(),
      humans: this.humans,
      aiDrawsThisTurn: this.aiDrawsThisTurn,
      roundDecided: this.roundDecided,
      wins: this.wins,
      drawProgress: this.drawProgress,
      guessProgress: this.guessProgress,
    };
  }
  override restore(saved: ModeSnapshot) {
    super.restore(saved);
    if (saved.humans !== undefined) this.humans = saved.humans;
    if (saved.aiDrawsThisTurn !== undefined)
      this.aiDrawsThisTurn = saved.aiDrawsThisTurn;
    if (saved.roundDecided !== undefined)
      this.roundDecided = saved.roundDecided;
    if (saved.wins !== undefined) this.wins = saved.wins;
    if (saved.drawProgress !== undefined)
      this.drawProgress = saved.drawProgress;
    if (saved.guessProgress !== undefined)
      this.guessProgress = saved.guessProgress;
  }
  dispose() {
    this.stopLoop?.();
    this.stopLoop = null;
  }

  // Deliberately does not call super. This mode writes its own end-of-turn message with the
  // team scores in it, so the base "nobody got it" line would just repeat it.
  override onTurnEnd(_turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();
    this.stopLoop = null;
    if (!this.roundDecided) {
      ctx.broadcast({
        type: "system",
        text: `Time! Nobody guessed it. Humans ${this.wins.human} : ${this.wins.ai} AI`,
      });
    }
  }

  override onPlayerLeave(playerId: string) {
    this.bets.delete(playerId);
    this.humans = this.humans.filter((id) => id !== playerId);
  }
  override onGameEnd(ctx: EngineContext): void {
    const { human, ai } = this.wins;
    const verdict =
      human === ai
        ? "it's a tie! 🤝"
        : human > ai
          ? "🏆 Team Human wins!"
          : "🏆 Team AI wins!";
    ctx.broadcast({
      type: "system",
      text: `game over. Humans ${human} : ${ai} AI. ${verdict}`,
    });
  }
}
