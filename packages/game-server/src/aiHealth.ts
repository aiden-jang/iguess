const TIMEOUT_MS = 8_000;

interface HealthBody {
  ok?: boolean;
  provider?: string;
}

// Ask the ai-worker how it is and say what is wrong, or null when nothing is. A deployed worker
// that has fallen back to the mock is the case worth catching: its guesses become random words
// of the right length, and today the room only finds out mid-game.
export async function aiWorkerProblem(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!baseUrl) return 'AI_WORKER_URL is unset, so AI modes have no AI';
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return `ai-worker unreachable: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (!res.ok) return `ai-worker /health responded ${res.status}`;
  const body = (await res.json().catch(() => null)) as HealthBody | null;
  if (!body?.ok) return 'ai-worker /health did not report ok';
  if (body.provider === 'mock') return 'ai-worker is on the mock provider: check the vision key';
  return null;
}
