import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectProvider,
  selectProviders,
  guessWithFallback,
  MockProvider,
  WorkersAIProvider,
  type VisionProvider,
} from './visionProviders.ts';
import type { AiBinding } from './env.ts';

const throwing = (name: string): VisionProvider => ({
  name,
  guess: async () => {
    throw new Error(`${name} boom`);
  },
});
const fixed = (name: string, word: string): VisionProvider => ({ name, guess: async () => word });

test('defaults to mock when no keys are configured', () => {
  assert.equal(selectProvider({}).name, 'mock');
});

test('VISION_PROVIDER=mock forces mock even with a key present', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'mock', OPENAI_API_KEY: 'sk-x' }).name, 'mock');
});

test('picks the explicitly requested provider when its key is present', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }).name, 'anthropic');
  assert.equal(selectProvider({ VISION_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }).name, 'openai');
});

test('falls back to the first available key when no explicit pick', () => {
  assert.equal(selectProvider({ OPENAI_API_KEY: 'k' }).name, 'openai');
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: 'k' }).name, 'anthropic');
});

test('an explicit provider without its key falls through to mock', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'openai' }).name, 'mock');
});

test('the mock guess is one of the common words', async () => {
  const guess = await new MockProvider().guess('');
  assert.match(guess, /^[a-z]+$/);
});

const fakeAI: AiBinding = { run: async () => ({ description: 'a cat' }) };

test('uses free Workers AI by default when the [ai] binding is present and no paid key', () => {
  assert.equal(selectProvider({ AI: fakeAI }).name, 'workers-ai');
});

test('a paid key still wins over the Workers AI binding', () => {
  assert.equal(selectProvider({ AI: fakeAI, OPENAI_API_KEY: 'k' }).name, 'openai');
});

test('VISION_PROVIDER=workers forces Workers AI when bound', () => {
  assert.equal(selectProvider({ VISION_PROVIDER: 'workers', AI: fakeAI }).name, 'workers-ai');
});

test('WorkersAIProvider strips a leading article from the model output', async () => {
  const guess = await new WorkersAIProvider(fakeAI, '@cf/llava').guess('QUJD'); // "a cat" -> "cat"
  assert.equal(guess, 'cat');
});

const names = (env: Parameters<typeof selectProviders>[0]) => selectProviders(env).map((p) => p.name);

test('a paid key falls back to Workers AI then mock (so a 429 key never kills the AI)', () => {
  assert.deepEqual(names({ AI: fakeAI, OPENAI_API_KEY: 'k' }), ['openai', 'workers-ai', 'mock']);
});

test('mock is always the last-resort backstop', () => {
  assert.deepEqual(names({}), ['mock']);
  assert.deepEqual(names({ AI: fakeAI }), ['workers-ai', 'mock']);
});

test('VISION_PROVIDER forces the primary but keeps the rest as fallbacks', () => {
  assert.deepEqual(names({ VISION_PROVIDER: 'workers', AI: fakeAI, OPENAI_API_KEY: 'k' }), [
    'workers-ai',
    'openai',
    'mock',
  ]);
});

test('guessWithFallback falls through a throwing provider to the next (429 key → free AI)', async () => {
  const res = await guessWithFallback([throwing('openai'), fixed('workers-ai', 'house'), new MockProvider()], 'PNG');
  assert.deepEqual(res, { guess: 'house', provider: 'workers-ai' });
});

test('guessWithFallback lands on the mock when every vision provider throws', async () => {
  const res = await guessWithFallback([throwing('openai'), throwing('workers-ai'), new MockProvider()], 'PNG');
  assert.equal(res?.provider, 'mock');
  assert.match(res?.guess ?? '', /^[a-z]+$/);
});

test('guessWithFallback skips vision providers when there is no image, using the mock', async () => {
  const res = await guessWithFallback([fixed('workers-ai', 'house'), new MockProvider()], '');
  assert.equal(res?.provider, 'mock'); // workers-ai skipped (no image); mock needs none
});

test('the hint reaches the prompt but the answer never does', async () => {
  const seen: string[] = [];
  const spy: VisionProvider = {
    name: 'spy',
    async guess(_png: string, hint?: string) {
      seen.push(hint ?? '');
      return 'guitar';
    },
  };
  await guessWithFallback([spy], 'png', 'g _ i t _ r');
  assert.deepEqual(seen, ['g _ i t _ r']);
  assert.ok(!seen[0]!.includes('guitar'));
});

test('a guess with no hint still works', async () => {
  const p: VisionProvider = { name: 'p', async guess(_png, hint) { return hint ? 'hinted' : 'blind'; } };
  assert.equal((await guessWithFallback([p], 'png'))?.guess, 'blind');
});

test('the mock respects the hint length so hinted runs look real', async () => {
  const mock = new MockProvider();
  for (let i = 0; i < 30; i++) {
    assert.equal((await mock.guess('', '_ _ _ _')).length, 4);
  }
});
