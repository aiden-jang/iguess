import type { DrawOp } from "@iguess/shared";

type DrawEvent = DrawOp | { kind: "reset" };
type Listener = (op: DrawEvent) => void;

export class DrawFeed {
  private listeners = new Set<Listener>();
  private pending: DrawEvent[] = [];

  emit = (op: DrawEvent) => {
    if (!this.listeners.size) {
      if (op.kind === "reset" || op.kind === "clear") this.pending = [];
      this.pending.push(op);
    }
    for (const listener of this.listeners) listener(op);
  };

  reset(ops: DrawOp[] = []) {
    this.emit({ kind: "reset" });
    for (const op of ops) this.emit(op);
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    for (const op of this.pending) listener(op);
    this.pending = [];
    return () => this.listeners.delete(listener);
  };
}
