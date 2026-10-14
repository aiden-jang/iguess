import type { DrawOp } from "./events.ts";

// Undo runs on both sides: the server trims its authoritative log, every client trims its own
// copy and repaints. Same code both places, because a disagreement leaves one player looking
// at a stroke everyone else has dropped.

/** Id of the last stroke in the log, or null if nothing has been drawn. */
export function lastStrokeId(ops: DrawOp[]): string | null {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!;
    if (op.kind === "start" || op.kind === "fill") return op.strokeId;
  }
  return null;
}

/** The log without the named stroke. */
export function dropStroke(ops: DrawOp[], strokeId: string): DrawOp[] {
  return ops.filter((op) => !("strokeId" in op) || op.strokeId !== strokeId);
}
