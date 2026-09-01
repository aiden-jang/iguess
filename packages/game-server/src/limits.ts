// Server-enforced room/rate limits. Kept as small pure helpers (mirrors roomReset.ts) so the
// policy is unit-testable without standing up a Durable Object or a live socket.

// Max simultaneous players (live connections) in one room. Skribbl-style rooms cap around a dozen;
// 8 keeps a room social while bounding the per-draw-op broadcast fan-out (every stroke is sent to
// every connection, so this caps the DO's outbound work per op).
export const MAX_PLAYERS_PER_ROOM = 8;

// Extra arrivals watch instead of being turned away, but the gallery is capped too: every
// connection receives every draw op, so unbounded spectators is the same fan-out problem the
// player cap exists to avoid.
export const MAX_SPECTATORS_PER_ROOM = 12;

// WebSocket close code sent to a joiner turned away from a room that is full of players AND
// spectators. App codes live in 4000-4999; the client special-cases this one to STOP its
// auto-reconnect (a full room won't un-fill by retrying) and show a notice instead of
// reconnect-storming.
export const CLOSE_ROOM_FULL = 4009;

// Removed by the host. Terminal like CLOSE_ROOM_FULL: reconnecting would just walk back in.
export const CLOSE_KICKED = 4010;

// New WS connections allowed per client IP per minute, enforced at the Worker edge before the room
// DO is ever created — so one IP can't spin up unbounded rooms/objects. Generous enough for legit
// reconnects (the client backs off up to 5s → well under this) and mode/room switching.
export const MAX_CONNECTS_PER_IP_PER_MIN = 30;

// Should this joiner have to watch rather than play? A reconnect (an existing/pending slot
// returning) always gets its seat back — it replaces a slot rather than taking a new one.
export function atCapacity(currentPlayers: number, isReconnect: boolean): boolean {
  if (isReconnect) return false;
  return currentPlayers >= MAX_PLAYERS_PER_ROOM;
}

/** Refuse outright: no seat to play in and no room left in the gallery either. */
export function roomIsFull(currentPlayers: number, currentSpectators: number, isReconnect: boolean): boolean {
  if (isReconnect) return false;
  return currentPlayers >= MAX_PLAYERS_PER_ROOM && currentSpectators >= MAX_SPECTATORS_PER_ROOM;
}
