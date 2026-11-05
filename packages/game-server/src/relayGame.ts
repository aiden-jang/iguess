import {
  hasRelayInk,
  RELAY_DRAW_MS,
  RELAY_GUESS_MS,
  RELAY_INK_BYTES,
  RELAY_MAX_PLAYERS,
  RELAY_MIN_PLAYERS,
  RELAY_PICK_MS,
  type RelayClientMessage,
  type RelayEntry,
  type RelayPlayer,
  type RelayState,
} from "@iguess/shared/relay";
import {
  pickWords,
  relayAssignment,
  relayChainFor,
  relayClue,
  relayPassed,
  type RelayRound,
  type RelaySnapshot,
} from "./relayAssignments.ts";
import { GameClock } from "./gameClock.ts";
import { RoomCanvas } from "./roomCanvas.ts";

type Change =
  { kind: "step" } | { kind: "passed"; player: string } | { kind: "ink" };

export class RelayGame {
  private game: RelayRound | null = null;
  private canvases = new Map<string, RoomCanvas>();
  private clock = new GameClock(() => this.advance());

  constructor(private changed: (change: Change) => void) {}

  get phase() {
    if (!this.game) return "lobby";
    if (this.game.leg >= this.game.seats.length) return "ended";
    return this.game.leg < 0 ? "choosing" : "playing";
  }

  hasParticipant(id: string) {
    return (
      this.game?.seats.some((seat) => seat.id === id && !seat.retired) ?? false
    );
  }

  snapshot(): RelaySnapshot | undefined {
    if (!this.game) return;
    return {
      ...this.game,
      savedAt: Date.now(),
      canvases: [...this.canvases].map(([id, board]) => [id, board.snapshot()]),
    };
  }

  restore({ savedAt, canvases, ...game }: RelaySnapshot) {
    this.reset();
    this.game = game;
    this.canvases = new Map(
      canvases.map(([id, ops]) => {
        const canvas = new RoomCanvas(RELAY_INK_BYTES);
        canvas.restore(ops);
        return [id, canvas];
      }),
    );
    if (game.endsAt !== null) this.setClock(game.endsAt - savedAt);
  }

  reset() {
    this.clock.clear();
    this.game = null;
    this.canvases.clear();
  }

  start(players: RelayPlayer[]) {
    if (
      !["lobby", "ended"].includes(this.phase) ||
      players.length < RELAY_MIN_PLAYERS ||
      players.length > RELAY_MAX_PLAYERS
    )
      return false;
    this.reset();
    const choices = pickWords(players.length);
    this.game = {
      id: crypto.randomUUID(),
      leg: -1,
      endsAt: null,
      seats: players.map(({ id, name }, index) => ({
        id,
        name,
        words: choices[index]!.slice(0, 3),
        restarts: choices[index]!.slice(3),
        word: null,
        retired: false,
      })),
      chains: players.map(() => []),
    };
    this.setClock(RELAY_PICK_MS);
    this.changed({ kind: "step" });
    return true;
  }

  private setClock(duration: number) {
    const delay = Math.max(100, duration);
    this.game!.endsAt = Date.now() + delay;
    this.clock.after("leg", delay);
  }

  private assignment(id: string) {
    return relayAssignment(
      this.game!,
      id,
      () => this.canvases.get(id)?.snapshot() ?? [],
    );
  }

  view(id: string): RelayState {
    const game = this.game;
    if (!game) return { phase: "lobby" };
    if (game.endsAt === null)
      return {
        phase: "reveal",
        id: game.id,
        players: game.seats.map(({ id, name }) => ({ id, name })),
      };
    return {
      phase: "active",
      id: game.id,
      leg: game.leg,
      endsAt: game.endsAt,
      total: game.seats.length,
      passed: relayPassed(game),
      assignment: this.assignment(id),
    };
  }

  reveal(id: string, leg: number, index: number) {
    const game = this.game;
    const entries = game?.chains[index];
    if (
      !game ||
      game.id !== id ||
      game.endsAt !== null ||
      leg !== game.leg ||
      !entries
    )
      return null;
    return {
      type: "relay_chain" as const,
      id,
      index,
      word: game.seats[index]!.word!,
      entries,
    };
  }

  private drawing(seat: number): RelayEntry {
    const game = this.game!;
    const index = relayChainFor(game, seat);
    const id = game.seats[seat]!.id;
    const ops = this.canvases.get(id)?.snapshot() ?? [];
    this.canvases.delete(id);
    const clue = relayClue(game, index);
    const restart = clue.restart ? { restart: clue.prompt } : {};
    return hasRelayInk(ops)
      ? { kind: "drawing", ops, ...restart }
      : { kind: "skipped", ...restart };
  }

  private complete(seat: number) {
    const game = this.game!;
    if (game.leg === -1) {
      const player = game.seats[seat]!;
      player.word ??= player.words[0]!;
    } else {
      const chain = game.chains[relayChainFor(game, seat)]!;
      if (chain.length === game.leg)
        chain.push(
          game.leg % 2 === 0 ? this.drawing(seat) : { kind: "skipped" },
        );
    }
  }

  private advance() {
    const game = this.game;
    if (!game || game.endsAt === null) return;
    this.clock.clear();
    game.seats.forEach((_, index) => this.complete(index));
    do {
      game.leg++;
      this.canvases.clear();
      if (game.leg === game.seats.length) {
        game.endsAt = null;
        break;
      }
      game.seats.forEach((seat, index) => {
        if (seat.retired || this.assignment(seat.id).kind === "missed")
          this.complete(index);
      });
    } while (relayPassed(game) === game.seats.length);
    if (game.endsAt !== null)
      this.setClock(game.leg % 2 === 0 ? RELAY_DRAW_MS : RELAY_GUESS_MS);
    this.changed({ kind: "step" });
  }

  private settled(id: string) {
    if (relayPassed(this.game!) === this.game!.seats.length) this.advance();
    else this.changed({ kind: "passed", player: id });
  }

  leave(id: string) {
    const game = this.game;
    if (!game || game.endsAt === null) return;
    const seat = game.seats.findIndex(
      (player) => player.id === id && !player.retired,
    );
    if (seat < 0) return;
    game.seats[seat]!.retired = true;
    this.complete(seat);
    this.settled(id);
  }

  action(
    player: string,
    message: Exclude<RelayClientMessage, { action: "chain" }>,
  ) {
    const game = this.game;
    if (
      !game ||
      game.endsAt === null ||
      message.id !== game.id ||
      message.leg !== game.leg
    )
      return;
    if (Date.now() >= game.endsAt) {
      this.advance();
      return;
    }
    const view = this.assignment(player);
    if (message.action === "ink" && view.kind === "draw") {
      const canvas =
        this.canvases.get(player) ?? new RoomCanvas(RELAY_INK_BYTES);
      this.canvases.set(player, canvas);
      if (message.op.kind === "undo") {
        canvas.undo();
        this.changed({ kind: "ink" });
        return "sync";
      }
      if (!canvas.apply(message.op)) return "full";
      this.changed({ kind: "ink" });
      return message.op.kind === "clear" ? "sync" : undefined;
    }
    if (
      view.kind === "choose" &&
      (message.action === "write" ||
        (message.action === "choose" && view.words.includes(message.word)))
    ) {
      game.seats.find((seat) => seat.id === player)!.word = message.word;
    } else if (message.action === "pass") {
      const seat = game.seats.findIndex((person) => person.id === player);
      if (view.kind === "draw" && message.guess === undefined) {
        const drawing = this.drawing(seat);
        if (drawing.kind === "skipped") return "empty";
        game.chains[relayChainFor(game, seat)]!.push(drawing);
      } else if (view.kind === "guess" && message.guess?.trim()) {
        game.chains[relayChainFor(game, seat)]!.push({
          kind: "guess",
          text: message.guess.trim(),
        });
      } else return;
    } else return;
    this.settled(player);
  }
}
