import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ClientMessage,
  ServerMessage,
  PlayerInfo,
  DrawOp,
  PublicGameState,
  GameModeName,
  WordTier,
} from "@iguess/shared";

export type WordChoice = { word: string; tier: WordTier };

// Draw ops bypass React state on purpose: re-rendering a component on every
// pointer-move would be wasteful. Instead the canvas registers a listener and
// paints imperatively. `null` op signals a full reset before a canvas_sync.
type DrawListener = (op: DrawOp | { kind: "reset" }) => void;

// The game server (the room's Durable Object) is same-origin: the Worker serves this SPA and
// the /rooms/:id/ws endpoint on one host. In dev, Vite proxies /rooms to the local wrangler dev.
function socketUrl(room: string, name: string, mode: string, pid: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams({ name, mode, pid });
  return `${proto}://${window.location.host}/rooms/${encodeURIComponent(room)}/ws?${q.toString()}`;
}

const PID_KEY = "iguess_pid";

function newPid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

/**
 * The id that says "this is the same player".
 *
 * The server keys its whole reconnect path on this: a returning pid inside the 8s grace window is
 * silent and keeps your score, your place in the draw order, and your turn if you were the one
 * drawing. It used to be generated inside the socket effect, which made it stable across a dropped
 * socket but new on every mount — so the single most common way anyone reconnects, hitting refresh,
 * was read as a stranger arriving. The chat said "Aiden joined" and "Aiden left" about one person
 * pressing F5, and their score went with it.
 *
 * sessionStorage, not localStorage: it survives a reload, which is the case that was broken, and
 * stays per-tab, so two tabs on one device remain two players the way they do today. Private mode
 * throwing here just puts us back on the old per-mount behaviour, which is no worse than before.
 */
function stablePid(): string {
  try {
    const existing = sessionStorage.getItem(PID_KEY);
    if (existing) return existing;
    const fresh = newPid();
    sessionStorage.setItem(PID_KEY, fresh);
    return fresh;
  } catch {
    return newPid();
  }
}

export interface ChatLine {
  kind: "chat" | "system";
  from?: PlayerInfo;
  text: string;
}

// Server WS close code for a full room (see game-server/src/limits.ts). Terminal: reconnecting
// won't un-fill the room, so the client stops retrying and surfaces the reason instead.
const CLOSE_ROOM_FULL = 4009;

// Owns the single persistent WebSocket connection and the derived view
// state (who you are, the roster, the message log). The component just
// renders this and calls `sendChat`.
export function useGameSocket(room: string, name: string, mode: string) {
  const [connected, setConnected] = useState(false);
  // A terminal rejection from the server (e.g. the room is full). Non-null → stop reconnecting and
  // show this instead of the game; the room screen renders it as a dead-end notice.
  const [fatal, setFatal] = useState<string | null>(null);
  const [you, setYou] = useState<PlayerInfo | null>(null);
  // The room's ACTUAL mode, echoed by the server. May differ from the mode this
  // client requested if it joined a room someone else already created.
  const [serverMode, setServerMode] = useState<GameModeName | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [log, setLog] = useState<ChatLine[]>([]);
  const [game, setGame] = useState<PublicGameState | null>(null);
  // The secret word, set only when WE are the drawer; cleared each turn end.
  const [myWord, setMyWord] = useState<string | null>(null);
  // Word options offered to US during the "choosing" phase; cleared once the
  // turn begins (or any non-choosing state arrives).
  /** The most recent turn's revealed word, so the client can keep the drawing that went with it. */
  const [turnEnd, setTurnEnd] = useState<{ word: string; at: number } | null>(null);
  const [wordChoices, setWordChoices] = useState<WordChoice[] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const drawListeners = useRef<Set<DrawListener>>(new Set());

  const emitDraw = (op: DrawOp | { kind: "reset" }) => {
    for (const l of drawListeners.current) l(op);
  };

  useEffect(() => {
    if (!room || !name) return;
    const url = socketUrl(room, name, mode, stablePid());

    // `alive` distinguishes an intentional unmount (no reconnect) from a
    // dropped connection (reconnect with capped backoff). The server replays
    // full state on every connect, so reconnecting is enough to recover.
    let alive = true;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onclose = (e) => {
        setConnected(false);
        if (!alive) return;
        // A terminal rejection (full room): don't reconnect — it would just get closed again.
        if (e.code === CLOSE_ROOM_FULL) {
          alive = false;
          setFatal(e.reason || "this room is full. try another room name.");
          return;
        }
        attempt += 1;
        const delay = Math.min(5000, 500 * attempt); // 0.5s → 5s cap
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return; // ignore malformed frames instead of breaking the pump
        }
        handle(msg);
      };
    };

    const handle = (msg: ServerMessage) => {
      switch (msg.type) {
        case "welcome":
          setYou(msg.you);
          setServerMode(msg.mode);
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
        case "game_state":
          setGame(msg.state);
          // If we're no longer the drawer, forget any word we held.
          setMyWord((w) => (msg.state.phase === "playing" ? w : null));
          // Choices are only relevant during our own "choosing" phase.
          if (msg.state.phase !== "choosing") setWordChoices(null);
          break;
        case "word_choices":
          setWordChoices(msg.words.map((word, i) => ({ word, tier: msg.tiers[i] ?? "easy" })));
          break;
        case "your_word":
          setMyWord(msg.word);
          setWordChoices(null); // we picked → drop the options
          break;
        case "turn_end":
          setMyWord(null);
          // Stamped, so a repeat of the same word later in the game is still a new event to react
          // to. Without the timestamp a second turn on the same word would look like no change.
          setTurnEnd({ word: msg.word, at: Date.now() });
          setLog((l) => [
            ...l,
            { kind: "system", text: `The word was: ${msg.word}` },
          ]);
          break;
      }
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [room, name, mode]);

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

  const chooseWord = useCallback((word: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "choose_word", word } satisfies ClientMessage));
    }
  }, []);

  const startGame = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "start_game" } satisfies ClientMessage));
    }
  }, []);

  return {
    connected,
    fatal,
    you,
    serverMode,
    players,
    log,
    game,
    myWord,
    wordChoices,
    turnEnd,
    sendChat,
    chooseWord,
    sendDraw,
    subscribeDraw,
    clearBoard,
    startGame,
  };
}
