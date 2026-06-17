import type {
  ServerMessage,
  PublicGameState,
  GamePhase,
} from "shared";

// A small starter word list. In M6 this moves to a config/file.
const WORDS = [
  "apple", "house", "rocket", "guitar", "elephant", "pizza", "bicycle",
  "umbrella", "snowman", "lighthouse", "cactus", "robot", "octopus",
  "volcano", "hamburger", "butterfly", "castle", "anchor", "ladder", "ghost",
];

const TURN_MS = 60_000; // drawing time per turn
const INTERMISSION_MS = 5_000; // pause between turns to show the reveal

// Dependencies the controller needs from the WS layer. Injecting these keeps
// the game logic free of any direct knowledge of sockets or Redis — which is
// exactly the seam M4 will widen into a formal GameMode interface.
export interface GameDeps {
  broadcast: (msg: ServerMessage) => void;
  sendToPlayer: (playerId: string, msg: ServerMessage) => void;
  clearCanvas: () => void | Promise<void>; // wipe stroke log + tell clients
  getName: (playerId: string) => string;
}

interface InternalState {
  phase: GamePhase;
  order: string[]; // player ids, fixed at game start
  turnIndex: number;
  totalTurns: number;
  drawerId: string | null;
  word: string | null;
  turnEndsAt: number | null;
  guessed: Set<string>;
  scores: Record<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
}

export class GameController {
  private s: InternalState = {
    phase: "lobby",
    order: [],
    turnIndex: 0,
    totalTurns: 0,
    drawerId: null,
    word: null,
    turnEndsAt: null,
    guessed: new Set(),
    scores: {},
    timer: null,
  };

  constructor(private deps: GameDeps) {}

  // ----- Public API used by the WS layer -----

  get phase() {
    return this.s.phase;
  }

  /** Only the current drawer may draw, and only while a turn is live. */
  canDraw(playerId: string): boolean {
    return this.s.phase === "playing" && playerId === this.s.drawerId;
  }

  /** Push the current public state to a single (usually newly joined) player. */
  sendStateTo(playerId: string) {
    this.deps.sendToPlayer(playerId, {
      type: "game_state",
      state: this.publicState(),
    });
  }

  startGame(playerIds: string[]) {
    if (this.s.phase === "playing" || this.s.phase === "intermission") return;
    if (playerIds.length < 2) {
      this.deps.broadcast({
        type: "system",
        text: "Need at least 2 players to start.",
      });
      return;
    }
    this.s.order = [...playerIds];
    this.s.totalTurns = playerIds.length; // one round: everyone draws once
    this.s.turnIndex = 0;
    this.s.scores = Object.fromEntries(playerIds.map((id) => [id, 0]));
    this.startTurn();
  }

  /**
   * Process a chat line. Returns true if it was consumed as a guess (correct
   * or by the drawer / already-guessed player) and should NOT be broadcast
   * as normal chat; false if the WS layer should broadcast it.
   */
  handleChat(playerId: string, text: string): boolean {
    if (this.s.phase !== "playing" || !this.s.word) return false;
    // The drawer's chat is suppressed so they can't type the word.
    if (playerId === this.s.drawerId) return true;
    if (this.s.guessed.has(playerId)) return true; // already done; stay quiet

    const isCorrect = text.trim().toLowerCase() === this.s.word.toLowerCase();
    if (!isCorrect) return false; // normal chat, let it through

    this.recordCorrectGuess(playerId);
    return true;
  }

  /** Called when a player disconnects. */
  onPlayerLeave(playerId: string) {
    if (this.s.phase !== "playing") return;
    if (playerId === this.s.drawerId) {
      this.deps.broadcast({
        type: "system",
        text: "The drawer left — ending the turn.",
      });
      this.endTurn();
    }
  }

  // ----- Internal turn lifecycle -----

  private startTurn() {
    const drawerId = this.s.order[this.s.turnIndex];
    this.s.phase = "playing";
    this.s.drawerId = drawerId;
    this.s.word = WORDS[Math.floor(Math.random() * WORDS.length)];
    this.s.turnEndsAt = Date.now() + TURN_MS;
    this.s.guessed = new Set();

    void this.deps.clearCanvas();

    // Secret word goes ONLY to the drawer.
    this.deps.sendToPlayer(drawerId, { type: "your_word", word: this.s.word });
    this.deps.broadcast({
      type: "system",
      text: `${this.deps.getName(drawerId)} is drawing!`,
    });
    this.broadcastState();

    this.s.timer = setTimeout(() => this.endTurn(), TURN_MS);
  }

  private recordCorrectGuess(playerId: string) {
    this.s.guessed.add(playerId);

    // Guesser points: 50..100 by how much time remains.
    const remaining = Math.max(0, (this.s.turnEndsAt ?? 0) - Date.now());
    const frac = remaining / TURN_MS;
    const guesserPoints = 50 + Math.round(frac * 50);
    this.s.scores[playerId] = (this.s.scores[playerId] ?? 0) + guesserPoints;

    // Drawer earns a flat bonus per correct guesser.
    if (this.s.drawerId) {
      this.s.scores[this.s.drawerId] =
        (this.s.scores[this.s.drawerId] ?? 0) + 25;
    }

    this.deps.broadcast({
      type: "system",
      text: `${this.deps.getName(playerId)} guessed the word! (+${guesserPoints})`,
    });
    this.broadcastState();

    // End early once everyone except the drawer has guessed.
    const guessersNeeded = this.s.order.filter(
      (id) => id !== this.s.drawerId
    ).length;
    if (this.s.guessed.size >= guessersNeeded) this.endTurn();
  }

  private endTurn() {
    if (this.s.timer) {
      clearTimeout(this.s.timer);
      this.s.timer = null;
    }
    const word = this.s.word ?? "";
    this.s.phase = "intermission";
    this.s.turnEndsAt = null;
    this.deps.broadcast({ type: "turn_end", word, scores: this.s.scores });
    this.broadcastState();

    this.s.turnIndex += 1;
    if (this.s.turnIndex >= this.s.totalTurns) {
      // Game over after a short pause so the final reveal is visible.
      setTimeout(() => {
        this.s.phase = "ended";
        this.s.drawerId = null;
        this.s.word = null;
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
    return {
      phase: this.s.phase,
      drawerId: this.s.drawerId,
      turnIndex: this.s.turnIndex,
      totalTurns: this.s.totalTurns,
      turnEndsAt: this.s.turnEndsAt,
      wordLength: this.s.word?.length ?? 0,
      scores: this.s.scores,
      guessedIds: [...this.s.guessed],
    };
  }
}
