import { test } from "node:test";
import assert from "node:assert/strict";
import { chatPlaceholder, connectionLabel, inviteLabel, lobbyStatus } from "./labels";

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

test("a watcher is told why they are watching, not that they are waiting", () => {
  const s = lobbyStatus({
    youAreWatching: true,
    soloWaiting: false,
    isAIMode: false,
    readyCount: 3,
    humanCount: 8,
    watchingCount: 2,
  });
  assert.match(s, /room's full/);
});

test("a filling lobby counts who is ready, and mentions watchers only when there are some", () => {
  const base = {
    youAreWatching: false,
    soloWaiting: false,
    isAIMode: false,
    readyCount: 1,
    humanCount: 2,
    watchingCount: 0,
  };
  assert.equal(lobbyStatus(base), "lowkey waiting · 1/2 ready");
  assert.equal(lobbyStatus({ ...base, watchingCount: 3 }), "lowkey waiting · 1/2 ready · 3 watching");
});

test("someone on their own is told why nothing is happening", () => {
  const alone = {
    youAreWatching: false,
    soloWaiting: true,
    isAIMode: false,
    readyCount: 1,
    humanCount: 1,
    watchingCount: 0,
  };
  assert.match(lobbyStatus(alone), /needs someone to guess/);
  assert.match(lobbyStatus({ ...alone, isAIMode: true }), /you vs the 🤖 AI/);
});
