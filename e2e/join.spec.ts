import { test, expect } from "@playwright/test";

test.describe("the join screen", () => {
  test("hands you a generated room code, not a shared lobby", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    const room = page.getByPlaceholder("your room code");
    await expect(room).toHaveValue(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  test("the dice gives a different room every time", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    const room = page.getByPlaceholder("your room code");
    const first = await room.inputValue();
    await page.getByLabel("new room code").click();
    await expect(room).not.toHaveValue(first);
  });

  test("an invite link preselects the room it names", async ({ page }) => {
    await page.goto("/r/spicy-wombat-47?mode=classic");
    await expect(page.getByPlaceholder("your room code")).toHaveValue("spicy-wombat-47");
  });

  test("you can pick an avatar and it survives a reload", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await page.getByLabel("avatar 🦊").click();
    await page.getByPlaceholder("whatever you want, really").fill("Tester");
    await page.getByRole("button", { name: /pull up/i }).click();
    await expect(page.getByText("Tester")).toBeVisible();
  });
});
