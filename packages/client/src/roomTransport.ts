import type { ClientMessage, ServerMessage } from "@iguess/shared";
import {
  CLOSE_LEFT_ROOM,
  connectionProtocols,
} from "@iguess/shared/reconnectProtocol";
import { parseServerMessage } from "@iguess/shared/serverProtocol";
import { writeStored } from "./storage";
import {
  reconnectCredential,
  saveReconnectCredential,
} from "./reconnectCredential";

interface TransportOptions {
  room: string;
  name: string;
  mode: string;
  avatar: string;
  create?: boolean;
  connected: (value: boolean) => void;
  fatal: (message: string) => void;
  message: (message: ServerMessage) => void;
}
const FINAL_CLOSES: Record<number, string> = {
  4009: "This room is full. Try another room name.",
  4010: "The host removed you from this room.",
  4012: "This room expired after a day without activity.",
  4013: "That code already belongs to another room. Go back and generate a new code.",
  4011: "This room was reopened in another tab. Return to join to play here again.",
};

/** Owns one connection and its retries. Room state is replaced by the server on reconnect. */
export function roomTransport(options: TransportOptions) {
  let alive = true;
  let attempt = 0;
  let welcomed = false;
  let relayDeadline = 0;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (!alive) return;
    options.connected(false);
    if (retry) clearTimeout(retry);
    if (attempt >= 5 && Date.now() >= relayDeadline) {
      alive = false;
      options.fatal(
        "We couldn’t reach the room. Check your connection and try joining again.",
      );
      return;
    }
    retry = setTimeout(
      () => {
        retry = null;
        if (alive) connect();
      },
      Math.min(5000, 500 * ++attempt),
    );
  };
  const connect = () => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({
      name: options.name,
      mode: options.mode,
      avatar: options.avatar,
    });
    const creating = options.create && !welcomed;
    if (creating) query.set("create", "1");
    let ws: WebSocket;
    try {
      ws = new WebSocket(
        `${protocol}://${location.host}/rooms/${encodeURIComponent(options.room)}/ws?${query}`,
        connectionProtocols(creating ? "" : reconnectCredential(options.room)),
      );
    } catch {
      schedule();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (!alive || socket !== ws) return;
      options.connected(true);
    };
    ws.onclose = (event) => {
      if (!alive || socket !== ws) return;
      options.connected(false);
      if (FINAL_CLOSES[event.code]) {
        alive = false;
        options.fatal(FINAL_CLOSES[event.code]!);
        return;
      }
      schedule();
    };
    ws.onmessage = (event) => {
      if (!alive || socket !== ws || typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "relay_state") {
        const state = message.state;
        relayDeadline =
          state.phase === "active" && state.assignment.kind !== "watch"
            ? Date.now() + (state.endsAt - (state.serverNow ?? Date.now()))
            : 0;
      }
      if (message.type === "welcome") {
        welcomed = true;
        attempt = 0;
        saveReconnectCredential(options.room, message.reconnectToken);
        writeStored("iguess_room", message.roomId);
        writeStored("iguess_room_mode", message.mode);
      }
      options.message(message);
    };
  };
  const retryNow = () => {
    if (!alive || document.visibilityState !== "visible") return;
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    )
      return;
    if (retry) clearTimeout(retry);
    attempt = 0;
    connect();
  };
  document.addEventListener("visibilitychange", retryNow);
  window.addEventListener("online", retryNow);
  // Effect cleanup can precede this microtask during React’s development mount check.
  queueMicrotask(() => {
    if (alive) connect();
  });
  return {
    send(message: ClientMessage): boolean {
      if (!alive || socket?.readyState !== WebSocket.OPEN) return false;
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch {
        options.connected(false);
        socket.close();
        return false;
      }
    },
    backlog: () => socket?.bufferedAmount ?? 0,
    leave: () => socket?.close(CLOSE_LEFT_ROOM),
    dispose() {
      alive = false;
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", retryNow);
      window.removeEventListener("online", retryNow);
      socket?.close();
    },
  };
}
