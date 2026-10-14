import { test, expect } from "./fixtures";
import { writeFile } from "node:fs/promises";
test("evidence export survives missing previews long captions and a larger gallery", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/evidenceCard.ts";
    const { renderEvidencePng } = await import(modulePath);
    const source = document.createElement("canvas");
    source.width = 200;
    source.height = 100;
    const ctx = source.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 200, 100);
    ctx.fillStyle = "#202522";
    ctx.font = "20px sans-serif";
    ctx.fillText("QA layout probe", 15, 60);
    const png = source.toDataURL();
    const blob: Blob = await renderEvidencePng(
      Array.from({ length: 10 }, (_, i) => ({
        word: "extraordinary illustration",
        artist: "A very considered opinion",
        png: i === 2 ? "data:image/png;base64,broken" : png,
        guess:
          "a much longer interpretation than anyone requested from this machine",
        right: false,
      })),
      "A local export layout probe with deliberately long captions",
    );
    const bitmap = await createImageBitmap(blob);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return {
      width: bitmap.width,
      height: bitmap.height,
      type: blob.type,
      size: blob.size,
      base64: btoa(binary),
    };
  });
  expect(result.type).toBe("image/png");
  expect(result.width).toBe(2376);
  expect(result.height).toBe(1996);
  expect(result.size).toBeGreaterThan(10000);
  if (process.env.CAPTURE_UI === "1")
    await writeFile(
      "docs/ui-review/finish/export-probe.png",
      Buffer.from(result.base64, "base64"),
    );
});
