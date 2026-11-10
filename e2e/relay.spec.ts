import type { Page, WebSocketRoute } from "@playwright/test";
import type { ServerMessage } from "../shared/events";
import { test, expect } from "./fixtures";
import { capture } from "./visualProbe";
import { keyboard, verifyGuessKeyboard } from "./relayKeyboard";

async function join(page: Page, room: string, name: string, mode = "relay") {
  await page.goto(`/r/${room}?mode=${mode}`);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Join the room", exact: true })
    .click();
  await expect(page.locator(".room-connection")).toHaveAttribute(
    "data-connected",
    "true",
  );
}

async function sketch(page: Page) {
  const canvas = page.getByRole("img", { name: /Drawing canvas/ });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
    steps: 4,
  });
  await page.mouse.up();
}

test("Drawing Relay is selectable from the join screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: /Drawing Relay/ }).click();
  await expect(
    page.getByText("For 3–8 friends. Everyone plays at once."),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "AI availability" }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Host");
  await page.getByRole("button", { name: "Enter room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Draw it. Pass it on." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start relay", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "← Leave", exact: true }).click();
  await page.getByRole("button", { name: "Leave room", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Draw badly/ })).toBeVisible();
});

async function watchWire(page: Page) {
  let remote: WebSocketRoute | undefined;
  const received: ServerMessage[] = [];
  await page.routeWebSocket("**/rooms/**/ws?**", (socket) => {
    const server = socket.connectToServer();
    remote = server;
    server.onMessage((data) => {
      if (typeof data === "string")
        received.push(JSON.parse(data) as ServerMessage);
      socket.send(data);
    });
  });
  return {
    received,
    send: (message: object) => remote!.send(JSON.stringify(message)),
    active: async (leg: number) => {
      const view = () => {
        const message = received
          .filter((value) => value.type === "relay_state")
          .at(-1);
        return message?.state.phase === "active" && message.state.leg === leg
          ? message.state
          : null;
      };
      await expect.poll(() => view()?.leg).toBe(leg);
      return view()!;
    },
  };
}

test("six friends pass private assignments and reveal all six chains", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const wire = await watchWire(page);
  const room = `relay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await page.setViewportSize({ width: 1024, height: 760 });
  await join(page, room, "Sam");
  await expect(
    page.getByRole("heading", { name: "Draw it. Pass it on." }),
  ).toBeVisible();
  const start = page.getByRole("button", { name: "Start relay", exact: true });
  await expect(start).toBeDisabled();
  const guests: Page[] = [];
  try {
    const peers = [];
    const names = ["Jo", "Mina", "Jules", "Alex", "Rae"];
    for (const [index, name] of names.entries()) {
      const guest = await browser.newPage({
        viewport: { width: index === 0 ? 320 : 390, height: 740 },
        colorScheme: index % 2 ? "light" : "dark",
        extraHTTPHeaders: { "CF-Connecting-IP": `192.0.245.${index + 1}` },
      });
      guests.push(guest);
      peers.push(await watchWire(guest));
      await join(guest, room, name, index === 0 ? "classic" : "relay");
    }
    const phone = guests[0]!;
    const late = await browser.newPage({
      extraHTTPHeaders: { "CF-Connecting-IP": "192.0.245.20" },
    });
    guests.push(late);
    await capture(page, "relay-lobby");
    await start.click();
    const first = await wire.active(-1);
    wire.send({
      type: "relay",
      id: first.id,
      leg: 6,
      action: "chain",
      index: 0,
    });
    const customWord = "Moon raccoon 🦝";
    const customInput = phone.getByRole("textbox", { name: "Write your own" });
    const useWord = phone.getByRole("button", { name: "Use word" });
    await expect(phone.locator(".relay-choices button")).toHaveCount(3);
    await expect(useWord).toBeDisabled();
    await customInput.fill(`  ${customWord}  `);
    await keyboard(phone, 400);
    const buttonBox = (await useWord.boundingBox())!;
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(401);
    await capture(phone, "relay-custom-word-phone");
    await customInput.press("Enter");
    await expect(
      phone.getByRole("heading", { name: "Word picked." }),
    ).toBeVisible();
    await keyboard(phone, null);
    await Promise.all(
      [page, ...guests.slice(1, 5)].map((player) =>
        player.locator(".relay-choices button").first().click(),
      ),
    );
    await expect(
      phone.getByRole("heading", { name: `Draw “${customWord}”` }),
    ).toBeVisible();
    expect(JSON.stringify(wire.received)).not.toContain(customWord);

    for (let leg = 0; leg < 6; leg++) {
      const drawing = leg % 2 === 0;
      const passive = peers.slice(1);
      const otherViews = await Promise.all(
        passive.map((peer) => peer.active(leg)),
      );
      for (const [index, state] of otherViews.entries()) {
        expect(state.assignment.kind).toBe(drawing ? "draw" : "guess");
        const peer = passive[index]!;
        if (drawing) {
          const strokeId = `peer-${index}`;
          for (const op of [
            {
              kind: "start",
              strokeId,
              point: { x: 0.3, y: 0.3 },
              color: "#202522",
              width: 4,
            },
            {
              kind: "move",
              strokeId,
              points: [
                { x: 0.5, y: 0.6 },
                { x: 0.65, y: 0.35 },
              ],
            },
            { kind: "end", strokeId },
          ])
            peer.send({ type: "relay", id: state.id, leg, action: "ink", op });
        }
        peer.send({
          type: "relay",
          id: state.id,
          leg,
          action: "pass",
          ...(drawing
            ? {}
            : { guess: `Pass ${leg + 1} from player ${index + 3}` }),
        });
      }

      for (const [index, player] of [page, phone].entries()) {
        await expect(
          player.getByText(`Leg ${leg + 1} of 6`, { exact: true }),
        ).toBeVisible();
        await player.bringToFront();
        if (drawing) {
          await expect(
            player.getByRole("heading", { name: /^Draw “/ }),
          ).toBeVisible();
          await sketch(player);
          if (leg === 0 && index === 0) {
            await page.reload();
            await page
              .getByRole("button", { name: "Join the room", exact: true })
              .click();
            await expect(
              page.getByRole("heading", { name: /^Draw “/ }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", { name: "Pass drawing" }),
            ).toBeEnabled();
            await capture(page, "relay-draw");
          }
          await player.getByRole("button", { name: "Pass drawing" }).click();
          if (leg === 0 && index === 0) {
            await expect(
              page.getByRole("heading", { name: "Drawing passed." }),
            ).toBeVisible();
            await join(late, room, "Viewer");
            await expect(
              late.getByRole("heading", { name: "You’re watching." }),
            ).toBeVisible();
            await expect(late.locator("canvas")).toHaveCount(0);
            await expect(late.getByLabel("Your guess")).toHaveCount(0);
          }
        } else {
          const guess = player.getByRole("textbox", { name: "Your guess" });
          await expect(guess).toBeVisible();
          if (leg === 1 && index === 0)
            expect(
              wire.received.some((message) => message.type === "relay_chain"),
            ).toBe(false);
          await guess.fill(`Pass ${leg + 1} from player ${index + 1}`);
          if (leg === 1 && index === 1) {
            await capture(player, "relay-phone-guess");
            await verifyGuessKeyboard(player, guess);
          }
          await guess.press("Enter");
        }
      }
    }
    await expect(
      page.getByRole("heading", { name: "Here’s where it went." }),
    ).toBeVisible();
    await expect(
      late.getByRole("heading", { name: "Here’s where it went." }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Chain", { exact: true }).locator("option"),
    ).toHaveCount(6);
    await expect(
      page.getByText("Pass 6 from player 6", { exact: true }).last(),
    ).toBeVisible();
    await capture(page, "relay-reveal");
    await page
      .getByRole("button", { name: /^Replay drawing by / })
      .first()
      .click();
    await expect(
      page.getByRole("img", { name: "Animated replay of the drawing" }),
    ).toBeVisible();
    await page.getByLabel("Chain", { exact: true }).selectOption("1");
    await expect(page.getByText(customWord, { exact: true })).toBeVisible();
    await expect(
      page.getByText("Pass 6 from player 1", { exact: true }).last(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Pick your starting word." }),
    ).toBeVisible();
    await expect(page.getByLabel("Chain", { exact: true })).toHaveCount(0);
    await capture(page, "relay-custom-word-desktop");
  } finally {
    await Promise.all(guests.map((guest) => guest.close()));
  }
});
