import type { DrawOp } from "@iguess/shared";
import { floodFill } from "@iguess/shared/floodFill";
import {
  startStroke,
  strokePaths,
  type BrushStroke,
} from "@iguess/shared/strokePath";

export interface StrokeStates {
  map: Map<string, BrushStroke>;
}
export function newStrokeStates(): StrokeStates {
  return { map: new Map() };
}

export function paintOp(
  ctx: CanvasRenderingContext2D,
  op: DrawOp | { kind: "reset" },
  states: StrokeStates,
  width: number,
  height: number,
): void {
  switch (op.kind) {
    case "reset":
    case "clear":
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      states.map.clear();
      break;
    case "start":
      states.map.set(op.strokeId, startStroke(op));
      break;
    case "move": {
      const stroke = states.map.get(op.strokeId);
      if (!stroke) return;
      ctx.globalCompositeOperation = stroke.erase
        ? "destination-out"
        : "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const path of strokePaths(stroke, op, width, height)) {
        ctx.lineWidth = path.width;
        ctx.stroke(new Path2D(path.d));
      }
      break;
    }
    case "fill": {
      const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      floodFill(image, op.point, op.color);
      ctx.putImageData(image, 0, 0);
      break;
    }
    case "end":
      states.map.delete(op.strokeId);
      ctx.globalCompositeOperation = "source-over";
      break;
    case "undo":
      break;
  }
}
