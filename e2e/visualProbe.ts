import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
export async function capture(page: Page, name: string, fullPage = true) {
  if (process.env.CAPTURE_UI !== "1") return;
  await mkdir("docs/ui-review/finish", { recursive: true });
  await page.screenshot({
    animations: "disabled",
    path: `docs/ui-review/finish/${name}.jpg`,
    fullPage,
  });
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
