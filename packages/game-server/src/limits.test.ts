import { test } from "node:test";
import assert from "node:assert/strict";
import { atCapacity, MAX_PLAYERS_PER_ROOM } from "./limits.ts";

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
