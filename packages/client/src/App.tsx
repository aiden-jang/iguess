import { useState } from "react";
import { AVATARS } from "@iguess/shared";
import { newRoomCode } from "@iguess/shared/roomCode";
import { readStored, writeStored } from "./storage";
import { AVATAR_KEY, lifetimeStats } from "./playerStats";
import { readInvite } from "./roomLinks";
import { MODES } from "./gameModes";
import { Room } from "./Room";
import { JoinScreen } from "./JoinScreen";

export function App() {
  const [invite] = useState(() => readInvite());
  const invited = !!invite.room;
  const [draftName, setDraftName] = useState(
    invite.name ?? readStored("iguess_name") ?? "",
  );
  // Make up a code instead of defaulting to one shared name, or two unrelated groups opening
  // the site at the same moment end up in each other's game.
  const [draftRoom, setDraftRoom] = useState(
    invite.room ?? readStored("iguess_room") ?? newRoomCode(),
  );
  const [draftMode, setDraftMode] = useState(
    MODES.some((mode) => mode.value === invite.mode) ? invite.mode! : "ai",
  );
  const [avatar, setAvatar] = useState(
    () =>
      readStored(AVATAR_KEY) ??
      AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
  );
  const stats = lifetimeStats();
  const [joined, setJoined] = useState<{
    name: string;
    room: string;
    mode: string;
  } | null>(null);

  const doJoin = () => {
    const name = draftName.trim();
    if (!name) return;
    const room = draftRoom.trim() || newRoomCode();
    writeStored("iguess_name", name);
    writeStored("iguess_room", room);
    writeStored(AVATAR_KEY, avatar);
    // Put the room in the address bar, so copying the URL shares this room and not the homepage.
    const q = new URLSearchParams({ room, mode: draftMode });
    window.history.pushState(null, "", `#${q.toString()}`);
    setJoined({ name, room, mode: draftMode });
  };

  const leaveRoom = () => {
    setJoined(null);
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  };

  if (!joined) {
    return (
      <JoinScreen
        {...{
          draftName,
          setDraftName,
          draftRoom,
          setDraftRoom,
          draftMode,
          setDraftMode,
          avatar,
          setAvatar,
          invited,
          stats,
          doJoin,
        }}
      />
    );
  }

  return (
    <Room
      name={joined.name}
      room={joined.room}
      mode={joined.mode}
      avatar={avatar}
      onLeave={leaveRoom}
    />
  );
}
