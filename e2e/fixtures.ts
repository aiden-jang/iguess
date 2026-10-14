import { test as base, expect } from "@playwright/test";

let nextClient = 1;

// Local Workers accept this header; Cloudflare replaces it in production. Each test represents
// a different client so the per-IP connection limit doesn't throttle the entire browser suite.
export const test = base.extend<{ localClient: void }>({
  localClient: [
    async ({ context, baseURL }, use, testInfo) => {
      if (baseURL !== "http://127.0.0.1:33100")
        throw new Error("Browser fixtures require the local stack");
      await context.setExtraHTTPHeaders({
        "CF-Connecting-IP": `192.0.${testInfo.workerIndex % 255}.${(nextClient++ % 254) + 1}`,
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
