import type { DrawOp } from "@iguess/shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";
import { AI_NAME } from "../ai/persona.ts";
import type { AiSkill, RoomSettings } from "@iguess/shared";

const AI_ID = "ai-duel";

// You and the machine swap roles every turn, and both of you are paid for guessing AND for
// drawing. Team Battle is the other shape: a race where only the winning side scores.
export class DuelMode extends ClassicMode {
  override readonly id = "duel";

  override readonly minHumans = 1;

  private humans: string[] = [];
  private aiDrawsThisTurn = false;
  // Doodles the AI has already drawn this game, so it doesn't repeat itself.
  private usedDoodles = new Set<string>();
  private stopLoop: (() => void) | null = null;

  constructor(
    private requestGuess?: () => Promise<AIGuess>,
    private requestDrawing?: (word: string) => Promise<DrawOp[][]>
  ) {
    super();
  }

  private skill: AiSkill = "normal";

  override useSettings(settings: RoomSettings): void {
    super.useSettings(settings);
    this.skill = settings.aiSkill;
  }

  override configure(humans: PlayerRef[], ctx: EngineContext): { totalTurns: number; turnsPerRound: number } {
    this.humans = humans.map((h) => h.id);
    this.usedDoodles.clear();
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    // A round is one draw each, so the room's round count is doubled to get turns.
    return { totalTurns: this.rounds * 2, turnsPerRound: 2 };
  }

  private isAITurn(turnIndex: number): boolean {
    return turnIndex % 2 === 1; // odd turns: the AI draws
  }

  override pickDrawer(turnIndex: number): string {
    this.aiDrawsThisTurn = this.isAITurn(turnIndex);
    if (this.aiDrawsThisTurn) return AI_ID;
    return this.humans[Math.floor(turnIndex / 2) % this.humans.length]!;
  }

  override pickWord(ctx: EngineContext): string {
    if (!this.aiDrawsThisTurn) return super.pickWord(ctx); // you draw a normal word
    // The AI can only draw words it has a doodle for.
    if (this.usedDoodles.size >= DOODLE_WORDS.length) this.usedDoodles.clear();
    const pool = DOODLE_WORDS.filter((w) => !this.usedDoodles.has(w));
    const word = pool[Math.floor(Math.random() * pool.length)]!;
    this.usedDoodles.add(word);
    return word;
  }

  // Only a human gets to choose. The AI picks its own word, so skip choosing on its turns.
  override pickWordChoices(ctx: EngineContext): string[] | null {
    return this.aiDrawsThisTurn ? null : super.pickWordChoices(ctx);
  }

  override canDraw(playerId: string, ctx: EngineContext): boolean {
    return !this.aiDrawsThisTurn && playerId === ctx.currentDrawerId();
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();

    if (this.aiDrawsThisTurn) {
      ctx.broadcast({ type: "system", text: "🤖 the machine is drawing. read it and call it 👀" });
      this.stopLoop = startDrawLoop(turn, ctx, { requestDrawing: this.requestDrawing });
    } else {
      ctx.broadcast({ type: "system", text: "your turn. make the machine guess it 🎨" });
      super.onTurnStart(turn, ctx); // deliver the secret word to you, the drawer
      this.stopLoop = startGuessLoop(turn, ctx, {
        aiId: AI_ID,
        aiName: AI_NAME,
        skill: this.skill,
        onSaid: (g) => this.settleBets(g, ctx),
        requestGuess: this.requestGuess,
        onCorrect: () => this.acceptGuess(AI_ID, ctx),
        onUnavailable: () =>
          ctx.broadcast({
            type: "system",
            text: "🤖 the machine can't see the canvas right now, so this one's a freebie.",
          }),
      });
    }
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();
    this.stopLoop = null;
    super.onTurnEnd(turn, ctx); // "nobody got it" line when a turn whiffs
  }

  // Out of the rotation, or a later turn picks someone who has gone.
  override onPlayerLeave(playerId: string): void {
    this.humans = this.humans.filter((id) => id !== playerId);
  }

  override onGameEnd(ctx: EngineContext): void {
    const scores = ctx.scores();
    const ai = scores[AI_ID] ?? 0;
    const you = Math.max(0, ...this.humans.map((id) => scores[id] ?? 0));
    let verdict: string;
    if (you === ai) verdict = `dead heat, ${you}-${ai}. the machine lives to draw another day 🤝`;
    else if (you > ai) verdict = `🏆 you beat the machine, ${you}-${ai}. humanity holds the line.`;
    else verdict = `🤖 the machine wins, ${ai}-${you}. it says "good effort… i guess."`;
    ctx.broadcast({ type: "system", text: `game over. ${verdict}` });
  }
}
