import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerMessage } from "@iguess/shared";
import { sanitizeSettings } from "@iguess/shared";
import type { EngineContext, PlayerRef } from "./GameMode.ts";
import { DuelMode } from "./DuelMode.ts";
import { DOODLE_WORDS } from "../doodles.ts";

// A minimal in-memory EngineContext. Unlike the TeamBattle harness, Duel routes through
// ClassicMode.acceptGuess, so this implements participants() + turnFractionRemaining() +
// maybeEndTurn's roster read. `frac` (0..1) fixes the speed multiplier for deterministic scoring.
function makeCtx(frac = 1) {
  const broadcasts: ServerMessage[] = [];
  const scores: Record<string, number> = {};
  const guessed = new Set<string>();
  const roster = new Map<string, PlayerRef>();
  let drawerId: string | null = null;
  let word: string | null = null;
  let ended = false;
  const ctx = {
    participants: () => [...roster.values()],
    getName: (id: string) => id,
    broadcast: (m: ServerMessage) => broadcasts.push(m),
    sendToPlayer: () => {},
    draw: () => {},
    clearCanvas: () => {},
    awardPoints: (id: string, pts: number) =>
      (scores[id] = (scores[id] ?? 0) + pts),
    scores: () => scores,
    markGuessed: (id: string) => guessed.add(id),
    guessedIds: () => [...guessed],
    hasGuessed: (id: string) => guessed.has(id),
    addParticipant: (p: PlayerRef) => roster.set(p.id, p),
    removeParticipant: (id: string) => roster.delete(id),
    currentDrawerId: () => drawerId,
    currentWord: () => word,
    canvasOpCount: () => 0,
    hintsRevealed: () => 0,
    turnFractionRemaining: () => frac,
    syncState: () => {},
    endTurn: () => {
      ended = true;
    },
  } as unknown as EngineContext;
  return {
    ctx,
    broadcasts,
    scores,
    guessed,
    isEnded: () => ended,
    setTurn: (d: string | null, w: string | null) => {
      drawerId = d;
      word = w;
    },
    aiId: () => [...roster.keys()].find((id) => id !== "you")!,
  };
}

function configured(frac = 1) {
  const rec = makeCtx(frac);
  const mode = new DuelMode();
  mode.configure([{ id: "you", name: "you" }], rec.ctx);
  return { mode, ...rec };
}

test("turns alternate: you draw on even turns, the AI on odd ones", () => {
  const { mode, aiId } = configured();
  const ai = aiId();
  assert.equal(mode.pickDrawer(0), "you");
  assert.equal(mode.pickDrawer(1), ai);
  assert.equal(mode.pickDrawer(2), "you");
  assert.equal(mode.pickDrawer(3), ai);
});

test("on its own turn the AI only draws words it can render, without repeats", () => {
  const { mode } = configured();
  const picks: string[] = [];
  for (let t = 1; t < DOODLE_WORDS.length * 2; t += 2) {
    mode.pickDrawer(t); // odd → AI draws (latches the AI-turn flag)
    picks.push(mode.pickWord({} as EngineContext));
  }
  for (const w of picks)
    assert.ok(DOODLE_WORDS.includes(w), `not renderable: ${w}`);
  assert.equal(
    new Set(picks).size,
    DOODLE_WORDS.length,
    "repeated a doodle within one cycle",
  );
});

test("you get a choosing phase on your turn; the AI picks its own word", () => {
  const { mode, ctx } = configured();
  mode.pickDrawer(0); // your turn
  assert.ok(
    (mode.pickWordChoices(ctx)?.length ?? 0) >= 2,
    "you should get word choices",
  );
  mode.pickDrawer(1); // AI turn
  assert.equal(mode.pickWordChoices(ctx), null, "AI turns skip choosing");
});

test("only you can draw by hand, and only on your turn", () => {
  const { mode, ctx, setTurn, aiId } = configured();
  mode.pickDrawer(0);
  setTurn("you", "apple");
  assert.equal(mode.canDraw("you", ctx), true);
  mode.pickDrawer(1);
  setTurn(aiId(), "sun");
  assert.equal(
    mode.canDraw("you", ctx),
    false,
    "you can't draw on the AI's turn",
  );
});

test("on an AI-draw turn, your correct guess pays you AND the AI its drawer bonus", () => {
  const { mode, ctx, scores, setTurn, aiId, isEnded } = configured(1); // full time → 100
  const ai = aiId();
  mode.pickDrawer(1); // AI draws
  setTurn(ai, "sun");
  const handled = mode.onChat("you", "SUN", ctx);
  assert.equal(handled, true);
  assert.equal(
    scores["you"],
    120,
    "guesser paid by speed, +20% for needing no hints",
  );
  assert.equal(
    scores[ai],
    50,
    "AI drawer paid by how fast you read it: full time → 10 + 40",
  );
  assert.ok(isEnded(), "sole guesser correct → turn ends");
});

test("the end verdict reflects who out-scored whom", () => {
  const { mode, ctx, broadcasts, scores, aiId } = configured();
  const ai = aiId();
  scores["you"] = 220;
  scores[ai] = 130;
  mode.onGameEnd(ctx);
  const last = broadcasts.at(-1);
  assert.equal(last?.type, "system");
  assert.match(
    (last as { text: string }).text,
    /you beat the machine, 220-130/,
  );
});

test("the room's round count sets the length of a duel", () => {
  const { mode, ctx } = configured();
  mode.useSettings(sanitizeSettings({ rounds: 5 }));
  const { totalTurns, turnsPerRound } = mode.configure(
    [{ id: "you", name: "you" }],
    ctx,
  );
  assert.equal(turnsPerRound, 2, "a duel round is one draw each");
  assert.equal(
    totalTurns,
    10,
    "5 rounds should be 10 turns, not a hardcoded 6",
  );
});

test("the default duel is unchanged at three rounds each", () => {
  const { mode, ctx } = configured();
  mode.useSettings(sanitizeSettings({}));
  assert.equal(mode.configure([{ id: "you", name: "you" }], ctx).totalTurns, 6);
});
