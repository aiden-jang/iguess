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
  use: {
    baseURL: "http://127.0.0.1:33100",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // Deliberately started WITHOUT AI_WORKER_URL, so the ai-worker never runs and the suite
      // cannot spend money. `.dev.vars` holds a real OpenAI key and outranks --var, so there is
      // no way to force the mock from the command line; not calling out at all is the only
      // safe answer. The AI guess path is covered by unit tests instead.
      command: "npx wrangler dev --port 33300",
      cwd: "packages/game-server",
      url: "http://127.0.0.1:33300/health",
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
