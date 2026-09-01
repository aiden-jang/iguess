import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawOp } from "@iguess/shared";
import { lastStrokeId, dropStroke } from "@iguess/shared/strokeLog";

const stroke = (id: string): DrawOp[] => [
  { kind: "start", strokeId: id, color: "#000", width: 4, point: { x: 0, y: 0 } },
  { kind: "move", strokeId: id, points: [{ x: 1, y: 1 }] },
  { kind: "end", strokeId: id },
];

test("undo names the most recent stroke", () => {
  assert.equal(lastStrokeId([...stroke("a"), ...stroke("b"), ...stroke("c")]), "c");
});

test("undo on an empty canvas names no stroke", () => {
  assert.equal(lastStrokeId([]), null);
});

test("dropping a stroke removes all three of its ops and nothing else", () => {
  const log = [...stroke("a"), ...stroke("b")];
  const after = dropStroke(log, "b");
  assert.deepEqual(after, stroke("a"));
});

test("repeated undo peels strokes back one at a time", () => {
  let log = [...stroke("a"), ...stroke("b")];
  log = dropStroke(log, lastStrokeId(log)!);
  assert.deepEqual(log, stroke("a"));
  log = dropStroke(log, lastStrokeId(log)!);
  assert.deepEqual(log, []);
  assert.equal(lastStrokeId(log), null);
});

test("a clear op has no stroke id and survives a drop", () => {
  const log: DrawOp[] = [{ kind: "clear" }, ...stroke("a")];
  assert.deepEqual(dropStroke(log, "a"), [{ kind: "clear" }]);
});
