import { test, expect } from "./fixtures";
import { audit } from "./accessibility";
import type { Page } from "@playwright/test";

async function enter(page: Page) {
  await page.goto(`/r/review-${Date.now().toString(36)}?mode=classic`);
  await page
    .getByLabel("Your name", { exact: true })
    .fill("A considered opinion");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`failed invitations stay selectable in ${colorScheme} at phone and desktop widths`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("Blocked")) },
      });
      document.execCommand = () => false;
    });
    await enter(page);
    await page
      .getByRole("button", { name: "Invite friends", exact: true })
      .click();
    const link = page.getByRole("textbox", {
      name: "Room invitation link",
      exact: true,
    });
    await expect(link).toHaveValue(page.url());
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [320, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(link).toBeInViewport();
      await audit(page);
      await page.screenshot({
        path: test.info().outputPath(`invite-${colorScheme}-${width}.png`),
        animations: "disabled",
      });
    }
  });
}

test("a pending invitation opens only one native share sheet", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => {
        calls += 1;
        Object.assign(window, { inviteCalls: calls });
        return new Promise(() => {});
      },
    });
  });
  await enter(page);
  await page
    .getByRole("button", { name: "Invite friends", exact: true })
    .dblclick();
  expect(
    await page.evaluate(
      () => (window as unknown as { inviteCalls: number }).inviteCalls,
    ),
  ).toBe(1);
  await expect(
    page.getByRole("button", { name: "Opening sharing…", exact: true }),
  ).toBeDisabled();
});

test("clipboard fallback returns keyboard focus to the invitation control", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Blocked")) },
    });
    document.execCommand = () => true;
  });
  await enter(page);
  const button = page.getByRole("button", {
    name: "Invite friends",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Link copied ✓", exact: true }),
  ).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(0);
});
