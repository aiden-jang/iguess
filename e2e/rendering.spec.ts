import { test, expect } from "./fixtures";
import type { DrawOp } from "../shared/events";

const ops: DrawOp[] = [
  { kind: "fill", strokeId: "blue", point: { x: 0, y: 0 }, color: "#0000ff" },
  {
    kind: "start",
    strokeId: "erase",
    point: { x: 0.5, y: 0 },
    width: 40,
    color: "#000000",
    erase: true,
  },
  { kind: "move", strokeId: "erase", points: [{ x: 0.5, y: 1 }] },
  { kind: "end", strokeId: "erase" },
  {
    kind: "fill",
    strokeId: "green",
    point: { x: 0.5, y: 0.5 },
    color: "#00ff00",
  },
  {
    kind: "start",
    strokeId: "pressure",
    point: { x: 0.1, y: 0.5 },
    width: 6,
    color: "#ff0000",
  },
  {
    kind: "move",
    strokeId: "pressure",
    points: [
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.5 },
    ],
    widths: [2, 30],
  },
  { kind: "end", strokeId: "pressure" },
];

test("browser drawing preserves transparent erasing, refill and pressure segments", async ({
  page,
  request,
}, info) => {
  const health = await request.get("http://127.0.0.1:33400/health");
  expect((await health.json()).provider).toBe("mock");
  const rendered = await request.post("http://127.0.0.1:33400/render-check", {
    data: { ops },
  });
  expect(rendered.ok()).toBeTruthy();
  const png = (await rendered.body()).toString("base64");
  await page.goto("http://127.0.0.1:33100/");
  const colors = await page.evaluate(
    async ({ operations, png }) => {
      const { paintOp, newStrokeStates } = await import(`/src/${"paint"}.ts`);
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      canvas.dataset.renderEvidence = "true";
      const ctx = canvas.getContext("2d")!;
      const state = newStrokeStates();
      for (const op of operations) paintOp(ctx, op, state, 800, 600);
      const samples = [
        [400, 300],
        [400, 100],
        [100, 100],
        [500, 310],
        [110, 310],
      ].map(([x, y]) => [...ctx.getImageData(x!, y!, 1, 1).data]);
      const exportImage = new Image();
      exportImage.src = `data:image/png;base64,${png}`;
      await exportImage.decode();
      const exported = document.createElement("canvas");
      exported.width = 800;
      exported.height = 600;
      const target = exported.getContext("2d")!;
      target.drawImage(exportImage, 0, 0);
      const vision = [
        [400, 300],
        [400, 100],
        [100, 100],
        [500, 310],
        [110, 310],
      ].map(([x, y]) => [...target.getImageData(x!, y!, 1, 1).data]);
      document.body.replaceChildren(canvas);
      return { browser: samples, vision };
    },
    { operations: ops, png },
  );
  const expected = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 0, 0, 255],
    [0, 0, 255, 255],
  ];
  expect(colors.browser).toEqual(expected);
  expect(colors.vision).toEqual(expected);
  if (process.env.CAPTURE_AUDIT === "1")
    await page.locator("canvas").screenshot({
      path: `docs/ui-review/repository/render-tools-${info.project.name}.png`,
    });
});
