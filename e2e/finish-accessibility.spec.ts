import { test, expect } from "./fixtures";
import { audit } from "./accessibility";
import { capture } from "./visualProbe";

test("entry and legal dialogs pass accessibility checks in both palettes", async ({
  page,
}, info) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({
      width: colorScheme === "light" ? 1440 : 390,
      height: 1000,
    });
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Your name", exact: true })
      .fill("Guest artist");
    await audit(page);
    if (process.env.CAPTURE_AUDIT === "1")
      await page.screenshot({
        path: `test-results/visual-review/repository/join-ready-${colorScheme}-${info.project.name}.jpg`,
        fullPage: true,
        animations: "disabled",
      });
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await audit(page);
    if (colorScheme === "light") await capture(page, "privacy-desktop", false);
    await page.keyboard.press("Escape");
  }
});
test("room controls pass accessibility checks and feedback preferences stay in sync", async ({
  page,
}) => {
  await page.goto(`/r/audit-${Date.now().toString(36)}?mode=classic`);
  await page.getByLabel("Your name", { exact: true }).fill("Guest artist");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
  await audit(page);
  await page.locator(".room-roster summary").click();
  await audit(page);
  await capture(page, "players-preferences-desktop");
  await page
    .getByRole("checkbox", { name: "Sound effects", exact: true })
    .uncheck();
  await expect(page.locator(".room-sound")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("checkbox", { name: "Haptics", exact: true }).uncheck();
  await page
    .getByRole("checkbox", { name: "Playful motion", exact: true })
    .uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "false");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await audit(page);
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await page.locator(".room-roster summary").click();
  for (const name of ["Sound effects", "Haptics", "Playful motion"])
    await expect(
      page.getByRole("checkbox", { name, exact: true }),
    ).not.toBeChecked();
});
test("room loading failures offer a clear way back", async ({ page }) => {
  await page.route(/\/(?:src\/Room\.tsx|assets\/Room-[^/]+\.js)/, (route) =>
    route.abort(),
  );
  await page.goto("/r/load-check?mode=classic");
  await page.getByLabel("Your name", { exact: true }).fill("Guest");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("The game couldn’t load");
  await capture(page, "room-load-error", false);
  await page.getByRole("button", { name: /Back to join/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Your name", exact: true }),
  ).toBeVisible();
});
test("layout survives zoom, landscape and a simulated mobile keyboard", async ({
  page,
}) => {
  await page.goto(`/r/viewport-${Date.now().toString(36)}?mode=classic`);
  await page
    .getByLabel("Your name", { exact: true })
    .fill("A very considered opinion");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 768 ? 390 : 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".room-roster summary")).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "How to play", exact: true }),
    ).toBeInViewport();
  }
  const before = await page
    .locator(".room-roster summary")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>("body *")].map(
      (el) => [el, parseFloat(getComputedStyle(el).fontSize)] as const,
    );
    elements.forEach(([el, size]) => {
      el.dataset.qaFont = el.style.fontSize;
      el.dataset.qaFontPriority = el.style.getPropertyPriority("font-size");
      el.style.setProperty("font-size", `${size * 2}px`, "important");
    });
  });
  expect(
    await page
      .locator(".room-roster summary")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBe(before * 2);
  await capture(page, "room-text-enlargement");
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.right > innerWidth + 1;
        })
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          right: el.getBoundingClientRect().right,
        })),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Save", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeInViewport();
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      el.style.setProperty(
        "font-size",
        el.dataset.qaFont ?? "",
        el.dataset.qaFontPriority ?? "",
      );
      delete el.dataset.qaFont;
      delete el.dataset.qaFontPriority;
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("textbox", { name: "Chat message", exact: true })
    .focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, "height", {
      configurable: true,
      get: () => 400,
    });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-keyboard", "true");
  const input = (await page
    .getByRole("textbox", { name: "Chat message", exact: true })
    .boundingBox())!;
  expect(input.y + input.height).toBeLessThanOrEqual(401);
  await page.evaluate(() => {
    Reflect.deleteProperty(visualViewport!, "height");
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-keyboard", "false");
});
