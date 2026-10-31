import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// Journeys use the production SPA and real room sockets. Only renderer probes use Vite modules.
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // rooms are shared state; parallel specs would collide in one room
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:33300",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: [
    {
      // Override adjacent dev credentials: browser journeys must never reach paid vision.
      command:
        "pnpm exec wrangler dev --ip 127.0.0.1 --port 33300 --inspector-port 33501 --infer-origin-from-routes=false --var AI_WORKER_URL: --persist-to .wrangler/e2e-state",
      cwd: "packages/game-server",
      url: "http://127.0.0.1:33300/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { WRANGLER_LOG_PATH: resolve(".wrangler/e2e-logs/game/") },
    },
    {
      // This separate config has no Workers AI binding or adjacent provider credentials.
      // Every AI test also checks /health before POSTing; a broken mock pin fails closed.
      command:
        "pnpm --filter @iguess/ai-worker exec wrangler dev --config wrangler.mock.toml --ip 127.0.0.1 --port 33400 --inspector-port 33502 --var VISION_PROVIDER:mock --persist-to .wrangler/e2e-state",
      url: "http://127.0.0.1:33400/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { WRANGLER_LOG_PATH: resolve(".wrangler/e2e-logs/ai/") },
    },
    {
      command: "pnpm --filter @iguess/client dev",
      url: "http://127.0.0.1:33100",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
