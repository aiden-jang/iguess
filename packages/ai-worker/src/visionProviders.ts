import type { VisionProvider } from "./visionTypes.ts";
export type { VisionProvider } from "./visionTypes.ts";
import { OpenAIProvider, AnthropicProvider } from "./paidProviders.ts";
import { promptFor, rank } from "./visionText.ts";
import type { AiBinding, Env } from "./env.ts";
import { WORDS_BY_TIER } from "@iguess/shared/words";

const COMMON = WORDS_BY_TIER.easy;

export class MockProvider implements VisionProvider {
  readonly name = "mock";
  async guess(
    _pngBase64: string,
    hint?: string,
    _signal?: AbortSignal,
  ): Promise<string[]> {
    // Mock guesses are random words, constrained by the public hint length.
    const shape = hint?.replace(/\s+/g, "") ?? "";
    const fits = shape
      ? COMMON.filter((w) => w.length === shape.length)
      : COMMON;
    const pool = [...(fits.length ? fits : COMMON)];
    const out: string[] = [];
    while (out.length < 3 && pool.length)
      out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
    return out;
  }
}

function base64ToBytes(b64: string): number[] {
  const bin = atob(b64);
  const bytes = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Workers AI uses the bound account. Some models require account-level license acceptance.
const DEFAULT_WORKERS_AI_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

export class WorkersAIProvider implements VisionProvider {
  readonly name = "workers-ai";
  constructor(
    private ai: AiBinding,
    private model: string,
  ) {}
  async guess(
    pngBase64: string,
    hint?: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const inputs = {
      image: base64ToBytes(pngBase64),
      prompt: promptFor(hint),
      max_tokens: 24,
    };
    try {
      const res = await this.ai.run(this.model, inputs);
      // LLaVA replies on `description`, the llama models on `response`.
      return rank(res.description ?? res.response ?? "");
    } catch {
      // The very first call after a cold start sometimes fails while the model warms up.
      await new Promise((r) => setTimeout(r, 200));
      signal?.throwIfAborted();
      const res = await this.ai.run(this.model, inputs);
      return rank(res.description ?? res.response ?? "");
    }
  }
}

// Configured providers are tried in order; the disclosed mock is the final fallback.
export function selectProviders(env: Env): VisionProvider[] {
  const pick = env.VISION_PROVIDER?.toLowerCase();
  if (pick === "mock") return [new MockProvider()];

  const openai = env.OPENAI_API_KEY;
  const anthropic = env.ANTHROPIC_API_KEY;
  const workersModel = env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL;
  const make: Record<string, () => VisionProvider | null> = {
    openai: () =>
      openai
        ? new OpenAIProvider(openai, env.OPENAI_MODEL ?? "gpt-4o-mini")
        : null,
    anthropic: () =>
      anthropic
        ? new AnthropicProvider(
            anthropic,
            env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
          )
        : null,
    workers: () =>
      env.AI ? new WorkersAIProvider(env.AI, workersModel) : null,
  };

  const order = ["openai", "anthropic", "workers"];
  if (pick === "workers-ai" || pick === "cf" || pick === "workers")
    order.unshift("workers");
  else if (pick && order.includes(pick)) order.unshift(pick);

  const out: VisionProvider[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const p = make[key]?.();
    if (p && !seen.has(p.name)) {
      seen.add(p.name);
      out.push(p);
    }
  }
  out.push(new MockProvider()); // always-succeeds backstop
  return out;
}

export function selectProvider(env: Env): VisionProvider {
  return selectProviders(env)[0]!;
}

// Share the upstream request budget across configured providers; skip vision without an image.
export async function guessWithFallback(
  providers: VisionProvider[],
  png: string,
  hint?: string,
  timeoutMs = Math.floor(
    6_000 /
      Math.max(
        1,
        providers.filter((provider) => provider.name !== "mock").length,
      ),
  ),
): Promise<{ guess: string; alternatives: string[]; provider: string } | null> {
  for (const p of providers) {
    if (p.name !== "mock" && !png) continue; // no image to send a vision model
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Vision deadline exceeded"));
        }, timeoutMs);
      });
      const ranked = await Promise.race([
        p.guess(png, hint, controller.signal),
        timeout,
      ]);
      return {
        guess: ranked[0] ?? "",
        alternatives: ranked.slice(1),
        provider: p.name,
      };
    } catch (err) {
      console.error(
        `vision provider ${p.name} failed:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
