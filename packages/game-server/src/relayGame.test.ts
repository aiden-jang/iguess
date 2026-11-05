import assert from "node:assert/strict";
import test from "node:test";
import type { DrawOp } from "@iguess/shared";
import { parseClientMessage } from "@iguess/shared/protocol";
import { parseServerMessage } from "@iguess/shared/serverProtocol";
import {
  RELAY_DRAW_MS,
  RELAY_GUESS_MS,
  type RelayClientMessage,
  type RelayState,
} from "@iguess/shared/relay";
import { RelayGame } from "./relayGame.ts";

const people = ["sam", "jo", "mina", "jules", "alex", "rae"].map((id) => ({
  id,
  name: id,
}));

function active(
  game: RelayGame,
  id: string,
): Extract<RelayState, { phase: "active" }> {
  const view = game.view(id);
  assert.equal(view.phase, "active");
  return view;
}

type Action = RelayClientMessage extends infer Message
  ? Message extends RelayClientMessage
    ? Omit<Message, "type" | "id" | "leg">
    : never
  : never;

function act(
  game: RelayGame,
  player: string,
  action: Exclude<Action, { action: "chain" }>,
) {
  const { id, leg } = active(game, player);
  return game.action(player, { type: "relay", id, leg, ...action });
}

function pick(game: RelayGame, count: number) {
  assert.equal(game.start(people.slice(0, count)), true);
  const chosen = people.slice(0, count).map(({ id }) => {
    const { assignment } = active(game, id);
    assert.equal(assignment.kind, "choose");
    return assignment.words[0]!;
  });
  people
    .slice(0, count)
    .forEach(({ id }, i) =>
      act(game, id, { action: "choose", word: chosen[i]! }),
    );
  return chosen;
}

function line(
  id: string,
): [Extract<DrawOp, { kind: "start" }>, Extract<DrawOp, { kind: "move" }>] {
  return [
    {
      kind: "start",
      strokeId: id,
      point: { x: 0.4, y: 0.4 },
      width: 4,
      color: "#202522",
    },
    { kind: "move", strokeId: id, points: [{ x: 0.55, y: 0.6 }] },
  ];
}

function sketch(game: RelayGame, player: string, id: string) {
  for (const op of line(id)) act(game, player, { action: "ink", op });
}

test("six chains rotate private clues and reject early reveals and stale actions", () => {
  const game = new RelayGame(() => {});
  try {
    assert.equal(game.start(people.slice(0, 2)), false);
    const words = pick(game, 6);
    assert.equal(new Set(words).size, 6);
    const { id, leg } = active(game, "sam");
    assert.deepEqual(active(game, "viewer").assignment, { kind: "watch" });
    assert.equal(game.reveal(id, 6, 0), null);
    sketch(game, "viewer", "imposter");
    for (const [i, player] of people.entries()) {
      assert.deepEqual(active(game, player.id).assignment, {
        kind: "draw",
        prompt: words[i],
        restart: false,
        ops: [],
      });
      assert.equal(act(game, player.id, { action: "pass" }), "empty");
      act(game, player.id, { action: "ink", op: line("tap")[0] });
      assert.equal(act(game, player.id, { action: "pass" }), "empty");
      act(game, player.id, { action: "ink", op: { kind: "clear" } });
      sketch(game, player.id, player.id);
      act(game, player.id, { action: "pass" });
    }
    game.action("sam", {
      type: "relay",
      id,
      leg,
      action: "pass",
      guess: "old pass",
    });
    assert.equal(active(game, "sam").passed, 0);
    for (const [i, player] of people.entries()) {
      const previous = people[(i + 5) % 6]!.id;
      assert.deepEqual(active(game, player.id).assignment, {
        kind: "guess",
        ops: line(previous),
      });
      act(game, player.id, { action: "pass", guess: `Guess by ${player.id}` });
    }
    assert.deepEqual(active(game, "sam").assignment, {
      kind: "draw",
      prompt: "Guess by rae",
      restart: false,
      ops: [],
    });
  } finally {
    game.reset();
  }
});

test("deadlines keep partial ink, skip missing links and show a fresh restart in the reveal", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const game = new RelayGame(() => {});
  try {
    const chosen = pick(game, 3);
    sketch(game, "sam", "partial");
    sketch(game, "jo", "jo");
    act(game, "jo", { action: "pass" });
    t.mock.timers.tick(RELAY_DRAW_MS);
    assert.deepEqual(active(game, "jo").assignment, {
      kind: "guess",
      ops: line("partial"),
    });
    assert.deepEqual(active(game, "sam").assignment, { kind: "missed" });
    assert.equal(active(game, "jo").passed, 1);
    act(game, "jo", { action: "pass", guess: "a cup" });
    t.mock.timers.tick(RELAY_GUESS_MS);
    const restart = active(game, "jo").assignment;
    assert.equal(restart.kind, "draw");
    assert.equal(restart.restart, true);
    assert.notEqual(restart.prompt, chosen[2]);
    sketch(game, "jo", "restarted");
    act(game, "jo", { action: "pass" });
    t.mock.timers.tick(RELAY_DRAW_MS);
    const view = game.view("viewer");
    assert.equal(view.phase, "reveal");
    assert.deepEqual(game.reveal(view.id, 3, 2)?.entries, [
      { kind: "skipped" },
      { kind: "skipped" },
      { kind: "drawing", ops: line("restarted"), restart: restart.prompt },
    ]);
  } finally {
    game.reset();
  }
});

test("a checkpoint restores the same private canvas and remaining time", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 2_000 });
  const original = new RelayGame(() => {});
  const restored = new RelayGame(() => {});
  try {
    pick(original, 3);
    sketch(original, "sam", "sam");
    t.mock.timers.tick(12_000);
    const checkpoint = JSON.parse(JSON.stringify(original.snapshot()));
    original.reset();
    t.mock.timers.tick(20_000);
    restored.restore(checkpoint);
    const sam = active(restored, "sam");
    assert.equal(sam.id, checkpoint.id);
    assert.equal(sam.leg, 0);
    assert.equal(sam.endsAt - Date.now(), RELAY_DRAW_MS - 12_000);
    assert.equal(sam.assignment.kind, "draw");
    assert.deepEqual(sam.assignment.ops, line("sam"));
    restored.leave("sam");
    assert.deepEqual(active(restored, "sam").assignment, { kind: "watch" });
    assert.equal(active(restored, "jo").passed, 1);
  } finally {
    original.reset();
    restored.reset();
  }
});

test("relay wire messages bound input and strip unrecognized ink fields", () => {
  const id = "example";
  const message = {
    type: "relay",
    action: "ink",
    id,
    leg: 0,
    op: {
      ...line("a")[0],
      point: { x: 0.4, y: 0.4, hidden: "secret" },
      hidden: "secret",
    },
  };
  assert.deepEqual(parseClientMessage(JSON.stringify(message)), {
    type: "relay",
    action: "ink",
    id,
    leg: 0,
    op: { ...line("a")[0], erase: undefined },
  });
  assert.equal(
    parseClientMessage(JSON.stringify({ ...message, leg: 0.5 })),
    null,
  );
  assert.equal(
    parseClientMessage(
      JSON.stringify({
        type: "relay",
        action: "pass",
        id,
        leg: 1,
        guess: "x".repeat(81),
      }),
    ),
    null,
  );
  assert.equal(
    parseServerMessage(
      JSON.stringify({
        type: "relay_state",
        state: {
          phase: "active",
          id,
          leg: 0,
          endsAt: 100,
          passed: 0,
          total: 99,
          assignment: { kind: "watch" },
        },
      }),
    ),
    null,
  );
});
