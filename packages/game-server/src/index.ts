import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { ClientMessage, ServerMessage, PlayerInfo } from "shared";

const PORT = Number(process.env.PORT ?? 8080);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const redis = new Redis(REDIS_URL);
redis.on("connect", () => console.log("[redis] connected"));
redis.on("error", (e) => console.error("[redis] error", e.message));

// In-memory registry of live sockets, grouped by room. The socket objects
// themselves can't live in Redis (they're process-local), so the server
// keeps connections in memory and uses Redis only for *durable* state that
// must survive a restart or be shared across future server instances.
type Conn = { ws: WebSocket; player: PlayerInfo; roomId: string };
const rooms = new Map<string, Set<Conn>>();

function redisRoomKey(roomId: string) {
  return `room:${roomId}:players`;
}

// Send one typed message to a single socket.
function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// Fan a message out to everyone currently in a room. This is the core
// "authoritative server broadcasts truth" primitive — clients never talk
// to each other directly, only through here.
function broadcast(roomId: string, msg: ServerMessage) {
  const conns = rooms.get(roomId);
  if (!conns) return;
  for (const c of conns) send(c.ws, msg);
}

async function presenceList(roomId: string): Promise<PlayerInfo[]> {
  const hash = await redis.hgetall(redisRoomKey(roomId));
  return Object.entries(hash).map(([id, name]) => ({ id, name }));
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[ws] listening on :${PORT}`);

wss.on("connection", async (ws, req) => {
  // Connection params arrive in the URL query string:
  //   ws://host:8080/?room=abc&name=Alice
  const url = new URL(req.url ?? "", "http://localhost");
  const roomId = (url.searchParams.get("room") || "lobby").slice(0, 32);
  const name = (url.searchParams.get("name") || "Anon").slice(0, 24);
  const player: PlayerInfo = { id: randomUUID().slice(0, 8), name };

  const conn: Conn = { ws, player, roomId };
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId)!.add(conn);
  await redis.hset(redisRoomKey(roomId), player.id, player.name);

  // Tell the new player who they are, then refresh everyone's roster.
  send(ws, { type: "welcome", you: player, roomId });
  broadcast(roomId, { type: "presence", players: await presenceList(roomId) });
  broadcast(roomId, { type: "system", text: `${name} joined` });

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }
    if (msg.type === "chat") {
      const text = msg.text.slice(0, 500).trim();
      if (text) broadcast(roomId, { type: "chat", from: player, text });
    }
  });

  ws.on("close", async () => {
    rooms.get(roomId)?.delete(conn);
    if (rooms.get(roomId)?.size === 0) rooms.delete(roomId);
    await redis.hdel(redisRoomKey(roomId), player.id);
    broadcast(roomId, { type: "presence", players: await presenceList(roomId) });
    broadcast(roomId, { type: "system", text: `${name} left` });
  });
});
