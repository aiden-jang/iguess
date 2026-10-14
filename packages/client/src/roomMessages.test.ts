import { test } from "node:test";
import assert from "node:assert/strict";
import { roomMessage, initialRoomState } from "./roomMessages";
import { normalizedPoint } from "./useCanvasPointer";
import { parseServerMessage } from "@iguess/shared/serverProtocol";
import {
  saveReconnectCredential,
  reconnectCredential,
} from "./reconnectCredential";
test("bounded chat retains new messages and turn reveals after reaching the cap", () => {
  let state = initialRoomState();
  for (let i = 0; i < 300; i++)
    state = roomMessage(state, { type: "system", text: String(i) });
  const last = state.log.at(-1);
  state = roomMessage(state, { type: "turn_end", word: "cat", scores: {} });
  assert.equal(state.log.length, 200);
  assert.notEqual(state.log.at(-1), last);
  assert.equal(state.log.at(-1)!.text, "The word was: cat");
  const reveal = state.turnEnd!.at;
  state = roomMessage(state, { type: "turn_end", word: "cat", scores: {} });
  assert.ok(state.turnEnd!.at > reveal);
});
test("presence updates the local role and game transitions clear stale secrets", () => {
  let state = initialRoomState();
  state.you = { id: "a", name: "a", isHost: true };
  state = roomMessage(state, {
    type: "presence",
    players: [{ id: "a", name: "a", spectator: true }],
  });
  assert.equal(state.you!.spectator, true);
  state = roomMessage(state, { type: "your_word", word: "cat" });
  state = roomMessage(state, {
    type: "game_state",
    state: {
      phase: "ended",
      drawerId: null,
      hint: "",
      scores: {},
      guessedIds: [],
      round: 1,
      totalRounds: 1,
      turnIndex: 1,
      totalTurns: 1,
      turnEndsAt: null,
      wordLength: 0,
    },
  });
  assert.equal(state.myWord, null);
  assert.equal(state.wordChoices, null);
  assert.deepEqual(roomMessage(state, { type: "reset" }), initialRoomState());
});
test("reaction lifetime uses receipt time without changing its canvas position", () => {
  let state = roomMessage(initialRoomState(), {
    type: "react",
    emoji: "🔥",
    at: 0.4,
    receivedAt: 100,
  });
  assert.equal(state.reactions[0]!.at, 0.4);
  assert.equal(state.reactions[0]!.expiresAt, 2300);
  state = roomMessage(state, {
    type: "expire_reaction",
    id: state.reactions[0]!.id,
  });
  assert.deepEqual(state.reactions, []);
});
test("pointer coordinates remain valid beyond canvas edges and in zero-size layouts", () => {
  assert.deepEqual(
    normalizedPoint(-10, 900, { left: 0, top: 0, width: 100, height: 100 }),
    { x: 0, y: 1 },
  );
  assert.deepEqual(
    normalizedPoint(20, 20, { left: 0, top: 0, width: 0, height: 0 }),
    { x: 0, y: 0 },
  );
});
test("the server transport ignores malformed shapes before reaching React or drawing listeners", () => {
  for (const value of [
    null,
    "{",
    "null",
    '{"type":"presence","players":{}}',
    '{"type":"game_state","state":null}',
    '{"type":"draw","op":null}',
    '{"type":"word_choices","words":null}',
  ])
    assert.equal(parseServerMessage(value), null);
  assert.deepEqual(parseServerMessage('{"type":"system","text":"hi"}'), {
    type: "system",
    text: "hi",
  });
});
test("room credentials stay isolated and survive blocked session storage in the current page", () => {
  saveReconnectCredential("one", "a".repeat(64));
  saveReconnectCredential("two", "b".repeat(64));
  assert.equal(reconnectCredential("one"), "a".repeat(64));
  assert.equal(reconnectCredential("two"), "b".repeat(64));
  assert.equal(reconnectCredential("three"), "");
});
