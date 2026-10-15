import { test, expect } from "./fixtures";

test("an update leaves the entry draft intact and stays out of a live room", async ({
  page,
}) => {
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Your name", exact: true });
  await name.fill("Still here");
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<script type="module" src="/assets/next-release.js"></script>',
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const update = page.getByRole("status", { name: "App update" });
  await expect(update).toBeVisible();
  if (process.env.CAPTURE_DETAILS && test.info().project.name === "chromium") {
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: test.info().outputPath(`update-${name}.png`),
        fullPage: false,
        animations: "disabled",
      });
    }
  }
  await expect(name).toHaveValue("Still here");
  await update.getByRole("button", { name: "Later", exact: true }).click();
  await expect(update).toBeHidden();
  await page.unroute("**/");
  await page.goto(`/r/details-${Date.now()}?mode=classic`);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Still here");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status", { name: "App update" })).toHaveCount(0);
});
