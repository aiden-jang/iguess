import type { AiBinding, Env } from './env.ts';
import { WORDS_BY_TIER } from '@iguess/shared/words';

// A pluggable vision backend. Swap providers without touching the worker's HTTP layer or the
// game server. Keys/config come from the Worker env (not process.env — this runs on Workers).
export interface VisionProvider {
  readonly name: string;
  // Ranked, best first. The runners-up are the interesting part: "guitar?  no... a fish?"
  guess(pngBase64: string, hint?: string): Promise<string[]>;
}

const BASE_PROMPT =
  'This is a doodle from a Pictionary-style game. What single object is being drawn? ' +
  'Reply with up to three lowercase single-word guesses, best first, separated by commas. ' +
  'No punctuation beyond the commas, no explanation.';

// The hint is the masked word every human guesser can already see ("_ u _ t a _"), never the
// answer. Without it the AI was playing blind against players who get letters for free.
function promptFor(hint?: string): string {
  const shape = hint?.trim();
  if (!shape) return BASE_PROMPT;
  const letters = shape.replace(/\s+/g, '').length;
  return (
    `${BASE_PROMPT} The answer has ${letters} letters and looks like "${shape}", ` +
    'where _ is a letter you have to work out. Your word must fit that pattern.'
  );
}

// The mock and the last-resort fallback guess from the game's own easy tier. A hard-coded
// fifteen looked obviously canned once the real list passed a few hundred words.
const COMMON = WORDS_BY_TIER.easy;

interface ChatLike {
  choices?: { message?: { content?: string } }[];
  content?: { text?: string }[];
}

// Filler that shows up around the actual noun: "it looks like a house", "maybe a barn".
const FILLER = new Set([
  'a', 'an', 'the', 'it', 'is', 'this', 'that', 'looks', 'look', 'like', 'maybe', 'probably',
  'appears', 'to', 'be', 'of', 'some', 'kind', 'sort', 'drawing', 'doodle', 'sketch', 'picture',
  'image', 'simple', 'i', 'think', 'see', 'there', 'seems', 'sketchy', 'black', 'white', 'and',
]);

// The answer is the last real word in the fragment: "a cat" and "it looks like a house" both
// end on the noun, while taking the first word would give "a" and "it".
function normalize(s: string): string {
  const words = s.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const meaty = words.filter((w) => !FILLER.has(w));
  return meaty[meaty.length - 1] ?? words[words.length - 1] ?? '';
}

// Models are asked for "cat, dog, house" but will happily return a sentence, a numbered list,
// or one word. Split on anything list-shaped and keep the first three that survive normalize.
function rank(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\n;/]|\bor\b/)) {
    const w = normalize(part);
    if (w && !out.includes(w)) out.push(w);
    if (out.length === 3) break;
  }
  return out;
}

// No key configured ⇒ the whole stack still runs end-to-end. It can't be "correct" (it never
// sees the word), but it proves the pipeline: ops → PNG → provider → guess → chat.
export class MockProvider implements VisionProvider {
  readonly name = 'mock';
  async guess(_pngBase64: string, hint?: string): Promise<string[]> {
    // Even the mock respects the hint's length, so a hinted run looks plausible end to end.
    const shape = hint?.replace(/\s+/g, '') ?? '';
    const fits = shape ? COMMON.filter((w) => w.length === shape.length) : COMMON;
    const pool = [...(fits.length ? fits : COMMON)];
    const out: string[] = [];
    while (out.length < 3 && pool.length) out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
    return out;
  }
}

export class OpenAIProvider implements VisionProvider {
  readonly name = 'openai';
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async guess(pngBase64: string, hint?: string): Promise<string[]> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 24,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptFor(hint) },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as ChatLike;
    return rank(data.choices?.[0]?.message?.content ?? '');
  }
}

export class AnthropicProvider implements VisionProvider {
  readonly name = 'anthropic';
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async guess(pngBase64: string, hint?: string): Promise<string[]> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 24,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
              { type: 'text', text: promptFor(hint) },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as ChatLike;
    return rank(data.content?.[0]?.text ?? '');
  }
}

function base64ToBytes(b64: string): number[] {
  const bin = atob(b64);
  const bytes = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Free, real vision via Cloudflare Workers AI. Runs on the same platform as this Worker, so there's
// no API key — just the [ai] binding — and it has a standing free daily allowance.
//
// Default is LLaVA: works with zero setup. It's weak on crude doodles, but real. For sharper guesses
// set WORKERS_AI_MODEL to '@cf/meta/llama-3.2-11b-vision-instruct' — BUT that model is license-gated
// (Cloudflare returns error 5016 until you accept its Community License once for your account), and
// it answers on `response` rather than `description` (both are handled below).
const DEFAULT_WORKERS_AI_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';

export class WorkersAIProvider implements VisionProvider {
  readonly name = 'workers-ai';
  constructor(
    private ai: AiBinding,
    private model: string,
  ) {}
  async guess(pngBase64: string, hint?: string): Promise<string[]> {
    const inputs = { image: base64ToBytes(pngBase64), prompt: promptFor(hint), max_tokens: 24 };
    try {
      const res = await this.ai.run(this.model, inputs);
      // LLaVA answers on `description`, the llama vision-instruct models on `response`.
      return rank(res.description ?? res.response ?? '');
    } catch {
      // First call after a cold start (model/WASM warmup) occasionally fails; one quick retry keeps
      // more first-guesses "real" before the worker falls through to the next provider.
      await new Promise((r) => setTimeout(r, 200));
      const res = await this.ai.run(this.model, inputs);
      return rank(res.description ?? res.response ?? '');
    }
  }
}

// Ordered list of providers to try, best-first, with fallbacks. The worker tries each in turn and
// uses the first that returns a guess — so a rate-limited or broken paid key (e.g. OpenAI 429)
// degrades to free Workers AI, then to the mock, instead of killing the AI entirely. The preferred
// provider (a configured paid key, or VISION_PROVIDER) goes first; MockProvider is always last and
// never throws, so there is always a guess.
export function selectProviders(env: Env): VisionProvider[] {
  const pick = env.VISION_PROVIDER?.toLowerCase();
  if (pick === 'mock') return [new MockProvider()];

  const openai = env.OPENAI_API_KEY;
  const anthropic = env.ANTHROPIC_API_KEY;
  const workersModel = env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL;
  const make: Record<string, () => VisionProvider | null> = {
    openai: () => (openai ? new OpenAIProvider(openai, env.OPENAI_MODEL ?? 'gpt-4o-mini') : null),
    anthropic: () =>
      anthropic ? new AnthropicProvider(anthropic, env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5') : null,
    workers: () => (env.AI ? new WorkersAIProvider(env.AI, workersModel) : null),
  };

  // Forced provider first (if available), then everything else in default priority as fallbacks.
  const order = ['openai', 'anthropic', 'workers'];
  if (pick === 'workers-ai' || pick === 'cf' || pick === 'workers') order.unshift('workers');
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

// The primary provider (what /health reports). Guessing uses the full fallback list above.
export function selectProvider(env: Env): VisionProvider {
  return selectProviders(env)[0]!;
}

// Try providers best-first; return the first non-throwing guess. Vision providers are skipped when
// there's no image (png === ''); MockProvider needs none and never throws, so — as long as the list
// ends in a mock (selectProviders guarantees this) — there is always a guess. Returns null only if
// handed a list with no viable provider.
export async function guessWithFallback(
  providers: VisionProvider[],
  png: string,
  hint?: string,
): Promise<{ guess: string; alternatives: string[]; provider: string } | null> {
  for (const p of providers) {
    if (p.name !== 'mock' && !png) continue; // no image to send a vision model
    try {
      const ranked = await p.guess(png, hint);
      return { guess: ranked[0] ?? '', alternatives: ranked.slice(1), provider: p.name };
    } catch (err) {
      console.error(`vision provider ${p.name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}
