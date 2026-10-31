import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { capture } from "./visualProbe";

const roomCode = () =>
  `club-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
async function enter(page: Page, room = roomCode(), name = "Art department") {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByText("Room code & more ways to play", { exact: true })
    .click();
  await page.getByRole("textbox", { name: /^Room code/ }).fill(room);
  await page.getByRole("button", { name: /Classic/ }).click();
  await page.getByRole("button", { name: /Enter room|Join the room/i }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

test("information dialogs support deep links, Escape and returning focus", async ({
  page,
}) => {
  await page.goto("/?info=privacy");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("What leaves it");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "How to play", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ready is a signal");
  await page.getByRole("button", { name: "Close information" }).click();
  await expect(
    page.getByRole("link", { name: "How to play", exact: true }),
  ).toBeFocused();
});

test("leaving requires confirmation and browser Back returns to joining", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: /← Leave/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Draw badly/ })).toBeVisible();
});

test("pen shortcuts are scoped to drawing and never consume chat typing", async ({
  page,
}) => {
  await enter(page);
  const pen = page.getByRole("button", { name: /Pen/, exact: false });
  const fill = page.getByTitle("fill an area with the current colour");
  await fill.click();
  await expect(fill).toHaveAttribute("aria-pressed", "true");
  await page.locator("canvas").focus();
  await page.keyboard.press("b");
  await expect(pen).toHaveAttribute("aria-pressed", "true");
  await expect(fill).toHaveAttribute("aria-pressed", "false");
  const input = page.getByRole("textbox", { name: "Chat message" });
  await input.pressSequentially("beef");
  await expect(input).toHaveValue("beef");
  await expect(pen).toHaveAttribute("aria-pressed", "true");
});

test("the narrow lobby keeps its roster optional and help reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  if (process.env.CAPTURE_UI_OUTPUT) {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await capture(page, `lobby-art-${colorScheme}-${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
  }
  await expect(page.locator(".room-roster")).not.toHaveAttribute("open", "");
  await page.locator(".room-roster summary").click();
  await expect(
    page.getByRole("list", { name: "Player standings" }),
  ).toBeVisible();
  const sound = page.getByRole("checkbox", {
    name: "Sound effects",
    exact: true,
  });
  await expect(sound).toBeChecked();
  await sound.uncheck();
  await expect(sound).not.toBeChecked();
  await sound.press("Escape");
  await expect(page.locator(".room-roster")).not.toHaveAttribute("open", "");
  await expect(page.locator(".room-roster summary")).toBeFocused();
  await page.getByRole("link", { name: "How to play", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Privacy", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your drawing. Your business.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Terms", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("The house rules.");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture(page, "lobby-mobile");
});

test("join layouts fit both palettes and expose privacy and terms", async ({
  page,
}) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
      { width: 320, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      if (
        process.env.CAPTURE_UI === "1" &&
        colorScheme === "light" &&
        viewport.width !== 320
      ) {
        await page.screenshot({
          animations: "disabled",
          path: `packages/client/public/screenshots/${viewport.width > 700 ? "join-current" : "join-current-mobile"}.jpg`,
        });
      }
      await expect(
        page.getByRole("link", { name: "Privacy", exact: true }),
      ).toBeAttached();
      await expect(
        page.getByRole("link", { name: "Terms", exact: true }),
      ).toBeAttached();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await capture(
        page,
        `join-${viewport.width > 700 ? "desktop" : viewport.width === 320 ? "tiny" : "mobile"}-${colorScheme}`,
      );
    }
  }
});

test("word choices, drawing and viewer controls stay usable at both widths", async ({
  page,
  browser,
}) => {
  const room = roomCode();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enter(page, room, "Art department");
  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  try {
    await enter(guest, room, "Quality control");
    await capture(page, "lobby-desktop");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(page.locator(".word-choice")).toHaveCount(3);
    await capture(page, "word-choice-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (await page.locator(".word-choice").first().boundingBox())!.width,
    ).toBeGreaterThan(260);
    await capture(page, "word-choice-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".word-choice").first().click();
    await expect(guest.locator(".viewer-note")).toBeVisible();
    await expect(
      guest.getByTitle("fill an area with the current colour"),
    ).toHaveCount(0);
    await page.locator("canvas").hover();
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, {
      steps: 12,
    });
    await page.mouse.up();
    await capture(page, "drawing-desktop");
    await page.emulateMedia({ colorScheme: "dark" });
    await capture(page, "drawing-desktop-dark");
    await page.emulateMedia({ colorScheme: "light" });
    await capture(guest, "guessing-mobile");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("textbox", { name: "Your guess", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".reaction-bar")).not.toBeVisible();
    await capture(page, "drawing-mobile");
    await page.setViewportSize({ width: 320, height: 740 });
    await capture(page, "drawing-tiny");
    const brush = (await page
      .getByRole("slider", { name: "Brush size" })
      .boundingBox())!;
    const undo = (await page.getByTitle("undo the last stroke").boundingBox())!;
    expect(
      brush.x + brush.width <= undo.x ||
        brush.y + brush.height <= undo.y ||
        undo.y + undo.height <= brush.y,
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await guest.close();
  }
});

test("a chat draft survives refresh and rejoining the same room", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("textbox", { name: "Chat message" })
    .fill("A considered opinion.");
  await page.reload();
  await page.getByRole("button", { name: /Enter room|Join the room/i }).click();
  await expect(page.getByRole("textbox", { name: "Chat message" })).toHaveValue(
    "A considered opinion.",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Chat message" })).toHaveValue(
    "",
  );
});

test("settings keep room changes when dismissed and return focus on Escape", async ({
  page,
}) => {
  await enter(page);
  const settings = page.locator(".host-settings");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await settings.locator("summary").click();
    await page.getByRole("combobox", { name: /Turn time/ }).selectOption("30");
    await page.getByLabel("Custom words", { exact: true }).fill("moon, teapot");
    await capture(page, `settings-${width === 1440 ? "desktop" : "mobile"}`);
    await page.locator(".room-wordmark").click();
    await expect(settings).not.toHaveAttribute("open", "");
    await expect(settings.locator("summary")).toContainText("30s");
    await settings.locator("summary").click();
    await expect(page.getByLabel("Custom words", { exact: true })).toHaveValue(
      "moon, teapot",
    );
    await page.getByLabel("Custom words", { exact: true }).press("Escape");
    await expect(settings).not.toHaveAttribute("open", "");
    await expect(settings.locator("summary")).toBeFocused();
  }
});
