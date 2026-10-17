export type { EngineDeps } from "./engineContext.ts";
import { createEngineContext, type EngineDeps } from "./engineContext.ts";
import { EngineState } from "./engineBase.ts";
import type { EngineSnapshot } from "./engineState.ts";
import type { RoomSettings } from "@iguess/shared";
import { tierOf } from "@iguess/shared/words";
import type { GameMode, TurnContext, EngineContext } from "./modes/GameMode.ts";

const INTERMISSION_MS = 5_000;
const CHOOSE_MS = 15_000;

export class GameEngine extends EngineState {
  private revision = 0;
  get turnRevision() {
    return this.revision;
  }
  constructor(
    private deps: EngineDeps,
    mode: GameMode,
  ) {
    super(mode);
    this.ctx = createEngineContext(
      () => this.contextState(),
      this.deps,
      () => this.broadcastState(),
      () => this.endTurn(),
    );
  }

  get currentPhase() {
    return this.phase;
  }

  canDraw(playerId: string): boolean {
    if (this.phase === "lobby" || this.phase === "ended") return true;
    return this.phase === "playing" && this.mode.canDraw(playerId, this.ctx);
  }

  handleChat(playerId: string, text: string): boolean {
    if (this.phase !== "playing" || !this.roster.has(playerId)) return false;
    return this.mode.onChat(playerId, text, this.ctx);
  }

  sendStateTo(playerId: string) {
    this.deps.sendToPlayer(playerId, {
      type: "game_state",
      state: this.publicState(),
    });
    if (this.phase === "intermission" && this.word)
      this.deps.sendToPlayer(playerId, {
        type: "turn_end",
        word: this.word,
        scores: this.scoreboard,
      });
    if (this.phase === "playing" && playerId === this.drawerId && this.word) {
      this.deps.sendToPlayer(playerId, { type: "your_word", word: this.word });
    }
    // Word choices are private and must be resent to a returning drawer.
    if (
      this.phase === "choosing" &&
      playerId === this.drawerId &&
      this.pendingChoices
    ) {
      this.deps.sendToPlayer(playerId, {
        type: "word_choices",
        words: this.pendingChoices,
        tiers: this.pendingChoices.map(tierOf),
        canSkip: !this.skipsUsed.has(playerId),
      });
    }
  }

  applySettings(settings: RoomSettings) {
    this.settings = settings;
    this.mode.useSettings?.(settings);
  }

  startGame(humanIds: string[]): boolean {
    // A second start must not create another turn clock.
    if (this.phase !== "lobby" && this.phase !== "ended") return false;
    if (humanIds.length < this.mode.minHumans) {
      this.deps.broadcast({
        type: "system",
        text: `Need at least ${this.mode.minHumans} player${this.mode.minHumans > 1 ? "s" : ""} to start.`,
      });
      return false;
    }

    this.dispose();
    for (const p of this.roster.values()) {
      if (p.isAI) this.deps.removeVirtualPlayer(p.id);
    }

    this.roster.clear();
    for (const id of humanIds) {
      this.roster.set(id, { id, name: this.deps.getName(id) });
    }

    const { totalTurns, turnsPerRound } = this.mode.configure(
      humanIds.map((id) => this.roster.get(id)!),
      this.ctx,
    );

    this.totalTurns = totalTurns;
    this.turnsPerRound = Math.max(1, turnsPerRound ?? totalTurns);
    // Settings must not change a visible deadline mid-turn.
    this.turnMs = this.settings.turnSeconds * 1000;
    this.mode.useSettings?.(this.settings);
    this.turnIndex = 0;
    this.skipsUsed.clear();
    this.scoreboard = Object.fromEntries(
      [...this.roster.keys()].map((id) => [id, 0]),
    );
    this.startTurn();
    return true;
  }

  onPlayerLeave(playerId: string) {
    const wasDrawer = playerId === this.drawerId;
    this.roster.delete(playerId);
    this.guessed.delete(playerId);
    delete this.scoreboard[playerId];
    this.mode.onPlayerLeave?.(playerId, this.ctx);

    if (
      [...this.roster.values()].filter((player) => !player.isAI).length <
      this.mode.minHumans
    ) {
      if (this.phase !== "lobby" && this.phase !== "ended") this.finish();
      return;
    }
    if (!wasDrawer) {
      const guessers = [...this.roster.keys()].filter(
        (id) => id !== this.drawerId,
      );
      if (
        this.phase === "playing" &&
        guessers.every((id) => this.guessed.has(id))
      )
        this.endTurn();
      else this.broadcastState();
      return;
    }

    if (this.phase === "playing") {
      this.deps.broadcast({
        type: "system",
        text: "the drawer left, ending the turn.",
      });
      this.endTurn();
    } else if (this.phase === "choosing") {
      this.clock.cancel("choosing");
      this.deps.broadcast({
        type: "system",
        text: "the drawer left before picking, re-dealing the turn.",
      });
      this.startTurn();
    }
  }

  private startTurn() {
    this.revision++;
    const drawerId = this.mode.pickDrawer(this.turnIndex, this.ctx);
    if (!drawerId) {
      this.finish();
      return;
    }

    const choices = this.mode.pickWordChoices?.(this.ctx) ?? null;
    if (choices && choices.length >= 2) {
      this.startChoosing(drawerId, choices);
      return;
    }

    this.beginTurn(drawerId, this.mode.pickWord(this.ctx));
  }

  private startChoosing(drawerId: string, choices: string[]) {
    this.phase = "choosing";
    this.drawerId = drawerId;
    this.word = null;
    this.turnEndsAt = null;
    this.guessed.clear();
    this.pendingChoices = choices;

    void this.deps.clearCanvas();
    this.deps.sendToPlayer(drawerId, {
      type: "word_choices",
      words: choices,
      tiers: choices.map(tierOf),
      canSkip: !this.skipsUsed.has(drawerId),
    });
    this.broadcastState();

    this.clock.after("choosing", CHOOSE_MS);
  }

  handleChooseWord(playerId: string, word: string) {
    if (this.phase !== "choosing") return;
    if (playerId !== this.drawerId) return;
    if (!this.pendingChoices?.includes(word)) return;
    this.beginTurn(this.drawerId, word);
  }

  handleSkipWord(playerId: string) {
    if (this.phase !== "choosing") return;
    if (playerId !== this.drawerId) return;
    if (this.skipsUsed.has(playerId)) return;
    const fresh = this.mode.pickWordChoices?.(this.ctx);
    if (!fresh || fresh.length < 2) return;
    this.skipsUsed.add(playerId);
    this.startChoosing(playerId, fresh);
  }

  private beginTurn(drawerId: string, word: string) {
    this.clock.cancel("choosing");
    this.pendingChoices = null;

    this.phase = "playing";
    this.drawerId = drawerId;
    this.word = word;
    this.turnEndsAt = Date.now() + this.turnMs;
    this.guessed.clear();
    this.scheduleHints(word);

    void this.deps.clearCanvas();
    this.deps.broadcast({
      type: "system",
      text: `${this.deps.getName(drawerId)} is drawing!`,
    });

    const turn: TurnContext = { turnIndex: this.turnIndex, drawerId, word };
    this.mode.onTurnStart(turn, this.ctx);
    this.broadcastState();

    this.clock.after("turn", this.turnMs);
  }

  // Reveal at most a third of the word, never the complete answer.
  private scheduleHints(word: string) {
    this.revealed.clear();
    const letterIdx = [...word]
      .map((ch, i) => (ch === " " ? -1 : i))
      .filter((i) => i >= 0);
    const maxReveals =
      letterIdx.length <= 1 ? 0 : Math.min(Math.ceil(letterIdx.length / 3), 5);
    for (let i = letterIdx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letterIdx[i], letterIdx[j]] = [letterIdx[j]!, letterIdx[i]!];
    }
    for (let k = 0; k < maxReveals; k++) {
      const at = Math.round((this.turnMs * (k + 1)) / (maxReveals + 1));
      const idx = letterIdx[k]!;
      this.clock.after(`hint:${idx}`, at);
    }
  }

  currentHint(): string {
    return this.computeHint();
  }

  private endTurn() {
    if (this.phase !== "playing") return; // guard against double-end
    this.clock.clear();
    const word = this.word ?? "";
    const turn: TurnContext = {
      turnIndex: this.turnIndex,
      drawerId: this.drawerId ?? "",
      word,
    };

    this.phase = "intermission";
    this.turnEndsAt = null;
    this.deps.broadcast({ type: "turn_end", word, scores: this.scoreboard });
    this.mode.onTurnEnd(turn, this.ctx);
    this.broadcastState();

    this.turnIndex += 1;
    this.clock.after("intermission", INTERMISSION_MS);
  }

  private finish() {
    this.dispose();
    this.phase = "ended";
    this.drawerId = null;
    this.word = null;
    this.turnEndsAt = null;
    this.mode.onGameEnd?.(this.ctx);
    this.broadcastState();
  }

  protected onClock(key: string) {
    if (key === "turn") this.endTurn();
    else if (
      key === "choosing" &&
      this.drawerId &&
      this.pendingChoices?.length
    ) {
      this.beginTurn(
        this.drawerId,
        this.pendingChoices[
          Math.floor(Math.random() * this.pendingChoices.length)
        ]!,
      );
    } else if (key === "intermission") {
      const reached =
        this.settings.scoreTarget > 0 &&
        Math.max(0, ...Object.values(this.scoreboard)) >=
          this.settings.scoreTarget;
      if (reached || this.turnIndex >= this.totalTurns) this.finish();
      else this.startTurn();
    } else if (key.startsWith("hint:") && this.phase === "playing") {
      this.revealed.add(Number(key.slice(5)));
      this.broadcastState();
    }
  }

  dispose() {
    this.revision++;
    this.clock.clear();
    this.mode.dispose?.();
  }
  hasParticipant(id: string) {
    return this.roster.has(id);
  }
  restore(saved: EngineSnapshot) {
    this.dispose();
    this.loadSnapshot(saved);
    for (const player of saved.roster)
      if (player.isAI) this.deps.addVirtualPlayer(player);
    this.clock.restore(saved.deadlines, saved.savedAt);
    this.turnEndsAt =
      this.phase === "playing"
        ? Date.now() +
          Math.max(100, (saved.deadlines.turn ?? saved.savedAt) - saved.savedAt)
        : null;
    if (this.phase === "playing" && this.drawerId && this.word)
      this.mode.onTurnResume?.(
        { turnIndex: this.turnIndex, drawerId: this.drawerId, word: this.word },
        this.ctx,
      );
  }

  private broadcastState() {
    this.deps.broadcast({ type: "game_state", state: this.publicState() });
  }

  private ctx: EngineContext;
}
