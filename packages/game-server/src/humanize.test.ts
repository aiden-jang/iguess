import { test } from "node:test";
import assert from "node:assert/strict";
import { DOODLE_WORDS, DOODLES, doodleFor } from "./doodles.ts";
import { humanize } from "./humanize.ts";

function points(strokes: ReturnType<typeof doodleFor>) {
  return strokes.flatMap((ops) =>
    ops.flatMap((op) =>
      op.kind === "start" ? [op.point] : op.kind === "move" ? op.points : [],
    ),
  );
}

function bounds(strokes: ReturnType<typeof doodleFor>) {
  const p = points(strokes);
  return {
    x0: Math.min(...p.map((q) => q.x)),
    x1: Math.max(...p.map((q) => q.x)),
    y0: Math.min(...p.map((q) => q.y)),
    y1: Math.max(...p.map((q) => q.y)),
  };
}

test("the same word never draws the same picture twice", () => {
  for (const word of DOODLE_WORDS) {
    const a = JSON.stringify(points(doodleFor(word)));
    const b = JSON.stringify(points(doodleFor(word)));
    assert.notEqual(a, b, `${word} rendered identically twice`);
  }
});

test("the wobble stays on the canvas", () => {
  for (const word of DOODLE_WORDS) {
    for (let i = 0; i < 20; i++) {
      for (const p of points(doodleFor(word))) {
        assert.ok(
          p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1,
          `${word} left the canvas at ${p.x},${p.y}`,
        );
      }
    }
  }
});

test("the subject is still recognisable: bounds stay near the original", () => {
  for (const word of DOODLE_WORDS) {
    const before = bounds(DOODLES[word]!());
    for (let i = 0; i < 10; i++) {
      const after = bounds(doodleFor(word));
      for (const k of ["x0", "x1", "y0", "y1"] as const) {
        assert.ok(
          Math.abs(after[k] - before[k]) < 0.14,
          `${word} ${k} moved ${Math.abs(after[k] - before[k]).toFixed(3)}`,
        );
      }
    }
  }
});

test("every stroke keeps its id and its end op", () => {
  const raw = DOODLES.cat!();
  const out = humanize(raw);
  assert.equal(out.length, raw.length);
  for (let i = 0; i < raw.length; i++) {
    const id = raw[i]!.find((o) => o.kind === "start")!.strokeId;
    assert.equal(out[i]!.find((o) => o.kind === "start")!.strokeId, id);
    assert.equal(out[i]!.at(-1)!.kind, "end");
  }
});
