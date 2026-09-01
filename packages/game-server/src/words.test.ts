import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS, WORDS_BY_TIER, TIERS, randomWord, tierOf } from "./words.ts";

test("every word belongs to exactly one tier", () => {
  const counts = new Map<string, number>();
  for (const t of TIERS) for (const w of WORDS_BY_TIER[t]) counts.set(w, (counts.get(w) ?? 0) + 1);
  const dupes = [...counts].filter(([, n]) => n > 1).map(([w]) => w);
  assert.deepEqual(dupes, [], "a word in two tiers makes its score ambiguous");
  assert.equal(WORDS.length, counts.size);
});

test("words are drawable tokens, not phrases", () => {
  for (const w of WORDS) assert.match(w, /^[a-z]+$/, `${w} should be a single lowercase word`);
});

test("randomWord stays inside the tier it was asked for", () => {
  for (const t of TIERS) {
    for (let i = 0; i < 50; i++) assert.equal(tierOf(randomWord(t)), t);
  }
});
