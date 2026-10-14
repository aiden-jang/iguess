import { readStored, writeStored } from "./storage";
const STREAK_KEY = "iguess_streak";
export const AVATAR_KEY = "iguess_avatar";
const STATS_KEY = "iguess_stats";

export function getStreak(): number {
  return Number(readStored(STREAK_KEY) || 0) || 0;
}

export interface LifetimeStats {
  games: number;
  wins: number;
  bestStreak: number;
}

// There are no accounts, so this lives in the browser. Unreadable or missing means a brand
// new player, never an error.
export function lifetimeStats(): LifetimeStats {
  try {
    const raw = JSON.parse(readStored(STATS_KEY) ?? "");
    return {
      games: Number(raw?.games) || 0,
      wins: Number(raw?.wins) || 0,
      bestStreak: Number(raw?.bestStreak) || 0,
    };
  } catch {
    return { games: 0, wins: 0, bestStreak: 0 };
  }
}

export function bumpStreak(won: boolean): number {
  const next = won ? getStreak() + 1 : 0;
  writeStored(STREAK_KEY, String(next));
  const s = lifetimeStats();
  writeStored(
    STATS_KEY,
    JSON.stringify({
      games: s.games + 1,
      wins: s.wins + (won ? 1 : 0),
      bestStreak: Math.max(s.bestStreak, next),
    }),
  );
  return next;
}

export function didWin(
  ranked: { id: string }[],
  scores: Record<string, number>,
  playerId: string | null,
): boolean {
  return (
    !!playerId && ranked[0]?.id === playerId && (scores[playerId] ?? 0) > 0
  );
}
