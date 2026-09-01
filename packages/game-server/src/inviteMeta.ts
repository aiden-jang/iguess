// Rewrites the SPA shell's social meta for an invite link, so a room dropped into a group
// chat unfurls with its own name and card instead of the generic one.

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

/** Replace the content of one `<meta property|name="key" content="...">` tag. */
function setMeta(html: string, key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`, 'i');
  return html.replace(re, `$1${esc(value)}$2`);
}

export function rewriteInviteMeta(
  html: string,
  room: string,
  mode: string,
  aiWorkerUrl: string | undefined,
): string {
  const title = `join "${room}" on iguess`;
  const desc = 'draw bad, win anyway. race the AI.';
  // The card is rendered by the ai-worker (the only one of ours with a rasterizer). Without it
  // configured, the static og.png still applies.
  const image = aiWorkerUrl
    ? `${aiWorkerUrl.replace(/\/$/, '')}/og?room=${encodeURIComponent(room)}&mode=${encodeURIComponent(mode)}`
    : null;

  let out = html;
  out = setMeta(out, 'og:title', title);
  out = setMeta(out, 'twitter:title', title);
  out = setMeta(out, 'og:description', desc);
  out = setMeta(out, 'twitter:description', desc);
  if (image) {
    out = setMeta(out, 'og:image', image);
    out = setMeta(out, 'twitter:image', image);
  }
  return out;
}
