import type { ClientMessage, ServerMessage } from "@iguess/shared";
import { RELAY_MIN_PLAYERS } from "@iguess/shared/relay";
import { RelayGame } from "./relayGame.ts";
import { removePlayer } from "./roomActions.ts";
import type { Connection, RoomRoster } from "./roomRoster.ts";

interface RelayRoomIO {
  roster: RoomRoster;
  send: (target: Connection, message: ServerMessage) => void;
  broadcast: (message: ServerMessage) => void;
  dirty: (delay?: number) => void;
  flush: () => Promise<void>;
  wait: (task: Promise<void>) => void;
  presence: () => void;
  revoke: (id: string) => void;
  started: (count: number) => void;
  finished: (count: number) => void;
}

export class RelayRoom {
  readonly game = new RelayGame((change) => {
    if (change.kind === "ink") {
      this.io.dirty(1200);
      return;
    }
    const revision = this.game.view("");
    this.io.dirty();
    const publish = () => {
      const state = this.game.view("");
      if (
        state.phase === "lobby" ||
        revision.phase === "lobby" ||
        revision.id !== state.id ||
        state.phase !== revision.phase ||
        (state.phase === "active" &&
          revision.phase === "active" &&
          state.leg !== revision.leg)
      )
        return;
      if (change.kind === "step") {
        for (const connection of this.io.roster.connections.values())
          this.sync(connection);
        if (state.phase === "reveal") this.io.finished(state.players.length);
      } else if (state.phase === "active") {
        const connection = this.io.roster.connections.get(change.player);
        if (connection) this.sync(connection);
        this.io.broadcast({
          type: "relay_progress",
          id: state.id,
          leg: state.leg,
          passed: state.passed,
        });
      }
    };
    this.io.wait(
      this.io
        .flush()
        .catch(() => this.io.flush())
        .catch(() => {
          this.io.broadcast({
            type: "relay_notice",
            text: "Room recovery is delayed. Stay connected while the room saves.",
          });
        })
        .then(publish),
    );
  });

  constructor(private io: RelayRoomIO) {}

  sync(connection: Connection) {
    const state = this.game.view(connection.player.id);
    this.io.send(connection, {
      type: "relay_state",
      state:
        state.phase === "active" ? { ...state, serverNow: Date.now() } : state,
    });
  }

  handle(connection: Connection, message: ClientMessage) {
    const { roster } = this.io;
    const id = connection.player.id;
    switch (message.type) {
      case "start_game": {
        if (
          !roster.isHost(id) ||
          !["lobby", "ended"].includes(this.game.phase) ||
          roster.connections.size < RELAY_MIN_PLAYERS
        )
          return;
        roster.seatWatchers(true);
        const players = roster
          .players()
          .filter(
            (player) => !player.spectator && roster.connections.has(player.id),
          );
        if (this.game.start(players)) {
          roster.clearReady();
          this.io.started(players.length);
        }
        this.io.presence();
        break;
      }
      case "ready":
        if (["lobby", "ended"].includes(this.game.phase)) {
          roster.ready(id, message.ready);
          this.io.presence();
        }
        break;
      case "kick":
        removePlayer(roster, this.io.revoke, id, message.playerId);
        break;
      case "relay": {
        if (message.action === "chain") {
          const chain = this.game.reveal(
            message.id,
            message.leg,
            message.index,
          );
          if (chain) this.io.send(connection, chain);
          return;
        }
        const result = this.game.action(id, message);
        if (result === "sync" || result === "full" || result === "empty")
          this.sync(connection);
        if (result === "full" || result === "empty")
          this.io.send(connection, {
            type: "relay_notice",
            text:
              result === "full"
                ? "This drawing is full. Undo a stroke or pass it on."
                : "Add some ink before passing your drawing.",
          });
        break;
      }
    }
  }
}
