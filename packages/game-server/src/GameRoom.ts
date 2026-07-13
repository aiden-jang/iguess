import type { ClientMessage, ServerMessage, PlayerInfo, DrawOp, GameModeName } from '@iguess/shared';
import { GameEngine } from './engine.ts';
import { ClassicMode } from './modes/ClassicMode.ts';
import { AIGuesserMode } from './modes/AIGuesserMode.ts';
import { AIDrawerMode } from './modes/AIDrawerMode.ts';
import { TeamBattleMode } from './modes/TeamBattleMode.ts';
import type { GameMode, PlayerRef } from './modes/GameMode.ts';
import { requestAIGuess } from './services/aiWorkerClient.ts';
import type { Env } from './env.ts';

// One Durable Object per room — the single authority for that room's game. Because we use
// standard (pinned, non-hibernation) WebSockets, the isolate stays alive while any player is
// connected, so the engine's setTimeout/setInterval timing works unchanged. Redis is gone: the
// roster + stroke history live in this object's memory (evicted only once the room fully empties).

const MSG_LIMIT_PER_SEC = 200; // coarse per-connection flood guard
// A dropped socket has this long to reconnect (same pid) before we announce a leave and remove the
// player from the game. Absorbs network blips so a reconnect is silent and keeps score/turn.
const RECONNECT_GRACE_MS = 8000;

// Map the client-asserted mode query param to a known mode (defaulting to classic). Keeping this
// beside the DO ensures the label sent in `welcome` and the engine built in `makeMode` never diverge.
function normalizeMode(name: string | null): GameModeName {
  if (name === 'ai' || name === 'ai-drawer' || name === 'team-battle') return name;
  return 'classic';
}

interface Conn {
  ws: WebSocket;
  player: PlayerInfo;
  rate: { count: number; windowStart: number };
}

export class GameRoom {
  private conns = new Set<Conn>();
  private engine: GameEngine | null = null;
  private virtualPlayers = new Map<string, PlayerInfo>();
  private strokes: DrawOp[] = [];
  // pid -> pending "leave" timer. A dropped player sits here during the grace window; a reconnect
  // clears it (silent), the timer firing turns into an actual leave.
  private pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();
  private roomId = 'lobby';
  // The room's canonical mode, fixed by the first joiner (who creates the engine). Late joiners
  // are told this in `welcome`, not their own requested mode, so their UI label is correct.
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
    const modeName = url.searchParams.get('mode');
    // Client-asserted stable id so a reconnect keeps identity (score, draw order, drawer role).
    const pid = url.searchParams.get('pid');
    const id = pid ? pid.slice(0, 12) : crypto.randomUUID().slice(0, 8);
    const player: PlayerInfo = { id, name };

    // A reconnect is either an overlap (old socket still open) or a return within the grace window
    // (a pending leave for this pid). Either way it's silent: no "joined" line, and we cancel the
    // pending leave so their game slot is never dropped.
    const isReconnect = !!this.findConn(id) || this.pendingLeaves.has(id);
    const pendingLeave = this.pendingLeaves.get(id);
    if (pendingLeave) {
      clearTimeout(pendingLeave);
      this.pendingLeaves.delete(id);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept(); // standard WebSocket — keeps this DO isolate alive while connected
    const conn: Conn = { ws: server, player, rate: { count: 0, windowStart: Date.now() } };
    this.conns.add(conn);

    const game = this.gameFor(modeName);
    this.send(server, { type: 'welcome', you: player, roomId: this.roomId, mode: this.mode });
    this.send(server, { type: 'canvas_sync', ops: this.strokes });
    game.sendStateTo(player.id); // catch the joiner up (re-delivers word if they're the drawer)
    this.broadcastPresence();
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
      // The game inspects it first: a correct guess is consumed (scored, suppressed) here.
      const consumed = game.handleChat(player.id, text);
      if (!consumed) this.broadcast({ type: 'chat', from: player, text });
    } else if (msg.type === 'draw') {
      if (!game.canDraw(player.id)) return; // authoritative: only the drawer draws
      if (msg.op.kind === 'undo') {
        this.undoLastStroke();
        // Rebuild everyone's canvas from the trimmed log (simplest correct sync for an undo).
        this.broadcast({ type: 'canvas_sync', ops: this.strokes });
        return;
      }
      this.persist(msg.op);
      this.broadcastExcept(conn, { type: 'draw', op: msg.op });
    } else if (msg.type === 'start_game') {
      game.startGame([...this.conns].map((c) => c.player.id));
    } else if (msg.type === 'choose_word') {
      game.handleChooseWord(player.id, msg.word);
    }
  }

  private onClose(conn: Conn): void {
    if (!this.conns.has(conn)) return; // close + error can both fire
    this.conns.delete(conn);
    // Reconnect overlap: another live socket already holds this id → the player didn't leave.
    if (this.findConn(conn.player.id)) return;

    if (this.conns.size === 0) {
      // Room emptied — reset so a future session starts clean (and free memory before eviction).
      // Nothing to preserve for, and the isolate will evict once nobody's connected.
      for (const t of this.pendingLeaves.values()) clearTimeout(t);
      this.pendingLeaves.clear();
      this.engine?.onPlayerLeave(conn.player.id);
      this.engine = null;
      this.strokes = [];
      this.virtualPlayers.clear();
      return;
    }

    // Others are still here: give this player a grace window to reconnect (a blip) before we drop
    // them from the game and announce it. A reconnect within the window cancels this (see fetch).
    const { id, name } = conn.player;
    const existing = this.pendingLeaves.get(id);
    if (existing) clearTimeout(existing);
    this.pendingLeaves.set(
      id,
      setTimeout(() => {
        this.pendingLeaves.delete(id);
        if (this.findConn(id)) return; // reconnected during the grace window
        this.engine?.onPlayerLeave(id);
        this.broadcastPresence();
        this.broadcast({ type: 'system', text: `${name} left` });
      }, RECONNECT_GRACE_MS),
    );
  }

  // --- engine wiring -------------------------------------------------------

  private gameFor(modeName: string | null): GameEngine {
    if (!this.engine) {
      this.mode = normalizeMode(modeName); // latch the room's mode at creation time
      this.engine = new GameEngine(
        {
          broadcast: (msg) => this.broadcast(msg),
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
    const aiGuess = (): Promise<string> => requestAIGuess(this.env.AI_WORKER_URL, this.strokes);
    if (name === 'ai') return new AIGuesserMode(aiGuess);
    if (name === 'ai-drawer') return new AIDrawerMode();
    if (name === 'team-battle') return new TeamBattleMode(aiGuess);
    return new ClassicMode();
  }

  // --- socket helpers ------------------------------------------------------

  private persist(op: DrawOp): void {
    if (op.kind === 'clear') this.strokes = [];
    else this.strokes.push(op);
  }

  // Drop the last stroke's ops (its trailing start...move...end). A single drawer draws
  // sequentially, so the last stroke is the suffix from the final "start".
  private undoLastStroke(): void {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      if (this.strokes[i]!.kind === 'start') {
        this.strokes.length = i;
        return;
      }
    }
    this.strokes = [];
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket is closing — drop it
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const c of this.conns) this.send(c.ws, msg);
  }

  private broadcastExcept(except: Conn, msg: ServerMessage): void {
    for (const c of this.conns) if (c !== except) this.send(c.ws, msg);
  }

  private presenceList(): PlayerInfo[] {
    const humans = new Map<string, PlayerInfo>();
    for (const c of this.conns) humans.set(c.player.id, c.player);
    return [...humans.values(), ...this.virtualPlayers.values()];
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
