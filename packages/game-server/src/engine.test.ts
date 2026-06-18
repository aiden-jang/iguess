import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ServerMessage, PublicGameState } from "shared";
import { GameEngine, type EngineDeps } from "./engine.ts";
import { ClassicMode, isClose } from "./modes/ClassicMode.ts";

// ---- Minimal fake timer harness ----
// The engine schedules a 60s per-turn timer and a 5s intermission timer via
// the global setTimeout. We capture them so tests can advance the game's
// timeline deterministically. flush(5000) fires only the intermission timers
// (advancing turns) and never the 60s turn timer, so turns end exactly when
// we drive a guess — not by wall-clock.
type Job = { id: number; fn: () => void; delay: number };
let jobs: Job[] = [];
let nextId = 1;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function installFakeTimers() {
  jobs = [];
  nextId = 1;
  globalThis.setTimeout = ((fn: () => void, delay = 0) => {
    const id = nextId++;
    jobs.push({ id, fn, delay });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    jobs = jobs.filter((j) => j.id !== id);
  }) as typeof clearTimeout;
}
function restoreTimers() {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}
// Run every pending job whose delay is <= maxDelay, repeating until quiescent
// so a job that schedules another due job also runs.
function flush(maxDelay = 5000) {
  let ran = true;
  while (ran) {
    ran = false;
    for (const j of jobs.filter((x) => x.delay <= maxDelay)) {
      jobs = jobs.filter((x) => x !== j);
      j.fn();
      ran = true;
    }
  }
}

// ---- Harness: an engine wired to in-memory deps that record output ----
function makeHarness(names: Record<string, string>, rounds = 1) {
  const broadcasts: ServerMessage[] = [];
  const sent: Record<string, ServerMessage[]> = {};
  const deps: EngineDeps = {
    broadcast: (m) => broadcasts.push(m),
    sendToPlayer: (id, m) => (sent[id] ??= []).push(m),
    clearCanvas: () => {},
    drawOp: () => {},
    getName: (id) => names[id] ?? id,
    addVirtualPlayer: () => {},
    removeVirtualPlayer: () => {},
  };
  const engine = new GameEngine(deps, new ClassicMode(rounds));
  return { engine, broadcasts, sent };
}

function latestState(broadcasts: ServerMessage[]): PublicGameState {
  for (let i = broadcasts.length - 1; i >= 0; i--) {
    const m = broadcasts[i]!;
    if (m.type === "game_state") return m.state;
  }
  throw new Error("no game_state broadcast yet");
}

// The secret word is only ever sent to the drawer; pull it from their inbox.
function wordSentTo(sent: Record<string, ServerMessage[]>, id: string): string {
  const inbox = sent[id] ?? [];
  for (let i = inbox.length - 1; i >= 0; i--) {
    const m = inbox[i]!;
    if (m.type === "your_word") return m.word;
  }
  throw new Error(`no your_word sent to ${id}`);
}

beforeEach(installFakeTimers);
afterEach(restoreTimers);

test("startGame is rejected with fewer than 2 players", () => {
  const { engine, broadcasts } = makeHarness({ a: "alice" });
  engine.startGame(["a"]);
  assert.equal(engine.currentPhase, "lobby");
  assert.ok(
    broadcasts.some(
      (m) => m.type === "system" && /at least 2/i.test(m.text)
    ),
    "should warn that 2 players are required"
  );
});

test("startGame begins turn 0 with the first player drawing", () => {
  const { engine, broadcasts, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);
  const st = latestState(broadcasts);
  assert.equal(st.phase, "playing");
  assert.equal(st.drawerId, "a");
  assert.equal(st.turnIndex, 0);
  assert.equal(st.totalTurns, 2);
  // Word goes only to the drawer, never broadcast or sent to the guesser.
  const word = wordSentTo(sent, "a");
  assert.ok(word.length > 0);
  assert.ok(!(sent["b"] ?? []).some((m) => m.type === "your_word"));
});

test("a correct guess scores the guesser and the drawer, and ends the turn", () => {
  const { engine, broadcasts, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);
  const word = wordSentTo(sent, "a");

  engine.handleChat("b", word); // bob guesses correctly

  const st = latestState(broadcasts);
  // Guesser: 50..100 by speed; drawer: +25 bonus.
  assert.ok(st.scores["b"]! >= 50 && st.scores["b"]! <= 100, `guesser=${st.scores["b"]}`);
  assert.equal(st.scores["a"], 25);
  assert.deepEqual(st.guessedIds, ["b"]);
  // All non-drawers guessed → turn ends → intermission.
  assert.equal(st.phase, "intermission");
});

test("the drawer rotates and the game ends after one full round", () => {
  const { engine, broadcasts, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);

  // Turn 0: a draws, b guesses.
  engine.handleChat("b", wordSentTo(sent, "a"));
  flush(5000); // intermission → turn 1 starts

  let st = latestState(broadcasts);
  assert.equal(st.phase, "playing");
  assert.equal(st.turnIndex, 1);
  assert.equal(st.drawerId, "b"); // drawer rotated

  // Turn 1: b draws, a guesses → round complete.
  engine.handleChat("a", wordSentTo(sent, "b"));
  flush(5000); // intermission → ended

  st = latestState(broadcasts);
  assert.equal(st.phase, "ended");
  assert.equal(st.drawerId, null);
  // Both played both roles: ~100 (guess) + 25 (drawer bonus) each.
  assert.ok(st.scores["a"]! > 100, `a=${st.scores["a"]}`);
  assert.ok(st.scores["b"]! > 100, `b=${st.scores["b"]}`);
});

test("hints start fully masked and reveal letters as the turn progresses", () => {
  const { engine, broadcasts, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);
  const word = wordSentTo(sent, "a");

  // At turn start nothing is revealed: one "_" per letter, same length.
  const hint0 = latestState(broadcasts).hint;
  assert.equal(hint0.length, word.length);
  assert.equal(hint0, "_".repeat(word.length));

  // Fire the reveal timers (all < 60s) but NOT the 60s turn-end timer.
  flush(55000);

  const st = latestState(broadcasts);
  assert.equal(st.phase, "playing", "revealing hints must not end the turn");
  const hint1 = st.hint;
  assert.equal(hint1.length, word.length);

  // Every revealed character matches the real word at that position; the rest
  // stay masked. At least one letter, but never the whole word, is revealed.
  let revealedCount = 0;
  for (let i = 0; i < word.length; i++) {
    if (hint1[i] !== "_") {
      assert.equal(hint1[i], word[i], `revealed char ${i} should match the word`);
      revealedCount++;
    }
  }
  assert.ok(revealedCount >= 1, "should reveal at least one letter");
  assert.ok(revealedCount < word.length, "must never reveal the whole word");
  assert.ok(revealedCount <= Math.ceil(word.length / 3), "reveal cap respected");
});

test("the drawer's own chat is swallowed, not treated as a guess", () => {
  const { engine, broadcasts, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);
  const word = wordSentTo(sent, "a");

  // The drawer typing the word must not score or end the turn.
  const handled = engine.handleChat("a", word);
  assert.equal(handled, true); // handled (hidden), but...
  const st = latestState(broadcasts);
  assert.equal(st.phase, "playing"); // turn did not end
  assert.equal(st.scores["a"], 0); // no points awarded
});

test("a wrong guess is passed through as normal chat", () => {
  const { engine, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);
  const word = wordSentTo(sent, "a");
  const wrong = word === "zzzz" ? "yyyy" : "zzzz";
  // false === "not consumed by the game, show it as chat"
  assert.equal(engine.handleChat("b", wrong), false);
});

test("multiple rounds: each player draws once per round and rotation wraps", () => {
  // 2 players × 3 rounds = 6 turns; drawer alternates a,b,a,b,a,b.
  const { engine, broadcasts, sent } = makeHarness({ a: "alice", b: "bob" }, 3);
  engine.startGame(["a", "b"]);
  assert.equal(latestState(broadcasts).totalTurns, 6);

  const drawers: string[] = [];
  for (let i = 0; i < 6; i++) {
    const st = latestState(broadcasts);
    drawers.push(st.drawerId!);
    const drawer = st.drawerId!;
    const guesser = drawer === "a" ? "b" : "a";
    engine.handleChat(guesser, wordSentTo(sent, drawer));
    flush(5000); // intermission → next turn (or end after the last)
  }
  assert.deepEqual(drawers, ["a", "b", "a", "b", "a", "b"]);
  assert.equal(latestState(broadcasts).phase, "ended");
});

test("isClose flags one-edit near-misses but not exact or distant guesses", () => {
  // One substitution / deletion / insertion away → close.
  assert.ok(isClose("rabbit", "rabbil"));
  assert.ok(isClose("planet", "planets"));
  assert.ok(isClose("guitar", "gitar"));
  // Exact match is a win, not "close".
  assert.equal(isClose("guitar", "guitar"), false);
  // Two or more edits away → not close.
  assert.equal(isClose("guitar", "guitng"), false); // two substitutions
  assert.equal(isClose("banana", "orange"), false);
  // Short words don't trigger the nudge (avoids constant noise).
  assert.equal(isClose("cat", "bat"), false);
});

test("a near-miss privately nudges only the guesser and stays public chat", () => {
  const { engine, sent } = makeHarness({ a: "alice", b: "bob" });
  engine.startGame(["a", "b"]);
  const word = wordSentTo(sent, "a");
  // Build a guess one letter off the secret word (only words >= 4 trigger).
  if (word.length < 4) return; // skip if the random word is too short
  const off = word.slice(0, -1) + (word.endsWith("x") ? "y" : "x");

  // Not consumed by the game → still shown as ordinary chat.
  assert.equal(engine.handleChat("b", off), false);
  // The guesser got a private "so close" nudge; the drawer did not.
  assert.ok(
    (sent["b"] ?? []).some((m) => m.type === "system" && /close/i.test(m.text)),
    "guesser should receive a private close nudge"
  );
  assert.ok(
    !(sent["a"] ?? []).some((m) => m.type === "system" && /close/i.test(m.text)),
    "nudge must not leak to the drawer"
  );
});
