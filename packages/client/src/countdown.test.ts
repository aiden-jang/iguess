import { test } from "node:test";
import assert from "node:assert/strict";
import { timerFraction } from "./Countdown";

test("the timer bar matches the configured turn length and stays bounded", () => {
  for (const duration of [30_000, 45_000, 60_000, 90_000, 120_000]) {
    assert.equal(timerFraction(duration, duration), 1);
    assert.equal(timerFraction(duration / 2, duration), 0.5);
    assert.equal(timerFraction(-1, duration), 0);
  }
  assert.equal(timerFraction(10, 0), 0);
});
