import { lazy, useEffect } from "react";
import { ClassicRoom } from "./ClassicRoom";
import { RoomError } from "./RoomError";
import { useGameSocket } from "./useWebSocket";

const RelayRoom = lazy(() =>
  import("./RelayRoom").then((module) => ({ default: module.RelayRoom })),
);

export interface RoomScreenProps {
  room: string;
  onLeave: () => void;
  socket: ReturnType<typeof useGameSocket>;
}

export function Room({
  name,
  room,
  mode,
  avatar,
  onLeave,
}: {
  name: string;
  room: string;
  mode: string;
  avatar: string;
  onLeave: () => void;
}) {
  const socket = useGameSocket(room, name, mode, avatar);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [room]);
  if (socket.fatal)
    return <RoomError reason={socket.fatal} onLeave={onLeave} />;
  if (socket.serverMode === "relay")
    return <RelayRoom room={room} onLeave={onLeave} socket={socket} />;
  if (!socket.serverMode && mode === "relay")
    return (
      <main className="room-error">
        <section role="status">
          <h1>Opening your room…</h1>
          <button onClick={onLeave}>Back to join</button>
        </section>
      </main>
    );
  return (
    <ClassicRoom
      room={room}
      onLeave={onLeave}
      socket={socket}
      requestedMode={mode}
    />
  );
}
