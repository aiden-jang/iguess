import { isAI } from "./roomView";
// Render the first eight drawings directly from their thumbnails; no DOM screenshot dependency.

const BG = "#f2f2e9";
const PANEL = "#fcfcf4";
const LINE = "#cdd2c5";
const TEXT = "#202522";
const MUTED = "#65705e";
const GOOD = "#435c3a";

export interface EvidenceItem {
  word: string;
  artist?: string;
  png: string;
  guess: string | null;
  right: boolean;
  aiParticipated?: boolean;
  drawerId?: string | null;
}

const PAD = 44;
const CELL = 260;
const GAP = 20;
const CAPTION_H = 120;
const PER_ROW = 4;

export function wrapCaption(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const parts = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      text.trim(),
    ),
    ({ segment }) => segment,
  );
  const lines: string[] = [];
  let start = 0;
  while (start < parts.length && lines.length < maxLines) {
    while (parts[start] === " ") start++;
    let end = start;
    const last = lines.length === maxLines - 1;
    const suffix = (at: number) => (last && at < parts.length ? "…" : "");
    while (
      end < parts.length &&
      ctx.measureText(parts.slice(start, end + 1).join("") + suffix(end + 1))
        .width <= maxWidth
    )
      end++;
    if (end === start) {
      // A single grapheme can be wider than the cell. An ellipsis still stays inside it.
      if (ctx.measureText("…").width <= maxWidth) lines.push("…");
      break;
    }
    if (end < parts.length && !last) {
      const space = parts.lastIndexOf(" ", end);
      if (space > start) end = space;
    }
    lines.push(parts.slice(start, end).join("").trimEnd() + suffix(end));
    start = end;
    if (last) break;
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

// `subtitle` is passed in already built, so this file never has to know how scoring works.
export async function renderEvidencePng(
  items: EvidenceItem[],
  subtitle: string,
  awards: { title: string; who: string; detail: string }[] = [],
): Promise<Blob> {
  const shown = items.slice(0, 8); // two rows is plenty; more makes every drawing too small to read
  const cols = Math.min(PER_ROW, Math.max(1, shown.length));
  const rows = Math.ceil(shown.length / cols);

  const gridWidth = cols * CELL + (cols - 1) * GAP;
  const width = Math.max(640, PAD * 2 + gridWidth);
  // Awards get their own band, not a squeeze into the subtitle.
  const awardsH = awards.length ? 26 + awards.length * 60 : 0;
  const headerH = 174 + awardsH;
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
  wrapCaption(ctx, subtitle, width - PAD * 2, 2).forEach((line, index) =>
    ctx.fillText(line, PAD, 116 + index * 28, width - PAD * 2),
  );

  ctx.fillStyle = MUTED;
  ctx.font = "700 20px system-ui, -apple-system, sans-serif";
  const label = "THE EVIDENCE";
  ctx.fillText(label, width - PAD - ctx.measureText(label).width, 78);

  awards.forEach((a, i) => {
    const y = 190 + i * 60;
    ctx.font = "700 22px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = TEXT;
    ctx.fillText(
      wrapCaption(ctx, `${a.title}  ${a.who}`, width - PAD * 2, 1)[0] ?? "",
      PAD,
      y,
    );
    ctx.font = "500 20px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText(
      wrapCaption(ctx, a.detail, width - PAD * 2, 1)[0] ?? "",
      PAD,
      y + 26,
    );
  });

  const images = await Promise.all(
    shown.map((i) => loadImage(i.png).catch(() => null)),
  );

  shown.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (width - gridWidth) / 2 + col * (CELL + GAP);
    const y = headerH + row * (CELL + CAPTION_H + GAP);

    // White behind it first: the board is see-through, and a transparent picture on a dark
    // card just looks like a hole.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, CELL, CELL);
    const img = images[i];
    if (img) {
      const scale = Math.min(CELL / img.width, CELL / img.height);
      const w = img.width * scale,
        h = img.height * scale;
      ctx.drawImage(img, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
    } else {
      ctx.fillStyle = MUTED;
      ctx.font = "500 18px system-ui, sans-serif";
      ctx.fillText("Preview unavailable", x + 24, y + CELL / 2);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

    ctx.fillStyle = PANEL;
    ctx.fillRect(x, y + CELL, CELL, CAPTION_H);

    ctx.textAlign = "center";
    ctx.fillStyle = TEXT;
    ctx.font = "700 26px system-ui, -apple-system, sans-serif";
    ctx.fillText(item.word, x + CELL / 2, y + CELL + 36, CELL - 20);

    ctx.fillStyle = MUTED;
    ctx.font = "500 14px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      item.artist
        ? `By ${item.artist}`
        : isAI(item.drawerId)
          ? "Curated AI doodle"
          : "Human-made",
      x + CELL / 2,
      y + CELL + 60,
      CELL - 20,
    );
    ctx.font = "500 20px system-ui, -apple-system, sans-serif";
    if (item.aiParticipated === false) {
      ctx.fillStyle = MUTED;
      ctx.fillText(
        isAI(item.drawerId) ? "Drawn by AI" : "Human-made. Somehow.",
        x + CELL / 2,
        y + CELL + 92,
      );
    } else if (item.right) {
      ctx.fillStyle = GOOD;
      ctx.fillText("the AI got it", x + CELL / 2, y + CELL + 92);
    } else if (item.guess) {
      ctx.fillStyle = MUTED;
      const lines = wrapCaption(ctx, `“${item.guess}”`, CELL - 24, 2);
      lines.forEach((l, li) =>
        ctx.fillText(l, x + CELL / 2, y + CELL + 88 + li * 24),
      );
    } else {
      ctx.fillStyle = MUTED;
      ctx.fillText("AI: no comment.", x + CELL / 2, y + CELL + 92);
    }
    ctx.textAlign = "left";
  });

  if (items.length > shown.length) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 14px system-ui, sans-serif";
    ctx.fillText(
      `${shown.length} of ${items.length} drawings · the complete exhibition stays in the room`,
      PAD,
      height - 16,
      width - PAD * 2,
    );
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/png",
    );
  });
}
