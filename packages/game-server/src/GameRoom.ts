import type { ClientMessage, ServerMessage, PlayerInfo, DrawOp, GameModeName } from '@iguess/shared';
import { WordMemory } from './wordMemory.ts';
import { DEFAULT_SETTINGS, sanitizeSettings, isReaction, isAvatar, type RoomSettings } from '@iguess/shared';
import { lastStrokeId, dropStroke } from '@iguess/shared/strokeLog';
import { GameEngine } from './engine.ts';
import { ClassicMode } from './modes/ClassicMode.ts';
import { AIGuesserMode } from './modes/AIGuesserMode.ts';
import { AIDrawerMode } from './modes/AIDrawerMode.ts';
import { TeamBattleMode } from './modes/TeamBattleMode.ts';
import { DuelMode } from './modes/DuelMode.ts';
import type { GameMode, PlayerRef } from './modes/GameMode.ts';
import { requestAIGuess, type AIGuess } from './services/aiWorkerClient.ts';
import { shouldResetRoom } from './roomReset.ts';
import {
  atCapacity,
  roomIsFull,
  CLOSE_ROOM_FULL,
  CLOSE_KICKED,
  MAX_PLAYERS_PER_ROOM,
  MAX_SPECTATORS_PER_ROOM,
} from './limits.ts';
import { seatSpectators, pickHost } from './hosting.ts';
import type { Env } from './env.ts';

// One of these per room, and it is the only thing allowed to change that room's game.
// Don't switch to hibernating WebSockets: hibernation throws away pending timers, and the
// whole game runs on a turn timer.

const MSG_LIMIT_PER_SEC = 200; // coarse per-connection flood guard
// How long a dropped player has to come back before we treat it as leaving. Covers a brief
// blip so they keep their score and their place in the drawing order.
const RECONNECT_GRACE_MS = 8000;

// Total paid AI calls this room may ever make, so replaying it over and over can't run up a
// bill. Past this it stops asking, and the room is told.
const MAX_AI_CALLS_PER_ROOM = 240;

// The client can send any mode string, so map it to a known one. Keep this next to makeMode
// or the label we announce and the engine we build can drift apart.
function normalizeMode(name: string | null): GameModeName {
  if (name === 'ai' || name === 'ai-drawer' || name === 'team-battle' || name === 'duel') return name;
  return 'classic';
}

const MODE_LABELS: Record<GameModeName, string> = {
  classic: 'Classic',
  ai: 'AI Guesser',
  'ai-drawer': 'AI Drawer',
  'team-battle': 'Team Battle',
  duel: 'You vs AI',
};

interface Conn {
  ws: WebSocket;
  player: PlayerInfo;
  rate: { count: number; windowStart: number };
  spectator: boolean;
}

export class GameRoom {
  private conns = new Set<Conn>();
  private engine: GameEngine | null = null;
  private virtualPlayers = new Map<string, PlayerInfo>();
  private strokes: DrawOp[] = [];
  // People who dropped and might still come back. If the timer fires, they really left.
  private pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();
  private aiCallCount = 0;
  private saidAiIsBlind = false;
  // Survives between games, so a night in one room stops serving the same words over.
  private wordMemory = new WordMemory();
  private settings: RoomSettings = DEFAULT_SETTINGS;
  private hostId: string | null = null;
  private readyIds = new Set<string>();
  private roomId = 'lobby';
  // Set by whoever arrived first. Everyone else is told this, not the mode they asked for.
  private mode: GameModeName = 'classic';

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    const url = new URL(request.url);
    this.roomId = (url.searchParams.get('room') || 'lobby').slice(0, 32);
    const name = (url.searchParams.get('name') || 'Anon').slice(0, 24);
    const rawAvatar = url.searchParams.get('avatar');
    const avatar = isAvatar(rawAvatar) ? rawAvatar : undefined;
    const modeName = url.searchParams.get('mode');
      // The client claims this id, and it is how a reconnect keeps its score and turn.
    const pid = url.searchParams.get('pid');
    const id = pid ? pid.slice(0, 12) : crypto.randomUUID().slice(0, 8);
    const player: PlayerInfo = { id, name, avatar };

    // Either their old socket is still open, or they are inside the grace window. Both are
    // silent: no "joined" message, and their seat is never given away.
    const isReconnect = !!this.findConn(id) || this.pendingLeaves.has(id);

    // A full room takes extra arrivals as watchers rather than slamming the door on them.
    const spectating = atCapacity(this.playerCount(), isReconnect);
    if (roomIsFull(this.playerCount(), this.spectatorCount(), isReconnect)) {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].close(
        CLOSE_ROOM_FULL,
        `this room is full (${MAX_PLAYERS_PER_ROOM} playing, ${MAX_SPECTATORS_PER_ROOM} watching). try another room.`
      );
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const pendingLeave = this.pendingLeaves.get(id);
    if (pendingLeave) {
      clearTimeout(pendingLeave);
      this.pendingLeaves.delete(id);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept(); // standard WebSocket — keeps this DO isolate alive while connected
    const conn: Conn = { ws: server, player, spectator: spectating, rate: { count: 0, windowStart: Date.now() } };
    this.conns.add(conn);

    const modeBefore = this.mode;
    const prevEngine = this.engine;
    const game = this.gameFor(modeName);
    const wasReset = prevEngine !== null && prevEngine !== this.engine; // room restarted fresh
    const switchedMode = wasReset && this.mode !== modeBefore;
    this.send(server, { type: 'welcome', you: player, roomId: this.roomId, mode: this.mode, settings: this.settings });
    this.send(server, { type: 'canvas_sync', ops: this.strokes });
    game.sendStateTo(player.id); // catch the joiner up (re-delivers word if they're the drawer)
    this.ensureHost();
    this.broadcastPresence();
    if (wasReset) {
      // The room just restarted, so everyone already here needs resending to the fresh lobby.
      for (const c of this.conns) {
        if (c === conn) continue;
        this.send(c.ws, { type: 'welcome', you: c.player, roomId: this.roomId, mode: this.mode, settings: this.settings });
        this.send(c.ws, { type: 'draw', op: { kind: 'clear' } });
        game.sendStateTo(c.player.id);
      }
      if (switchedMode) this.broadcast({ type: 'system', text: `mode switched to ${MODE_LABELS[this.mode]}` });
    }
    if (!isReconnect) this.broadcast({ type: 'system', text: `${name} joined` });

    server.addEventListener('message', (event) => {
      if (!this.allow(conn)) return; // drop floods silently
      const raw = typeof event.data === 'string' ? event.data : '';
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw) as ClientMessage;
      } catch {
        return; // ignore malformed frames
      }
      this.handle(conn, msg);
    });

    const teardown = (): void => this.onClose(conn);
    server.addEventListener('close', teardown);
    server.addEventListener('error', teardown);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handle(conn: Conn, msg: ClientMessage): void {
    const game = this.engine;
    if (!game) return;
    const player = conn.player;
    if (msg.type === 'chat') {
      const text = msg.text.slice(0, 500).trim();
      if (!text) return;
      // A watcher's message is only ever chat. Scoring it would put someone who isn't playing
      // on the scoreboard.
      const consumed = conn.spectator ? false : game.handleChat(player.id, text);
      if (!consumed) this.broadcast({ type: 'chat', from: player, text });
    } else if (msg.type === 'draw') {
      if (conn.spectator) return;
      if (!game.canDraw(player.id)) return; // authoritative: only the drawer draws
      if (msg.op.kind === 'undo') {
        const strokeId = this.undoLastStroke();
        if (!strokeId) return; // nothing drawn yet
        // Send the stroke's id, not the canvas. Everyone holds the same list of strokes, so
        // they can drop that one themselves. This used to be the biggest message we ever sent.
        this.broadcast({ type: 'draw', op: { kind: 'undo', strokeId } });
        return;
      }
      this.persist(msg.op);
      this.broadcastExcept(conn, { type: 'draw', op: msg.op });
    } else if (msg.type === 'start_game') {
      if (!this.isHost(player.id)) return;
      this.readyIds.clear(); // the lobby's ready flags mean nothing once a game is running
      this.seatSpectators();
      game.startGame([...this.conns].filter((c) => !c.spectator).map((c) => c.player.id));
    } else if (msg.type === 'choose_word') {
      game.handleChooseWord(player.id, msg.word);
    } else if (msg.type === 'skip_word') {
      game.handleSkipWord(player.id);
    } else if (msg.type === 'react') {
      if (!isReaction(msg.emoji)) return;
      this.broadcast({ type: 'react', emoji: msg.emoji, at: Math.random() });
    } else if (msg.type === 'cursor') {
      if (conn.spectator || !game.canDraw(player.id)) return;
      this.broadcastExcept(conn, { type: 'cursor', playerId: player.id, point: msg.point });
    } else if (msg.type === 'ready') {
      if (msg.ready) this.readyIds.add(player.id);
      else this.readyIds.delete(player.id);
      this.broadcastPresence();
    } else if (msg.type === 'kick') {
      if (!this.isHost(player.id) || msg.playerId === player.id) return;
      const target = this.findConn(msg.playerId);
      if (!target) return;
      this.broadcast({ type: 'system', text: `${target.player.name} was removed by the host` });
      target.ws.close(CLOSE_KICKED, 'removed by host');
    } else if (msg.type === 'set_settings') {
      // Lobby only. Changing the clock mid-game moves a deadline people can already see.
      if (!this.isHost(player.id)) return;
      if (game.currentPhase !== 'lobby' && game.currentPhase !== 'ended') return;
      this.settings = sanitizeSettings({ ...this.settings, ...msg.settings });
      game.applySettings(this.settings);
      this.broadcast({ type: 'settings', settings: this.settings });
    }
  }

  private onClose(conn: Conn): void {
    if (!this.conns.has(conn)) return; // close + error can both fire
    this.conns.delete(conn);
    // Another socket already has this id, so they didn't really leave.
    if (this.findConn(conn.player.id)) return;

    // Wait before really removing anyone, including a lone player. Without this, one blip in a
    // solo game tore the whole thing down and dumped them back in the lobby.
    const { id, name } = conn.player;
    const existing = this.pendingLeaves.get(id);
    if (existing) clearTimeout(existing);
    this.pendingLeaves.set(
      id,
      setTimeout(() => {
        this.pendingLeaves.delete(id);
        if (this.findConn(id)) return; // reconnected during the grace window
        this.engine?.onPlayerLeave(id);
        this.ensureHost();
        this.broadcastPresence();
        this.broadcast({ type: 'system', text: `${name} left` });
        if (this.conns.size === 0 && this.pendingLeaves.size === 0) {
          this.engine = null;
          this.strokes = [];
          this.virtualPlayers.clear();
        }
      }, RECONNECT_GRACE_MS),
    );
  }

  private gameFor(modeName: string | null): GameEngine {
    const requested = normalizeMode(modeName);
    // Joining a room that is sitting idle gives you a clean lobby, so you don't land on the
    // last game's results screen. Joining a game already running leaves it alone: you join it.
    if (this.engine && shouldResetRoom(this.engine.currentPhase, requested, this.mode)) {
      this.engine = null;
      this.virtualPlayers.clear();
      this.strokes = [];
    }
    if (!this.engine) {
      this.mode = requested; // latch the room's mode (at creation, or on a lobby re-pick)
      this.engine = new GameEngine(
        {
          broadcast: (msg) => this.broadcast(msg),
          canvasOpCount: () => this.strokes.length,
          sendToPlayer: (playerId, msg) => {
            for (const c of this.conns) if (c.player.id === playerId) this.send(c.ws, msg);
          },
          clearCanvas: () => {
            this.strokes = [];
            this.broadcast({ type: 'draw', op: { kind: 'clear' } });
          },
          drawOp: (op) => {
            this.persist(op);
            this.broadcast({ type: 'draw', op });
          },
          getName: (playerId) =>
            this.findConn(playerId)?.player.name ?? this.virtualPlayers.get(playerId)?.name ?? 'Someone',
          addVirtualPlayer: (p: PlayerRef) => {
            this.virtualPlayers.set(p.id, { id: p.id, name: p.name });
            this.broadcastPresence();
          },
          removeVirtualPlayer: (id: string) => {
            this.virtualPlayers.delete(id);
            this.broadcastPresence();
          },
        },
        this.makeMode(this.mode),
      );
    }
    return this.engine;
  }

  private makeMode(name: GameModeName): GameMode {
    const mode = this.buildMode(name);
    mode.useWordMemory?.(this.wordMemory);
    return mode;
  }

  private buildMode(name: GameModeName): GameMode {
    const aiGuess = async (): Promise<AIGuess> => {
      // An empty guess reads as "the AI had nothing to say", so resolving here would leave the
      // loop waiting on a budget that never comes back, with nobody told.
      if (this.aiCallCount >= MAX_AI_CALLS_PER_ROOM) {
        throw new Error('room AI budget spent');
      }
      this.aiCallCount += 1;
      const said = await requestAIGuess(
        this.env.AI_WORKER_URL,
        this.env.AI_SHARED_SECRET,
        this.strokes,
        this.engine?.currentHint(),
      );
      this.discloseBlindAI(said.provider);
      return said;
    };
    if (name === 'ai') return new AIGuesserMode(aiGuess);
    if (name === 'ai-drawer') return new AIDrawerMode();
    if (name === 'team-battle') return new TeamBattleMode(aiGuess);
    if (name === 'duel') return new DuelMode(aiGuess);
    return new ClassicMode();
  }

  // The mock provider never throws and matches the hint's length, so losing vision reads as a
  // stupid AI rather than a broken one. Say it once; there is no recovering inside a room.
  private discloseBlindAI(provider: string | undefined): void {
    if (provider !== 'mock' || this.saidAiIsBlind) return;
    this.saidAiIsBlind = true;
    this.broadcast({
      type: 'system',
      text: "🤖 the AI can't actually see the canvas right now, so it's just naming things.",
    });
  }

  private persist(op: DrawOp): void {
    if (op.kind === 'clear') this.strokes = [];
    else this.strokes.push(op);
  }

  // Returns the id of what it removed, or null if there was nothing to remove.
  private undoLastStroke(): string | null {
    const id = lastStrokeId(this.strokes);
    if (!id) { this.strokes = []; return null; }
    this.strokes = dropStroke(this.strokes, id);
    return id;
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // The socket is already closing. Nothing to do, and nothing worth logging.
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const c of this.conns) this.send(c.ws, msg);
  }

  private broadcastExcept(except: Conn, msg: ServerMessage): void {
    for (const c of this.conns) if (c !== except) this.send(c.ws, msg);
  }

  private playerCount(): number {
    return [...this.conns].filter((c) => !c.spectator).length;
  }

  private spectatorCount(): number {
    return [...this.conns].filter((c) => c.spectator).length;
  }

  private seatSpectators(): void {
    const seated = seatSpectators([...this.conns].map((c) => ({ id: c.player.id, spectator: c.spectator })));
    const byId = new Map(seated.map((s) => [s.id, s.spectator]));
    for (const c of this.conns) c.spectator = byId.get(c.player.id) ?? c.spectator;
  }

  private presenceList(): PlayerInfo[] {
    const humans = new Map<string, PlayerInfo>();
    for (const c of this.conns)
      humans.set(c.player.id, {
        ...c.player,
        isHost: c.player.id === this.hostId,
        ready: this.readyIds.has(c.player.id),
        spectator: c.spectator,
      });
    return [...humans.values(), ...this.virtualPlayers.values()];
  }

  private ensureHost(): void {
    const seats = () => [...this.conns].map((c) => ({ id: c.player.id, spectator: c.spectator }));
    // Everyone playing has left but people are still watching. Seat them, or nobody can ever
    // start a game in this room again.
    if (this.conns.size > 0 && this.playerCount() === 0) this.seatSpectators();
    this.hostId = pickHost(seats(), this.hostId);
  }

  private isHost(playerId: string): boolean {
    return this.hostId === playerId;
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', players: this.presenceList() });
  }

  private findConn(playerId: string): Conn | undefined {
    return [...this.conns].find((c) => c.player.id === playerId);
  }

  private allow(conn: Conn): boolean {
    const now = Date.now();
    if (now - conn.rate.windowStart >= 1000) {
      conn.rate.windowStart = now;
      conn.rate.count = 0;
    }
    conn.rate.count += 1;
    return conn.rate.count <= MSG_LIMIT_PER_SEC;
  }
}
