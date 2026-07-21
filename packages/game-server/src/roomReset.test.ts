import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldResetRoom } from "./roomReset.ts";

test("a finished game resets on (re)join, regardless of mode", () => {
  assert.equal(shouldResetRoom("ended", "classic", "classic"), true);
  assert.equal(shouldResetRoom("ended", "ai", "classic"), true);
});

test("a lobby resets only when the joiner picked a different mode", () => {
  assert.equal(shouldResetRoom("lobby", "ai", "classic"), true);
  assert.equal(shouldResetRoom("lobby", "classic", "classic"), false);
});

test("a game in progress is never reset — you join it", () => {
  for (const phase of ["choosing", "playing", "intermission"]) {
    assert.equal(shouldResetRoom(phase, "ai", "classic"), false, `should not reset during ${phase}`);
  }
});
