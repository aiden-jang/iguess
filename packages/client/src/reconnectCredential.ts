import { isReconnectToken } from "@iguess/shared/reconnectProtocol";
const live = new Map<string, string>();
const key = (room: string) => `iguess_reconnect_${room}`;
export function reconnectCredential(room: string) {
  if (live.has(room)) return live.get(room)!;
  try {
    const token = sessionStorage.getItem(key(room));
    return isReconnectToken(token) ? token : "";
  } catch {
    return "";
  }
}
export function saveReconnectCredential(room: string, token: string) {
  if (!isReconnectToken(token)) return;
  live.set(room, token);
  try {
    sessionStorage.setItem(key(room), token);
  } catch {
    /* The live socket can still reconnect when storage is blocked. */
  }
}
