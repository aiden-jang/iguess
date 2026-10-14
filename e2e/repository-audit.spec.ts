import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import type { ServerMessage } from "../shared/events";
const code = () =>
  `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
async function enter(page: Page, room: string, mode = "classic") {
  await page.goto(`/r/${room}?mode=${mode}`);
  await page.getByLabel("Your name", { exact: true }).fill("Guest artist");
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}
test("public IDs cannot steal the live drawer role or word", async ({
  page,
  request,
}) => {
  let welcome: Extract<ServerMessage, { type: "welcome" }> | undefined;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload)) as ServerMessage;
      if (message.type === "welcome") welcome = message;
    }),
  );
  const room = code();
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.pathname.startsWith("/rooms/"))
      expect(url.searchParams.has("token")).toBe(false);
  });
  await enter(page, room, "ai");
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.locator(".word-choice").first().click();
  const victimId = welcome!.you.id;
  const attempt = await page.evaluate(
    ({ room, victim }) =>
      new Promise<{ id: string; watching: boolean; host: boolean }>(
        (resolve, reject) => {
          const query = new URLSearchParams({
            name: "Uninvited pen",
            pid: victim,
          });
          const socket = new WebSocket(
            `ws://${location.host}/rooms/${room}/ws?${query}`,
          );
          socket.onerror = () => reject(new Error("Test socket failed"));
          socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "welcome") {
              socket.close();
              resolve({
                id: message.you.id,
                watching: message.you.spectator,
                host: message.you.isHost,
              });
            }
          };
        },
      ),
    { room, victim: victimId },
  );
  expect(attempt.id).not.toBe(victimId);
  expect(attempt.watching).toBe(true);
  expect(attempt.host).toBe(false);
  await expect(page.getByTitle("undo the last stroke")).toBeEnabled();
  const denied = await request.get(`/rooms/${room}/ws`, {
    headers: { Upgrade: "websocket", Origin: "https://outside.test" },
  });
  expect(denied.status()).toBe(403);
});
test("buffered drawing flushes its final point before pointer-up", async ({
  page,
}) => {
  const moves: { x: number; y: number }[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === "draw" && message.op.kind === "move")
        moves.push(...message.op.points);
    }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(WebSocket.prototype, "bufferedAmount", {
      configurable: true,
      get: () => 40_000,
    }),
  );
  await enter(page, code());
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(() => moves.length).toBeGreaterThan(0);
  expect(moves.at(-1)!.x).toBeCloseTo(0.9, 2);
});
test("reactions keep their canvas position and expire after appearing", async ({
  page,
}) => {
  await enter(page, code());
  await page
    .getByRole("button", { name: "React with fire", exact: true })
    .click();
  await expect(page.locator(".reaction-float")).toContainText("🔥");
  await expect(page.locator(".reaction-float")).toHaveCount(0);
});
test("a released wake lock is reacquired when the live game becomes visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { calls: 0, lock: new EventTarget() };
    Object.assign(window, { wakeProbe: state });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          state.calls++;
          state.lock = Object.assign(new EventTarget(), {
            release: async () => state.lock.dispatchEvent(new Event("release")),
          });
          return state.lock;
        },
      },
    });
  });
  await enter(page, code(), "ai");
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.locator(".word-choice").first().click();
  const calls = () =>
    page.evaluate(
      () =>
        (window as unknown as { wakeProbe: { calls: number } }).wakeProbe.calls,
    );
  await expect.poll(calls).toBe(1);
  await page.evaluate(() => {
    (
      window as unknown as { wakeProbe: { lock: EventTarget } }
    ).wakeProbe.lock.dispatchEvent(new Event("release"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(calls).toBe(2);
});
test("updated privacy and room states remain coherent on desktop and mobile", async ({
  page,
}, testInfo) => {
  await mkdir("docs/ui-review/repository", { recursive: true });
  for (const [width, name] of [
    [1440, "desktop"],
    [390, "mobile"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/?info=privacy");
    await expect(page.getByRole("dialog")).toContainText(
      "Temporary recovery checkpoints",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (process.env.CAPTURE_AUDIT === "1")
      await page.screenshot({
        path: `docs/ui-review/repository/privacy-${name}-${testInfo.project.name}.jpg`,
        animations: "disabled",
      });
    const contact = page
      .getByRole("dialog")
      .getByRole("link", { name: "me@aidenjang.com", exact: true });
    await contact.scrollIntoViewIfNeeded();
    await expect(contact).toBeInViewport();
    await page.keyboard.press("Escape");
    await enter(page, code());
    await expect(page.locator("canvas")).toBeVisible();
    if (process.env.CAPTURE_AUDIT === "1")
      await page.screenshot({
        path: `docs/ui-review/repository/room-${name}-${testInfo.project.name}.jpg`,
        fullPage: true,
        animations: "disabled",
      });
  }
});
