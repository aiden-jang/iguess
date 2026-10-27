import { test } from "node:test";
import assert from "node:assert/strict";
import { withSecurityHeaders } from "./harden.ts";

test("local HTTP review keeps browser resources on the loopback server", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const response = withSecurityHeaders(
      new Response("room"),
      new URL(`http://${host}:33300/`),
    );
    assert.doesNotMatch(
      response.headers.get("Content-Security-Policy")!,
      /upgrade-insecure-requests/,
    );
    assert.match(
      response.headers.get("Content-Security-Policy")!,
      /script-src 'self'/,
    );
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  }
});

test("secure, production and unrecognized origins retain HTTPS upgrading", () => {
  for (const url of [
    undefined,
    new URL("https://127.0.0.1/"),
    new URL("https://iguess.aidenjang.com/"),
    new URL("http://iguess.aidenjang.com/"),
    new URL("http://localhost.example.com/"),
  ]) {
    const response = withSecurityHeaders(new Response("room"), url);
    assert.match(
      response.headers.get("Content-Security-Policy")!,
      /upgrade-insecure-requests/,
    );
    assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  }
});
