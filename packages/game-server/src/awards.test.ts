import { test } from "node:test";
import assert from "node:assert/strict";
import { awardsFor, type Round } from "@iguess/shared/awards";
import type { PlayerInfo } from "@iguess/shared";

const players: PlayerInfo[] = [
  { id: "a", name: "Ann" },
  { id: "b", name: "Bob" },
];
const r = (drawerId: string, word: string, guess: string | null, right: boolean): Round => ({
  drawerId, word, guess, right,
});

test("a drawer the machine read every time gets the legible award", () => {
  const out = awardsFor([r("a", "cat", "cat", true), r("a", "sun", "sun", true)], players);
  assert.ok(out.some((x) => x.title.includes("legible") && x.who === "Ann"));
});

test("nobody wins legible when two drawers tie on it", () => {
  const out = awardsFor(
    [r("a", "cat", "cat", true), r("a", "sun", "sun", true), r("b", "dog", "dog", true), r("b", "fish", "fish", true)],
    players
  );
  assert.ok(!out.some((x) => x.title.includes("legible")), "a shared award is not an award");
});

test("one round is not enough to earn an award", () => {
  const out = awardsFor([r("a", "cat", "cat", true)], players);
  assert.ok(!out.some((x) => x.title.includes("legible")));
});

test("the worst take is the guess that missed by the widest margin", () => {
  const out = awardsFor(
    [r("a", "cat", "dog", false), r("b", "igloo", "extraordinary", false)],
    players
  );
  const worst = out.find((x) => x.title.includes("worst take"));
  assert.equal(worst?.who, "“extraordinary”");
  assert.equal(worst?.detail, "it was igloo");
});

test("a game with no rounds produces no awards", () => {
  assert.deepEqual(awardsFor([], players), []);
});
