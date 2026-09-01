import type { ServerMessage, PublicGameState, GamePhase, DrawOp, RoomSettings } from "@iguess/shared";
import { DEFAULT_SETTINGS } from "@iguess/shared";
import { tierOf } from "@iguess/shared/words";
import type { GameMode, EngineContext, PlayerRef, TurnContext } from "./modes/GameMode.ts";

// Only the starting value. A room can change it, so read this.turnMs for the live clock.
const TURN_MS = DEFAULT_SETTINGS.turnSeconds * 1000;
const INTERMISSION_MS = 5_000;
const CHOOSE_MS = 15_000;

// Handed in by the socket layer. The engine knows these verbs and nothing about sockets.
export interface EngineDeps {
  broadcast: (msg: ServerMessage) => void;
  sendToPlayer: (playerId: string, msg: ServerMessage) => void;
  clearCanvas: () => void | Promise<void>;
  drawOp: (op: DrawOp) => void | Promise<void>;
  getName: (playerId: string) => string;
  // How much is on the canvas. The AI watches this number to know if anything changed.
  canvasOpCount: () => number;
  addVirtualPlayer: (p: PlayerRef) => void;
  removeVirtualPlayer: (id: string) => void;
}

// Owns the clock and the scoreboard. Every actual rule lives in a GameMode instead.
export class GameEngine {
  private phase: GamePhase = "lobby";
  private turnIndex = 0;
  private totalTurns = 0;
  private turnsPerRound = 1;
  private turnMs = TURN_MS;
  private settings: RoomSettings = DEFAULT_SETTINGS;
  private drawerId: string | null = null;
  private word: string | null = null;
  private turnEndsAt: number | null = null;
  private guessed = new Set<string>();
  private scoreboard: Record<string, number> = {};
  private roster = new Map<string, PlayerRef>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revealed = new Set<number>();
  private revealTimers: ReturnType<typeof setTimeout>[] = [];
  private pendingChoices: string[] | null = null;
  private skipsUsed = new Set<string>();
  private chooseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: EngineDeps, private mode: GameMode) {}

  get currentPhase() {
    return this.phase;
  }

  canDraw(playerId: string): boolean {
    // Between games anyone can scribble, so a waiting lobby has something to do.
    if (this.phase === "lobby" || this.phase === "ended") return true;
    return this.mode.canDraw(playerId, this.ctx);
  }

  handleChat(playerId: string, text: string): boolean {
    return this.mode.onChat(playerId, text, this.ctx);
  }

  sendStateTo(playerId: string) {
    this.deps.sendToPlayer(playerId, {
      type: "game_state",
      state: this.publicState(),
    });
    // A drawer who refreshes needs their word again, or they cannot carry on.
    if (
      this.phase === "playing" &&
      playerId === this.drawerId &&
      this.word
    ) {
      this.deps.sendToPlayer(playerId, { type: "your_word", word: this.word });
    }
    // Same if they refresh while choosing, or they sit watching "someone is picking a word"
    // about themselves until the timer picks for them.
    if (this.phase === "choosing" && playerId === this.drawerId && this.pendingChoices) {
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

  startGame(humanIds: string[]) {
    // Block "choosing" as well as "playing". Double-clicking start otherwise runs this twice
    // and leaves an orphaned timer that later fires a turn out of nowhere.
    if (this.phase !== "lobby" && this.phase !== "ended") return;
    if (humanIds.length < this.mode.minHumans) {
      this.deps.broadcast({
        type: "system",
        text: `Need at least ${this.mode.minHumans} player${this.mode.minHumans > 1 ? "s" : ""} to start.`,
      });
      return;
    }

    // Clear out the last game's AI players, or they pile up every time you play again.
    for (const p of this.roster.values()) {
      if (p.isAI) this.deps.removeVirtualPlayer(p.id);
    }

    this.roster.clear();
    for (const id of humanIds) {
      this.roster.set(id, { id, name: this.deps.getName(id) });
    }

    const { totalTurns, turnsPerRound } = this.mode.configure(
      humanIds.map((id) => this.roster.get(id)!),
      this.ctx
    );

    this.totalTurns = totalTurns;
    this.turnsPerRound = Math.max(1, turnsPerRound ?? totalTurns);
    // Lock the clock in at kick-off. Changing it mid-turn would move a deadline people can see.
    this.turnMs = this.settings.turnSeconds * 1000;
    this.mode.useSettings?.(this.settings);
    this.turnIndex = 0;
    this.skipsUsed.clear();
    this.scoreboard = Object.fromEntries(
      [...this.roster.keys()].map((id) => [id, 0])
    );
    this.startTurn();
  }

  onPlayerLeave(playerId: string) {
    const wasDrawer = playerId === this.drawerId;
    // Take them out of both the roster and the drawing rotation, or a later turn hands the
    // pen to someone who left.
    this.roster.delete(playerId);
    this.mode.onPlayerLeave?.(playerId, this.ctx);

    // Nobody left. Let the room clean itself up rather than picking a drawer who isn't here.
    if (this.roster.size === 0 || !wasDrawer) return;

    if (this.phase === "playing") {
      this.deps.broadcast({ type: "system", text: "the drawer left, ending the turn." });
      this.endTurn();
    } else if (this.phase === "choosing") {
      // They left without picking. Cancel the auto-pick and give the turn to someone here.
      if (this.chooseTimer) {
        clearTimeout(this.chooseTimer);
        this.chooseTimer = null;
      }
      this.deps.broadcast({ type: "system", text: "the drawer left before picking, re-dealing the turn." });
      this.startTurn();
    }
  }


  private startTurn() {
    const drawerId = this.mode.pickDrawer(this.turnIndex, this.ctx);

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

    if (this.chooseTimer) clearTimeout(this.chooseTimer); // never leak a prior choose-timer
    this.chooseTimer = setTimeout(() => {
      const pick = choices[Math.floor(Math.random() * choices.length)]!;
      this.beginTurn(drawerId, pick);
    }, CHOOSE_MS);
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
    if (this.chooseTimer) {
      clearTimeout(this.chooseTimer);
      this.chooseTimer = null;
    }
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

    this.timer = setTimeout(() => this.endTurn(), this.turnMs);
  }

  // Give away about a third of the letters, five at most, spread across the clock. Never
  // enough to hand over the whole word.
  private scheduleHints(word: string) {
    this.clearRevealTimers();
    this.revealed.clear();
    const letterIdx = [...word]
      .map((ch, i) => (ch === " " ? -1 : i))
      .filter((i) => i >= 0);
    const maxReveals =
      letterIdx.length <= 1 ? 0 : Math.min(Math.ceil(letterIdx.length / 3), 5);
    // Shuffle, so letters don't always appear left to right.
    for (let i = letterIdx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letterIdx[i], letterIdx[j]] = [letterIdx[j]!, letterIdx[i]!];
    }
    for (let k = 0; k < maxReveals; k++) {
      const at = Math.round((this.turnMs * (k + 1)) / (maxReveals + 1));
      const idx = letterIdx[k]!;
      this.revealTimers.push(
        setTimeout(() => {
          this.revealed.add(idx);
          this.broadcastState();
        }, at)
      );
    }
  }

  private clearRevealTimers() {
    for (const t of this.revealTimers) clearTimeout(t);
    this.revealTimers = [];
  }

  // Safe to hand to the AI: this is what guessers already see, not the answer.
  currentHint(): string {
    return this.computeHint();
  }

  private computeHint(): string {
    if (!this.word) return "";
    return [...this.word]
      .map((ch, i) => (ch === " " ? " " : this.revealed.has(i) ? ch : "_"))
      .join("");
  }

  private endTurn() {
    if (this.phase !== "playing") return; // guard against double-end
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.clearRevealTimers();
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
    // The round count still applies, so a score nobody ever reaches can't run forever.
    const target = this.settings.scoreTarget;
    const reached = target > 0 && Math.max(0, ...Object.values(this.scoreboard)) >= target;
    if (reached || this.turnIndex >= this.totalTurns) {
      setTimeout(() => {
        this.phase = "ended";
        this.drawerId = null;
        this.word = null;
        this.mode.onGameEnd?.(this.ctx);
        this.broadcastState();
      }, INTERMISSION_MS);
    } else {
      setTimeout(() => this.startTurn(), INTERMISSION_MS);
    }
  }

  private broadcastState() {
    this.deps.broadcast({ type: "game_state", state: this.publicState() });
  }

  private publicState(): PublicGameState {
    const totalRounds = Math.max(1, Math.ceil(this.totalTurns / this.turnsPerRound));
    // Clamp it: the turn counter is already one past the end by the time the game finishes.
    const round = Math.min(totalRounds, Math.floor(this.turnIndex / this.turnsPerRound) + 1);
    return {
      phase: this.phase,
      drawerId: this.drawerId,
      turnIndex: this.turnIndex,
      totalTurns: this.totalTurns,
      round,
      totalRounds,
      turnEndsAt: this.turnEndsAt,
      wordLength: this.word?.length ?? 0,
      hint: this.computeHint(),
      scores: this.scoreboard,
      guessedIds: [...this.guessed],
    };
  }

  private ctx: EngineContext = {
    participants: () => [...this.roster.values()],
    getName: (id) => this.roster.get(id)?.name ?? this.deps.getName(id),
    broadcast: (msg) => this.deps.broadcast(msg),
    sendToPlayer: (id, msg) => this.deps.sendToPlayer(id, msg),
    clearCanvas: () => void this.deps.clearCanvas(),
    draw: (op) => void this.deps.drawOp(op),
    awardPoints: (id, pts) => {
      this.scoreboard[id] = (this.scoreboard[id] ?? 0) + pts;
    },
    scores: () => this.scoreboard,
    markGuessed: (id) => this.guessed.add(id),
    guessedIds: () => [...this.guessed],
    hasGuessed: (id) => this.guessed.has(id),
    addParticipant: (p) => {
      this.roster.set(p.id, p);
      if (this.scoreboard[p.id] === undefined) this.scoreboard[p.id] = 0;
      if (p.isAI) this.deps.addVirtualPlayer(p);
    },
    removeParticipant: (id) => {
      const p = this.roster.get(id);
      this.roster.delete(id);
      if (p?.isAI) this.deps.removeVirtualPlayer(id);
    },
    currentDrawerId: () => this.drawerId,
    currentWord: () => this.word,
    hintsRevealed: () => this.revealed.size,
    canvasOpCount: () => this.deps.canvasOpCount(),
    turnFractionRemaining: () => {
      if (!this.turnEndsAt) return 0;
      return Math.max(0, Math.min(1, (this.turnEndsAt - Date.now()) / this.turnMs));
    },
    syncState: () => this.broadcastState(),
    endTurn: () => this.endTurn(),
  };
}
