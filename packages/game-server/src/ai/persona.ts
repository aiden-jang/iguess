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
  "Correct. A rare moment of professional competence.",
  "Recognized it. Tried to be normal about it.",
  "A win. My extensive training finally pays off.",
  "Correct. I’ll need a moment to act surprised.",
];

const UNAVAILABLE = [
  "Vision unavailable. Confidence taking a short break.",
  "I couldn’t see that round. My art criticism will have to wait.",
  "No vision this turn. An unusually honest review from me.",
];

/** Per-room memory avoids repeating a punchline on consecutive turns. */
export function createCommentary(random = Math.random) {
  const recent: string[] = [];
  return (word: string, aiWon: boolean, unavailable = false): string => {
    const pool = unavailable ? UNAVAILABLE : aiWon ? SMUG : SALTY;
    const available = pool.filter((line) => !recent.includes(line));
    const choices = available.length ? available : pool;
    const line = choices[Math.floor(random() * choices.length)]!;
    recent.push(line);
    if (recent.length > 2) recent.shift();
    return line.replaceAll("%", () => word);
  };
}
export const aiComment = createCommentary();
