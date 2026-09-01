import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS, WORDS_BY_TIER, TIERS, PACKS, poolFor, randomWord, tierOf } from "@iguess/shared/words";

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

test("every pack word is a real word with a tier", () => {
  for (const [name, words] of Object.entries(PACKS)) {
    assert.ok(words.length > 0, `${name} is empty`);
    for (const w of words) assert.ok(WORDS.includes(w), `${name} lists "${w}", which is not a word`);
  }
});

test("a pack narrows the pool it is asked for", () => {
  const narrowed = poolFor("easy", ["food"]);
  assert.ok(narrowed.length < WORDS_BY_TIER.easy.length);
  for (const w of narrowed) assert.ok(PACKS.food!.includes(w));
});

test("a pack with nothing in a tier falls back rather than leaving it empty", () => {
  // "food" has no hard words; the hard slot on the pick screen must still fill.
  assert.deepEqual(poolFor("hard", ["food"]), WORDS_BY_TIER.hard);
});

test("no packs means the whole tier", () => {
  assert.deepEqual(poolFor("medium", []), WORDS_BY_TIER.medium);
});
