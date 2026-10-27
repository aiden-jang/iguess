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

test("a browser refusing the file capability check still offers a download", async (t) => {
  let clicked = false;
  t.after(
    replace("navigator", {
      share: async () => {},
      canShare: () => {
        throw new Error("Policy denied");
      },
    }),
  );
  t.after(
    replace("document", {
      createElement: () => ({
        click: () => {
          clicked = true;
        },
        remove: () => {},
      }),
      body: { appendChild: () => {} },
    }),
  );
  assert.equal(
    await shareOrDownload(new Blob(["ink"]), "art.png", payload),
    "downloaded",
  );
  assert.equal(clicked, true);
});

test("a native share failure after its owner closes cannot start a download", async (t) => {
  let reject!: (error: Error) => void;
  let current = true;
  t.after(
    replace("navigator", {
      canShare: () => true,
      share: () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    }),
  );
  t.after(
    replace("document", {
      createElement: () => {
        throw new Error("must not download after cleanup");
      },
    }),
  );
  const sharing = shareOrDownload(
    new Blob(["ink"]),
    "art.png",
    payload,
    () => current,
  );
  current = false;
  reject(new Error("Native sheet failed"));
  assert.equal(await sharing, "cancelled");
});
