import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chatPlaceholder,
  connectionLabel,
  inviteLabel,
  lobbyStatus,
  boardHint,
} from "./labels";
import { roomView } from "./roomView";
import type { PlayerInfo, PublicGameState } from "@iguess/shared";

test("the drawer is told to stop typing, whatever the phase", () => {
  assert.match(chatPlaceholder(true, true), /Draw on the canvas/);
  assert.match(chatPlaceholder(true, false), /Draw on the canvas/);
});

test("a guesser in a live round is asked to guess, and in the lobby just to talk", () => {
  assert.match(chatPlaceholder(false, true), /Your guess/);
  assert.equal(chatPlaceholder(false, false), "Say something…");
});

test("a first connection that has not landed says connecting, not dropped", () => {
  assert.equal(connectionLabel(false, false), "connecting…");
  assert.equal(connectionLabel(false, true), "Reconnecting…");
  assert.equal(connectionLabel(true, false), "Connected");
});

test("the invite button reports how the link left", () => {
  assert.equal(inviteLabel(null), "Invite friends");
  assert.match(inviteLabel("shared"), /shared/);
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
  assert.match(s, /Room is full/);
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
  assert.equal(lobbyStatus(base), "Lobby · 1/2 ready");
  assert.equal(
    lobbyStatus({ ...base, watchingCount: 3 }),
    "Lobby · 1/2 ready · 3 watching",
  );
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
  assert.match(lobbyStatus({ ...alone, isAIMode: true }), /you vs the AI/);
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
  assert.match(
    boardHint({ ...board, youAreWatching: true, phase: "lobby" })!,
    /watching this one/,
  );
});

test("during the word pick, the drawer is nudged and everyone else is told who is picking", () => {
  assert.match(
    boardHint({ ...board, phase: "choosing", isDrawer: true })!,
    /Pick a word/,
  );
  assert.equal(
    boardHint({ ...board, phase: "choosing" }),
    "Bo is picking a word",
  );
});

test("a live round names whoever is drawing, bot or human", () => {
  assert.equal(boardHint(board), "Bo is drawing");
  assert.match(boardHint({ ...board, drawerIsAI: true })!, /The AI is drawing/);
});

// boardHint has no lobby or results case because canDraw is true in both, so there is nothing to
// explain. If that ever stops holding, the board goes quiet with no reason given: fail here first.
test("nobody who can draw is ever shown a reason they cannot", () => {
  const phases = [
    "lobby",
    "choosing",
    "playing",
    "intermission",
    "ended",
  ] as const;
  for (const phase of phases) {
    for (const amDrawer of [false, true]) {
      const you: PlayerInfo = { id: "me", name: "me" };
      const players = [you, { id: "bo", name: "Bo" }];
      const game: PublicGameState | null =
        phase === "lobby"
          ? null
          : {
              phase,
              drawerId: amDrawer ? "me" : "bo",
              turnIndex: 0,
              totalTurns: 6,
              round: 1,
              totalRounds: 3,
              turnEndsAt: null,
              wordLength: 3,
              hint: "___",
              scores: {},
              guessedIds: [],
            };
      const v = roomView(game, players, you);
      const hint = boardHint({
        canDraw: v.canDraw,
        youAreWatching: v.youAreWatching,
        phase: v.phase,
        isDrawer: v.isDrawer,
        drawerName: "Bo",
        drawerIsAI: false,
      });
      const who = `${phase}/${amDrawer ? "drawer" : "guesser"}`;
      if (v.canDraw) {
        assert.equal(hint, null, `${who} can draw but was told: ${hint}`);
        continue;
      }
      // The invariant the missing cases rest on: a dead board in these phases only ever means
      // "you are watching". Anything else falls through to the drawing line and lies.
      if (phase === "lobby" || phase === "ended") {
        assert.ok(
          v.youAreWatching,
          `${who} has a dead board, so boardHint needs a ${phase} case`,
        );
      }
      assert.notEqual(hint, null, `${who} gave no reason`);
    }
  }
});
