import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { REACTION_OPTIONS } from "@iguess/shared";
import { ReactionSticker } from "./ReactionSticker";

test("every current reaction has bundled vector artwork and legacy reactions stay readable", () => {
  for (const { emoji } of REACTION_OPTIONS) {
    const markup = renderToStaticMarkup(
      createElement(ReactionSticker, { emoji }),
    );
    assert.ok(markup.includes("<svg"), emoji);
    assert.ok(markup.includes("<path"), emoji);
    assert.ok(markup.includes('aria-hidden="true"'), emoji);
  }
  const legacy = renderToStaticMarkup(
    createElement(ReactionSticker, { emoji: "😂" }),
  );
  assert.ok(legacy.includes("😂"));
  assert.ok(!legacy.includes("<svg"));
});
