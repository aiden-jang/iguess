import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClientMessage } from "@iguess/shared/protocol";
import { parseServerMessage } from "@iguess/shared/serverProtocol";

test("both transports accept current and previous reactions but reject arbitrary overlays", () => {
  for (const emoji of [
    "😭",
    "💀",
    "🫠",
    "🫡",
    "🤨",
    "🗿",
    "🥀",
    "🔥",
    "😂",
    "👏",
    "😍",
    "🤔",
    "🙈",
    "🐶",
  ]) {
    const outgoing = { type: "react", emoji };
    const incoming = { ...outgoing, at: 0.5 };
    assert.deepEqual(parseClientMessage(JSON.stringify(outgoing)), outgoing);
    assert.deepEqual(parseServerMessage(JSON.stringify(incoming)), incoming);
  }
  for (const emoji of ["hello", "<img src=x>", "😭hello", "", null, 1]) {
    assert.equal(
      parseClientMessage(JSON.stringify({ type: "react", emoji })),
      null,
    );
    assert.equal(
      parseServerMessage(JSON.stringify({ type: "react", emoji, at: 0.5 })),
      null,
    );
  }
});
