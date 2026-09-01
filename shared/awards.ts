import type { PlayerInfo } from "./events.ts";

export interface Round {
  word: string;
  drawerId: string | null;
  guess: string | null;
  right: boolean;
}

export interface Award {
  title: string;
  who: string;
  detail: string;
}

const nameOf = (players: PlayerInfo[], id: string | null) =>
  players.find((p) => p.id === id)?.name ?? "someone";

/**
 * End-of-game awards, computed from rounds the client already kept for the gallery.
 * Only awards with something real behind them are returned: a "winner" of a category nobody
 * competed in reads as filler.
 */
export function awardsFor(rounds: Round[], players: PlayerInfo[]): Award[] {
  const out: Award[] = [];
  const drawn = rounds.filter((r) => r.drawerId);
  if (drawn.length === 0) return out;

  const byDrawer = new Map<string, { total: number; read: number }>();
  for (const r of drawn) {
    const e = byDrawer.get(r.drawerId!) ?? { total: 0, read: 0 };
    e.total += 1;
    if (r.right) e.read += 1;
    byDrawer.set(r.drawerId!, e);
  }

  const scored = [...byDrawer].filter(([, e]) => e.total >= 2);
  const clearest = scored.filter(([, e]) => e.read === e.total);
  if (clearest.length === 1) {
    out.push({
      title: "🤖 legible",
      who: nameOf(players, clearest[0]![0]),
      detail: "the machine read every single one",
    });
  }
  const opaque = scored.filter(([, e]) => e.read === 0);
  if (opaque.length === 1) {
    out.push({
      title: "🌫️ abstract",
      who: nameOf(players, opaque[0]![0]),
      detail: "the machine got none of them",
    });
  }

  // The AI's worst take: the wrong guess that missed by the widest margin in letters.
  const misses = rounds.filter((r) => !r.right && r.guess);
  if (misses.length) {
    const worst = misses.reduce((a, b) =>
      Math.abs(b.guess!.length - b.word.length) > Math.abs(a.guess!.length - a.word.length) ? b : a
    );
    out.push({
      title: "💀 worst take",
      who: `“${worst.guess}”`,
      detail: `it was ${worst.word}`,
    });
  }

  return out;
}
