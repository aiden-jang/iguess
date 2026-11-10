import type { DrawOp } from "@iguess/shared";
import { MAX_DRAW_OPS } from "@iguess/shared/protocol";
import { dropStroke, lastStrokeId } from "@iguess/shared/strokeLog";
const MAX_BYTES = 2_000_000;
export class RoomCanvas {
  private ops: DrawOp[] = [];
  private bytes = 0;
  revision = 0;
  private owners = new Map<string, string>();
  constructor(private maxBytes = MAX_BYTES) {}
  snapshot() {
    return this.ops;
  }
  ownersSnapshot() {
    return [...this.owners];
  }
  restore(ops: DrawOp[], owners = this.ownersSnapshot()) {
    this.revision++;
    this.ops = ops.slice(0, MAX_DRAW_OPS);
    this.bytes = JSON.stringify(this.ops).length;
    const ids = new Set(
      this.ops.flatMap((op) => ("strokeId" in op ? [op.strokeId] : [])),
    );
    this.owners = new Map(owners.filter(([stroke]) => ids.has(stroke)));
  }
  apply(op: DrawOp, owner?: string): boolean {
    if (op.kind === "clear") {
      this.revision++;
      this.ops = [];
      this.bytes = 0;
      this.owners.clear();
      return true;
    }
    const size = JSON.stringify(op).length;
    if (this.ops.length >= MAX_DRAW_OPS || this.bytes + size > this.maxBytes)
      return false;
    const stroke = "strokeId" in op ? op.strokeId : undefined;
    const original = stroke && this.owners.get(stroke);
    if (owner && original && owner !== original) return false;
    if (owner && stroke) this.owners.set(stroke, owner);
    this.revision++;
    this.ops.push(op);
    this.bytes += size;
    return true;
  }
  undo(owner?: string, includeUnowned = false) {
    const id = lastStrokeId(
      owner
        ? this.ops.filter(
            (op) =>
              "strokeId" in op &&
              op.strokeId &&
              (this.owners.get(op.strokeId) === owner ||
                (includeUnowned && !this.owners.has(op.strokeId))),
          )
        : this.ops,
    );
    if (!id) return null;
    this.restore(dropStroke(this.ops, id));
    return id;
  }
}
