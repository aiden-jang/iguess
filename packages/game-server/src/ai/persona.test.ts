import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_NAME, aiComment, createCommentary } from "./persona.ts";

test("commentary preserves literal replacement characters in the disclosed word", () => {
  const comment = createCommentary(() => 0);
  assert.equal(
    comment("$& $$ $' %", false),
    "A $& $$ $' %, apparently. Noted.",
  );
});

test("the AI's name carries no badge of its own", () => {
  // Chat, the scoreboard and the share text each add their own AI marker. A name with one
  // baked in renders as "🤖 🤖 dogbot".
  assert.doesNotMatch(
    AI_NAME,
    /\p{Extended_Pictographic}/u,
    `${AI_NAME} contains an emoji`,
  );
  assert.ok(AI_NAME.trim().length > 0);
});

test("losing commentary names the word it missed", () => {
  for (let i = 0; i < 60; i++) {
    const line = aiComment("guitar", false);
    assert.ok(!line.includes("%"), `unsubstituted placeholder: ${line}`);
  }
  const many = new Set(
    Array.from({ length: 200 }, () => aiComment("guitar", false)),
  );
  assert.ok(
    [...many].some((l) => l.includes("guitar")),
    "no line ever used the word",
  );
});

test("winning commentary never claims it lost", () => {
  for (let i = 0; i < 60; i++) {
    assert.ok(!aiComment("guitar", true).includes("%"));
  }
});

test("room commentary avoids recent templates even with a fixed random source", () => {
  const say = createCommentary(() => 0);
  const lines = Array.from({ length: 12 }, () => say("guitar", false));
  for (let i = 2; i < lines.length; i++) {
    assert.notEqual(lines[i], lines[i - 1]);
    assert.notEqual(lines[i], lines[i - 2]);
  }
});
test("unavailable vision never pretends to have inspected the drawing", () => {
  const say = createCommentary(() => 0);
  for (let i = 0; i < 6; i++)
    assert.match(
      say("guitar", false, true),
      /unavailable|couldn’t see|No vision/,
    );
});
