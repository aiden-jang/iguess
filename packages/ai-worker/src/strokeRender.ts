import { rasterize } from "./rasterize.ts";
import type { DrawOp } from "@iguess/shared";
import { opsToSvg, WIDTH } from "./strokeSvg.ts";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** Rasterize the stroke log to a base64 PNG for the vision providers (SVG built in strokeSvg.ts). */
export async function opsToPngBase64(ops: DrawOp[]): Promise<string> {
  return toBase64(
    await rasterize(opsToSvg(ops), { fitTo: { mode: "width", value: WIDTH } }),
  );
}
