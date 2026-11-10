import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { audit } from "./accessibility";

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

test("Classic shows a readable word choice and keeps the board at doubled text size", async ({
  page,
  browser,
}) => {
  const guest = await browser.newPage({
    viewport: { width: 320, height: 568 },
  });
  const code = `large-text-${Date.now().toString(36)}`;
  try {
    await enter(page, code, "classic", "Mobile host");
    await enter(guest, code, "classic", "Friend");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(page.locator(".word-choice")).toHaveCount(3);
    await audit(page);
    await page.locator(".word-choice").first().click();
    await expect(
      guest.getByRole("textbox", { name: "Your guess" }),
    ).toBeVisible();
    await guest.evaluate(() => {
      const elements = [
        ...document.querySelectorAll<HTMLElement>("body *"),
      ].map((el) => [el, parseFloat(getComputedStyle(el).fontSize)] as const);
      for (const [el, size] of elements)
        if (el.style && Number.isFinite(size))
          el.style.setProperty("font-size", `${size * 2}px`, "important");
    });
    const board = guest.locator(".canvas-wrap canvas");
    await board.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => (await board.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(100);
    await expect(board).toBeInViewport();
  } finally {
    await guest.close();
  }
});

test("switching information pages updates the current deep link", async ({
  page,
}) => {
  await page.goto("/?info=help");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Privacy" })
    .click();
  await expect(page).toHaveURL("/?info=privacy");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("What leaves it");
});

test("short landscape keeps room entry in the first viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/");
  const enterRoom = page.getByRole("button", {
    name: "Enter room",
    exact: true,
  });
  await expect(enterRoom).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Friend");
  await expect(enterRoom).toBeEnabled();
});

test("unknown pages return a 404 and crawler files serve their own content", async ({
  page,
  request,
}) => {
  expect((await page.goto("/no-such-page"))?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found." }),
  ).toBeVisible();
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap:");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(
    "<loc>https://iguess.aidenjang.com/</loc>",
  );
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
