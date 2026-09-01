import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesWord, phraseGuess, startGuessLoop } from "./aiGuessLoop.ts";
import type { EngineContext, TurnContext } from "../modes/GameMode.ts";

// ---- matchesWord: the lenient match the scoring path depends on ----

test("matchesWord accepts exact and case-insensitive matches", () => {
  assert.ok(matchesWord("dog", "dog"));
  assert.ok(matchesWord("DOG", "dog"));
  assert.ok(matchesWord("Dog", "DOG"));
});

test("matchesWord accepts the word inside a natural-language answer", () => {
  assert.ok(matchesWord("it's an elephant", "elephant"));
  assert.ok(matchesWord("a dog probably", "dog"));
});

test("matchesWord rejects unrelated guesses", () => {
  assert.ok(!matchesWord("cat", "dog"));
  assert.ok(!matchesWord("", "dog"));
});

test("matchesWord forgives accents and punctuation like a human guess", () => {
  assert.ok(matchesWord("It's a café!", "cafe"));
  assert.ok(matchesWord("ICE-CREAM", "ice cream"));
  assert.ok(matchesWord("a piñata 🎉", "pinata"));
});

// ---- phraseGuess: personality must never change what gets matched ----
// This is the invariant that lets the bot have a voice without affecting
// scoring: the displayed text is decorated, but matching runs on the raw
// guess. If someone later matches against the displayed text, these guard it.

test("phraseGuess always embeds the raw guess verbatim", () => {
  for (let i = 0; i < 200; i++) {
    const out = phraseGuess("elephant");
    assert.ok(out.includes("elephant"), `phrasing dropped the guess: "${out}"`);
  }
});

test("a phrased guess still matches the secret word", () => {
  // Whatever decoration we add, the raw guess remains matchable — proving
  // phrasing and matching are independent (we match on the raw guess, not
  // the decorated string, but this asserts the decoration can't *prevent* it).
  for (let i = 0; i < 200; i++) {
    const phrased = phraseGuess("dog");
    assert.ok(matchesWord(phrased, "dog"), `phrasing broke matching: "${phrased}"`);
  }
});

test("runners-up never displace the actual guess", () => {
  for (let i = 0; i < 200; i++) {
    const out = phraseGuess("guitar", ["violin", "banjo"]);
    assert.ok(out.includes("guitar"), `lost the guess in: ${out}`);
    assert.ok(matchesWord(out, "guitar"), `no longer matches: ${out}`);
  }
});

test("the AI hedges sometimes, not every time", () => {
  const runs = Array.from({ length: 300 }, () => phraseGuess("dog", ["cow"]));
  const hedged = runs.filter((r) => r.includes("cow")).length;
  assert.ok(hedged > 20 && hedged < 280, `hedged ${hedged}/300, wanted a mix`);
});

test("no alternatives means no trailing hedge", () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(!phraseGuess("dog").includes("or a"));
  }
});

function loopHarness(word: string) {
  const chats: string[] = [];
  let guessed = false;
  const ctx = {
    currentWord: () => word,
    hasGuessed: () => guessed,
    broadcast: (m: { type: string; text?: string }) => { if (m.type === "chat") chats.push(m.text ?? ""); },
  } as unknown as EngineContext;
  return { chats, ctx, turn: { word } as TurnContext, markCorrect: () => { guessed = true; } };
}

test("saying the right word as a runner-up still wins the turn", async () => {
  const { chats, ctx, turn, markCorrect } = loopHarness("guitar");
  let won = false;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => ({ guess: "horse", alternatives: ["guitar"] }),
    onCorrect: () => { won = true; markCorrect(); },
    firstGuessMs: 1, intervalMs: 1,
  });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.ok(won, "the AI said guitar and should have won");
  assert.equal(chats[0], "guitar", "a win should read straight, not hedged");
});

test("a wrong shortlist keeps the turn going", async () => {
  const { chats, ctx, turn } = loopHarness("guitar");
  let won = false;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => ({ guess: "horse", alternatives: ["cow"] }),
    onCorrect: () => { won = true; },
    firstGuessMs: 1, intervalMs: 1,
  });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.ok(!won);
  assert.ok(chats[0]?.includes("horse"), `expected the guess in: ${chats[0]}`);
});
