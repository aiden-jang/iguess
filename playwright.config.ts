import { defineConfig } from "@playwright/test";

// The suite runs the real stack: the SPA, the game-server Durable Object, and the ai-worker.
// Anything less would test a mock of the thing that actually breaks — the socket.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // rooms are shared state; parallel specs would collide in one room
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:33100",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // No AI_WORKER_URL, so the game the browser specs play can never reach a vision worker at
      // all. That is why wrangler.toml carries no [vars] block: this command would inherit it.
      command: "npx wrangler dev --port 33300",
      cwd: "packages/game-server",
      url: "http://127.0.0.1:33300/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // The ai-worker, pinned to the mock provider. VISION_PROVIDER=mock returns before any paid
      // provider is even constructed (see selectProviders), and .dev.vars sets only a key, never
      // this, so the flag applies. aiWorker.spec.ts asserts /health agrees before it POSTs, so a
      // broken pin fails the run rather than spending money. Nothing else here talks to it.
      command: "npx wrangler dev --port 33400 --var VISION_PROVIDER:mock",
      cwd: "packages/ai-worker",
      url: "http://127.0.0.1:33400/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @iguess/client dev",
      url: "http://127.0.0.1:33100",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
