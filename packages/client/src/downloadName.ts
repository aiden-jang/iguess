export function drawingFilename(
  kind: "drawing" | "evidence",
  room: string,
  at = new Date(),
): string {
  const date = at
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  const code = room.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 32);
  return `iguess-${kind}${code ? `-${code}` : ""}-${date}.png`;
}
