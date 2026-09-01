import { test } from "node:test";
import assert from "node:assert/strict";
import { seatSpectators, pickHost, type Seat } from "./hosting.ts";
import { MAX_PLAYERS_PER_ROOM } from "./limits.ts";

const seats = (...spec: ("p" | "s")[]): Seat[] =>
  spec.map((k, i) => ({ id: `c${i}`, spectator: k === "s" }));

test("the longest-present player holds the room", () => {
  assert.equal(pickHost(seats("p", "p", "p"), null), "c0");
});

test("a sitting host keeps the room", () => {
  assert.equal(pickHost(seats("p", "p"), "c1"), "c1");
});

test("the host passes on when they leave", () => {
  assert.equal(pickHost([{ id: "c1", spectator: false }], "c0"), "c1");
});

test("a spectator is never made host while a player is present", () => {
  assert.equal(pickHost(seats("s", "p"), null), "c1");
});

test("a room of nothing but spectators seats them rather than deadlocking", () => {
  // Every player left an 8-player room. Without promotion nobody can start a game ever again:
  // the host comes from players, and spectators are only seated when a host starts one.
  const only = seats("s", "s", "s");
  const after = seatSpectators(only);
  assert.deepEqual(after.map((s) => s.spectator), [false, false, false]);
  assert.equal(pickHost(after, null), "c0");
});

test("seating stops at the player cap", () => {
  const crowd = seats(...Array<"s">(MAX_PLAYERS_PER_ROOM + 4).fill("s"));
  const after = seatSpectators(crowd);
  assert.equal(after.filter((s) => !s.spectator).length, MAX_PLAYERS_PER_ROOM);
  assert.equal(after.filter((s) => s.spectator).length, 4);
});

test("seating fills only the seats that are actually free", () => {
  const nearlyFull = seats(...Array<"p">(MAX_PLAYERS_PER_ROOM - 1).fill("p"), "s", "s");
  const after = seatSpectators(nearlyFull);
  assert.equal(after.filter((s) => !s.spectator).length, MAX_PLAYERS_PER_ROOM);
});

test("an empty room has no host", () => {
  assert.equal(pickHost([], "c0"), null);
});
