import { isAvatar } from "@iguess/shared";
import type { Connection } from "./roomRoster.ts";
import { readConnectionProtocol } from "@iguess/shared/reconnectProtocol";

function roomProtocol(request: Request) {
  return readConnectionProtocol(request.headers.get("Sec-WebSocket-Protocol"));
}
export function roomReconnectToken(request: Request) {
  return roomProtocol(request).token;
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
      name: (url.searchParams.get("name")?.trim() || "Anon").slice(0, 24),
      avatar: isAvatar(avatar) ? avatar : undefined,
    },
    token,
    rate: { count: 0, windowStart: Date.now() },
  };
  return { pair, connection };
}
