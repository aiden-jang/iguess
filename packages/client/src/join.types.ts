import type { LifetimeStats } from "./playerStats";

export interface JoinProps {
  draftName: string;
  setDraftName: (name: string) => void;
  draftRoom: string;
  setDraftRoom: (room: string) => void;
  draftMode: string;
  setDraftMode: (mode: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
  invited: boolean;
  lastRoom: string | null;
  selectRoom: (room?: string) => void;
  entryError: string;
  roomError: string;
  regenerateRoom: () => void;
  stats: LifetimeStats;
  doJoin: () => void;
}
