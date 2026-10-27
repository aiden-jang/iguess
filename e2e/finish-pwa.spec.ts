import { test, expect } from "./fixtures";

test.use({ serviceWorkers: "allow" });

test("the installed public shell rejects stale AI availability and opens offline after an invitation", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const result = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((key) =>
      key.startsWith("iguess-"),
    );
    if (names.length !== 1) throw new Error("Expected one active shell cache");
    const cache = await caches.open(names[0]!);
    await cache.put(
      "/play-status",
      new Response(JSON.stringify({ vision: "ready" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const response = await fetch("/play-status", { cache: "no-store" });
    return response.json();
  });
  expect(result).toEqual({ vision: "unavailable" });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const publicShell = await page.evaluate(async () =>
    (await caches.match("/"))!.text(),
  );
  await page.goto(`/r/offline-${Date.now().toString(36)}?mode=classic`);
  await expect(
    page.getByRole("button", { name: "Join the room", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => (await caches.match("/"))!.text()),
  ).toBe(publicShell);
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Draw badly/ })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your name", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister();
    for (const key of await caches.keys())
      if (key.startsWith("iguess-")) await caches.delete(key);
  });
});
