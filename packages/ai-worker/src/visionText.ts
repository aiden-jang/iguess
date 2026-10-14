const BASE_PROMPT =
  "This is a doodle from a Pictionary-style game. What single object is being drawn? " +
  "Reply with up to three lowercase single-word guesses, best first, separated by commas. " +
  "No punctuation beyond the commas, no explanation.";

// The hint is what human guessers already see, like "_ u _ t a _". Never the answer itself.
export function promptFor(hint?: string): string {
  const shape = hint?.trim();
  if (!shape) return BASE_PROMPT;
  const letters = shape.replace(/\s+/g, "").length;
  return (
    `${BASE_PROMPT} The answer has ${letters} letters and looks like "${shape}", ` +
    "where _ is a letter you have to work out. Your word must fit that pattern."
  );
}

// Words that pad out an answer: "it looks like a house", "maybe a barn".
const FILLER = new Set([
  "a",
  "an",
  "the",
  "it",
  "is",
  "this",
  "that",
  "looks",
  "look",
  "like",
  "maybe",
  "probably",
  "appears",
  "to",
  "be",
  "of",
  "some",
  "kind",
  "sort",
  "drawing",
  "doodle",
  "sketch",
  "picture",
  "image",
  "simple",
  "i",
  "think",
  "see",
  "there",
  "seems",
  "sketchy",
  "black",
  "white",
  "and",
]);

// Take the LAST real word. "a cat" and "it looks like a house" both end on the answer, while
// taking the first word gives you "a" and "it".
function normalize(s: string): string {
  const words = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const meaty = words.filter((w) => !FILLER.has(w));
  return meaty[meaty.length - 1] ?? words[words.length - 1] ?? "";
}

// We ask for "cat, dog, house" and get back sentences, numbered lists, or one bare word.
// Split on anything list-like and keep the first three that survive tidying.
export function rank(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\n;/]|\bor\b/)) {
    const w = normalize(part);
    if (w && !out.includes(w)) out.push(w);
    if (out.length === 3) break;
  }
  return out;
}
