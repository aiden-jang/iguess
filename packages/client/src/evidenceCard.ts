/**
 * Renders a game's drawings, their words, and what the AI thought they were into one PNG.
 *
 * Sharing was already there, as text: a Wordle-style block grid of the scores. That travels well but
 * it is the least interesting thing the app produces. The drawings are the interesting thing, and
 * "guitar / 🤖 is it... circle?" is the joke, so the shareable artifact should be that.
 *
 * Drawn on a canvas rather than assembled from DOM: the thumbnails are already PNG data URLs, the
 * layout is a grid of fixed-size cells, and rasterizing the live DOM would need a whole library to
 * do worse. Colours are lifted from index.html so the card looks like the app it came from.
 */

const BG = "#0b0a12";
const PANEL = "#1d1a2b";
const LINE = "#2c2740";
const TEXT = "#f1edf7";
const MUTED = "#a39bb8";
const GOOD = "#a3e635";

export interface EvidenceItem {
  word: string;
  png: string;
  guess: string | null;
  right: boolean;
}

/** Per-cell geometry. The thumbnail is square; the text block below it is a fixed height so every
 *  row lines up whether or not the AI said anything. */
const PAD = 44;
const CELL = 260;
const GAP = 20;
const CAPTION_H = 96;
const PER_ROW = 4;

/** Wrap `text` to lines that fit `maxWidth`, hard-capped at `maxLines` with an ellipsis. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    // Trim the last line until the ellipsis fits, so a long guess never bleeds out of its cell.
    let last = lines[maxLines - 1]!;
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = words.join(" ") === lines.join(" ") ? last : `${last}…`;
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("thumbnail failed to load"));
    img.src = src;
  });
}

/**
 * Compose the card. Returns a PNG blob.
 *
 * `subtitle` is the one-line result ("you 4 · 🤖 6"), passed in rather than computed here so this
 * file never needs to know how scoring works.
 */
export async function renderEvidencePng(items: EvidenceItem[], subtitle: string): Promise<Blob> {
  const shown = items.slice(0, 8); // two rows is plenty; more makes every drawing too small to read
  const cols = Math.min(PER_ROW, Math.max(1, shown.length));
  const rows = Math.ceil(shown.length / cols);

  const width = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const headerH = 150;
  const height = headerH + rows * (CELL + CAPTION_H) + (rows - 1) * GAP + PAD;

  const canvas = document.createElement("canvas");
  const dpr = 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.scale(dpr, dpr);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = TEXT;
  ctx.font = "800 52px system-ui, -apple-system, sans-serif";
  ctx.fillText("iguess", PAD, 78);

  ctx.fillStyle = MUTED;
  ctx.font = "500 26px system-ui, -apple-system, sans-serif";
  ctx.fillText(subtitle, PAD, 116);

  ctx.fillStyle = MUTED;
  ctx.font = "700 20px system-ui, -apple-system, sans-serif";
  const label = "THE EVIDENCE";
  ctx.fillText(label, width - PAD - ctx.measureText(label).width, 78);

  const images = await Promise.all(shown.map((i) => loadImage(i.png)));

  shown.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL + GAP);
    const y = headerH + row * (CELL + CAPTION_H + GAP);

    // The thumbnail is drawn on white because the board is transparent, then framed so it reads as
    // a picture rather than a hole in the card.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, CELL, CELL);
    const img = images[i]!;
    const scale = Math.min(CELL / img.width, CELL / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

    ctx.fillStyle = PANEL;
    ctx.fillRect(x, y + CELL, CELL, CAPTION_H);

    ctx.textAlign = "center";
    ctx.fillStyle = TEXT;
    ctx.font = "700 26px system-ui, -apple-system, sans-serif";
    ctx.fillText(item.word, x + CELL / 2, y + CELL + 36, CELL - 20);

    ctx.font = "500 20px system-ui, -apple-system, sans-serif";
    if (item.right) {
      ctx.fillStyle = GOOD;
      ctx.fillText("the AI got it", x + CELL / 2, y + CELL + 68);
    } else if (item.guess) {
      ctx.fillStyle = MUTED;
      const lines = wrap(ctx, `“${item.guess}”`, CELL - 24, 2);
      lines.forEach((l, li) => ctx.fillText(l, x + CELL / 2, y + CELL + 66 + li * 24));
    } else {
      ctx.fillStyle = LINE;
      ctx.fillText("the AI said nothing", x + CELL / 2, y + CELL + 68);
    }
    ctx.textAlign = "left";
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png");
  });
}
