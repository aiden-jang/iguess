import { rasterize, rasterizePixels } from "./rasterize.ts";
import type { DrawOp } from "@iguess/shared";
import { opsToSvg, WIDTH } from "./strokeSvg.ts";
import { base64 } from "./png.ts";

/** Render all drawing tools before supplying a PNG to the vision providers. */
export async function opsToPngBase64(ops: DrawOp[]): Promise<string> {
  return base64(
    await rasterize(await opsToSvg(ops, rasterizePixels), {
      fitTo: { mode: "width", value: WIDTH },
    }),
  );
}
