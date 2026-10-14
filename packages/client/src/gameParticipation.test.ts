import { test } from "node:test";
import assert from "node:assert/strict";
import { GameParticipation } from "./gameParticipation";
test("an initial finished snapshot does not count as a played game", () => {
  assert.equal(new GameParticipation().observe("ended", true), false);
});
test("spectators do not acquire games or losses", () => {
  const game = new GameParticipation();
  game.observe("playing", false);
  assert.equal(game.observe("ended", false), false);
});
test("a participated game counts once and a new game can count again", () => {
  const game = new GameParticipation();
  game.observe("choosing", true);
  game.observe("playing", true);
  assert.equal(game.observe("ended", true), true);
  assert.equal(game.observe("ended", true), false);
  game.observe("choosing", true);
  assert.equal(game.observe("ended", true), true);
});
test("a fresh lobby clears prior participation", () => {
  const game = new GameParticipation();
  game.observe("playing", true);
  game.observe("lobby", true);
  assert.equal(game.observe("ended", true), false);
});
