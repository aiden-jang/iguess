import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
let ready: Promise<void> | null = null;
/** A shared initializer prevents the share-card and vision paths from initializing WASM twice. */
export async function rasterize(
  svg: string,
  options: ConstructorParameters<typeof Resvg>[1],
) {
  ready ??= initWasm(resvgWasm).catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
  const renderer = new Resvg(svg, options);
  try {
    const image = renderer.render();
    try {
      return image.asPng().slice();
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}
