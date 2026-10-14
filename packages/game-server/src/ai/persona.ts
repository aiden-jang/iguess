// The AI is the app's whole differentiator and it was called "🤖 AI" in four separate files.
// Naming it after the answer it reaches for is the joke the README already makes.

// No emoji here: every surface that shows an AI already adds its own badge, so baking one
// into the name renders it twice ("🤖 🤖 dogbot").
export const AI_NAME = "dogbot";

// Said when it loses a turn it was sure about.
const SALTY = [
  "A %, apparently. Noted.",
  "I had a different interpretation. Several, actually.",
  "The resemblance was a private matter.",
  "This is why I guess dog.",
  "A %. I admire the confidence.",
  "An ambitious use of lines.",
];

// Said when it wins.
const SMUG = [
  "I’ll add art critic to the résumé.",
  "Two strokes. Modest of me to wait.",
  "Recognized it. Tried to be normal about it.",
  "A win. My extensive training finally pays off.",
  "Correct. I’ll need a moment to act surprised.",
];

const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)]!;

/** One line of commentary on a turn that just ended. */
export function aiComment(word: string, aiWon: boolean): string {
  return aiWon ? pick(SMUG) : pick(SALTY).replace("%", word);
}
