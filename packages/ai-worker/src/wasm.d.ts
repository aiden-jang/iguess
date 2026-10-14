// wrangler bundles `*.wasm` imports into a WebAssembly.Module (handed to resvg's initWasm).
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

// Wrangler bundles the licensed font as data so invite previews render text in Workers.
declare module "*.woff2" {
  const font: ArrayBuffer;
  export default font;
}
