import type { DrawOp } from "./events.ts";

export interface GalleryTurn {
  word: string;
  drawerId: string;
  artist: string;
  ops: DrawOp[];
  guess: string | null;
  right: boolean;
  aiParticipated: boolean;
}

export type GalleryMessage =
  | { type: "gallery_turn"; index: number; turn: GalleryTurn }
  | { type: "gallery_done"; incomplete: boolean };
