import type { WordTier } from "@iguess/shared";
export const TIER_LABEL: Record<WordTier, string> = {
  easy: "1x",
  medium: "1.25x",
  hard: "1.6x",
};

export function usesVision(mode: string) {
  return mode === "ai" || mode === "team-battle" || mode === "duel";
}

export const MODES = [
  {
    value: "classic",
    label: "Classic",
    blurb: "you draw, humans guess",
    icon: "🎨",
  },
  {
    value: "ai",
    label: "AI Guesser",
    blurb: "you draw, an AI races to guess it",
    icon: "🔍",
  },
  {
    value: "ai-drawer",
    label: "AI Drawer",
    blurb: "the AI draws, you guess",
    icon: "🖌️",
  },
  {
    value: "relay",
    label: "Drawing Relay",
    blurb: "Pass drawings and guesses around the room",
    icon: "✎",
  },
  {
    value: "team-battle",
    label: "Team Battle",
    blurb: "humans vs AI, first guess wins",
    icon: "⚔️",
  },
  {
    value: "duel",
    label: "You vs AI",
    blurb: "trade turns drawing, most points beats the machine",
    icon: "🤖",
  },
];

const NAME_ADJ = [
  "sleepy",
  "feral",
  "average",
  "soggy",
  "spicy",
  "chaotic",
  "lukewarm",
  "polite",
  "tiny",
  "unhinged",
  "moist",
  "adequate",
];
const NAME_NOUN = [
  "goblin",
  "pigeon",
  "raccoon",
  "doodler",
  "gamer",
  "wizard",
  "shrimp",
  "menace",
  "legend",
  "noodle",
  "gremlin",
  "duck",
];
export function randomName(): string {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${a}_${n}${Math.floor(Math.random() * 90 + 10)}`;
}
