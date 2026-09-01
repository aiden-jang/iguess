import type { DrawOp } from '@iguess/shared';

const TIMEOUT_MS = 8_000;

/** What the AI said, best first. `alternatives` is what it also considered. */
export interface AIGuess {
  guess: string;
  alternatives: string[];
}

const EMPTY: AIGuess = { guess: '', alternatives: [] };

// Thin HTTP client to the ai-worker. "Nothing to ask" (no worker configured, or an empty canvas)
// resolves to "" so the game never stalls. A GENUINE failure (worker down, timeout, bad response)
// THROWS, so callers can tell "the AI is unreachable" apart from "the AI had no guess" and surface
// it once to players. The base URL is passed in (from the room's env), since this runs on Workers.
export async function requestAIGuess(
  baseUrl: string | undefined,
  secret: string | undefined,
  ops: DrawOp[],
  hint?: string,
): Promise<AIGuess> {
  if (!baseUrl || ops.length === 0) return EMPTY; // nothing to ask — not a failure
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/guess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ ops, hint }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ai-worker responded ${res.status}`);
    const data = (await res.json()) as { guess?: string; alternatives?: string[] };
    return { guess: data.guess ?? '', alternatives: data.alternatives ?? [] };
  } finally {
    clearTimeout(t); // let fetch/timeout errors propagate so the loop can flag the AI as down
  }
}
