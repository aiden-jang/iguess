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

  // How many times the draw order repeats — each player draws once per round.
  // skribbl's default is 3; pickDrawer already wraps via modulo so rotation
  // continues correctly across rounds.
  protected rounds: number;

  constructor(rounds = 3) {
    this.rounds = Math.max(1, rounds);
  }

  configure(humans: PlayerRef[], _ctx: EngineContext): { totalTurns: number } {
    this.drawOrder = humans.map((h) => h.id);
    return { totalTurns: this.drawOrder.length * this.rounds };
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
    const guess = text.trim().toLowerCase();
    if (guess !== word.toLowerCase()) {
      // A near-miss? Privately nudge just this guesser so they lean in —
      // the wrong guess still passes through to the public chat as normal.
      if (isClose(guess, word.toLowerCase())) {
        ctx.sendToPlayer(playerId, { type: "system", text: "🔥 so close!" });
      }
      return false;
    }
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

// A guess is "close" when it's within one edit (insert/delete/substitute) of
// the answer — a single typo or missing letter. Gated to words of length >= 4
// so short words ("cat"/"hat") don't trigger a nudge on every near-miss, and
// the guess itself must have some length so empty/spam chat is ignored.
export function isClose(guess: string, word: string): boolean {
  if (guess === word) return false; // exact is a win, not "close"
  if (word.length < 4 || guess.length < 2) return false;
  return levenshtein(guess, word) === 1;
}

// Standard iterative Levenshtein edit distance (single-row, O(n) space).
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
