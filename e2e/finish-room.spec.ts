import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
const code = () =>
  `finish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
async function enter(page: Page, room: string, name = "Host") {
  await page.goto(`/r/${room}?mode=classic`);
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

test("invalid custom words remain editable and never overwrite the saved room rules", async ({
  page,
  browser,
}) => {
  const room = code();
  let releaseEcho: (() => void) | undefined;
  await page.routeWebSocket("**/rooms/**/ws?**", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((data) => {
      const message = JSON.parse(String(data)) as { type: string };
      if (message.type === "settings") releaseEcho = () => socket.send(data);
      else socket.send(data);
    });
  });
  await enter(page, room);
  await page.getByText("Game settings", { exact: true }).click();
  const words = page.getByLabel("Custom words", { exact: true });
  await words.fill("moon, teapot");
  await words.press("Enter");
  await expect.poll(() => !!releaseEcho).toBe(true);
  await words.fill("x");
  await words.press("Enter");
  releaseEcho!();
  await expect(words).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("needs 2–24 letters");
  const guest = await browser.newPage();
  try {
    await enter(guest, room, "Guest");
    await guest.getByText("Game settings", { exact: true }).click();
    await expect(guest.getByLabel("Custom words", { exact: true })).toHaveValue(
      "moon, teapot",
    );
    await expect(
      guest.getByLabel("Custom words", { exact: true }),
    ).toBeDisabled();
  } finally {
    await guest.close();
  }
  await expect(words).toHaveValue("x");
});

test("room feedback stays inside chat and leaves room controls exposed", async ({
  page,
  browser,
}) => {
  const room = code();
  await enter(page, room);
  const guest = await browser.newPage();
  try {
    await enter(guest, room, "Guest");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.locator(".word-choice").first().click();
    await expect(page.locator(".chat-panel .room-notice")).toContainText(
      "Your turn",
    );
    const notice = (await page.locator(".room-notice").boundingBox())!;
    const header = (await page.locator(".room-header").boundingBox())!;
    expect(notice.y).toBeGreaterThanOrEqual(header.y + header.height);
    await page
      .getByRole("button", { name: "Dismiss room update", exact: true })
      .click();
    await expect(page.locator(".room-notice")).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
