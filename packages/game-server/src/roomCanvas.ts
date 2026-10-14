import type { DrawOp } from "@iguess/shared";
import { MAX_DRAW_OPS } from "@iguess/shared/protocol";
import { dropStroke, lastStrokeId } from "@iguess/shared/strokeLog";
const MAX_BYTES = 2_000_000;
export class RoomCanvas {
  private ops: DrawOp[] = [];
  private bytes = 0;
  snapshot() {
    return this.ops;
  }
  restore(ops: DrawOp[]) {
    this.ops = ops.slice(0, MAX_DRAW_OPS);
    this.bytes = JSON.stringify(this.ops).length;
  }
  apply(op: DrawOp): boolean {
    if (op.kind === "clear") {
      this.ops = [];
      this.bytes = 0;
      return true;
    }
    const size = JSON.stringify(op).length;
    if (this.ops.length >= MAX_DRAW_OPS || this.bytes + size > MAX_BYTES)
      return false;
    this.ops.push(op);
    this.bytes += size;
    return true;
  }
  undo() {
    const id = lastStrokeId(this.ops);
    if (!id) return null;
    this.restore(dropStroke(this.ops, id));
    return id;
  }
}
