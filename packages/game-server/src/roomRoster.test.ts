import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomRoster, type Connection } from "./roomRoster.ts";
function connection(id: string): Connection {
  return {
    player: { id, name: id },
    token: "token",
    rate: { count: 0, windowStart: 0 },
    ws: { close() {} } as WebSocket,
  };
}
test("roster reserves reconnecting host, ignores stale socket closes, then transfers authority", async () => {
  const left: string[] = [];
  const roster = new RoomRoster((member) => left.push(member.player.id), 10);
  const a = connection("a"),
    b = connection("b"),
    reopened = connection("a");
  try {
    roster.attach(a, false);
    roster.attach(b, false);
    roster.ready("a", true);
    roster.detach(a);
    assert.equal(roster.isHost("a"), true);
    roster.attach(reopened, false);
    roster.detach(a);
    assert.equal(roster.connections.get("a"), reopened);
    assert.equal(
      roster.players().find((player) => player.id === "a")!.ready,
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(left, []);
    roster.detach(reopened);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(left, ["a"]);
    assert.equal(roster.isHost("b"), true);
  } finally {
    roster.dispose();
  }
});
test("player and watcher capacities are independent, including late match joins", () => {
  const roster = new RoomRoster(() => {});
  try {
    for (let i = 0; i < 7; i++) roster.attach(connection(`p${i}`), false);
    for (let i = 0; i < 12; i++) roster.attach(connection(`w${i}`), true);
    assert.equal(roster.canJoin("new", true), false);
    assert.equal(roster.canJoin("new", false), true);
    roster.attach(connection("eighth"), false);
    assert.equal(roster.canJoin("new", false), false);
    assert.equal(roster.canJoin("w0", true), true);
    roster.ready("w0", true);
    assert.equal(
      roster.players().find((player) => player.id === "w0")!.ready,
      false,
    );
  } finally {
    roster.dispose();
  }
});
test("restored seats retain host and ready state until the grace window ends", () => {
  const original = new RoomRoster(() => {}),
    restored = new RoomRoster(() => {});
  try {
    original.attach(connection("a"), false);
    original.ready("a", true);
    restored.restore(structuredClone(original.snapshot()));
    restored.attach(connection("a"), false);
    assert.equal(restored.isHost("a"), true);
    assert.equal(restored.players()[0]!.ready, true);
  } finally {
    original.dispose();
    restored.dispose();
  }
});

test("a returning seat outside the active match becomes a watcher", () => {
  const roster = new RoomRoster(() => {});
  try {
    roster.attach(connection("host"), false);
    roster.attach(connection("returning"), false);
    roster.attach(connection("returning"), true);
    assert.equal(roster.spectator("returning"), true);
  } finally {
    roster.dispose();
  }
});

test("a handoff deadline holds a disconnected seat past the ordinary grace window", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const departed: string[] = [];
  const roster = new RoomRoster(
    (member) => departed.push(member.player.id),
    8_000,
    (id) => (id === "relay" ? 30_000 : 0),
  );
  const relay = connection("relay");
  const classic = connection("classic");
  roster.attach(relay, false);
  roster.attach(classic, false);
  roster.detach(relay);
  roster.detach(classic);
  t.mock.timers.tick(9_000);
  assert.deepEqual(departed, ["classic"]);
  assert.equal(roster.has("relay"), true);
  roster.attach(relay, false);
  t.mock.timers.tick(10_000);
  assert.equal(roster.connections.get("relay"), relay);
  roster.detach(relay);
  t.mock.timers.tick(9_999);
  assert.equal(roster.has("relay"), true);
  t.mock.timers.tick(1);
  assert.deepEqual(departed, ["classic", "relay"]);
  roster.dispose();
});
