import type { RelayClientMessage, RelayServerMessage } from "./relay.ts";
import type { RoomSettings } from "./settings.ts";
import type { GalleryMessage } from "./gallery.ts";
import type { PublicGameState } from "./gameState.ts";
export type { GamePhase, PublicGameState, TeamScore } from "./gameState.ts";
export type WordTier = "easy" | "medium" | "hard";
export * from "./settings.ts";

export interface PlayerInfo {
  id: string;
  name: string;
  isHost?: boolean;
  ready?: boolean;
  connected?: boolean;
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

// Whoever makes the room picks the mode. Someone joining later gets that mode, not the one
// they asked for, so show them the mode the server sends back in `welcome`.
export type GameModeName =
  "classic" | "ai" | "ai-drawer" | "team-battle" | "duel" | "relay";

export type ClientMessage =
  | RelayClientMessage
  | {
      type: "chat";
      text: string;
      id?: string;
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
      settings: Partial<RoomSettings> & { togglePack?: string };
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
      type: "cursor";
      point: Point | null;
    };

export type ServerMessage =
  | RelayServerMessage
  | GalleryMessage
  | { type: "chat_ack"; id: string }
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

export { REACTIONS, REACTION_OPTIONS, isReaction } from "./reactions.ts";
export type { Reaction } from "./reactions.ts";
