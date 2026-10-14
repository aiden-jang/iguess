export interface RoomSettings {
  turnSeconds: number;
  rounds: number;
  aiSkill: AiSkill;
  // Empty means "use every word", not "use no words".
  packs: string[];
  customWords: string[];
  // 0 means "play the set number of rounds". Any other number means "first to this score wins".
  scoreTarget: number;
}

export type AiSkill = "easy" | "normal" | "brutal";

export const SETTINGS_LIMITS = {
  turnSeconds: { min: 20, max: 180, default: 60 },
  rounds: { min: 1, max: 8, default: 3 },
  // Capped so one person can't paste in a novel and push everything else out of the pool.
  customWords: { maxCount: 40, maxLength: 24 },
  scoreTarget: { min: 0, max: 5000, default: 0 },
} as const;

export function cleanCustomWord(raw: string): string | null {
  const w = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (w.length < 2 || w.length > SETTINGS_LIMITS.customWords.maxLength)
    return null;
  return w;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  turnSeconds: SETTINGS_LIMITS.turnSeconds.default,
  rounds: SETTINGS_LIMITS.rounds.default,
  aiSkill: "normal",
  packs: [],
  customWords: [],
  scoreTarget: 0,
};

// A client can send any numbers it likes, so force them back into range before use.
export function sanitizeSettings(
  raw: Partial<RoomSettings> | undefined,
): RoomSettings {
  const clamp = (n: unknown, k: "turnSeconds" | "rounds" | "scoreTarget") => {
    const { min, max, default: d } = SETTINGS_LIMITS[k];
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  };
  const skill = raw?.aiSkill;
  return {
    turnSeconds: clamp(
      raw?.turnSeconds ?? SETTINGS_LIMITS.turnSeconds.default,
      "turnSeconds",
    ),
    rounds: clamp(raw?.rounds ?? SETTINGS_LIMITS.rounds.default, "rounds"),
    aiSkill: skill === "easy" || skill === "brutal" ? skill : "normal",
    packs: Array.isArray(raw?.packs)
      ? [
          ...new Set(
            raw.packs.filter(
              (p): p is string => typeof p === "string" && p.length <= 32,
            ),
          ),
        ].slice(0, 12)
      : [],
    scoreTarget: clamp(raw?.scoreTarget ?? 0, "scoreTarget"),
    customWords: Array.isArray(raw?.customWords)
      ? [
          ...new Set(
            raw.customWords
              .filter((w): w is string => typeof w === "string")
              .map(cleanCustomWord)
              .filter((w): w is string => w !== null),
          ),
        ].slice(0, SETTINGS_LIMITS.customWords.maxCount)
      : [],
  };
}
