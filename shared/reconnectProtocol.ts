export const ROOM_PROTOCOL = "iguess";
export const isReconnectToken = (token: unknown): token is string =>
  typeof token === "string" && /^[a-f\d]{64}$/.test(token);
export const connectionProtocols = (token: string) =>
  isReconnectToken(token)
    ? [ROOM_PROTOCOL, `reconnect.${token}`]
    : [ROOM_PROTOCOL];
export function readConnectionProtocol(header: string | null) {
  const protocols = header?.split(",").map((value) => value.trim()) ?? [];
  const token = protocols
    .find((value) => value.startsWith("reconnect."))
    ?.slice(10);
  return {
    selected: protocols.includes(ROOM_PROTOCOL) ? ROOM_PROTOCOL : undefined,
    token: isReconnectToken(token) ? token : null,
  };
}
