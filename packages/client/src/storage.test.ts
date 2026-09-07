import { test } from "node:test";
import assert from "node:assert/strict";
import { readStored, writeStored } from "./storage";

const g = globalThis as unknown as Record<string, unknown>;

function withStorage<T>(stub: unknown, fn: () => T): T {
  const had = "localStorage" in g;
  const previous = g["localStorage"];
  g["localStorage"] = stub;
  try {
    return fn();
  } finally {
    if (had) g["localStorage"] = previous;
    else delete g["localStorage"];
  }
}

const throwing = {
  getItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem() {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

test("a working store round-trips", () => {
  const store = new Map<string, string>();
  withStorage(
    {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    () => {
      writeStored("iguess_muted", "1");
      assert.equal(readStored("iguess_muted"), "1");
    },
  );
});

test("a missing key reads as null, not undefined", () => {
  withStorage({ getItem: () => null, setItem: () => {} }, () => {
    assert.equal(readStored("nope"), null);
  });
});

test("a browser blocking site data reads as null instead of throwing", () => {
  withStorage(throwing, () => {
    assert.equal(readStored("iguess_muted"), null);
  });
});

test("a blocked write is dropped, not thrown", () => {
  withStorage(throwing, () => {
    assert.doesNotThrow(() => writeStored("iguess_muted", "1"));
  });
});

// Node has no localStorage, so this is also what a non-browser render would hit.
test("no storage at all is survivable", () => {
  const had = "localStorage" in g;
  const previous = g["localStorage"];
  delete g["localStorage"];
  try {
    assert.equal(readStored("iguess_muted"), null);
    assert.doesNotThrow(() => writeStored("iguess_muted", "1"));
  } finally {
    if (had) g["localStorage"] = previous;
  }
});
