import { test } from "node:test";
import assert from "node:assert/strict";
import { didWin } from "./playerStats";

test("a scoreless or unfinished game does not count as a lifetime win", () => {
  assert.equal(didWin([{ id: "me" }], { me: 0 }, "me"), false);
  assert.equal(didWin([], {}, "me"), false);
  assert.equal(
    didWin([{ id: "other" }, { id: "me" }], { other: 20, me: 10 }, "me"),
    false,
  );
  assert.equal(didWin([{ id: "me" }], { me: 10 }, "me"), true);
});
