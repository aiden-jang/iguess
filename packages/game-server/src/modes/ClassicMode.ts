import type { GameMode, EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { WORDS, randomWord } from "../words.ts";

export { WORDS }; // re-export so AIGuesserMode's fallback can reuse it

// Classic skribbl-style mode: humans take turns drawing, everyone else
// guesses. Designed as the base class — AIGuesserMode extends it to add a
// virtual AI guesser without touching the engine.
export class ClassicMode implements GameMode {
  readonly id: string = "classic";

  // Ordered list of player ids eligible to draw. Captured at configure.
  protected drawOrder: string[] = [];

  configure(humans: PlayerRef[], _ctx: EngineContext): { totalTurns: number } {
    this.drawOrder = humans.map((h) => h.id);
    return { totalTurns: this.drawOrder.length }; // one round
  }

  pickDrawer(turnIndex: number, _ctx: EngineContext): string {
    return this.drawOrder[turnIndex % this.drawOrder.length];
  }

  pickWord(_ctx: EngineContext): string {
    return randomWord();
  }

  onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    // Secret word goes ONLY to the drawer.
    ctx.sendToPlayer(turn.drawerId, { type: "your_word", word: turn.word });
  }

  onChat(playerId: string, text: string, ctx: EngineContext): boolean {
    const word = ctx.currentWord();
    if (!word) return false; // not in a live turn → normal chat
    if (playerId === ctx.currentDrawerId()) return true; // hide drawer chat
    if (ctx.hasGuessed(playerId)) return true; // already done → stay quiet
    if (text.trim().toLowerCase() !== word.toLowerCase()) return false;
    this.acceptGuess(playerId, ctx);
    return true;
  }

  canDraw(playerId: string, ctx: EngineContext): boolean {
    return playerId === ctx.currentDrawerId();
  }

  onTurnEnd(_turn: TurnContext, _ctx: EngineContext): void {
    // nothing extra in classic mode
  }

  // ----- Shared scoring helpers (reused by subclasses) -----

  /** Award a correct guesser + the drawer, announce it, maybe end the turn. */
  protected acceptGuess(playerId: string, ctx: EngineContext): void {
    const frac = ctx.turnFractionRemaining();
    const points = 50 + Math.round(frac * 50); // 50..100 by speed
    ctx.awardPoints(playerId, points);
    ctx.markGuessed(playerId);

    const drawerId = ctx.currentDrawerId();
    if (drawerId) ctx.awardPoints(drawerId, 25); // drawer bonus per guesser

    ctx.broadcast({
      type: "system",
      text: `${ctx.getName(playerId)} guessed the word! (+${points})`,
    });
    ctx.syncState();
    this.maybeEndTurn(ctx);
  }

  /** End the turn once every non-drawer participant has guessed. */
  protected maybeEndTurn(ctx: EngineContext): void {
    const drawerId = ctx.currentDrawerId();
    const expected = ctx
      .participants()
      .filter((p) => p.id !== drawerId).length;
    if (ctx.guessedIds().length >= expected) ctx.endTurn();
  }
}
