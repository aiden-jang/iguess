import type { Env } from './env.ts';

export type GuessAuthFailure = 'ai_auth_not_configured' | 'unauthorized';

export function guessAuthFailure(
  env: Pick<Env, 'AI_SHARED_SECRET'>,
  usesRealProvider: boolean,
  authorization: string | null,
): GuessAuthFailure | null {
  if (usesRealProvider && !env.AI_SHARED_SECRET) return 'ai_auth_not_configured';
  if (env.AI_SHARED_SECRET && authorization !== `Bearer ${env.AI_SHARED_SECRET}`) return 'unauthorized';
  return null;
}
