import { test } from "node:test";
import assert from "node:assert/strict";
import { shareOrDownload } from "./share";
const payload = { title: "iguess", text: "The evidence." };
function replace(name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  };
}
test("successful native sharing returns a distinct outcome", async (t) => {
  let calls = 0;
  t.after(
    replace("navigator", {
      canShare: () => true,
      share: async () => {
        calls++;
      },
    }),
  );
  assert.equal(
    await shareOrDownload(
      new Blob(["ink"], { type: "image/png" }),
      "art.png",
      payload,
    ),
    "shared",
  );
  assert.equal(calls, 1);
});
test("cancelling native sharing never triggers a fallback download", async (t) => {
  t.after(
    replace("navigator", {
      canShare: () => true,
      share: async () => {
        throw new DOMException("Closed", "AbortError");
      },
    }),
  );
  t.after(
    replace("document", {
      createElement: () => {
        throw new Error("must not download");
      },
    }),
  );
  assert.equal(
    await shareOrDownload(new Blob(["ink"]), "art.png", payload),
    "cancelled",
  );
});
test("an unsupported file share downloads with the requested filename", async (t) => {
  let clicked = false;
  const anchor = {
    href: "",
    download: "",
    click: () => {
      clicked = true;
    },
    remove: () => {},
  };
  t.after(replace("navigator", { canShare: () => false }));
  t.after(
    replace("document", {
      createElement: () => anchor,
      body: { appendChild: () => {} },
    }),
  );
  assert.equal(
    await shareOrDownload(new Blob(["ink"]), "art.png", payload),
    "downloaded",
  );
  assert.equal(clicked, true);
  assert.equal(anchor.download, "art.png");
});
