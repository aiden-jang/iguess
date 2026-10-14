import { useState } from "react";
import { AVATARS, isAvatar } from "@iguess/shared";
import { newRoomCode } from "@iguess/shared/roomCode";
import { readStored, writeStored } from "./storage";
import { AVATAR_KEY, lifetimeStats } from "./playerStats";
import { readInvite } from "./roomLinks";
import { MODES } from "./gameModes";

type Entry = { name: string; room: string; mode: string };
export function useJoinDraft(enter: (entry: Entry) => void) {
  const [invite] = useState(() => readInvite());
  const [invited, setInvited] = useState(!!invite.room);
  const [lastRoom, setLastRoom] = useState(readStored("iguess_room"));
  const [draftName, setDraftName] = useState(
    invite.name ?? readStored("iguess_name") ?? "",
  );
  const [draftRoom, setDraftRoom] = useState(invite.room ?? newRoomCode());
  const [draftMode, setDraftMode] = useState(
    MODES.some((mode) => mode.value === invite.mode) ? invite.mode! : "ai",
  );
  const [avatar, setAvatar] = useState(
    () =>
      (isAvatar(readStored(AVATAR_KEY)) ? readStored(AVATAR_KEY)! : null) ??
      AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
  );
  const [entryError, setEntryError] = useState("");
  const selectRoom = (room?: string) => {
    setInvited(!!room);
    setDraftRoom(room ?? newRoomCode());
    setEntryError("");
  };
  const doJoin = () => {
    const name = draftName.trim();
    if (!name) {
      setEntryError("Enter a name to join the room.");
      return;
    }
    if (draftRoom.trim().length > 32) {
      setEntryError("Room codes can contain up to 32 characters.");
      return;
    }
    const room = draftRoom.trim() || newRoomCode();
    writeStored("iguess_name", name);
    writeStored("iguess_room", room);
    writeStored(AVATAR_KEY, avatar);
    setLastRoom(room);
    setEntryError("");
    enter({ name, room, mode: draftMode });
    selectRoom();
  };
  return {
    draftName,
    setDraftName,
    draftRoom,
    setDraftRoom,
    draftMode,
    setDraftMode,
    avatar,
    setAvatar,
    invited,
    lastRoom,
    selectRoom,
    entryError,
    stats: lifetimeStats(),
    doJoin,
  };
}
