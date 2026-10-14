import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ServerMessage } from "@iguess/shared";
import { testStorage } from "./testing/storage.ts";
import { GameRoom } from "./GameRoom.ts";
import type { Env } from "./env.ts";

// GameRoom only touches two things Node doesn't have: WebSocketPair, and a Response carrying a
// 101 (Node's Response rejects that status outright). Both are stubbed here for the whole file.
// node:test runs each file in its own process, so these globals stay put.

type Listener = (event: { data?: unknown }) => void;

class FakeSocket {
  readyState = 1;
  readonly sent: ServerMessage[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  accept(): void {}

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMessage);
  }

  code = 0;
  close(code = 1000): void {
    this.code = code;
    this.readyState = 3;
    this.fire("close", {});
  }

  fire(type: string, event: { data?: unknown }): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

let lastServerSocket: FakeSocket | null = null;

class FakePair {
  readonly 0: FakeSocket;
  readonly 1: FakeSocket;
  constructor() {
    this[0] = new FakeSocket();
    this[1] = new FakeSocket();
    lastServerSocket = this[1];
  }
}

class FakeResponse {
  constructor(
    readonly body: unknown,
    readonly init?: { status?: number },
  ) {}
  get status(): number {
    return this.init?.status ?? 200;
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g["WebSocketPair"] = FakePair;
g["Response"] = FakeResponse;

// The room reads request.url and one header, so a real Request is not needed — and Node refuses
// to set Upgrade on one anyway, since fetch lists it as a forbidden header.
function upgradeRequest(query: Record<string, string>): Request {
  const url = new URL("https://room.test/rooms/r/ws");
  const token = query.token;
  const headers = new Map([["Upgrade", "websocket"]]);
  if (token)
    headers.set("Sec-WebSocket-Protocol", `iguess, reconnect.${token}`);
  for (const [k, v] of Object.entries(query).filter(([key]) => key !== "token"))
    url.searchParams.set(k, v);
  return {
    url: url.toString(),
    headers,
  } as unknown as Request;
}

const rooms: GameRoom[] = [];
async function dispose(room: GameRoom) {
  const internals = room as unknown as {
    engine: { dispose(): void } | null;
    roster: { dispose(): void };
    persistence: { dispose(): Promise<void> };
  };
  internals.engine?.dispose();
  internals.roster.dispose();
  await internals.persistence.dispose();
}
afterEach(async () => {
  for (const room of rooms.splice(0)) await dispose(room);
});
function newRoom(storage = testStorage()): GameRoom {
  const env = {} as Env;
  const room = new GameRoom(storage.context, env);
  rooms.push(room);
  return room;
}

interface Joined {
  socket: FakeSocket;
  welcomeMode: string | undefined;
  welcome: Extract<ServerMessage, { type: "welcome" }> | undefined;
}

async function join(
  room: GameRoom,
  name: string,
  mode: string,
  pid = name,
  token = "",
): Promise<Joined> {
  await room.fetch(upgradeRequest({ room: "r", name, mode, pid, token }));
  const socket = lastServerSocket!;
  const welcome = socket.sent.find((m) => m.type === "welcome");
  return {
    socket,
    welcome,
    welcomeMode: welcome && "mode" in welcome ? welcome.mode : undefined,
  };
}

const systemLines = (s: FakeSocket): string[] =>
  s.sent
    .filter((m) => m.type === "system")
    .map((m) => ("text" in m ? m.text : ""));

test("the harness seats two players in one room", async () => {
  const room = newRoom();
  const alex = await join(room, "Alex", "classic");
  const bo = await join(room, "Bo", "classic");
  const presence = [...alex.socket.sent, ...bo.socket.sent]
    .filter((m) => m.type === "presence")
    .pop();
  assert.ok(presence && "players" in presence, "no presence was ever sent");
  assert.deepEqual(
    presence.players.map((p) => p.name),
    ["Alex", "Bo"],
  );
});

test("a joiner is told the room mode, not the one they asked for", async () => {
  const room = newRoom();
  const alex = await join(room, "Alex", "classic");
  const bo = await join(room, "Bo", "ai");
  assert.equal(alex.welcomeMode, "classic");
  assert.equal(
    bo.welcomeMode,
    "classic",
    "the second joiner re-picked the room's mode",
  );
});

test("a second joiner never announces a mode switch", async () => {
  const room = newRoom();
  const alex = await join(room, "Alex", "classic");
  await join(room, "Bo", "ai");
  assert.deepEqual(
    systemLines(alex.socket).filter((t) => t.includes("mode switched")),
    [],
  );
});

test("someone alone in the room can still re-pick the mode", async () => {
  const room = newRoom();
  const first = await join(room, "Alex", "classic");
  assert.equal(first.welcomeMode, "classic");
  first.socket.close();
  const again = await join(room, "Alex", "ai", "Alex2");
  assert.equal(
    again.welcomeMode,
    "ai",
    "a lone player should be able to change the mode",
  );
});

test("a public player ID cannot reclaim another player’s connection or host role", async () => {
  const room = newRoom();
  const first = await join(room, "Host", "classic");
  const imposter = await join(
    room,
    "Imposter",
    "classic",
    first.welcome!.you.id,
  );
  assert.notEqual(imposter.welcome!.you.id, first.welcome!.you.id);
  assert.equal(imposter.welcome!.you.isHost, false);
  assert.equal(first.socket.readyState, 1);
  const reopened = await join(
    room,
    "Host",
    "classic",
    "ignored",
    first.welcome!.reconnectToken,
  );
  assert.equal(reopened.welcome!.you.id, first.welcome!.you.id);
  assert.equal(first.socket.code, 4011);
});
test("a kicked reconnect credential remains revoked", async () => {
  const room = newRoom();
  const host = await join(room, "Host", "classic");
  const guest = await join(room, "Guest", "classic");
  host.socket.fire("message", {
    data: JSON.stringify({ type: "kick", playerId: guest.welcome!.you.id }),
  });
  assert.equal(guest.socket.code, 4010);
  const presence = host.socket.sent
    .filter((message) => message.type === "presence")
    .at(-1);
  assert.ok(presence?.type === "presence");
  assert.ok(
    !presence.players.some((player) => player.id === guest.welcome!.you.id),
  );
  const returned = await join(
    room,
    "Guest",
    "classic",
    "ignored",
    guest.welcome!.reconnectToken,
  );
  assert.equal(returned.socket.code, 4010);
  assert.equal(returned.welcome, undefined);
});
test("a reconstructed room restores canvas and credential ownership from durable storage", async () => {
  const storage = testStorage();
  const room = newRoom(storage);
  const host = await join(room, "Host", "classic");
  host.socket.fire("message", {
    data: JSON.stringify({
      type: "draw",
      op: {
        kind: "fill",
        strokeId: "paint",
        color: "#ffffff",
        point: { x: 0, y: 0 },
      },
    }),
  });
  await storage.settle();
  await dispose(room);
  const restored = newRoom(storage);
  const returned = await join(
    restored,
    "Host",
    "classic",
    "ignored",
    host.welcome!.reconnectToken,
  );
  assert.equal(returned.welcome!.you.id, host.welcome!.you.id);
  assert.equal(returned.welcome!.you.isHost, true);
  const canvas = returned.socket.sent.find(
    (message) => message.type === "canvas_sync",
  );
  assert.ok(canvas?.type === "canvas_sync");
  assert.equal(canvas.ops.length, 1);
});
test("malformed socket input cannot crash a room or mutate its canvas", async () => {
  const room = newRoom();
  const joined = await join(room, "Host", "classic");
  for (const data of [
    "{",
    "null",
    '{"type":"draw","op":null}',
    '{"type":"chat","text":4}',
  ])
    joined.socket.fire("message", { data });
  joined.socket.fire("message", {
    data: '{"type":"chat","text":"still here"}',
  });
  assert.ok(
    joined.socket.sent.some(
      (message) => message.type === "chat" && message.text === "still here",
    ),
  );
});

test("a connection closed before its checkpoint completes cannot leave a ghost host", async () => {
  const storage = testStorage();
  const transaction = storage.storage.transaction;
  let release!: () => void;
  let writing!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    writing = resolve;
  });
  storage.storage.transaction = async (callback) => {
    writing();
    await held;
    return transaction(callback);
  };
  const room = newRoom(storage);
  const arriving = join(room, "Gone before hello", "classic");
  await started;
  lastServerSocket!.close();
  release();
  await arriving;
  const next = await join(room, "Actual host", "classic");
  assert.equal(next.welcome!.you.isHost, true);
  const presence = next.socket.sent
    .slice()
    .reverse()
    .find((message) => message.type === "presence");
  assert.ok(presence?.type === "presence");
  assert.equal(presence.players.length, 1);
});

test("concurrent joins cannot overbook the room while credentials are being issued", async () => {
  const room = newRoom();
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      room.fetch(
        upgradeRequest({ room: "race", mode: "classic", name: `Player ${i}` }),
      ),
    ),
  );
  const roster = (
    room as unknown as { roster: { players(): { spectator: boolean }[] } }
  ).roster.players();
  assert.equal(roster.filter((player) => !player.spectator).length, 8);
  assert.equal(roster.filter((player) => player.spectator).length, 12);
});
