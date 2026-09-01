// The single source of truth for every message crossing the WebSocket.
// Both client and server import from here. Change a shape → TypeScript
// flags every affected call site on both sides. This is the most
// valuable file in the whole project for preventing protocol drift.

// ---- Domain types ----

// Word difficulty. Drives both which pool a word comes from and what it pays.
export type WordTier = "easy" | "medium" | "hard";

export interface PlayerInfo {
  id: string;
  name: string;
}

// ---- Drawing ----
// Coordinates are normalized to 0..1 (fraction of canvas width/height) so a
// drawing replays correctly on canvases of any pixel size.
export interface Point {
  x: number;
  y: number;
}

// A single incremental drawing operation. Streaming start/move/end (rather
// than whole completed strokes) lets watchers see a line grow in real time.
export type DrawOp =
  | { kind: "start"; strokeId: string; color: string; width: number; point: Point }
  // `widths` is parallel to `points` when the line tapers (stylus pressure, or speed on a
  // mouse/finger). Omitted entirely for a constant-width stroke, so nothing pays for it.
  | { kind: "move"; strokeId: string; points: Point[]; widths?: number[] }
  | { kind: "end"; strokeId: string }
  | { kind: "clear" }
  // Drawer-only. The client sends it bare; the server pops the stroke and echoes it back
  // naming the stroke, so every client drops that one stroke and repaints from its own log
  // instead of being sent the whole canvas again.
  | { kind: "undo"; strokeId?: string };

// ---- Game state ----

// "choosing": a turn's drawer has been picked and is choosing their word from
// a few options; nobody can draw or guess yet. Followed by "playing".
export type GamePhase = "lobby" | "choosing" | "playing" | "intermission" | "ended";

// The room's game mode. A room's mode is fixed by whoever creates it, so a
// late joiner who requested a different mode still plays (and must be SHOWN)
// the room's actual mode — hence the server echoes it back in `welcome`.
export type GameModeName = "classic" | "ai" | "ai-drawer" | "team-battle" | "duel";

// The view of game state that is safe for EVERY client to see. Note it
// carries only `wordLength`, never the word itself — the secret word is
// delivered separately and only to the drawer (see `your_word`).
export interface PublicGameState {
  phase: GamePhase;
  drawerId: string | null;
  turnIndex: number; // 0-based index of the current turn
  totalTurns: number;
  round: number; // 1-based current round (a round = every drawer drawing once)
  totalRounds: number;
  turnEndsAt: number | null; // epoch ms; clients derive their own countdown
  wordLength: number;
  // Masked word for guessers: one char per letter — the actual letter once
  // revealed, otherwise "_" (spaces stay spaces). Letters reveal progressively
  // as the turn's clock drains. The drawer ignores this (they have `your_word`).
  hint: string;
  scores: Record<string, number>; // playerId -> points
  guessedIds: string[]; // who has guessed correctly this turn
}

// ---- Client → Server ----
// Messages the browser sends. The room + name are supplied at connect
// time via the WebSocket URL query string, so they are not repeated here.

export type ClientMessage =
  | {
      type: "chat";
      text: string;
    }
  | {
      // A drawing operation produced locally by this client.
      type: "draw";
      op: DrawOp;
    }
  | {
      // Request to start (or restart) the game. Allowed from lobby/ended.
      type: "start_game";
    }
  | {
      // The drawer's pick among the offered word choices (sent only while
      // this client is the drawer in the "choosing" phase). Ignored otherwise.
      type: "choose_word";
      word: string;
    }
  | {
      // Throw away all three options and get three new ones. One per player per game,
      // so a drawer stuck with three unrawable words isn't simply stuck.
      type: "skip_word";
    };

// ---- Server → Client ----

export type ServerMessage =
  | {
      // Sent right after a successful connection: who you are, and the room's
      // actual game mode (which may differ from what this client requested).
      type: "welcome";
      you: PlayerInfo;
      roomId: string;
      mode: GameModeName;
    }
  | {
      // Current roster of the room. Re-sent whenever it changes.
      type: "presence";
      players: PlayerInfo[];
    }
  | {
      // A chat line from any player (including yourself, echoed back
      // by the authoritative server rather than rendered optimistically).
      type: "chat";
      from: PlayerInfo;
      text: string;
    }
  | {
      // Server-generated notices ("Alice joined", etc.).
      type: "system";
      text: string;
    }
  | {
      // A drawing op relayed from another client. The drawer does NOT
      // receive their own ops back (they render locally for zero latency).
      type: "draw";
      op: DrawOp;
    }
  | {
      // Full replay of the current canvas, sent once on join so a
      // late-comer catches up to the in-progress drawing.
      type: "canvas_sync";
      ops: DrawOp[];
    }
  | {
      // Authoritative snapshot of public game state. Broadcast on every
      // phase change, guess, or score update.
      type: "game_state";
      state: PublicGameState;
    }
  | {
      // Word options offered to the drawer during the "choosing" phase. Sent
      // ONLY to the drawer; they reply with `choose_word`.
      type: "word_choices";
      words: string[];
      // Whether this drawer still has their one skip. Drives the button's enabled state.
      canSkip: boolean;
      // Parallel to `words`: the tier of each option, so the drawer can see what
      // the harder pick is worth before committing to drawing it.
      tiers: WordTier[];
    }
  | {
      // The secret word — sent ONLY to the current drawer at turn start.
      type: "your_word";
      word: string;
    }
  | {
      // End of a turn: reveal the word and the updated scores.
      type: "turn_end";
      word: string;
      scores: Record<string, number>;
    };

// Narrowing helpers so consumers get exhaustive switch checking.
export type ServerMessageType = ServerMessage["type"];
export type ClientMessageType = ClientMessage["type"];
