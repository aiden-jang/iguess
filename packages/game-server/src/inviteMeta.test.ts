import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteInviteMeta } from "./inviteMeta.ts";

const shell = `<html><head>
<meta property="og:title" content="iguess" />
<meta property="og:description" content="old" />
<meta property="og:image" content="https://iguess.aidenjang.com/og.png" />
<meta name="twitter:title" content="iguess" />
<meta name="twitter:description" content="old" />
<meta name="twitter:image" content="https://iguess.aidenjang.com/og.png" />
</head><body></body></html>`;

test("an invite gets its own title and card", () => {
  const out = rewriteInviteMeta(
    shell,
    "spicy-wombat-47",
    "classic",
    "https://ai.example.com",
  );
  assert.match(
    out,
    /og:title" content="join &quot;spicy-wombat-47&quot; on iguess"/,
  );
  // & is escaped to &amp; in the attribute, which is correct HTML: a scraper parses it back.
  assert.match(
    out,
    /og:image" content="https:\/\/ai\.example\.com\/og\?room=spicy-wombat-47&amp;mode=classic"/,
  );
  assert.match(out, /twitter:image" content="https:\/\/ai\.example\.com\/og\?/);
});

test("without an ai-worker the static card still stands", () => {
  const out = rewriteInviteMeta(shell, "room", "classic", undefined);
  assert.match(
    out,
    /og:image" content="https:\/\/iguess\.aidenjang\.com\/og\.png"/,
  );
  assert.match(out, /og:title" content="join &quot;room&quot; on iguess"/);
});

test("a room name cannot break out of the attribute", () => {
  const out = rewriteInviteMeta(
    shell,
    '"><script>alert(1)</script>',
    "classic",
    undefined,
  );
  assert.ok(
    !out.includes("<script>alert(1)</script>"),
    "injected markup survived",
  );
  assert.match(out, /&lt;script&gt;/);
});

test("a trailing slash on the worker url does not double up", () => {
  const out = rewriteInviteMeta(shell, "r", "m", "https://ai.example.com/");
  assert.match(out, /content="https:\/\/ai\.example\.com\/og\?/);
});
