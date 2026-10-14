import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  ClientMessage,
  DrawOp,
  Point,
  RoomSettings,
} from "@iguess/shared";
import { initialRoomState, roomMessage } from "./roomMessages";
import { roomTransport } from "./roomTransport";
export type { ChatLine, WordChoice, Choices } from "./roomMessages";

// Pointer traffic bypasses React; the canvas subscribes directly.
type DrawListener = (op: DrawOp | { kind: "reset" }) => void;
export function useGameSocket(
  room: string,
  name: string,
  mode: string,
  avatar: string,
) {
  const [state, dispatch] = useReducer(
    roomMessage,
    undefined,
    initialRoomState,
  );
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const transport = useRef<ReturnType<typeof roomTransport> | null>(null);
  const drawListeners = useRef(new Set<DrawListener>());
  const emitDraw = useCallback((op: DrawOp | { kind: "reset" }) => {
    for (const listener of drawListeners.current) listener(op);
  }, []);
  useEffect(() => {
    dispatch({ type: "reset" });
    setConnected(false);
    setFatal(null);
    if (!room || !name) return;
    const connection = roomTransport({
      room,
      name,
      mode,
      avatar,
      connected: setConnected,
      fatal: setFatal,
      message: (message) => {
        if (message.type === "draw") emitDraw(message.op);
        else if (message.type === "canvas_sync") {
          emitDraw({ kind: "reset" });
          for (const op of message.ops) emitDraw(op);
        } else
          dispatch(
            message.type === "react"
              ? { ...message, receivedAt: Date.now() }
              : message,
          );
      },
    });
    transport.current = connection;
    return () => {
      connection.dispose();
      transport.current = null;
    };
  }, [room, name, mode, avatar, emitDraw]);
  useEffect(() => {
    const oldest = state.reactions[0];
    if (!oldest) return;
    const timer = setTimeout(
      () => dispatch({ type: "expire_reaction", id: oldest.id }),
      Math.max(0, oldest.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.reactions]);
  const send = useCallback(
    (message: ClientMessage) => transport.current?.send(message) ?? false,
    [],
  );
  const sendDraw = useCallback(
    (op: DrawOp) => {
      send({ type: "draw", op });
    },
    [send],
  );
  const subscribeDraw = useCallback((listener: DrawListener) => {
    drawListeners.current.add(listener);
    return () => drawListeners.current.delete(listener);
  }, []);
  const clearBoard = useCallback(() => {
    if (send({ type: "draw", op: { kind: "clear" } }))
      emitDraw({ kind: "reset" });
  }, [emitDraw, send]);
  const lastCursorAt = useRef(0);
  const sendCursor = useCallback(
    (point: Point | null) => {
      const now = Date.now();
      if (point && now - lastCursorAt.current < 66) return;
      lastCursorAt.current = now;
      send({ type: "cursor", point });
    },
    [send],
  );
  return {
    ...state,
    connected,
    fatal,
    sendDraw,
    subscribeDraw,
    clearBoard,
    sendCursor,
    sendChat: useCallback(
      (text: string) => send({ type: "chat", text }),
      [send],
    ),
    chooseWord: useCallback(
      (word: string) => {
        send({ type: "choose_word", word });
      },
      [send],
    ),
    skipWord: useCallback(() => {
      send({ type: "skip_word" });
    }, [send]),
    updateSettings: useCallback(
      (settings: Partial<RoomSettings>) => {
        send({ type: "set_settings", settings });
      },
      [send],
    ),
    react: useCallback(
      (emoji: string) => {
        send({ type: "react", emoji });
      },
      [send],
    ),
    setReady: useCallback(
      (ready: boolean) => {
        send({ type: "ready", ready });
      },
      [send],
    ),
    kick: useCallback(
      (playerId: string) => {
        send({ type: "kick", playerId });
      },
      [send],
    ),
    startGame: useCallback(() => {
      send({ type: "start_game" });
    }, [send]),
    socketBacklog: useCallback(() => transport.current?.backlog() ?? 0, []),
  };
}
