import { mkdir } from "node:fs/promises";
import { test, expect } from "./fixtures";

for (const source of ["new", "invited"] as const) {
  for (const exit of ["leave", "back"] as const) {
    test(`choosing another mode after ${exit} from a ${source} room opens a fresh room`, async ({
      page,
    }, info) => {
      if (source === "invited")
        await page.setViewportSize({ width: 390, height: 844 });
      const invitation = `switch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await page.goto(
        source === "invited"
          ? `/r/${invitation}?mode=ai-drawer`
          : "/#mode=ai-drawer",
      );
      await page.getByLabel("Your name", { exact: true }).fill("Mode explorer");
      await page
        .getByRole("button", {
          name: source === "invited" ? "Join the room" : "Enter room",
          exact: true,
        })
        .click();
      await expect(page.locator(".room-mode")).toHaveText("AI Drawer");
      const originalRoom = await page.locator(".room-code").innerText();
      await page
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await expect(page.locator(".app-layout")).toHaveAttribute(
        "data-phase",
        "playing",
      );

      if (exit === "leave") {
        await page
          .getByRole("button", { name: "← Leave", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Leave room", exact: true })
          .click();
      } else await page.goBack();

      await page.getByRole("button", { name: /AI Guesser You draw/ }).click();
      await page
        .getByRole("button", { name: "Enter room", exact: true })
        .click();
      await expect(page.locator(".room-mode")).toHaveText("AI Guesser");
      await expect(page.locator(".room-code")).not.toHaveText(originalRoom);
      await expect(page.locator(".app-layout")).toHaveAttribute(
        "data-phase",
        "lobby",
      );
      await page
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await expect(page.locator(".word-choice")).toHaveCount(3);
      const freshRoom = (await page.locator(".room-code").innerText()).slice(1);
      expect(new URL(page.url()).pathname).toBe(`/r/${freshRoom}`);
      expect(new URL(page.url()).searchParams.get("mode")).toBe("ai");
      if (process.env.CAPTURE_MODE_SWITCH === "1" && exit === "back") {
        await mkdir("docs/ui-review/mode-switch", { recursive: true });
        await page.screenshot({
          path: `docs/ui-review/mode-switch/${source}-${info.project.name}.jpg`,
          animations: "disabled",
        });
      }
      await page.locator(".word-choice").first().click();
      await expect(page.locator(".app-layout")).toHaveAttribute(
        "data-phase",
        "playing",
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Join the room", exact: true })
        .click();
      await expect(page.locator(".room-mode")).toHaveText("AI Guesser");
      await expect(page.locator(".room-code")).toHaveText(`#${freshRoom}`);
      await expect(page.locator(".app-layout")).toHaveAttribute(
        "data-phase",
        "playing",
      );
    });
  }
}

test("explicit Rejoin returns to the running room and its mode", async ({
  page,
}) => {
  await page.goto("/#mode=ai-drawer");
  await page.getByLabel("Your name", { exact: true }).fill("Returning critic");
  await page.getByRole("button", { name: "Enter room", exact: true }).click();
  const room = (await page.locator(".room-code").innerText()).slice(1);
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.locator(".app-layout")).toHaveAttribute(
    "data-phase",
    "playing",
  );
  await page.goBack();
  await page.getByRole("button", { name: /AI Guesser You draw/ }).click();
  await page
    .getByRole("button", { name: `Rejoin ${room} ↗`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-code")).toHaveText(`#${room}`);
  await expect(page.locator(".room-mode")).toHaveText("AI Drawer");
  await expect(page.locator(".app-layout")).toHaveAttribute(
    "data-phase",
    "playing",
  );
});
