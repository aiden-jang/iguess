import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapCaption } from "./evidenceCard";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const parts = (s: string) =>
  Array.from(segmenter.segment(s), ({ segment }) => segment);
const ctx = {
  measureText: (s: string) => ({ width: parts(s).length * 10 }) as TextMetrics,
};

test("long unbroken guesses fit every evidence-card line with whole emoji", () => {
  const emoji = "👩🏽‍💻";
  const lines = wrapCaption(ctx, emoji.repeat(30), 100, 2);
  assert.deepEqual(lines, [emoji.repeat(10), `${emoji.repeat(9)}…`]);
  for (const line of lines) assert.ok(ctx.measureText(line).width <= 100);
});
test("captions preserve short words and complete accents without needless ellipses", () => {
  assert.deepEqual(wrapCaption(ctx, "small dog", 100, 2), ["small dog"]);
  assert.deepEqual(wrapCaption(ctx, "cafe\u0301 noir", 50, 2), [
    "cafe\u0301",
    "noir",
  ]);
  assert.deepEqual(wrapCaption(ctx, "", 100, 2), []);
});
