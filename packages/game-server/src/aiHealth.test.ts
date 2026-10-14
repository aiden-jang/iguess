import { test } from "node:test";
import assert from "node:assert/strict";
import { aiWorkerProblem } from "./aiHealth.ts";

const replying = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const refusing = (message: string): typeof fetch =>
  (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;

test("a healthy worker on a real provider is silent", async () => {
  assert.equal(
    await aiWorkerProblem(
      "http://ai.test",
      replying({ ok: true, provider: "openai", guessReady: true }),
    ),
    null,
  );
});

test("a real provider without shared-secret readiness is reported", async () => {
  const problem = await aiWorkerProblem(
    "http://ai.test",
    replying({ ok: true, provider: "openai", guessReady: false }),
  );
  assert.match(problem!, /configure AI_SHARED_SECRET on both Workers/);
});

test("a trailing slash does not produce a double slash", async () => {
  let asked = "";
  const spy = (async (url: string) => {
    asked = url;
    return new Response(JSON.stringify({ ok: true, provider: "openai" }));
  }) as unknown as typeof fetch;
  await aiWorkerProblem("http://ai.test/", spy);
  assert.equal(asked, "http://ai.test/health");
});

test("falling back to the mock is a problem, not health", async () => {
  const problem = await aiWorkerProblem(
    "http://ai.test",
    replying({ ok: true, provider: "mock" }),
  );
  assert.match(problem!, /mock provider/);
});

test("no configured worker is reported rather than skipped", async () => {
  assert.match((await aiWorkerProblem(undefined))!, /unset/);
});

test("unreachable, non-200 and unparseable all report", async () => {
  assert.match(
    (await aiWorkerProblem(
      "http://ai.test",
      refusing("connect ECONNREFUSED"),
    ))!,
    /unreachable/,
  );
  assert.match(
    (await aiWorkerProblem("http://ai.test", replying({}, 502)))!,
    /responded 502/,
  );
  assert.match(
    (await aiWorkerProblem("http://ai.test", replying({ ok: false })))!,
    /did not report ok/,
  );
});
