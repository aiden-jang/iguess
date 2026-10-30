import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
export async function capture(page: Page, name: string, fullPage = true) {
  const output = process.env.CAPTURE_UI_OUTPUT;
  if (process.env.CAPTURE_UI !== "1" && !output) return;
  const folder = output ?? "test-results/visual-review/finish";
  await mkdir(folder, { recursive: true });
  await page.screenshot({
    animations: "disabled",
    path: `${folder}/${name}${output ? `-${test.info().project.name}` : ""}.jpg`,
    fullPage,
  });
}
export async function captureResults(page: Page) {
  if (!process.env.CAPTURE_UI_OUTPUT) return;
  await capture(page, "results-desktop");
  await page.emulateMedia({ colorScheme: "dark" });
  await capture(page, "results-desktop-dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "results-mobile-dark");
  await page.emulateMedia({ colorScheme: "light" });
  await capture(page, "results-mobile");
}
export async function galleryProbe(page: Page) {
  // Clones are an isolated layout probe, never sent to the room or stored as fixtures.
  await page.evaluate(() => {
    const grid = document.querySelector(".gallery-strip")!;
    const card = grid.querySelector(".drawing-card")!;
    grid.setAttribute("data-count", "9");
    for (let i = 0; i < 8; i++) grid.appendChild(card.cloneNode(true));
    grid.querySelectorAll(".exhibit-word").forEach((el) => {
      el.textContent = "extraordinary illustration";
    });
    grid.querySelectorAll(".exhibit-artist").forEach((el) => {
      el.textContent = "By A very considered opinion";
    });
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(page, `gallery-probe-${width}`);
  }
}
