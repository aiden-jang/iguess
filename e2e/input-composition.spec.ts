import { test, expect } from "./fixtures";

test("chat confirms composition before sending and keeps the editing focus", async ({
  page,
}) => {
  await page.goto(`/r/composition-${Date.now().toString(36)}?mode=ai-drawer`);
  await page.getByLabel("Your name", { exact: true }).fill("Reader");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
  const input = page.getByRole("textbox", {
    name: "Chat message",
    exact: true,
  });
  await input.fill("안녕하세요 🌱");
  await input.dispatchEvent("compositionstart");
  await input.press("Enter");
  await expect(input).toHaveValue("안녕하세요 🌱");
  await expect(
    page.getByRole("log").getByText("안녕하세요 🌱", { exact: true }),
  ).toHaveCount(0);
  await input.evaluate((node) => node.closest("form")!.requestSubmit());
  await expect(input).toHaveValue("안녕하세요 🌱");
  await input.dispatchEvent("compositionend");
  expect(
    await input.evaluate((node) =>
      node.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 229,
          bubbles: true,
          cancelable: true,
        }),
      ),
    ),
  ).toBe(false);
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(
    page.getByRole("log").getByText("안녕하세요 🌱", { exact: true }),
  ).toHaveCount(1);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await input.fill("まだ考え中です 🫠");
    await expect(input).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath(`composition-${width}.png`),
      animations: "disabled",
    });
  }
});
