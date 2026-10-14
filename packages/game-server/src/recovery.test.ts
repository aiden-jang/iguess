import { test } from "node:test";
import assert from "node:assert/strict";
import { CheckpointStore, ROOM_TTL_MS } from "./checkpointStore.ts";
import { RoomPersistence } from "./roomPersistence.ts";
import { testStorage } from "./testing/storage.ts";
import { ReconnectSessions } from "./reconnectSessions.ts";
import { GameClock } from "./gameClock.ts";
import { RoomCanvas } from "./roomCanvas.ts";
import { normalizeMode } from "./roomModes.ts";
import { MAX_DRAW_OPS, parseClientMessage } from "@iguess/shared/protocol";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
test("checkpoints round-trip Unicode across byte-bounded chunks and remove stale chunks", async () => {
  const fake = testStorage();
  const store = new CheckpointStore<{ text: string }>(fake.context.storage);
  const text = "😬 café".repeat(20_000);
  await store.save({ text });
  assert.deepEqual(await store.load(), { text });
  assert.ok(fake.values.size > 2);
  for (const [key, value] of fake.values)
    if (key !== "checkpoint")
      assert.ok(new TextEncoder().encode(String(value)).length <= 48_000);
  await store.save({ text: "small" });
  assert.equal(fake.values.size, 2);
  assert.deepEqual(await store.load(), { text: "small" });
});
test("expired, incomplete and corrupt checkpoints do not restore partial games", async () => {
  const fake = testStorage();
  let now = 10;
  const store = new CheckpointStore(fake.context.storage, () => now);
  await store.save({ phase: "playing" });
  now += ROOM_TTL_MS;
  assert.equal(await store.load(), null);
  now = 10;
  fake.values.delete("checkpoint:0");
  assert.equal(await store.load(), null);
  fake.values.set("checkpoint:0", "{");
  assert.equal(await store.load(), null);
  fake.values.set("checkpoint", { version: 1, parts: -1, expires: 100 });
  assert.equal(await store.load(), null);
});
test("checkpoint failures preserve the previous complete game", async () => {
  const fake = testStorage();
  const store = new CheckpointStore(fake.context.storage);
  await store.save({ text: "kept" });
  await assert.rejects(store.save({ text: "x".repeat(6_000_000) }), /budget/);
  assert.deepEqual(await store.load(), { text: "kept" });
});
test("persistence saves mutations made during an in-flight write and disposes delayed work", async () => {
  const fake = testStorage();
  let value = 1;
  const persistence = new RoomPersistence(fake.context, () => ({ value }));
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = persistence.store.save.bind(persistence.store);
  let writes = 0;
  persistence.store.save = async (snapshot) => {
    if (++writes === 1) await held;
    await save(snapshot);
  };
  persistence.changed();
  const first = persistence.flush();
  value = 2;
  persistence.changed();
  release();
  await first;
  assert.deepEqual(await persistence.store.load(), { value: 2 });
  assert.equal(writes, 2);
  value = 3;
  persistence.changed();
  await persistence.dispose();
  await fake.settle();
  assert.deepEqual(await persistence.store.load(), { value: 2 });
});
test("reconnect credentials prove possession; public IDs and guessed values cannot reclaim a seat", async () => {
  let now = Date.now();
  const sessions = new ReconnectSessions([], () => now);
  const { token, record } = await sessions.create();
  assert.equal(token.length, 64);
  assert.equal(await sessions.resolve(record.id), null);
  assert.equal(await sessions.resolve("0".repeat(64)), null);
  assert.equal((await sessions.resolve(token))?.id, record.id);
  assert.ok(!JSON.stringify(sessions.snapshot()).includes(token));
  const restored = new ReconnectSessions(sessions.snapshot(), () => now);
  restored.revoke(record.id);
  assert.equal((await restored.resolve(token))?.revoked, true);
  now += ROOM_TTL_MS + 1;
  assert.equal(await restored.resolve(token), null);
});
test("clock replacement and disposal leave no orphaned jobs", async () => {
  const fired: string[] = [];
  const clock = new GameClock((key) => fired.push(key));
  clock.after("turn", 5);
  clock.after("turn", 10);
  clock.after("hint", 5);
  clock.cancel("hint");
  await delay(25);
  assert.deepEqual(fired, ["turn"]);
  clock.after("intermission", 5);
  clock.clear();
  await delay(15);
  assert.deepEqual(fired, ["turn"]);
});
test("clock recovery pauses downtime instead of expiring every restored timer", async () => {
  const clock = new GameClock(() => {});
  clock.restore({ turn: 1050 }, 1000);
  const deadline = clock.snapshot().turn!;
  assert.ok(deadline >= Date.now() + 80);
  clock.clear();
});
test("canvas supports undoing fill and bounds retained operations", () => {
  const canvas = new RoomCanvas();
  canvas.apply({
    kind: "fill",
    strokeId: "fill",
    color: "#ffffff",
    point: { x: 0, y: 0 },
  });
  canvas.undo();
  assert.deepEqual(canvas.snapshot(), []);
  for (let i = 0; i < MAX_DRAW_OPS; i++)
    assert.equal(canvas.apply({ kind: "end", strokeId: "a" }), true);
  assert.equal(canvas.apply({ kind: "end", strokeId: "a" }), false);
  canvas.apply({ kind: "clear" });
  assert.deepEqual(canvas.snapshot(), []);
});
test("wire validation rejects malformed, oversized and non-finite operations", () => {
  for (const input of [
    null,
    new ArrayBuffer(5),
    "{",
    JSON.stringify({ type: "draw", op: null }),
    JSON.stringify({ type: "chat", text: 8 }),
    JSON.stringify({ type: "chat", text: "x".repeat(501) }),
    JSON.stringify({ type: "cursor", point: { x: 2, y: 0 } }),
    JSON.stringify({
      type: "draw",
      op: {
        kind: "move",
        strokeId: "x",
        points: Array(257).fill({ x: 0, y: 0 }),
      },
    }),
  ])
    assert.equal(parseClientMessage(input), null);
  assert.deepEqual(parseClientMessage('{"type":"ready","ready":true}'), {
    type: "ready",
    ready: true,
  });
  assert.equal(normalizeMode("toString"), "classic");
});

test("every curated doodle survives the same wire decoder as human ink", async () => {
  const { DOODLE_WORDS, doodleFor } = await import("./doodles.ts");
  const { isDrawOp } = await import("@iguess/shared/protocol");
  for (const word of DOODLE_WORDS) {
    const drawing = doodleFor(word, () => 0.5);
    assert.ok(drawing.length > 0, word);
    assert.ok(drawing.flat().every(isDrawOp), `invalid operation in ${word}`);
  }
});

test("credential churn cannot evict the reconnect credential of a reserved seat", async () => {
  const sessions = new ReconnectSessions();
  const active = await sessions.create();
  const protectedIds = new Set([active.record.id]);
  for (let i = 0; i < 260; i++) await sessions.create(protectedIds);
  assert.equal((await sessions.resolve(active.token))?.id, active.record.id);
  assert.equal(sessions.snapshot().length, 256);
});
