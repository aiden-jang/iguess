// Who owns the room, and who is playing versus watching. Kept as pure helpers (mirrors
// limits.ts and roomReset.ts) so the policy is unit-testable without a Durable Object.

import { MAX_PLAYERS_PER_ROOM } from "./limits.ts";

export interface Seat {
  id: string;
  spectator: boolean;
}

/**
 * Move waiting spectators into free seats, oldest first.
 *
 * Also the escape hatch from a dead room: when every player leaves and only spectators are
 * left, nothing would ever promote them — the host is picked from players, and spectators are
 * only seated when a host starts a game. The room would sit there unable to start anything.
 */
export function seatSpectators(seats: Seat[]): Seat[] {
  let playing = seats.filter((s) => !s.spectator).length;
  return seats.map((s) => {
    if (s.spectator && playing < MAX_PLAYERS_PER_ROOM) {
      playing += 1;
      return { ...s, spectator: false };
    }
    return s;
  });
}

/** The host: longest-present player. Null only when the room is empty. */
export function pickHost(seats: Seat[], currentHostId: string | null): string | null {
  if (currentHostId && seats.some((s) => s.id === currentHostId && !s.spectator)) return currentHostId;
  return seats.find((s) => !s.spectator)?.id ?? null;
}
