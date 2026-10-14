import type { AiSkill } from "@iguess/shared";
import { normalizeGuess } from "../text.ts";
// New ink shortens the next wait; an untouched canvas conserves requests.
const BUSY_MS = 4_000;
const STEADY_MS = 8_000;
const IDLE_MS = 15_000;
export const TEASE_MS = 1_300; // beat between the wrong shout and the answer
export const TEASE_CHANCE = 0.6;
const BUSY_OPS = 45;
const STEADY_OPS = 12;

// "easy" never makes up a wrong answer. It just looks later, looks less often, and sometimes
// goes with its second thought instead of its first.
export const SKILL: Record<
  AiSkill,
  { firstMs: number; pace: number; maxGuesses: number; doubtTop: number }
> = {
  easy: { firstMs: 16_000, pace: 1.6, maxGuesses: 2, doubtTop: 0.5 },
  normal: { firstMs: 8_000, pace: 1, maxGuesses: 4, doubtTop: 0 },
  brutal: { firstMs: 4_000, pace: 0.55, maxGuesses: 7, doubtTop: 0 },
};

// Only the DISPLAYED text gets this personality. Whether a guess counts is decided on the
// bare word, so wording can never change the outcome. `%` becomes the guess.
const GUESS_PHRASINGS = [
  "Is it %?",
  "Hear me out: %.",
  "A %. With reservations.",
  "Evidence suggests %. Loosely.",
  "%? Final answer. For now.",
  "Looks like a %. Allegedly.",
  "I’m going with %.",
  "A %. I will defend this briefly.",
];
// Show the runners-up sometimes, not every time. A bot that dithers every single turn stops
// being funny.
const SECOND_THOUGHTS = [
  "… or a %",
  "… or is it a %",
  "(or a %)",
  "… a % maybe",
];

export function phraseGuess(
  guess: string,
  alternatives: string[] = [],
): string {
  const t =
    GUESS_PHRASINGS[Math.floor(Math.random() * GUESS_PHRASINGS.length)]!;
  const said = t.replaceAll("%", () => guess);
  const alt = alternatives.filter((a) => a && a !== guess);
  if (!alt.length || Math.random() < 0.45) return said;
  const s =
    SECOND_THOUGHTS[Math.floor(Math.random() * SECOND_THOUGHTS.length)]!;
  const alternative = alt[Math.floor(Math.random() * alt.length)]!;
  return said + " " + s.replaceAll("%", () => alternative);
}

// A model answers "elephant", "an elephant", or "It's a café!". Accept the word inside a
// longer sentence, and ignore capitals, accents and punctuation.
export function matchesWord(guess: string, word: string): boolean {
  const g = normalizeGuess(guess);
  const w = normalizeGuess(word);
  if (!w) return false;
  if (g === w) return true;
  return ` ${g} `.includes(` ${w} `);
}

export function nextGuessDelay(opsSinceLastLook: number): number {
  if (opsSinceLastLook >= BUSY_OPS) return BUSY_MS;
  if (opsSinceLastLook >= STEADY_OPS) return STEADY_MS;
  return IDLE_MS;
}
