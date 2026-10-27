import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";
test("explicit no-store update checks bypass the installed shell cache", () => {
  const handlers = new Map<string, (event: unknown) => void>();
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      caches: { match: () => Promise.resolve({}) },
      fetch: () => Promise.resolve({ ok: false }),
      self: {
        location: { origin: "https://app.test" },
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          handlers.set(name, handler),
      },
    },
  );
  let intercepted = false;
  handlers.get("fetch")!({
    request: { url: "https://app.test/", method: "GET", cache: "no-store" },
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);
});

function workerHarness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const writes: string[] = [];
  const deleted: string[] = [];
  const lifetimes: Promise<unknown>[] = [];
  let response = new Response("shell", {
    headers: { "Content-Type": "text/html" },
  });
  const cache = {
    put: async (key: string) => {
      writes.push(key);
    },
  };
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      caches: {
        open: async () => cache,
        match: async () => undefined,
        keys: async () => ["iguess-v1", "another-app-v1"],
        delete: async (key: string) => {
          deleted.push(key);
        },
      },
      fetch: async () => response,
      self: {
        location: { origin: "https://app.test" },
        clients: { claim: () => {} },
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          handlers.set(name, handler),
      },
    },
  );
  return {
    writes,
    deleted,
    lifetimes,
    respond: (next: Response) => {
      response = next;
    },
    async fetch(path: string) {
      let reply: Promise<unknown> | undefined;
      handlers.get("fetch")!({
        request: {
          url: new URL(path, "https://app.test").href,
          method: "GET",
          mode: "navigate",
        },
        respondWith: (result: Promise<unknown>) => {
          reply = result;
        },
        waitUntil: (promise: Promise<unknown>) => lifetimes.push(promise),
      });
      await reply;
      await Promise.all(lifetimes);
      return reply !== undefined;
    },
    async activate() {
      handlers.get("activate")!({
        waitUntil: (promise: Promise<unknown>) => lifetimes.push(promise),
      });
      await Promise.all(lifetimes);
    },
  };
}

test("room invitations and contextual queries cannot replace the public offline shell", async () => {
  const h = workerHarness();
  await h.fetch("/r/private-room?mode=classic");
  await h.fetch("/?url=https://outside.test/r/room");
  assert.equal(h.writes.length, 0);
});
test("failed or non-HTML navigation cannot poison the offline shell", async () => {
  const h = workerHarness();
  h.respond(new Response("unavailable", { status: 503 }));
  await h.fetch("/");
  h.respond(
    new Response("{}", { headers: { "Content-Type": "application/json" } }),
  );
  await h.fetch("/");
  assert.equal(h.writes.length, 0);
});
test("shell writes extend the fetch event lifetime", async () => {
  const h = workerHarness();
  await h.fetch("/");
  assert.deepEqual(h.writes, ["/"]);
  assert.equal(h.lifetimes.length, 1);
});
test("activation leaves other applications' caches intact", async () => {
  const h = workerHarness();
  await h.activate();
  assert.deepEqual(h.deleted, ["iguess-v1"]);
});
test("cross-origin requests bypass the service worker", async () => {
  assert.equal(await workerHarness().fetch("https://outside.test/"), false);
});
