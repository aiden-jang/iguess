import type { WordTier } from './events.ts';
import wordsByTier from './words.json';
import packsByName from './packs.json';

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

export const PACKS = packsByName as Record<string, string[]>;
export const PACK_NAMES = Object.keys(PACKS);

/**
 * Words available for a tier, narrowed to the chosen packs. No packs means everything.
 * A pack with nothing in this tier falls back to the whole tier, so "food" (which has no
 * hard words) still fills the hard slot on the pick screen instead of leaving it empty.
 */
export function poolFor(tier: Tier, packs: string[] = []): string[] {
  const full = WORDS_BY_TIER[tier];
  if (packs.length === 0) return full;
  const allowed = new Set(packs.flatMap((p) => PACKS[p] ?? []));
  const narrowed = full.filter((w) => allowed.has(w));
  return narrowed.length > 0 ? narrowed : full;
}

export function randomWord(tier?: Tier): string {
  const pool = tier ? WORDS_BY_TIER[tier] : WORDS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
