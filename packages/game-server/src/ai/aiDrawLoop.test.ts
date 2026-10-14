import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawOp } from "@iguess/shared";
import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { startDrawLoop } from "./aiDrawLoop.ts";

function harness(word: string) {
  const ops: DrawOp[] = [];
  const ctx = {
    draw: (op: DrawOp) => ops.push(op),
    currentWord: () => word,
  } as unknown as EngineContext;
  const turn = { word } as TurnContext;
  return { ops, ctx, turn };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("a stroke arrives in pieces, not all at once", async () => {
  const { ops, ctx, turn } = harness("house");
  const stop = startDrawLoop(turn, ctx, { tickMs: 1 });
  await new Promise((r) => setTimeout(r, 300));
  stop();
  const moves = ops.filter((o) => o.kind === "move");
  assert.ok(
    moves.length > ops.filter((o) => o.kind === "start").length,
    "each stroke should take several move ops to appear",
  );
  for (const m of moves) {
    if (m.kind === "move")
      assert.ok(
        m.points.length <= 4,
        "a tick should drip a few points, not a whole stroke",
      );
  }
});

test("stopping mid-drawing leaves the canvas alone", async () => {
  const { ops, ctx, turn } = harness("cat");
  const stop = startDrawLoop(turn, ctx, { tickMs: 1 });
  await new Promise((r) => setTimeout(r, 40));
  stop();
  const seen = ops.length;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ops.length, seen, "ops kept arriving after stop()");
});

test("a word with no doodle draws nothing rather than throwing", async () => {
  const { ops, ctx, turn } = harness("bureaucracy");
  const stop = startDrawLoop(turn, ctx, { tickMs: 1 });
  await settle();
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.equal(ops.length, 0);
});
