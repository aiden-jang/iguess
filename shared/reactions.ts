export const REACTION_OPTIONS = [
  { emoji: "😭", name: "crying face", caption: "Crying. Obviously." },
  { emoji: "💀", name: "skull", caption: "Deceased." },
  { emoji: "🫠", name: "melting face", caption: "Holding up well." },
  { emoji: "🫡", name: "saluting face", caption: "Respect the attempt." },
  { emoji: "🤨", name: "raised eyebrow", caption: "Explain." },
  { emoji: "🗿", name: "moai", caption: "No comment." },
  { emoji: "🥀", name: "wilted rose", caption: "A tragic development." },
  { emoji: "🔥", name: "fire", caption: "Annoyingly good." },
] as const;

export const REACTIONS = REACTION_OPTIONS.map(({ emoji }) => emoji);

// Existing room tabs can keep sending their previous selection after a deploy.
const LEGACY_REACTIONS = ["😂", "👏", "😍", "🤔", "🙈", "🐶"] as const;
export type Reaction =
  (typeof REACTIONS)[number] | (typeof LEGACY_REACTIONS)[number];

export function isReaction(value: unknown): value is Reaction {
  return (
    typeof value === "string" &&
    [...REACTIONS, ...LEGACY_REACTIONS].some((emoji) => emoji === value)
  );
}
