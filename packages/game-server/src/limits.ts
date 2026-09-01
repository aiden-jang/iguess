// Server-enforced room/rate limits. Kept as small pure helpers (mirrors roomReset.ts) so the
// policy is unit-testable without standing up a Durable Object or a live socket.

// Max simultaneous players (live connections) in one room. Skribbl-style rooms cap around a dozen;
// 8 keeps a room social while bounding the per-draw-op broadcast fan-out (every stroke is sent to
// every connection, so this caps the DO's outbound work per op).
export const MAX_PLAYERS_PER_ROOM = 8;

// WebSocket close code sent to a joiner turned away from a full room. App codes live in 4000-4999;
// the client special-cases this one to STOP its auto-reconnect (a full room won't un-fill by
// retrying) and show a "room is full" notice instead of reconnect-storming.
export const CLOSE_ROOM_FULL = 4009;

// Removed by the host. Terminal like CLOSE_ROOM_FULL: reconnecting would just walk back in.
export const CLOSE_KICKED = 4010;

// New WS connections allowed per client IP per minute, enforced at the Worker edge before the room
// DO is ever created — so one IP can't spin up unbounded rooms/objects. Generous enough for legit
// reconnects (the client backs off up to 5s → well under this) and mode/room switching.
export const MAX_CONNECTS_PER_IP_PER_MIN = 30;

// Should this join be refused because the room is already full? A reconnect (an existing/pending
// slot returning) is never refused — it replaces a slot rather than taking a new one.
export function atCapacity(currentPlayers: number, isReconnect: boolean): boolean {
  if (isReconnect) return false;
  return currentPlayers >= MAX_PLAYERS_PER_ROOM;
}
