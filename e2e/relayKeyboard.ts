import { expect, type Locator, type Page } from "@playwright/test";

export async function keyboard(page: Page, height: number | null) {
  await page.evaluate((height) => {
    if (height !== null)
      Object.defineProperty(visualViewport!, "height", {
        configurable: true,
        get: () => height,
      });
    else Reflect.deleteProperty(visualViewport!, "height");
    visualViewport!.dispatchEvent(new Event("resize"));
  }, height);
  if (height !== null)
    await expect(page.locator("html")).toHaveAttribute("data-keyboard", "true");
}

export async function verifyGuessKeyboard(page: Page, guess: Locator) {
  const original = page.viewportSize()!;
  const workspace = page.locator(".relay-workspace");
  for (const [width, height, available] of [
    [320, 568, 230],
    [568, 320, 168],
  ] as const) {
    await page.setViewportSize({ width, height });
    await guess.focus({ timeout: 1500 });
    await keyboard(page, available);
    await expect
      .poll(
        () =>
          workspace.evaluate(
            (el, height) => {
              const input = el.querySelector("input");
              const pass = el.querySelector("button");
              const drawing = el.querySelector("canvas");
              return {
                focused: input !== null && input === document.activeElement,
                enabled: pass?.disabled === false,
                fits: [input, pass, drawing].every((control) => {
                  const box = control?.getBoundingClientRect();
                  return (
                    box &&
                    box.height > 0 &&
                    box.top >= 0 &&
                    box.bottom <= height + 1
                  );
                }),
              };
            },
            available,
            { timeout: 1000 },
          ),
        {
          timeout: 2000,
          message: `Relay workspace fits in the ${width}×${available} visible area`,
        },
      )
      .toEqual({ focused: true, enabled: true, fits: true });
    await keyboard(page, null);
  }
  await page.setViewportSize(original);
}
