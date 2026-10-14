import type { DrawOp } from "@iguess/shared";

const TIMEOUT_MS = 8_000;

/** What the AI said, best first. `alternatives` is what it also considered. */
export interface AIGuess {
  guess: string;
  alternatives: string[];
  // "mock" means it never saw the drawing.
  provider?: string;
}

const EMPTY: AIGuess = { guess: "", alternatives: [] };

// Empty ink is a valid empty answer. Transport failures throw so the mode can disclose them.
export async function requestAIGuess(
  baseUrl: string | undefined,
  secret: string | undefined,
  ops: DrawOp[],
  hint?: string,
): Promise<AIGuess> {
  if (ops.length === 0) return EMPTY; // nothing to ask — not a failure
  if (!baseUrl) throw new Error("no AI_WORKER_URL configured");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/guess`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ ops, hint }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ai-worker responded ${res.status}`);
    const data: unknown = await res.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("guess" in data) ||
      typeof data.guess !== "string" ||
      data.guess.length > 128
    )
      throw new Error("Invalid AI response");
    const alternatives = "alternatives" in data ? data.alternatives : [];
    if (
      !Array.isArray(alternatives) ||
      alternatives.length > 3 ||
      !alternatives.every(
        (word) => typeof word === "string" && word.length <= 128,
      )
    )
      throw new Error("Invalid AI alternatives");
    const provider =
      "provider" in data && typeof data.provider === "string"
        ? data.provider.slice(0, 32)
        : undefined;
    return { guess: data.guess, alternatives, provider };
  } finally {
    clearTimeout(t); // let fetch/timeout errors propagate so the loop can flag the AI as down
  }
}
