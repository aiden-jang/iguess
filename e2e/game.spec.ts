import { galleryProbe } from "./visualProbe";
import { audit } from "./accessibility";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// A fresh room per test AND per run. Rooms are real Durable Objects that outlive a socket by
// a reconnect grace window, so reusing a name means the previous run still holds the host slot
// and the new joiner never sees the start button.
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const roomFor = (label: string) => `e2e-${label}-${runId}`;
async function join(
  page: Page,
  room: string,
  name: string,
  mode = "AI Guesser",
) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByText("Room code & more ways to play", { exact: true })
    .click();
  await page.getByRole("textbox", { name: /^Room code/ }).fill(room);
  await page.getByRole("button", { name: new RegExp(mode, "i") }).click();
  await page.getByRole("button", { name: /Enter room|Join the room/i }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

test("the host starts a game and is offered one word per difficulty", async ({
  page,
}) => {
  await join(page, roomFor("choose"), "Host");
  await page.getByRole("button", { name: /Start game/i }).click();

  // Three options, each labelled with what it pays, plus the one-per-game skip.
  const tiles = page
    .locator(".word-tiles button")
    .filter({ hasNotText: "skip" });
  await expect(tiles).toHaveCount(3);
  await expect(page.locator(".word-tiles")).toContainText("1x");
  await expect(page.locator(".word-tiles")).toContainText("1.6x");
  await expect(page.getByRole("button", { name: /skip/i })).toBeVisible();
});

test("skipping swaps every word and then goes away", async ({ page }) => {
  await join(page, roomFor("skip"), "Host");
  await page.getByRole("button", { name: /Start game/i }).click();
  const tiles = page
    .locator(".word-tiles button")
    .filter({ hasNotText: "skip" });
  await expect(tiles).toHaveCount(3);
  const before = await tiles.allInnerTexts();

  await page.getByRole("button", { name: /skip/i }).click();
  // Wait for the replacement to arrive: the old three are still on screen until it does, so
  // asserting on a count alone would read the pre-skip words back.
  await expect
    .poll(async () => (await tiles.allInnerTexts()).join("|"))
    .not.toBe(before.join("|"));
  const after = await tiles.allInnerTexts();
  expect(after.some((w) => before.includes(w))).toBe(false);
  await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
});

test("picking a word starts the round and hides the word from the board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await join(page, roomFor("round"), "Host");
  await page.getByRole("button", { name: /Start game/i }).click();
  const tiles = page
    .locator(".word-tiles button")
    .filter({ hasNotText: "skip" });
  await tiles.first().click();

  await expect(page.getByText(/⏱/)).toBeVisible();
  await expect(page.locator(".word-zone")).toHaveCSS(
    "flex-direction",
    "column",
  );
  // The drawer's own tools are live now.
  await expect(
    page.getByTitle("fill an area with the current colour"),
  ).toBeEnabled();
  await expect(page.getByTitle("undo the last stroke")).toBeEnabled();
});

test("the lobby board is drawable before anyone starts", async ({ page }) => {
  await join(page, roomFor("lobby"), "Host");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  // The board mounts with a pop-in animation. Measuring mid-animation gives a box the canvas
  // has already moved out of, and the press lands on the page behind it.
  await page.waitForTimeout(700);
  await canvas.hover();
  const box = (await canvas.boundingBox())!;

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 12 });
  await page.mouse.up();

  // Undo is the honest proof a stroke was recorded: it only does anything if one exists.
  const painted = await canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(200);
});

test("a finished game shows the gallery, a replay and the shareable card", async ({
  page,
}) => {
  test.setTimeout(90_000); // a real round has to actually elapse
  await page.setViewportSize({ width: 1440, height: 1000 });
  await join(page, roomFor("finish"), "Host");

  // Shortest possible game: one round on the shortest clock.
  // Both labels contain "round", so match on the option values instead of the label text.
  await page.getByText("Game settings", { exact: true }).click();
  await page.locator("select").filter({ hasText: "30s" }).selectOption("30");
  await page
    .locator("select")
    .filter({ hasText: "first to" })
    .selectOption("r1");
  await page.getByRole("button", { name: /Start game/i }).click();

  const tiles = page
    .locator(".word-tiles button")
    .filter({ hasNotText: "skip" });
  await expect(tiles).toHaveCount(3);
  await tiles.first().click();

  // Put something on the board so the round has a drawing to remember.
  const canvas = page.locator("canvas");
  await page.waitForTimeout(500);
  await canvas.hover();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 180, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".turn-recap")).toBeVisible({ timeout: 40_000 });
  if (process.env.CAPTURE_UI === "1")
    await page.screenshot({
      animations: "disabled",
      path: "docs/ui-review/finish/turn-recap-desktop.jpg",
      fullPage: true,
    });
  // Round over, then the results screen.
  await expect(
    page.getByRole("button", { name: "Play again", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  // The first round's drawing has to survive: the game_state after turn_end still carries the
  // old turn index, and a zero-check here used to wipe the gallery the moment it was filled.
  await expect(page.locator("figure")).toHaveCount(1);
  await expect(page.locator(".chat-disclosure")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.getByRole("list", { name: "Game awards" })).toHaveCount(0);
  await expect(page.locator(".drawing-card")).toContainText("AI: no comment.");
  await expect(
    page.getByRole("button", { name: /replay/i }).first(),
  ).toBeVisible();

  if (process.env.CAPTURE_UI === "1") {
    await page.screenshot({
      animations: "disabled",
      path: "docs/ui-review/finish/results-desktop.jpg",
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      animations: "disabled",
      path: "docs/ui-review/finish/results-desktop-dark.jpg",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      animations: "disabled",
      path: "docs/ui-review/finish/results-mobile-dark.jpg",
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({
      animations: "disabled",
      path: "docs/ui-review/finish/results-mobile.jpg",
      fullPage: true,
    });
  }

  await audit(page);
  // The replay swaps the still for a live canvas that redraws the round.
  await page
    .getByRole("button", { name: /replay/i })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: /still/i }).first(),
  ).toBeVisible();
  await page
    .locator(".replay-controls")
    .getByRole("button", { name: "Restart replay", exact: true })
    .click();
  await page
    .locator(".replay-controls")
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  await expect(
    page
      .locator(".replay-controls")
      .getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      value: () => false,
      configurable: true,
    });
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Share the evidence", exact: true })
    .click();
  const evidence = await download;
  expect(evidence.suggestedFilename()).toMatch(/^iguess-evidence-.*\.png$/);
  expect(await evidence.failure()).toBeNull();
  if (process.env.CAPTURE_UI === "1")
    await evidence.saveAs("docs/ui-review/finish/shared-evidence.png");
  await page
    .getByRole("button", { name: /Show still:/ })
    .first()
    .click();
  await galleryProbe(page);
});

test("Classic waits for another player and only the host can start", async ({
  page,
  browser,
}) => {
  const room = roomFor("classic-permissions");
  await join(page, room, "Host", "Classic");
  await expect(
    page.getByRole("button", { name: "Start game", exact: true }),
  ).toBeDisabled();
  const guest = await browser.newPage();
  try {
    await join(guest, room, "Guest", "Classic");
    await expect(
      page.getByRole("button", { name: "Start game", exact: true }),
    ).toBeEnabled();
    await expect(
      guest.getByRole("button", { name: "Waiting for the host", exact: true }),
    ).toBeDisabled();
  } finally {
    await guest.close();
  }
});
