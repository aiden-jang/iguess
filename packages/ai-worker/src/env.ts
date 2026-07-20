/** Minimal shape of the Cloudflare Workers AI binding we use (image-to-text). */
export interface AiBinding {
  run(
    model: string,
    inputs: { image: number[]; prompt: string; max_tokens?: number },
  ): Promise<{ description?: string }>;
}

/** Bindings/secrets surfaced to the ai-worker. All optional — unset ⇒ Workers AI if bound, else mock. */
export interface Env {
  // Force a provider: "mock" | "openai" | "anthropic" | "workers". Otherwise: a configured paid key,
  // else free Workers AI (if the [ai] binding is present), else mock.
  VISION_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
  // Cloudflare Workers AI: free real vision, no key — just the [ai] binding in wrangler.toml.
  AI?: AiBinding;
  WORKERS_AI_MODEL?: string;
  // Shared secret the game-server must present on /guess. When set, unauthenticated calls are
  // rejected so the (paid) vision endpoint can't be hit directly. Unset ⇒ open (dev/mock).
  AI_SHARED_SECRET?: string;
}
