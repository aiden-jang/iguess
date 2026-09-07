export type InviteResult = "copied" | "shared" | null;

export function chatPlaceholder(drawingNow: boolean, inGame: boolean): string {
  if (drawingNow) return "eyes on the canvas, picasso ✋";
  return inGame ? "guess it bestie… (?word calls the AI)" : "say something fr";
}

// "connecting…" only before the first connection ever lands, so a slow first load doesn't
// accuse the network of dropping something it never had.
export function connectionLabel(connected: boolean, everConnected: boolean): string {
  if (connected) return "we're so back";
  return everConnected ? "hang on…" : "connecting…";
}

export function inviteLabel(result: InviteResult): string {
  if (result === "shared") return "✅ invite sent";
  if (result === "copied") return "✅ copied, go spam it";
  return "🔗 invite the squad";
}
