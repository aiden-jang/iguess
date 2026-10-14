import {
  useEffect,
  useRef,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import type { DrawOp, Point } from "@iguess/shared";
interface PointerOptions {
  canvas: MutableRefObject<HTMLCanvasElement | null>;
  canDraw: boolean;
  brush: { color: string; width: number; erasing: boolean; filling: boolean };
  apply(op: DrawOp): void;
  send(op: DrawOp): void;
  cursor?: (point: Point | null) => void;
  backlog?: () => number;
}
export function normalizedPoint(
  x: number,
  y: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): Point {
  const unit = (value: number, size: number) =>
    size > 0
      ? Math.min(1, Math.max(0, Math.round((value / size) * 1000) / 1000))
      : 0;
  return {
    x: unit(x - rect.left, rect.width),
    y: unit(y - rect.top, rect.height),
  };
}
/** Buffered pointer input owns its animation frame and flushes the last points before ending. */
export function useCanvasPointer(options: PointerOptions) {
  const current = useRef(options);
  current.current = options;
  const pointer = useRef<number | null>(null);
  const stroke = useRef<string | null>(null);
  const points = useRef<Point[]>([]);
  const widths = useRef<number[]>([]);
  const sample = useRef<Point | null>(null);
  const frame = useRef<number | null>(null);
  const emit = (op: DrawOp) => {
    current.current.apply(op);
    current.current.send(op);
  };
  const cancel = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const reset = () => {
    cancel();
    stroke.current = null;
    pointer.current = null;
    points.current = [];
    widths.current = [];
    sample.current = null;
  };
  useEffect(() => {
    if (!options.canDraw) reset();
  }, [options.canDraw]);
  useEffect(() => reset, []);
  const queue = () => {
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        flush();
      });
  };
  const flush = (force = false) => {
    const id = stroke.current;
    if (!id || !points.current.length) return;
    if (
      !force &&
      (current.current.backlog?.() ?? 0) > 24_000 &&
      points.current.length < 240
    ) {
      queue();
      return;
    }
    while (points.current.length) {
      const batch = points.current.splice(0, 256),
        sizes = widths.current.splice(0, 256);
      emit(
        sizes.some((size) => size !== sizes[0])
          ? { kind: "move", strokeId: id, points: batch, widths: sizes }
          : { kind: "move", strokeId: id, points: batch },
      );
    }
  };
  const position = (event: PointerEvent) =>
    normalizedPoint(
      event.clientX,
      event.clientY,
      current.current.canvas.current!.getBoundingClientRect(),
    );
  const finish = () => {
    if (!stroke.current) return;
    cancel();
    flush(true);
    emit({ kind: "end", strokeId: stroke.current });
    reset();
  };
  return {
    onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (!current.current.canDraw || stroke.current || event.button !== 0)
        return;
      const { brush } = current.current;
      const point = position(event);
      const id = crypto.randomUUID();
      if (brush.filling) {
        emit({ kind: "fill", strokeId: id, color: brush.color, point });
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      stroke.current = id;
      pointer.current = event.pointerId;
      sample.current = point;
      emit({
        kind: "start",
        strokeId: id,
        color: brush.color,
        width: brush.width,
        erase: brush.erasing,
        point,
      });
    },
    onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
      if (
        !current.current.canDraw ||
        (pointer.current !== null && pointer.current !== event.pointerId)
      )
        return;
      const point = position(event);
      current.current.cursor?.(point);
      if (!stroke.current) return;
      const pressure =
        event.pointerType === "pen" &&
        event.pressure > 0 &&
        event.pressure !== 0.5;
      const speed = sample.current
        ? Math.hypot(point.x - sample.current.x, point.y - sample.current.y)
        : 0;
      const scale = pressure
        ? 0.45 + event.pressure * 1.1
        : 1.15 - Math.min(0.6, speed * 12);
      points.current.push(point);
      widths.current.push(
        Math.round(Math.max(1, current.current.brush.width * scale) * 10) / 10,
      );
      sample.current = point;
      queue();
    },
    onPointerUp(event: PointerEvent) {
      if (event.pointerId === pointer.current) finish();
    },
    onPointerCancel(event: PointerEvent) {
      if (event.pointerId === pointer.current) finish();
    },
    onLostPointerCapture(event: PointerEvent) {
      if (event.pointerId === pointer.current) finish();
    },
    onPointerLeave() {
      if (current.current.canDraw) current.current.cursor?.(null);
      finish();
    },
  };
}
