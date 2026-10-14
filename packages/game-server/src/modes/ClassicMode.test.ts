import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerMessage } from "@iguess/shared";
import type { EngineContext, PlayerRef } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { TIERS, WORDS_BY_TIER, tierOf } from "@iguess/shared/words";

function makeCtx(frac: number, word: string) {
  const scores: Record<string, number> = {};
  const guessed = new Set<string>();
  const roster = new Map<string, PlayerRef>([
    ["drawer", { id: "drawer", name: "drawer" }],
    ["you", { id: "you", name: "you" }],
    ["other", { id: "other", name: "other" }],
  ]);
  const ctx = {
    participants: () => [...roster.values()],
    getName: (id: string) => id,
    broadcast: (_m: ServerMessage) => {},
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
    currentDrawerId: () => "drawer",
    currentWord: () => word,
    canvasOpCount: () => 0,
    hintsRevealed: () => 0,
    turnFractionRemaining: () => frac,
    syncState: () => {},
    endTurn: () => {},
  } as unknown as EngineContext;
  return { ctx, scores };
}

function scoreFor(word: string) {
  const mode = new ClassicMode();
  const { ctx, scores } = makeCtx(1, word);
  mode.onChat("you", word, ctx);
  return scores["you"] ?? 0;
}

test("a harder word pays more for the same guess speed", () => {
  const easy = scoreFor(WORDS_BY_TIER.easy[0]!);
  const medium = scoreFor(WORDS_BY_TIER.medium[0]!);
  const hard = scoreFor(WORDS_BY_TIER.hard[0]!);
  assert.ok(easy < medium, `expected easy ${easy} < medium ${medium}`);
  assert.ok(medium < hard, `expected medium ${medium} < hard ${hard}`);
});

test("the drawer is offered one word from each tier", () => {
  const mode = new ClassicMode();
  const { ctx } = makeCtx(1, "apple");
  const choices = mode.pickWordChoices!(ctx)!;
  assert.deepEqual(choices.map(tierOf), TIERS);
});

test("no word is offered twice in one game", () => {
  const mode = new ClassicMode();
  const { ctx } = makeCtx(1, "apple");
  const seen = new Set<string>();
  for (let turn = 0; turn < 40; turn++) {
    for (const w of mode.pickWordChoices!(ctx)!) {
      assert.ok(!seen.has(w), `${w} was offered twice`);
      seen.add(w);
    }
  }
});

function drawerScoreFor(frac: number) {
  const mode = new ClassicMode();
  const { ctx, scores } = makeCtx(frac, "apple");
  mode.onChat("you", "apple", ctx);
  return scores["drawer"] ?? 0;
}

test("drawing well pays the drawer more than drawing badly", () => {
  const quick = drawerScoreFor(0.9);
  const slow = drawerScoreFor(0.1);
  assert.ok(quick > slow * 2, `fast ${quick} should clearly beat slow ${slow}`);
});

test("the drawer is still paid when nobody is quick", () => {
  assert.ok(drawerScoreFor(0) > 0);
});

test("a trailing player earns more per guess than the leader would", () => {
  const mode = new ClassicMode();
  const { ctx, scores } = makeCtx(0.5, "apple");
  scores["other"] = 1000; // runaway leader
  mode.onChat("you", "apple", ctx);
  const trailing = scores["you"]!;

  const mode2 = new ClassicMode();
  const h2 = makeCtx(0.5, "apple");
  h2.scores["you"] = 1000; // already the leader
  mode2.onChat("you", "apple", h2.ctx);
  const leading = h2.scores["you"]! - 1000;

  assert.ok(
    trailing > leading,
    `trailing ${trailing} should beat leading ${leading}`,
  );
});

test("the comeback bonus cannot exceed a third", () => {
  // Measured against an identical guess with no deficit, so it stays honest as the other
  // multipliers change rather than pinning a magic total.
  const flat = makeCtx(1, "apple");
  new ClassicMode().onChat("you", "apple", flat.ctx);

  const behind = makeCtx(1, "apple");
  behind.scores["other"] = 1_000_000;
  new ClassicMode().onChat("you", "apple", behind.ctx);

  const ratio = behind.scores["you"]! / flat.scores["you"]!;
  assert.ok(ratio > 1.3 && ratio <= 1.36, `runaway bonus ratio: ${ratio}`);
});

test("reading the drawing before any letter appears pays extra", () => {
  const aided = makeCtx(1, "apple");
  (aided.ctx as unknown as { hintsRevealed: () => number }).hintsRevealed =
    () => 2;
  new ClassicMode().onChat("you", "apple", aided.ctx);

  const unaided = makeCtx(1, "apple");
  new ClassicMode().onChat("you", "apple", unaided.ctx);

  assert.ok(
    unaided.scores["you"]! > aided.scores["you"]!,
    `no-hint ${unaided.scores["you"]} should beat hinted ${aided.scores["you"]}`,
  );
});

test("calling the machine's guess pays when it lands, and is never read as a guess", () => {
  const mode = new ClassicMode();
  const { ctx, scores } = makeCtx(1, "guitar");
  mode.onTurnStart({ turnIndex: 0, drawerId: "drawer", word: "guitar" }, ctx);

  // "?guitar" must not win the round outright even though it contains the answer.
  mode.onChat("you", "?guitar", ctx);
  assert.equal(scores["you"] ?? 0, 0, "a call is not a guess");

  (
    mode as unknown as { settleBets: (s: string, c: typeof ctx) => void }
  ).settleBets("guitar", ctx);
  assert.ok((scores["you"] ?? 0) > 0, "a correct call should pay");
});

test("a wrong call pays nothing and is spent", () => {
  const mode = new ClassicMode();
  const { ctx, scores } = makeCtx(1, "guitar");
  mode.onTurnStart({ turnIndex: 0, drawerId: "drawer", word: "guitar" }, ctx);
  mode.onChat("you", "?horse", ctx);
  const settle = (
    mode as unknown as { settleBets: (s: string, c: typeof ctx) => void }
  ).settleBets.bind(mode);
  settle("cow", ctx);
  assert.equal(scores["you"] ?? 0, 0);
  settle("horse", ctx); // the call is gone; saying it later must not pay
  assert.equal(scores["you"] ?? 0, 0);
});

test("a new turn clears last turn's calls", () => {
  const mode = new ClassicMode();
  const { ctx, scores } = makeCtx(1, "guitar");
  mode.onTurnStart({ turnIndex: 0, drawerId: "drawer", word: "guitar" }, ctx);
  mode.onChat("you", "?horse", ctx);
  mode.onTurnStart({ turnIndex: 1, drawerId: "drawer", word: "apple" }, ctx);
  (
    mode as unknown as { settleBets: (s: string, c: typeof ctx) => void }
  ).settleBets("horse", ctx);
  assert.equal(scores["you"] ?? 0, 0);
});
