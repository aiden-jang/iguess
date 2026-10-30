import { test, expect } from "./fixtures";

const AI = "http://127.0.0.1:33400";

// Five blanks, so the mock's answer has to be five letters. That is how we know the hint reached
// the provider rather than being dropped on the way.
const HINT = "_ _ _ _ _";

const STROKES = [
  {
    kind: "start",
    strokeId: "s1",
    color: "#111111",
    width: 6,
    point: { x: 0.2, y: 0.2 },
  },
  {
    kind: "move",
    strokeId: "s1",
    points: [
      { x: 0.5, y: 0.3 },
      { x: 0.8, y: 0.7 },
    ],
  },
  { kind: "end", strokeId: "s1" },
];

test.beforeEach(async ({ request }) => {
  const health = await request.get(`${AI}/health`);
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).provider).toBe("mock");
});

test("a local POST /guess reaches the mock provider and comes back", async ({
  request,
}) => {
  const res = await request.post(`${AI}/guess`, {
    data: { ops: STROKES, hint: HINT },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.provider).toBe("mock");
  expect(typeof body.guess).toBe("string");
  expect(body.guess.length).toBe(HINT.replace(/\s+/g, "").length);
  expect(Array.isArray(body.alternatives)).toBeTruthy();
});

test("an empty canvas is answered without asking a provider", async ({
  request,
}) => {
  const res = await request.post(`${AI}/guess`, { data: { ops: [] } });
  expect(res.status()).toBe(200);
  expect((await res.json()).guess).toBe("");
});

test("a hint with no blanks is refused as a hint, since it would be the answer", async ({
  request,
}) => {
  const res = await request.post(`${AI}/guess`, {
    data: { ops: STROKES, hint: "elephant" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // The word itself was ignored, so the answer is not shaped by it.
  expect(body.guess).not.toBe("elephant");
});

test("an invite preview renders its room with the bundled font", async ({
  request,
}) => {
  const response = await request.get(
    `${AI}/og?room=an-unofficial-art-show&mode=Classic`,
  );
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toBe("image/png");
  const png = await response.body();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  if (process.env.CAPTURE_UI === "1") {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(test.info().outputPath("room-invite.png"), png);
  }
});
