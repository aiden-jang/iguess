import { test, expect, type Page } from "@playwright/test";

const roomFor = () =>
  `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function join(page: Page, room: string) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Returning player");
  await page.getByRole("textbox", { name: /^Room code/ }).fill(room);
  await page.getByRole("button", { name: /AI Guesser/i }).click();
  await page.getByRole("button", { name: /Enter room|Join the room/i }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

test("a dropped socket preserves the draft and restores usable controls", async ({
  page,
}) => {
  let dropConnection: (() => void) | undefined;
  let interrupted = false;
  await page.routeWebSocket("**/rooms/**/ws?**", (socket) => {
    if (interrupted) {
      socket.close();
      return;
    }
    const server = socket.connectToServer();
    dropConnection = () => {
      server.close();
      socket.close();
    };
  });
  await join(page, roomFor());
  const input = page.getByRole("textbox", { name: "Chat message" });
  await input.fill("Still here. Allegedly.");
  interrupted = true;
  dropConnection!();
  await expect(page.getByRole("alert")).toContainText("reconnecting");
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Start game", exact: true }),
  ).toBeDisabled();
  await expect(input).toHaveValue("Still here. Allegedly.");
  interrupted = false;
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("log")).toContainText("Still here. Allegedly.");
});

test("refreshing and rejoining retains the drawer identity and current word", async ({
  page,
}) => {
  await join(page, roomFor());
  const pid = await page.evaluate(() => sessionStorage.getItem("iguess_pid"));
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.locator(".word-tiles button").first().click();
  await expect(page.locator(".play-banner")).toHaveAttribute(
    "data-phase",
    "playing",
  );
  const word = await page
    .locator(".word-zone [role=img]")
    .getAttribute("aria-label");
  await page.reload();
  await page.getByRole("button", { name: /Enter room|Join the room/i }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("iguess_pid"))).toBe(
    pid,
  );
  await expect(page.locator(".word-zone [role=img]")).toHaveAttribute(
    "aria-label",
    word!,
  );
  await expect(page.getByTitle("undo the last stroke")).toBeEnabled();
});

test("mobile rotation keeps the canvas and chat reachable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await join(page, roomFor());
  for (const size of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.locator("canvas")).toBeVisible();
    const chat = page.getByRole("textbox", { name: "Chat message" });
    await chat.scrollIntoViewIfNeeded();
    await chat.fill("Rotation check");
    await expect(chat).toHaveValue("Rotation check");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("a first visit supports keyboard joining and saving a drawing", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Keyboard player");
  await page.getByRole("textbox", { name: /^Room code/ }).fill(roomFor());
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .press("Enter");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTitle("save the masterpiece").click();
  const drawing = await download;
  expect(drawing.suggestedFilename()).toMatch(/\.png$/);
  expect(await drawing.failure()).toBeNull();
});

test("a rejected clipboard operation reports a useful recovery", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Clipboard blocked");
        },
      },
      configurable: true,
    });
    document.execCommand = () => false;
  });
  await join(page, roomFor());
  await page
    .getByRole("button", { name: "Invite friends", exact: true })
    .click();
  await expect(
    page.getByText(
      "Couldn’t copy the invite. Share the URL in your address bar.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Invite friends", exact: true }),
  ).toBeEnabled();
});

test("light and dark mobile join screens stay within the viewport with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Good guesses/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Play/ }).click();
    await expect(
      page.getByRole("textbox", { name: "Your name", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
