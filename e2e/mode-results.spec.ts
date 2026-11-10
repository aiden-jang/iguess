import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { capture } from "./visualProbe";

async function join(page: Page, room: string, name: string, mode: string) {
  await page.goto(`/r/${room}?mode=${mode}`);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
}

async function drawAndGuess(drawer: Page, guesser: Page) {
  const choice = drawer.locator(".word-choice").first();
  const word = await choice.locator("strong").innerText();
  await choice.click();
  const canvas = drawer.getByRole("img", { name: /Drawing canvas/ });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await drawer.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.35);
  await drawer.mouse.down();
  await drawer.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
    steps: 4,
  });
  await drawer.mouse.up();
  const guess = guesser.getByRole("textbox", { name: "Your guess" });
  await guess.fill(word);
  await guess.press("Enter");
  return word;
}

test("rejoining a finished Classic game preserves the results for everyone", async ({
  page,
  browser,
}) => {
  const guest = await browser.newPage({
    viewport: { width: 390, height: 800 },
  });
  try {
    const room = `finished-${Date.now().toString(36)}`;
    await join(page, room, "Host", "classic");
    let finishGallery: (() => void) | undefined;
    await guest.routeWebSocket("**/rooms/**/ws?**", (client) => {
      const server = client.connectToServer();
      server.onMessage((message) => {
        if (
          typeof message === "string" &&
          JSON.parse(message).type === "gallery_done" &&
          !finishGallery
        )
          finishGallery = () => client.send(message);
        else client.send(message);
      });
    });
    await join(guest, room, "Guest", "classic");
    await page.getByText("Game settings", { exact: true }).click();
    await page
      .locator("select")
      .filter({ hasText: "first to" })
      .selectOption("r1");
    await page.getByRole("button", { name: /Start game/ }).click();
    const word = await drawAndGuess(page, guest);
    await drawAndGuess(guest, page);
    await expect(guest.locator(".gallery-strip figure").first()).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Save the evidence" }),
    ).toBeDisabled();
    await expect.poll(() => !!finishGallery).toBe(true);
    finishGallery?.();
    await expect(page.locator(".gallery-strip figure")).toHaveCount(2);
    const heading = await page.locator(".results-title h1").innerText();
    await guest.reload();
    await guest.emulateMedia({ reducedMotion: "reduce" });
    await guest
      .getByRole("button", { name: "Join the room", exact: true })
      .click();
    await expect(guest.locator(".results-title h1")).toHaveText(heading);
    await expect(page.locator(".results-title h1")).toHaveText(heading);
    await expect(guest.locator(".gallery-strip figure")).toHaveCount(2);
    await capture(guest, "recovered-classic-results");
    await guest
      .getByRole("button", { name: `Replay: ${word}`, exact: true })
      .click();
    await expect(
      guest.getByRole("img", { name: "Animated replay of the drawing" }),
    ).toBeVisible();
    await expect(
      guest.getByRole("slider", { name: "Replay position" }),
    ).toHaveAttribute("aria-valuetext", "100% complete");
    await expect(
      guest.getByRole("link", { name: /Post to X/ }),
    ).toHaveAttribute("target", "_blank");
    const download = guest.waitForEvent("download");
    await guest.getByRole("button", { name: "Save the evidence" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(
      page.getByRole("heading", { name: "Pick a word." }),
    ).toBeVisible();
    await expect(guest.locator(".gallery-strip figure")).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test("Team Battle shows the shared score and declares the winning side", async ({
  page,
  browser,
}) => {
  test.setTimeout(75_000);
  const guest = await browser.newPage({
    viewport: { width: 390, height: 800 },
    colorScheme: "dark",
  });
  try {
    const room = `team-results-${Date.now().toString(36)}`;
    await join(page, room, "Host", "team-battle");
    await join(guest, room, "Guest", "team-battle");
    await page.getByText("Game settings", { exact: true }).click();
    await page.locator("select").filter({ hasText: "30s" }).selectOption("30");
    await page
      .getByRole("combobox", { name: "Game length" })
      .selectOption("r1");
    await page.getByRole("button", { name: /Start game/ }).click();
    const teamScore = page.getByRole("status", { name: "Team score" });
    await expect(teamScore).toContainText("Humans 0");
    await drawAndGuess(page, guest);
    await expect(teamScore).toContainText("Humans 1");
    await expect(
      guest.getByRole("heading", { name: "The AI is drawing" }),
    ).toBeVisible();
    await expect(
      guest.getByRole("heading", { name: "Humans win." }),
    ).toBeVisible({ timeout: 45_000 });
    await expect(guest.getByRole("status", { name: "Team score" })).toHaveText(
      /Humans 1.*AI 0/,
    );
    await capture(guest, "team-results-phone");
    await capture(page, "team-results-desktop");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.body.dataset.clipboard = text;
          },
        },
      });
    });
    await page.getByRole("button", { name: "Copy results" }).click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-clipboard",
      /Humans win\.[\s\S]*Humans 1 · AI 0/,
    );
  } finally {
    await guest.close();
  }
});

test("AI Drawer shows its own settings and starts without live vision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await join(page, `ai-drawer-${Date.now().toString(36)}`, "Host", "ai-drawer");
  await expect(page.locator(".room-mode")).toHaveText("AI Drawer");
  await expect(
    page.getByRole("complementary", { name: "AI availability" }),
  ).toHaveCount(0);
  await expect(page.locator(".lobby-rules")).toContainText("Curated doodles");
  await page.getByText("Game settings", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "AI skill" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Custom words" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("group", { name: "Word packs" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Turn time" })).toBeVisible();
  await capture(page, "ai-drawer-lobby-phone");
  await page.getByRole("button", { name: /Start game/ }).click();
  await expect(
    page.getByRole("heading", { name: "The AI is drawing" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your guess" })).toBeEnabled();
});
