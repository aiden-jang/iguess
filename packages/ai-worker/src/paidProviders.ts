import type { VisionProvider } from "./visionProviders.ts";
import { promptFor, rank } from "./visionText.ts";
interface ChatLike {
  choices?: { message?: { content?: string } }[];
  content?: { text?: string }[];
}

export class OpenAIProvider implements VisionProvider {
  readonly name = "openai";
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async guess(
    pngBase64: string,
    hint?: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 24,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptFor(hint) },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${pngBase64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as ChatLike;
    return rank(data.choices?.[0]?.message?.content ?? "");
  }
}

export class AnthropicProvider implements VisionProvider {
  readonly name = "anthropic";
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async guess(
    pngBase64: string,
    hint?: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 24,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: pngBase64,
                },
              },
              { type: "text", text: promptFor(hint) },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as ChatLike;
    return rank(data.content?.[0]?.text ?? "");
  }
}
