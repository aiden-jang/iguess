import { lazy } from "react";
import "./game.css";
import { RoomError } from "./RoomError";
import { useGameSocket } from "./useWebSocket";

const ClassicRoom = lazy(() =>
  import("./ClassicRoom").then(({ ClassicRoom }) => ({ default: ClassicRoom })),
);
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
  create,
  onLeave,
}: {
  name: string;
  room: string;
  mode: string;
  avatar: string;
  create?: boolean;
  onLeave: () => void;
}) {
  const socket = useGameSocket(room, name, mode, avatar, create);
  if (socket.fatal)
    return <RoomError reason={socket.fatal} onLeave={onLeave} />;
  if (socket.serverMode === "relay")
    return <RelayRoom room={room} onLeave={onLeave} socket={socket} />;
  if (!socket.serverMode && mode === "relay")
    return (
      <main className="room-error">
        <h1 role="status">Opening your room…</h1>
        <button onClick={onLeave}>Back to join</button>
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
