import type { WordTier } from './events.ts';
import wordsByTier from './words.json';

export type Tier = WordTier;

export const TIERS: Tier[] = ['easy', 'medium', 'hard'];

// Harder words pay more, so picking one is a real bet rather than a formality.
export const TIER_MULTIPLIER: Record<Tier, number> = { easy: 1, medium: 1.25, hard: 1.6 };

export const WORDS_BY_TIER = wordsByTier as Record<Tier, string[]>;

export const WORDS: string[] = TIERS.flatMap((t) => WORDS_BY_TIER[t]);

const TIER_OF = new Map<string, Tier>(
  TIERS.flatMap((t) => WORDS_BY_TIER[t].map((w) => [w, t] as const))
);

export function tierOf(word: string): Tier {
  return TIER_OF.get(word) ?? 'easy';
}

export function randomWord(tier?: Tier): string {
  const pool = tier ? WORDS_BY_TIER[tier] : WORDS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
