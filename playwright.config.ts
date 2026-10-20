import { defineConfig } from "@playwright/test";

// The suite runs the real stack: the SPA, the game-server Durable Object, and the ai-worker.
// Anything less would test a mock of the thing that actually breaks — the socket.
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
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
      // Override adjacent dev credentials: browser journeys must never reach paid vision.
      command:
        "pnpm exec wrangler dev --port 33300 --var AI_WORKER_URL: --persist-to .wrangler/e2e-state",
      cwd: "packages/game-server",
      url: "http://127.0.0.1:33300/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // This separate config has no Workers AI binding or adjacent provider credentials.
      // Every AI test also checks /health before POSTing; a broken mock pin fails closed.
      command:
        "pnpm --filter @iguess/ai-worker exec wrangler dev --config wrangler.mock.toml --port 33400 --var VISION_PROVIDER:mock --persist-to .wrangler/e2e-state",
      url: "http://127.0.0.1:33400/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @iguess/client dev",
      url: "http://127.0.0.1:33100",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
