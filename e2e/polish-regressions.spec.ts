import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function enter(page: Page, room: string, mode: string, name: string) {
  await page.goto(`/r/${room}?mode=${mode}`);
  await page.getByRole("textbox", { name: "Your name" }).fill(name);
  await page.getByRole("button", { name: "Join the room" }).click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
}

test("a short landscape turn keeps a usable board and all ink colors", async ({
  page,
  browser,
}) => {
  const guest = await browser.newPage();
  const code = `short-landscape-${Date.now().toString(36)}`;
  try {
    await page.setViewportSize({ width: 568, height: 320 });
    await enter(page, code, "classic", "Artist");
    await enter(guest, code, "classic", "Friend");
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.locator(".word-choice").first().click();
    await expect(
      page.getByRole("heading", { name: /Your word is/ }),
    ).toBeVisible();
    const canvas = page.locator(".canvas-wrap canvas");
    await expect
      .poll(async () => (await canvas.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(100);
    for (const color of ["Yellow", "Brown"]) {
      await page.locator(".ink-control summary").click();
      await page.getByRole("button", { name: `Color ${color}` }).click();
      await expect(page.locator(".ink-control summary")).toHaveAccessibleName(
        `Ink color: ${color}`,
      );
    }
  } finally {
    await guest.close();
  }
});

test("a stale Relay invite still receives the existing Classic board", async ({
  page,
  browser,
}) => {
  const guest = await browser.newPage();
  const code = `mode-fallback-${Date.now().toString(36)}`;
  try {
    await enter(page, code, "classic", "Artist");
    const board = page.locator(".canvas-wrap canvas");
    const box = (await board.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await enter(guest, code, "relay", "Friend");
    await expect(guest.locator(".room-mode")).toHaveText("Classic");
    await expect
      .poll(() =>
        guest
          .locator(".canvas-wrap canvas")
          .evaluate((canvas: HTMLCanvasElement) => {
            const ctx = canvas.getContext("2d")!;
            return ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1)
              .data[3];
          }),
      )
      .toBeGreaterThan(0);
  } finally {
    await guest.close();
  }
});
