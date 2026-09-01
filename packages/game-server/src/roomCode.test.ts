import { test } from "node:test";
import assert from "node:assert/strict";
import { newRoomCode } from "@iguess/shared/roomCode";

test("a room code is url-safe and speakable", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(newRoomCode(), /^[a-z]+-[a-z]+-\d{2}$/);
  }
});

test("codes rarely collide, unlike the old shared default", () => {
  const seen = new Set(Array.from({ length: 500 }, newRoomCode));
  assert.ok(seen.size > 490, `only ${seen.size}/500 distinct`);
});

test("a code fits the server's 32-character room id cap", () => {
  for (let i = 0; i < 200; i++) assert.ok(newRoomCode().length <= 32);
});
