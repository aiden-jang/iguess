import { mkdir } from "node:fs/promises";
import { REACTION_OPTIONS } from "../shared/reactions";
import { test, expect } from "./fixtures";

for (const view of [
  { name: "desktop", width: 1440, height: 760, theme: "dark" },
  { name: "phone", width: 320, height: 568, theme: "light" },
] as const) {
  test(`the reaction picker sends every choice on ${view.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(view);
    await page.emulateMedia({ colorScheme: view.theme });
    await page.goto(`/r/reactions-${Date.now().toString(36)}?mode=classic`);
    await page.getByLabel("Your name", { exact: true }).fill("Art critic");
    await page
      .getByRole("button", { name: "Join the room", exact: true })
      .click();
    await expect(page.locator(".room-connection")).toHaveAttribute(
      "data-connected",
      "true",
    );
    await expect(page.locator(".reaction-bar button")).toHaveCount(8);
    await expect(
      page.locator(".reaction-bar svg.reaction-sticker"),
    ).toHaveCount(8);
    for (const { emoji, name, caption } of REACTION_OPTIONS) {
      const button = page.getByRole("button", {
        name: `React with ${name}`,
        exact: true,
      });
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(button).toHaveAttribute("title", `${emoji} ${caption}`);
      await button.click();
      await expect(
        page.locator(`.reaction-float [data-reaction="${emoji}"]`),
      ).toBeVisible();
    }
    await expect(page.locator(".reaction-float")).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Chat message", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - innerWidth,
      height: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(dimensions).toEqual({ width: 0, height: 0 });
    await page.screenshot({
      path: info.outputPath(`refinement-reactions-${view.name}.png`),
      animations: "disabled",
    });
    if (process.env.CAPTURE_REACTIONS === "1") {
      await mkdir("test-results/visual-review/reactions", { recursive: true });
      await page.screenshot({
        path: `test-results/visual-review/reactions/${view.name}-${info.project.name}.jpg`,
        animations: "disabled",
      });
    }
  });
}
