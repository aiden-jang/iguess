/** Bindings declared in wrangler.toml, surfaced to the Worker + Durable Object. */
export interface Env {
  EVENT_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  // One GameRoom Durable Object instance per room id.
  GAME_ROOM: DurableObjectNamespace;
  // The built client SPA (packages/client/dist), served from this same Worker.
  ASSETS: Fetcher;
  // Base URL of the ai-worker (guess/draw). Set on the deploy command, not in wrangler.toml.
  // Unset = AI modes tell the room the AI is unavailable and play on without it.
  AI_WORKER_URL?: string;
  // Shared secret presented to the ai-worker so its paid /guess endpoint can reject direct hits.
  AI_SHARED_SECRET?: string;
  // Cloudflare native rate-limiting binding, keyed by client IP to cap new-connection spam at the
  // edge (see wrangler.toml [[unsafe.bindings]]). Optional so local dev / tests run without it
  // (the Worker degrades open when it's absent).
  RATE_LIMITER?: RateLimiter;
  // Optional so local dev and the e2e suite run without it: an absent binding drops the events.
  EVENTS?: AnalyticsEngineDataset;
}

// Minimal shape of the Workers rate-limiting binding (avoids a hard dep on the ambient type).
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
