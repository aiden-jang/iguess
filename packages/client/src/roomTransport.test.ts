import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { roomTransport } from "./roomTransport";

function harness(t: TestContext) {
  const timers: (() => void)[] = [];
  const jobs: (() => void)[] = [];
  const connections: boolean[] = [];
  let rejectOpen = false;
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    static all: Socket[] = [];
    readyState = 1;
    bufferedAmount = 0;
    onopen?: () => void;
    onclose?: (event: { code: number }) => void;
    onmessage?: (event: { data: string }) => void;
    send = () => {};
    close = () => {};
    constructor() {
      if (rejectOpen) throw new Error("Connection refused");
      Socket.all.push(this);
    }
  }
  const globals = {
    WebSocket: Socket,
    location: { protocol: "http:", host: "localhost" },
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    window: new EventTarget(),
    queueMicrotask: (job: () => void) => jobs.push(job),
    setTimeout: (job: () => void) => timers.push(job),
    clearTimeout: () => {},
  };
  const restore: (() => void)[] = [];
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    restore.push(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const transport = roomTransport({
    room: "transport-test",
    name: "Artist",
    mode: "classic",
    avatar: "cat",
    connected: (value) => connections.push(value),
    fatal: () => {},
    message: () => {},
  });
  t.after(() => {
    transport.dispose();
    restore.forEach((reset) => reset());
  });
  return {
    transport,
    Socket,
    connections,
    jobs,
    timers,
    reject: () => {
      rejectOpen = true;
    },
    allow: () => {
      rejectOpen = false;
    },
  };
}

test("a disposed transport cannot report that it sent a message", (t) => {
  const h = harness(t);
  h.jobs.shift()!();
  h.transport.dispose();
  assert.equal(
    h.transport.send({ type: "chat", text: "Keep this draft" }),
    false,
  );
});

test("a send failure returns false so the composer preserves its draft", (t) => {
  const h = harness(t);
  h.jobs.shift()!();
  h.Socket.all[0]!.send = () => {
    throw new Error("Socket closed during send");
  };
  assert.equal(
    h.transport.send({ type: "chat", text: "Keep this draft" }),
    false,
  );
  assert.equal(h.connections.at(-1), false);
});

test("a refused socket constructor enters the reconnect loop", (t) => {
  const h = harness(t);
  h.reject();
  assert.doesNotThrow(() => h.jobs.shift()!());
  assert.equal(h.connections.at(-1), false);
  assert.equal(h.timers.length, 1);
  h.allow();
  h.timers.shift()!();
  assert.equal(h.Socket.all.length, 1);
});
