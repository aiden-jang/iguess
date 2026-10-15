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
