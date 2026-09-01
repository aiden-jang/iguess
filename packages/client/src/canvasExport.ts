// Turning the live board into something you can keep: a download, and the small thumbnail the
// gallery and the evidence card are built from.
// Export the canvas as a downloadable PNG (white background baked in).
export function saveCanvasPng(canvas: HTMLCanvasElement, room: string) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext("2d");
  if (!c) return;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = `iguess-${room}-${Date.now()}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
}

/**
 * A small PNG of whatever is on the board right now.
 *
 * Kept deliberately tiny. These accumulate one per turn and live in React state for the length of
 * a game, so a full-size board (which the download button already offers) would be megabytes of
 * data URL sitting in memory to show something rendered 160px wide.
 */
export function thumbnailOf(canvas: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = 320;
  out.height = Math.round((canvas.height / canvas.width) * 320);
  const c = out.getContext("2d");
  if (!c) return "";
  // White first: the board is transparent, and a transparent PNG on a dark card is an empty box.
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0, out.width, out.height);
  // Skip a turn nobody drew on. Otherwise the gallery collects blank white cards, which read as
  // broken images rather than as "the drawer went afk", and there is no joke in an empty rectangle.
  if (isBlank(c, out.width, out.height)) return "";
  return out.toDataURL("image/png");
}

/**
 * Any non-white pixel?
 *
 * Stride of 3 pixels, not 7. At 7 a thin single-stroke drawing could be missed entirely and thrown
 * away as blank, which is worse than the empty card this check exists to prevent: a drawing someone
 * actually made is the whole point of the gallery. 3 still samples a third of a 320px thumbnail,
 * which is nothing, and a real stroke is many pixels wide once it has been downscaled and
 * anti-aliased.
 */
function isBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < data.length; i += 4 * 3) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return false;
  }
  return true;
}

// Open a pre-filled X/Twitter compose window — the actual viral loop.
