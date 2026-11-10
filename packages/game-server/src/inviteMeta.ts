// Rewrites the SPA shell's social meta for an invite link, so a room dropped into a group
// chat unfurls with its own name and card instead of the generic one.

function esc(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
}

/** Replace the content of one `<meta property|name="key" content="...">` tag. */
function setMeta(html: string, key: string, value: string): string {
  const re = new RegExp(
    `(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`,
    "i",
  );
  return html.replace(
    re,
    (_match, before, after) => `${before}${esc(value)}${after}`,
  );
}

export function rewriteInviteMeta(
  html: string,
  room: string,
  mode: string,
  aiWorkerUrl: string | undefined,
): string {
  const title = `join "${room}" on iguess`;
  const relay = mode === "relay";
  const descriptions: Record<string, string> = {
    classic:
      "Join Classic. Draw a secret word and race your friends to guess it.",
    relay: "Join Drawing Relay. Pass drawings and guesses around the room.",
    ai: "Join AI Guesser. Draw a clue and see if the machine gets it.",
    "ai-drawer": "Join AI Drawer. Guess the machine’s drawing as it appears.",
    "team-battle":
      "Join Team Battle. Your group races the AI to guess the drawing.",
    duel: "Join You vs AI. Trade turns drawing and guessing against the machine.",
  };
  const desc = Object.hasOwn(descriptions, mode)
    ? descriptions[mode]!
    : "Join your friends for a game of iGuess.";
  // The card is rendered by the ai-worker (the only one of ours with a rasterizer). Without it
  // configured, the static og.png still applies.
  const image = aiWorkerUrl
    ? `${aiWorkerUrl.replace(/\/$/, "")}/og?room=${encodeURIComponent(room)}&mode=${encodeURIComponent(relay ? "Drawing Relay" : mode)}`
    : null;

  let out = html;
  const canonical = new URL(
    `/r/${encodeURIComponent(room)}`,
    "https://iguess.aidenjang.com",
  );
  if (mode) canonical.searchParams.set("mode", mode);
  out = setMeta(out, "og:url", canonical.href);
  out = setMeta(out, "og:title", title);
  out = setMeta(out, "twitter:title", title);
  out = setMeta(out, "og:description", desc);
  out = setMeta(out, "twitter:description", desc);
  if (image) {
    out = setMeta(out, "og:image", image);
    out = setMeta(out, "twitter:image", image);
  }
  return out;
}
