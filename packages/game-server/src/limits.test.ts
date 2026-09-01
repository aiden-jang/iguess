import { test } from "node:test";
import assert from "node:assert/strict";
import { atCapacity, MAX_PLAYERS_PER_ROOM, CLOSE_KICKED, CLOSE_ROOM_FULL } from "./limits.ts";

test("a new joiner is refused once the room is at capacity", () => {
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM - 1, false), false);
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM, false), true);
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM + 5, false), true);
});

test("a reconnect is never refused, even at (or over) capacity", () => {
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM, true), false);
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM + 5, true), false);
});

test("an empty/under-capacity room admits new joiners", () => {
  assert.equal(atCapacity(0, false), false);
  assert.equal(atCapacity(1, false), false);
});

test("the kicked and room-full codes are distinct app codes the client can branch on", () => {
  assert.notEqual(CLOSE_KICKED, CLOSE_ROOM_FULL);
  for (const c of [CLOSE_KICKED, CLOSE_ROOM_FULL]) {
    assert.ok(c >= 4000 && c <= 4999, `${c} is outside the application close-code range`);
  }
});
