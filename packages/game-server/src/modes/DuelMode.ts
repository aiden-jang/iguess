import type { DrawOp } from "@iguess/shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";

const AI_ID = "ai-duel";
const AI_NAME = "🤖 AI";
const TOTAL_TURNS = 6; // alternates you / AI / you / AI / you / AI — three draws each

// Head-to-head "you vs the machine". Unlike TeamBattleMode (a first-to-guess RACE where only the
// winning side scores and the AI never earns drawer points), Duel uses ClassicMode's real
// cumulative scoring: every turn BOTH the guesser and the drawer are paid, and you and the AI take
// turns in each role. So the AI racks up guesser points when it reads your drawing AND drawer
// points when you read its doodle — a genuine points ladder on one shared scoreboard. Built on
// ClassicMode + the shared AI loops; no core-engine change.
export class DuelMode extends ClassicMode {
  override readonly id = "duel";

  // You alone take on the AI — one human is enough.
  override readonly minHumans = 1;

  private humans: string[] = [];
  private aiDrawsThisTurn = false;
  // Doodle words the AI has already drawn this game, so its turns don't repeat one. Reset per game.
  private usedDoodles = new Set<string>();
  private stopLoop: (() => void) | null = null;

  constructor(
    private requestGuess?: () => Promise<string>,
    private requestDrawing?: (word: string) => Promise<DrawOp[][]>
  ) {
    super();
  }

  override configure(humans: PlayerRef[], ctx: EngineContext): { totalTurns: number; turnsPerRound: number } {
    this.humans = humans.map((h) => h.id);
    this.usedDoodles.clear();
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    // A "round" is one human turn + one AI turn, so the round counter reads 1..3.
    return { totalTurns: TOTAL_TURNS, turnsPerRound: 2 };
  }

  private isAITurn(turnIndex: number): boolean {
    return turnIndex % 2 === 1; // odd turns: the AI draws
  }

  // pickDrawer runs first each turn (engine.startTurn), so we latch whose turn it is here and read
  // it back in pickWord/pickWordChoices/canDraw/onTurnStart.
  override pickDrawer(turnIndex: number): string {
    this.aiDrawsThisTurn = this.isAITurn(turnIndex);
    if (this.aiDrawsThisTurn) return AI_ID;
    return this.humans[Math.floor(turnIndex / 2) % this.humans.length]!;
  }

  override pickWord(ctx: EngineContext): string {
    if (!this.aiDrawsThisTurn) return super.pickWord(ctx); // you draw a normal word
    // The AI can only draw words the doodle library renders — and not one already drawn this game.
    if (this.usedDoodles.size >= DOODLE_WORDS.length) this.usedDoodles.clear();
    const pool = DOODLE_WORDS.filter((w) => !this.usedDoodles.has(w));
    const word = pool[Math.floor(Math.random() * pool.length)]!;
    this.usedDoodles.add(word);
    return word;
  }

  // Only you (the human drawer) get a choosing phase. On AI-draw turns the AI picks its own
  // doodle-renderable word, so skip choosing.
  override pickWordChoices(ctx: EngineContext): string[] | null {
    return this.aiDrawsThisTurn ? null : super.pickWordChoices(ctx);
  }

  override canDraw(playerId: string, ctx: EngineContext): boolean {
    // Only you draw by hand; the AI draws through the draw loop, not a socket.
    return !this.aiDrawsThisTurn && playerId === ctx.currentDrawerId();
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();

    if (this.aiDrawsThisTurn) {
      // 🤖 draws; you guess through normal chat (ClassicMode.onChat scores you + the AI drawer).
      ctx.broadcast({ type: "system", text: "🤖 the machine is drawing. read it and call it 👀" });
      this.stopLoop = startDrawLoop(turn, ctx, { requestDrawing: this.requestDrawing });
    } else {
      // You draw; the AI races to read your canvas. A correct read pays the AI (guesser) AND you
      // (drawer, +25) via the shared acceptGuess path.
      ctx.broadcast({ type: "system", text: "your turn — make the machine guess it 🎨" });
      super.onTurnStart(turn, ctx); // deliver the secret word to you, the drawer
      this.stopLoop = startGuessLoop(turn, ctx, {
        aiId: AI_ID,
        aiName: AI_NAME,
        requestGuess: this.requestGuess,
        onCorrect: () => this.acceptGuess(AI_ID, ctx),
        onUnavailable: () =>
          ctx.broadcast({
            type: "system",
            text: "🤖 the machine can't see the canvas right now — this one's a freebie.",
          }),
      });
    }
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();
    this.stopLoop = null;
    super.onTurnEnd(turn, ctx); // "nobody got it" line when a turn whiffs
  }

  // A human left — drop them from the rotation so a later human turn never indexes an absent player.
  override onPlayerLeave(playerId: string): void {
    this.humans = this.humans.filter((id) => id !== playerId);
  }

  // Final scoreboard reduced to a you-vs-machine verdict. The AI is one id; the human side is the
  // best-scoring human (this mode is built for one human, but reads sensibly if more join).
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
