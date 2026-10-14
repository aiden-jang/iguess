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
  const dimensions = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(".pane-canvas")!;
    return {
      pageWidth: document.documentElement.scrollWidth - innerWidth,
      pageHeight: document.documentElement.scrollHeight - innerHeight,
      boardOverflow: pane.scrollHeight - pane.clientHeight,
    };
  });
  expect(dimensions, phase).toEqual({
    pageWidth: 0,
    pageHeight: 0,
    boardOverflow: 0,
  });
  if (!keyboard)
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeInViewport({ ratio: 1 });
  // WebKit rounds fractional canvas edges; the bounds below limit that allowance to one pixel.
  await expect(page.locator("canvas")).toBeInViewport({ ratio: 0.99 });
  const canvas = (await page.locator("canvas").boundingBox())!;
  const pane = (await page.locator(".pane-canvas").boundingBox())!;
  expect(canvas.y, phase).toBeGreaterThanOrEqual(pane.y - 1);
  expect(canvas.y + canvas.height, phase).toBeLessThanOrEqual(
    pane.y + pane.height + 1,
  );
  if (phase !== "choosing") {
    expect(canvas.height, phase).toBeGreaterThanOrEqual(keyboard ? 40 : 80);
  }
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
        await mkdir("docs/ui-review/room-fit", { recursive: true });
        for (const [role, target] of [
          ["drawer", page],
          ["guesser", guest],
        ] as const)
          await target.screenshot({
            path: `docs/ui-review/room-fit/${view.name}-${role}-${info.project.name}.jpg`,
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
            path: `docs/ui-review/room-fit/keyboard-guesser-${info.project.name}.jpg`,
            animations: "disabled",
          });
      }
    } finally {
      await guest.close();
    }
  });
}
