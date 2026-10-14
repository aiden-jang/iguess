import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 33100,
    // Explicit IPv4. Left to default, Vite binds ::1 only, so anything that resolves the dev
    // server as 127.0.0.1 (Playwright's webServer poll, curl, CI health checks) never connects.
    host: "127.0.0.1",
    // Proxy the room WebSocket to the game-server Worker (wrangler dev) so dev is same-origin,
    // matching prod (one Worker serves the SPA + /rooms/:id/ws).
    proxy: {
      // 127.0.0.1, not localhost: Node resolves localhost to ::1 while wrangler listens on IPv4.
      "/play-status": { target: "http://127.0.0.1:33300", changeOrigin: true },
      "/rooms": { target: "http://127.0.0.1:33300", changeOrigin: true, ws: true },
    },
  },
});
