import { readGuessRequest } from "./guessRequest.ts";
import type { Env } from "./env.ts";
import { selectProviders, guessWithFallback } from "./visionProviders.ts";
import { guessAuthFailure } from "./guessAuth.ts";
import { opsToPngBase64 } from "./strokeRender.ts";
import { ogPng } from "./ogCard.ts";

// Vision receives ink and the public masked hint, never the secret answer.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const providers = selectProviders(env);

    // Unauthenticated on purpose: it renders nothing but the room code it was handed, and a
    // link preview is fetched by a scraper that can't carry our shared secret.
    if (url.pathname === "/og") {
      const room = (url.searchParams.get("room") ?? "lobby").slice(0, 32);
      const mode = (url.searchParams.get("mode") ?? "").slice(0, 32);
      try {
        const png = await ogPng(room, mode);
        return new Response(png.buffer as ArrayBuffer, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch (err) {
        console.error(
          "og render failed:",
          err instanceof Error ? err.message : err,
        );
        return new Response("og unavailable", { status: 500 });
      }
    }

    if (url.pathname === "/health") {
      const provider = providers[0]?.name ?? "mock";
      return Response.json({
        ok: true,
        provider,
        guessReady: provider !== "mock" && Boolean(env.AI_SHARED_SECRET),
      });
    }

    if (url.pathname === "/guess" && request.method === "POST") {
      const usesRealProvider = providers.some(
        (provider) => provider.name !== "mock",
      );
      // Fail closed: a public workers.dev URL must never expose a real provider without a shared
      // secret. This also protects the Workers AI binding from anonymous quota usage.
      const authFailure = guessAuthFailure(
        env,
        usesRealProvider,
        request.headers.get("Authorization"),
      );
      if (authFailure) {
        const status = authFailure === "unauthorized" ? 401 : 503;
        return Response.json({ guess: "", error: authFailure }, { status });
      }
      const body = await readGuessRequest(request);
      if (!body)
        return Response.json({ error: "invalid_drawing" }, { status: 400 });
      const { ops, hint } = body;
      if (ops.length === 0)
        return Response.json({
          guess: "",
          alternatives: [],
          provider: providers[0]?.name,
        });

      // Rasterize once, only if a real vision model will use it (mock needs no image).
      let png = "";
      if (providers.some((p) => p.name !== "mock")) {
        try {
          png = await opsToPngBase64(ops);
        } catch (err) {
          console.error(
            "rasterize failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }

      // Provider failures fall through to the disclosed mock within bounded waits.
      const result = await guessWithFallback(providers, png, hint);
      if (result) return Response.json(result);
      return Response.json(
        { guess: "", alternatives: [], error: "vision_failed" },
        { status: 502 },
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
