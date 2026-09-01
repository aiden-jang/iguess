// Plain functions on purpose, so the rules can be tested without a Durable Object.

import { MAX_PLAYERS_PER_ROOM } from "./limits.ts";

export interface Seat {
  id: string;
  spectator: boolean;
}

// Seat waiting watchers, oldest first.
//
// This is also the only way out of a stuck room. The host is chosen from players, and watchers
// are only seated when a host starts a game, so a room where everyone playing has left would
// sit there forever with nobody able to start anything.
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

export function pickHost(seats: Seat[], currentHostId: string | null): string | null {
  if (currentHostId && seats.some((s) => s.id === currentHostId && !s.spectator)) return currentHostId;
  return seats.find((s) => !s.spectator)?.id ?? null;
}
