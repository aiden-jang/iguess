import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuessRequest, readGuessRequest } from "./guessRequest.ts";
test("vision accepts checked strokes and masked hints, never a plaintext answer", () => {
  assert.deepEqual(parseGuessRequest({ ops: [], hint: "c_t" }), {
    ops: [],
    hint: "c_t",
  });
  assert.deepEqual(parseGuessRequest({ ops: [], hint: "cat" }), {
    ops: [],
    hint: undefined,
  });
  assert.equal(
    parseGuessRequest({ ops: [{ kind: "move", points: null }] }),
    null,
  );
  assert.equal(parseGuessRequest({ ops: "drawing" }), null);
  assert.equal(parseGuessRequest(null), null);
});
test("vision body limit works without trusting Content-Length", async () => {
  const request = new Request("http://local/guess", {
    method: "POST",
    body: JSON.stringify({ ops: [], padding: "x".repeat(3_000_001) }),
  });
  assert.equal(await readGuessRequest(request), null);
  assert.deepEqual(
    await readGuessRequest(
      new Request("http://local/guess", { method: "POST", body: '{"ops":[]}' }),
    ),
    { ops: [], hint: undefined },
  );
  assert.equal(
    await readGuessRequest(
      new Request("http://local/guess", { method: "POST", body: "{" }),
    ),
    null,
  );
});
