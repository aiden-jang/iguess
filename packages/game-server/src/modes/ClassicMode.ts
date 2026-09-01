import type { GameMode, EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { WORDS, TIERS, TIER_MULTIPLIER, poolFor, tierOf, type Tier } from "@iguess/shared/words";
import { normalizeGuess, isClose } from "../text.ts";
import type { WordMemory } from "../wordMemory.ts";
import type { RoomSettings } from "@iguess/shared";

export { WORDS }; // re-export so AIGuesserMode's fallback can reuse it

// Classic skribbl-style mode: humans take turns drawing, everyone else
// guesses. Designed as the base class — AIGuesserMode extends it to add a
// virtual AI guesser without touching the engine.
export class ClassicMode implements GameMode {
  readonly id: string = "classic";

  // Classic has no AI, so it needs at least two humans: one draws, the rest guess.
  readonly minHumans: number = 2;

  // Ordered list of player ids eligible to draw. Captured at configure.
  protected drawOrder: string[] = [];

  // How many times the draw order repeats — each player draws once per round.
  // skribbl's default is 3; pickDrawer already wraps via modulo so rotation
  // continues correctly across rounds.
  protected rounds: number;

  // Words already used this game — so the 3 rounds don't recycle the same
  // prompt. Reset each game in configure().
  private usedWords = new Set<string>();
  private memory?: WordMemory;
  private packs: string[] = [];

  constructor(rounds = 3) {
    this.rounds = Math.max(1, rounds);
  }

  useWordMemory(memory: WordMemory): void {
    this.memory = memory;
  }

  useSettings(settings: RoomSettings): void {
    this.rounds = Math.max(1, settings.rounds);
    this.packs = settings.packs;
  }

  configure(
    humans: PlayerRef[],
    _ctx: EngineContext
  ): { totalTurns: number; turnsPerRound?: number } {
    this.drawOrder = humans.map((h) => h.id);
    this.usedWords.clear();
    return {
      totalTurns: this.drawOrder.length * this.rounds,
      turnsPerRound: this.drawOrder.length,
    };
  }

  pickDrawer(turnIndex: number, _ctx: EngineContext): string {
    return this.drawOrder[turnIndex % this.drawOrder.length];
  }

  onPlayerLeave(playerId: string, _ctx: EngineContext): void {
    // Drop them from the rotation so pickDrawer never selects an absent player (a blank dead turn).
    this.drawOrder = this.drawOrder.filter((id) => id !== playerId);
  }

  pickWord(_ctx: EngineContext): string {
    const word = this.freshWord();
    this.usedWords.add(word);
    return word;
  }

  // One word per tier, so choosing is a real bet: harder words are worth more
  // (see TIER_MULTIPLIER) but you have to be able to draw them.
  pickWordChoices(_ctx: EngineContext): string[] | null {
    const choices: string[] = [];
    for (const tier of TIERS) {
      const word = this.freshWord(tier);
      if (choices.includes(word)) continue;
      choices.push(word);
      this.usedWords.add(word);
    }
    return choices;
  }

  // Pick one word not yet used this game (without marking it used — callers
  // decide what to reserve). Resets the pool if exhausted so we never dead-end.
  private freshWord(tier?: Tier): string {
    const pool = tier ? poolFor(tier, this.packs) : WORDS;
    // Reset against the pool actually being drawn from: with tiers, easy can run dry
    // while the combined used-set is still far from the full list.
    if (pool.every((w) => this.usedWords.has(w))) this.usedWords.clear();
    const avoid = new Set([...this.usedWords, ...(this.memory?.avoidFor(pool) ?? [])]);
    const roll = () => pool[Math.floor(Math.random() * pool.length)]!;
    let word = roll();
    for (let i = 0; i < 20 && avoid.has(word); i++) word = roll();
    if (avoid.has(word)) {
      word = pool.find((w) => !avoid.has(w)) ?? pool.find((w) => !this.usedWords.has(w)) ?? word;
    }
    this.memory?.remember(word);
    return word;
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
    // Normalize both sides so punctuation, accents, casing and stray spaces
    // don't stand between a guesser and an obviously-correct answer.
    const guess = normalizeGuess(text);
    const target = normalizeGuess(word);
    if (guess !== target) {
      // A near-miss? Privately nudge just this guesser so they lean in —
      // the wrong guess still passes through to the public chat as normal.
      if (isClose(guess, target)) {
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

  onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    // A whiff: the turn ran out with no correct guesses. The word is already
    // revealed in the turn_end message, so naming it here leaks nothing.
    if (ctx.guessedIds().length === 0) {
      ctx.broadcast({ type: "system", text: `oof, nobody got "${turn.word}" 💀` });
    }
  }

  onGameEnd(ctx: EngineContext): void {
    ctx.broadcast({ type: "system", text: winnerLine(ctx) });
  }

  // ----- Shared scoring helpers (reused by subclasses) -----

  /** Award a correct guesser + the drawer, announce it, maybe end the turn. */
  protected acceptGuess(playerId: string, ctx: EngineContext): void {
    const frac = ctx.turnFractionRemaining();
    const mult = TIER_MULTIPLIER[tierOf(ctx.currentWord() ?? "")];
    const base = (50 + frac * 50) * mult; // 50..100 by speed, then by difficulty
    // Letters are handed out free on a timer, so the only way to make them cost anything is
    // to pay for not needing them: read the drawing before the first one lands and earn more.
    const unaided = ctx.hintsRevealed() === 0;
    const points = Math.round(base * comebackBonus(playerId, ctx) * (unaided ? 1.2 : 1));
    ctx.awardPoints(playerId, points);
    ctx.markGuessed(playerId);

    // The drawer is paid by how fast this guesser got it, not a flat rate. A scribble that
    // someone eventually decodes used to pay the same as a sketch people read instantly.
    const drawerId = ctx.currentDrawerId();
    if (drawerId) ctx.awardPoints(drawerId, Math.round((10 + frac * 40) * mult));

    ctx.broadcast({
      type: "system",
      text:
        `${ctx.getName(playerId)} guessed the word! (+${points})` +
        (unaided ? " no hints 🧠" : ""),
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

// The end-of-game announcement: who won and with how many points. Handles a
// Three-round games are decided early: fall behind in round one and the rest is a formality.
// A trailing player earns more per guess, capped so it can never out-run playing well.
function comebackBonus(playerId: string, ctx: EngineContext): number {
  const scores = ctx.scores();
  const leader = Math.max(0, ...Object.values(scores));
  if (leader <= 0) return 1;
  const behind = 1 - (scores[playerId] ?? 0) / leader;
  if (behind < 0.4) return 1;
  return 1 + Math.min(0.35, (behind - 0.4) * 0.6);
}

// tie (multiple players sharing the top score) and the degenerate all-zero
// game gracefully. Exported for testing.
export function winnerLine(ctx: EngineContext): string {
  const scores = ctx.scores();
  const ids = ctx.participants().map((p) => p.id);
  if (ids.length === 0) return "🏁 game over!";
  const top = Math.max(...ids.map((id) => scores[id] ?? 0));
  if (top <= 0) return "🏁 game over, nobody scored. brutal.";
  const winners = ids.filter((id) => (scores[id] ?? 0) === top);
  const names = winners.map((id) => ctx.getName(id));
  if (names.length === 1) return `🏆 ${names[0]} wins with ${top} points!`;
  const joined =
    names.length === 2
      ? names.join(" & ")
      : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return `🏆 it's a tie! ${joined} share the W with ${top} points each.`;
}
