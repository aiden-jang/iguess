import {
  DEFAULT_SETTINGS,
  type ServerMessage,
  type PlayerInfo,
  type RoomSettings,
  type GameModeName,
} from "@iguess/shared";
import { parseClientMessage } from "@iguess/shared/protocol";
import { CLOSE_LEFT_ROOM } from "@iguess/shared/reconnectProtocol";
import { GameEngine } from "./engine.ts";
import type { Env } from "./env.ts";
import { WordMemory } from "./wordMemory.ts";
import { RoomVision } from "./roomVision.ts";
import { shouldResetRoom } from "./roomReset.ts";
import { writeEvent } from "./events.ts";
import { allowMessage } from "./floodGuard.ts";
import { RoomRoster, type Connection } from "./roomRoster.ts";
import { RoomCanvas } from "./roomCanvas.ts";
import { ReconnectSessions } from "./reconnectSessions.ts";
import { RoomPersistence } from "./roomPersistence.ts";
import { RoomGallery } from "./roomGallery.ts";
import type { RoomSnapshot } from "./roomSnapshot.ts";
import { createMode, normalizeMode, settingsForMode } from "./roomModes.ts";
import { handleRoomAction } from "./roomActions.ts";
import { RelayRoom } from "./relayRoom.ts";
import { claimRoomSeat, upgradeRoomSocket } from "./roomUpgrade.ts";
export class GameRoom {
  private engine: GameEngine | null = null;
  private recovered: RoomSnapshot["engine"] = null;
  private virtualPlayers = new Map<string, PlayerInfo>();
  private canvas = new RoomCanvas();
  private sessions = new ReconnectSessions();
  private roster: RoomRoster = new RoomRoster(
    (member, removed) => {
      this.engine?.onPlayerLeave(member.player.id);
      this.relay.game.leave(member.player.id);
      this.broadcast({
        type: "system",
        text: `${member.player.name} ${removed ? "was removed by the host" : "left"}`,
      });
      if (this.roster.empty && this.phase !== "ended") this.resetEngine();
      this.presence();
      this.persistence.changed();
    },
    undefined,
    (id) => this.relay.game.reconnectDeadline(id),
  );
  private relay = new RelayRoom({
    roster: this.roster,
    send: (target, message) => this.send(target, message),
    broadcast: (message) => this.broadcast(message),
    dirty: (delay) => this.persistence.changed(delay),
    flush: () => this.persistence.flush(),
    wait: (task) => this.ctx.waitUntil(task),
    presence: () => this.presence(),
    revoke: (id) => this.sessions.revoke(id),
    started: (count) =>
      writeEvent(this.env, "game_started", "relay", "", count),
    finished: (count) => writeEvent(this.env, "game_ended", "relay", "", count),
  });
  private vision = new RoomVision({
    env: () => this.env,
    engine: () => this.engine,
    drawing: () => this.canvas.snapshot(),
    drawingRevision: () => this.canvas.revision,
    checkpoint: () => {
      this.persistence.changed();
      return this.persistence.flush();
    },
    usedMock: () => {
      writeEvent(this.env, "ai_blind", this.mode);
      this.broadcast({
        type: "system",
        text: "The AI can’t see the canvas right now, so it’s just naming things.",
      });
    },
  });
  private reportedEnd = false;
  private wordMemory = new WordMemory();
  private settings: RoomSettings = DEFAULT_SETTINGS;
  private roomId = "lobby";
  private mode: GameModeName = "classic";
  private gallery: RoomGallery;
  private persistence: RoomPersistence<RoomSnapshot>;
  private readonly ready: Promise<void>;
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.gallery = new RoomGallery(ctx.storage);
    this.persistence = new RoomPersistence(
      ctx,
      () => this.snapshot(),
      () => this.gallery.stage(),
    );
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await this.persistence.store.load();
      if (saved?.version !== 1) return;
      this.roomId = saved.roomId;
      this.mode = saved.mode;
      this.settings = settingsForMode(saved.settings, saved.mode);
      this.sessions = new ReconnectSessions(saved.sessions);
      this.canvas.restore(saved.strokes, saved.strokeOwners);
      this.recovered = saved.engine;
      this.gallery.restore(saved.gallery);
      if (saved.relay && saved.mode === "relay")
        this.relay.game.restore(saved.relay);
      this.roster.restore(saved.roster);
      this.vision.count = saved.aiCallCount;
      this.vision.saidMock = saved.saidAiIsBlind;
      this.reportedEnd = saved.reportedEnd;
      this.wordMemory.restore(saved.recentWords);
    });
  }
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    const url = new URL(request.url);
    this.roomId = (url.searchParams.get("room") || "lobby").slice(0, 32);
    const seat = await claimRoomSeat(
      request,
      url,
      this.roster,
      this.sessions,
      (id) => this.shouldWatch(id),
      () => !this.roster.empty || this.phase !== "lobby",
    );
    if (seat instanceof Response) return seat;
    const { pair, connection, id, returning, mayChoose } = seat;
    let welcomed = false;
    const close = (event?: CloseEvent) => {
      const left = event?.code === CLOSE_LEFT_ROOM;
      this.roster.detach(connection, !welcomed || left);
      if (welcomed) this.presence();
      this.persistence.changed();
    };
    pair[1].addEventListener("close", close);
    pair[1].addEventListener("error", () => close());
    this.gameFor(mayChoose ? url.searchParams.get("mode") : null);
    this.persistence.changed();
    try {
      await this.persistence.flush();
    } catch {
      pair[1].close(1011, "Room storage is temporarily unavailable.");
    }
    if (pair[1].readyState !== 1) {
      close();
      return upgradeRoomSocket(request, pair[0]);
    }
    welcomed = true;
    this.welcome(connection);
    this.syncPlayer(connection);
    this.presence();
    if (!returning)
      this.broadcast({
        type: "system",
        text: `${connection.player.name} joined`,
      });
    pair[1].addEventListener("message", (event) => {
      if (
        this.roster.connections.get(id) !== connection ||
        !allowMessage(connection.rate)
      )
        return;
      const message = parseClientMessage(event.data);
      if (!message) return;
      if (this.mode === "relay") return this.relay.handle(connection, message);
      if (!this.engine || message.type === "relay") return;
      handleRoomAction(
        {
          game: this.engine,
          roster: this.roster,
          canvas: this.canvas,
          settings: this.settings,
          send: (target, value) => this.send(target, value),
          broadcast: (value, except) => this.broadcast(value, except),
          updateSettings: (settings) => {
            this.settings = settingsForMode(settings, this.mode);
            this.engine!.applySettings(this.settings);
            this.broadcast({ type: "settings", settings: this.settings });
          },
          revoke: (playerId) => this.sessions.revoke(playerId),
          presence: () => this.presence(),
          started: () => {
            this.gallery.start();
            this.reportedEnd = false;
            writeEvent(
              this.env,
              "game_started",
              this.mode,
              this.settings.aiSkill,
              this.roster.humanIds().length,
            );
            this.presence();
          },
        },
        connection,
        message,
      );
      if (message.type !== "cursor" && message.type !== "react")
        this.persistence.changed();
    });
    return upgradeRoomSocket(request, pair[0]);
  }
  private shouldWatch(id: string) {
    const active = !["lobby", "ended"].includes(this.phase);
    const participant =
      this.mode === "relay"
        ? this.relay.game.hasParticipant(id)
        : (this.engine?.hasParticipant(id) ??
          this.recovered?.roster.some((member) => member.id === id));
    return Boolean(active && !participant);
  }
  private get phase() {
    return this.mode === "relay"
      ? this.relay.game.phase
      : (this.engine?.currentPhase ?? this.recovered?.phase ?? "lobby");
  }
  private syncPlayer(connection: Connection) {
    if (this.mode === "relay") return this.relay.sync(connection);
    this.send(connection, { type: "canvas_sync", ops: this.canvas.snapshot() });
    this.engine?.sendStateTo(connection.player.id);
    if (this.phase === "ended")
      this.ctx.waitUntil(
        this.gallery.stream((message) => this.send(connection, message)),
      );
  }
  private resetEngine() {
    this.engine?.dispose();
    this.relay.game.reset();
    this.gallery.restore();
    this.engine = null;
    this.recovered = null;
    this.virtualPlayers.clear();
    this.canvas.apply({ kind: "clear" });
  }
  private gameFor(requested: string | null) {
    const mode = requested ? normalizeMode(requested) : this.mode;
    if (shouldResetRoom(this.phase, mode, this.mode)) {
      this.resetEngine();
      this.mode = mode;
      this.settings = settingsForMode(this.settings, mode);
    }
    if (this.engine) return;
    if (this.mode === "relay") return;
    const strategy = createMode(this.mode, this.vision.guess);
    strategy.useWordMemory?.(this.wordMemory);
    this.engine = new GameEngine(
      {
        broadcast: (message) => this.broadcast(message),
        canvasOpCount: () => this.canvas.snapshot().length,
        recordTurn: (turn, artist, right) =>
          this.gallery.capture(
            turn,
            artist,
            right,
            this.mode,
            this.canvas.snapshot(),
          ),
        sendToPlayer: (id, message) => {
          const target = this.roster.connections.get(id);
          if (target) this.send(target, message);
        },
        clearCanvas: () => {
          this.canvas.apply({ kind: "clear" });
          this.broadcast({ type: "draw", op: { kind: "clear" } });
        },
        drawOp: (op) => {
          if (this.canvas.apply(op)) this.broadcast({ type: "draw", op });
        },
        getName: (id) =>
          this.roster.players().find((player) => player.id === id)?.name ??
          this.virtualPlayers.get(id)?.name ??
          "Someone",
        addVirtualPlayer: (player) => {
          this.virtualPlayers.set(player.id, player);
          this.presence();
        },
        removeVirtualPlayer: (id) => {
          this.virtualPlayers.delete(id);
          this.presence();
        },
      },
      strategy,
    );
    this.engine.applySettings(this.settings);
    if (this.recovered) {
      this.engine.restore(this.recovered);
      this.recovered = null;
      this.broadcast({
        type: "system",
        text: "Room recovered. The clock resumes from the last checkpoint.",
      });
    }
  }
  private welcome(connection: Connection) {
    this.send(connection, {
      type: "welcome",
      you: this.roster
        .players()
        .find((player) => player.id === connection.player.id)!,
      roomId: this.roomId,
      mode: this.mode,
      settings: this.settings,
      reconnectToken: connection.token,
    });
  }
  private presence() {
    this.broadcast({
      type: "presence",
      players: [...this.roster.players(), ...this.virtualPlayers.values()],
    });
  }
  private send(connection: Connection, message: ServerMessage) {
    try {
      connection.ws.send(JSON.stringify(message));
    } catch {
      /* The close event owns removal and reconnect grace. */
    }
  }
  private broadcast(message: ServerMessage, except?: Connection) {
    const finished =
      message.type === "game_state" &&
      message.state.phase === "ended" &&
      !this.reportedEnd;
    if (this.gallery.observe(message)) this.persistence.changed();
    if (finished) {
      this.reportedEnd = true;
      const turns = message.state.turnIndex;
      writeEvent(this.env, "game_ended", this.mode, "", turns);
    }
    for (const connection of this.roster.connections.values())
      if (connection !== except) this.send(connection, message);
    if (finished) {
      const viewers = [...this.roster.connections.values()];
      this.ctx.waitUntil(
        this.gallery.stream((entry) => {
          for (const connection of viewers) this.send(connection, entry);
        }),
      );
    }
    this.persistence.message(message.type);
  }
  private snapshot(): RoomSnapshot {
    return {
      version: 1,
      roomId: this.roomId,
      mode: this.mode,
      settings: this.settings,
      roster: this.roster.snapshot(),
      sessions: this.sessions.snapshot(),
      strokes: this.canvas.snapshot(),
      strokeOwners: this.canvas.ownersSnapshot(),
      engine: this.engine?.snapshot() ?? this.recovered,
      relay: this.relay.game.snapshot(),
      gallery: this.gallery.snapshot(),
      aiCallCount: this.vision.count,
      saidAiIsBlind: this.vision.saidMock,
      reportedEnd: this.reportedEnd,
      recentWords: this.wordMemory.snapshot(),
    };
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.persistence.dispose();
      this.roster.clear();
      this.resetEngine();
      await this.ctx.storage.deleteAll();
      this.mode = "classic";
      this.settings = DEFAULT_SETTINGS;
      this.sessions = new ReconnectSessions();
      this.vision.count = 0;
      this.vision.saidMock = false;
      this.reportedEnd = false;
      this.wordMemory.restore([]);
      this.persistence.reopen();
    });
  }
}
