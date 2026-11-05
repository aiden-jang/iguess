import { isDrawOp, MAX_DRAW_OPS } from "./protocol.ts";
import {
  RELAY_GUESS_LIMIT,
  RELAY_MAX_PLAYERS,
  RELAY_MIN_PLAYERS,
} from "./relay.ts";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, length: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= length;
const int = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= low &&
  value <= high;
const ink = (value: unknown) =>
  Array.isArray(value) && value.length <= MAX_DRAW_OPS && value.every(isDrawOp);

function assignment(value: unknown) {
  if (!object(value)) return false;
  switch (value.kind) {
    case "choose":
      return (
        Array.isArray(value.words) &&
        value.words.length === 3 &&
        value.words.every((word) => text(word, 64))
      );
    case "draw":
      return (
        text(value.prompt, RELAY_GUESS_LIMIT) &&
        typeof value.restart === "boolean" &&
        ink(value.ops)
      );
    case "guess":
      return ink(value.ops);
    case "passed":
    case "missed":
    case "watch":
      return true;
    default:
      return false;
  }
}

function state(value: unknown) {
  if (!object(value)) return false;
  if (value.phase === "lobby") return true;
  if (!text(value.id, 36)) return false;
  if (value.phase === "reveal")
    return (
      Array.isArray(value.players) &&
      int(value.players.length, RELAY_MIN_PLAYERS, RELAY_MAX_PLAYERS) &&
      value.players.every(
        (player) =>
          object(player) && text(player.id, 64) && text(player.name, 24),
      )
    );
  return (
    value.phase === "active" &&
    int(value.total, RELAY_MIN_PLAYERS, RELAY_MAX_PLAYERS) &&
    int(value.leg, -1, value.total - 1) &&
    int(value.passed, 0, value.total) &&
    int(value.endsAt, 1, Number.MAX_SAFE_INTEGER) &&
    assignment(value.assignment)
  );
}

function entry(value: unknown) {
  if (!object(value)) return false;
  if (value.kind === "guess") return text(value.text, RELAY_GUESS_LIMIT);
  const restart = value.restart === undefined || text(value.restart, 64);
  return (
    restart &&
    (value.kind === "skipped" || (value.kind === "drawing" && ink(value.ops)))
  );
}

export function isRelayMessage(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case "relay_state":
      return state(value.state);
    case "relay_progress":
      return (
        text(value.id, 36) &&
        int(value.leg, -1, RELAY_MAX_PLAYERS - 1) &&
        int(value.passed, 0, RELAY_MAX_PLAYERS)
      );
    case "relay_chain":
      return (
        text(value.id, 36) &&
        int(value.index, 0, RELAY_MAX_PLAYERS - 1) &&
        text(value.word, 64) &&
        Array.isArray(value.entries) &&
        int(value.entries.length, RELAY_MIN_PLAYERS, RELAY_MAX_PLAYERS) &&
        value.entries.every(entry)
      );
    case "relay_notice":
      return text(value.text, 160);
    default:
      return false;
  }
}
