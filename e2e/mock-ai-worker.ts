import worker from "../packages/ai-worker/src/worker";
import { readGuessRequest } from "../packages/ai-worker/src/guessRequest";
import { opsToPngBase64 } from "../packages/ai-worker/src/strokeRender";
import type { Env } from "../packages/ai-worker/src/env";

/** Only the binding-free local config exposes pixel evidence; production uses its own entry. */
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname !== "/render-check")
      return worker.fetch(request, env);
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const drawing = await readGuessRequest(request);
    if (!drawing) return new Response(null, { status: 400 });
    const png = await opsToPngBase64(drawing.ops);
    return new Response(
      Uint8Array.from(atob(png), (c) => c.charCodeAt(0)),
      {
        headers: { "Content-Type": "image/png" },
      },
    );
  },
};
