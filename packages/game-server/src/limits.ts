// Plain functions on purpose, so the rules can be tested without a Durable Object or a socket.

// Every stroke is sent to every connection, so this number also caps how much work the room
// does per stroke.
export const MAX_PLAYERS_PER_ROOM = 8;

// Watchers are capped for the same reason: they still receive every stroke.
export const MAX_SPECTATORS_PER_ROOM = 12;

// Sent only when a room is full of players AND watchers. Codes in the 4000s are ours to define.
// The client must stop reconnecting on this one, or it hammers a room that cannot let it in.
export const CLOSE_ROOM_FULL = 4009;

// Also final: reconnecting after a kick just walks straight back in.
export const CLOSE_KICKED = 4010;

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
