import type { AiBinding, Env } from './env.ts';

// A pluggable vision backend. Swap providers without touching the worker's HTTP layer or the
// game server. Keys/config come from the Worker env (not process.env — this runs on Workers).
export interface VisionProvider {
  readonly name: string;
  guess(pngBase64: string): Promise<string>;
}

const PROMPT =
  'This is a doodle from a Pictionary-style game. In ONE lowercase word, ' +
  'what is the single object being drawn? Reply with only that word, no punctuation.';

const COMMON = [
  'cat', 'dog', 'house', 'tree', 'car', 'sun', 'fish', 'star', 'boat',
  'flower', 'apple', 'bird', 'face', 'heart', 'cloud',
];

interface ChatLike {
  choices?: { message?: { content?: string } }[];
  content?: { text?: string }[];
}

function normalize(s: string): string {
  const words = s.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  // Smaller vision models often reply "a cat" / "the dog" instead of one bare word; drop a leading
  // article so the guess is the actual noun, not "a".
  const first = words[0];
  if ((first === 'a' || first === 'an' || first === 'the') && words[1]) return words[1];
  return first ?? '';
}

// No key configured ⇒ the whole stack still runs end-to-end. It can't be "correct" (it never
// sees the word), but it proves the pipeline: ops → PNG → provider → guess → chat.
export class MockProvider implements VisionProvider {
  readonly name = 'mock';
  async guess(_pngBase64: string): Promise<string> {
    return COMMON[Math.floor(Math.random() * COMMON.length)]!;
  }
}

export class OpenAIProvider implements VisionProvider {
  readonly name = 'openai';
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async guess(pngBase64: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as ChatLike;
    return normalize(data.choices?.[0]?.message?.content ?? '');
  }
}

export class AnthropicProvider implements VisionProvider {
  readonly name = 'anthropic';
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async guess(pngBase64: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as ChatLike;
    return normalize(data.content?.[0]?.text ?? '');
  }
}

function base64ToBytes(b64: string): number[] {
  const bin = atob(b64);
  const bytes = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Free, real vision via Cloudflare Workers AI (LLaVA image-to-text). Runs on the same platform as
// this Worker, so there's no API key — just the [ai] binding — and it has a standing free daily
// allowance. Quality is below GPT-4o/Claude on crude doodles, but it actually looks at the drawing.
const DEFAULT_WORKERS_AI_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';

export class WorkersAIProvider implements VisionProvider {
  readonly name = 'workers-ai';
  constructor(
    private ai: AiBinding,
    private model: string,
  ) {}
  async guess(pngBase64: string): Promise<string> {
    const res = await this.ai.run(this.model, {
      image: base64ToBytes(pngBase64),
      prompt: PROMPT,
      max_tokens: 12,
    });
    return normalize(res.description ?? '');
  }
}

// Pick a provider: explicit override wins; otherwise a configured paid key, else free Workers AI
// (when the [ai] binding is present), else the mock. So the default is real-and-free, not mock.
export function selectProvider(env: Env): VisionProvider {
  const pick = env.VISION_PROVIDER?.toLowerCase();
  const openai = env.OPENAI_API_KEY;
  const anthropic = env.ANTHROPIC_API_KEY;
  const workersModel = env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL;

  if (pick === 'mock') return new MockProvider();
  if (pick === 'openai' && openai) return new OpenAIProvider(openai, env.OPENAI_MODEL ?? 'gpt-4o-mini');
  if (pick === 'anthropic' && anthropic) {
    return new AnthropicProvider(anthropic, env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest');
  }
  if ((pick === 'workers' || pick === 'workers-ai' || pick === 'cf') && env.AI) {
    return new WorkersAIProvider(env.AI, workersModel);
  }

  if (openai) return new OpenAIProvider(openai, env.OPENAI_MODEL ?? 'gpt-4o-mini');
  if (anthropic) return new AnthropicProvider(anthropic, env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest');
  if (env.AI) return new WorkersAIProvider(env.AI, workersModel);
  return new MockProvider();
}
