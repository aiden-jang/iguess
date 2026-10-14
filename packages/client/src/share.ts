import type { PlayerInfo } from "@iguess/shared";
import { isAI } from "./roomView";

export interface Standings {
  /** Best first. */
  ranked: PlayerInfo[];
  scores: Record<string, number>;
  youId: string | null;
}

// Only the top few fit on a shared card, and nobody brags about coming fifth.
const SHOWN = 4;
const MEDALS = ["🥇", "🥈", "🥉"];
// Longest bar on the card, in blocks.
const BAR_BLOCKS = 8;

const scoreOf = (s: Standings, id: string): number => s.scores[id] ?? 0;

/** One line of "who scored what", for the corner of the evidence card. */
export function scoreLine({ ranked, scores, youId }: Standings): string {
  return ranked
    .slice(0, SHOWN)
    .map(
      (p) =>
        `${p.id === youId ? "you" : isAI(p.id) ? "🤖" : p.name} ${scores[p.id] ?? 0}`,
    )
    .join("  ·  ");
}

export interface FlexContext {
  modeLabel: string;
  inviteUrl: string;
  streak: number;
}

/** The block-chart brag that gets copied to the clipboard at the end of a game. */
export function resultsText(
  standings: Standings,
  { modeLabel, inviteUrl, streak }: FlexContext,
): string {
  const { ranked, youId } = standings;
  const participant = ranked.find((player) => player.id === youId);
  const place = participant
    ? 1 +
      ranked.filter(
        (player) =>
          scoreOf(standings, player.id) > scoreOf(standings, participant.id),
      ).length
    : 0;
  const tied =
    participant &&
    ranked.some(
      (player) =>
        player.id !== youId &&
        scoreOf(standings, player.id) === scoreOf(standings, participant.id),
    );
  const aiScores = ranked
    .filter((p) => isAI(p.id))
    .map((p) => scoreOf(standings, p.id));
  const beatAI =
    aiScores.length > 0 &&
    youId != null &&
    scoreOf(standings, youId) > Math.max(...aiScores);

  // Scale the bars against the winner, never against zero.
  const top = Math.max(1, ...ranked.map((p) => scoreOf(standings, p.id)));
  const rows = ranked.slice(0, SHOWN).map((p, i) => {
    const score = scoreOf(standings, p.id);
    const filled = Math.max(1, Math.round((score / top) * BAR_BLOCKS));
    const block = p.id === youId ? "🟥" : isAI(p.id) ? "🤖" : "⬜";
    return `${MEDALS[i] ?? "▪️"} ${block.repeat(filled)} ${score}`;
  });

  const brags = [
    beatAI ? "Beat the AI. Apparently." : null,
    streak > 1 ? `🔥 ${streak}-win streak` : null,
  ].filter(Boolean);

  return [
    `iguess ✏️ · ${modeLabel}`,
    !place
      ? "i watched. strong opinions, no placing."
      : top === 1 &&
          ranked.every((player) => scoreOf(standings, player.id) === 0)
        ? "nobody scored. a collective decision."
        : `i ${tied ? "tied" : "came"} #${place}/${ranked.length} — witnessed.`,
    "",
    ...rows,
    ...(brags.length ? ["", ...brags] : []),
    "",
    `Join the room: ${inviteUrl}`,
  ].join("\n");
}

/**
 * Hand a file to the OS share sheet, or fall back to a download. Some browsers can share a link
 * but not a file, so ask about this exact file first or the sheet opens and then fails.
 */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  sheet: { title: string; text: string },
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type });
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ ...sheet, files: [file] });
      return "shared";
    } catch (err) {
      // They cancelled on purpose. Don't surprise them with a download instead.
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = href;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  return "downloaded";
}
