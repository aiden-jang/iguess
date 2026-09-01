import { useEffect, useRef, useState, useCallback } from "react";
import { withTransition } from "./useViewTransition";
import type {
  ClientMessage,
  ServerMessage,
  PlayerInfo,
  DrawOp,
  PublicGameState,
  GameModeName,
  WordTier,
  RoomSettings,
  Point,
} from "@iguess/shared";
import { DEFAULT_SETTINGS } from "@iguess/shared";

export type WordChoice = { word: string; tier: WordTier };
export type Choices = { options: WordChoice[]; canSkip: boolean };

// Strokes deliberately skip React state. Re-rendering on every pointer move would be far too
// slow, so the canvas listens here and paints itself.
type DrawListener = (op: DrawOp | { kind: "reset" }) => void;

let nextReactionId = 1;

// Same origin in production: one Worker serves both this app and the socket. In dev, Vite
// proxies /rooms across to wrangler.
function socketUrl(room: string, name: string, mode: string, pid: string, avatar: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams({ name, mode, pid, avatar });
  return `${proto}://${window.location.host}/rooms/${encodeURIComponent(room)}/ws?${q.toString()}`;
}

const PID_KEY = "iguess_pid";

function newPid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

// The id that says "this is the same player". A returning pid inside the grace window keeps
// your score, your place in the drawing order, and your turn.
//
// sessionStorage, NOT localStorage: it has to survive a refresh, but two tabs on one machine
// must stay two players. If storage throws, a fresh id is no worse than having none.
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

// Both of these are final. Retrying is pointless: a full room won't empty because you asked
// again, and a kick just kicks you again.
const CLOSE_ROOM_FULL = 4009;
const CLOSE_KICKED = 4010;

export function useGameSocket(room: string, name: string, mode: string, avatar: string) {
  const [connected, setConnected] = useState(false);
  // Set means: stop reconnecting and show this instead of the game.
  const [fatal, setFatal] = useState<string | null>(null);
  const [you, setYou] = useState<PlayerInfo | null>(null);
  const [serverMode, setServerMode] = useState<GameModeName | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [log, setLog] = useState<ChatLine[]>([]);
  const [game, setGame] = useState<PublicGameState | null>(null);
  const [myWord, setMyWord] = useState<string | null>(null);
  const [turnEnd, setTurnEnd] = useState<{ word: string; at: number } | null>(null);
  const [wordChoices, setWordChoices] = useState<Choices | null>(null);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [peerCursor, setPeerCursor] = useState<Point | null>(null);
  const phaseRef = useRef<string | null>(null);
  const [reactions, setReactions] = useState<{ id: number; emoji: string; at: number }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const drawListeners = useRef<Set<DrawListener>>(new Set());

  const emitDraw = (op: DrawOp | { kind: "reset" }) => {
    for (const l of drawListeners.current) l(op);
  };

  useEffect(() => {
    if (!room || !name) return;
    const url = socketUrl(room, name, mode, stablePid(), avatar);

    // `alive` tells "we closed this on purpose" apart from "the network dropped". The server
    // resends everything on connect, so simply reconnecting is a full recovery.
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
        if (e.code === CLOSE_ROOM_FULL) {
          alive = false;
          setFatal(e.reason || "this room is full. try another room name.");
          return;
        }
        if (e.code === CLOSE_KICKED) {
          alive = false;
          setFatal("the host removed you from this room.");
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
          setSettings(msg.settings);
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
        case "game_state": {
          // Only animate a phase change. Scores tick constantly and would animate forever.
          const changedPhase = msg.state.phase !== phaseRef.current;
          phaseRef.current = msg.state.phase;
          if (changedPhase) withTransition(() => setGame(msg.state));
          else setGame(msg.state);
          setMyWord((w) => (msg.state.phase === "playing" ? w : null));
          if (msg.state.phase !== "choosing") setWordChoices(null);
          break;
        }
        case "settings":
          setSettings(msg.settings);
          break;
        case "cursor":
          setPeerCursor(msg.point);
          break;
        case "react": {
          const id = nextReactionId++;
          setReactions((r) => [...r.slice(-24), { id, emoji: msg.emoji, at: msg.at }]);
          setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2200);
          break;
        }
        case "word_choices":
          setWordChoices({
            options: msg.words.map((word, i) => ({ word, tier: msg.tiers[i] ?? "easy" })),
            canSkip: msg.canSkip,
          });
          break;
        case "your_word":
          setMyWord(msg.word);
          setWordChoices(null); // we picked → drop the options
          break;
        case "turn_end":
          setMyWord(null);
          // Timestamped, or the same word coming round twice looks like nothing changed.
          setTurnEnd({ word: msg.word, at: Date.now() });
          setLog((l) => [
            ...l,
            { kind: "system", text: `The word was: ${msg.word}` },
          ]);
          break;
      }
    };

    connect();

    // Without this, coming out of a tunnel costs another five seconds of frozen board.
    const retryNow = () => {
      if (!alive) return;
      if (document.visibilityState !== "visible") return;
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      attempt = 0;
      connect();
    };
    document.addEventListener("visibilitychange", retryNow);
    window.addEventListener("online", retryNow);

    return () => {
      document.removeEventListener("visibilitychange", retryNow);
      window.removeEventListener("online", retryNow);
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [room, name, mode, avatar]);

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

  const subscribeDraw = useCallback((fn: DrawListener) => {
    drawListeners.current.add(fn);
    return () => drawListeners.current.delete(fn);
  }, []);

  // Reset our own canvas too: the server never sends our own strokes back to us.
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

  const updateSettings = useCallback((patch: Partial<RoomSettings>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_settings", settings: patch } satisfies ClientMessage));
    }
  }, []);

  // Throttled. This is a hint about where the pen is, not a second way to send strokes.
  const lastCursorAt = useRef(0);
  const sendCursor = useCallback((point: Point | null) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (point && now - lastCursorAt.current < 66) return;
    lastCursorAt.current = now;
    ws.send(JSON.stringify({ type: "cursor", point } satisfies ClientMessage));
  }, []);

  // Bytes queued but not yet sent. Climbing means the connection can't keep up.
  const socketBacklog = useCallback(() => wsRef.current?.bufferedAmount ?? 0, []);

  const react = useCallback((emoji: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "react", emoji } satisfies ClientMessage));
    }
  }, []);

  const setReady = useCallback((ready: boolean) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ready", ready } satisfies ClientMessage));
    }
  }, []);

  const kick = useCallback((playerId: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "kick", playerId } satisfies ClientMessage));
    }
  }, []);

  const skipWord = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "skip_word" } satisfies ClientMessage));
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
    skipWord,
    settings,
    updateSettings,
    kick,
    setReady,
    peerCursor,
    sendCursor,
    reactions,
    react,
    socketBacklog,
    sendDraw,
    subscribeDraw,
    clearBoard,
    startGame,
  };
}
