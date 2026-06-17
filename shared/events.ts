// The single source of truth for every message crossing the WebSocket.
// Both client and server import from here. Change a shape → TypeScript
// flags every affected call site on both sides. This is the most
// valuable file in the whole project for preventing protocol drift.

// ---- Domain types ----

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
  | { kind: "move"; strokeId: string; points: Point[] }
  | { kind: "end"; strokeId: string }
  | { kind: "clear" };

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
    };

// ---- Server → Client ----

export type ServerMessage =
  | {
      // Sent right after a successful connection: who you are.
      type: "welcome";
      you: PlayerInfo;
      roomId: string;
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
    };

// Narrowing helpers so consumers get exhaustive switch checking.
export type ServerMessageType = ServerMessage["type"];
export type ClientMessageType = ClientMessage["type"];
