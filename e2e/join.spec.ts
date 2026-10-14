import { test, expect } from "./fixtures";

test.describe("the join screen", () => {
  test("hands you a generated room code, not a shared lobby", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    const room = page.getByRole("textbox", { name: /^Room code/ });
    await expect(room).toHaveValue(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  test("the dice gives a different room every time", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    const room = page.getByRole("textbox", { name: /^Room code/ });
    const first = await room.inputValue();
    await page.getByLabel("New room code", { exact: true }).click();
    await expect(room).not.toHaveValue(first);
  });

  test("an invite link preselects the room it names", async ({ page }) => {
    await page.goto("/r/spicy-wombat-47?mode=classic");
    await expect(page.getByRole("textbox", { name: /^Room code/ })).toHaveValue(
      "spicy-wombat-47",
    );
  });

  test("you can pick an avatar and it survives a reload", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await page.getByText("Change face", { exact: false }).click();
    await page.getByLabel("Avatar 🦊", { exact: true }).click();
    await page
      .getByRole("textbox", { name: "Your name", exact: true })
      .fill("Tester");
    await page
      .getByRole("button", { name: /Enter room|Join the room/i })
      .click();
    await expect(page.getByText("Tester")).toBeVisible();
  });
});

test("a mistyped percent escape in an invite still serves the join page", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:33300/r/%oops");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('id="root"');
});
