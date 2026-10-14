export type WordTier = "easy" | "medium" | "hard";

import type { RoomSettings } from "./settings.ts";
export * from "./settings.ts";

export interface PlayerInfo {
  id: string;
  name: string;
  isHost?: boolean;
  // Just a hint to everyone else. It does NOT stop the host starting without you.
  ready?: boolean;
  // Watching, not playing. Gets a seat when the next game starts, if one has freed up.
  spectator?: boolean;
  // Validated against AVATARS at the room boundary.
  avatar?: string;
}

export const AVATARS = [
  "🐶",
  "🐱",
  "🦊",
  "🐸",
  "🐼",
  "🐧",
  "🦁",
  "🐙",
  "👽",
  "🤠",
  "🧛",
  "🥷",
  "🍕",
  "🌵",
  "⚡",
  "💀",
] as const;

export function isAvatar(s: unknown): s is string {
  return typeof s === "string" && (AVATARS as readonly string[]).includes(s);
}

// Every x and y is 0..1, a fraction of the canvas, never pixels. That way the same drawing
// looks right on a phone and on a laptop.
export interface Point {
  x: number;
  y: number;
}

// Sent as the line is being drawn, not once it is finished, so watchers see it grow.
export type DrawOp =
  // Don't "erase" by painting white. That leaves white pixels behind, and the fill bucket
  // then treats them as their own area to flood.
  | {
      kind: "start";
      strokeId: string;
      color: string;
      width: number;
      point: Point;
      erase?: boolean;
    }
  // `widths` lines up one-to-one with `points`, and is left out for an even stroke.
  | { kind: "move"; strokeId: string; points: Point[]; widths?: number[] }
  | { kind: "end"; strokeId: string }
  // Each client works out the filled pixels itself. Replaying on a different sized canvas
  // gives an almost-identical result, not an exactly identical one.
  | { kind: "fill"; strokeId: string; color: string; point: Point }
  | { kind: "clear" }
  // The client sends this with no id. The server fills the id in and sends it back, so every
  // client can throw away that one stroke instead of being sent the whole canvas again.
  | { kind: "undo"; strokeId?: string };

export type GamePhase =
  "lobby" | "choosing" | "playing" | "intermission" | "ended";

// Whoever makes the room picks the mode. Someone joining later gets that mode, not the one
// they asked for, so show them the mode the server sends back in `welcome`.
export type GameModeName =
  "classic" | "ai" | "ai-drawer" | "team-battle" | "duel";

// Safe to send to everyone. Never put the secret word in here: only its length. The word
// itself goes to the drawer alone, in `your_word`.
export interface PublicGameState {
  phase: GamePhase;
  drawerId: string | null;
  turnIndex: number; // 0-based index of the current turn
  totalTurns: number;
  round: number; // 1-based current round (a round = every drawer drawing once)
  totalRounds: number;
  turnEndsAt: number | null; // epoch ms; clients derive their own countdown
  wordLength: number;
  // What guessers see, like "g _ i t _ r". More letters appear as the clock runs down.
  hint: string;
  scores: Record<string, number>; // playerId -> points
  guessedIds: string[]; // who has guessed correctly this turn
}

export type ClientMessage =
  | {
      type: "chat";
      text: string;
    }
  | {
      type: "draw";
      op: DrawOp;
    }
  | {
      type: "start_game";
    }
  | {
      type: "choose_word";
      word: string;
    }
  | {
      type: "skip_word";
    }
  | {
      // Lobby only, and the server clamps every value.
      type: "set_settings";
      settings: Partial<RoomSettings>;
    }
  | {
      type: "kick";
      playerId: string;
    }
  | {
      // Lobby only.
      type: "ready";
      ready: boolean;
    }
  | {
      type: "react";
      emoji: string;
    }
  | {
      // Never save this to the stroke log. It shows where the pen is right now; someone
      // joining late must not have old pen positions replayed at them as if they were ink.
      type: "cursor";
      point: Point | null;
    };

export type ServerMessage =
  | {
      type: "welcome";
      you: PlayerInfo;
      roomId: string;
      mode: GameModeName;
      settings: RoomSettings;
      reconnectToken: string;
    }
  | {
      type: "settings";
      settings: RoomSettings;
    }
  | {
      type: "cursor";
      playerId: string;
      point: Point | null;
    }
  | {
      // `at` is where across the canvas it floats up, so two at once don't land on top.
      type: "react";
      emoji: string;
      at: number;
    }
  | {
      type: "presence";
      players: PlayerInfo[];
    }
  | {
      // Your own messages come back to you this way too. Don't also show them straight away
      // or you will see them twice.
      type: "chat";
      from: PlayerInfo;
      text: string;
      isGuess?: boolean;
    }
  | {
      type: "system";
      text: string;
    }
  | {
      // Only from OTHER people. You never get your own strokes back, because you already
      // drew them on your own screen the instant you made them.
      type: "draw";
      op: DrawOp;
    }
  | {
      // The whole canvas so far, sent when you join a drawing already in progress.
      type: "canvas_sync";
      ops: DrawOp[];
    }
  | {
      type: "game_state";
      state: PublicGameState;
    }
  | {
      // Sent only to the drawer.
      type: "word_choices";
      words: string[];
      canSkip: boolean;
      // Lines up one-to-one with `words`.
      tiers: WordTier[];
    }
  | {
      // Secret during play. turn_end discloses the answer after the turn.
      type: "your_word";
      word: string;
    }
  | {
      type: "turn_end";
      word: string;
      scores: Record<string, number>;
    };

// Reactions are a fixed allowlist; arbitrary text must not become a canvas overlay.
export const REACTIONS = [
  "😂",
  "🔥",
  "💀",
  "👏",
  "😍",
  "🤔",
  "🙈",
  "🐶",
] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(s: unknown): s is Reaction {
  return typeof s === "string" && (REACTIONS as readonly string[]).includes(s);
}
