import { test } from "node:test";
import assert from "node:assert/strict";
import { nearBottom } from "./useChatScroll";

test("sitting at the very end follows new messages", () => {
  assert.equal(nearBottom(1000, 700, 300), true);
});

test("a few pixels of slack still counts as following", () => {
  assert.equal(nearBottom(1000, 660, 300), true, "40px from the end should still follow");
});

test("reading back through the log stops following", () => {
  assert.equal(nearBottom(1000, 400, 300), false);
  assert.equal(nearBottom(1000, 0, 300), false);
});

test("the threshold is exclusive, so exactly 48px away stops following", () => {
  assert.equal(nearBottom(1000, 653, 300), true, "47px away follows");
  assert.equal(nearBottom(1000, 652, 300), false, "48px away does not");
});

test("a log shorter than its box always follows", () => {
  assert.equal(nearBottom(120, 0, 300), true);
});
