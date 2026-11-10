import { capture } from "./visualProbe";
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
const code = () =>
  `play-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
async function enter(page: Page, room: string, name = "Host") {
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
test("every ink color is reachable on a narrow phone and clear requires confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await enter(page, code());
  await page.getByLabel("Ink color: Black", { exact: true }).click();
  for (const button of await page.locator(".ink-choice").all())
    await expect(button).toBeInViewport();
  await capture(page, "palette-tiny");
  await page.getByRole("button", { name: "Color Blue", exact: true }).click();
  await expect(
    page.getByLabel("Ink color: Blue", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ink-control")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("cannot be undone");
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await capture(page, "clear-confirmation-tiny", false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("a correct guess acknowledges completion and preserves reactions", async ({
  page,
  browser,
}) => {
  const room = code();
  await enter(page, room);
  const guest = await browser.newPage();
  const third = await browser.newPage();
  try {
    await enter(guest, room, "Reader");
    await enter(third, room, "Still thinking");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.locator(".word-choice").first().click();
    const title = page.getByRole("heading", { name: /^Your word is / });
    await expect(title).not.toHaveText("Your word is …");
    const word = (await title.innerText()).replace("Your word is ", "");
    await guest
      .getByRole("textbox", { name: "Your guess", exact: true })
      .fill(word);
    await guest.getByRole("button", { name: "Send", exact: true }).click();
    await expect(guest.locator(".guess-complete")).toContainText(
      "Correct. Nicely observed.",
    );
    await expect(
      guest.getByRole("textbox", { name: "Your guess", exact: true }),
    ).toHaveCount(0);
    await expect(guest.locator(".reaction-bar button").first()).toBeEnabled();
    await expect(guest.locator(".score-readout")).toHaveAttribute(
      "aria-label",
      /Your score: [1-9]\d* points/,
    );
  } finally {
    await guest.close();
    await third.close();
  }
});
test("going offline preserves the draft and disables sending until reconnection", async ({
  page,
}) => {
  await enter(page, code());
  const input = page.getByRole("textbox", {
    name: "Chat message",
    exact: true,
  });
  await input.fill("An unfinished thought.");
  await page.context().setOffline(true);
  await expect(page.getByRole("alert")).toContainText("offline");
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await expect(input).toHaveValue("An unfinished thought.");
  await page.context().setOffline(false);
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  await expect(input).toHaveValue("An unfinished thought.");
});

test("Classic keeps chat and guess drafts separate across turns and refresh", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const guest = await browser.newPage();
  const next = await browser.newPage();
  try {
    const room = code();
    await enter(page, room);
    await enter(next, room, "Next drawer");
    await enter(guest, room, "Reader");
    await page.getByText("Game settings", { exact: true }).click();
    await page.getByRole("combobox", { name: "Turn time" }).selectOption("30");
    await expect(page.locator(".settings-summary")).toContainText("30s turns");
    await page.keyboard.press("Escape");
    const chat = guest.getByRole("textbox", { name: "Chat message" });
    const guess = guest.getByRole("textbox", { name: "Your guess" });
    const lobbyDraft = "Save me a spot for the next game";
    await chat.fill(lobbyDraft);
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.locator(".word-choice").first().click();
    await expect(guess).toHaveValue("");
    await guess.fill("My unfinished guess");
    await guest.reload();
    await guest
      .getByRole("button", { name: "Join the room", exact: true })
      .click();
    await expect(guess).toHaveValue("My unfinished guess");
    const nextChoice = next.locator(".word-choice").first();
    await expect(nextChoice).toBeVisible({ timeout: 45_000 });
    await expect(chat).toHaveValue(lobbyDraft);
    await chat.press("Enter");
    await expect(chat).toHaveValue("");
    await expect(next.getByRole("log")).toContainText(lobbyDraft);
    await nextChoice.click();
    await expect(guess).toHaveValue("");
    await guest.reload();
    await guest
      .getByRole("button", { name: "Join the room", exact: true })
      .click();
    await expect(guess).toHaveValue("");
  } finally {
    await guest.close();
    await next.close();
  }
});
