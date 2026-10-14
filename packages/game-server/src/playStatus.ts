let cached: { url: string; until: number; vision: string } | undefined;

export async function playStatus(
  url: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!url) return { vision: "unavailable" };
  if (cached?.url === url && cached.until > Date.now())
    return { vision: cached.vision };
  let vision = "unavailable";
  try {
    const response = await fetcher(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      provider?: string;
      guessReady?: boolean;
    };
    if (
      response.ok &&
      body.ok &&
      body.provider &&
      body.provider !== "mock" &&
      body.guessReady === true
    )
      vision = "ready";
  } catch {
    /* A missing health response never prevents human or curated play. */
  }
  cached = { url, until: Date.now() + 30_000, vision };
  return { vision };
}
