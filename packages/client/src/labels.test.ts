import { test } from "node:test";
import assert from "node:assert/strict";
import { chatPlaceholder, connectionLabel, inviteLabel } from "./labels";

test("the drawer is told to stop typing, whatever the phase", () => {
  assert.match(chatPlaceholder(true, true), /eyes on the canvas/);
  assert.match(chatPlaceholder(true, false), /eyes on the canvas/);
});

test("a guesser in a live round is asked to guess, and in the lobby just to talk", () => {
  assert.match(chatPlaceholder(false, true), /guess it/);
  assert.equal(chatPlaceholder(false, false), "say something fr");
});

test("a first connection that has not landed says connecting, not dropped", () => {
  assert.equal(connectionLabel(false, false), "connecting…");
  assert.equal(connectionLabel(false, true), "hang on…");
  assert.equal(connectionLabel(true, false), "we're so back");
});

test("the invite button reports how the link left", () => {
  assert.equal(inviteLabel(null), "🔗 invite the squad");
  assert.match(inviteLabel("shared"), /invite sent/);
  assert.match(inviteLabel("copied"), /copied/);
});
