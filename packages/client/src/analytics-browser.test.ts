import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { reportAnalytics } from "../../../analytics/browser.ts";
test("analytics sends a fixed category without cookies, private URLs or a referrer", async () => {
  const descriptors = ["window", "navigator", "fetch"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const replace = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  const send = mock.fn(async () => new Response(null, { status: 204 }));
  try {
    replace("window", { location: { hostname: "iguess.aidenjang.com" } });
    replace("navigator", {});
    replace("fetch", send);
    reportAnalytics({ name: "page_view", page: "invite" });
    assert.equal(send.mock.calls.length, 1);
    const options = (
      send.mock.calls[0]!.arguments as unknown as [string, RequestInit]
    )[1];
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(
      options.body,
      JSON.stringify({ name: "page_view", page: "invite" }),
    );
    for (const preference of [
      { globalPrivacyControl: true },
      { doNotTrack: "1" },
    ]) {
      replace("navigator", preference);
      reportAnalytics({ name: "page_view", page: "game" });
    }
    replace("navigator", {});
    replace("window", { location: { hostname: "localhost" } });
    reportAnalytics({ name: "page_view", page: "game" });
    assert.equal(send.mock.calls.length, 1);
    replace("window", { location: { hostname: "iguess.aidenjang.com" } });
    replace("fetch", () => {
      throw new Error("blocked");
    });
    assert.doesNotThrow(() =>
      reportAnalytics({ name: "page_view", page: "game" }),
    );
    await Promise.resolve();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
