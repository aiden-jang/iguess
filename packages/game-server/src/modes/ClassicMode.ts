import type { ModeSnapshot } from "./modeState.ts";
import type {
  GameMode,
  EngineContext,
  PlayerRef,
  TurnContext,
} from "./GameMode.ts";
import {
  WORDS,
  TIERS,
  TIER_MULTIPLIER,
  poolFor,
  tierOf,
  type Tier,
} from "@iguess/shared/words";
import { normalizeGuess, isClose } from "../text.ts";
import type { WordMemory } from "../wordMemory.ts";
import { SETTINGS_LIMITS, type RoomSettings } from "@iguess/shared";

const CALL_REWARD = 40;

export { WORDS };

export class ClassicMode implements GameMode {
  readonly id: string = "classic";

  // No AI here, so two humans minimum: one draws, the other guesses.
  readonly minHumans: number = 2;

  protected drawOrder: string[] = [];

  protected rounds: number;

  // Words already used this game, so one game never serves the same word twice.
  private usedWords = new Set<string>();
  private memory?: WordMemory;
  private packs: string[] = [];
  private customWords: string[] = [];
  protected bets = new Map<string, string>();

  constructor(rounds = 3) {
    this.rounds = Math.max(1, rounds);
  }

  useWordMemory(memory: WordMemory): void {
    this.memory = memory;
  }

  useSettings(settings: RoomSettings): void {
    // Chasing a score means "as long as it takes", so run to the round cap and let the engine
    // stop it when somebody gets there.
    this.rounds =
      settings.scoreTarget > 0
        ? SETTINGS_LIMITS.rounds.max
        : Math.max(1, settings.rounds);
    this.packs = settings.packs;
    this.customWords = settings.customWords;
  }

  configure(
    humans: PlayerRef[],
    _ctx: EngineContext,
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
    // Out of the rotation, or a later turn picks someone who left and nothing gets drawn.
    this.bets.delete(playerId);
    this.drawOrder = this.drawOrder.filter((id) => id !== playerId);
  }

  pickWord(_ctx: EngineContext): string {
    const word = this.freshWord();
    this.usedWords.add(word);
    return word;
  }

  // One word from each difficulty, so picking is a bet: harder pays more, if you can draw it.
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

  // Does NOT mark the word as used. The caller decides that.
  private freshWord(tier?: Tier): string {
    // A room's own words go in the easy slot. Nothing outside the built-in list has a
    // difficulty, so there is nothing else to score them by.
    const base = tier ? poolFor(tier, this.packs) : WORDS;
    const pool =
      tier === "easy" && this.customWords.length
        ? [...this.customWords, ...base]
        : base;
    // Check the pool we are actually drawing from. Easy can run dry long before the full
    // used-list looks anywhere near finished.
    if (pool.every((w) => this.usedWords.has(w))) this.usedWords.clear();
    const avoid = new Set([
      ...this.usedWords,
      ...(this.memory?.avoidFor(pool) ?? []),
    ]);
    const roll = () => pool[Math.floor(Math.random() * pool.length)]!;
    let word = roll();
    for (let i = 0; i < 20 && avoid.has(word); i++) word = roll();
    if (avoid.has(word)) {
      word =
        pool.find((w) => !avoid.has(w)) ??
        pool.find((w) => !this.usedWords.has(w)) ??
        word;
    }
    this.memory?.remember(word);
    return word;
  }

  snapshot(): ModeSnapshot {
    return {
      drawOrder: [...this.drawOrder],
      usedWords: [...this.usedWords],
      bets: [...this.bets],
    };
  }
  restore(saved: ModeSnapshot) {
    this.drawOrder = [...saved.drawOrder];
    this.usedWords = new Set(saved.usedWords);
    this.bets = new Map(saved.bets);
  }
  onTurnResume(turn: TurnContext, ctx: EngineContext) {
    ctx.sendToPlayer(turn.drawerId, { type: "your_word", word: turn.word });
  }

  onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    this.bets.clear();
    ctx.sendToPlayer(turn.drawerId, { type: "your_word", word: turn.word });
  }

  // "?dog" bets on what the machine will say next. It is not a guess at the word.
  // Any mode that writes its own onChat must call this FIRST: normalizeGuess throws the "?"
  // away, so an unhandled call counts as a plain answer and wins the round.
  protected takeCall(
    playerId: string,
    text: string,
    ctx: EngineContext,
  ): boolean {
    if (!text.trimStart().startsWith("?")) return false;
    const call = normalizeGuess(text.trimStart().slice(1));
    if (call) {
      this.bets.set(playerId, call);
      ctx.sendToPlayer(playerId, {
        type: "system",
        text: `📞 called it: the machine says "${call}"`,
      });
    }
    return true; // consumed either way: a bare "?" is not chat worth broadcasting
  }

  // Every call is used up here, right or wrong.
  protected settleBets(said: string, ctx: EngineContext): void {
    const heard = normalizeGuess(said);
    for (const [playerId, call] of this.bets) {
      if (call !== heard) continue;
      ctx.awardPoints(playerId, CALL_REWARD);
      ctx.broadcast({
        type: "system",
        text: `📞 ${ctx.getName(playerId)} called it: the machine said "${heard}" (+${CALL_REWARD})`,
      });
    }
    this.bets.clear();
    ctx.syncState();
  }

  onChat(playerId: string, text: string, ctx: EngineContext): boolean {
    const word = ctx.currentWord();
    if (!word) return false; // not in a live turn → normal chat
    if (this.takeCall(playerId, text, ctx)) return true;
    if (playerId === ctx.currentDrawerId()) return true; // hide drawer chat
    if (ctx.hasGuessed(playerId)) return true; // already done → stay quiet
    // Tidy up both sides, so capitals, accents and stray spaces never block a right answer.
    const guess = normalizeGuess(text);
    const target = normalizeGuess(word);
    if (guess !== target) {
      // Tell only them they were close. The wrong guess still goes to the room as normal.
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
    // Nobody got it. The word is already public in turn_end, so saying it here leaks nothing.
    if (ctx.guessedIds().length === 0) {
      ctx.broadcast({
        type: "system",
        text: `oof, nobody got "${turn.word}" 💀`,
      });
    }
  }

  onGameEnd(ctx: EngineContext): void {
    ctx.broadcast({ type: "system", text: winnerLine(ctx) });
  }

  protected acceptGuess(playerId: string, ctx: EngineContext): void {
    const frac = ctx.turnFractionRemaining();
    const mult = TIER_MULTIPLIER[tierOf(ctx.currentWord() ?? "")];
    const base = (50 + frac * 50) * mult; // 50..100 by speed, then by difficulty
    // Hints arrive free on a timer, so the only way to make them cost anything is to pay
    // people who didn't need them.
    const unaided = ctx.hintsRevealed() === 0;
    const points = Math.round(
      base * comebackBonus(playerId, ctx) * (unaided ? 1.2 : 1),
    );
    ctx.awardPoints(playerId, points);
    ctx.markGuessed(playerId);

    // Pay the drawer by how fast this person read it, so a clear sketch beats a scribble.
    const drawerId = ctx.currentDrawerId();
    if (drawerId)
      ctx.awardPoints(drawerId, Math.round((10 + frac * 40) * mult));

    ctx.broadcast({
      type: "system",
      text:
        `${ctx.getName(playerId)} guessed the word! (+${points})` +
        (unaided ? " no hints 🧠" : ""),
    });
    ctx.syncState();
    this.maybeEndTurn(ctx);
  }

  protected maybeEndTurn(ctx: EngineContext): void {
    const drawerId = ctx.currentDrawerId();
    const expected = ctx.participants().filter((p) => p.id !== drawerId).length;
    if (ctx.guessedIds().length >= expected) ctx.endTurn();
  }
}

// Short games are decided early: fall behind in round one and the rest is a formality. Whoever
// is behind earns more per guess, capped so it can never beat just playing well.
function comebackBonus(playerId: string, ctx: EngineContext): number {
  const scores = ctx.scores();
  const leader = Math.max(0, ...Object.values(scores));
  if (leader <= 0) return 1;
  const behind = 1 - (scores[playerId] ?? 0) / leader;
  if (behind < 0.4) return 1;
  return 1 + Math.min(0.35, (behind - 0.4) * 0.6);
}

// Handles a tie, and a game where literally nobody scored.
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
