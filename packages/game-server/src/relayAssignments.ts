import type { DrawOp } from "@iguess/shared";
import type {
  RelayAssignment,
  RelayEntry,
  RelayPlayer,
} from "@iguess/shared/relay";
import { WORDS_BY_TIER } from "@iguess/shared/words";

type Seat = RelayPlayer & {
  words: string[];
  restarts: string[];
  word: string | null;
  retired: boolean;
};
export interface RelaySnapshot {
  id: string;
  leg: number;
  endsAt: number | null;
  savedAt: number;
  seats: Seat[];
  chains: RelayEntry[][];
  canvases: [string, DrawOp[]][];
}
export type RelayRound = Omit<RelaySnapshot, "savedAt" | "canvases">;

export function pickWords(count: number) {
  const pool = [
    ...new Set([...WORDS_BY_TIER.easy, ...WORDS_BY_TIER.medium]),
  ].filter((word) => word.length <= 64);
  return Array.from({ length: count }, () =>
    Array.from(
      { length: 3 + Math.floor((count - 1) / 2) },
      () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!,
    ),
  );
}

export function relayChainFor({ leg, seats }: RelayRound, seat: number) {
  return (seat - leg + seats.length) % seats.length;
}

export function relayClue(game: RelayRound, index: number) {
  if (game.leg === 0)
    return { prompt: game.seats[index]!.word!, restart: false };
  const previous = game.chains[index]![game.leg - 1];
  return previous?.kind === "guess"
    ? { prompt: previous.text, restart: false }
    : {
        prompt: game.seats[index]!.restarts[game.leg / 2 - 1]!,
        restart: true,
      };
}

export function relayAssignment(
  game: RelayRound,
  id: string,
  ops: () => DrawOp[],
): RelayAssignment {
  const seat = game.seats.findIndex(
    (player) => player.id === id && !player.retired,
  );
  if (seat < 0) return { kind: "watch" };
  const person = game.seats[seat]!;
  if (game.leg === -1)
    return person.word
      ? { kind: "passed" }
      : { kind: "choose", words: person.words };
  const index = relayChainFor(game, seat);
  const chain = game.chains[index]!;
  if (chain.length > game.leg)
    return {
      kind: chain[game.leg]?.kind === "skipped" ? "missed" : "passed",
    };
  if (game.leg % 2 === 0)
    return {
      kind: "draw",
      ...relayClue(game, index),
      ops: ops(),
    };
  const prior = chain[game.leg - 1];
  return prior?.kind === "drawing"
    ? { kind: "guess", ops: prior.ops }
    : { kind: "missed" };
}

export function relayPassed(game: RelayRound) {
  return game.leg === -1
    ? game.seats.filter((player) => player.word !== null).length
    : game.chains.filter((chain) => chain.length > game.leg).length;
}
