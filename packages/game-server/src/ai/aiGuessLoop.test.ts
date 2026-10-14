import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesWord, phraseGuess, startGuessLoop, nextGuessDelay } from "./aiGuessLoop.ts";
import type { EngineContext, TurnContext } from "../modes/GameMode.ts";

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

test("phraseGuess always embeds the raw guess verbatim", () => {
  for (let i = 0; i < 200; i++) {
    const out = phraseGuess("elephant");
    assert.ok(out.includes("elephant"), `phrasing dropped the guess: "${out}"`);
  }
});

test("a phrased guess still matches the secret word", () => {
  // Personality must never change whether a guess counts.
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
    canvasOpCount: () => 0,
    hintsRevealed: () => 0,
    broadcast: (m: { type: string; text?: string; isGuess?: boolean }) => {
      if (m.type === "chat") {
        assert.equal(m.isGuess, true, "AI guesses must be distinct from post-round commentary");
        chats.push(m.text ?? "");
      }
    },
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

test("with teasing off, a win lands straight away", async () => {
  const { chats, ctx, turn } = loopHarness("guitar");
  let won = 0;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => ({ guess: "guitar", alternatives: ["horse"] }),
    onCorrect: () => { won++; },
    firstGuessMs: 1, intervalMs: 500, teaseChance: 0,
  });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.equal(won, 1);
  assert.deepEqual(chats, ["guitar"]);
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

test("an AI that can't answer says so once, not every attempt", async () => {
  const { chats, ctx, turn } = loopHarness("guitar");
  let down = 0;
  let calls = 0;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => { calls++; throw new Error("budget spent"); },
    onCorrect: () => {},
    onUnavailable: () => { down++; },
    firstGuessMs: 1, intervalMs: 1,
  });
  await new Promise((r) => setTimeout(r, 40));
  stop();
  assert.ok(calls > 1, `expected repeated attempts, got ${calls}`);
  assert.equal(down, 1, `told the room ${down} times`);
  assert.deepEqual(chats, [], "a failed call must not be phrased as a guess");
});

test("the AI looks again sooner when a lot has just been drawn", () => {
  assert.ok(nextGuessDelay(80) < nextGuessDelay(20));
  assert.ok(nextGuessDelay(20) < nextGuessDelay(0));
});

test("a canvas nobody is touching does not burn guesses", () => {
  assert.ok(nextGuessDelay(0) >= 15_000, "an idle canvas should wait a long time");
});

test("stopping the loop mid-turn ends it for good", async () => {
  // Slow enough that the per-turn cap can't end the loop, so only stop() can.
  const { ctx, turn } = loopHarness("guitar");
  let calls = 0;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => { calls++; return { guess: "horse", alternatives: [] }; },
    onCorrect: () => {},
    firstGuessMs: 1, intervalMs: 12,
  });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  const settled = calls;
  assert.ok(settled >= 1 && settled < 4, `expected a live loop under the cap, got ${settled}`);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, settled, "the loop re-armed after being stopped");
});

test("a turn ending while the AI is mid-request does not re-arm the loop", async () => {
  // A real vision call takes seconds, and the turn can end inside that window.
  const { ctx, turn } = loopHarness("guitar");
  let calls = 0;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 40));
      return { guess: "horse", alternatives: [] };
    },
    onCorrect: () => {},
    firstGuessMs: 1, intervalMs: 5,
  });
  await new Promise((r) => setTimeout(r, 15)); // inside the first request
  stop();
  assert.equal(calls, 1);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls, 1, "the loop kept guessing after the turn ended");
});

test("the AI teases a wrong answer before landing the right one", async () => {
  const { chats, ctx, turn } = loopHarness("guitar");
  let won = 0;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => ({ guess: "guitar", alternatives: ["horse"] }),
    onCorrect: () => { won++; },
    firstGuessMs: 1, intervalMs: 500, teaseMs: 5, teaseChance: 1,
  });
  await new Promise((r) => setTimeout(r, 60));
  stop();
  assert.equal(won, 1, "the win should land exactly once");
  assert.deepEqual(chats, ["wait… is it a horse?", "guitar"]);
});

test("a turn ending during the tease cancels the late win", async () => {
  const { chats, ctx, turn } = loopHarness("guitar");
  let won = 0;
  const stop = startGuessLoop(turn, ctx, {
    aiId: "ai", aiName: "AI",
    requestGuess: async () => ({ guess: "guitar", alternatives: ["horse"] }),
    onCorrect: () => { won++; },
    firstGuessMs: 1, intervalMs: 500, teaseMs: 80, teaseChance: 1,
  });
  await new Promise((r) => setTimeout(r, 20));
  stop(); // turn ran out mid-tease
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(won, 0, "a cancelled tease must not award the turn");
  assert.ok(!chats.includes("guitar"), "the answer should never have landed");
});

test("a brutal AI looks sooner and more often than an easy one", async () => {
  const at = async (skill: "easy" | "normal" | "brutal", ms: number) => {
    const { ctx, turn } = loopHarness("guitar");
    let calls = 0;
    const stop = startGuessLoop(turn, ctx, {
      aiId: "ai", aiName: "AI", skill,
      requestGuess: async () => { calls++; return { guess: "horse", alternatives: [] }; },
      onCorrect: () => {},
    });
    await new Promise((r) => setTimeout(r, ms));
    stop();
    return calls;
  };
  // 5s in: brutal has looked (4s), normal (8s) and easy (16s) have not.
  assert.equal(await at("brutal", 5_000), 1);
  assert.equal(await at("easy", 5_000), 0);
});

test("an easy AI gives up after fewer guesses than a brutal one", async () => {
  // The per-turn cap is what stops a weak AI grinding to the answer by sheer volume.
  const spent = async (skill: "easy" | "brutal") => {
    const { ctx, turn } = loopHarness("guitar");
    let calls = 0;
    const stop = startGuessLoop(turn, ctx, {
      aiId: "ai", aiName: "AI", skill,
      requestGuess: async () => { calls++; return { guess: "horse", alternatives: [] }; },
      onCorrect: () => {},
      firstGuessMs: 1, intervalMs: 3,
    });
    await new Promise((r) => setTimeout(r, 150));
    stop();
    return calls;
  };
  assert.equal(await spent("easy"), 2);
  assert.equal(await spent("brutal"), 7);
});
