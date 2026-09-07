import { test } from "node:test";
import assert from "node:assert/strict";
import type { PlayerInfo, PublicGameState } from "@iguess/shared";
import { isAI, roomView } from "./roomView";

const player = (id: string, extra: Partial<PlayerInfo> = {}): PlayerInfo => ({
  id,
  name: id,
  ...extra,
});

const state = (extra: Partial<PublicGameState> = {}): PublicGameState => ({
  phase: "playing",
  drawerId: "alex",
  turnIndex: 0,
  totalTurns: 6,
  round: 1,
  totalRounds: 3,
  turnEndsAt: null,
  wordLength: 3,
  hint: "___",
  scores: {},
  guessedIds: [],
  ...extra,
});

test("everyone can scribble in the lobby, and nobody is drawing yet", () => {
  const v = roomView(null, [player("alex"), player("bo")], player("bo"));
  assert.equal(v.phase, "lobby");
  assert.equal(v.canDraw, true);
  assert.equal(v.drawingNow, false, "a lobby scribbler must not be told to stop typing");
});

test("in a live round only the drawer can draw", () => {
  const players = [player("alex"), player("bo")];
  const game = state({ phase: "playing", drawerId: "alex" });
  const drawer = roomView(game, players, player("alex"));
  const guesser = roomView(game, players, player("bo"));
  assert.deepEqual([drawer.canDraw, drawer.drawingNow], [true, true]);
  assert.deepEqual([guesser.canDraw, guesser.drawingNow], [false, false]);
});

test("a spectator never gets the pen, even in the lobby", () => {
  const players = [player("alex"), player("bo", { spectator: true })];
  const v = roomView(null, players, player("bo", { spectator: true }));
  assert.equal(v.youAreWatching, true);
  assert.equal(v.canDraw, false);
  assert.deepEqual(
    v.watching.map((p) => p.id),
    ["bo"],
  );
});

test("the ready count counts humans who are playing, not the AI or watchers", () => {
  const players = [
    player("alex", { ready: true }),
    player("ai-dogbot", { ready: true }),
    player("cam", { spectator: true, ready: true }),
    player("bo"),
  ];
  const v = roomView(null, players, player("alex", { ready: true }));
  assert.deepEqual(
    v.humans.map((p) => p.id),
    ["alex", "bo"],
  );
  assert.equal(v.readyCount, 1);
  assert.equal(v.youAreReady, true);
});

test("the scoreboard ranks by score, and a scoreless player stays put", () => {
  const players = [player("alex"), player("bo"), player("cam")];
  const v = roomView(state({ scores: { bo: 30, cam: 90 } }), players, player("alex"));
  assert.deepEqual(
    v.ranked.map((p) => p.id),
    ["cam", "bo", "alex"],
  );
});

test("the AI only counts as having guessed when an AI id is in the list", () => {
  const players = [player("alex"), player("ai-dogbot")];
  const human = roomView(state({ guessedIds: ["alex"] }), players, player("alex"));
  const bot = roomView(state({ guessedIds: ["ai-dogbot"] }), players, player("alex"));
  assert.equal(human.aiGuessedRight, false);
  assert.equal(bot.aiGuessedRight, true);
});

test("one human and no AI is a room still waiting for someone", () => {
  assert.equal(roomView(null, [player("alex")], player("alex")).soloWaiting, true);
  assert.equal(
    roomView(null, [player("alex"), player("ai-dogbot")], player("alex")).soloWaiting,
    false,
  );
  assert.equal(
    roomView(null, [player("alex"), player("bo")], player("alex")).soloWaiting,
    false,
  );
});

test("only the server's ai- prefix marks a bot", () => {
  assert.ok(isAI("ai-dogbot"));
  assert.ok(!isAI("aidan"));
  assert.ok(!isAI(null));
  assert.ok(!isAI(undefined));
});
