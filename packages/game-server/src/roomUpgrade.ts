import { isAvatar } from "@iguess/shared";
import { visiblePlayerName } from "@iguess/shared/roomCode";
import type { Connection, RoomRoster } from "./roomRoster.ts";
import type { ReconnectSessions } from "./reconnectSessions.ts";
import { readConnectionProtocol } from "@iguess/shared/reconnectProtocol";

function roomProtocol(request: Request) {
  return readConnectionProtocol(request.headers.get("Sec-WebSocket-Protocol"));
}
export function upgradeRoomSocket(request: Request, socket: WebSocket) {
  const protocol = roomProtocol(request).selected;
  return new Response(null, {
    status: 101,
    webSocket: socket,
    headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined,
  });
}

export function rejectRoomSocket(
  request: Request,
  code: number,
  reason: string,
) {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return upgradeRoomSocket(request, pair[0]);
}

export function openRoomSocket(url: URL, id: string, token: string) {
  const pair = new WebSocketPair();
  pair[1].accept();
  const avatar = url.searchParams.get("avatar");
  const connection: Connection = {
    ws: pair[1],
    player: {
      id,
      name: visiblePlayerName(url.searchParams.get("name") ?? "") || "Anon",
      avatar: isAvatar(avatar) ? avatar : undefined,
    },
    token,
    rate: { count: 0, windowStart: Date.now() },
  };
  return { pair, connection };
}

export async function claimRoomSeat(
  request: Request,
  url: URL,
  roster: RoomRoster,
  sessions: ReconnectSessions,
  shouldWatch: (id: string) => boolean,
  exists: () => boolean,
) {
  const token = roomProtocol(request).token;
  const session = await sessions.resolve(token);
  if (session?.revoked)
    return rejectRoomSocket(request, 4010, "Removed by host.");
  const existingId = session?.id ?? "";
  const returning = roster.has(existingId);
  const full = () =>
    rejectRoomSocket(request, 4009, "This room is full. Try another room.");
  if (!roster.canJoin(existingId, shouldWatch(existingId))) return full();
  const issued =
    session && token
      ? { record: session, token }
      : await sessions.create(
          new Set(roster.players().map((member) => member.id)),
        );
  if (url.searchParams.get("create") === "1" && !session && exists())
    return rejectRoomSocket(
      request,
      4013,
      "That code already belongs to a room.",
    );
  const { id } = issued.record;
  const watching = shouldWatch(id);
  if (!roster.canJoin(id, watching)) return full();
  if (session) sessions.renew(session);
  const mayChoose =
    roster.empty || (returning && roster.players().length === 1);
  const socket = openRoomSocket(url, id, issued.token);
  roster.attach(socket.connection, watching);
  return { ...socket, id, returning, mayChoose };
}
