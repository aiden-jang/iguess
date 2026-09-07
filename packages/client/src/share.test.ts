import { test } from "node:test";
import assert from "node:assert/strict";
import type { PlayerInfo } from "@iguess/shared";
import { flexText, scoreLine, type Standings } from "./share";

const p = (id: string, name = id): PlayerInfo => ({ id, name });

const standings = (): Standings => ({
  ranked: [p("alex"), p("ai-dogbot", "dogbot"), p("bo")],
  scores: { alex: 90, "ai-dogbot": 45, bo: 0 },
  youId: "alex",
});

const context = { modeLabel: "AI Guesser", inviteUrl: "https://iguess.test/r/duo?mode=ai", streak: 3 };

test("the score line names you, badges the bot and keeps the rest", () => {
  assert.equal(scoreLine(standings()), "you 90  ·  🤖 45  ·  bo 0");
});

test("the score line shows at most four players", () => {
  const many = {
    ranked: ["a", "b", "c", "d", "e"].map((id) => p(id)),
    scores: { a: 5, b: 4, c: 3, d: 2, e: 1 },
    youId: null,
  };
  assert.equal(scoreLine(many), "a 5  ·  b 4  ·  c 3  ·  d 2");
});

test("the brag reads exactly as shared", () => {
  assert.equal(
    flexText(standings(), context),
    [
      "iguess ✏️ · AI Guesser",
      "i came #1/3 and that's on periodt",
      "",
      "🥇 🟪🟪🟪🟪🟪🟪🟪🟪 90",
      "🥈 🤖🤖🤖🤖 45",
      "🥉 ⬜ 0",
      "",
      "cooked the AI too 🤖💥 no cap",
      "🔥 3-win streak",
      "",
      "pull up: https://iguess.test/r/duo?mode=ai",
    ].join("\n"),
  );
});

test("bars scale against the winner and never vanish", () => {
  const s: Standings = {
    ranked: [p("alex"), p("bo")],
    scores: { alex: 1000, bo: 1 },
    youId: "alex",
  };
  const lines = flexText(s, { ...context, streak: 0 }).split("\n");
  assert.ok(lines.includes("🥇 🟪🟪🟪🟪🟪🟪🟪🟪 1000"));
  assert.ok(lines.includes("🥈 ⬜ 1"), "last place still gets one block");
});

test("losing to the bot drops the brag about beating it", () => {
  const s = standings();
  s.scores = { alex: 10, "ai-dogbot": 99, bo: 0 };
  s.ranked = [p("ai-dogbot", "dogbot"), p("alex"), p("bo")];
  const out = flexText(s, { ...context, streak: 1 });
  assert.ok(!out.includes("cooked the AI"), "should not brag about losing");
  assert.ok(out.includes("i came #2/3"));
});

test("a one-win streak is not a streak", () => {
  assert.ok(!flexText(standings(), { ...context, streak: 1 }).includes("win streak"));
  assert.ok(flexText(standings(), { ...context, streak: 2 }).includes("🔥 2-win streak"));
});

test("a room with no AI never claims to have beaten one", () => {
  const s: Standings = { ranked: [p("alex"), p("bo")], scores: { alex: 9, bo: 1 }, youId: "alex" };
  assert.ok(!flexText(s, { ...context, streak: 0 }).includes("cooked the AI"));
});

test("a spectator has no placing", () => {
  const out = flexText({ ...standings(), youId: "cam" }, context);
  assert.ok(out.includes("i came #?/3"));
});
