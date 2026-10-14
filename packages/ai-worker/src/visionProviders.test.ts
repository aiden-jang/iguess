import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectProvider,
  selectProviders,
  guessWithFallback,
  MockProvider,
  WorkersAIProvider,
  type VisionProvider,
} from "./visionProviders.ts";
import type { AiBinding } from "./env.ts";
import { guessAuthFailure } from "./guessAuth.ts";

const throwing = (name: string): VisionProvider => ({
  name,
  guess: async () => {
    throw new Error(`${name} boom`);
  },
});
const fixed = (name: string, ...words: string[]): VisionProvider => ({
  name,
  guess: async () => words,
});

test("defaults to mock when no keys are configured", () => {
  assert.equal(selectProvider({}).name, "mock");
});

test("VISION_PROVIDER=mock forces mock even with a key present", () => {
  assert.equal(
    selectProvider({ VISION_PROVIDER: "mock", OPENAI_API_KEY: "sk-x" }).name,
    "mock",
  );
});

test("picks the explicitly requested provider when its key is present", () => {
  assert.equal(
    selectProvider({ VISION_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })
      .name,
    "anthropic",
  );
  assert.equal(
    selectProvider({ VISION_PROVIDER: "openai", OPENAI_API_KEY: "k" }).name,
    "openai",
  );
});

test("falls back to the first available key when no explicit pick", () => {
  assert.equal(selectProvider({ OPENAI_API_KEY: "k" }).name, "openai");
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: "k" }).name, "anthropic");
});

test("an explicit provider without its key falls through to mock", () => {
  assert.equal(selectProvider({ VISION_PROVIDER: "openai" }).name, "mock");
});

test("the mock guess is one of the common words", async () => {
  const ranked = await new MockProvider().guess("");
  assert.ok(ranked.length > 0);
  for (const g of ranked) assert.match(g, /^[a-z]+$/);
});

const fakeAI: AiBinding = { run: async () => ({ description: "a cat" }) };

test("uses free Workers AI by default when the [ai] binding is present and no paid key", () => {
  assert.equal(selectProvider({ AI: fakeAI }).name, "workers-ai");
});

test("a paid key still wins over the Workers AI binding", () => {
  assert.equal(
    selectProvider({ AI: fakeAI, OPENAI_API_KEY: "k" }).name,
    "openai",
  );
});

test("VISION_PROVIDER=workers forces Workers AI when bound", () => {
  assert.equal(
    selectProvider({ VISION_PROVIDER: "workers", AI: fakeAI }).name,
    "workers-ai",
  );
});

test("WorkersAIProvider strips a leading article from the model output", async () => {
  const ranked = await new WorkersAIProvider(fakeAI, "@cf/llava").guess("QUJD"); // "a cat" -> "cat"
  assert.deepEqual(ranked, ["cat"]);
});

const names = (env: Parameters<typeof selectProviders>[0]) =>
  selectProviders(env).map((p) => p.name);

test("real providers fail closed until the worker shared secret is configured", () => {
  assert.equal(guessAuthFailure({}, true, null), "ai_auth_not_configured");
  assert.equal(
    guessAuthFailure({ AI_SHARED_SECRET: "secret" }, true, null),
    "unauthorized",
  );
  assert.equal(
    guessAuthFailure({ AI_SHARED_SECRET: "secret" }, true, "Bearer secret"),
    null,
  );
});

test("mock-only mode remains available without a shared secret", () => {
  assert.equal(guessAuthFailure({}, false, null), null);
});

test("a paid key falls back to Workers AI then mock (so a 429 key never kills the AI)", () => {
  assert.deepEqual(names({ AI: fakeAI, OPENAI_API_KEY: "k" }), [
    "openai",
    "workers-ai",
    "mock",
  ]);
});

test("mock is always the last-resort backstop", () => {
  assert.deepEqual(names({}), ["mock"]);
  assert.deepEqual(names({ AI: fakeAI }), ["workers-ai", "mock"]);
});

test("VISION_PROVIDER forces the primary but keeps the rest as fallbacks", () => {
  assert.deepEqual(
    names({ VISION_PROVIDER: "workers", AI: fakeAI, OPENAI_API_KEY: "k" }),
    ["workers-ai", "openai", "mock"],
  );
});

test("guessWithFallback falls through a throwing provider to the next (429 key → free AI)", async () => {
  const res = await guessWithFallback(
    [throwing("openai"), fixed("workers-ai", "house"), new MockProvider()],
    "PNG",
  );
  assert.deepEqual(res, {
    guess: "house",
    alternatives: [],
    provider: "workers-ai",
  });
});

test("guessWithFallback lands on the mock when every vision provider throws", async () => {
  const res = await guessWithFallback(
    [throwing("openai"), throwing("workers-ai"), new MockProvider()],
    "PNG",
  );
  assert.equal(res?.provider, "mock");
  assert.match(res?.guess ?? "", /^[a-z]+$/);
});

test("guessWithFallback skips vision providers when there is no image, using the mock", async () => {
  const res = await guessWithFallback(
    [fixed("workers-ai", "house"), new MockProvider()],
    "",
  );
  assert.equal(res?.provider, "mock"); // workers-ai skipped (no image); mock needs none
});

test("the hint reaches the prompt but the answer never does", async () => {
  const seen: string[] = [];
  const spy: VisionProvider = {
    name: "spy",
    async guess(_png: string, hint?: string) {
      seen.push(hint ?? "");
      return ["guitar"];
    },
  };
  await guessWithFallback([spy], "png", "g _ i t _ r");
  assert.deepEqual(seen, ["g _ i t _ r"]);
  assert.ok(!seen[0]!.includes("guitar"));
});

test("a guess with no hint still works", async () => {
  const p: VisionProvider = {
    name: "p",
    async guess(_png, hint) {
      return [hint ? "hinted" : "blind"];
    },
  };
  assert.equal((await guessWithFallback([p], "png"))?.guess, "blind");
});

test("the mock respects the hint length so hinted runs look real", async () => {
  const mock = new MockProvider();
  for (let i = 0; i < 30; i++) {
    for (const g of await mock.guess("", "_ _ _ _")) assert.equal(g.length, 4);
  }
});

test("a comma list from the model becomes a ranked shortlist", async () => {
  const ai: AiBinding = {
    run: async () => ({ description: "a guitar, violin, banjo" }),
  };
  assert.deepEqual(await new WorkersAIProvider(ai, "@cf/llava").guess("QUJD"), [
    "guitar",
    "violin",
    "banjo",
  ]);
});

test("a chatty model still yields usable guesses", async () => {
  const ai: AiBinding = {
    run: async () => ({ response: "It looks like a house or maybe a barn" }),
  };
  const ranked = await new WorkersAIProvider(ai, "@cf/llava").guess("QUJD");
  assert.deepEqual(ranked, ["house", "barn"]);
});

test("runners-up ride along with the winning guess", async () => {
  const res = await guessWithFallback(
    [fixed("workers-ai", "dog", "horse", "cow")],
    "PNG",
  );
  assert.deepEqual(res, {
    guess: "dog",
    alternatives: ["horse", "cow"],
    provider: "workers-ai",
  });
});

test("a hung provider reaches its deadline and aborts before falling back", async () => {
  let signal: AbortSignal | undefined;
  const hung: VisionProvider = {
    name: "hung",
    guess: async (_png, _hint, abort) => {
      signal = abort;
      return new Promise(() => {});
    },
  };
  const result = await guessWithFallback(
    [hung, new MockProvider()],
    "pixels",
    "___",
    5,
  );
  assert.equal(signal?.aborted, true);
  assert.equal(result?.provider, "mock");
});
