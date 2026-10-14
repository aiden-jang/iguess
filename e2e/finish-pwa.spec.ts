import { test, expect } from "./fixtures";

test("the installed shell never replays cached AI availability", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    // The development client unregisters workers; register the shipped script explicitly.
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister();
    await navigator.serviceWorker.register("/sw.js");
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
    const cache = await caches.open("iguess-v7");
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
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister();
    for (const key of await caches.keys())
      if (key.startsWith("iguess-")) await caches.delete(key);
  });
});
