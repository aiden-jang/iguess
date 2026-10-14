import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atCapacity,
  roomIsFull,
  MAX_PLAYERS_PER_ROOM,
  MAX_SPECTATORS_PER_ROOM,
  CLOSE_KICKED,
  CLOSE_ROOM_FULL,
} from "./limits.ts";

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
    assert.ok(
      c >= 4000 && c <= 4999,
      `${c} is outside the application close-code range`,
    );
  }
});

test("the ninth player watches instead of being turned away", () => {
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM, false), true, "no seat left");
  assert.equal(
    roomIsFull(MAX_PLAYERS_PER_ROOM, 0, false),
    false,
    "but the gallery is open",
  );
});

test("a room is only refused when the gallery is full too", () => {
  assert.equal(
    roomIsFull(MAX_PLAYERS_PER_ROOM, MAX_SPECTATORS_PER_ROOM - 1, false),
    false,
  );
  assert.equal(
    roomIsFull(MAX_PLAYERS_PER_ROOM, MAX_SPECTATORS_PER_ROOM, false),
    true,
  );
});

test("a reconnecting player always gets their seat back", () => {
  assert.equal(atCapacity(MAX_PLAYERS_PER_ROOM, true), false);
  assert.equal(
    roomIsFull(MAX_PLAYERS_PER_ROOM, MAX_SPECTATORS_PER_ROOM, true),
    false,
  );
});

test("a half-empty room seats people normally", () => {
  assert.equal(atCapacity(3, false), false);
  assert.equal(roomIsFull(3, 0, false), false);
});
