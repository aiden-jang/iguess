import type { PlayerInfo } from "@iguess/shared";
import { MAX_PLAYERS_PER_ROOM, MAX_SPECTATORS_PER_ROOM } from "./limits.ts";
import { pickHost, seatSpectators } from "./hosting.ts";
export interface Connection {
  ws: WebSocket;
  player: PlayerInfo;
  token: string;
  rate: { count: number; windowStart: number };
}
export interface Member {
  player: PlayerInfo;
  spectator: boolean;
  ready: boolean;
}
export interface RosterSnapshot {
  members: Member[];
  hostId: string | null;
}
export class RoomRoster {
  readonly connections = new Map<string, Connection>();
  private members = new Map<string, Member>();
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private hostId: string | null = null;
  constructor(
    private onLeave: (member: Member, removed?: boolean) => void,
    private graceMs = 8_000,
  ) {}
  restore(snapshot: RosterSnapshot) {
    this.hostId = snapshot.hostId;
    this.members = new Map(
      snapshot.members.map((member) => [member.player.id, member]),
    );
    for (const id of this.members.keys()) this.reserve(id);
  }
  snapshot(): RosterSnapshot {
    return { members: [...this.members.values()], hostId: this.hostId };
  }
  has(id: string) {
    return this.members.has(id);
  }
  canJoin(id: string, watching = false) {
    return (
      this.has(id) ||
      (watching ||
      this.players().filter((player) => !player.spectator).length >=
        MAX_PLAYERS_PER_ROOM
        ? this.players().filter((player) => player.spectator).length <
          MAX_SPECTATORS_PER_ROOM
        : true)
    );
  }
  attach(connection: Connection, watching: boolean) {
    const id = connection.player.id;
    const previous = this.connections.get(id);
    if (previous) previous.ws.close(4011, "Room reopened in another tab.");
    const timer = this.pending.get(id);
    if (timer) clearTimeout(timer);
    this.pending.delete(id);
    const existing = this.members.get(id);
    const playing = [...this.members.values()].filter(
      (member) => !member.spectator,
    ).length;
    this.members.set(id, {
      player: connection.player,
      spectator:
        watching || (existing?.spectator ?? playing >= MAX_PLAYERS_PER_ROOM),
      ready: existing?.ready ?? false,
    });
    this.connections.set(id, connection);
    this.ensureHost();
  }
  detach(connection: Connection, immediate = false, removed = false) {
    const id = connection.player.id;
    if (this.connections.get(id) !== connection) return;
    this.connections.delete(id);
    if (immediate) this.remove(id, removed);
    else this.reserve(id);
  }
  private remove(id: string, removed = false) {
    const timer = this.pending.get(id);
    if (timer) clearTimeout(timer);
    this.pending.delete(id);
    const member = this.members.get(id);
    if (!member) return;
    this.members.delete(id);
    this.ensureHost();
    this.onLeave(member, removed);
  }
  private reserve(id: string) {
    const previous = this.pending.get(id);
    if (previous) clearTimeout(previous);
    this.pending.set(
      id,
      setTimeout(() => {
        this.pending.delete(id);
        if (this.connections.has(id)) return;
        this.remove(id);
      }, this.graceMs),
    );
  }
  isHost(id: string) {
    return this.hostId === id;
  }
  spectator(id: string) {
    return this.members.get(id)?.spectator ?? true;
  }
  ready(id: string, value: boolean) {
    const member = this.members.get(id);
    if (member && !member.spectator) member.ready = value;
  }
  clearReady() {
    for (const member of this.members.values()) member.ready = false;
  }
  seatWatchers() {
    const seats = seatSpectators(
      [...this.members.values()].map((member) => ({
        id: member.player.id,
        spectator: member.spectator,
      })),
    );
    for (const seat of seats)
      this.members.get(seat.id)!.spectator = seat.spectator;
  }
  private ensureHost() {
    if (
      this.members.size &&
      [...this.members.values()].every((member) => member.spectator)
    )
      this.seatWatchers();
    this.hostId = pickHost(
      [...this.members.values()].map((member) => ({
        id: member.player.id,
        spectator: member.spectator,
      })),
      this.hostId,
    );
  }
  players() {
    return [...this.members.values()].map((member) => ({
      ...member.player,
      spectator: member.spectator,
      ready: member.ready,
      isHost: this.isHost(member.player.id),
    }));
  }
  humanIds() {
    return this.players()
      .filter((player) => !player.spectator && this.connections.has(player.id))
      .map((player) => player.id);
  }
  get empty() {
    return this.members.size === 0;
  }
  dispose() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }
}
