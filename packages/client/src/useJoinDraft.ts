import { useEffect, useState } from "react";
import { AVATARS, isAvatar } from "@iguess/shared";
import { newRoomCode, visiblePlayerName } from "@iguess/shared/roomCode";
import { readStored, writeStored } from "./storage";
import { AVATAR_KEY, lifetimeStats } from "./playerStats";
import { readInvite } from "./roomLinks";
import { MODES } from "./gameModes";

type Entry = { name: string; room: string; mode: string; create?: boolean };
const inviteMode = (mode?: string) =>
  MODES.some((entry) => entry.value === mode) ? mode! : "";

export function useJoinDraft(enter: (entry: Entry) => void) {
  const [invite] = useState(() => readInvite());
  const [invited, setInvited] = useState(!!invite.room);
  const [create, setCreate] = useState(!invite.room);
  const [lastRoom, setLastRoom] = useState(() => readStored("iguess_room"));
  const [draftName, setDraftName] = useState(() =>
    visiblePlayerName(invite.name ?? readStored("iguess_name") ?? ""),
  );
  const [draftRoom, setRoom] = useState(() => invite.room ?? newRoomCode());
  const [draftMode, setDraftMode] = useState(
    () => inviteMode(invite.mode) || (invite.room ? "" : "ai"),
  );
  const [avatar, setAvatar] = useState(() => {
    const stored = readStored(AVATAR_KEY);
    return isAvatar(stored)
      ? stored
      : AVATARS[Math.floor(Math.random() * AVATARS.length)]!;
  });
  const [entryError, setEntryError] = useState("");
  const [roomError, setRoomError] = useState("");
  useEffect(() => {
    const sync = () => {
      const next = readInvite();
      setInvited(!!next.room);
      setCreate(!next.room);
      setRoom(next.room ?? newRoomCode());
      setDraftMode(inviteMode(next.mode) || (next.room ? "" : "ai"));
      if (next.name) setDraftName(visiblePlayerName(next.name));
      setLastRoom(readStored("iguess_room"));
      setEntryError("");
      setRoomError("");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const selectRoom = (room?: string) => {
    setInvited(!!room);
    setRoom(room ?? newRoomCode());
    setCreate(!room);
    setDraftMode(
      room ? inviteMode(readStored("iguess_room_mode") ?? undefined) : "ai",
    );
    setEntryError("");
    setRoomError("");
  };
  const doJoin = () => {
    const name = visiblePlayerName(draftName);
    const code = draftRoom.trim();
    if (!name) {
      setEntryError("Enter a visible name to join the room.");
      return;
    }
    if (code.length > 32 || code === "." || code === "..") {
      setRoomError(
        "Enter a room code up to 32 characters. A dot on its own won’t work.",
      );
      return;
    }
    const room = code || newRoomCode();
    writeStored("iguess_name", name);
    writeStored(AVATAR_KEY, avatar);
    setEntryError("");
    setRoomError("");
    enter({ name, room, mode: draftMode, create: create || !code });
  };
  return {
    draftName,
    setDraftName: (name: string) => {
      setEntryError("");
      setDraftName(name);
    },
    draftRoom,
    setDraftRoom: (room: string) => {
      setRoom(room);
      setCreate(false);
      setRoomError("");
    },
    regenerateRoom: () => {
      setRoom(newRoomCode());
      setCreate(true);
      setRoomError("");
    },
    draftMode,
    setDraftMode,
    avatar,
    setAvatar,
    invited,
    lastRoom,
    selectRoom,
    entryError,
    roomError,
    stats: lifetimeStats(),
    doJoin,
  };
}
