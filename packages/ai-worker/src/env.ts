/** Minimal shape of the Cloudflare Workers AI binding we use (image-to-text / vision-chat).
 *  LLaVA returns { description }; the llama vision-instruct models return { response }. */
export interface AiBinding {
  run(
    model: string,
    inputs: { image: number[]; prompt: string; max_tokens?: number },
  ): Promise<{ description?: string; response?: string }>;
}

/** Bindings/secrets surfaced to the ai-worker. All optional — unset ⇒ Workers AI if bound, else mock. */
export interface Env {
  // Force a provider: "mock" | "openai" | "anthropic" | "workers". Otherwise: a configured paid key,
  // else Workers AI (if bound), else mock.
  VISION_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
  // Uses the Cloudflare account through the configured [ai] binding.
  AI?: AiBinding;
  WORKERS_AI_MODEL?: string;
  // Shared secret the game-server must present on /guess. Any real vision provider is disabled
  // until this is set; mock-only development remains open.
  AI_SHARED_SECRET?: string;
}
