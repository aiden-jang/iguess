import { test, expect } from "./fixtures";

test.describe("the join screen", () => {
  test("hands you a generated room code, not a shared lobby", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await page
      .getByText("Room code & more ways to play", { exact: true })
      .click();
    const room = page.getByRole("textbox", { name: /^Room code/ });
    await expect(room).toHaveValue(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  test("the dice gives a different room every time", async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await page
      .getByText("Room code & more ways to play", { exact: true })
      .click();
    const room = page.getByRole("textbox", { name: /^Room code/ });
    const first = await room.inputValue();
    await page.getByLabel("New room code", { exact: true }).click();
    await expect(room).not.toHaveValue(first);
  });

  test("an invite link preselects the room it names", async ({ page }) => {
    await page.goto("/r/spicy-wombat-47?mode=classic");
    await page
      .getByText("Room code & more ways to play", { exact: true })
      .click();
    await expect(page.getByRole("textbox", { name: /^Room code/ })).toHaveValue(
      "spicy-wombat-47",
    );
  });

  test("you can pick an avatar and it survives a reload", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText("Change face", { exact: false }).click();
    await page.getByLabel("Avatar 🦊", { exact: true }).click();
    await page
      .getByRole("textbox", { name: "Your name", exact: true })
      .fill("Tester");
    await page
      .getByRole("button", { name: /Enter room|Join the room/i })
      .click();
    await page.locator(".room-roster summary").click();
    await expect(page.getByText("Tester", { exact: true })).toBeVisible();
    await expect(page.locator(".player-avatar").first()).toContainText("🦊");
    await page.reload();
    await page.getByText("Change face", { exact: false }).click();
    await expect(page.getByLabel("Avatar 🦊", { exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test("a mistyped percent escape in an invite still serves the join page", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:33300/r/%oops");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('id="root"');
});

test("quick entry needs only a name and keeps room options optional", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.locator(".join-options")).not.toHaveAttribute("open", "");
  await page.getByLabel("Your name", { exact: true }).fill("A casual arrival");
  await page.getByLabel("Your name", { exact: true }).press("Enter");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start game", exact: true }),
  ).toBeEnabled();
});

test("an invitation identifies the room and defers mode choice to the host", async ({
  page,
}) => {
  await page.goto("/r/a-friends-room?mode=classic");
  await expect(page.getByRole("form")).toContainText("a-friends-room");
  await expect(
    page.getByRole("group", { name: "Choose your company" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Join the room", exact: true }),
  ).toBeVisible();
});
