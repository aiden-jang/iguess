import type { ServerMessage } from "./events.ts";
import { isReaction } from "./events.ts";
import { isDrawOp, isPoint, MAX_DRAW_OPS } from "./protocol.ts";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 1024): value is string =>
  typeof value === "string" && value.length <= max;
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown, count: number, length: number) =>
  Array.isArray(value) &&
  value.length <= count &&
  value.every((item) => text(item, length));
function player(value: unknown) {
  return (
    object(value) &&
    text(value.id, 64) &&
    text(value.name, 24) &&
    ["isHost", "ready", "spectator"].every(
      (key) => value[key] === undefined || typeof value[key] === "boolean",
    ) &&
    (value.avatar === undefined || text(value.avatar, 8))
  );
}
function settings(value: unknown) {
  return (
    object(value) &&
    number(value.turnSeconds) &&
    number(value.rounds) &&
    number(value.scoreTarget) &&
    ["easy", "normal", "brutal"].includes(String(value.aiSkill)) &&
    strings(value.packs, 12, 32) &&
    strings(value.customWords, 40, 24)
  );
}
function scores(value: unknown) {
  return (
    object(value) &&
    Object.keys(value).length <= 24 &&
    Object.values(value).every(number)
  );
}
function game(value: unknown) {
  return (
    object(value) &&
    ["lobby", "choosing", "playing", "intermission", "ended"].includes(
      String(value.phase),
    ) &&
    (value.drawerId === null || text(value.drawerId, 64)) &&
    ["turnIndex", "totalTurns", "round", "totalRounds", "wordLength"].every(
      (key) => number(value[key]),
    ) &&
    (value.turnEndsAt === null || number(value.turnEndsAt)) &&
    text(value.hint, 64) &&
    scores(value.scores) &&
    strings(value.guessedIds, 24, 64)
  );
}
/** Decode at the transport boundary; reducers and canvas listeners receive checked shapes. */
export function parseServerMessage(frame: unknown): ServerMessage | null {
  if (typeof frame !== "string" || frame.length > 3_000_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    return null;
  }
  if (!object(value)) return null;
  let valid = false;
  switch (value.type) {
    case "welcome":
      valid =
        player(value.you) &&
        text(value.roomId, 32) &&
        ["classic", "ai", "ai-drawer", "team-battle", "duel"].includes(
          String(value.mode),
        ) &&
        settings(value.settings) &&
        typeof value.reconnectToken === "string" &&
        /^[a-f\d]{64}$/.test(value.reconnectToken);
      break;
    case "presence":
      valid =
        Array.isArray(value.players) &&
        value.players.length <= 24 &&
        value.players.every(player);
      break;
    case "settings":
      valid = settings(value.settings);
      break;
    case "chat":
      valid =
        player(value.from) &&
        text(value.text) &&
        (value.isGuess === undefined || typeof value.isGuess === "boolean");
      break;
    case "system":
      valid = text(value.text);
      break;
    case "draw":
      valid = isDrawOp(value.op);
      break;
    case "canvas_sync":
      valid =
        Array.isArray(value.ops) &&
        value.ops.length <= MAX_DRAW_OPS &&
        value.ops.every(isDrawOp);
      break;
    case "game_state":
      valid = game(value.state);
      break;
    case "cursor":
      valid =
        text(value.playerId, 64) &&
        (value.point === null || isPoint(value.point));
      break;
    case "react":
      valid =
        isReaction(value.emoji) &&
        number(value.at) &&
        value.at >= 0 &&
        value.at <= 1;
      break;
    case "your_word":
      valid = text(value.word, 64);
      break;
    case "word_choices":
      valid =
        strings(value.words, 3, 64) &&
        Array.isArray(value.tiers) &&
        value.tiers.length === (value.words as unknown[]).length &&
        value.tiers.every((tier) =>
          ["easy", "medium", "hard"].includes(String(tier)),
        ) &&
        typeof value.canSkip === "boolean";
      break;
    case "turn_end":
      valid = text(value.word, 64) && scores(value.scores);
      break;
  }
  return valid ? (value as unknown as ServerMessage) : null;
}
