import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProvider, selectProviders, MockProvider, WorkersAIProvider } from './visionProviders.ts';
import type { AiBinding } from './env.ts';

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
