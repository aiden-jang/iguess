import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameModeName, ServerMessage } from "@iguess/shared";
import { GameEngine, type EngineDeps } from "./engine.ts";
import { createMode } from "./roomModes.ts";

function harness(mode: GameModeName) {
  const messages: { to?: string; message: ServerMessage }[] = [];
  const deps: EngineDeps = {
    broadcast: (message) => messages.push({ message }),
    sendToPlayer: (to, message) => messages.push({ to, message }),
    getName: (id) => id,
    clearCanvas() {},
    drawOp() {},
    canvasOpCount: () => 0,
    addVirtualPlayer() {},
    removeVirtualPlayer() {},
  };
  return {
    engine: new GameEngine(
      deps,
      createMode(mode, async () => ({ guess: "", alternatives: [] })),
    ),
    messages,
  };
}
for (const mode of [
  "classic",
  "ai",
  "ai-drawer",
  "duel",
  "team-battle",
] as const) {
  test(`${mode}: full match snapshot restores scores, role, mode state, hints and clock without leaking the answer`, async () => {
    const first = harness(mode);
    first.engine.startGame(["a", "b", "c"]);
    const choosing = first.engine.snapshot();
    if (choosing.phase === "choosing")
      first.engine.handleChooseWord(
        choosing.drawerId!,
        choosing.pendingChoices![0]!,
      );
    await Promise.resolve();
    await Promise.resolve();
    const saved = structuredClone(first.engine.snapshot());
    saved.scores.b = 120;
    saved.guessed = ["b"];
    saved.revealed = [0];
    saved.mode.bets = [["c", "cat"]];
    first.engine.dispose();
    const next = harness(mode);
    try {
      next.engine.restore(saved);
      assert.equal(next.engine.currentPhase, "playing");
      const restored = next.engine.snapshot();
      assert.deepEqual(restored.scores, saved.scores);
      assert.deepEqual(restored.guessed, saved.guessed);
      assert.deepEqual(restored.revealed, saved.revealed);
      if (restored.mode.drawProgress?.steps) {
        assert.ok(
          restored.mode.drawProgress.index >=
            (saved.mode.drawProgress?.index ?? 0),
        );
        restored.mode.drawProgress.index = saved.mode.drawProgress!.index;
      }
      assert.deepEqual(restored.mode, saved.mode);
      assert.equal(restored.word, saved.word);
      assert.equal(restored.drawerId, saved.drawerId);
      next.engine.sendStateTo("c");
      assert.ok(
        !next.messages.some(
          ({ to, message }) =>
            to === "c" &&
            (message.type === "your_word" || message.type === "word_choices"),
        ),
      );
      const state = next.messages.find(
        ({ message }) => message.type === "game_state",
      )!.message;
      assert.ok(state.type === "game_state");
      assert.equal(state.state.scores.b, 120);
      assert.ok(state.state.turnEndsAt! > Date.now());
    } finally {
      next.engine.dispose();
    }
  });
}
test("choosing recovery retains the offered words and spent skip", () => {
  const first = harness("classic");
  first.engine.startGame(["a", "b"]);
  first.engine.handleSkipWord("a");
  const saved = structuredClone(first.engine.snapshot());
  first.engine.dispose();
  const next = harness("classic");
  try {
    next.engine.restore(saved);
    next.engine.sendStateTo("a");
    const offer = next.messages.find(
      ({ message }) => message.type === "word_choices",
    )!.message;
    assert.ok(offer.type === "word_choices");
    assert.deepEqual(offer.words, saved.pendingChoices);
    assert.equal(offer.canSkip, false);
    assert.ok(next.engine.snapshot().deadlines.choosing! > Date.now());
  } finally {
    next.engine.dispose();
  }
});
test("intermission recovery preserves the next turn index and leaves scoring closed", () => {
  const first = harness("classic");
  first.engine.startGame(["a", "b"]);
  const choosing = first.engine.snapshot();
  first.engine.handleChooseWord("a", choosing.pendingChoices![0]!);
  const word = first.engine.snapshot().word!;
  first.engine.handleChat("b", word);
  const saved = structuredClone(first.engine.snapshot());
  first.engine.dispose();
  const next = harness("classic");
  try {
    next.engine.restore(saved);
    assert.equal(next.engine.currentPhase, "intermission");
    next.engine.sendStateTo("a");
    assert.ok(
      next.messages.some(
        ({ to, message }) =>
          to === "a" && message.type === "turn_end" && message.word === word,
      ),
    );
    assert.equal(next.engine.snapshot().turnIndex, 1);
    assert.equal(next.engine.handleChat("a", word), false);
    assert.ok(next.engine.snapshot().deadlines.intermission! > Date.now());
  } finally {
    next.engine.dispose();
  }
});
