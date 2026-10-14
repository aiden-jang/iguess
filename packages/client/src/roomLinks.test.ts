import { test } from "node:test";
import assert from "node:assert/strict";
import { readInvite } from "./roomLinks";

test("room invitations preserve names and modes from both current and legacy URLs", () => {
  assert.deepEqual(
    readInvite(new URL("https://example.com/r/quiet-cat?mode=duel&name=Bo")),
    { room: "quiet-cat", mode: "duel", name: "Bo" },
  );
  assert.deepEqual(
    readInvite(new URL("https://example.com/#room=quiet-cat&mode=classic")),
    { room: "quiet-cat", mode: "classic", name: undefined },
  );
});
test("a malformed room escape does not crash the join screen", () => {
  assert.equal(
    readInvite(new URL("https://example.com/r/%oops")).room,
    "%oops",
  );
  assert.deepEqual(readInvite(new URL("https://example.com/")), {});
});

test("installed-app share targets retain the invitation's mode", () => {
  const shared = new URL("https://example.com/");
  shared.searchParams.set("url", "https://example.com/r/quiet-cat?mode=duel");
  assert.deepEqual(readInvite(shared), {
    room: "quiet-cat",
    mode: "duel",
    name: undefined,
  });
});
