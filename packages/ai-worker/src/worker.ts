import type { DrawOp } from '@iguess/shared';
import type { Env } from './env.ts';
import { selectProviders, guessWithFallback } from './visionProviders.ts';
import { opsToPngBase64 } from './strokeRender.ts';

// The worker only ever sees the pixels (a rasterized PNG of the strokes), never the secret word —
// so it can't cheat. Providers are tried best-first with fallbacks (see selectProviders).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const providers = selectProviders(env);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, provider: providers[0]?.name ?? 'mock' });
    }

    if (url.pathname === '/guess' && request.method === 'POST') {
      // When a shared secret is configured, require it — otherwise this paid vision endpoint is
      // open to anyone who learns the URL and can burn tokens directly.
      if (env.AI_SHARED_SECRET && request.headers.get('Authorization') !== `Bearer ${env.AI_SHARED_SECRET}`) {
        return Response.json({ guess: '', error: 'unauthorized' }, { status: 401 });
      }
      const body = (await request.json().catch(() => null)) as { ops?: DrawOp[] } | null;
      const ops = Array.isArray(body?.ops) ? body.ops : [];
      if (ops.length === 0) return Response.json({ guess: '', provider: providers[0]?.name });

      // Rasterize once, only if a real vision model will use it (mock needs no image).
      let png = '';
      if (providers.some((p) => p.name !== 'mock')) {
        try {
          png = await opsToPngBase64(ops);
        } catch (err) {
          console.error('rasterize failed:', err instanceof Error ? err.message : err);
        }
      }

      // Try each provider in turn; the first non-throwing guess wins. A rate-limited/broken paid
      // key (e.g. OpenAI 429) thus falls through to free Workers AI, then the mock — never a dead AI.
      const result = await guessWithFallback(providers, png);
      if (result) return Response.json(result);
      return Response.json({ guess: '', error: 'vision_failed' }, { status: 502 });
    }

    return new Response('Not found', { status: 404 });
  },
};
