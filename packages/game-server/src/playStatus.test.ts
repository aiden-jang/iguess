import { test } from "node:test";
import assert from "node:assert/strict";
import { playStatus } from "./playStatus.ts";
const reply = (body: unknown): typeof fetch =>
  (async () => Response.json(body)) as typeof fetch;
test("unconfigured vision performs no network request", async () => {
  const fail = (async () => {
    throw new Error("must not fetch");
  }) as typeof fetch;
  assert.deepEqual(await playStatus(undefined, fail), {
    vision: "unavailable",
  });
});
test("mock and unauthenticated providers are never advertised as ready", async () => {
  for (const [index, body] of [
    { ok: true, provider: "mock", guessReady: true },
    { ok: true, provider: "openai", guessReady: false },
    { ok: true, provider: "openai" },
  ].entries()) {
    assert.deepEqual(
      await playStatus(`https://status-${index}.test`, reply(body)),
      { vision: "unavailable" },
    );
  }
});
test("ready health is cached without making a guess request", async () => {
  let calls = 0;
  const fetcher = (async (url: string) => {
    assert.equal(url, "https://ready.test/health");
    calls++;
    return Response.json({ ok: true, provider: "openai", guessReady: true });
  }) as typeof fetch;
  assert.deepEqual(await playStatus("https://ready.test", fetcher), {
    vision: "ready",
  });
  await playStatus("https://ready.test", fetcher);
  assert.equal(calls, 1);
});
test("failed readiness requests leave curated and human play available", async () => {
  const fetcher = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  assert.deepEqual(await playStatus("https://offline.test", fetcher), {
    vision: "unavailable",
  });
});
