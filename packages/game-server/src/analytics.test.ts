import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAnalytics } from "../../../analytics/worker.ts";
import { pageForPath, isAnalyticsEvent } from "../../../analytics/schema.ts";
const request = (body: string, origin = "https://example.test") =>
  new Request("https://example.test/api/analytics", {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
test("private invite paths become a fixed category and unknown fields never enter analytics", async () => {
  assert.equal(pageForPath("/r/PRIVATE-ROOM?mode=PRIVATE#PRIVATE"), "invite");
  assert.equal(
    isAnalyticsEvent({ name: "page_view", page: "/r/PRIVATE" }),
    false,
  );
  assert.equal(
    isAnalyticsEvent({ name: "page_view", page: "invite", note: "PRIVATE" }),
    false,
  );
  const writes: unknown[] = [];
  const env = {
    EVENTS: {
      writeDataPoint: (point: unknown) => {
        writes.push(point);
      },
    },
  };
  assert.equal(
    (
      await handleAnalytics(
        request(JSON.stringify({ name: "page_view", page: "invite" })),
        env,
      )
    ).status,
    204,
  );
  assert.deepEqual(writes, [
    {
      indexes: ["iguess"],
      blobs: ["iguess", "page_view", "invite", ""],
      doubles: [1, 0],
    },
  ]);
});
test("analytics checks origin, body size and rate before writing, and tolerates an unavailable backend", async () => {
  assert.equal(
    (await handleAnalytics(request("{}", "https://other.test"), {})).status,
    403,
  );
  assert.equal(
    (await handleAnalytics(request("x".repeat(300)), {})).status,
    413,
  );
  const req = request("{}");
  req.headers.set("CF-Connecting-IP", "192.0.2.1");
  assert.equal(
    (
      await handleAnalytics(req, {
        EVENT_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await handleAnalytics(
        request(JSON.stringify({ name: "page_view", page: "game" })),
        {
          EVENTS: {
            writeDataPoint: () => {
              throw new Error("offline");
            },
          },
        },
      )
    ).status,
    204,
  );
});
