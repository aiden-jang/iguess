import type { ClientMessage, ServerMessage } from "@iguess/shared";
import { connectionProtocols } from "@iguess/shared/reconnectProtocol";
import { parseServerMessage } from "@iguess/shared/serverProtocol";
import {
  reconnectCredential,
  saveReconnectCredential,
} from "./reconnectCredential";

interface TransportOptions {
  room: string;
  name: string;
  mode: string;
  avatar: string;
  connected: (value: boolean) => void;
  fatal: (message: string) => void;
  message: (message: ServerMessage) => void;
}
const FINAL_CLOSES: Record<number, string> = {
  4009: "This room is full. Try another room name.",
  4010: "The host removed you from this room.",
  4011: "This room was reopened in another tab. Return to join to play here again.",
};

/** Owns one connection and its retries. Room state is replaced by the server on reconnect. */
export function roomTransport(options: TransportOptions) {
  let alive = true;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const connect = () => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({
      name: options.name,
      mode: options.mode,
      avatar: options.avatar,
    });
    const ws = new WebSocket(
      `${protocol}://${location.host}/rooms/${encodeURIComponent(options.room)}/ws?${query}`,
      connectionProtocols(reconnectCredential(options.room)),
    );
    socket = ws;
    ws.onopen = () => {
      if (!alive || socket !== ws) return;
      attempt = 0;
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
      retry = setTimeout(connect, Math.min(5000, 500 * ++attempt));
    };
    ws.onmessage = (event) => {
      if (!alive || socket !== ws || typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "welcome")
        saveReconnectCredential(options.room, message.reconnectToken);
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
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    backlog: () => socket?.bufferedAmount ?? 0,
    dispose() {
      alive = false;
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", retryNow);
      window.removeEventListener("online", retryNow);
      socket?.close();
    },
  };
}
