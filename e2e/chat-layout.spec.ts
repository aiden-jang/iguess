import { mkdir } from "node:fs/promises";
import type { ServerMessage } from "../shared/events";
import { test, expect } from "./fixtures";

const views = [
  { name: "desktop-light", width: 1440, height: 1000, theme: "light" },
  { name: "desktop-dark", width: 1440, height: 900, theme: "dark" },
  { name: "phone-dark", width: 390, height: 844, theme: "dark" },
  { name: "small-phone-light", width: 320, height: 740, theme: "light" },
  { name: "landscape-light", width: 768, height: 390, theme: "light" },
  { name: "keyboard-dark", width: 390, height: 844, theme: "dark" },
] as const;

for (const view of views) {
  test(`long chat keeps its composer visible on ${view.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(view);
    await page.emulateMedia({ colorScheme: view.theme });
    let deliver: ((count: number) => void) | undefined;
    let sequence = 0;
    await page.routeWebSocket("**/rooms/**/ws?**", (socket) => {
      const server = socket.connectToServer();
      server.onMessage((data) => {
        socket.send(data);
        const message = JSON.parse(String(data)) as ServerMessage;
        if (message.type === "welcome")
          deliver = (count) => {
            for (let i = 0; i < count; i++)
              socket.send(
                JSON.stringify({
                  type: "chat",
                  from: { ...message.you, name: "Roommate" },
                  text: `Opinion ${++sequence}. A very considered interpretation of whatever that drawing is supposed to be.`,
                }),
              );
          };
      });
    });
    await page.goto(`/r/chat-${Date.now().toString(36)}?mode=ai-drawer`);
    await page.getByLabel("Your name", { exact: true }).fill("Reader");
    await page
      .getByRole("button", { name: "Join the room", exact: true })
      .click();
    await expect(page.locator(".room-connection")).toHaveAttribute(
      "data-connected",
      "true",
    );
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    const input = page.getByRole("textbox", {
      name: "Your guess",
      exact: true,
    });
    await expect(input).toBeVisible();
    if (view.name === "keyboard-dark") {
      await input.focus();
      await page.evaluate(() => {
        Object.defineProperty(visualViewport!, "height", {
          configurable: true,
          get: () => 400,
        });
        visualViewport!.dispatchEvent(new Event("resize"));
      });
      await expect(page.locator("html")).toHaveAttribute(
        "data-keyboard",
        "true",
      );
    }
    const before = (await input.boundingBox())!;
    deliver!(80);
    const log = page.getByRole("log");
    await expect(log.locator(".chat-line")).toHaveCount(80);
    await expect(input).toBeInViewport();
    const after = (await input.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(after.y + after.height).toBeLessThanOrEqual(
      view.name === "keyboard-dark" ? 401 : view.height,
    );
    expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );
    await expect
      .poll(() =>
        log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
      )
      .toBeLessThan(2);
    await log.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    deliver!(1);
    await expect(
      page.getByRole("button", { name: "↓ new messages", exact: true }),
    ).toBeVisible();
    await expect(input).toBeInViewport();
    await page
      .getByRole("button", { name: "↓ new messages", exact: true })
      .click();
    if (view.name === "keyboard-dark") await expect(input).toBeFocused();
    await expect
      .poll(() =>
        log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
      )
      .toBeLessThan(2);
    await input.fill("Still here.");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(log.getByText("Still here.", { exact: true })).toBeVisible();
    if (process.env.CAPTURE_CHAT === "1") {
      await mkdir("test-results/visual-review/chat", { recursive: true });
      await page.screenshot({
        path: `test-results/visual-review/chat/${view.name}-${info.project.name}.jpg`,
        animations: "disabled",
      });
    }
  });
}
