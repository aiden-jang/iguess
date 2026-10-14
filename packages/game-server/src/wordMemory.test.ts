import { test } from "node:test";
import assert from "node:assert/strict";
import { WordMemory } from "./wordMemory.ts";
import { ClassicMode } from "./modes/ClassicMode.ts";
import type { EngineContext } from "./modes/GameMode.ts";

const ctx = {} as EngineContext;

test("a fresh game does not re-serve the previous game's words", () => {
  const memory = new WordMemory();
  const first = new ClassicMode();
  first.useWordMemory(memory);
  const seen = new Set<string>();
  for (let t = 0; t < 20; t++)
    for (const w of first.pickWordChoices!(ctx)!) seen.add(w);

  const second = new ClassicMode();
  second.useWordMemory(memory);
  for (let t = 0; t < 20; t++) {
    for (const w of second.pickWordChoices!(ctx)!) {
      assert.ok(!seen.has(w), `${w} came back in the very next game`);
    }
  }
});

test("memory never starves a small pool", () => {
  const memory = new WordMemory();
  const pool = ["a", "b", "c", "d"];
  for (let i = 0; i < 50; i++) for (const w of pool) memory.remember(w);
  const avoid = memory.avoidFor(pool);
  assert.ok(
    avoid.size <= pool.length / 2,
    `avoiding ${avoid.size} of ${pool.length} leaves nothing`,
  );
});

test("memory forgets the distant past", () => {
  const memory = new WordMemory();
  memory.remember("first");
  for (let i = 0; i < 200; i++) memory.remember(`filler${i}`);
  assert.ok(
    !memory.avoidFor(["first"]).has("first"),
    "an old word should be pickable again",
  );
});
