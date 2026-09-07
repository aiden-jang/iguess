import { test } from "node:test";
import assert from "node:assert/strict";
import { chatPlaceholder, connectionLabel, inviteLabel, lobbyStatus, boardHint } from "./labels";

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

const board = {
  canDraw: false,
  youAreWatching: false,
  phase: "playing",
  isDrawer: false,
  drawerName: "Bo",
  drawerIsAI: false,
};

test("a board you can draw on says nothing", () => {
  assert.equal(boardHint({ ...board, canDraw: true }), null);
});

test("watching beats every other reason the board is dead", () => {
  assert.match(boardHint({ ...board, youAreWatching: true, phase: "lobby" })!, /watching this one/);
});

test("the lobby invites a doodle, and a finished game points at run it back", () => {
  assert.match(boardHint({ ...board, phase: "lobby" })!, /doodle while you wait/);
  assert.match(boardHint({ ...board, phase: "ended" })!, /run it back/);
});

test("during the word pick, the drawer is nudged and everyone else is told who is picking", () => {
  assert.match(boardHint({ ...board, phase: "choosing", isDrawer: true })!, /pick a word/);
  assert.equal(boardHint({ ...board, phase: "choosing" }), "Bo is picking a word");
});

test("a live round names whoever is drawing, bot or human", () => {
  assert.equal(boardHint(board), "Bo is cooking 👨‍🍳");
  assert.match(boardHint({ ...board, drawerIsAI: true })!, /the AI is cooking/);
});
