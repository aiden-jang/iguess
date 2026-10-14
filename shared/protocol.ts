import type { ClientMessage, DrawOp, Point } from "./events.ts";
import { isReaction } from "./events.ts";

export const MAX_FRAME_BYTES = 32_768;
export const MAX_DRAW_OPS = 12_000;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
export function isPoint(value: unknown): value is Point {
  return object(value) && number(value.x, 0, 1) && number(value.y, 0, 1);
}
export function isDrawOp(value: unknown): value is DrawOp {
  if (!object(value)) return false;
  if (value.kind === "clear") return true;
  if (value.kind === "undo")
    return value.strokeId === undefined || text(value.strokeId, 64);
  if (!text(value.strokeId, 64) || !/^[\w-]+$/.test(value.strokeId))
    return false;
  if (value.kind === "end") return true;
  if (value.kind === "move")
    return (
      Array.isArray(value.points) &&
      value.points.length > 0 &&
      value.points.length <= 256 &&
      value.points.every(isPoint) &&
      (value.widths === undefined ||
        (Array.isArray(value.widths) &&
          value.widths.length === value.points.length &&
          value.widths.every((width) => number(width, 0.1, 64))))
    );
  const color =
    typeof value.color === "string" &&
    /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.color);
  if (value.kind === "fill") return color && isPoint(value.point);
  return (
    value.kind === "start" &&
    color &&
    isPoint(value.point) &&
    number(value.width, 0.1, 64) &&
    (value.erase === undefined || typeof value.erase === "boolean")
  );
}
export function parseClientMessage(frame: unknown): ClientMessage | null {
  if (
    typeof frame !== "string" ||
    frame.length > MAX_FRAME_BYTES ||
    new TextEncoder().encode(frame).length > MAX_FRAME_BYTES
  )
    return null;
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    return null;
  }
  if (!object(value)) return null;
  switch (value.type) {
    case "chat":
      return text(value.text, 500)
        ? { type: value.type, text: value.text }
        : null;
    case "draw":
      return isDrawOp(value.op) ? { type: value.type, op: value.op } : null;
    case "start_game":
    case "skip_word":
      return { type: value.type };
    case "choose_word":
      return text(value.word, 24)
        ? { type: value.type, word: value.word }
        : null;
    case "kick":
      return text(value.playerId, 64)
        ? { type: value.type, playerId: value.playerId }
        : null;
    case "ready":
      return typeof value.ready === "boolean"
        ? { type: value.type, ready: value.ready }
        : null;
    case "react":
      return isReaction(value.emoji)
        ? { type: value.type, emoji: value.emoji }
        : null;
    case "cursor":
      return value.point === null || isPoint(value.point)
        ? { type: value.type, point: value.point }
        : null;
    case "set_settings":
      return object(value.settings)
        ? { type: value.type, settings: value.settings }
        : null;
    default:
      return null;
  }
}
