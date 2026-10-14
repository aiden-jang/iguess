import { test } from "node:test";
import assert from "node:assert/strict";
import { AIDrawerMode } from "./AIDrawerMode.ts";
import { DOODLE_WORDS } from "../doodles.ts";

test("AIDrawerMode never repeats a word within one pass of the doodle pool", () => {
  const mode = new AIDrawerMode();
  const picks = Array.from({ length: DOODLE_WORDS.length }, () =>
    mode.pickWord(),
  );
  assert.equal(
    new Set(picks).size,
    DOODLE_WORDS.length,
    `repeat within a cycle: ${picks.join(", ")}`,
  );
});

test("AIDrawerMode only picks words it can actually draw", () => {
  const mode = new AIDrawerMode();
  for (let i = 0; i < 40; i++)
    assert.ok(DOODLE_WORDS.includes(mode.pickWord()));
});

test("the doodle pool is more than a couple of words", () => {
  assert.ok(DOODLE_WORDS.length >= 10, `only ${DOODLE_WORDS.length} doodles`);
});
