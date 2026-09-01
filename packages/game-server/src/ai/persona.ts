// The AI is the app's whole differentiator and it was called "🤖 AI" in four separate files.
// Naming it after the answer it reaches for is the joke the README already makes.

export const AI_NAME = "🤖 dogbot";

// Said when it loses a turn it was sure about.
const SALTY = [
  "that was NOT a %. i refuse.",
  "ok whoever drew that owes me an apology",
  "i had it. i genuinely had it.",
  "this is why i guess dog.",
  "we're calling that a % are we",
  "unbelievable. next.",
];

// Said when it wins.
const SMUG = [
  "too easy honestly",
  "i saw it in like two strokes",
  "humans: 0",
  "was that supposed to be hard",
  "i'm built different",
];

const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)]!;

/** One line of commentary on a turn that just ended. */
export function aiComment(word: string, aiWon: boolean): string {
  return aiWon ? pick(SMUG) : pick(SALTY).replace("%", word);
}
