import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
let ready: Promise<void> | null = null;
/** A shared initializer prevents the share-card and vision paths from initializing WASM twice. */
export async function rasterize(
  svg: string,
  options: ConstructorParameters<typeof Resvg>[1],
) {
  return render(svg, options, (image) => image.asPng().slice());
}
export async function rasterizePixels(svg: string) {
  return render(svg, {}, (image) => ({
    width: image.width,
    height: image.height,
    data: image.pixels.slice(),
  }));
}
async function render<T>(
  svg: string,
  options: ConstructorParameters<typeof Resvg>[1],
  read: (image: ReturnType<InstanceType<typeof Resvg>["render"]>) => T,
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
      return read(image);
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}
