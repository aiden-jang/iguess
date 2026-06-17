// The single source of truth for every message crossing the WebSocket.
// Both client and server import from here. Change a shape → TypeScript
// flags every affected call site on both sides. This is the most
// valuable file in the whole project for preventing protocol drift.

// ---- Domain types ----

export interface PlayerInfo {
  id: string;
  name: string;
}

// ---- Client → Server ----
// Messages the browser sends. The room + name are supplied at connect
// time via the WebSocket URL query string, so they are not repeated here.

export type ClientMessage = {
  type: "chat";
  text: string;
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
    };

// Narrowing helpers so consumers get exhaustive switch checking.
export type ServerMessageType = ServerMessage["type"];
export type ClientMessageType = ClientMessage["type"];
