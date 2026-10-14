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

test("joint leaders count equally regardless of roster order", () => {
  const ranked = [{ id: "first" }, { id: "second" }, { id: "third" }];
  const scores = { first: 80, second: 80, third: 20 };
  assert.equal(didWin(ranked, scores, "first"), true);
  assert.equal(didWin(ranked, scores, "second"), true);
  assert.equal(didWin(ranked, scores, "third"), false);
  assert.equal(didWin(ranked, { first: 0, second: 0 }, "second"), false);
});
