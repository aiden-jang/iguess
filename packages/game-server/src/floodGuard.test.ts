import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowMessage } from './floodGuard.ts';

test('normal play is never throttled', () => {
  const rate = { count: 0, windowStart: 0 };
  for (let i = 0; i < 60; i++) assert.equal(allowMessage(rate, 1000), true);
});

test('a flood is dropped once the window is spent', () => {
  const rate = { count: 0, windowStart: 1000 };
  let allowed = 0;
  for (let i = 0; i < 500; i++) if (allowMessage(rate, 1000)) allowed++;
  assert.equal(allowed, 200);
});

test('the next second starts a fresh window', () => {
  const rate = { count: 0, windowStart: 1000 };
  for (let i = 0; i < 500; i++) allowMessage(rate, 1000);
  assert.equal(allowMessage(rate, 2000), true);
});
