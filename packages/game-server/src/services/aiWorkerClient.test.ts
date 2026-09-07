import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAIGuess } from './aiWorkerClient.ts';
import type { DrawOp } from '@iguess/shared';

const OPS = [{ kind: 'stroke', id: 's1', points: [{ x: 1, y: 1 }] }] as unknown as DrawOp[];

async function withFetch<T>(stub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const replying = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('the provider that answered survives the hop', async () => {
  const said = await withFetch(replying({ guess: 'dog', alternatives: ['cow'], provider: 'mock' }), () =>
    requestAIGuess('http://ai.test', undefined, OPS),
  );
  assert.equal(said.provider, 'mock');
  assert.equal(said.guess, 'dog');
});

test('an unreachable worker throws instead of answering nothing', async () => {
  await assert.rejects(
    withFetch(replying({ error: 'vision_failed' }, 502), () =>
      requestAIGuess('http://ai.test', undefined, OPS),
    ),
  );
});

test('no worker configured throws, so the room hears about it', async () => {
  await assert.rejects(
    withFetch(
      (() => {
        throw new Error('should never be asked');
      }) as unknown as typeof fetch,
      () => requestAIGuess(undefined, undefined, OPS),
    ),
  );
});

test('an empty canvas is not a failure', async () => {
  const said = await withFetch(
    (() => {
      throw new Error('should never be asked');
    }) as unknown as typeof fetch,
    () => requestAIGuess('http://ai.test', undefined, []),
  );
  assert.deepEqual(said, { guess: '', alternatives: [] });
});
