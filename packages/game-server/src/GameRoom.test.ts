import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerMessage } from '@iguess/shared';
import { GameRoom } from './GameRoom.ts';
import type { Env } from './env.ts';

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

  close(): void {
    this.readyState = 3;
    this.fire('close', {});
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
g['WebSocketPair'] = FakePair;
g['Response'] = FakeResponse;

// The room reads request.url and one header, so a real Request is not needed — and Node refuses
// to set Upgrade on one anyway, since fetch lists it as a forbidden header.
function upgradeRequest(query: Record<string, string>): Request {
  const url = new URL('https://room.test/rooms/r/ws');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return { url: url.toString(), headers: new Map([['Upgrade', 'websocket']]) } as unknown as Request;
}

function newRoom(): GameRoom {
  const env = {} as Env;
  return new GameRoom({} as DurableObjectState, env);
}

interface Joined {
  socket: FakeSocket;
  welcomeMode: string | undefined;
}

async function join(room: GameRoom, name: string, mode: string, pid = name): Promise<Joined> {
  await room.fetch(upgradeRequest({ room: 'r', name, mode, pid }));
  const socket = lastServerSocket!;
  const welcome = socket.sent.find((m) => m.type === 'welcome');
  return { socket, welcomeMode: welcome && 'mode' in welcome ? welcome.mode : undefined };
}

const systemLines = (s: FakeSocket): string[] =>
  s.sent.filter((m) => m.type === 'system').map((m) => ('text' in m ? m.text : ''));

test('the harness seats two players in one room', async () => {
  const room = newRoom();
  const alex = await join(room, 'Alex', 'classic');
  const bo = await join(room, 'Bo', 'classic');
  const presence = [...alex.socket.sent, ...bo.socket.sent]
    .filter((m) => m.type === 'presence')
    .pop();
  assert.ok(presence && 'players' in presence, 'no presence was ever sent');
  assert.deepEqual(
    presence.players.map((p) => p.name),
    ['Alex', 'Bo'],
  );
});

test('a joiner is told the room mode, not the one they asked for', async () => {
  const room = newRoom();
  const alex = await join(room, 'Alex', 'classic');
  const bo = await join(room, 'Bo', 'ai');
  assert.equal(alex.welcomeMode, 'classic');
  assert.equal(bo.welcomeMode, 'classic', "the second joiner re-picked the room's mode");
});

test('a second joiner never announces a mode switch', async () => {
  const room = newRoom();
  const alex = await join(room, 'Alex', 'classic');
  await join(room, 'Bo', 'ai');
  assert.deepEqual(
    systemLines(alex.socket).filter((t) => t.includes('mode switched')),
    [],
  );
});

test('someone alone in the room can still re-pick the mode', async () => {
  const room = newRoom();
  const first = await join(room, 'Alex', 'classic');
  assert.equal(first.welcomeMode, 'classic');
  first.socket.close();
  const again = await join(room, 'Alex', 'ai', 'Alex2');
  assert.equal(again.welcomeMode, 'ai', 'a lone player should be able to change the mode');
});
