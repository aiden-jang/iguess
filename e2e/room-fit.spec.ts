import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { ServerMessage } from "../shared/events";
import { test, expect } from "./fixtures";

const views = [
  { name: "desktop", width: 1440, height: 760, theme: "light" },
  { name: "laptop", width: 1024, height: 600, theme: "dark" },
  { name: "phone", width: 390, height: 667, theme: "dark" },
  { name: "small-phone", width: 320, height: 568, theme: "light" },
  { name: "landscape", width: 768, height: 390, theme: "light" },
] as const;

async function enter(page: Page, room: string, name: string) {
  await page.routeWebSocket("**/rooms/**/ws?**", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      // Stress the presentation with the longest allowed custom phrase; the room stays local.
      const word = "very complicated drawing";
      if (message.type === "your_word") message.word = word;
      if (message.type === "game_state" && message.state.phase === "playing") {
        message.state.wordLength = word.length;
        message.state.hint = "_".repeat(word.length);
      }
      socket.send(JSON.stringify(message));
    });
  });
  await page.goto(`/r/${room}?mode=classic`);
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
}

async function fits(page: Page, phase: string, keyboard = false) {
  // Measure one layout frame so background WebKit tabs do not need repeated observer round trips.
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ keyboard, phase }) => {
            const pane = document.querySelector<HTMLElement>(".pane-canvas");
            const canvas = document.querySelector("canvas");
            const save = [
              ...document.querySelectorAll(".draw-toolbar button"),
            ].find((button) => button.textContent?.trim() === "Save");
            if (!pane || !canvas || (!keyboard && !save))
              return { missing: true };
            const board = pane.getBoundingClientRect();
            const drawing = canvas.getBoundingClientRect();
            const visibleRatio = (rect: DOMRect) => {
              const width = Math.max(
                0,
                Math.min(innerWidth, rect.right) - Math.max(0, rect.left),
              );
              const height = Math.max(
                0,
                Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top),
              );
              return rect.width > 0 && rect.height > 0
                ? (width * height) / (rect.width * rect.height)
                : 0;
            };
            return {
              pageWidth: document.documentElement.scrollWidth - innerWidth,
              pageHeight: document.documentElement.scrollHeight - innerHeight,
              boardOverflow: pane.scrollHeight - pane.clientHeight,
              saveVisible:
                keyboard || visibleRatio(save!.getBoundingClientRect()) === 1,
              canvasVisible: visibleRatio(drawing) >= 0.99,
              // WebKit rounds fractional canvas edges; keep the existing one-pixel allowance.
              canvasInsideBoard:
                drawing.top >= board.top - 1 &&
                drawing.bottom <= board.bottom + 1,
              canvasTallEnough:
                drawing.height >= (keyboard || phase === "choosing" ? 40 : 80),
            };
          },
          { keyboard, phase },
        ),
      { message: phase },
    )
    .toEqual({
      pageWidth: 0,
      pageHeight: 0,
      boardOverflow: 0,
      saveVisible: true,
      canvasVisible: true,
      canvasInsideBoard: true,
      canvasTallEnough: true,
    });
}

for (const view of views) {
  test(`the room fits one screen on ${view.name}`, async ({
    page,
    browser,
  }, info) => {
    await page.setViewportSize(view);
    await page.emulateMedia({ colorScheme: view.theme });
    const room = `fit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await enter(page, room, "Drawer");
    const guest = await browser.newPage({ viewport: view });
    try {
      await guest.emulateMedia({ colorScheme: view.theme });
      await enter(guest, room, "Guesser");
      await fits(page, "lobby");
      await page
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await expect(page.locator(".word-choice")).toHaveCount(3);
      await fits(page, "choosing");
      if (process.env.CAPTURE_ROOM_FIT === "1" && view.name === "small-phone") {
        await mkdir("test-results/visual-review/room-fit", { recursive: true });
        await page.screenshot({
          path: `test-results/visual-review/room-fit/small-phone-choosing-${info.project.name}.jpg`,
          animations: "disabled",
        });
      }
      for (const choice of await page.locator(".word-choice").all())
        await expect(choice).toBeInViewport({ ratio: 1 });
      await page.locator(".word-choice").first().click();
      await expect(page.locator(".app-layout")).toHaveAttribute(
        "data-phase",
        "playing",
      );
      await fits(page, "drawing");
      await fits(guest, "guessing");
      await expect(
        guest.getByRole("textbox", { name: "Your guess", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      if (process.env.CAPTURE_ROOM_FIT === "1") {
        await mkdir("test-results/visual-review/room-fit", { recursive: true });
        for (const [role, target] of [
          ["drawer", page],
          ["guesser", guest],
        ] as const)
          await target.screenshot({
            path: `test-results/visual-review/room-fit/${view.name}-${role}-${info.project.name}.jpg`,
            animations: "disabled",
          });
      }
      if (view.name === "phone") {
        const input = guest.getByRole("textbox", {
          name: "Your guess",
          exact: true,
        });
        await input.focus();
        await guest.evaluate(() => {
          Object.defineProperty(visualViewport!, "height", {
            configurable: true,
            get: () => 400,
          });
          visualViewport!.dispatchEvent(new Event("resize"));
        });
        await expect(guest.locator("html")).toHaveAttribute(
          "data-keyboard",
          "true",
        );
        await fits(guest, "keyboard", true);
        const inputBox = (await input.boundingBox())!;
        expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(401);
        if (process.env.CAPTURE_ROOM_FIT === "1")
          await guest.screenshot({
            path: `test-results/visual-review/room-fit/keyboard-guesser-${info.project.name}.jpg`,
            animations: "disabled",
          });
      }
    } finally {
      await guest.close();
    }
  });
}
