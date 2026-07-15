/** Bindings/secrets surfaced to the ai-worker. All optional — unset ⇒ the mock provider. */
export interface Env {
  // Force a provider: "mock" | "openai" | "anthropic". Otherwise: first available key, else mock.
  VISION_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
  // Shared secret the game-server must present on /guess. When set, unauthenticated calls are
  // rejected so the (paid) vision endpoint can't be hit directly. Unset ⇒ open (dev/mock).
  AI_SHARED_SECRET?: string;
}
