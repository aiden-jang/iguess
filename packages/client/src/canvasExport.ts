// Turning the live board into something you can keep: a full-size download, and the small
// thumbnail the gallery and the share card are built from. Both paint white behind it, because
// the board itself is see-through.
export function saveCanvasPng(canvas: HTMLCanvasElement, room: string) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext("2d");
  if (!c) return false;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = `iguess-${room}-${Date.now()}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
  return true;
}

// Deliberately small. One of these is kept per turn for the whole game, and they are only ever
// shown about 160px wide, so a full-size copy would be megabytes sitting in memory for nothing.
export function thumbnailOf(canvas: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = 320;
  out.height = Math.round((canvas.height / canvas.width) * 320);
  const c = out.getContext("2d");
  if (!c) return "";
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0, out.width, out.height);
  // Skip a turn nobody drew on. A blank card reads as a broken image, not as a joke.
  if (isBlank(c, out.width, out.height)) return "";
  return out.toDataURL("image/png");
}

// A dense sample preserves thin strokes when detecting blank thumbnails.
function isBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < data.length; i += 4 * 3) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return false;
  }
  return true;
}

