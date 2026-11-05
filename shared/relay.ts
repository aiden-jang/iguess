import type { DrawOp } from "./events.ts";

export const RELAY_MIN_PLAYERS = 3;
export const RELAY_MAX_PLAYERS = 8;
export const RELAY_PICK_MS = 20_000;
export const RELAY_DRAW_MS = 60_000;
export const RELAY_GUESS_MS = 30_000;
export const RELAY_GUESS_LIMIT = 80;
// 32 retained drawings at the room limit fit inside the room checkpoint.
export const RELAY_INK_BYTES = 120_000;

export interface RelayPlayer {
  id: string;
  name: string;
}
export type RelayEntry =
  | { kind: "drawing"; ops: DrawOp[]; restart?: string }
  | { kind: "guess"; text: string }
  | { kind: "skipped"; restart?: string };
export type RelayAssignment =
  | { kind: "choose"; words: string[] }
  | { kind: "draw"; prompt: string; restart: boolean; ops: DrawOp[] }
  | { kind: "guess"; ops: DrawOp[] }
  | { kind: "passed" | "missed" | "watch" };
export type RelayState =
  | { phase: "lobby" }
  | {
      phase: "active";
      id: string;
      leg: number;
      total: number;
      endsAt: number;
      passed: number;
      assignment: RelayAssignment;
    }
  | { phase: "reveal"; id: string; players: RelayPlayer[] };
export type RelayClientMessage = { type: "relay"; id: string; leg: number } & (
  | { action: "choose"; word: string }
  | { action: "ink"; op: DrawOp }
  | { action: "pass"; guess?: string }
  | { action: "chain"; index: number }
);
export type RelayServerMessage =
  | { type: "relay_state"; state: RelayState }
  | { type: "relay_progress"; id: string; leg: number; passed: number }
  | {
      type: "relay_chain";
      id: string;
      index: number;
      word: string;
      entries: RelayEntry[];
    }
  | { type: "relay_notice"; text: string };

export function hasRelayInk(ops: readonly DrawOp[]) {
  const pens = new Set<string>();
  for (const op of ops) {
    if (op.kind === "fill") return true;
    if (op.kind === "move" && pens.has(op.strokeId)) return true;
    if (op.kind === "end" || (op.kind === "start" && op.erase))
      pens.delete(op.strokeId);
    if (op.kind === "start" && !op.erase) pens.add(op.strokeId);
  }
  return false;
}
