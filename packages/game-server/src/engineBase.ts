import { GameClock } from "./gameClock.ts";
import type { EngineSnapshot } from "./engineState.ts";
import {
  DEFAULT_SETTINGS,
  teamWinTarget,
  type GamePhase,
  type PublicGameState,
  type RoomSettings,
  type ServerMessage,
} from "@iguess/shared";
import { tierOf } from "@iguess/shared/words";
import type { GameMode, PlayerRef } from "./modes/GameMode.ts";

/** Serializable game data and clock ownership, independent of room sockets. */
export abstract class EngineState {
  protected phase: GamePhase = "lobby";
  protected turnIndex = 0;
  protected totalTurns = 0;
  protected turnsPerRound = 1;
  protected turnMs = DEFAULT_SETTINGS.turnSeconds * 1000;
  protected settings: RoomSettings = DEFAULT_SETTINGS;
  protected drawerId: string | null = null;
  protected word: string | null = null;
  protected turnEndsAt: number | null = null;
  protected guessed = new Set<string>();
  protected scoreboard: Record<string, number> = {};
  protected roster = new Map<string, PlayerRef>();
  protected revealed = new Set<number>();
  protected pendingChoices: string[] | null = null;
  protected skipsUsed = new Set<string>();
  protected clock = new GameClock((key) => this.onClock(key));

  constructor(protected mode: GameMode) {}
  protected abstract onClock(key: string): void;
  protected contextState() {
    return {
      roster: this.roster,
      scoreboard: this.scoreboard,
      guessed: this.guessed,
      drawerId: this.drawerId,
      word: this.word,
      revealed: this.revealed,
      turnEndsAt: this.turnEndsAt,
      turnMs: this.turnMs,
    };
  }
  protected computeHint(): string {
    if (!this.word) return "";
    return [...this.word]
      .map((ch, i) => (ch === " " ? " " : this.revealed.has(i) ? ch : "_"))
      .join("");
  }

  protected publicState(): PublicGameState {
    const totalRounds = Math.max(
      1,
      Math.ceil(this.totalTurns / this.turnsPerRound),
    );
    const round = Math.min(
      totalRounds,
      Math.floor(this.turnIndex / this.turnsPerRound) + 1,
    );
    return {
      phase: this.phase,
      drawerId: this.drawerId,
      turnIndex: this.turnIndex,
      totalTurns: this.totalTurns,
      round,
      totalRounds,
      turnEndsAt:
        this.phase === "choosing"
          ? this.clock.deadline("choosing")
          : this.turnEndsAt,
      serverNow: Date.now(),
      wordLength: this.word?.length ?? 0,
      hint: this.computeHint(),
      scores: this.scoreboard,
      guessedIds: [...this.guessed],
      teamScore: this.phase === "lobby" ? undefined : this.mode.teamScore?.(),
      ...(this.phase === "ended" && {
        resultPlayers: [...this.roster.values()].map(({ id, name }) => ({
          id,
          name,
        })),
      }),
    };
  }

  protected reachedScoreTarget() {
    const target = this.settings.scoreTarget;
    if (target <= 0) return false;
    const teamScore = this.mode.teamScore?.();
    return teamScore
      ? Math.max(teamScore.human, teamScore.ai) >= teamWinTarget(target)
      : Math.max(0, ...Object.values(this.scoreboard)) >= target;
  }

  protected wordChoicesFor(playerId: string, words: string[]): ServerMessage {
    return {
      type: "word_choices",
      words,
      tiers: words.map(tierOf),
      canSkip: !this.skipsUsed.has(playerId),
    };
  }

  protected *playerMessages(playerId: string): Generator<ServerMessage> {
    yield { type: "game_state", state: this.publicState() };
    if (this.phase === "intermission" && this.word)
      yield { type: "turn_end", word: this.word, scores: this.scoreboard };
    if (playerId !== this.drawerId) return;
    if (this.phase === "playing" && this.word)
      yield { type: "your_word", word: this.word };
    if (this.phase === "choosing" && this.pendingChoices)
      yield this.wordChoicesFor(playerId, this.pendingChoices);
  }

  snapshot(): EngineSnapshot {
    return {
      phase: this.phase,
      turnIndex: this.turnIndex,
      totalTurns: this.totalTurns,
      turnsPerRound: this.turnsPerRound,
      turnMs: this.turnMs,
      settings: this.settings,
      drawerId: this.drawerId,
      word: this.word,
      guessed: [...this.guessed],
      scores: { ...this.scoreboard },
      roster: [...this.roster.values()],
      revealed: [...this.revealed],
      pendingChoices: this.pendingChoices,
      skipsUsed: [...this.skipsUsed],
      deadlines: this.clock.snapshot(),
      savedAt: Date.now(),
      mode: structuredClone(this.mode.snapshot()),
    };
  }
  protected loadSnapshot(saved: EngineSnapshot) {
    this.phase = saved.phase;
    this.turnIndex = saved.turnIndex;
    this.totalTurns = saved.totalTurns;
    this.turnsPerRound = saved.turnsPerRound;
    this.turnMs = saved.turnMs;
    this.settings = saved.settings;
    this.mode.useSettings?.(saved.settings);
    this.drawerId = saved.drawerId;
    this.word = saved.word;
    this.guessed = new Set(saved.guessed);
    this.scoreboard = { ...saved.scores };
    this.roster = new Map(saved.roster.map((p) => [p.id, p]));
    this.revealed = new Set(saved.revealed);
    this.pendingChoices = saved.pendingChoices;
    this.skipsUsed = new Set(saved.skipsUsed);
    this.mode.restore(structuredClone(saved.mode));
  }
}
