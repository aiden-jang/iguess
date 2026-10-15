import assert from "node:assert/strict";
import { test } from "node:test";
import { modifierKey } from "./keyboardLabel";
test("shortcut legends identify the modifier for the current platform", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { platform: "MacIntel" },
    });
    assert.equal(modifierKey(), "⌘");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { platform: "Win32" },
    });
    assert.equal(modifierKey(), "Ctrl");
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
