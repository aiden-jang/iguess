import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ClientMessage,
  ServerMessage,
  PlayerInfo,
  DrawOp,
} from "shared";

// Draw ops bypass React state on purpose: re-rendering a component on every
// pointer-move would be wasteful. Instead the canvas registers a listener and
// paints imperatively. `null` op signals a full reset before a canvas_sync.
type DrawListener = (op: DrawOp | { kind: "reset" }) => void;

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:8080";

export interface ChatLine {
  kind: "chat" | "system";
  from?: PlayerInfo;
  text: string;
}

// Owns the single persistent WebSocket connection and the derived view
// state (who you are, the roster, the message log). The component just
// renders this and calls `sendChat`.
export function useGameSocket(room: string, name: string) {
  const [connected, setConnected] = useState(false);
  const [you, setYou] = useState<PlayerInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [log, setLog] = useState<ChatLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const drawListeners = useRef<Set<DrawListener>>(new Set());

  const emitDraw = (op: DrawOp | { kind: "reset" }) => {
    for (const l of drawListeners.current) l(op);
  };

  useEffect(() => {
    if (!room || !name) return;
    const url = `${SERVER_URL}/?room=${encodeURIComponent(
      room
    )}&name=${encodeURIComponent(name)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data);
      switch (msg.type) {
        case "welcome":
          setYou(msg.you);
          break;
        case "presence":
          setPlayers(msg.players);
          break;
        case "chat":
          setLog((l) => [...l, { kind: "chat", from: msg.from, text: msg.text }]);
          break;
        case "system":
          setLog((l) => [...l, { kind: "system", text: msg.text }]);
          break;
        case "draw":
          emitDraw(msg.op);
          break;
        case "canvas_sync":
          emitDraw({ kind: "reset" });
          for (const op of msg.ops) emitDraw(op);
          break;
      }
    };

    return () => ws.close();
  }, [room, name]);

  const sendChat = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: "chat", text };
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendDraw = useCallback((op: DrawOp) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: "draw", op };
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Canvas subscribes here to receive remote ops; returns an unsubscribe.
  const subscribeDraw = useCallback((fn: DrawListener) => {
    drawListeners.current.add(fn);
    return () => drawListeners.current.delete(fn);
  }, []);

  // Clear: tell the server (it wipes the log + relays) AND reset our own
  // canvas, since the server never echoes our own ops back to us.
  const clearBoard = useCallback(() => {
    sendDraw({ kind: "clear" });
    emitDraw({ kind: "reset" });
  }, [sendDraw]);

  return {
    connected,
    you,
    players,
    log,
    sendChat,
    sendDraw,
    subscribeDraw,
    clearBoard,
  };
}
