import type { ClientMessage, DrawOp, Point } from "./events.ts";
import { isReaction } from "./events.ts";
import {
  normalizeRelayGuess,
  normalizeRelayWord,
  RELAY_MAX_PLAYERS,
  RELAY_WORD_LIMIT,
} from "./relay.ts";

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
function cleanDrawOp(op: DrawOp): DrawOp {
  const point = ({ x, y }: Point): Point => ({ x, y });
  switch (op.kind) {
    case "start":
      return {
        kind: op.kind,
        strokeId: op.strokeId,
        color: op.color,
        width: op.width,
        erase: op.erase,
        point: point(op.point),
      };
    case "move":
      return {
        kind: op.kind,
        strokeId: op.strokeId,
        points: op.points.map(point),
        widths: op.widths,
      };
    case "fill":
      return {
        kind: op.kind,
        strokeId: op.strokeId,
        color: op.color,
        point: point(op.point),
      };
    case "end":
      return { kind: op.kind, strokeId: op.strokeId };
    case "undo":
    case "clear":
      return { kind: op.kind };
  }
}
function relayMessage(value: Record<string, unknown>): ClientMessage | null {
  if (
    !text(value.id, 36) ||
    !number(value.leg, -1, RELAY_MAX_PLAYERS) ||
    !Number.isInteger(value.leg)
  )
    return null;
  const base = { type: "relay" as const, id: value.id, leg: value.leg };
  switch (value.action) {
    case "choose":
      return text(value.word, RELAY_WORD_LIMIT)
        ? { ...base, action: value.action, word: value.word }
        : null;
    case "write": {
      const word =
        typeof value.word === "string" ? normalizeRelayWord(value.word) : null;
      return word ? { ...base, action: value.action, word } : null;
    }
    case "ink":
      return isDrawOp(value.op)
        ? { ...base, action: value.action, op: cleanDrawOp(value.op) }
        : null;
    case "pass": {
      if (value.guess === undefined) return { ...base, action: value.action };
      const guess =
        typeof value.guess === "string"
          ? normalizeRelayGuess(value.guess)
          : null;
      return guess ? { ...base, action: value.action, guess } : null;
    }
    case "chain":
      return number(value.index, 0, RELAY_MAX_PLAYERS - 1) &&
        Number.isInteger(value.index)
        ? { ...base, action: value.action, index: value.index }
        : null;
    default:
      return null;
  }
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
    case "relay":
      return relayMessage(value);
    case "chat":
      return text(value.text, 500) &&
        (value.id === undefined || text(value.id, 36))
        ? {
            type: value.type,
            text: value.text,
            ...(value.id ? { id: value.id as string } : {}),
          }
        : null;
    case "draw":
      return isDrawOp(value.op)
        ? { type: value.type, op: cleanDrawOp(value.op) }
        : null;
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
